import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Button, TextField, Typography, Paper, IconButton, InputAdornment, CircularProgress,
} from "@mui/material";
import { Visibility, VisibilityOff, LockOutlined, PersonOutlined } from "@mui/icons-material";

const BASE = import.meta.env.VITE_BASE_URL || "http://localhost:8000";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await res.json();
        onLogin(data);
        navigate("/");
      } else {
        const err = await res.json();
        setError(err.detail || "Login failed");
      }
    } catch {
      setError("Could not connect to backend");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setError("");
    setInfo("Please contact your administrator to reset your password.");
    setTimeout(() => setInfo(""), 4000);
  };

  return (
    <Box sx={{ height: "100vh", display: "flex" }}>
      {/* LEFT — branded panel */}
      <Box
        sx={{
          flex: 1,
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          color: "#fff",
          background: "linear-gradient(135deg, #8e1414 0%, #b71c1c 60%, #d32f2f 100%)",
          p: 6,
        }}
      >
        <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: 1 }}>
          SCM
        </Typography>
        <Typography sx={{ mt: 1, opacity: 0.9 }}>
          Smart Counting & Inspection
        </Typography>
        <Box
          sx={{
            mt: 5, width: "70%", height: "45%",
            border: "2px dashed rgba(255,255,255,0.4)", borderRadius: 3,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Typography sx={{ opacity: 0.8 }}>Machine image</Typography>
        </Box>
        <Typography variant="caption" sx={{ mt: 4, opacity: 0.7 }}>
          Raph Technology Labs
        </Typography>
      </Box>

      {/* RIGHT — login form */}
      <Box
        sx={{
          flex: 1, display: "flex", justifyContent: "center", alignItems: "center",
          bgcolor: "background.default", p: 3,
        }}
      >
        <Paper
          elevation={0}
          sx={{ width: 440, maxWidth: "100%", p: 5, borderRadius: 3, border: "1px solid #E5E7EB" }}
        >
          <Box sx={{ height: 4, width: 56, bgcolor: "primary.main", borderRadius: 2, mb: 3 }} />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Welcome back</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Sign in to continue to SCM
          </Typography>

          {error && (
            <Box sx={{ mb: 2, p: 1.4, borderRadius: 1, bgcolor: "#FEE2E2", color: "error.main", fontSize: 14 }}>
              {error}
            </Box>
          )}
          {info && (
            <Box sx={{ mb: 2, p: 1.4, borderRadius: 1, bgcolor: "#FFF7E0", color: "#7a5c00", fontSize: 14 }}>
              {info}
            </Box>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              label="Username" fullWidth margin="normal" size="medium" value={username}
              onChange={(e) => setUsername(e.target.value)} required
              InputProps={{ startAdornment: (<InputAdornment position="start"><PersonOutlined fontSize="small" /></InputAdornment>) }}
            />
            <TextField
              label="Password" fullWidth margin="normal" size="medium" required
              type={showPassword ? "text" : "password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                startAdornment: (<InputAdornment position="start"><LockOutlined fontSize="small" /></InputAdornment>),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword((p) => !p)}
                      edge="end"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1, mb: 2 }}>
              <Typography
                variant="body2"
                onClick={handleForgotPassword}
                sx={{
                  color: "primary.main",
                  cursor: "pointer",
                  fontWeight: 500,
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Forgot Password?
              </Typography>
            </Box>

            <Button
              type="submit" variant="contained" color="primary" fullWidth disabled={loading}
              sx={{ py: 1.4, fontWeight: 700, fontSize: 16 }}
            >
              {loading ? <CircularProgress size={24} sx={{ color: "#fff" }} /> : "Sign in"}
            </Button>
          </form>
        </Paper>
      </Box>
    </Box>
  );
}