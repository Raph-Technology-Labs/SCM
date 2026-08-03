"""
Persists one capture's mode_result against the session/part and returns the
small dict used as the /capture endpoint's response body.

Deliberately self-contained — does not refactor or call into the existing
/defects or /update-count endpoint code, so those stay untouched.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.db import CompanySession, Part, PartDefect


class ResultProcessor:
    @staticmethod
    def process(mode: str, session: CompanySession, part: Part, mode_result: dict, db: Session) -> dict:
        if mode == "Counting":
            return ResultProcessor._process_counting(session, part, mode_result, db)
        if mode == "Defect Detection":
            return ResultProcessor._process_defect(session, part, mode_result, db)
        if mode == "Measurement":
            return ResultProcessor._process_measurement(session, mode_result, db)
        raise ValueError(f"Unknown mode_of_operation: {mode!r}")

    @staticmethod
    def _process_counting(session: CompanySession, part: Part, mode_result: dict, db: Session) -> dict:
        count = mode_result["total_count"]
        session.part_count = count
        session.session_weight = round(count * part.part_weight, 3) if part.part_weight else None
        db.commit()
        return {"count": count, "session_weight": session.session_weight}

    @staticmethod
    def _process_defect(session: CompanySession, part: Part, mode_result: dict, db: Session) -> dict:
        row = PartDefect(session_id=session.id, part_id=part.part_id, defects=mode_result)
        db.add(row)
        session.overall_status = "NOK" if "NOK" in mode_result.values() else "OK"
        db.commit()
        return {"defects": mode_result, "overall_status": session.overall_status}

    @staticmethod
    def _process_measurement(session: CompanySession, mode_result: dict, db: Session) -> dict:
        merged = dict(session.measured_realtime_data or {})
        merged.update(mode_result)
        session.measured_realtime_data = merged
        session.overall_status = "OK" if all(v.get("ok", True) for v in merged.values()) else "NOK"
        db.commit()
        return {"features": mode_result, "overall_status": session.overall_status}
