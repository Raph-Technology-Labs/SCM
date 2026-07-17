import os
import openpyxl
from openpyxl.styles import Font, PatternFill

MEASURABLE = [
    "part_length", "part_width", "part_height", "part_inner_diameter",
    "part_outer_diameter", "part_angle", "part_arch_length", "part_sector",
]

# non-measurable leading columns
headers = [
    "part_code", "part_name", "category_name", "model_name", "image",
    "part_weight",
]

# each measurable parameter followed immediately by its _min and _max
for p in MEASURABLE:
    headers += [p, f"{p}_min", f"{p}_max"]

# geometric flags at the end
headers += ["part_co_planarity", "part_parallelity", "part_concentricity"]

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Parts"
ws.append(headers)

# example row: a bolt with a length tolerance 39.5–40.5
row = {
    "part_code": "BOLT-001", "part_name": "M8 Bolt", "category_name": "Fasteners",
    "model_name": "bolt", "part_weight": 12.5,
    "part_length": 40, "part_length_min": 39.5, "part_length_max": 40.5,
    "part_width": 8, "part_height": 40,
    "part_inner_diameter": 6.2, "part_outer_diameter": 8.0,
    "part_co_planarity": "false", "part_parallelity": "false", "part_concentricity": "false",
}
ws.append([row.get(h, "") for h in headers])

hf = Font(bold=True, color="FFFFFF")
fill = PatternFill("solid", fgColor="B71C1C")
for c in ws[1]:
    c.font = hf
    c.fill = fill
for i, col in enumerate(headers, 1):
    ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(16, len(col) + 2)

base_dir = os.path.dirname(os.path.abspath(__file__))
assets_dir = os.path.join(base_dir, "assets")
os.makedirs(assets_dir, exist_ok=True)
path = os.path.join(assets_dir, "TemplateBulkUpload.xlsx")
wb.save(path)
print("Wrote", path)