"""Header-driven CSV/Excel importer for the Part schema.

Dimension families (length, width, height, id, od, angle, arch, sector)
support unlimited numbered instances, each with value/min/max/calibration
factor:
    length1, length1_min, length1_max, length1_cal, length2, length2_min, ...

Defects support unlimited numbered instances, each with a name + threshold:
    d1_name, d1_threshold, d2_name, d2_threshold, ...

mode_of_operation is NOT read from the sheet. It is always supplied
externally by the caller (the UI's mode dropdown, applied by the router
after process() runs) and overrides the PartRow default. Plain layout:
row 1 = headers, row 2+ = data.
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
except ImportError:
    openpyxl = None

try:
    from openpyxl_image_loader import SheetImageLoader
except ImportError:
    SheetImageLoader = None

VALID_MODES = {"Counting", "Defect Detection", "Measurement"}

FAMILY_BASES = {"length", "width", "height", "id", "od", "angle", "arch", "sector"}

# length1, length1_min, length1_max, length1_cal — instance number unbounded
_DIM_INSTANCE_RE = re.compile(
    r"^(" + "|".join(FAMILY_BASES) + r")(\d+)(_min|_max|_cal)?$"
)

# d1_name, d1_threshold, d2_name, ... — instance number unbounded
_DEFECT_INSTANCE_RE = re.compile(r"^d(\d+)(_name|_threshold)?$")

RESERVED_COLUMNS = {
    "part_code", "part_name", "category_name", "image",
    "part_weight", "part_co_planarity", "part_parallelity", "part_concentricity",
    "mode_of_operation",
}

HEADER_SYNONYMS: dict[str, list[str]] = {
    "part_code": ["part_code", "code", "part code", "item", "item code", "id"],
    "part_name": ["part_name", "name", "part name", "product name"],
    "category_name": ["category_name", "category", "category name", "group"],
    "image": ["image", "img", "picture", "photo", "image_url"],
    "part_weight": ["part_weight", "weight"],
    "part_co_planarity": ["part_co_planarity", "co_planarity", "coplanarity"],
    "part_parallelity": ["part_parallelity", "parallelity"],
    "part_concentricity": ["part_concentricity", "concentricity"],
    "mode_of_operation": ["mode_of_operation", "mode", "process", "operation"],
}


@dataclass
class PartRow:
    part_code: str
    part_name: Optional[str] = None
    category_name: Optional[str] = None
    image: Optional[str] = None
    part_weight: Optional[float] = None
    mode_of_operation: str = "Counting"
    part_co_planarity: bool = False
    part_parallelity: bool = False
    part_concentricity: bool = False
    measurement_parameters: Optional[dict[str, Any]] = field(default=None)
    defect_parameters: Optional[dict[str, Any]] = field(default=None)


def _clean(text: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(text).strip().lower()).strip("_")


def _build_header_map(columns) -> dict[Any, str]:
    """Reserved headers map to their canonical name via synonyms. Anything
    else passes through cleaned/untouched, so 'Length1_Min' -> 'length1_min',
    'D1_Name' -> 'd1_name', ready for the instance regexes below."""
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


def _extract_dimension_instances(rec: dict) -> Optional[dict]:
    """Any <family><N>[_min|_max|_cal] column -> one entry under key
    '<family><N>' with fields value / min_value / max_value / calibration_factor."""
    params: dict[str, dict] = {}
    for key, raw in rec.items():
        if key in RESERVED_COLUMNS:
            continue
        m = _DIM_INSTANCE_RE.match(key)
        if not m:
            continue
        base, idx_str, suffix = m.group(1), m.group(2), m.group(3)
        val = _to_float(raw)
        if val is None:
            continue
        entry = params.setdefault(f"{base}{idx_str}", {})
        if suffix == "_min":
            entry["min_value"] = val
        elif suffix == "_max":
            entry["max_value"] = val
        elif suffix == "_cal":
            entry["calibration_factor"] = val
        else:
            entry["value"] = val
    return params or None


def _extract_defect_instances(rec: dict) -> Optional[dict]:
    """d1_name / d1_threshold / d2_name / ... -> 
    {"d1": {"defect_name": .., "confidence_threshold": ..}, ...}"""
    params: dict[str, dict] = {}
    for key, raw in rec.items():
        m = _DEFECT_INSTANCE_RE.match(key)
        if not m:
            continue
        idx_str, suffix = m.group(1), m.group(2)
        entry = params.setdefault(f"d{idx_str}", {})
        if suffix == "_name":
            if raw not in (None, "") and not (isinstance(raw, float) and pd.isna(raw)):
                entry["defect_name"] = str(raw).strip()
        elif suffix == "_threshold":
            val = _to_float(raw)
            if val is not None:
                entry["confidence_threshold"] = val
    # drop any instance that ended up with no defect_name at all
    return {k: v for k, v in params.items() if v.get("defect_name")} or None


def _row_to_part(rec: dict) -> Optional[PartRow]:
    code = rec.get("part_code")
    if code is None or str(code).strip() in ("", "nan"):
        return None

    raw_mode = str(rec.get("mode_of_operation") or "").strip()
    mode = raw_mode if raw_mode in VALID_MODES else "Counting"

    return PartRow(
        part_code=str(code).strip(),
        part_name=(str(rec["part_name"]).strip() if rec.get("part_name") not in (None, "") else None),
        category_name=(str(rec["category_name"]).strip().title() if rec.get("category_name") else None),
        image=rec.get("image") or None,
        part_weight=_to_float(rec.get("part_weight")),
        mode_of_operation=mode,
        part_co_planarity=_to_bool(rec.get("part_co_planarity")),
        part_parallelity=_to_bool(rec.get("part_parallelity")),
        part_concentricity=_to_bool(rec.get("part_concentricity")),
        measurement_parameters=_extract_dimension_instances(rec),
        defect_parameters=_extract_defect_instances(rec),
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

    def process_defects(self) -> dict[str, list[str]]:
        return {}


class SpreadsheetExcelImporter:
    """Plain layout: row 1 = headers, row 2+ = part data.
    mode_of_operation is not read from the sheet; the router overwrites it
    on every returned PartRow using the UI's selected mode."""

    def __init__(self, file: BytesIO):
        if openpyxl is None:
            raise RuntimeError("openpyxl is required for Excel import")
        self.wb = openpyxl.load_workbook(file)
        self.sheet = self.wb["Parts"] if "Parts" in self.wb.sheetnames else self.wb.active
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

    def process_defects(self) -> dict[str, list[str]]:
        """Reads an optional 'Defects' sheet: category_name | defect_name
        (comma-separated). Returns {category_name: [defect1, defect2, ...]}.
        Absent if no such sheet exists."""
        defects_sheet = self.wb["Defects"] if "Defects" in self.wb.sheetnames else None
        if defects_sheet is None:
            return {}

        raw_headers = [c.value for c in next(defects_sheet.iter_rows(min_row=1, max_row=1))]
        header_map = _build_header_map(raw_headers)
        cols = {i: header_map.get(h, _clean(h)) for i, h in enumerate(raw_headers)}

        result: dict[str, list[str]] = {}
        for row in defects_sheet.iter_rows(min_row=2, values_only=True):
            rec = {cols[i]: v for i, v in enumerate(row) if i in cols}
            cat = rec.get("category_name")
            names = rec.get("defect_name")
            if not cat or not names:
                continue
            cat = str(cat).strip().title()
            parsed = [n.strip() for n in str(names).split(",") if n.strip()]
            if parsed:
                result[cat] = parsed
        return result