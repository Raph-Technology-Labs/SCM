"""
API routers.

Endpoints for the AI-model linking workflow plus a sessions report and health
checks. Full parts/sessions/auth endpoints will be expanded from the previous
project as needed.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.deps import require_admin
from app.models.db import AIModel, CompanySession, Part, get_db
from app.schemas import AIModelCreate, AIModelOut, ImportResult, PartCreate, PartOut
from app.services.excel_import import import_parts_from_xlsx
from app.services.model_linking import resolve_ai_model_id
from app.models.db import Part, PartDefect, get_db
from app.schemas import PartDefectIn

router = APIRouter()


# ---- health ---------------------------------------------------------------
@router.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok"}


@router.get("/health/db", tags=["system"])
def health_db(db: Session = Depends(get_db)) -> dict:
    db.execute(text("SELECT 1"))
    return {"database": "reachable"}


# ---- AI models ------------------------------------------------------------
@router.post("/ai-models", response_model=AIModelOut, tags=["ai-models"])
def add_ai_model(payload: AIModelCreate, db: Session = Depends(get_db),
                 _: object = Depends(require_admin)) -> AIModel:
    """The 'Add new AI model' button. Defaults model_path to '<name>.pt'."""
    if db.query(AIModel).filter(AIModel.model_name == payload.model_name).first():
        raise HTTPException(409, f"Model '{payload.model_name}' already exists")
    model = AIModel(
        model_name=payload.model_name,
        model_path=payload.model_path or f"{payload.model_name}.pt",
        model_type=payload.model_type,
        description=payload.description,
        model_metadata=payload.model_metadata,
        is_active=payload.is_active,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


@router.get("/ai-models", response_model=list[AIModelOut], tags=["ai-models"])
def list_ai_models(db: Session = Depends(get_db)) -> list[AIModel]:
    return db.query(AIModel).order_by(AIModel.model_id).all()


# ---- parts ----------------------------------------------------------------
@router.post("/parts", response_model=PartOut, tags=["parts"])
def add_part(payload: PartCreate, db: Session = Depends(get_db),
             _: object = Depends(require_admin)) -> Part:
    """Add a new part; links to an AI model by name or id (creates the model
    if only a name is given and it doesn't exist yet)."""
    if db.query(Part).filter(Part.part_code == payload.part_code).first():
        raise HTTPException(409, f"part_code '{payload.part_code}' already exists")

    ai_model_id = resolve_ai_model_id(
        db, model_name=payload.model_name, ai_model_id=payload.ai_model_id
    )

    data = payload.model_dump(exclude={"model_name", "ai_model_id"})
    part = Part(**data, ai_model_id=ai_model_id)
    db.add(part)
    db.commit()
    db.refresh(part)
    return part


@router.get("/parts", response_model=list[PartOut], tags=["parts"])
def list_parts(db: Session = Depends(get_db)) -> list[Part]:
    return db.query(Part).order_by(Part.part_id).all()


@router.post("/parts/import-excel", response_model=ImportResult, tags=["parts"])
async def import_parts_excel(
    file: UploadFile = File(...), db: Session = Depends(get_db),
    _: object = Depends(require_admin),
) -> ImportResult:
    """Dump an .xlsx of parts into the DB and link each to its AI model.

    Each row's `model_name` (e.g. 'bolt') is resolved to an ai_models row so the
    backend can later load the matching weights (e.g. bolt.pt)."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Please upload an .xlsx file")
    content = await file.read()
    return import_parts_from_xlsx(db, content)


# ---- sessions report ------------------------------------------------------
@router.get("/sessions", tags=["reports"])
def list_sessions(db: Session = Depends(get_db)) -> list[dict]:
    """Report of company sessions (newest first)."""
    rows = (
        db.query(
            CompanySession.id,
            CompanySession.part_code,
            CompanySession.part_name,
            CompanySession.part_count,
            CompanySession.overall_status,
            CompanySession.session_start,
            CompanySession.session_end,
        )
        .order_by(CompanySession.id.desc())
        .all()
    )
    return [dict(r._mapping) for r in rows]


@router.post("/defects")
def save_defects(payload: PartDefectIn, db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.part_code == payload.part_code).first()
    if not part:
        raise HTTPException(404, f"Unknown part_code {payload.part_code!r}")
    row = PartDefect(session_id=payload.session_id, part_id=part.part_id,  # resolved here
                     defects=payload.defects)
    db.add(row); db.commit(); db.refresh(row)
    return row
