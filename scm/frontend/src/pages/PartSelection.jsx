import React, { useEffect, useState } from "react";
import axios from "axios";
// import { toast, ToastContainer } from "react-toastify";
// import "react-toastify/dist/ReactToastify.css";
import { toast } from "react-toastify";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import {
  Box,
  Button,
  Typography,
  Select,
  MenuItem,
  FormControl,
  CircularProgress,
  TextField,
  Autocomplete,
  Paper,
  Divider,
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Chip,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import ClearIcon from "@mui/icons-material/Clear";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { BASE_URL } from "../api/baseUrl";
// const BASE_URL = import.meta.env.VITE_BASE_URL;

// Route the operator lands on after "Start Session", based on the
// selected part's actual mode_of_operation in the DB.
const SESSION_ROUTE = {
  Counting: "/counting",
  "Defect Detection": "/defect-detection",
  Measurement: "/measurement",
};

const PartSelection = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [partInput, setPartInput] = useState("");
  const [parts, setParts] = useState([]);
  const [partCount, setPartCount] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedPartDetails, setSelectedPartDetails] = useState(null);
  const [loading, setLoading] = useState(false);

  // Calibration config
  const [partsPerRun, setPartsPerRun] = useState(500);
  const [totalRuns, setTotalRuns] = useState(10);

  const navigate = useNavigate();
  const location = useLocation();

  const fromCalibration = location.state?.fromCalibration || false;
  const [pendingBarcodePart, setPendingBarcodePart] = useState(null);

  // The mode the operator clicked on the previous page (e.g. NewSession /
  // mode-selection). Shown immediately so they know what they're selecting
  // a part for, even before a part is picked.
  const intendedMode = location.state?.operationMode || null;

  // Real mode-of-operation comes from the selected part's DB record
  // (Counting / Defect Detection / Measurement) — takes over as the source
  // of truth once a part is actually selected.
  const partMode = selectedPartDetails?.mode_of_operation || null;
  const displayMode = partMode || intendedMode;

  useEffect(() => {
    if (pendingBarcodePart && parts.length > 0) {
      const match = parts.find(
        (p) => p.part_code === pendingBarcodePart.part_code,
      );
      if (match) {
        setSelectedPart(match);
        setPartInput(match.part_name);
        setSelectedPartDetails(pendingBarcodePart);
        toast.success(`Scanned: ${pendingBarcodePart.part_name}`);
        setPendingBarcodePart(null);
      }
    }
  }, [parts, pendingBarcodePart]);

  useEffect(() => {
    if (fromCalibration && location.state) {
      setSelectedCategory(location.state.category);
      setSelectedPart({
        part_code: location.state.partCode,
        part_name: location.state.partName,
        category: location.state.category,
        part_weight: location.state.partWeight,
      });
      setPartInput(location.state.partName);
      setSelectedPartDetails({
        part_code: location.state.partCode,
        part_name: location.state.partName,
        category: location.state.category,
        part_weight: location.state.partWeight,
        mode_of_operation: "Counting",
      });
    }
  }, [fromCalibration, location.state]);

  useEffect(() => {
    axios
      .get(`${BASE_URL}/dashboard/categories`, {
        params: intendedMode ? { mode_of_operation: intendedMode } : {},
      })
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, [intendedMode]);

  useEffect(() => {
    if (!selectedCategory) {
      setParts([]);
      setPartCount(null);
      if (!fromCalibration) {
        setSelectedPart(null);
        setPartInput("");
        setSelectedPartDetails(null);
      }
      return;
    }
    axios
      .get(`${BASE_URL}/dashboard/parts`, {
        params: {
          suggestion: "",
          category: selectedCategory,
          ...(intendedMode ? { mode_of_operation: intendedMode } : {}),
        },
      })
      .then((res) => setParts(res.data))
      .catch(() => setParts([]));

    axios
      .get(`${BASE_URL}/dashboard/part-count`, {
        params: {
          category: selectedCategory,
          ...(intendedMode ? { mode_of_operation: intendedMode } : {}),
        },
      })
      .then((res) => setPartCount(res.data.count))
      .catch(() => setPartCount(null));
  }, [selectedCategory, fromCalibration, intendedMode]);

  useEffect(() => {
    if (!fromCalibration || !parts.length || selectedPart) return;
    const match = parts.find((p) => p.part_code === location.state?.partCode);
    if (match) {
      setSelectedPart(match);
      setPartInput(match.part_name);
    }
  }, [parts, fromCalibration, location.state, selectedPart]);

  useEffect(() => {
    if (!selectedPart || fromCalibration) return;
    if (selectedPart?.part_code) {
      axios
        .get(`${BASE_URL}/dashboard/part-details`, {
          params: { part_code: selectedPart.part_code },
        })
        .then((res) => setSelectedPartDetails(res.data))
        .catch(() => setSelectedPartDetails(null));
    }
  }, [selectedPart, fromCalibration]);

  const scannerRef = React.useRef(null);
  const [code, setCode] = React.useState("");

  const handleScannerChange = (e) => {
    const newCode = scannerRef.current.value;
    if (e.key === "Enter") {
      handleBarcodeScanned(newCode);
      setCode("");
    }
    setCode(newCode);
  };

  useEffect(() => {
    const el = scannerRef.current;
    if (!el) return;
    el.focus();
    el.addEventListener("keydown", handleScannerChange);
    return () => el.removeEventListener("keydown", handleScannerChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCalibration]);

  const handleBarcodeScanned = async (scannedCode) => {
    try {
      const res = await axios.get(`${BASE_URL}/dashboard/part-details`, {
        params: { part_code: scannedCode },
      });
      const data = res.data;
      if (data?.part_name && data?.category) {
        setSelectedCategory(data.category);
        setPendingBarcodePart(data);
        setTimeout(() => {
          const match = parts.find((p) => p.part_code === data.part_code);
          if (match) {
            setSelectedPart(match);
            setPartInput(match.part_name);
            setSelectedPartDetails(data);
            toast.success(`Scanned: ${data.part_name}`);
          }
        }, 500);
      }
    } catch {
      toast.error("Barcode not found");
    }
  };

  const handleSelectPart = async () => {
    if (!selectedPart) return toast.warn("Please select a part first.");
    if (fromCalibration && (!partsPerRun || !totalRuns)) {
      return toast.warn("Please set valid calibration values");
    }
    if (!partMode) {
      return toast.warn("This part has no mode_of_operation set.");
    }

    setLoading(true);

    // Matches the actual backend signature: part_code + mode_of_operation.
    // No batching fields — this project is bulk-only.
    const params = {
      part_code: selectedPart?.part_code,
      mode_of_operation: partMode,
    };

    if (fromCalibration) {
      params["is_calibration"] = true;
    }

    try {
      const res = await axios.post(
        `${BASE_URL}/dashboard/create_session_and_start`,
        null,
        { params },
      );

      const targetRoute = SESSION_ROUTE[partMode] || "/counting";

      navigate(`${targetRoute}/${res.data.session_id}`, {
        state: {
          part_name: selectedPart?.part_name,
          partDetails: selectedPartDetails,
          operationMode: partMode,
          calibrationMode: fromCalibration,
          calibrationConfig: fromCalibration
            ? { partsPerRun, totalRuns }
            : null,
        },
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to start session");
    } finally {
      setLoading(false);
    }
  };

  // Flatten measurement_parameters into rows.
  // New schema shape: one flat object per family+instance key, e.g.
  //   { "length1": {"value":40.0,"min_value":39.5,"max_value":40.5,
  //                 "calibration_factor":1.002},
  //     "od1": {...} }
  // (No `camera` field anymore; `value` and `calibration_factor` are new.)
  const measurementRows = React.useMemo(() => {
    const mp = selectedPartDetails?.measurement_parameters;
    if (!mp || typeof mp !== "object") return [];
    return Object.entries(mp).map(([paramName, limit]) => ({
      key: paramName,
      parameter: paramName, // e.g. "length1", "od1"
      value: limit?.value,
      min_value: limit?.min_value,
      max_value: limit?.max_value,
      calibration_factor: limit?.calibration_factor,
    }));
  }, [selectedPartDetails]);

  // Defect names now come from defect_parameters (config), shaped
  //   { "d1": {"defect_name":"dent","confidence_threshold":0.6}, "d2": {...} }
  // so the human-readable name is nested, not the key.
  const defectNames = selectedPartDetails?.defect_parameters
    ? Object.values(selectedPartDetails.defect_parameters)
        .map((d) => d?.defect_name)
        .filter(Boolean)
    : [];

  const detailRows = [
    { label: "Category", value: selectedPartDetails?.category },
    { label: "Part Code", value: selectedPartDetails?.part_code },
    { label: "Part Name", value: selectedPartDetails?.part_name },
    { label: "Mode", value: partMode },
  ];

  const modeChipColor =
    displayMode === "Counting"
      ? "primary"
      : displayMode === "Defect Detection"
        ? "warning"
        : displayMode === "Measurement"
          ? "info"
          : "default";

  return (
    <Box
      sx={{
        minHeight: "100%",
        height: "100%",
        overflowY: "auto",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        p: { xs: 1.5, sm: 3 },
        "&::-webkit-scrollbar": { width: "10px" },
        "&::-webkit-scrollbar-track": {
          backgroundColor: "background.default",
          borderRadius: "10px",
        },
        "&::-webkit-scrollbar-thumb": {
          backgroundColor: "primary.light",
          borderRadius: "10px",
          "&:hover": { backgroundColor: "primary.main" },
        },
        scrollbarWidth: "thin",
        scrollbarColor: (t) => `${t.palette.primary.light} ${t.palette.background.default}`,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 1300,
          p: { xs: 2.5, sm: 4, md: 5 },
          my: { xs: 1, sm: 2 },
          borderRadius: 3,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        {/* Header */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
            {fromCalibration ? "Machine Calibration" : "Select Part"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose a category and part to begin.
          </Typography>
        </Box>

        {/* Mode indicator — always visible so the operator knows what
            they're selecting a part for */}
        {!fromCalibration && displayMode && (
          <Box sx={{ mb: 3 }}>
            <Chip
              label={`Mode: ${displayMode}`}
              color={modeChipColor}
              sx={{ fontWeight: 700, fontSize: 13, px: 1.5, py: 2 }}
            />
            {selectedPart && partMode && intendedMode && partMode !== intendedMode && (
              <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5 }}>
                Warning: this part is configured for {partMode}, but you started from{" "}
                {intendedMode} mode.
              </Typography>
            )}
          </Box>
        )}

        {!fromCalibration && (
          <Box
            sx={{
              border: "2px dashed",
              borderColor: "primary.main",
              p: { xs: 1.5, sm: 2.5 },
              mb: 3,
              borderRadius: 2,
              bgcolor: "secondary.main",
              textAlign: "center",
            }}
          >
            <Typography sx={{ color: "#fff", fontWeight: 600 }}>
              Scan the barcode for the item
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            gap: { xs: 2, md: 4 },
          }}
        >
          <Box sx={{ flex: 1.2, minWidth: 0 }}>
            <Typography sx={{ mb: 1, fontWeight: 600 }}>
              Part Category
            </Typography>
            <FormControl fullWidth sx={{ mb: 2.5 }}>
              <Select
                value={selectedCategory || ""}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={fromCalibration}
              >
                <MenuItem value="">-- Choose Category --</MenuItem>
                {categories.map((cat, i) => (
                  <MenuItem key={i} value={cat}>
                    {cat}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {!fromCalibration && selectedCategory && partCount !== null && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Total parts in <b>{selectedCategory}</b>: {partCount}
              </Typography>
            )}

            <Typography sx={{ mb: 1, fontWeight: 600 }}>Part Name</Typography>
            <Autocomplete
              freeSolo
              fullWidth
              disabled={!selectedCategory || fromCalibration}
              options={parts}
              getOptionLabel={(option) => option.part_name}
              getOptionKey={(option) => option.part_code}
              value={selectedPart || null}
              inputValue={partInput}
              onInputChange={(e, v) => setPartInput(v)}
              onChange={(e, v) => {
                setSelectedPart(v || null);
                setPartInput(v || "");
              }}
              filterOptions={(options, { inputValue }) => {
                const input = inputValue.toLowerCase();
                return options.filter(
                  (option) =>
                    option.part_name.toLowerCase().includes(input) ||
                    option.part_code.toLowerCase().includes(input),
                );
              }}
              renderInput={(params) => (
                <TextField {...params} placeholder="Type part name or code" />
              )}
              popupIcon={<ArrowDropDownIcon />}
              clearIcon={<ClearIcon />}
              sx={{ mb: 2.5 }}
            />

            <Typography sx={{ mb: 1, fontWeight: 600 }}>
              Scan Part Code
            </Typography>
            <TextField
              inputRef={scannerRef}
              fullWidth
              placeholder="Waiting for scan..."
            />
          </Box>

          {/* RIGHT COLUMN: image box + buttons stacked, same width, side by side buttons */}
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                border: "1px dashed",
                borderColor: "divider",
                borderRadius: 2,
                bgcolor: "peach.main",
                minHeight: { xs: 160, md: 220 },
              }}
            >
              <Typography color="text.secondary">
                <CameraAltIcon fontSize="small" /> Upload item image
              </Typography>
            </Box>

            <Box sx={{ display: "flex", gap: 2 }}>
              <Button
                variant="outlined"
                color="secondary"
                fullWidth
                onClick={() => navigate(-1)}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={handleSelectPart}
                disabled={
                  loading ||
                  !selectedPart ||
                  (fromCalibration && (!partsPerRun || !totalRuns))
                }
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : fromCalibration ? (
                  "Start Calibration"
                ) : (
                  "Start Session"
                )}
              </Button>
            </Box>
          </Box>
        </Box>

        {/* CALIBRATION INPUTS */}
        {fromCalibration && (
          <Box
            sx={{
              mt: 4,
              p: { xs: 2, sm: 4 },
              bgcolor: "#EFFAF1",
              borderRadius: 2,
              border: "1px solid",
              borderColor: "success.main",
            }}
          >
            <Typography variant="h6" sx={{ mb: 3, color: "success.main", fontWeight: 700 }}>
              Calibration Test Configuration
            </Typography>
            <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 3 }}>
              <TextField
                fullWidth
                label="Total Parts per Run"
                type="number"
                value={partsPerRun}
                onChange={(e) => {
                  const val = e.target.value === "" ? "" : Number(e.target.value);
                  if (val === "" || (val >= 1 && val <= 500)) setPartsPerRun(val);
                }}
                helperText="Max 500"
                inputProps={{ min: 1, max: 500 }}
              />
              <TextField
                fullWidth
                label="Number of Runs"
                type="number"
                value={totalRuns}
                onChange={(e) => {
                  const val = e.target.value === "" ? "" : Number(e.target.value);
                  if (val === "" || (val >= 1 && val <= 15)) setTotalRuns(val);
                }}
                helperText="Max 15"
                inputProps={{ min: 1, max: 15 }}
              />
            </Box>
            <Typography sx={{ mt: 2, fontWeight: 600, color: "primary.main" }}>
              Will run <strong>{totalRuns || 0}</strong> ×{" "}
              <strong>{partsPerRun || 0}</strong> parts
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 4 }} />

        {/* PART DETAILS — table, mode-aware rows driven by the selected part's DB record */}
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
          Part Details
        </Typography>
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}
        >
          <Table size={isMobile ? "small" : "medium"}>
            <TableBody>
              {detailRows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell
                    sx={{
                      width: { xs: "40%", sm: "30%" },
                      fontWeight: 600,
                      bgcolor: "background.default",
                    }}
                  >
                    {row.label}
                  </TableCell>
                  <TableCell>{row.value ?? "—"}</TableCell>
                </TableRow>
              ))}

              {partMode === "Counting" && (
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, bgcolor: "background.default" }}>
                    Part Weight
                  </TableCell>
                  <TableCell>
                    {selectedPartDetails?.part_weight != null
                      ? `${selectedPartDetails.part_weight} g (per piece)`
                      : "—"}
                  </TableCell>
                </TableRow>
              )}

              {partMode === "Defect Detection" && (
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, bgcolor: "background.default" }}>
                    Defects to Check
                  </TableCell>
                  <TableCell>
                    {defectNames.length > 0 ? (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                        {defectNames.map((d) => (
                          <Chip key={d} label={d} size="small" color="warning" variant="outlined" />
                        ))}
                      </Box>
                    ) : (
                      "No defects configured for this part yet"
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {partMode === "Measurement" && (
          <>
            <Typography variant="h6" sx={{ mt: 4, mb: 2, fontWeight: 700 }}>
              Measurement Parameters
            </Typography>
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}
            >
              <Table size={isMobile ? "small" : "medium"}>
                <TableBody>
                  {measurementRows.length > 0 ? (
                    measurementRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell sx={{ fontWeight: 600, bgcolor: "background.default", width: { xs: "40%", sm: "30%" } }}>
                          {row.parameter}
                        </TableCell>
                        <TableCell>
                          Value: {row.value ?? "—"} &nbsp;|&nbsp; Min: {row.min_value ?? "—"} &nbsp;|&nbsp; Max: {row.max_value ?? "—"}
                          {row.calibration_factor != null && <> &nbsp;|&nbsp; Cal: {row.calibration_factor}</>}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} sx={{ color: "text.secondary" }}>
                        No measurement parameters configured for this part yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>
      {/* <ToastContainer position="top-right" autoClose={3000} /> */}
    </Box>
  );
};

export default PartSelection;