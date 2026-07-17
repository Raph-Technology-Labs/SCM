import React from "react";
import { toast } from "react-toastify";
import { Box, Typography, Button } from "@mui/material";

/**
 * Toast-based replacement for window.confirm().
 * Usage: const ok = await confirmToast("Stop this session?"); if (!ok) return;
 */
export function confirmToast(message) {
  return new Promise((resolve) => {
    toast(
      ({ closeToast }) => (
        <Box>
          <Typography sx={{ fontWeight: 600, mb: 1.5, color: "text.primary" }}>
            {message}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button
              size="small"
              variant="outlined"
              color="secondary"
              onClick={() => {
                resolve(false);
                closeToast();
              }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              color="primary"
              onClick={() => {
                resolve(true);
                closeToast();
              }}
            >
              Confirm
            </Button>
          </Box>
        </Box>
      ),
      { autoClose: false, closeOnClick: false, closeButton: false, draggable: false },
    );
  });
}