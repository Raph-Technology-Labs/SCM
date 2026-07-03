"""Pydantic request/response schemas for the API."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


# ---- AI models -------------------------------------------------------------
class AIModelCreate(BaseModel):
    model_name: str                      # e.g. 'bolt'  (the linking name)
    model_path: Optional[str] = None     # e.g. 'bolt.pt' (defaults to <name>.pt)
    model_type: Optional[str] = None
    description: Optional[str] = None
    model_metadata: Optional[dict[str, Any]] = None
    is_active: bool = True

    # allow the 'model_' prefixed field names (pydantic reserves 'model_' by default)
    model_config = ConfigDict(protected_namespaces=())
    defects: Optional[list[str]] = None      # ["thread_missing", "dent", ...]



class AIModelOut(AIModelCreate):
    model_id: int
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


# ---- Parts -----------------------------------------------------------------
class PartCreate(BaseModel):
    part_code: str
    part_name: str
    category_id: Optional[int] = None
    # link by name (resolved to ai_model_id) OR pass ai_model_id directly
    model_name: Optional[str] = None
    ai_model_id: Optional[int] = None

    parts_metadata: Optional[str] = None
    part_weight: Optional[float] = None
    part_height: Optional[float] = None
    part_width: Optional[float] = None
    part_inner_diameter: Optional[float] = None
    part_outer_diameter: Optional[float] = None
    actual_measurement_data: Optional[dict[str, Any]] = None
    part_length: Optional[float] = None
    part_angle: Optional[float] = None
    part_arch_length: Optional[float] = None
    part_co_planarity: bool = False
    part_parallelity: bool = False
    part_concentricity: bool = False
    mode_of_operation: str = "Counting"

    model_config = ConfigDict(protected_namespaces=())


class PartOut(BaseModel):
    part_id: int
    part_code: str
    part_name: str
    category_id: Optional[int] = None
    ai_model_id: Optional[int] = None
    mode_of_operation: str
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


# ---- Excel import ----------------------------------------------------------
class ImportResult(BaseModel):
    created_parts: int
    created_models: int
    linked_parts: int
    errors: list[str] = []


# schemas.py

class PartDefectIn(BaseModel):
    session_id: int
    part_code: str                       # human key — resolved to part_id in the endpoint
    defects: dict[str, bool]             # {"dent": true, "scratch": false}

class PartDefectOut(BaseModel):
    id: int
    session_id: int
    part_id: int                         # DB key
    part_code: Optional[str] = None      # echoed back for convenience
    defects: Optional[dict[str, Any]] = None
    model_config = ConfigDict(from_attributes=True)
    
