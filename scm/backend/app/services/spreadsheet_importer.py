"""Header-driven CSV/Excel importer for the Part schema (flexible column order).

Measurement limits are entered as flat number columns in the sheet
(e.g. part_length_min / part_length_max) and assembled here into the JSONB
shape the DB expects:  { "part_length": [{"min_value":.., "max_value":..}] }.
"""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field
from io import BytesIO
from typing import Any, Optional

import pandas as pd

try:
    import openpyxl
    from openpyxl_image_loader import SheetImageLoader
except ImportError:
    openpyxl = None
    SheetImageLoader = None

# parameters that can carry a min/max tolerance
MEASURABLE_PARAMS = [
    "part_length", "part_width", "part_height", "part_inner_diameter",
    "part_outer_diameter", "part_angle", "part_arch_length", "part_sector",
]

HEADER_SYNONYMS: dict[str, list[str]] = {
    "part_code": ["part_code", "code", "part code", "item", "item code", "id"],
    "part_name": ["part_name", "name", "part name", "product name"],
    "category_name": ["category_name", "category", "category name", "group"],
    "model_name": ["model_name", "model", "ai_model", "ai model", "model name"],
    "image": ["image", "img", "picture", "photo", "image_url"],
    "part_weight": ["part_weight", "weight"],
    "part_height": ["part_height", "height"],
    "part_width": ["part_width", "width"],
    "part_inner_diameter": ["part_inner_diameter", "inner_diameter", "id_mm"],
    "part_outer_diameter": ["part_outer_diameter", "outer_diameter", "od_mm"],
    "part_length": ["part_length", "length"],
    "part_angle": ["part_angle", "angle"],
    "part_arch_length": ["part_arch_length", "arch_length", "arch length"],
    "part_sector": ["part_sector", "sector"],
    "part_co_planarity": ["part_co_planarity", "co_planarity", "coplanarity"],
    "part_parallelity": ["part_parallelity", "parallelity"],
    "part_concentricity": ["part_concentricity", "concentricity"],
}

# add the min/max columns for every measurable parameter
for _p in MEASURABLE_PARAMS:
    HEADER_SYNONYMS[f"{_p}_min"] = [f"{_p}_min"]
    HEADER_SYNONYMS[f"{_p}_max"] = [f"{_p}_max"]


@dataclass
class PartRow:
    part_code: str
    part_name: Optional[str] = None
    category_name: Optional[str] = None
    model_name: Optional[str] = None
    image: Optional[str] = None
    part_weight: Optional[float] = None
    part_height: Optional[float] = None
    part_width: Optional[float] = None
    part_inner_diameter: Optional[float] = None
    part_outer_diameter: Optional[float] = None
    part_length: Optional[float] = None
    part_angle: Optional[float] = None
    part_arch_length: Optional[float] = None
    part_sector: Optional[float] = None
    part_co_planarity: bool = False
    part_parallelity: bool = False
    part_concentricity: bool = False
    measurement_parameters: Optional[dict[str, Any]] = field(default=None)


def _clean(text: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(text).strip().lower()).strip("_")


def _build_header_map(columns) -> dict[Any, str]:
    lookup = {}
    for canonical, spellings in HEADER_SYNONYMS.items():
        for s in [canonical] + spellings:
            lookup[_clean(s)] = canonical
    return {col: lookup.get(_clean(col), _clean(col)) for col in columns}


def _to_float(value) -> Optional[float]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        s = str(value).strip()
        return float(s) if s else None
    except (TypeError, ValueError):
        return None


def _to_bool(value) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "y", "on"}


def _build_measurement_params(rec: dict) -> Optional[dict]:
    """part_length_min / part_length_max columns ->
    { "part_length": [{"min_value": .., "max_value": ..}], ... }"""
    out = {}
    for p in MEASURABLE_PARAMS:
        mn = _to_float(rec.get(f"{p}_min"))
        mx = _to_float(rec.get(f"{p}_max"))
        if mn is not None or mx is not None:
            out[p] = [{"min_value": mn, "max_value": mx}]
    return out or None


def _row_to_part(rec: dict) -> Optional[PartRow]:
    code = rec.get("part_code")
    if code is None or str(code).strip() in ("", "nan"):
        return None
    return PartRow(
        part_code=str(code).strip(),
        part_name=(str(rec["part_name"]).strip() if rec.get("part_name") not in (None, "") else None),
        category_name=(str(rec["category_name"]).strip().title() if rec.get("category_name") else None),
        model_name=(str(rec["model_name"]).strip() if rec.get("model_name") else None),
        image=rec.get("image") or None,
        part_weight=_to_float(rec.get("part_weight")),
        part_height=_to_float(rec.get("part_height")),
        part_width=_to_float(rec.get("part_width")),
        part_inner_diameter=_to_float(rec.get("part_inner_diameter")),
        part_outer_diameter=_to_float(rec.get("part_outer_diameter")),
        part_length=_to_float(rec.get("part_length")),
        part_angle=_to_float(rec.get("part_angle")),
        part_arch_length=_to_float(rec.get("part_arch_length")),
        part_sector=_to_float(rec.get("part_sector")),
        part_co_planarity=_to_bool(rec.get("part_co_planarity")),
        part_parallelity=_to_bool(rec.get("part_parallelity")),
        part_concentricity=_to_bool(rec.get("part_concentricity")),
        measurement_parameters=_build_measurement_params(rec),
    )


class SpreadsheetCsvImporter:
    def __init__(self, file):
        self.df = pd.read_csv(file, dtype_backend="numpy_nullable")
        self.df = self.df.rename(columns=_build_header_map(self.df.columns))
        self.df = self.df.loc[:, ~self.df.columns.duplicated()]

    def process(self) -> tuple[list[PartRow], list[str]]:
        rows, errors = [], []
        for _, row in self.df.iterrows():
            part = _row_to_part(row.to_dict())
            if part is None:
                errors.append("row missing part_code")
                continue
            rows.append(part)
        return rows, errors


class SpreadsheetExcelImporter:
    def __init__(self, file: BytesIO):
        if openpyxl is None:
            raise RuntimeError("openpyxl is required for Excel import")
        self.wb = openpyxl.load_workbook(file)
        self.sheet = self.wb.active
        self.image_loader = SheetImageLoader(self.sheet) if SheetImageLoader else None

        raw_headers = [c.value for c in next(self.sheet.iter_rows(min_row=1, max_row=1))]
        header_map = _build_header_map(raw_headers)
        self.col_names = {i: header_map.get(h, _clean(h)) for i, h in enumerate(raw_headers)}
        self.name_to_idx = {v: k for k, v in self.col_names.items()}

    def _image_from_cell(self, row_number: int) -> Optional[str]:
        if self.image_loader is None or "image" not in self.name_to_idx:
            return None
        col = openpyxl.utils.get_column_letter(self.name_to_idx["image"] + 1)
        cell = f"{col}{row_number}"
        try:
            if self.image_loader.image_in(cell):
                img = self.image_loader.get(cell).convert("RGB")
                buf = BytesIO()
                img.save(buf, format="JPEG")
                return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
        except Exception:
            return None
        return None

    def process(self) -> tuple[list[PartRow], list[str]]:
        rows, errors = [], []
        for r_idx, excel_row in enumerate(
            self.sheet.iter_rows(min_row=2, values_only=True), start=2
        ):
            rec = {self.col_names[i]: v for i, v in enumerate(excel_row) if i in self.col_names}
            if not rec.get("image"):
                rec["image"] = self._image_from_cell(r_idx)
            part = _row_to_part(rec)
            if part is None:
                if any(v not in (None, "") for v in excel_row):
                    errors.append(f"row {r_idx}: missing part_code")
                continue
            rows.append(part)
        return rows, errors

    def process_images(self):
        return self.process()