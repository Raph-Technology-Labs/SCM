import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useParams, useLocation } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableContainer,
} from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import TagIcon from "@mui/icons-material/Tag";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import StraightenIcon from "@mui/icons-material/Straighten";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { useSession } from "../context/SessionContext";

const BASE_URL = import.meta.env.VITE_BASE_URL;

const STATUS = {
  READY: { label: "READY", dot: "#ca8a04", bg: "#FEF9E7" },
  RUNNING: { label: "RUNNING", dot: "#16a34a", bg: "#EAF7EE" },
  STOPPED: { label: "STOPPED", dot: "#dc2626", bg: "#FCEAEA" },
};

const StatusPill = ({ status }) => {
  const s = STATUS[status];
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 2,
        py: 0.75,
        borderRadius: 999,
        bgcolor: s.bg,
        border: `1px solid ${s.dot}33`,
      }}
    >
      <Box
        sx={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          bgcolor: s.dot,
          ...(status === "RUNNING" && {
            animation: "pulseDot 1.4s ease-in-out infinite",
          }),
          "@keyframes pulseDot": {
            "0%": { boxShadow: `0 0 0 0 ${s.dot}66` },
            "70%": { boxShadow: `0 0 0 8px ${s.dot}00` },
            "100%": { boxShadow: `0 0 0 0 ${s.dot}00` },
          },
        }}
      />
      <Typography sx={{ fontWeight: 700, fontSize: 13, color: s.dot, letterSpacing: 0.5 }}>
        {s.label}
      </Typography>
    </Box>
  );
};

const ResultChip = ({ result }) => {
  if (result === null) {
    return <Chip label="PENDING" size="small" variant="outlined" sx={{ fontWeight: 700 }} />;
  }
  return result === "OK" ? (
    <Chip label="OK" size="small" color="success" sx={{ fontWeight: 700 }} />
  ) : (
    <Chip label="NOK" size="small" color="error" sx={{ fontWeight: 700 }} />
  );
};

const MeasurementPage = () => {
  const { sessionId } = useParams();
  const location = useLocation();

  const [status, setStatus] = useState("READY");
  const [sessionInfo, setSessionInfo] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [measuredValues, setMeasuredValues] = useState({});
  const [previewFrame, setPreviewFrame] = useState(null);
  const [capturing, setCapturing] = useState(false);

  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { setActiveSession, clearActiveSession } = useSession();

  useEffect(() => {
    const forwarded = location.state?.partDetails;
    const forwardedName = location.state?.part_name;

    if (forwarded) {
      setSessionInfo({
        part_code: forwarded.part_code,
        part_name: forwardedName || forwarded.part_name,
        session_start: new Date().toISOString(),
        image_url: forwarded.image_url || null,
        measurement_parameters: forwarded.measurement_parameters || null,
      });
      return;
    }

    axios
      .get(`${BASE_URL}/dashboard/session/${sessionId}/details`)
      .then(async (res) => {
        const part = await axios.get(`${BASE_URL}/dashboard/part-details`, {
          params: { part_code: res.data.part_code },
        });
        setSessionInfo({
          ...res.data,
          image_url: part.data.image_url || null,
          measurement_parameters: part.data.measurement_parameters,
        });
        setLoadError(false);
      })
      .catch((err) => {
        setLoadError(true);
        toast.error(err.response?.data?.detail || `Session #${sessionId} could not be loaded`);
      });
  }, [sessionId, location.state]);

  const paramRows = React.useMemo(() => {
    const mp = sessionInfo?.measurement_parameters;
    if (!mp || typeof mp !== "object") return [];
    return Object.entries(mp).flatMap(([paramName, limits]) =>
      (Array.isArray(limits) ? limits : [limits]).map((limit, idx) => ({
        key: `${paramName}-${idx}`,
        parameter: paramName,
        min_value: limit?.min_value,
        max_value: limit?.max_value,
        camera: limit?.camera,
      })),
    );
  }, [sessionInfo]);

  // One capture -> infer -> measure -> result cycle per button press
  // (not continuous), unlike Counting's polling loop.
  const handleCapture = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      const res = await axios.post(`${BASE_URL}/dashboard/session/${sessionId}/capture`);
      const features = res.data?.features || {};
      setMeasuredValues((prev) => {
        const next = { ...prev };
        paramRows.forEach((row) => {
          const measured = features[row.parameter]?.value_mm;
          if (measured != null) next[row.key] = measured;
        });
        return next;
      });
      if (res.data?.frame) setPreviewFrame(`data:image/jpeg;base64,${res.data.frame}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Capture failed");
    } finally {
      setCapturing(false);
    }
  };

  useEffect(() => {
    return () => {
      if (status === "RUNNING") clearActiveSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleStart = () => {
    setStatus("RUNNING");
    setActiveSession({ sessionId: Number(sessionId), mode: "Measurement" });
    toast.success("Measurement started");
    handleCapture();
  };

  const stopSession = async () => {
    await axios.post(`${BASE_URL}/dashboard/stop`, { session_id: Number(sessionId) });
    toast.success("Session stopped and saved successfully");
    clearActiveSession();
    setStatus("STOPPED");
    setPreviewFrame(null);
  };

  const handleStop = async () => {
    const confirmed = await confirm("Stop measurement and end this session?");
    if (!confirmed) return;
    try {
      await stopSession();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to stop session");
    }
  };

  const startedAt = sessionInfo?.session_start
    ? new Date(sessionInfo.session_start).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--";

  const displayRows = paramRows.map((row) => {
    const measured = measuredValues[row.key];
    let result = null;
    if (measured != null) {
      result = measured >= row.min_value && measured <= row.max_value ? "OK" : "NOK";
    }
    return { ...row, measured: measured ?? null, result };
  });

  const overallResult =
    displayRows.length > 0 && displayRows.every((r) => r.result != null)
      ? displayRows.every((r) => r.result === "OK")
        ? "OK"
        : "NOK"
      : null;

  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, width: "100%" }}>
      {loadError && (
        <Chip
          label={`Session #${sessionId} could not be loaded — check the session ID and try again`}
          size="small"
          sx={{ mb: 2, bgcolor: "#FCEAEA", color: "#b91c1c", fontWeight: 600 }}
        />
      )}

      {/* TOP BAR */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          gap: 1.5,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>
            Measurement
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
            <TagIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
              Session #{sessionId}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          {overallResult && <ResultChip result={overallResult} />}
          <StatusPill status={status} />
        </Box>
      </Box>

      {/* MAIN CONTENT — camera left, image + session details right */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: { xs: 3, md: 6 },
          alignItems: "stretch",
          mb: 4,
        }}
      >
        {/* LEFT: Camera feed + Buttons */}
        <Box sx={{ flex: "1 1 70%", display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
          <Paper
            elevation={0}
            sx={{
              position: "relative",
              overflow: "hidden",
              minHeight: { xs: 300, sm: 400, md: 480 },
              borderRadius: 3,
              border: "1px solid",
              borderColor: status === "RUNNING" ? "success.main" : "divider",
              bgcolor: "#0B0F14",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-color 0.3s ease",
            }}
          >
            {!(status === "RUNNING" && previewFrame) && (
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
                  backgroundSize: "28px 28px",
                }}
              />
            )}

            {status === "RUNNING" && previewFrame && (
              <img
                src={previewFrame}
                alt="Live camera feed"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            )}

            {!(status === "RUNNING" && previewFrame) && (
              <Box sx={{ position: "relative", textAlign: "center", zIndex: 1 }}>
                <VideocamIcon
                  sx={{
                    fontSize: 56,
                    color: status === "RUNNING" ? "success.light" : "grey.600",
                    mb: 1,
                    transition: "color 0.3s ease",
                  }}
                />
                <Typography sx={{ color: "grey.300", fontWeight: 600, fontSize: 16 }}>
                  {status === "RUNNING" ? "Camera streaming…" : "Live Camera Feed"}
                </Typography>
                <Typography sx={{ color: "grey.500", fontSize: 13, mt: 0.5 }}>
                  (Waiting for Vision System)
                </Typography>
              </Box>
            )}

            {status === "RUNNING" && (
              <Chip
                label="● LIVE"
                size="small"
                sx={{
                  position: "absolute",
                  top: 14,
                  left: 14,
                  bgcolor: "rgba(220,38,38,0.15)",
                  color: "#f87171",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              />
            )}
          </Paper>

          <Box sx={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayArrowIcon />}
              sx={{
                width: { xs: "100%", sm: 160 },
                height: 48,
                fontWeight: 700,
                boxShadow: "none",
                "&:hover": { boxShadow: 2 },
              }}
              onClick={status === "READY" ? handleStart : handleCapture}
              disabled={status === "STOPPED" || capturing || !sessionInfo}
            >
              {status === "READY" ? "Start" : capturing ? "Capturing…" : "Capture"}
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={<StopIcon />}
              sx={{
                width: { xs: "100%", sm: 160 },
                height: 48,
                fontWeight: 700,
                boxShadow: "none",
                "&:hover": { boxShadow: 2 },
              }}
              onClick={handleStop}
              disabled={status !== "RUNNING"}
            >
              Stop
            </Button>
          </Box>
        </Box>

        {/* RIGHT: Part Image, Session Details, Overall Result */}
        <Box
          sx={{
            flex: "1 1 30%",
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
            minWidth: { xs: "100%", md: 300 },
          }}
        >
          {/* Part Image */}
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Inventory2Icon sx={{ fontSize: 18, color: "primary.main" }} />
              <Typography sx={{ color: "primary.main", fontWeight: 700, fontSize: 14 }}>
                PART IMAGE
              </Typography>
            </Box>
            <Box
              sx={{
                minHeight: 160,
                borderRadius: 2,
                border: "1px dashed",
                borderColor: "divider",
                bgcolor: "peach.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {sessionInfo?.image_url ? (
                <img
                  src={`${BASE_URL}${sessionInfo.image_url}`}
                  alt={sessionInfo.part_name}
                  style={{ maxHeight: 160, maxWidth: "100%", objectFit: "contain" }}
                />
              ) : (
                <Typography color="text.secondary" variant="body2">
                  <CameraAltIcon fontSize="small" /> No image available
                </Typography>
              )}
            </Box>
          </Paper>

          {/* Session Details */}
          <Paper
            elevation={0}
            sx={{ p: 2.5, borderRadius: 3, border: "1px solid", borderColor: "divider" }}
          >
            <Typography sx={{ color: "primary.main", fontWeight: 700, fontSize: 14, mb: 1.5 }}>
              SESSION DETAILS
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              <Typography variant="body2">
                <b>Part Name:</b> {sessionInfo?.part_name || "—"}
              </Typography>
              <Typography variant="body2">
                <b>Part Code:</b> {sessionInfo?.part_code || "—"}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  Started at {startedAt}
                </Typography>
              </Box>
            </Box>
          </Paper>

          {overallResult && (
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 3,
                border: "1px solid",
                borderColor: overallResult === "OK" ? "success.main" : "error.main",
                bgcolor: overallResult === "OK" ? "#EAF7EE" : "#FCEAEA",
                textAlign: "center",
              }}
            >
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 13,
                  letterSpacing: 1.5,
                  color: overallResult === "OK" ? "success.main" : "error.main",
                  mb: 0.5,
                }}
              >
                OVERALL RESULT
              </Typography>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 28,
                  color: overallResult === "OK" ? "success.main" : "error.main",
                }}
              >
                {overallResult}
              </Typography>
            </Paper>
          )}
        </Box>
      </Box>

      {/* MEASUREMENT PARAMETERS — full width table, driven by measurement_parameters */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <StraightenIcon sx={{ fontSize: 20, color: "primary.main" }} />
          <Typography sx={{ color: "primary.main", fontWeight: 700, fontSize: 15 }}>
            MEASUREMENT PARAMETERS
          </Typography>
        </Box>

        {displayRows.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "background.default" }}>
                    Parameter
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "background.default" }}>Min</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "background.default" }}>Max</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "background.default" }}>
                    Measured
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "background.default" }}>
                    Camera
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "background.default" }}>
                    Result
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell sx={{ fontWeight: 600 }}>{row.parameter}</TableCell>
                    <TableCell>{row.min_value ?? "—"}</TableCell>
                    <TableCell>{row.max_value ?? "—"}</TableCell>
                    <TableCell>{row.measured ?? "—"}</TableCell>
                    <TableCell>{row.camera ?? "—"}</TableCell>
                    <TableCell>
                      <ResultChip result={row.result} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
            No measurement parameters configured for this part.
          </Typography>
        )}
      </Paper>
      {ConfirmDialog}
    </Box>
  );
};

export default MeasurementPage;