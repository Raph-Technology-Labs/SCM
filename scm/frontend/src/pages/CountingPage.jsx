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
  Fade,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import ScaleIcon from "@mui/icons-material/Scale";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import TagIcon from "@mui/icons-material/Tag";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { useSession } from "../context/SessionContext";

const BASE_URL = import.meta.env.VITE_BASE_URL;

const STATUS = {
  READY: { label: "READY", dot: "#ca8a04", bg: "#FEF9E7" },
  RUNNING: { label: "RUNNING", dot: "#16a34a", bg: "#EAF7EE" },
  STOPPED: { label: "STOPPED", dot: "#dc2626", bg: "#FCEAEA" },
};

const MOCK_SESSION = {
  part_code: "PC-1001",
  part_name: "Sample Bolt M6",
  part_weight: 4.0,
  count: 128,
  total_weight: 512.4,
  session_start: new Date().toISOString(),
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

const CountingPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { sessionId } = useParams();
  const location = useLocation();

  const [status, setStatus] = useState("READY");
  const [count, setCount] = useState(0);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [usingMockData, setUsingMockData] = useState(false);
  const [previewFrame, setPreviewFrame] = useState(null);

  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { setActiveSession, clearActiveSession } = useSession();

  useEffect(() => {
    const forwarded = location.state?.partDetails;
    const forwardedName = location.state?.part_name;

    if (forwarded) {
      setSessionInfo({
        part_code: forwarded.part_code,
        part_name: forwardedName || forwarded.part_name,
        part_weight: forwarded.part_weight,
        count: 0,
        total_weight: null,
        session_start: new Date().toISOString(),
      });
      return;
    }

    axios
      .get(`${BASE_URL}/dashboard/session/${sessionId}/details`)
      .then((res) => {
        setSessionInfo(res.data);
        setCount(res.data.count || 0);
      })
      .catch(() => {
        setSessionInfo(MOCK_SESSION);
        setCount(MOCK_SESSION.count);
        setUsingMockData(true);
        toast.warn("No matching session found — showing preview data");
      });
  }, [sessionId, location.state]);

  // Self-scheduling loop (not a fixed setInterval) — each capture waits for
  // the previous one to finish before firing the next. A fixed interval
  // would fire a new /capture every 1s regardless of whether the last one
  // (camera read + inference) had returned yet, and since the backend
  // serializes captures per session, that backlog compounds into growing
  // lag rather than a steady live feed.
  useEffect(() => {
    if (status !== "RUNNING" || usingMockData) return;
    let cancelled = false;
    let timeoutId;

    const tick = () => {
      axios
        .post(`${BASE_URL}/dashboard/session/${sessionId}/capture`)
        .then((res) => {
          if (cancelled) return;
          setCount(res.data.count);
          if (res.data.frame) setPreviewFrame(`data:image/jpeg;base64,${res.data.frame}`);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) timeoutId = setTimeout(tick, 200);
        });
    };
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [sessionId, status, usingMockData]);

  // Safety: if this page unmounts (e.g. component removed for any reason)
  // while a session it registered is still active, clear it so the guard
  // dialog doesn't fire for a session that's no longer being viewed.
  useEffect(() => {
    return () => {
      if (status === "RUNNING") clearActiveSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleStart = () => {
    setStatus("RUNNING");
    setActiveSession({ sessionId: Number(sessionId), mode: "Counting" });
    toast.success("Counting started");
  };

  // Pure save-to-DB logic — no confirmation inside it. Both the manual Stop
  // button and Layout's centralized nav-guard dialog call this after their
  // own confirm step resolves to true.
  const stopSession = async () => {
    if (!usingMockData) {
      await axios.post(`${BASE_URL}/dashboard/stop`, { session_id: Number(sessionId) });
      toast.success("Session stopped and saved successfully");
    } else {
      toast.info("Preview session stopped");
    }
    clearActiveSession();
    setStatus("STOPPED");
    setPreviewFrame(null);
  };

  const handleStop = async () => {
    const confirmed = await confirm("Stop counting and end this session?");
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

  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, width: "100%" }}>
      {usingMockData && (
        <Chip
          label="Preview mode — no matching session in DB, showing mock data"
          size="small"
          sx={{ mb: 2, bgcolor: "#fff3e0", color: "#e65100", fontWeight: 600 }}
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
            Counting Mode
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
            <TagIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
              Session #{sessionId}
            </Typography>
          </Box>
        </Box>
        <StatusPill status={status} />
      </Box>

      {/* MAIN CONTENT */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: { xs: 3, md: 6 },
          alignItems: "stretch",
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

            {status === "RUNNING" && (
              <Box
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: "2px",
                  bgcolor: "success.main",
                  boxShadow: "0 0 12px 2px rgba(22,163,74,0.7)",
                  animation: "scan 2.4s linear infinite",
                  "@keyframes scan": {
                    "0%": { top: "6%" },
                    "50%": { top: "94%" },
                    "100%": { top: "6%" },
                  },
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
              onClick={handleStart}
              disabled={status !== "READY"}
            >
              Start
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

        {/* RIGHT: Info Cards — order: Part Image, Counter, Session Details */}
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
                minHeight: 180,
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
                  style={{ maxHeight: 180, maxWidth: "100%", objectFit: "contain" }}
                />
              ) : (
                <Typography color="text.secondary" variant="body2">
                  <CameraAltIcon fontSize="small" /> No image available
                </Typography>
              )}
            </Box>
          </Paper>

          {/* Counter */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.5,
              backgroundImage: (t) => t.palette.gradients?.subtle,
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 800, color: "text.secondary", letterSpacing: 2 }}>
              TOTAL COUNT
            </Typography>
            <Fade in key={count} timeout={300}>
              <Typography
                sx={{
                  fontSize: { xs: 52, sm: 64 },
                  fontWeight: 800,
                  color: "primary.main",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {count}
              </Typography>
            </Fade>
            {sessionInfo?.total_weight != null && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1 }}>
                <ScaleIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {sessionInfo.total_weight} g total
                </Typography>
              </Box>
            )}
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
              <Typography variant="body2">
                <b>Part Weight:</b>{" "}
                {sessionInfo?.part_weight != null ? `${sessionInfo.part_weight} g` : "—"}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  Started at {startedAt}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Box>
      </Box>
      {ConfirmDialog}
    </Box>
  );
};

export default CountingPage;