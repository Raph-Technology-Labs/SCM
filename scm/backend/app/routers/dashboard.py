"""
Dashboard: aggregate metrics for the KPI cards and charts, plus a realtime
WebSocket feed that pushes the latest summary so the dashboard updates live.

All queries use the original column names from the desktop DB.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import Integer, case, cast, func
from sqlalchemy.orm import Session

from app.models.db import AIModel, CompanySession, Part, PartDefect, SessionLocal, get_db

router = APIRouter(tags=["dashboard"])


# ---------------------------------------------------------------------------
# aggregate helpers (plain functions so the WS feed can reuse them)
# ---------------------------------------------------------------------------
def build_summary(db: Session) -> dict:
    parts_total = db.query(func.count(Part.part_id)).scalar() or 0
    models_total = db.query(func.count(AIModel.model_id)).scalar() or 0
    sessions_total = db.query(func.count(CompanySession.id)).scalar() or 0
    total_inspected = db.query(func.coalesce(func.sum(CompanySession.part_count), 0)).scalar() or 0

    ok_count = db.query(func.count(CompanySession.id)).filter(
        CompanySession.overall_status == "OK"
    ).scalar() or 0
    nok_count = db.query(func.count(CompanySession.id)).filter(
        CompanySession.overall_status == "NOK"
    ).scalar() or 0
    pending_count = sessions_total - ok_count - nok_count

    avg_ppm = db.query(func.avg(CompanySession.parts_per_minute)).filter(
        CompanySession.parts_per_minute.isnot(None)
    ).scalar()

    denom = ok_count + nok_count
    ok_rate = round((ok_count / denom) * 100, 1) if denom else 0.0

    return {
        "parts_total": int(parts_total),
        "models_total": int(models_total),
        "sessions_total": int(sessions_total),
        "total_inspected": int(total_inspected),
        "ok_count": int(ok_count),
        "nok_count": int(nok_count),
        "pending_count": int(pending_count),
        "ok_rate": ok_rate,
        "avg_parts_per_minute": round(float(avg_ppm), 1) if avg_ppm is not None else None,
    }


def build_defect_breakdown(db: Session) -> list[dict]:
    def cnt(col):
        return db.query(func.count(PartDefect.id)).filter(col.is_(True)).scalar() or 0

    return [
        {"defect": "Thread missing", "count": int(cnt(PartDefect.thread_missing))},
        {"defect": "Dent", "count": int(cnt(PartDefect.dent))},
        {"defect": "Scratch", "count": int(cnt(PartDefect.scratch))},
        {"defect": "Rust", "count": int(cnt(PartDefect.rust))},
    ]


def build_timeseries(db: Session, limit_days: int = 30) -> list[dict]:
    day = func.date_trunc("day", CompanySession.session_start).label("day")
    rows = (
        db.query(
            day,
            func.count(CompanySession.id).label("sessions"),
            func.coalesce(func.sum(CompanySession.part_count), 0).label("inspected"),
            func.sum(case((CompanySession.overall_status == "OK", 1), else_=0)).label("ok"),
            func.sum(case((CompanySession.overall_status == "NOK", 1), else_=0)).label("nok"),
        )
        .filter(CompanySession.session_start.isnot(None))
        .group_by(day)
        .order_by(day.desc())
        .limit(limit_days)
        .all()
    )
    out = [
        {
            "day": r.day.strftime("%Y-%m-%d") if r.day else None,
            "sessions": int(r.sessions),
            "inspected": int(r.inspected),
            "ok": int(r.ok or 0),
            "nok": int(r.nok or 0),
        }
        for r in rows
    ]
    out.reverse()  # chronological for the chart
    return out


def build_top_parts(db: Session, limit: int = 5) -> list[dict]:
    rows = (
        db.query(
            CompanySession.part_code,
            CompanySession.part_name,
            func.count(CompanySession.id).label("sessions"),
            func.coalesce(func.sum(CompanySession.part_count), 0).label("inspected"),
        )
        .group_by(CompanySession.part_code, CompanySession.part_name)
        .order_by(func.coalesce(func.sum(CompanySession.part_count), 0).desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "part_code": r.part_code,
            "part_name": r.part_name,
            "sessions": int(r.sessions),
            "inspected": int(r.inspected),
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------
@router.get("/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db)) -> dict:
    return build_summary(db)


@router.get("/dashboard/status-breakdown")
def status_breakdown(db: Session = Depends(get_db)) -> list[dict]:
    s = build_summary(db)
    return [
        {"status": "OK", "count": s["ok_count"]},
        {"status": "NOK", "count": s["nok_count"]},
        {"status": "Pending", "count": s["pending_count"]},
    ]


@router.get("/dashboard/defect-breakdown")
def defect_breakdown(db: Session = Depends(get_db)) -> list[dict]:
    return build_defect_breakdown(db)


@router.get("/dashboard/timeseries")
def timeseries(db: Session = Depends(get_db)) -> list[dict]:
    return build_timeseries(db)


@router.get("/dashboard/top-parts")
def top_parts(db: Session = Depends(get_db)) -> list[dict]:
    return build_top_parts(db)


# ---------------------------------------------------------------------------
# realtime feed — pushes the summary every few seconds
# ---------------------------------------------------------------------------
@router.websocket("/ws/live")
async def live_feed(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            db = SessionLocal()
            try:
                payload = build_summary(db)
                payload["status_breakdown"] = [
                    {"status": "OK", "count": payload["ok_count"]},
                    {"status": "NOK", "count": payload["nok_count"]},
                    {"status": "Pending", "count": payload["pending_count"]},
                ]
            finally:
                db.close()
            await websocket.send_json(payload)
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        return
    except Exception:
        # close quietly on any server-side error
        try:
            await websocket.close()
        except Exception:
            pass
