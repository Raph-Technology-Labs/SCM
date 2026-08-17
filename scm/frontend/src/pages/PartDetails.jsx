import { useEffect, useState, useRef } from "react";
import {
  Box, Typography, FormControl, InputLabel, Select, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, TextField, Stack, InputAdornment, IconButton,
  FormControlLabel, Checkbox, Snackbar, Alert, Chip,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import axios from "axios";
import { BASE_URL as BASE } from "../api/baseUrl";
// const BASE = import.meta.env.VITE_BASE_URL || "";

const MODES = ["Counting", "Defect Detection", "Measurement"];

const FAMILIES = [
  { base: "length", label: "Length", unit: "mm" },
  { base: "width", label: "Width", unit: "mm" },
  { base: "height", label: "Height", unit: "mm" },
  { base: "id", label: "Inner Diameter", unit: "mm" },
  { base: "od", label: "Outer Diameter", unit: "mm" },
  { base: "angle", label: "Angle", unit: "deg" },
  { base: "arch", label: "Arch Length", unit: "mm" },
  { base: "sector", label: "Sector", unit: "" },
];

const BOOLEAN_FLAGS = [
  { key: "part_co_planarity", label: "Co-planarity" },
  { key: "part_parallelity", label: "Parallelity" },
  { key: "part_concentricity", label: "Concentricity" },
];

const nonNegative = (v) => v === "" || /^[0-9]*\.?[0-9]*$/.test(v);

const inputSx = {
  "& .MuiOutlinedInput-root": { height: 44, borderRadius: 1.5, bgcolor: "background.paper" },
  "& .MuiOutlinedInput-input": { padding: "10px 12px", fontSize: "0.9rem" },
  "& .MuiInputLabel-root": { fontSize: "0.85rem" },
};

const emptyInstance = () => ({ value: "", min_value: "", max_value: "", calibration_factor: "" });
const emptyDefect = () => ({ defect_name: "", confidence_threshold: "" });

// measurement_parameters JSON -> { length: [{value,min,max,cal}, ...], width: [...] }
const paramsToFamilies = (mp) => {
  const out = FAMILIES.reduce((acc, f) => ({ ...acc, [f.base]: [] }), {});
  Object.entries(mp || {}).forEach(([key, entry]) => {
    const m = key.match(/^([a-z]+)(\d+)$/);
    if (!m) return;
    const [, base, idx] = m;
    if (!out[base]) return;
    out[base][Number(idx) - 1] = {
      value: entry.value ?? "",
      min_value: entry.min_value ?? "",
      max_value: entry.max_value ?? "",
      calibration_factor: entry.calibration_factor ?? "",
    };
  });
  FAMILIES.forEach((f) => {
    if (!out[f.base].length) out[f.base] = [emptyInstance()];
    else out[f.base] = out[f.base].map((v) => v || emptyInstance());
  });
  return out;
};

// defect_parameters JSON -> [{defect_name, confidence_threshold}, ...]
const defectParamsToRows = (dp) => {
  const entries = Object.entries(dp || {})
    .sort(([a], [b]) => {
      const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return na - nb;
    })
    .map(([, v]) => ({
      defect_name: v.defect_name ?? "",
      confidence_threshold: v.confidence_threshold ?? "",
    }));
  return entries.length ? entries : [emptyDefect()];
};

export default function PartDetails({ loginData }) {
  const theme = useTheme();
  const isAdmin = loginData?.role === "administrator";
  const isSuperAdmin = loginData?.role === "superadministrator";
  const canEdit = isAdmin || isSuperAdmin;

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedMode, setSelectedMode] = useState("");
  const [parts, setParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editPart, setEditPart] = useState({});
  const [editFamilies, setEditFamilies] = useState({});
  const [editDefects, setEditDefects] = useState([emptyDefect()]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [partToDelete, setPartToDelete] = useState(null);

  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMsg, setSnackMsg] = useState("");
  const [snackSeverity, setSnackSeverity] = useState("success");

  const scannerRef = useRef(null);

  const notify = (msg, severity = "success") => {
    setSnackMsg(msg);
    setSnackSeverity(severity);
    setSnackOpen(true);
  };

  useEffect(() => {
    axios
      .get(`${BASE}/dashboard/categories?with_ids=true`)
      .then((res) => setCategories(res.data))
      .catch(() => notify("Failed to load categories", "error"));
    fetchParts("", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchParts = (categoryId, modeFilter, callback = null) => {
    const params = {};
    if (categoryId) params.category_id = categoryId;
    if (modeFilter) params.mode = modeFilter;
    axios
      .get(`${BASE}/dashboard/parts/by-category`, { params })
      .then((res) => {
        setParts(res.data);
        setFilteredParts(res.data);
        if (callback) callback(res.data);
      })
      .catch(() => notify("Failed to load parts", "error"));
  };

  const handleCategoryChange = (e) => {
    const id = e.target.value;
    setSelectedCategory(id);
    fetchParts(id, selectedMode);
    setSearchTerm("");
  };

  const handleModeChange = (e) => {
    const m = e.target.value;
    setSelectedMode(m);
    fetchParts(selectedCategory, m);
    setSearchTerm("");
  };

  const handleFilter = (codeOverride) => {
    const code = typeof codeOverride === "string" ? codeOverride : searchTerm;
    if (!code) { setFilteredParts(parts); return; }
    setFilteredParts(
      parts.filter(
        (p) =>
          p.part_name?.toLowerCase().includes(code.toLowerCase()) ||
          p.part_code?.toLowerCase().includes(code.toLowerCase()),
      ),
    );
  };

  const handleScanOrGlobalSearch = async (codeOverride) => {
    const code = typeof codeOverride === "string" ? codeOverride : searchTerm;
    if (!code) { setFilteredParts(parts); return; }

    const local = parts.find((p) => p.part_code?.toLowerCase() === code.toLowerCase());
    if (local) {
      setFilteredParts([local]);
      notify("Part found in current list.");
      return;
    }

    try {
      const res = await axios.get(`${BASE}/dashboard/part-by-code`, {
        params: { part_code: code },
      });
      const data = res.data;
      const matched = categories.find((c) => c.name === data?.category_name);
      if (matched) {
        setSelectedCategory(matched.id);
        fetchParts(matched.id, selectedMode, (newParts) => {
          const exact = newParts.filter(
            (p) => p.part_code?.toLowerCase() === code.toLowerCase(),
          );
          setFilteredParts(exact.length ? exact : newParts);
          notify(`Category of scanned part: ${matched.name}`);
        });
      } else {
        handleFilter(code);
      }
    } catch {
      handleFilter(code);
    }
  };

  const handleEditClick = (part) => {
    setEditPart({ ...part });
    setEditFamilies(paramsToFamilies(part.measurement_parameters));
    setEditDefects(defectParamsToRows(part.defect_parameters));
    setEditOpen(true);
  };

  const setEditField = (key) => (e) => {
    const v = e.target.value;
    setEditPart((p) => ({ ...p, [key]: v }));
  };

  const setEditWeight = (e) => {
    const v = e.target.value;
    if (nonNegative(v)) setEditPart((p) => ({ ...p, part_weight: v }));
  };

  // ---- dimension instance editing ----
  const addInstance = (base) =>
    setEditFamilies((f) => ({ ...f, [base]: [...f[base], emptyInstance()] }));

  const removeInstance = (base, idx) =>
    setEditFamilies((f) => {
      if (idx === 0) return f;
      return { ...f, [base]: f[base].filter((_, i) => i !== idx) };
    });

  const updateInstance = (base, idx, field, value) =>
    setEditFamilies((f) => ({
      ...f,
      [base]: f[base].map((inst, i) => (i === idx ? { ...inst, [field]: value } : inst)),
    }));

  const buildMeasurementPayload = () => {
    const out = {};
    for (const fam of FAMILIES) {
      editFamilies[fam.base].forEach((inst, i) => {
        const entry = {};
        if (inst.value !== "") entry.value = Math.abs(Number(inst.value));
        if (inst.min_value !== "") entry.min_value = Math.abs(Number(inst.min_value));
        if (inst.max_value !== "") entry.max_value = Math.abs(Number(inst.max_value));
        if (inst.calibration_factor !== "") entry.calibration_factor = Number(inst.calibration_factor);
        if (Object.keys(entry).length) out[`${fam.base}${i + 1}`] = entry;
      });
    }
    return out;
  };

  const validateMinMax = () => {
    for (const fam of FAMILIES) {
      for (let i = 0; i < editFamilies[fam.base].length; i++) {
        const inst = editFamilies[fam.base][i];
        if (inst.min_value !== "" && inst.max_value !== "" &&
            Number(inst.min_value) > Number(inst.max_value)) {
          return `${fam.label} (instance ${i + 1}): Min cannot be greater than Max.`;
        }
      }
    }
    return null;
  };

  // ---- defect editing ----
  const addDefect = () => setEditDefects((d) => [...d, emptyDefect()]);
  const removeDefect = (idx) => setEditDefects((d) => (idx === 0 ? d : d.filter((_, i) => i !== idx)));
  const updateDefect = (idx, field, value) =>
    setEditDefects((d) => d.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));

  const buildDefectPayload = () => {
    const out = {};
    editDefects.forEach((d, i) => {
      if (d.defect_name.trim()) {
        out[`d${i + 1}`] = {
          defect_name: d.defect_name.trim(),
          ...(d.confidence_threshold !== "" && { confidence_threshold: Number(d.confidence_threshold) }),
        };
      }
    });
    return out;
  };

  const handleEditSave = () => {
    const err = validateMinMax();
    if (err) { notify(err, "error"); return; }

    const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
    const payload = {
      part_name: editPart.part_name,
      parts_metadata: editPart.parts_metadata || null,
      image: editPart.image || null,
      part_weight: num(editPart.part_weight),
      part_co_planarity: !!editPart.part_co_planarity,
      part_parallelity: !!editPart.part_parallelity,
      part_concentricity: !!editPart.part_concentricity,
      measurement_parameters: buildMeasurementPayload(),
      defect_parameters: buildDefectPayload(),
    };

    axios
      .put(`${BASE}/dashboard/parts/${editPart.part_id}`, payload)
      .then(() => {
        setEditOpen(false);
        notify(`Part "${editPart.part_code}" updated successfully`);
        fetchParts(selectedCategory, selectedMode, (newParts) => {
          if (searchTerm) {
            setFilteredParts(
              newParts.filter(
                (p) =>
                  p.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  p.part_code?.toLowerCase().includes(searchTerm.toLowerCase()),
              ),
            );
          }
        });
      })
      .catch((err) =>
        notify(err.response?.data?.detail || "Failed to update part", "error"),
      );
  };

  const confirmDelete = () => {
    axios
      .delete(`${BASE}/dashboard/parts/delete/${partToDelete.part_id}`)
      .then(() => {
        setDeleteOpen(false);
        notify(`Part "${partToDelete.part_code}" deleted`, "error");
        setPartToDelete(null);
        fetchParts(selectedCategory, selectedMode);
      })
      .catch(() => notify("Failed to delete part", "error"));
  };

  const handleDownloadData = async () => {
    try {
      const response = await fetch(`${BASE}/dashboard/download-parts-data`);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PartsData_Export_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      notify("Data downloaded successfully");
    } catch {
      notify("Failed to download data", "error");
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", width: "100%", flex: 1, overflowY: "auto", bgcolor: "background.default" }}>
      <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 1.5, sm: 3, md: 4 }, py: { xs: 2, md: 3 } }}>

        <Typography variant="h5" sx={{ fontWeight: 700, color: "text.primary", mb: 0.5 }}>
          Part Details
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
          Browse, search, edit or export configured parts.
        </Typography>

        {/* Filters */}
        <Paper elevation={0} sx={{
          p: { xs: 2, sm: 2.5 }, mb: 3, borderRadius: 2, border: 1,
          borderColor: "divider", bgcolor: "background.paper",
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <FormControl sx={{ minWidth: 210, ...inputSx }}>
              <InputLabel>Select Category</InputLabel>
              <Select value={selectedCategory} onChange={handleCategoryChange} label="Select Category">
                <MenuItem value="">All Categories</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 200, ...inputSx }}>
              <InputLabel>Mode of Operation</InputLabel>
              <Select value={selectedMode} onChange={handleModeChange} label="Mode of Operation">
                <MenuItem value="">All Modes</MenuItem>
                {MODES.map((m) => (
                  <MenuItem key={m} value={m}>{m}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{
              display: "flex", alignItems: "center", gap: 1, px: 1.5, height: 44,
              bgcolor: "accent.light", borderRadius: 1.5, border: 1, borderColor: "divider",
            }}>
              <Typography sx={{ fontWeight: 600, fontSize: "0.85rem", color: "text.primary" }}>
                Scanner:
              </Typography>
              <input
                ref={scannerRef}
                autoFocus
                className="ignore-virtual-keyboard"
                placeholder="Scan barcode..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const code = e.target.value.trim();
                    if (code) { setSearchTerm(code); handleScanOrGlobalSearch(code); }
                    e.target.value = "";
                  }
                }}
                style={{
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 6, padding: "7px 10px", outline: "none", width: 170,
                }}
              />
            </Box>

            <TextField
              placeholder="Search name or code"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScanOrGlobalSearch()}
              sx={{ width: 260, ...inputSx }}
              InputProps={{
                startAdornment: <InputAdornment position="start">🔍</InputAdornment>,
              }}
            />

            <Button variant="contained" color="primary" sx={{ height: 44 }}
              onClick={() => handleScanOrGlobalSearch()}>
              Filter
            </Button>
            <Button variant="outlined" color="primary" sx={{ height: 44 }}
              onClick={handleDownloadData}>
              Download Data
            </Button>
          </Box>
        </Paper>

        {/* Table */}
        <TableContainer component={Paper} elevation={0} sx={{
          borderRadius: 2, border: 1, borderColor: "divider",
          overflowX: "auto",
          "& .MuiTableCell-root": { padding: "10px 8px" },
        }}>
          <Table sx={{ width: "100%", minWidth: 900, tableLayout: "fixed" }}>
            <TableHead>
              <TableRow sx={{ "& th": { bgcolor: "accent.light", fontWeight: 700, color: "text.primary" } }}>
                <TableCell align="center" sx={{ width: "5%" }}>#</TableCell>
                <TableCell align="center" sx={{ width: "16%" }}>Part Name</TableCell>
                <TableCell align="center" sx={{ width: "14%" }}>Part Code</TableCell>
                <TableCell align="center" sx={{ width: "9%" }}>Image</TableCell>
                <TableCell align="center" sx={{ width: "12%" }}>Category</TableCell>
                <TableCell align="center" sx={{ width: "10%" }}>Mode</TableCell>
                <TableCell align="center" sx={{ width: "12%" }}>Checks</TableCell>
                <TableCell align="center" sx={{ width: "10%" }}>Params / Defects</TableCell>
                <TableCell align="center" sx={{ width: "12%" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredParts.length > 0 ? (
                filteredParts.map((part, index) => {
                  const checks = BOOLEAN_FLAGS.filter((f) => part[f.key]).map((f) => f.label);
                  const paramCount = Object.keys(part.measurement_parameters || {}).length;
                  const defectCount = Object.keys(part.defect_parameters || {}).length;
                  return (
                    <TableRow key={part.part_id} hover>
                      <TableCell align="center">{index + 1}</TableCell>
                      <TableCell align="center">{part.part_name}</TableCell>
                      <TableCell align="center">{part.part_code}</TableCell>
                      <TableCell align="center">
                        {part.image ? (
                          <img src={part.image} alt={part.part_name || "Part"}
                            style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} />
                        ) : "—"}
                      </TableCell>
                      <TableCell align="center">{part.category_name || "N/A"}</TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={part.mode_of_operation || "—"}
                          sx={{ bgcolor: "accent.light", color: "text.primary" }} />
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: "0.78rem", color: "text.secondary" }}>
                        {checks.length ? checks.join(", ") : "—"}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: "0.8rem", color: "text.secondary" }}>
                        {paramCount ? `${paramCount} dim` : "—"}{defectCount ? `, ${defectCount} defect` : ""}
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={1} justifyContent="center">
                          <Button variant="outlined" size="small" disabled={!canEdit}
                            onClick={() => handleEditClick(part)}>Edit</Button>
                          <Button variant="outlined" size="small" color="error" disabled={!canEdit}
                            onClick={() => { setPartToDelete(part); setDeleteOpen(true); }}>Delete</Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    No parts found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* ===== Edit dialog ===== */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="md"
        PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Part Details</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ mt: 1 }}>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Basic Information
              </Typography>
              <Stack spacing={2}>
                <TextField label="Part Name" fullWidth sx={inputSx}
                  value={editPart.part_name || ""} onChange={setEditField("part_name")} />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField label="Part Code" fullWidth disabled variant="filled"
                    value={editPart.part_code || ""} />
                  <TextField label="Category" fullWidth disabled variant="filled"
                    value={editPart.category_name || ""} />
                  <TextField label="Mode of Operation" fullWidth disabled variant="filled"
                    value={editPart.mode_of_operation || ""} />
                </Stack>
                <TextField label="Parts Metadata" fullWidth sx={inputSx}
                  value={editPart.parts_metadata || ""} onChange={setEditField("parts_metadata")} />
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Weight
              </Typography>
              <TextField label="Weight (g)" sx={{ ...inputSx, maxWidth: 260 }}
                value={editPart.part_weight ?? ""} onChange={setEditWeight}
                inputProps={{ inputMode: "decimal" }} />
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Geometric Checks
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {BOOLEAN_FLAGS.map(({ key, label }) => (
                  <FormControlLabel key={key} label={label}
                    control={<Checkbox color="primary" checked={!!editPart[key]}
                      onChange={(e) => setEditPart((p) => ({ ...p, [key]: e.target.checked }))} />} />
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Part Parameters
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
                Each family supports unlimited instances. Negative values are not allowed.
              </Typography>

              {FAMILIES.map((fam) => (
                <Box key={fam.base} sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 2, mb: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
                      {fam.label}{fam.unit ? ` (${fam.unit})` : ""}
                    </Typography>
                    <Chip size="small"
                      label={`${editFamilies[fam.base]?.length || 1} instance${(editFamilies[fam.base]?.length || 1) > 1 ? "s" : ""}`}
                      sx={{ bgcolor: "accent.light" }} />
                  </Stack>

                  {(editFamilies[fam.base] || [emptyInstance()]).map((inst, i) => (
                    <Box key={i} sx={{
                      display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr 1fr auto",
                      gap: 1, mb: 1, alignItems: "center",
                    }}>
                      <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 60 }}>
                        {fam.base}{i + 1}
                      </Typography>
                      <TextField label="Value" value={inst.value} sx={inputSx}
                        onChange={(e) => nonNegative(e.target.value) && updateInstance(fam.base, i, "value", e.target.value)} />
                      <TextField label="Min" value={inst.min_value} sx={inputSx}
                        onChange={(e) => nonNegative(e.target.value) && updateInstance(fam.base, i, "min_value", e.target.value)} />
                      <TextField label="Max" value={inst.max_value} sx={inputSx}
                        onChange={(e) => nonNegative(e.target.value) && updateInstance(fam.base, i, "max_value", e.target.value)} />
                      <TextField label="Cal. Factor" value={inst.calibration_factor} sx={inputSx}
                        onChange={(e) => nonNegative(e.target.value) && updateInstance(fam.base, i, "calibration_factor", e.target.value)} />
                      {i > 0 && <IconButton size="small" onClick={() => removeInstance(fam.base, i)}>✕</IconButton>}
                    </Box>
                  ))}

                  <Button size="small" color="primary" onClick={() => addInstance(fam.base)}>
                    + Add another {fam.label.toLowerCase()} ({fam.base}{(editFamilies[fam.base]?.length || 1) + 1})
                  </Button>
                </Box>
              ))}
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Defects
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
                Each defect this part is checked for, with an optional confidence threshold.
              </Typography>
              {editDefects.map((d, i) => (
                <Box key={i} sx={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr auto", gap: 1, mb: 1, alignItems: "center" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 30 }}>d{i + 1}</Typography>
                  <TextField label="Defect name" value={d.defect_name} sx={inputSx}
                    onChange={(e) => updateDefect(i, "defect_name", e.target.value)} />
                  <TextField label="Confidence threshold" value={d.confidence_threshold} sx={inputSx}
                    inputProps={{ inputMode: "decimal" }}
                    onChange={(e) => nonNegative(e.target.value) && updateDefect(i, "confidence_threshold", e.target.value)} />
                  {i > 0 && <IconButton size="small" onClick={() => removeDefect(i)}>✕</IconButton>}
                </Box>
              ))}
              <Button size="small" color="primary" onClick={addDefect}>+ Add another defect</Button>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Part Image
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button variant="outlined" color="primary" component="label">
                  Upload New Image
                  <input type="file" accept="image/png,image/jpeg" hidden
                    onChange={(e) => {
                      const f = e.target.files[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onloadend = () => setEditPart((p) => ({ ...p, image: reader.result }));
                      reader.readAsDataURL(f);
                    }} />
                </Button>
                {editPart.image && (
                  <Box component="img" src={editPart.image} alt="preview"
                    sx={{ width: 90, height: 90, borderRadius: 2, objectFit: "cover", border: 1, borderColor: "divider" }} />
                )}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3 }}>
          <Button onClick={() => setEditOpen(false)} color="inherit">Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleEditSave} sx={{ px: 4 }}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Delete confirm ===== */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm Deletion</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the part{" "}
            <strong>{partToDelete?.part_code}</strong>? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ pb: 2, px: 3 }}>
          <Button onClick={() => setDeleteOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={confirmDelete} variant="contained" color="error" autoFocus>
            Yes, Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackOpen} autoHideDuration={4000} onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert onClose={() => setSnackOpen(false)} severity={snackSeverity}
          variant="filled" sx={{ borderRadius: 1.5 }}>
          {snackMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}