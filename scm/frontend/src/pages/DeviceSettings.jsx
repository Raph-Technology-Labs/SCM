import { useState } from "react";
import { Box, Typography, Paper, Button, Stack } from "@mui/material";

const DeviceSettings = () => {
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturing, setCapturing] = useState(false);

  // UI-only stub for now — wire to the real capture endpoint later
  const handleCapture = async () => {
    setCapturing(true);
    // placeholder: simulate a capture delay
    await new Promise((r) => setTimeout(r, 600));
    setCapturedImage(null); // no backend yet, nothing to show
    setCapturing(false);
  };

  return (
    <Box sx={{ minHeight: "100vh", width: "100%", flex: 1, overflowY: "auto", bgcolor: "background.default" }}>
      <Box sx={{ maxWidth: 900, mx: "auto", px: { xs: 1.5, sm: 3 }, py: { xs: 3, md: 4 } }}>

        <Typography variant="h5" sx={{ fontWeight: 700, color: "text.primary", mb: 0.5 }}>
          Device Settings
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
          Preview the camera feed and capture a test image.
        </Typography>

        <Paper elevation={0} sx={{
          p: { xs: 2.5, sm: 3 }, borderRadius: 2, border: 1,
          borderColor: "divider", bgcolor: "background.paper",
        }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary", mb: 1.5 }}>
            Camera Preview
          </Typography>

          <Box
            sx={{
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 2,
              bgcolor: "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 2,
              overflow: "hidden",
            }}
          >
            <Typography sx={{ color: "#888", fontSize: "0.9rem" }}>
              Live feed not connected
            </Typography>
          </Box>

          <Stack direction="row" spacing={2} justifyContent="center">
            <Button
              variant="contained"
              color="primary"
              onClick={handleCapture}
              disabled={capturing}
              sx={{ px: 4 }}
            >
              {capturing ? "Capturing..." : "📸 Capture"}
            </Button>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{
          mt: 3, p: { xs: 2.5, sm: 3 }, borderRadius: 2, border: 1,
          borderColor: "divider", bgcolor: "background.paper",
        }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary", mb: 1.5 }}>
            Captured Image
          </Typography>

          {capturedImage ? (
            <Box
              component="img"
              src={capturedImage}
              alt="Captured"
              sx={{
                width: "100%",
                maxWidth: 480,
                borderRadius: 2,
                border: 1,
                borderColor: "divider",
                display: "block",
                mx: "auto",
              }}
            />
          ) : (
            <Box
              sx={{
                border: "1px dashed",
                borderColor: "divider",
                borderRadius: 2,
                py: 6,
                textAlign: "center",
                color: "text.secondary",
              }}
            >
              No image captured yet. Click "Capture" above.
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
};

export default DeviceSettings;