import { useEffect, useState } from "react";
import { Box, Chip, Typography, Paper, CircularProgress, Stack, Button } from "@mui/material";
import axios from "axios";

const BASE = import.meta.env.VITE_BASE_URL || "";

const HealthCheck = () => {
  const [loading, setLoading] = useState(true);
  const [cameraOnline, setCameraOnline] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealthStatus = async () => {
    try {
      const res = await axios.get(`${BASE}/dashboard/health-check`);
      setCameraOnline(!!res.data?.Camera);
      setLastChecked(new Date());
    } catch (err) {
      setCameraOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthStatus();
    const interval = setInterval(fetchHealthStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{ minHeight: "100vh", width: "100%", flex: 1, overflowY: "auto", bgcolor: "background.default" }}>
      <Box sx={{
        maxWidth: 700, mx: "auto", px: { xs: 1.5, sm: 3 }, py: { xs: 4, md: 6 },
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: "text.primary", mb: 0.5 }}>
          Health Diagnosis
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 4 }}>
          Live connectivity status for connected hardware.
        </Typography>

        <Paper elevation={0} sx={{
          p: { xs: 3, sm: 4 }, width: "100%", borderRadius: 2,
          border: 1, borderColor: "divider", bgcolor: "background.paper",
        }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress color="primary" />
            </Box>
          ) : (
            <Stack spacing={3} alignItems="center">
              <Box
                sx={{
                  width: 96, height: 96, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  bgcolor: cameraOnline ? "#E8F5E9" : "#FDECEA",
                  border: "3px solid",
                  borderColor: cameraOnline ? "success.main" : "error.main",
                  fontSize: 40,
                }}
              >
                📷
              </Box>

              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", color: "text.primary" }}>
                  Camera
                </Typography>
                <Chip
                  label={cameraOnline ? "ONLINE" : "OFFLINE"}
                  sx={{
                    fontWeight: 700,
                    bgcolor: cameraOnline ? "#E8F5E9" : "#FDECEA",
                    color: cameraOnline ? "success.main" : "error.main",
                    border: "1px solid",
                    borderColor: cameraOnline ? "success.main" : "error.main",
                    px: 1,
                  }}
                />
              </Stack>

              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {lastChecked
                  ? `Last checked: ${lastChecked.toLocaleTimeString()}`
                  : "Checking..."}
              </Typography>

              <Button
                variant="outlined"
                color="primary"
                onClick={fetchHealthStatus}
                sx={{ mt: 1 }}
              >
                Re-check now
              </Button>
            </Stack>
          )}
        </Paper>
      </Box>
    </Box>
  );
};

export default HealthCheck;