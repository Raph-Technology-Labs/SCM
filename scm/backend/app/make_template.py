import os
import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

FAMILIES = ["length", "width", "height", "id", "od", "angle", "arch", "sector"]

# non-measurable leading columns
headers = [
    "part_code", "part_name", "category_name", "image",
    "part_weight", "mode_of_operation",
]

# each family gets instance 1 with value/min/max/cal as a starting example
for base in FAMILIES:
    headers += [f"{base}1", f"{base}1_min", f"{base}1_max", f"{base}1_cal"]

# defects: one instance as a starting example
headers += ["d1_name", "d1_threshold", "d2_name", "d2_threshold"]

# geometric flags at the end
headers += ["part_co_planarity", "part_parallelity", "part_concentricity"]

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Parts"
ws.append(headers)

# example row: a bolt with a length tolerance 39.5-40.5
row = {
    "part_code": "BOLT-001", "part_name": "M8 Bolt", "category_name": "Fasteners",
    "part_weight": 12.5, "mode_of_operation": "Measurement",
    "length1": 40, "length1_min": 39.5, "length1_max": 40.5,
    "width1": 8,
    "od1": 8.0, "od1_min": 7.8, "od1_max": 8.2,
    "part_co_planarity": "false", "part_parallelity": "false", "part_concentricity": "false",
}
ws.append([row.get(h, "") for h in headers])

hf = Font(bold=True, color="FFFFFF")
fill = PatternFill("solid", fgColor="B71C1C")
for c in ws[1]:
    c.font = hf
    c.fill = fill
for i, col in enumerate(headers, 1):
    ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(14, len(col) + 2)

# dropdown for mode_of_operation so users can't typo the value
mode_col = openpyxl.utils.get_column_letter(headers.index("mode_of_operation") + 1)
dv = DataValidation(type="list", formula1='"Counting,Defect Detection,Measurement"', allow_blank=True)
ws.add_data_validation(dv)
dv.add(f"{mode_col}2:{mode_col}1000")

# Instructions sheet explaining the unlimited-instance pattern
ws_info = wb.create_sheet("Instructions", 0)
lines = [
    "How to fill this template",
    "",
    "mode_of_operation: pick Counting, Defect Detection, or Measurement",
    "(dropdown provided in that column). Leave blank to default to Counting.",
    "",
    "Dimensions: each family (length, width, height, id, od, angle, arch,",
    "sector) supports unlimited instances. This sheet shows instance 1 as",
    "a starting example. To add a 2nd instance, add columns yourself:",
    "  length2, length2_min, length2_max, length2_cal",
    "  width2, width2_min, width2_max, width2_cal   ...and so on.",
    "_min, _max, _cal are all optional — leave blank if not needed.",
    "",
    "Defects: d1_name / d1_threshold is one defect (already in the sheet).",
    "Add d3_name / d3_threshold, d4_name / d4_threshold, etc. for more —",
    "no limit. confidence_threshold (0-1) is optional.",
]
for line in lines:
    ws_info.append([line])
ws_info["A1"].font = Font(bold=True, size=13)
ws_info.column_dimensions["A"].width = 80

base_dir = os.path.dirname(os.path.abspath(__file__))
assets_dir = os.path.join(base_dir, "assets")
os.makedirs(assets_dir, exist_ok=True)
path = os.path.join(assets_dir, "TemplateBulkUpload.xlsx")
wb.save(path)
print("Wrote", path)