"""Pydantic request/response schemas for the API."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


# ---- Parts -------------------------------------------------------------
class PartCreate(BaseModel):
    part_code: str
    part_name: str
    category_id: Optional[int] = None

    parts_metadata: Optional[str] = None
    part_weight: Optional[float] = None

    part_co_planarity: bool = False
    part_parallelity: bool = False
    part_concentricity: bool = False
    mode_of_operation: str = "Counting"

    # single source of truth for every dimensional parameter — unlimited
    # numbered instances per family, e.g.
    #   { "length1": {"value":40.0,"min_value":39.5,"max_value":40.5,
    #                 "calibration_factor":1.002},
    #     "length2": {...}, "width1": {...}, "od1": {...} }
    measurement_parameters: Optional[dict[str, Any]] = None

    # defect config for this part — unlimited numbered instances, e.g.
    #   { "d1": {"defect_name":"dent","confidence_threshold":0.6},
    #     "d2": {"defect_name":"scratch","confidence_threshold":0.75} }
    defect_parameters: Optional[dict[str, Any]] = None

    model_config = ConfigDict(protected_namespaces=())


class PartOut(BaseModel):
    part_id: int
    part_code: str
    part_name: str
    category_id: Optional[int] = None
    mode_of_operation: str
    parts_metadata: Optional[str] = None
    part_weight: Optional[float] = None
    measurement_parameters: Optional[dict[str, Any]] = None
    defect_parameters: Optional[dict[str, Any]] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


class PartUpdate(BaseModel):
    """Partial update for an existing part — every field optional so the
    frontend can send only what changed (used with exclude_unset=True)."""
    part_name: Optional[str] = None
    parts_metadata: Optional[str] = None
    image: Optional[str] = None                 # data URL string
    part_weight: Optional[float] = None
    part_co_planarity: Optional[bool] = None
    part_parallelity: Optional[bool] = None
    part_concentricity: Optional[bool] = None
    measurement_parameters: Optional[dict[str, Any]] = None
    defect_parameters: Optional[dict[str, Any]] = None

    model_config = ConfigDict(protected_namespaces=())


# ---- Excel import ----------------------------------------------------------
class ImportResult(BaseModel):
    created_parts: int
    linked_parts: int
    errors: list[str] = []


# ---- Defect results (runtime, per inspected unit) ---------------------------
class PartDefectIn(BaseModel):
    session_id: int
    part_code: str                       # human key — resolved to part_id in the endpoint
    defects: dict[str, str]              # {"d1": "OK", "d2": "NOK"} — keyed to match Part.defect_parameters

class PartDefectOut(BaseModel):
    id: int
    session_id: int
    part_id: int                         # DB key
    part_code: Optional[str] = None      # echoed back for convenience
    defects: Optional[dict[str, Any]] = None
    model_config = ConfigDict(from_attributes=True)


# ---- Reference shapes (illustrative only — not enforced at the API layer) --
# parts.measurement_parameters shape:
#   { "length1": {"value":.., "min_value":.., "max_value":.., "calibration_factor":..},
#     "length2": {...}, "width1": {...}, "height1": {...},
#     "id1": {...} (inner diameter), "od1": {...} (outer diameter),
#     "angle1": {...}, "arch1": {...}, "sector1": {...} }
#   Family prefixes: length, width, height, id, od, angle, arch, sector.
#   Instance numbers (1, 2, 3, ...) are unbounded; every field inside an
#   instance is optional and independent of the others.
#
# parts.defect_parameters shape (CONFIG — what to check, not a result):
#   { "d1": {"defect_name": "dent", "confidence_threshold": 0.6},
#     "d2": {"defect_name": "scratch", "confidence_threshold": 0.75} }
#
# part_defects.defects shape (RESULT — written per inspected unit, keyed to
# match parts.defect_parameters):
#   { "d1": "NOK", "d2": "OK" }