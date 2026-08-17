import { useState, useEffect } from "react";
import {
  Box, Button, Typography, TextField, Divider, IconButton,
  FormControlLabel, Checkbox, Chip, Stack, InputAdornment, MenuItem,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import axios from "axios";
import Autocomplete from "@mui/material/Autocomplete";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
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

const ALL_FAMILIES = FAMILIES.map((f) => f.base);

/**
 * Mirrors the bulk-upload template columns for each mode of operation.
 * `families` lists the dimension families the mode collects — a subset of
 * ALL_FAMILIES. Edit these lists to match the template; the form, the
 * min/max validation and the submitted payload all follow automatically.
 */
const MODE_CONFIG = {
  "Counting": {
    weight: true,
    families: ["length", "width", "height", "id", "od"],
    geometric: false,
    defects: false,
  },
  "Defect Detection": {
    weight: false,
    families: [],
    geometric: false,
    defects: true,
  },
  "Measurement": {
    weight: false,
    families: ALL_FAMILIES,
    geometric: true,
    defects: false,
  },
};

const MODE_HINT = {
  "Counting": "Counting needs a reference weight and the part's size dimensions.",
  "Defect Detection": "Defect detection needs the list of defects to check for.",
  "Measurement": "Measurement needs full dimensions and geometric checks.",
};

const BOOLEAN_FLAGS = [
  { key: "part_co_planarity", label: "Co-planarity" },
  { key: "part_parallelity", label: "Parallelity" },
  { key: "part_concentricity", label: "Concentricity" },
];

const nonNegative = (v) => v === "" || /^[0-9]*\.?[0-9]*$/.test(v);

const emptyInstance = () => ({ value: "", min_value: "", max_value: "", calibration_factor: "" });
const initFamilyState = () =>
  FAMILIES.reduce((acc, f) => ({ ...acc, [f.base]: [emptyInstance()] }), {});

const emptyDefect = () => ({ defect_name: "", confidence_threshold: "" });

const initFlags = () => ({
  part_co_planarity: false, part_parallelity: false, part_concentricity: false,
});

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
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [partName, setPartName] = useState("");
  const [partCode, setPartCode] = useState("");
  const [partsMetadata, setPartsMetadata] = useState("");
  const [mode, setMode] = useState("Counting");
  const [weight, setWeight] = useState("");
  const [families, setFamilies] = useState(initFamilyState());
  const [defects, setDefects] = useState([emptyDefect()]);
  const [flags, setFlags] = useState(initFlags());
  const [imageFile, setImageFile] = useState(null);

  // What the current mode actually collects.
  const cfg = MODE_CONFIG[mode] ?? MODE_CONFIG["Counting"];
  const visibleFamilies = FAMILIES.filter((f) => cfg.families.includes(f.base));
  const hasFamilies = visibleFamilies.length > 0;

  // ----- bulk upload state -----
  const [bulkMode, setBulkMode] = useState("Counting");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCategories();
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
      const newCat = {
        id: res.data.id ?? res.data.category_id,
        name: res.data.name ?? res.data.category_name,
      };
      setCategories((prev) => (prev.some((c) => c.id === newCat.id) ? prev : [...prev, newCat]));
      setSelectedCategory(newCat);
      setNewCategory("");
      toast.success(`Category "${newCat.name}" added.`, { style: toastStyles });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add category.", { style: toastStyles });
    }
  });

  // ----- mode of operation -----
  // Switching mode clears whatever the new mode doesn't collect, so a value
  // typed under one mode can never ride along in another mode's payload.
  const handleModeChange = (nextMode) => {
    if (isFormDisabled) { showAdminToast(); return; }
    setMode(nextMode);
    const next = MODE_CONFIG[nextMode] ?? MODE_CONFIG["Counting"];
    setFamilies(initFamilyState());              // family subset differs per mode
    if (!next.weight) setWeight("");
    if (!next.geometric) setFlags(initFlags());
    if (!next.defects) setDefects([emptyDefect()]);
  };

  // ----- dimension family instances -----
  const addInstance = (base) =>
    setFamilies((f) => ({ ...f, [base]: [...f[base], emptyInstance()] }));

  const removeInstance = (base, idx) =>
    setFamilies((f) => {
      if (idx === 0) return f; // instance 1 always stays
      return { ...f, [base]: f[base].filter((_, i) => i !== idx) };
    });

  const updateInstance = (base, idx, field, value) =>
    setFamilies((f) => ({
      ...f,
      [base]: f[base].map((inst, i) => (i === idx ? { ...inst, [field]: value } : inst)),
    }));

  const buildMeasurementPayload = () => {
    const out = {};
    for (const fam of visibleFamilies) {
      families[fam.base].forEach((inst, i) => {
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
    for (const fam of visibleFamilies) {
      for (let i = 0; i < families[fam.base].length; i++) {
        const inst = families[fam.base][i];
        if (inst.min_value !== "" && inst.max_value !== "" &&
            Number(inst.min_value) > Number(inst.max_value)) {
          return `${fam.label} (instance ${i + 1}): Min cannot be greater than Max.`;
        }
      }
    }
    return null;
  };

  // ----- defects -----
  const addDefect = () => setDefects((d) => [...d, emptyDefect()]);
  const removeDefect = (idx) => setDefects((d) => (idx === 0 ? d : d.filter((_, i) => i !== idx)));
  const updateDefect = (idx, field, value) =>
    setDefects((d) => d.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));

  const buildDefectPayload = () => {
    const out = {};
    defects.forEach((d, i) => {
      if (d.defect_name.trim()) {
        out[`d${i + 1}`] = {
          defect_name: d.defect_name.trim(),
          ...(d.confidence_threshold !== "" && { confidence_threshold: Number(d.confidence_threshold) }),
        };
      }
    });
    return out;
  };

  const resetForm = () => {
    setPartName(""); setPartCode(""); setPartsMetadata(""); setMode("Counting");
    setWeight(""); setFamilies(initFamilyState()); setDefects([emptyDefect()]);
    setFlags(initFlags());
    setSelectedCategory(null); setNewCategory(""); setImageFile(null);
    const el = document.getElementById("single-image-input");
    if (el) el.value = null;
  };

  const handleAddPart = guard(async () => {
    if (!partName.trim() || !partCode.trim() || (!selectedCategory && !newCategory.trim())) {
      toast.error("Please fill Part Name, Part Code and select or add a Category.", { style: toastStyles });
      return;
    }

    if (hasFamilies) {
      const err = validateMinMax();
      if (err) { toast.error(err, { style: toastStyles }); return; }
    }

    const fd = new FormData();
    fd.append("part_name", partName.trim());
    fd.append("part_code", partCode.trim());
    if (selectedCategory) fd.append("category_id", selectedCategory.id);
    else fd.append("category_name", newCategory.trim());
    if (partsMetadata.trim()) fd.append("parts_metadata", partsMetadata.trim());
    fd.append("mode_of_operation", mode);

    if (cfg.weight && weight !== "" && !isNaN(Number(weight))) fd.append("part_weight", weight);

    // Always sent so the backend contract stays stable; forced false off-mode.
    BOOLEAN_FLAGS.forEach(({ key }) =>
      fd.append(key, cfg.geometric && flags[key] ? "true" : "false"));

    if (hasFamilies) {
      const measurementPayload = buildMeasurementPayload();
      if (Object.keys(measurementPayload).length)
        fd.append("measurement_parameters", JSON.stringify(measurementPayload));
    }

    if (cfg.defects) {
      const defectPayload = buildDefectPayload();
      if (Object.keys(defectPayload).length)
        fd.append("defect_parameters", JSON.stringify(defectPayload));
    }

    if (imageFile) fd.append("image", imageFile);

    try {
      const res = await axios.post(`${BASE}/dashboard/add-part`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Part added! ID: ${res.data.part_id}`, {
        position: "top-center", autoClose: 3000, style: toastStyles,
      });
      resetForm();
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add part.", {
        position: "top-center", autoClose: 3000, style: toastStyles,
      });
    }
  });

  // ----- bulk upload ----- (unchanged)
  const handleBulkUpload = guard(async () => {
    if (!uploadFile) { toast.error("Please select a CSV or Excel file first.", { style: toastStyles }); return; }
    if (!/\.(csv|xlsx)$/i.test(uploadFile.name)) {
      toast.error("Please upload only CSV or Excel files.", { style: toastStyles }); return;
    }
    setLoading(true);
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("mode_of_operation", bulkMode);
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
        `Uploaded ✅ parts: ${created_parts ?? 0}, with defects configured: ${linked_parts ?? 0}${errors?.length ? `, errors: ${errors.length}` : ""}`,
        { position: "top-center", autoClose: 4000, style: toastStyles },
      );
      fetchCategories();
    } catch (err) {
      toast.error(JSON.stringify(err.response?.data || err.message), { style: toastStyles });
    } finally {
      setLoading(false);
    }
  });

  const startTemplateDownload = async () => {
    try {
      const response = await fetch(
        `${BASE}/dashboard/bulk-upload-template?mode=${encodeURIComponent(bulkMode)}&t=${Date.now()}`,
        { method: "GET", cache: "no-store" },
      );
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const modeSlug = bulkMode.replace(/\s+/g, "");
      a.href = url;
      a.download = `TemplateBulkUpload_${modeSlug}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template.", { style: toastStyles });
    }
  };

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
            Select the mode of operation first — the template and every part in your file will use it.
          </Typography>

          <TextField
            select
            label="Mode of Operation *"
            value={bulkMode}
            onChange={(e) => setBulkMode(e.target.value)}
            sx={{ ...inputSx, minWidth: 220, mb: 1.5 }}
          >
            {MODES.map((m) => (
              <MenuItem key={m} value={m}>{m}</MenuItem>
            ))}
          </TextField>

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
              <Typography variant="body2">With defects configured: {uploadResult.linked_parts ?? 0}</Typography>
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
            Fields marked * are required. The mode of operation decides which parameters this part needs.
          </Typography>

          <Section title="Basic Information">
            <Stack spacing={2}>
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

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-start" }}>
                <TextField
                  fullWidth label="Add New Category" value={newCategory}
                  disabled={newCategoryDisabled}
                  onChange={(e) => (!isFormDisabled ? setNewCategory(e.target.value) : showAdminToast())}
                  onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                  helperText={selectedCategory ? "Clear the dropdown to add a new category" : " "}
                  sx={inputSx}
                />
                <Button variant="contained" color="primary" onClick={handleAddCategory}
                  disabled={newCategoryDisabled || !newCategory.trim()}
                  sx={{ whiteSpace: "nowrap", height: 44, ...persistentPrimary(theme) }}>
                  Add Category
                </Button>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField fullWidth label="Part Name *" value={partName} sx={inputSx}
                  onChange={(e) => (!isFormDisabled ? setPartName(e.target.value) : showAdminToast())} />
                <TextField fullWidth label="Part Code *" value={partCode} sx={inputSx}
                  onChange={(e) => (!isFormDisabled ? setPartCode(e.target.value) : showAdminToast())} />
              </Stack>

              <TextField select fullWidth label="Mode of Operation *" value={mode} sx={inputSx}
                helperText={MODE_HINT[mode] || " "}
                onChange={(e) => handleModeChange(e.target.value)}>
                {MODES.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>

              <TextField fullWidth label="Parts Metadata (optional)" value={partsMetadata} sx={inputSx}
                onChange={(e) => (!isFormDisabled ? setPartsMetadata(e.target.value) : showAdminToast())} />
            </Stack>
          </Section>

          <Divider sx={{ mb: 3 }} />

          {/* ----- Weight (Counting) ----- */}
          {cfg.weight && (
            <>
              <Section title="Weight">
                <TextField
                  label="Weight (g)" value={weight} sx={{ ...inputSx, maxWidth: 260 }}
                  inputProps={{ inputMode: "decimal" }}
                  onChange={(e) => nonNegative(e.target.value) && setWeight(e.target.value)}
                />
              </Section>
              <Divider sx={{ mb: 3 }} />
            </>
          )}

          {/* ----- Dimensions (subset per mode) ----- */}
          {hasFamilies && (
            <>
              <Section title="Part Parameters" subtitle="Add as many instances as this part has of each dimension — there's no limit.">
                {visibleFamilies.map((fam) => (
                  <Box key={fam.base} sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 2, mb: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
                        {fam.label}{fam.unit ? ` (${fam.unit})` : ""}
                      </Typography>
                      <Chip size="small"
                        label={`${families[fam.base].length} instance${families[fam.base].length > 1 ? "s" : ""}`}
                        sx={{ bgcolor: "accent.light" }} />
                    </Stack>

                    {families[fam.base].map((inst, i) => (
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
                      + Add another {fam.label.toLowerCase()} ({fam.base}{families[fam.base].length + 1})
                    </Button>
                  </Box>
                ))}
              </Section>
              <Divider sx={{ mb: 3 }} />
            </>
          )}

          {/* ----- Geometric Checks (Measurement) ----- */}
          {cfg.geometric && (
            <>
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
            </>
          )}

          {/* ----- Defects (Defect Detection) ----- */}
          {cfg.defects && (
            <>
              <Section title="Defects" subtitle="Add each defect this part should be checked for, with an optional confidence threshold.">
                {defects.map((d, i) => (
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
              </Section>
              <Divider sx={{ mb: 3 }} />
            </>
          )}

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
    </Box>
  );
};

export default AddNewPart;