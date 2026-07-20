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

const BASE = import.meta.env.VITE_BASE_URL || "";

const DIMENSION_FIELDS = [
  { key: "part_weight", label: "Weight", unit: "g" },
  { key: "part_height", label: "Height", unit: "mm" },
  { key: "part_width", label: "Width", unit: "mm" },
  { key: "part_inner_diameter", label: "Inner Dia.", unit: "mm" },
  { key: "part_outer_diameter", label: "Outer Dia.", unit: "mm" },
  { key: "part_length", label: "Length", unit: "mm" },
  { key: "part_angle", label: "Angle", unit: "deg" },
  { key: "part_arch_length", label: "Arch Length", unit: "mm" },
  { key: "part_sector", label: "Sector", unit: "" },
];

const MEASURABLE_PARAMS = [
  "part_length", "part_width", "part_height", "part_inner_diameter",
  "part_outer_diameter", "part_angle", "part_arch_length", "part_sector",
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

// measurement_parameters JSON  ->  editable rows
const paramsToRows = (mp) => {
  const out = {};
  Object.entries(mp || {}).forEach(([param, limits]) => {
    out[param] = (limits || []).map((l) => ({
      min_value: l.min_value ?? "",
      max_value: l.max_value ?? "",
    }));
  });
  return out;
};

export default function PartDetails({ loginData }) {
  const theme = useTheme();
  const isAdmin = loginData?.role === "administrator";
  const isSuperAdmin = loginData?.role === "superadministrator";
  const canEdit = isAdmin || isSuperAdmin;

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [parts, setParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editPart, setEditPart] = useState({});
  const [editMeas, setEditMeas] = useState({});
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
    fetchParts("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchParts = (categoryId, callback = null) => {
    axios
      .get(`${BASE}/dashboard/parts/by-category`, {
        params: categoryId ? { category_id: categoryId } : {},
      })
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
    fetchParts(id);
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

  // barcode scan / global search
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
        fetchParts(matched.id, (newParts) => {
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
    setEditMeas(paramsToRows(part.measurement_parameters));
    setEditOpen(true);
  };

  const setEditField = (key) => (e) => {
    const v = e.target.value;
    setEditPart((p) => ({ ...p, [key]: v }));
  };

  const setEditNum = (key) => (e) => {
    const v = e.target.value;
    if (nonNegative(v)) setEditPart((p) => ({ ...p, [key]: v }));
  };

  // ---- measurement editing ----
  const addMeasParam = (param) =>
    setEditMeas((m) => (m[param] ? m : { ...m, [param]: [{ min_value: "", max_value: "" }] }));
  const addMeasRow = (param) =>
    setEditMeas((m) => ({ ...m, [param]: [...m[param], { min_value: "", max_value: "" }] }));
  const updateMeasRow = (param, i, field, value) =>
    setEditMeas((m) => ({
      ...m, [param]: m[param].map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    }));
  const removeMeasRow = (param, i) =>
    setEditMeas((m) => {
      const rows = m[param].filter((_, idx) => idx !== i);
      const next = { ...m };
      if (!rows.length) delete next[param]; else next[param] = rows;
      return next;
    });
  const removeMeasParam = (param) =>
    setEditMeas((m) => { const n = { ...m }; delete n[param]; return n; });

  const buildMeasPayload = () => {
    const out = {};
    for (const [param, rows] of Object.entries(editMeas)) {
      const cleaned = rows
        .filter((r) => r.min_value !== "" || r.max_value !== "")
        .map((r) => ({
          min_value: r.min_value === "" ? null : Math.abs(Number(r.min_value)),
          max_value: r.max_value === "" ? null : Math.abs(Number(r.max_value)),
        }));
      if (cleaned.length) out[param] = cleaned;
    }
    return out;
  };

  const handleEditSave = () => {
    for (const [param, rows] of Object.entries(editMeas)) {
      for (const r of rows) {
        if (r.min_value !== "" && r.max_value !== "" &&
            Number(r.min_value) > Number(r.max_value)) {
          notify(`${param}: Min cannot be greater than Max.`, "error");
          return;
        }
      }
    }

    const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
    const payload = {
      part_name: editPart.part_name,
      parts_metadata: editPart.parts_metadata || null,
      model_name: editPart.model_name || null,
      image: editPart.image || null,
      part_weight: num(editPart.part_weight),
      part_height: num(editPart.part_height),
      part_width: num(editPart.part_width),
      part_inner_diameter: num(editPart.part_inner_diameter),
      part_outer_diameter: num(editPart.part_outer_diameter),
      part_length: num(editPart.part_length),
      part_angle: num(editPart.part_angle),
      part_arch_length: num(editPart.part_arch_length),
      part_sector: num(editPart.part_sector),
      part_co_planarity: !!editPart.part_co_planarity,
      part_parallelity: !!editPart.part_parallelity,
      part_concentricity: !!editPart.part_concentricity,
      measurement_parameters: buildMeasPayload(),
    };

    axios
      .put(`${BASE}/dashboard/parts/${editPart.part_id}`, payload)
      .then(() => {
        setEditOpen(false);
        notify(`Part "${editPart.part_code}" updated successfully`);
        fetchParts(selectedCategory, (newParts) => {
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
        fetchParts(selectedCategory);
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

  const measAvailable = MEASURABLE_PARAMS.filter((p) => !editMeas[p]);

  return (
   <Box sx={{minHeight: "100vh",width: "100%",flex: 1,overflowY: "auto",bgcolor: "background.default",}}>
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

            {/* Scanner input (bypasses virtual keyboard) */}
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
          maxHeight: 700, overflowY: "auto",
          "& .MuiTableCell-root": { padding: "10px 8px" },
        }}>
          <Table stickyHeader sx={{ width: "100%", tableLayout: "fixed" }}>
            <TableHead>
              <TableRow sx={{ "& th": { bgcolor: "accent.light", fontWeight: 700, color: "text.primary" } }}>
                <TableCell align="center" sx={{ width: "5%" }}>#</TableCell>
                <TableCell align="center" sx={{ width: "16%" }}>Part Name</TableCell>
                <TableCell align="center" sx={{ width: "14%" }}>Part Code</TableCell>
                <TableCell align="center" sx={{ width: "9%" }}>Image</TableCell>
                <TableCell align="center" sx={{ width: "12%" }}>Category</TableCell>
                <TableCell align="center" sx={{ width: "11%" }}>AI Model</TableCell>
                <TableCell align="center" sx={{ width: "11%" }}>Checks</TableCell>
                <TableCell align="center" sx={{ width: "10%" }}>Limits</TableCell>
                <TableCell align="center" sx={{ width: "12%" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredParts.length > 0 ? (
                filteredParts.map((part, index) => {
                  const checks = BOOLEAN_FLAGS.filter((f) => part[f.key]).map((f) => f.label);
                  const limitCount = Object.keys(part.measurement_parameters || {}).length;
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
                        {part.model_name
                          ? <Chip size="small" label={part.model_name}
                              sx={{ bgcolor: "accent.light", color: "text.primary" }} />
                          : "—"}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: "0.78rem", color: "text.secondary" }}>
                        {checks.length ? checks.join(", ") : "—"}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: "0.8rem", color: "text.secondary" }}>
                        {limitCount ? `${limitCount} param${limitCount > 1 ? "s" : ""}` : "—"}
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
                </Stack>
                <TextField label="Parts Metadata" fullWidth sx={inputSx}
                  value={editPart.parts_metadata || ""} onChange={setEditField("parts_metadata")} />
                <TextField label="AI Model Name (reference)" fullWidth sx={inputSx}
                  helperText="A developer links the actual AI model to this name."
                  value={editPart.model_name || ""} onChange={setEditField("model_name")} />
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Part Dimensions
              </Typography>
              <Box sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" },
                gap: 2,
              }}>
                {DIMENSION_FIELDS.map(({ key, label, unit }) => (
                  <TextField key={key} label={label} sx={inputSx}
                    value={editPart[key] ?? ""} onChange={setEditNum(key)}
                    inputProps={{ inputMode: "decimal" }}
                    InputProps={unit ? {
                      endAdornment: <InputAdornment position="end">{unit}</InputAdornment>,
                    } : undefined} />
                ))}
              </Box>
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
                Measurement Parameters
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
                Min/max limits per parameter. Negative values are not allowed.
              </Typography>

              {measAvailable.length > 0 && (
                <FormControl sx={{ minWidth: 260, mb: 2, ...inputSx }}>
                  <InputLabel>Add parameter</InputLabel>
                  <Select value="" label="Add parameter"
                    onChange={(e) => e.target.value && addMeasParam(e.target.value)}>
                    {measAvailable.map((p) => (
                      <MenuItem key={p} value={p}>{p}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {Object.entries(editMeas).map(([param, rows]) => (
                <Box key={param} sx={{
                  border: 1, borderColor: "divider", borderRadius: 1.5,
                  p: 2, mb: 2, bgcolor: "accent.light",
                }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>{param}</Typography>
                    <IconButton size="small" onClick={() => removeMeasParam(param)}>✕</IconButton>
                  </Stack>
                  {rows.map((row, i) => (
                    <Box key={i} sx={{
                      display: "grid", gridTemplateColumns: "1fr 1fr auto",
                      gap: 1, mb: 1, alignItems: "center",
                    }}>
                      <TextField label="Min" value={row.min_value} sx={inputSx}
                        inputProps={{ inputMode: "decimal", min: 0 }}
                        onChange={(e) => nonNegative(e.target.value) &&
                          updateMeasRow(param, i, "min_value", e.target.value)} />
                      <TextField label="Max" value={row.max_value} sx={inputSx}
                        inputProps={{ inputMode: "decimal", min: 0 }}
                        onChange={(e) => nonNegative(e.target.value) &&
                          updateMeasRow(param, i, "max_value", e.target.value)} />
                      <IconButton size="small" onClick={() => removeMeasRow(param, i)}>✕</IconButton>
                    </Box>
                  ))}
                  <Button size="small" color="primary" onClick={() => addMeasRow(param)}>
                    + Add limit
                  </Button>
                </Box>
              ))}
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