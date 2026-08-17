import { useState } from "react";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from "@mui/material";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import Sidebar from "./Sidebar";
import { useSession } from "../context/SessionContext";
import { BASE_URL as BASE } from "../api/baseUrl";
// const BASE_URL = import.meta.env.VITE_BASE_URL;

// Any path under these prefixes is a "live session" page that needs guarding.
const SESSION_PATH_PREFIXES = ["/counting", "/defect-detection", "/measurement"];

export default function Layout({ loginData, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeSession, clearActiveSession } = useSession();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [nextPath, setNextPath] = useState(null);
  const [stopping, setStopping] = useState(false);

  const onSessionPage = SESSION_PATH_PREFIXES.some((p) => location.pathname.startsWith(p));

  const handleNavigate = (path) => {
    // Only guard if we're currently ON a session page AND that session is
    // actually running — matches the old project's
    // `location.pathname.startsWith("/counting")` check, generalized.
    if (onSessionPage && activeSession?.sessionId) {
      setNextPath(path);
      setConfirmOpen(true);
      return;
    }

    if (path === "/signout") {
      onLogout();
      navigate("/login", { replace: true });
      return;
    }
    navigate(path);
  };

  const handleConfirmLeave = async () => {
    setStopping(true);
    try {
      if (activeSession?.sessionId) {
        await axios.post(`${BASE_URL}/dashboard/stop`, {
          session_id: activeSession.sessionId,
        });
      }
    } catch (err) {
      console.error("Failed to stop session:", err);
    } finally {
      clearActiveSession();
      setStopping(false);
      setConfirmOpen(false);

      if (nextPath === "/signout") {
        onLogout();
        navigate("/login", { replace: true });
      } else {
        navigate(nextPath);
      }
    }
  };

  const handleCancelLeave = () => setConfirmOpen(false);

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <Sidebar loginData={loginData} onNavigate={handleNavigate} />
      <Box sx={{ flex: 1, overflowY: "auto", bgcolor: "background.default" }}>
        <Outlet />
      </Box>

      {/* Central confirm-leave dialog — same pattern as the old project's
          ConfirmLeaveDialog, generalized for Counting/Defect/Measurement */}
      <Dialog
        open={confirmOpen}
        onClose={handleCancelLeave}
        PaperProps={{ sx: { borderRadius: 2, p: 1, minWidth: 400 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: "error.main" }}>
          ⚠️ Warning
        </DialogTitle>
        <DialogContent>
          <Typography>
            Do you want to stop the {(activeSession?.mode || "current").toLowerCase()}{" "}
            session and leave this page? Data collected so far will be saved.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCancelLeave} disabled={stopping} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmLeave}
            disabled={stopping}
            sx={{ textTransform: "none" }}
          >
            {stopping ? "Stopping..." : "Stop & Leave"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}