"""
Dashboard API router — aligned to the current db.py (Part with
mode_of_operation/ai_model_id/measurement_parameters, AIModel with dict
`defects`, PartDefect) and schemas.py.

Feeder-config fields (corrugated_primary/secondary, plain_primary/secondary,
plc_gate_hopper_opening_factor, part_diameter) and per-session batching
(mode/no_of_batches/batching_mode/batch_delay) have been dropped entirely —
this app is bulk-mode-only going forward, so none of that logic is ported.

Hardware/inference/PLC/camera/websocket/report/label-printing endpoints are
carried over from the previous router largely unchanged, with references to
the removed session.mode / batch_* columns and old Part fields adjusted to
use Part.mode_of_operation and the current schema instead.
"""

from __future__ import annotations
import json
import io
import logging
import os
import base64
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import pytz
import pandas as pd
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.db import Category, CompanySession, Part, PartDefect, get_db
from app.schemas import (
    PartCreate,
    PartDefectIn,
    PartDefectOut,
    PartOut,
    PartUpdate,   
    ImportResult,
)
from app.services.spreadsheet_importer import SpreadsheetCsvImporter, SpreadsheetExcelImporter
from app.services.template_builder import build_template, MODE_SLUGS
from app.pipeline.session_pipeline import PipelineRegistry
from fastapi.responses import StreamingResponse
# from app.routers.websocket_manager import get_websocket_manager
# from app.utils.zpl import ZPLGenerator
# from app.utils.labels import util_print_label
# from app.config.machine import MachineConfigLoader

# config = MachineConfigLoader.get()

logger = logging.getLogger("DASHBOARD")

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

VALID_MODES = {"Counting", "Defect Detection", "Measurement"}


# lazy imports — deferred until endpoint is called, avoids hardware-driver
# crashes at module import time
def get_camera_manager():
    from app.routers.camera.camera import get_camera_manager as _fn
    return _fn()


def get_inference_engine():
    from app.routers.inference.inference import get_inference_engine as _fn
    return _fn()


def start_inference_pipeline(config):
    from app.routers.inference.inference_pipeline import start_inference_pipeline as _fn
    return _fn(config=config)


def get_plc_manager():
    from app.routers.plc.plc import get_plc_manager as _fn
    return _fn()


def get_state():
    from app.routers.inference.inference import get_state as _fn
    return _fn()


def set_state(state):
    from app.routers.inference.inference import set_state as _fn
    return _fn(state)


def _validate_mode(mode_of_operation: Optional[str]) -> Optional[str]:
    if mode_of_operation is None:
        return None
    if mode_of_operation not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode_of_operation: {mode_of_operation}")
    return mode_of_operation


def _resolve_ai_model_id(db, model_name, ai_model_id):
    if ai_model_id is not None:
        model = db.get(AIModel, ai_model_id)
        if not model:
            raise HTTPException(status_code=400, detail=f"ai_model_id {ai_model_id} not found")
        return ai_model_id
    if model_name:
        model = db.query(AIModel).filter(AIModel.model_name.ilike(model_name.strip())).first()  # was ==
        if not model:
            model = AIModel(model_name=model_name.strip(), model_path=f"{model_name.strip()}.pt")
            db.add(model)
            db.flush()
        return model.model_id
    return None
    

def _encode_part_image(image: Optional[UploadFile]) -> Optional[str]:
    if not image or not image.filename:
        return None
    name = image.filename.lower()
    raw = image.file.read()
    if name.endswith((".jpg", ".jpeg")):
        return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
    if name.endswith(".png"):
        return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
    raise HTTPException(status_code=400, detail="Part image must be JPEG or PNG")


def _parse_json_form(value: Optional[str], field: str):
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Invalid JSON in {field}")
    return parsed or None


def _safe_float(value) -> Optional[float]:
    try:
        s = str(value).strip()
        return float(s) if s else None
    except (TypeError, ValueError):
        return None


def _as_bool(value) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "on"}


def _resolve_category(
    db: Session, category_id: Optional[int], category_name: Optional[str]
) -> Category:
    if category_id:
        cat = db.query(Category).filter_by(category_id=category_id).first()
        if not cat:
            raise HTTPException(status_code=400, detail="Invalid category_id")
        return cat
    if category_name:
        cn = category_name.title().strip()
        cat = db.query(Category).filter_by(category_name=cn).first()
        if not cat:
            cat = Category(category_name=cn)
            db.add(cat)
            db.flush()
        return cat
    raise HTTPException(status_code=400, detail="Category is required (id or name)") 


@router.get("/ai-model-names")
def list_ai_model_names(db: Session = Depends(get_db)) -> list[str]:
    rows = db.query(AIModel.model_name).order_by(AIModel.model_name).all()
    return [r[0] for r in rows]


@router.post("/add-part")
async def add_part(
    part_name: str = Form(...),
    part_code: str = Form(...),
    category_id: Optional[int] = Form(None),
    category_name: Optional[str] = Form(None),
    parts_metadata: Optional[str] = Form(None),
    part_weight: Optional[str] = Form(None),
    mode_of_operation: str = Form("Counting"),
    part_co_planarity: str = Form("false"),
    part_parallelity: str = Form("false"),
    part_concentricity: str = Form("false"),
    measurement_parameters: Optional[str] = Form(None),   # JSON string
    defect_parameters: Optional[str] = Form(None),        # JSON string
    image: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    if mode_of_operation not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode_of_operation: {mode_of_operation}")

    if db.query(Part).filter(Part.part_code == part_code.strip()).first():
        raise HTTPException(status_code=409, detail="part_code already exists")

    category = _resolve_category(db, category_id, category_name)
    image_data = _encode_part_image(image)

    part = Part(
        part_code=part_code.strip(),
        part_name=part_name.strip(),
        category_id=category.category_id,
        parts_metadata=parts_metadata,
        image=image_data.encode("utf-8") if image_data else None,
        part_weight=_safe_float(part_weight),
        mode_of_operation=mode_of_operation,
        part_co_planarity=_as_bool(part_co_planarity),
        part_parallelity=_as_bool(part_parallelity),
        part_concentricity=_as_bool(part_concentricity),
        measurement_parameters=_parse_json_form(measurement_parameters, "measurement_parameters"),
        defect_parameters=_parse_json_form(defect_parameters, "defect_parameters"),
    )
    db.add(part)
    db.commit()
    db.refresh(part)

    return {
        "message": "Part added successfully",
        "part_id": part.part_id,
        "part_code": part.part_code,
        "category_id": category.category_id,
        "mode_of_operation": part.mode_of_operation,
    }


@router.post("/bulk-upload-parts", response_model=ImportResult)
async def bulk_upload_parts(
    file: UploadFile = File(...),
    mode_of_operation: str = Form(...),   # REQUIRED — always comes from the UI dropdown
    db: Session = Depends(get_db),
):
    if mode_of_operation not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode_of_operation: {mode_of_operation}")

    filename = (file.filename or "").lower()
    if filename.endswith(".csv"):
        rows, errors = SpreadsheetCsvImporter(file.file).process()
    elif filename.endswith((".xlsx", ".xls")):
        contents = await file.read()
        rows, errors = SpreadsheetExcelImporter(io.BytesIO(contents)).process()
    else:
        raise HTTPException(status_code=400, detail="Only CSV or Excel files are supported")

    # UI dropdown is the single source of truth for mode — overrides anything
    # the importer defaulted to.
    for r in rows:
        r.mode_of_operation = mode_of_operation

    created_parts = linked_parts = 0
    errors = list(errors)

    for r in rows:
        try:
            if db.query(Part).filter(Part.part_code == r.part_code).first():
                errors.append(f"{r.part_code}: duplicate")
                continue

            category = None
            if r.category_name:
                category = (
                    db.query(Category)
                    .filter(Category.category_name.ilike(r.category_name))
                    .first()
                )
                if not category:
                    category = Category(category_name=r.category_name.upper())
                    db.add(category)
                    db.flush()

            db.add(
                Part(
                    part_code=r.part_code,
                    part_name=r.part_name or r.part_code,
                    category_id=category.category_id if category else None,
                    image=r.image.encode("utf-8") if r.image else None,
                    part_weight=r.part_weight,
                    mode_of_operation=r.mode_of_operation,
                    part_co_planarity=bool(r.part_co_planarity),
                    part_parallelity=bool(r.part_parallelity),
                    part_concentricity=bool(r.part_concentricity),
                    measurement_parameters=r.measurement_parameters,
                    defect_parameters=r.defect_parameters,
                )
            )
            created_parts += 1
            if r.defect_parameters:
                linked_parts += 1  # "parts with defect config set"
            db.flush()
        except Exception as e:
            db.rollback()
            errors.append(f"{r.part_code}: {e}")

    db.commit()
    return ImportResult(
        created_parts=created_parts,
        linked_parts=linked_parts,
        errors=errors,
    )


@router.get("/bulk-upload-template")
async def bulk_upload_template(mode: str = Query(...)):
    if mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")

    buf = build_template(mode)
    filename = f"TemplateBulkUpload_{MODE_SLUGS[mode]}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )



def _part_detail_dict(part: Part, db: Session) -> dict:
    return {
        "part_code": part.part_code,
        "part_name": part.part_name,
        "category": part.category.category_name if part.category else "N/A",
        "category_id": part.category_id,
        "parts_metadata": part.parts_metadata,
        "mode_of_operation": part.mode_of_operation,
        "part_weight": part.part_weight,
        "measurement_parameters": part.measurement_parameters,
        "defect_parameters": part.defect_parameters,
        "part_co_planarity": part.part_co_planarity,
        "part_parallelity": part.part_parallelity,
        "part_concentricity": part.part_concentricity,
        "image": part.image.decode("utf-8") if part.image else None,
    }


# ---------------------------------------------------------------------------
# Dashboard stats / recent jobs / report download
# ---------------------------------------------------------------------------
@router.get("/stats")
def get_dashboard_stats(
    time_filter: str = Query("all", enum=["today", "month", "all", "range"]),
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db),
):
    session_query = db.query(CompanySession)

    if time_filter == "today":
        today = datetime.now().date()
        session_query = session_query.filter(func.date(CompanySession.created_at) == today)
    elif time_filter == "month":
        first_day = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        session_query = session_query.filter(CompanySession.created_at >= first_day)
    elif time_filter == "range":
        if start_date and end_date:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
            session_query = session_query.filter(
                CompanySession.created_at >= start, CompanySession.created_at < end
            )

    total_sessions = session_query.count()
    total_counted_parts = (
        session_query.with_entities(func.coalesce(func.sum(CompanySession.part_count), 0)).scalar()
        or 0
    )
    total_parts_configured = db.query(func.count(Part.part_id)).scalar() or 0

    return {
        "total_sessions": total_sessions,
        "total_parts_configured": total_parts_configured,
        "total_counted_parts": total_counted_parts,
    }


@router.get("/recent-jobs")
def get_recent_jobs(
    time_filter: str = Query("all", enum=["today", "month", "all", "range"]),
    start_date: str = None,
    end_date: str = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(CompanySession)

    if time_filter == "today":
        today = datetime.now().date()
        query = query.filter(func.date(CompanySession.created_at) == today)
    elif time_filter == "month":
        first_day = datetime.now().replace(day=1)
        query = query.filter(CompanySession.created_at >= first_day)
    elif time_filter == "range":
        if not start_date or not end_date:
            raise HTTPException(status_code=400, detail="Start and end dates required.")
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(CompanySession.created_at >= start, CompanySession.created_at < end)

    offset = (page - 1) * limit
    sessions = query.order_by(CompanySession.created_at.desc()).offset(offset).limit(limit).all()

    ist = pytz.timezone("Asia/Kolkata")
    results = []
    for s in sessions:
        start_time = (
            s.session_start.replace(tzinfo=timezone.utc).astimezone(ist) if s.session_start else None
        )
        stop_time = (
            s.session_end.replace(tzinfo=timezone.utc).astimezone(ist) if s.session_end else None
        )
        results.append(
            {
                "session_id": s.id,
                "part_code": s.part.part_code if s.part else None,
                "part_name": s.part_name,
                "category": s.part.category.category_name if s.part and s.part.category else "N/A",
                "mode_of_operation": s.part.mode_of_operation if s.part else None,
                "total_count": s.part_count,
                "start_time": start_time.isoformat() if start_time else None,
                "stop_time": stop_time.isoformat() if stop_time else None,
            }
        )

    return {"total": query.count(), "page": page, "limit": limit, "data": results}


@router.get("/download-report")
def download_report(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD"),
    format: str = Query("csv", enum=["csv", "pdf"]),
    db: Session = Depends(get_db),
):
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")

    sessions = (
        db.query(CompanySession)
        .filter(CompanySession.created_at >= start_dt)
        .filter(CompanySession.created_at < end_dt + timedelta(days=1))
        .order_by(CompanySession.created_at.asc())
        .all()
    )

    data = [
        {
            "S. No.": index + 1,
            "Part Code": s.part.part_code if s.part else "N/A",
            "Part Name": s.part_name,
            "Category": s.part.category.category_name if s.part and s.part.category else "N/A",
            "Mode": s.part.mode_of_operation if s.part else "N/A",
            "Start Time": s.session_start.strftime("%Y-%m-%d %H:%M:%S") if s.session_start else "N/A",
            "End Time": s.session_end.strftime("%Y-%m-%d %H:%M:%S") if s.session_end else "N/A",
            "Total Count": s.part_count,
        }
        for index, s in enumerate(sessions)
    ]

    df = pd.DataFrame(data)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if format == "csv":
        file_path = f"report_{timestamp}.csv"
        if df.empty:
            df = pd.DataFrame([{"Message": "No data available for the selected date range"}])
        df.to_csv(file_path, index=False)
        return FileResponse(file_path, media_type="text/csv", filename=os.path.basename(file_path))

    # PDF generation kept as-is from the previous router — schema-independent.
    os.makedirs("reports", exist_ok=True)
    file_path = f"report_{timestamp}.pdf"
    full_path = os.path.join("reports", file_path)

    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm

    top_logo_path = os.path.join(os.getcwd(), "assets/Yamaha_Logo.png")
    bottom_logo_path = os.path.join(os.getcwd(), "assets/raph.logo.png")

    doc = SimpleDocTemplate(
        full_path, pagesize=A4, topMargin=35 * mm, bottomMargin=25 * mm, leftMargin=10 * mm, rightMargin=10 * mm
    )
    elements = []
    styles = getSampleStyleSheet()

    def first_page_header_footer(canvas, doc):
        canvas.saveState()
        width, height = A4
        canvas.setFont("Helvetica", 8)
        canvas.drawString(10 * mm, height - 19 * mm, f"Start date: {start_date}")
        canvas.drawString(10 * mm, height - 23 * mm, f"End Date: {end_date}")
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawCentredString(width / 2.0, height - 18 * mm, "PART REPORT")
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawCentredString(width / 2.0, height - 23 * mm, "Automatic Counting Machine")
        if os.path.isfile(top_logo_path):
            canvas.drawImage(
                top_logo_path, width - 45 * mm, height - 90 * mm, width=35 * mm,
                preserveAspectRatio=True, mask="auto",
            )
        canvas.setLineWidth(0.5)
        canvas.line(10 * mm, height - 28 * mm, width - 10 * mm, height - 28 * mm)
        draw_footer(canvas, width)
        canvas.restoreState()

    def later_pages_footer(canvas, doc):
        canvas.saveState()
        width, height = A4
        draw_footer(canvas, width)
        canvas.restoreState()

    def draw_footer(canvas, width):
        canvas.setLineWidth(0.5)
        canvas.line(10 * mm, 20 * mm, width - 10 * mm, 20 * mm)
        canvas.setFont("Helvetica", 9)
        canvas.drawString(10 * mm, 12 * mm, f"Page {canvas.getPageNumber()}")
        canvas.drawRightString(width - 40 * mm, 12 * mm, "Powered by")
        if os.path.isfile(bottom_logo_path):
            canvas.drawImage(
                bottom_logo_path, width - 38 * mm, -5 * mm, width=15 * mm,
                preserveAspectRatio=True, mask="auto",
            )

    if df.empty:
        elements.append(Paragraph("<b>No data available</b>", styles["BodyText"]))
    else:
        table_data = [list(df.columns)] + df.values.tolist()
        c_widths = [15 * mm, 30 * mm, 45 * mm, 30 * mm, 30 * mm, 30 * mm, 15 * mm]
        table = Table(table_data, repeatRows=1, colWidths=c_widths, splitByRow=True)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        elements.append(table)

    doc.build(elements, onFirstPage=first_page_header_footer, onLaterPages=later_pages_footer)
    return FileResponse(full_path, media_type="application/pdf", filename=file_path)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------
@router.get("/categories")
async def get_categories(
    with_ids: bool = False,
    mode_of_operation: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    mode_of_operation = _validate_mode(mode_of_operation)
    query = db.query(Category)
    if mode_of_operation:
        query = (
            query.join(Part, Part.category_id == Category.category_id)
            .filter(Part.mode_of_operation == mode_of_operation)
            .distinct()
        )
    categories = query.all()
    if with_ids:
        return [{"id": c.category_id, "name": c.category_name} for c in categories]
    return [c.category_name for c in categories]


@router.post("/add-category")
async def add_category(category_name: str = Form(...), db: Session = Depends(get_db)):
    existing = db.query(Category).filter(Category.category_name == category_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    new_cat = Category(category_name=category_name)
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return {"category_id": new_cat.category_id, "category_name": new_cat.category_name}


# ---------------------------------------------------------------------------
# Parts — count / suggestions / details / by-code
# ---------------------------------------------------------------------------
@router.get("/part-count")
async def get_part_count(
    category: str,
    mode_of_operation: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    mode_of_operation = _validate_mode(mode_of_operation)
    category_obj = db.query(Category).filter(Category.category_name == category).first()
    if not category_obj:
        raise HTTPException(status_code=404, detail="Category not found")

    query = db.query(Part).filter(Part.category_id == category_obj.category_id)
    if mode_of_operation:
        query = query.filter(Part.mode_of_operation == mode_of_operation)
    return {"category": category, "count": query.count()}


@router.get("/parts")
async def get_part_suggestions(
    suggestion: str = "",
    category: str = "",
    mode_of_operation: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    mode_of_operation = _validate_mode(mode_of_operation)
    query = db.query(Part.part_name, Part.part_code)

    if category:
        category_id = (
            db.query(Category.category_id).filter(Category.category_name == category).scalar()
        )
        if category_id:
            query = query.filter(Part.category_id == category_id)

    if mode_of_operation:
        query = query.filter(Part.mode_of_operation == mode_of_operation)

    if suggestion:
        query = query.filter(
            or_(Part.part_name.ilike(f"%{suggestion}%"), Part.part_code.ilike(f"%{suggestion}%"))
        )

    return [{"part_name": name, "part_code": code} for name, code in query.all()]


@router.get("/part-details")
async def get_part_details(
    part_code: Optional[str] = None,
    part_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if not part_code and not part_name:
        raise HTTPException(status_code=400, detail="part_code or part_name is required")

    query = db.query(Part).join(Category, isouter=True)
    if part_code:
        part = query.filter(Part.part_code == part_code.strip()).first()
    else:
        normalized_name = part_name.strip().lower()
        part = query.filter(func.lower(Part.part_name) == normalized_name).first()

    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    return _part_detail_dict(part, db)


@router.get("/part-by-code")
def get_part_by_code(
    part_code: str = Query(..., description="Unique part_code from barcode"),
    db: Session = Depends(get_db),
):
    part = db.query(Part).join(Category, isouter=True).filter(Part.part_code == part_code).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    data = _part_detail_dict(part, db)
    data["category_name"] = data["category"]  # legacy alias some frontends expect
    return data


# ---------------------------------------------------------------------------
# Parts — create / list / delete
# ---------------------------------------------------------------------------
@router.post("/parts", response_model=PartOut)
def create_part(payload: PartCreate, db: Session = Depends(get_db)):
    if db.query(Part).filter(Part.part_code == payload.part_code).first():
        raise HTTPException(status_code=409, detail=f"part_code '{payload.part_code}' already exists")

    _validate_mode(payload.mode_of_operation)
    ai_model_id = _resolve_ai_model_id(db, payload.model_name, payload.ai_model_id)

    data = payload.model_dump(exclude={"model_name", "ai_model_id"})
    part = Part(**data, ai_model_id=ai_model_id)
    db.add(part)
    db.commit()
    db.refresh(part)
    return part


@router.get("/parts/all", response_model=list[PartOut])
def list_all_parts(db: Session = Depends(get_db)):
    return db.query(Part).order_by(Part.part_id).all()


@router.delete("/parts/delete/{part_id}")
def delete_part(part_id: int, db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.part_id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    db.delete(part)
    db.commit()
    return {"message": "Part deleted successfully"}


# ---------------------------------------------------------------------------
# AI models
# ---------------------------------------------------------------------------
# @router.post("/ai-models", response_model=AIModelOut)
# def add_ai_model(payload: AIModelCreate, db: Session = Depends(get_db)):
#     if db.query(AIModel).filter(AIModel.model_name == payload.model_name).first():
#         raise HTTPException(status_code=409, detail=f"Model '{payload.model_name}' already exists")
#     model = AIModel(
#         model_name=payload.model_name,
#         model_path=payload.model_path or f"{payload.model_name}.pt",
#         model_type=payload.model_type,
#         description=payload.description,
#         model_metadata=payload.model_metadata,
#         is_active=payload.is_active,
#         defects=payload.defects,
#     )
#     db.add(model)
#     db.commit()
#     db.refresh(model)
#     return model


# @router.get("/ai-models", response_model=list[AIModelOut])
# def list_ai_models(db: Session = Depends(get_db)):
#     return db.query(AIModel).order_by(AIModel.model_id).all()


# @router.get("/ai-model/{model_id}", response_model=AIModelOut)
# def get_ai_model(model_id: int, db: Session = Depends(get_db)):
#     model = db.get(AIModel, model_id)
#     if not model:
#         raise HTTPException(status_code=404, detail="AI model not found")
#     return model


# ---------------------------------------------------------------------------
# Session creation / start — BULK MODE ONLY, no batching
# ---------------------------------------------------------------------------
@router.post("/create_session_and_start")
async def create_session_and_start(
    part_code: str = Query(...),
    mode_of_operation: str = Query(...),
    order_no: str = Query(""),
    is_calibration: bool = Query(False),
    db: Session = Depends(get_db),
):
    mode_of_operation = _validate_mode(mode_of_operation)

    part = db.query(Part).filter(Part.part_code == part_code).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    if part.mode_of_operation != mode_of_operation:
        raise HTTPException(
            status_code=400,
            detail=f"Part '{part.part_name}' is configured for {part.mode_of_operation}, not {mode_of_operation}",
        )
    # import pdb;
    # pdb.set_trace()
    session = CompanySession(
        part_id=part.part_id,
        part_code=part.part_code,
        part_name=part.part_name,
        part_count=0,
        session_weight=0.0,
        session_start=datetime.now(timezone.utc),
        order_no=order_no,
        is_calibration=is_calibration,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    try:
        await PipelineRegistry.create(session.id, mode_of_operation, part)
    except Exception as e:
        db.delete(session)
        db.commit()
        logging.error(f"Failed to start pipeline for session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start pipeline: {e}")

    return {
        "message": "Session created and all systems started",
        "session_id": session.id,
        "mode_of_operation": mode_of_operation,
    }


@router.post("/stop")
async def stop(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    session_id = data.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    try:
        await PipelineRegistry.remove(session_id)

        session = db.query(CompanySession).filter(CompanySession.id == session_id).first()
        if session:
            session.session_end = datetime.now(timezone.utc)
            db.commit()

        return {"message": "Pipeline stopped and session ended."}

    except Exception as e:
        logging.error(f"Error while stopping systems: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/session/{session_id}/capture")
async def capture(session_id: int, db: Session = Depends(get_db)):
    """One capture -> infer -> process -> persist cycle for the active
    pipeline behind this session. This is what a mode page's Start button
    drives, once per polling tick."""
    pipeline = PipelineRegistry.get(session_id)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="No active pipeline for this session")

    session = db.query(CompanySession).filter(CompanySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        return await pipeline.capture_and_process(db, session)
    except Exception as e:
        logging.error(f"Capture failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Capture failed: {e}")


@router.post("/start")
async def start_all_systems(request: Request):
    body = await request.json()
    inference_engine = get_inference_engine()

    if inference_engine.is_more_than_one_start_enabled():
        raise HTTPException(status_code=500, detail="Inference Engine already stopped")

    set_state("RUNNING")

    pipeline_config = {
        "session_id": body.get("session_id"),
        "mode_of_operation": body.get("mode_of_operation", "Counting"),
    }

    camera_manager = get_camera_manager()
    if not camera_manager.is_initialized():
        if not camera_manager.initialize():
            raise HTTPException(status_code=500, detail="Failed to initialize camera")

    plc = get_plc_manager()
    if not plc.is_initialized():
        if not plc.connect():
            raise HTTPException(status_code=500, detail="PLC connection failed")

    session_id = pipeline_config.get("session_id")
    if not plc.start(session_id=session_id):
        raise HTTPException(status_code=500, detail="PLC failed to start")

    try:
        start_inference_pipeline(config=pipeline_config)
        return {"message": "Pipeline + PLC started"}
    except Exception as e:
        logging.error(f"Error starting: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pause")
def pause_pipeline():
    set_state("PAUSED")
    return {"status": "success", "state": get_state()}


@router.post("/resume")
def resume_pipeline():
    set_state("RUNNING")
    return {"status": "success", "state": get_state()}


@router.get("/state")
def get_current_state():
    return {"state": get_state()}


@router.post("/reset-count")
async def reset_count():
    try:
        import redis

        r = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"), port=int(os.getenv("REDIS_PORT", "6379")), db=0
        )
        r.set(config.redis.key_count, 0)
        r.publish("count_channel", 0)

        inference = get_inference_engine()
        if inference.shared_count_ref is not None and inference.count_lock:
            with inference.count_lock:
                inference.shared_count_ref["count"] = 0

        if inference and inference.processor:
            inference.processor.counted_ids.clear()
            inference.processor.total_count = 0
            inference.processor.reset()

        return {"message": "Count has been reset to 0."}
    except Exception as e:
        logging.error(f"Failed to reset count: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset count.")


@router.websocket("/ws/count")
async def websocket_count_endpoint(websocket: WebSocket):
    await get_websocket_manager().connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await get_websocket_manager().disconnect(websocket)


# ---------------------------------------------------------------------------
# Defects — save results against a session/part
# ---------------------------------------------------------------------------
@router.post("/defects", response_model=PartDefectOut)
def save_defects(payload: PartDefectIn, db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.part_code == payload.part_code).first()
    if not part:
        raise HTTPException(status_code=404, detail=f"Unknown part_code {payload.part_code!r}")

    session = db.get(CompanySession, payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {payload.session_id} not found")

    row = PartDefect(session_id=payload.session_id, part_id=part.part_id, defects=payload.defects)
    db.add(row)
    db.commit()
    db.refresh(row)

    result = PartDefectOut.model_validate(row)
    result.part_code = part.part_code
    return result


# ---------------------------------------------------------------------------
# Live session count / details
# ---------------------------------------------------------------------------
@router.post("/session/{session_id}/update-count")
def update_count(session_id: int, count: int, db: Session = Depends(get_db)):
    session = db.query(CompanySession).filter(CompanySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    part = db.query(Part).filter(Part.part_id == session.part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    session.part_count = count
    if part.part_weight:
        session.session_weight = round(count * part.part_weight, 3)
    else:
        session.session_weight = None

    db.commit()
    db.refresh(session)
    return {"session_id": session_id, "count": session.part_count, "weight": session.session_weight}


@router.get("/session/{session_id}/live")
def live_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(CompanySession).filter(CompanySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"count": session.part_count}


@router.get("/session/{session_id}/details")
def session_details(session_id: int, db: Session = Depends(get_db)):
    session = db.query(CompanySession).filter(CompanySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    part = db.query(Part).filter(Part.part_id == session.part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    total_weight = None
    if part.part_weight is not None and session.part_count is not None:
        total_weight = round(session.part_count * part.part_weight, 3)

    return {
        "session_id": session.id,
        "part_code": part.part_code,
        "part_name": part.part_name,
        "part_weight": part.part_weight,
        "count": session.part_count,
        "total_weight": total_weight,
        "session_start": session.session_start.isoformat() if session.session_start else None,
    }


# ---------------------------------------------------------------------------
# Calibration — uses a fixed calibration part_code, bulk-only
# ---------------------------------------------------------------------------
class CalibrationRun(BaseModel):
    run: int
    count: int


class CalibrationSaveRequest(BaseModel):
    session_id: int
    part_name: str
    expected_per_run: int
    total_runs: int
    runs: List[CalibrationRun]
    avg_count: float
    avg_accuracy: float


class CalibrationStartRequest(BaseModel):
    expected_per_run: int
    total_runs: int = 10


def _get_calibration_part(db: Session) -> Part:
    CALIBRATION_PART_CODE = "90179128050080"
    part = db.query(Part).filter(Part.part_code == CALIBRATION_PART_CODE).first()
    if not part:
        raise HTTPException(status_code=404, detail="Calibration part not found")
    return part


@router.get("/calibration/part-info")
def get_calibration_part_info(db: Session = Depends(get_db)):
    part = _get_calibration_part(db)
    return {
        "part_code": part.part_code,
        "part_name": part.part_name,
        "category": part.category.category_name if part.category else "unknown",
    }


@router.post("/calibration/start")
def start_calibration(request: CalibrationStartRequest, db: Session = Depends(get_db)):
    try:
        part = _get_calibration_part(db)
        if not request.expected_per_run or request.expected_per_run <= 0:
            raise HTTPException(status_code=400, detail="expected_per_run must be a positive number of parts")

        session = CompanySession(
            part_id=part.part_id,
            part_code=part.part_code,
            part_name=part.part_name,
            is_calibration=True,
            calibration_expected_per_run=request.expected_per_run,
            calibration_total_runs=request.total_runs,
            session_start=datetime.now(timezone.utc),
            part_count=0,
            session_weight=0.0,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        category = part.category.category_name if part.category else "unknown"
        model = get_inference_engine()
        model.initialize(
            part_name=part.part_name,
            category_name=category,
            part_code=part.part_code,
            session_id=session.id,
            mode="Counting",
            is_calibration=True,
        )
        model.stop_event.clear()
        if model.processor:
            model.processor.session_id = str(session.id)

        return {
            "session_id": session.id,
            "part_name": part.part_name,
            "part_code": part.part_code,
            "category": category,
            "expected_per_run": request.expected_per_run,
            "total_runs": request.total_runs,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calibration/save")
def save_calibration(request: CalibrationSaveRequest, db: Session = Depends(get_db)):
    try:
        session = db.query(CompanySession).filter(CompanySession.id == request.session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if not session.is_calibration:
            raise HTTPException(status_code=400, detail="Not a calibration session")
        if session.session_end:
            raise HTTPException(status_code=400, detail="Calibration already completed")

        counts = [r.count for r in request.runs]
        if not counts:
            raise HTTPException(status_code=400, detail="No calibration runs provided")

        avg_count = sum(counts) / len(counts)
        expected = session.calibration_expected_per_run
        if not expected:
            raise HTTPException(status_code=500, detail="Expected per run not set")

        avg_accuracy = (avg_count / expected) * 100
        passed = 104 >= avg_accuracy >= 96.0

        session.calibration_total_runs = len(counts)
        session.calibration_runs = [r.dict() for r in request.runs]
        session.calibration_avg_count = round(avg_count, 2)
        session.calibration_avg_accuracy = round(avg_accuracy, 2)
        session.calibration_passed = passed
        session.calibration_completed_at = datetime.now(timezone.utc)
        session.session_end = datetime.now(timezone.utc)

        db.commit()

        engine = get_inference_engine()
        engine.stop_event.set()

        return {
            "status": "success",
            "passed": passed,
            "avg_count": round(avg_count, 1),
            "avg_accuracy": round(avg_accuracy, 1),
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Health check / device settings / PLC status
# ---------------------------------------------------------------------------
@router.get("/status")
async def health_check():
    camera = get_camera_manager()
    plc = get_plc_manager()
    return {"camera_connected": camera.is_initialized(), "plc_connected": plc.is_initialized()}


active_connections: List[WebSocket] = []


async def notifier():
    while True:
        try:
            camera = get_camera_manager()
            plc = get_plc_manager()
            payload = {
                "camera_connected": camera.is_initialized(),
                "plc_connected": plc.is_initialized(),
            }
            for ws in active_connections:
                try:
                    await ws.send_json(payload)
                except Exception as e:
                    logging.error(f"[Notifier] Failed to send: {e}")
        except Exception as e:
            logging.error(f"[Notifier] Error: {e}")
        await asyncio.sleep(0.1)


@router.websocket("/status/ws")
async def websocket_health(ws: WebSocket):
    await ws.accept()
    active_connections.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(ws)


@router.get("/health-check")
async def get_health_check():
    try:
        camera = get_camera_manager()
        plc = get_plc_manager()
        if not camera.is_initialized():
            camera.initialize()
        if not plc.is_initialized():
            plc.connect()

        plc_connected = plc.is_initialized()
        camera_connected = camera.is_initialized()
        status = {"PLC": plc_connected, "Camera": camera_connected}
        return status
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/device-settings")
async def get_device_settings():
    """NOTE: feeder ON/OFF fields were tied to the removed corrugated/plain
    feeder columns on Part. This now only reports PLC connectivity; wire in
    real feeder state here once/if that hardware config is re-added to the
    schema in some form."""
    try:
        plc = get_plc_manager()
        return {"plc_connected": plc.is_initialized()}
    except Exception as e:
        logger.error(f"Failed to fetch device settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/plc/status")
async def get_plc_status(websocket: WebSocket):
    import json

    await get_websocket_manager().connect(websocket)
    plc = get_plc_manager()
    try:
        while True:
            await websocket.receive_text()
            await websocket.send_text(json.dumps(_get_plc_status(plc)))
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await get_websocket_manager().disconnect(websocket)


def _get_plc_status(plc):
    try:
        if not plc.is_initialized() or not plc.connected:
            return {"connected": False, "start_stop_signal": 0, "message": "PLC not connected"}
        try:
            button_value = plc._read_word(config.plc.addresses.start_stop)
        except Exception as e:
            logger.error(f"Failed to read config.plc.start_stop: {e}")
            button_value = None
        if button_value is None:
            button_value = 0
        return {"connected": True, "start_stop_signal": button_value, "status": plc.get_status()}
    except Exception as e:
        logger.error(f"Error getting PLC status: {e}")
        return {"connected": False, "start_stop_signal": 0, "message": str(e)}


# ---------------------------------------------------------------------------
# Label printing
# ---------------------------------------------------------------------------
@router.post("/print-preview")
async def preview_label(request: dict, db: Session = Depends(get_db)):
    session_id = int(request.get("session_id"))
    session = db.query(CompanySession).filter(CompanySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    part = db.query(Part).filter(Part.part_id == session.part_id).first()

    net_weight = "0"
    if session.session_weight:
        net_weight = str(round(session.session_weight, 3))
    display_weight = f"{net_weight} g"
    if session.session_weight and session.session_weight >= 1000:
        kg_val = round(session.session_weight / 1000, 3)
        display_weight = f"{kg_val} kg"

    return {
        "data": {
            "part_no": part.part_code,
            "part_name": part.part_name[:20],
            "quantity": session.part_count,
            "order_no": session.order_no,
            "part_weight": display_weight,
            "date_time": datetime.now().strftime("%d-%m-%Y %H:%M"),
        },
        "zpl": ZPLGenerator.generate(
            part, session.part_count, session.order_no or "NIL", None, display_weight, None, None,
        ),
    }


@router.post("/print")
def print_label(request: dict, db: Session = Depends(get_db)):
    return util_print_label(
        session_id=request.get("session_id"),
        part_count=request.get("part_count"),
    )


import asyncio  # placed here to keep the notifier() coroutine above self-contained

# ---- routers.py ----

def _part_row(part: Part, db: Session) -> dict:
    """Flat dict used by parts/by-category, part-by-code, and update_part."""
    return {
        "part_id": part.part_id,
        "part_code": part.part_code,
        "part_name": part.part_name,
        "category_id": part.category_id,
        "category_name": part.category.category_name if part.category else None,
        "parts_metadata": part.parts_metadata,
        "mode_of_operation": part.mode_of_operation,
        "image": part.image.decode("utf-8") if part.image else None,
        "part_weight": part.part_weight,
        "part_co_planarity": part.part_co_planarity,
        "part_parallelity": part.part_parallelity,
        "part_concentricity": part.part_concentricity,
        "measurement_parameters": part.measurement_parameters,
        "defect_parameters": part.defect_parameters,
    }


# @router.get("/parts/by-category")
# def parts_by_category(
#     category_id: Optional[int] = Query(None),
#     db: Session = Depends(get_db),
# ):
#     q = db.query(Part)
#     if category_id:
#         q = q.filter(Part.category_id == category_id)
#     return [_part_row(p, db) for p in q.order_by(Part.part_id).all()]

@router.get("/parts/by-category")
def parts_by_category(
    category_id: Optional[int] = Query(None),
    mode: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if mode is not None and mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")

    q = db.query(Part)
    if category_id:
        q = q.filter(Part.category_id == category_id)
    if mode:
        q = q.filter(Part.mode_of_operation == mode)
    return [_part_row(p, db) for p in q.order_by(Part.part_id).all()]


@router.put("/parts/{part_id}")
def update_part(part_id: int, payload: PartUpdate, db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.part_id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    data = payload.model_dump(exclude_unset=True)

    if "image" in data:
        img = data.pop("image")
        part.image = img.encode("utf-8") if img else None

    for k, v in data.items():
        setattr(part, k, v)

    db.commit()
    db.refresh(part)
    return _part_row(part, db)


@router.get("/download-parts-data")
def download_parts_data(db: Session = Depends(get_db)):
    rows = []
    for p in db.query(Part).order_by(Part.part_id).all():
        r = _part_row(p, db)
        r.pop("image", None)  # don't dump base64 into Excel

        # flatten measurement_parameters: {"length1": {"value":..,"min_value":..,"max_value":..,"calibration_factor":..}}
        mp = r.pop("measurement_parameters", None) or {}
        for key, entry in mp.items():
            if not isinstance(entry, dict):
                continue
            r[key] = entry.get("value")
            if "min_value" in entry:
                r[f"{key}_min"] = entry.get("min_value")
            if "max_value" in entry:
                r[f"{key}_max"] = entry.get("max_value")
            if "calibration_factor" in entry:
                r[f"{key}_cal"] = entry.get("calibration_factor")

        # flatten defect_parameters: {"d1": {"defect_name":"dent","confidence_threshold":0.6}}
        dp = r.pop("defect_parameters", None) or {}
        for key, entry in dp.items():
            if not isinstance(entry, dict):
                continue
            r[f"{key}_name"] = entry.get("defect_name")
            if "confidence_threshold" in entry:
                r[f"{key}_threshold"] = entry.get("confidence_threshold")

        rows.append(r)

    df = pd.DataFrame(rows if rows else [{"Message": "No parts found"}])
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = f"parts_export_{ts}.xlsx"
    df.to_excel(path, index=False, engine="openpyxl")
    return FileResponse(
        path,
        filename=path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )