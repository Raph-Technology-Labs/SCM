import { useState, useEffect } from "react";
import {
  Box, Button, Typography, TextField, Divider, IconButton,
  FormControlLabel, Checkbox, Dialog, DialogTitle, DialogContent,
  DialogActions, Chip, Stack, InputAdornment,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import axios from "axios";
import Autocomplete from "@mui/material/Autocomplete";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const BASE = import.meta.env.VITE_BASE_URL || "";

const DIMENSION_FIELDS = [
  { key: "part_weight", label: "Weight", unit: "g" },
  { key: "part_height", label: "Height", unit: "mm" },
  { key: "part_width", label: "Width", unit: "mm" },
  { key: "part_inner_diameter", label: "Inner Diameter", unit: "mm" },
  { key: "part_outer_diameter", label: "Outer Diameter", unit: "mm" },
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

const emptyDimensions = () =>
  DIMENSION_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: "" }), {});

// allows empty, digits, single decimal point — no minus sign
const nonNegative = (v) => v === "" || /^[0-9]*\.?[0-9]*$/.test(v);

const inputSx = {
  "& .MuiOutlinedInput-root": { height: 44, borderRadius: 1.5, bgcolor: "background.paper" },
  "& .MuiOutlinedInput-input": { padding: "10px 12px", fontSize: "0.9rem" },
  "& .MuiInputLabel-root": { fontSize: "0.85rem" },
};

const persistentPrimary = (theme) => ({
  "&.Mui-disabled": {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    opacity: 0.55,
  },
});

const Section = ({ title, subtitle, children }) => (
  <Box sx={{ mb: 3.5 }}>
    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary", mb: subtitle ? 0.25 : 1 }}>
      {title}
    </Typography>
    {subtitle && (
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.25 }}>
        {subtitle}
      </Typography>
    )}
    {children}
  </Box>
);

const AddNewPart = ({ loginData }) => {
  const theme = useTheme();
  const isAdmin = loginData?.role === "administrator";
  const isSuperAdmin = loginData?.role === "superadministrator";
  const isFormDisabled = !(isAdmin || isSuperAdmin);

  const toastStyles = {
    backgroundColor: theme.palette.accent.dark,
    color: theme.palette.text.primary,
    fontSize: "15px",
    borderRadius: theme.shape.borderRadius,
    padding: "10px",
  };

  const [categories, setCategories] = useState([]);
  const [modelNames, setModelNames] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [modelName, setModelName] = useState("");
  const [partName, setPartName] = useState("");
  const [partCode, setPartCode] = useState("");
  const [partsMetadata, setPartsMetadata] = useState("");
  const [dimensions, setDimensions] = useState(emptyDimensions());
  const [flags, setFlags] = useState({
    part_co_planarity: false, part_parallelity: false, part_concentricity: false,
  });
  const [measParams, setMeasParams] = useState({});
  const [imageFile, setImageFile] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchModelNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${BASE}/dashboard/categories?with_ids=true`);
      setCategories(res.data);
    } catch {
      toast.error("Failed to fetch categories.", { style: toastStyles });
    }
  };

  const fetchModelNames = async () => {
    try {
      const res = await axios.get(`${BASE}/dashboard/ai-model-names`);
      setModelNames(res.data || []);
    } catch (err) {
      console.warn("Failed to fetch AI model names", err);
    }
  };

  // create + select a new category
  const handleAddCategory = guard(async () => {
    const clean = newCategory.trim();
    if (!clean) {
      toast.error("Please type a category name.", { style: toastStyles });
      return;
    }
    try {
      const fd = new FormData();
      fd.append("category_name", clean);
      const res = await axios.post(`${BASE}/dashboard/add-category`, fd);
      // support both {id,name} and {category_id,category_name} responses
      const newCat = {
        id: res.data.id ?? res.data.category_id,
        name: res.data.name ?? res.data.category_name,
      };
      setCategories((prev) =>
        prev.some((c) => c.id === newCat.id) ? prev : [...prev, newCat]
      );
      setSelectedCategory(newCat);
      setNewCategory("");
      toast.success(`Category "${newCat.name}" added.`, { style: toastStyles });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add category.", { style: toastStyles });
    }
  });

  const showAdminToast = () =>
    toast("This action needs admin rights. Please contact admin.", {
      position: "top-center", autoClose: 3000, style: toastStyles,
    });

  function guard(fn) {
    return (...args) => {
      if (isFormDisabled) { showAdminToast(); return; }
      return fn(...args);
    };
  }

  const setDim = (key) => (e) => {
    const val = e.target.value;
    if (nonNegative(val)) setDimensions((d) => ({ ...d, [key]: val }));
  };

  // ----- measurement builder (min/max only, non-negative) -----
  const addMeasParam = (param) => {
    if (!param || measParams[param]) return;
    setMeasParams((mp) => ({ ...mp, [param]: [{ min_value: "", max_value: "" }] }));
  };
  const addMeasRow = (param) =>
    setMeasParams((mp) => ({ ...mp, [param]: [...mp[param], { min_value: "", max_value: "" }] }));
  const updateMeasRow = (param, i, field, value) =>
    setMeasParams((mp) => ({
      ...mp, [param]: mp[param].map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    }));
  const removeMeasRow = (param, i) =>
    setMeasParams((mp) => {
      const rows = mp[param].filter((_, idx) => idx !== i);
      const next = { ...mp };
      if (rows.length === 0) delete next[param]; else next[param] = rows;
      return next;
    });
  const removeMeasParam = (param) =>
    setMeasParams((mp) => { const n = { ...mp }; delete n[param]; return n; });

  const buildMeasurementPayload = () => {
    const out = {};
    for (const [param, rows] of Object.entries(measParams)) {
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

  const resetForm = () => {
    setPartName(""); setPartCode(""); setPartsMetadata("");
    setDimensions(emptyDimensions());
    setFlags({ part_co_planarity: false, part_parallelity: false, part_concentricity: false });
    setMeasParams({}); setSelectedCategory(null); setNewCategory(""); setModelName(""); setImageFile(null);
    const el = document.getElementById("single-image-input");
    if (el) el.value = null;
  };

  const handleAddPart = guard(async () => {
    if (!partName.trim() || !partCode.trim() || (!selectedCategory && !newCategory.trim())) {
      toast.error("Please fill Part Name, Part Code and select or add a Category.", { style: toastStyles });
      return;
    }

    // min must not exceed max
    for (const [param, rows] of Object.entries(measParams)) {
      for (const r of rows) {
        if (r.min_value !== "" && r.max_value !== "" &&
            Number(r.min_value) > Number(r.max_value)) {
          toast.error(`${param}: Min cannot be greater than Max.`, { style: toastStyles });
          return;
        }
      }
    }

    const fd = new FormData();
    fd.append("part_name", partName.trim());
    fd.append("part_code", partCode.trim());
    // dropdown selection wins; otherwise send the typed new category name
    if (selectedCategory) fd.append("category_id", selectedCategory.id);
    else fd.append("category_name", newCategory.trim());
    if (partsMetadata.trim()) fd.append("parts_metadata", partsMetadata.trim());
    if (modelName.trim()) fd.append("model_name", modelName.trim());
    DIMENSION_FIELDS.forEach(({ key }) => {
      if (dimensions[key] !== "" && !isNaN(Number(dimensions[key]))) fd.append(key, dimensions[key]);
    });
    BOOLEAN_FLAGS.forEach(({ key }) => fd.append(key, flags[key] ? "true" : "false"));
    const meas = buildMeasurementPayload();
    if (Object.keys(meas).length) fd.append("measurement_parameters", JSON.stringify(meas));
    if (imageFile) fd.append("image", imageFile);

    try {
      const res = await axios.post(`${BASE}/dashboard/add-part`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Part added! ID: ${res.data.part_id}`, {
        position: "top-center", autoClose: 3000, style: toastStyles,
      });
      if (modelName.trim() && !modelNames.includes(modelName.trim()))
        setModelNames((p) => [...p, modelName.trim()]);
      resetForm();
      fetchCategories(); // in case a new category was created via category_name
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add part.", {
        position: "top-center", autoClose: 3000, style: toastStyles,
      });
    }
  });

  const handleBulkUpload = guard(async () => {
    if (!uploadFile) { toast.error("Please select a CSV or Excel file first.", { style: toastStyles }); return; }
    if (!/\.(csv|xlsx)$/i.test(uploadFile.name)) {
      toast.error("Please upload only CSV or Excel files.", { style: toastStyles }); return;
    }
    setLoading(true);
    const fd = new FormData();
    fd.append("file", uploadFile);
    try {
      const res = await axios.post(`${BASE}/dashboard/bulk-upload-parts`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadResult(res.data);
      setUploadFile(null);
      const el = document.getElementById("bulk-file-input");
      if (el) el.value = null;
      const { created_parts, linked_parts, errors } = res.data;
      toast.success(
        `Uploaded ✅ parts: ${created_parts ?? 0}, linked: ${linked_parts ?? 0}${errors?.length ? `, errors: ${errors.length}` : ""}`,
        { position: "top-center", autoClose: 4000, style: toastStyles },
      );
      fetchModelNames();
      fetchCategories();
    } catch (err) {
      toast.error(JSON.stringify(err.response?.data || err.message), { style: toastStyles });
    } finally {
      setLoading(false);
    }
  });

  const startTemplateDownload = async () => {
    try {
      const response = await fetch(`${BASE}/dashboard/bulk-upload-template`, { method: "GET" });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      a.href = url;
      a.download = `TemplateBulkUpload-${ts}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template.", { style: toastStyles });
    }
  };

  const measurableAvailable = MEASURABLE_PARAMS.filter((p) => !measParams[p]);

  // mutual exclusivity flags
  const newCategoryActive = newCategory.trim().length > 0;
  const dropdownDisabled = isFormDisabled || newCategoryActive;
  const newCategoryDisabled = isFormDisabled || !!selectedCategory;

  return (
    <Box sx={{ height: "100%", minHeight: 0, overflowY: "auto", bgcolor: "background.default" }}>
      <ToastContainer />
      <Box sx={{ maxWidth: 1200, mx: "auto", px: { xs: 1.5, sm: 3, md: 4 }, py: { xs: 2, md: 3 } }}>

        {/* ===== Bulk Upload ===== */}
        <Box sx={{ bgcolor: "background.paper", borderRadius: 2, p: { xs: 2, sm: 3 }, mb: 3, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography sx={{ fontSize: 22 }}>⬆️</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Bulk Part Upload</Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Upload parts in one Excel/CSV file. Download the template to see every supported column.
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ flexWrap: "wrap" }}>
            <Button variant="contained" color="primary" component="label"
              disabled={isFormDisabled} sx={persistentPrimary(theme)}
              onClick={() => isFormDisabled && showAdminToast()}>
              Select File
              <input id="bulk-file-input" type="file" accept=".xlsx,.csv" hidden disabled={isFormDisabled}
                onChange={(e) => (!isFormDisabled ? setUploadFile(e.target.files[0]) : showAdminToast())} />
            </Button>
            <Button variant="contained" color="primary" onClick={handleBulkUpload}
              disabled={loading || isFormDisabled} sx={persistentPrimary(theme)}>
              {loading ? "Uploading..." : "Submit File"}
            </Button>
            <Button variant="outlined" color="primary" onClick={startTemplateDownload}>
              Download Template
            </Button>
          </Stack>

          {uploadFile && (
            <Chip label={uploadFile.name} onDelete={() => setUploadFile(null)}
              sx={{ mt: 1.5, bgcolor: "accent.light", color: "text.primary", maxWidth: "100%" }} />
          )}

          {uploadResult && (
            <Box sx={{ mt: 2, p: 2, borderRadius: 1.5, bgcolor: "accent.light", border: 1, borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Import finished</Typography>
              <Typography variant="body2">Created parts: {uploadResult.created_parts ?? 0}</Typography>
              <Typography variant="body2">Linked parts: {uploadResult.linked_parts ?? 0}</Typography>
              {uploadResult.errors?.length > 0 && (
                <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                  Errors ({uploadResult.errors.length}): {uploadResult.errors.join(", ")}
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {/* ===== Add Single Part ===== */}
        <Box sx={{ bgcolor: "background.paper", borderRadius: 2, p: { xs: 2, sm: 3, md: 4 }, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>➕ Add Single Part</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
            Fields marked * are required.
          </Typography>

          <Section title="Basic Information">
            <Stack spacing={2}>
              {/* Existing category dropdown */}
              <Autocomplete
                options={categories}
                value={selectedCategory}
                disabled={dropdownDisabled}
                getOptionLabel={(o) => o?.name || ""}
                isOptionEqualToValue={(o, v) => o?.id === v?.id}
                onChange={(e, v) => (!isFormDisabled ? setSelectedCategory(v) : showAdminToast())}
                renderInput={(p) => (
                  <TextField {...p} label="Select Category *"
                    helperText={newCategoryActive ? "Clear the new-category field to use the dropdown" : " "}
                    sx={inputSx} />
                )}
              />

              {/* New category input + button (disabled while a dropdown value is chosen) */}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-start" }}>
                <TextField
                  fullWidth
                  label="Add New Category"
                  value={newCategory}
                  disabled={newCategoryDisabled}
                  onChange={(e) => (!isFormDisabled ? setNewCategory(e.target.value) : showAdminToast())}
                  onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                  helperText={selectedCategory ? "Clear the dropdown to add a new category" : " "}
                  sx={inputSx}
                />
                <Button
                  variant="contained" color="primary"
                  onClick={handleAddCategory}
                  disabled={newCategoryDisabled || !newCategory.trim()}
                  sx={{ whiteSpace: "nowrap", height: 44, ...persistentPrimary(theme) }}
                >
                  Add Category
                </Button>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField fullWidth label="Part Name *" value={partName} sx={inputSx}
                  onChange={(e) => (!isFormDisabled ? setPartName(e.target.value) : showAdminToast())} />
                <TextField fullWidth label="Part Code *" value={partCode} sx={inputSx}
                  onChange={(e) => (!isFormDisabled ? setPartCode(e.target.value) : showAdminToast())} />
              </Stack>
            </Stack>
          </Section>

          <Divider sx={{ mb: 3 }} />

          <Section title="AI Model" subtitle="Reference name only — a developer links the actual AI model to this name.">
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "stretch" }}>
              <Autocomplete
                freeSolo sx={{ flex: 1 }} options={modelNames} value={modelName}
                onInputChange={(e, v) => (!isFormDisabled ? setModelName(v || "") : showAdminToast())}
                renderInput={(p) => <TextField {...p} label="AI Model Name (reference)" sx={inputSx} />}
              />
              <Button variant="contained" color="primary" sx={{ whiteSpace: "nowrap", ...persistentPrimary(theme) }}
                onClick={() => (!isFormDisabled ? setModelDialogOpen(true) : showAdminToast())}>
                🤖 Add AI Model
              </Button>
            </Stack>
          </Section>

          <Divider sx={{ mb: 3 }} />

          <Section title="Part Dimensions">
            <Box sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr", lg: "repeat(4, 1fr)" },
              gap: 2,
            }}>
              {DIMENSION_FIELDS.map(({ key, label, unit }) => (
                <TextField key={key} label={label} value={dimensions[key]} onChange={setDim(key)}
                  inputProps={{ inputMode: "decimal" }} sx={inputSx}
                  InputProps={unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined} />
              ))}
            </Box>
          </Section>

          <Divider sx={{ mb: 3 }} />

          <Section title="Geometric Checks">
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 1, sm: 3 } }}>
              {BOOLEAN_FLAGS.map(({ key, label }) => (
                <FormControlLabel key={key} label={label}
                  control={<Checkbox color="primary" checked={flags[key]}
                    onChange={(e) => (!isFormDisabled ? setFlags((f) => ({ ...f, [key]: e.target.checked })) : showAdminToast())} />} />
              ))}
            </Box>
          </Section>

          <Divider sx={{ mb: 3 }} />

          <Section title="Measurement Parameters (optional)"
            subtitle="For each parameter add one or more min/max limits. Negative values are not allowed.">
            <Autocomplete
              sx={{ maxWidth: 320, mb: 2 }} options={measurableAvailable} value={null}
              onChange={(e, v) => v && addMeasParam(v)}
              renderInput={(p) => <TextField {...p} label="Add parameter" sx={inputSx} />}
            />

            {Object.entries(measParams).map(([param, rows]) => (
              <Box key={param} sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 2, mb: 2, bgcolor: "accent.light" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>{param}</Typography>
                  <IconButton size="small" onClick={() => removeMeasParam(param)}>✕</IconButton>
                </Stack>
                {rows.map((row, i) => (
                  <Box key={i} sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr auto",
                    gap: 1, mb: 1, alignItems: "center",
                  }}>
                    <TextField label="Min" value={row.min_value} sx={inputSx} inputProps={{ inputMode: "decimal", min: 0 }}
                      onChange={(e) => nonNegative(e.target.value) && updateMeasRow(param, i, "min_value", e.target.value)} />
                    <TextField label="Max" value={row.max_value} sx={inputSx} inputProps={{ inputMode: "decimal", min: 0 }}
                      onChange={(e) => nonNegative(e.target.value) && updateMeasRow(param, i, "max_value", e.target.value)} />
                    <IconButton size="small" onClick={() => removeMeasRow(param, i)} sx={{ justifySelf: "center" }}>✕</IconButton>
                  </Box>
                ))}
                <Button size="small" color="primary" onClick={() => addMeasRow(param)}>+ Add limit</Button>
              </Box>
            ))}
          </Section>

          <Divider sx={{ mb: 3 }} />

          <Section title="Part Image">
            <Button variant="outlined" color="primary" component="label" disabled={isFormDisabled}>
              Upload Image (PNG / JPEG)
              <input id="single-image-input" type="file" accept="image/png,image/jpeg" hidden disabled={isFormDisabled}
                onChange={(e) => (!isFormDisabled ? setImageFile(e.target.files[0]) : showAdminToast())} />
            </Button>
            {imageFile && (
              <Box sx={{ mt: 1.5 }}>
                <img src={URL.createObjectURL(imageFile)} alt="preview"
                  style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 8, border: "1px solid #E5E7EB" }} />
              </Box>
            )}
          </Section>

          <Box sx={{ display: "flex", justifyContent: "flex-end", pt: 1, borderTop: 1, borderColor: "divider" }}>
            <Button variant="contained" color="primary" size="large" onClick={handleAddPart}
              disabled={isFormDisabled} sx={{ mt: 2, px: 4, ...persistentPrimary(theme) }}>
              Submit Part
            </Button>
          </Box>
        </Box>
      </Box>

      <ModelNameDialog
        open={modelDialogOpen} existingNames={modelNames} inputSx={inputSx}
        onClose={() => setModelDialogOpen(false)}
        onSave={(name) => {
          const clean = name.trim();
          if (clean && !modelNames.includes(clean)) setModelNames((p) => [...p, clean]);
          setModelName(clean);
          setModelDialogOpen(false);
          toast.success(`AI model name "${clean}" set as reference.`, { style: toastStyles });
        }}
      />
    </Box>
  );
};

const ModelNameDialog = ({ open, onClose, onSave, existingNames, inputSx }) => {
  const [name, setName] = useState("");
  const save = () => { if (!name.trim()) return; onSave(name); setName(""); };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Add AI Model (reference name)</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Enter the name a developer will use to link the actual AI model (e.g. <b>bolt</b>). Only the name is stored here.
        </Typography>
        <TextField fullWidth autoFocus label="Model Name *" value={name} sx={inputSx}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        {existingNames?.length > 0 && (
          <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, display: "block" }}>
            Existing: {existingNames.join(", ")}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" color="primary" onClick={save}>Use This Name</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddNewPart;