import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
} from "@mui/material";

/**
 * Modal confirm dialog (not a toast) — centered, backdrop-blocking, larger.
 * While open, the backdrop intercepts all clicks on the rest of the page
 * (sidebar links included), so the user can't navigate away until they
 * explicitly choose Cancel or Confirm.
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirmDialog();
 *   const ok = await confirm("Stop this session?");
 *   ...
 *   return <>{ConfirmDialog}...</>;
 */
export function useConfirmDialog() {
  const [state, setState] = useState({ open: false, message: "", resolve: null });
  const [loading, setLoading] = useState(false);

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      setState({ open: true, message, resolve });
    });
  }, []);

  const handleChoice = (result) => {
    state.resolve?.(result);
    setState((s) => ({ ...s, open: false }));
    setLoading(false);
  };

  const ConfirmDialog = (
    <Dialog
      open={state.open}
      onClose={() => {}} // no backdrop/escape dismiss — force an explicit choice
      disableEscapeKeyDown
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, p: 1.5 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: 22 }}>Confirm Action</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 16, color: "text.secondary" }}>{state.message}</Typography>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 1, gap: 1 }}>
        <Button
          variant="outlined"
          color="secondary"
          size="large"
          onClick={() => handleChoice(false)}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          size="large"
          onClick={() => {
            setLoading(true);
            handleChoice(true);
          }}
          disabled={loading}
        >
          {loading ? <CircularProgress size={22} color="inherit" /> : "Confirm"}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { confirm, ConfirmDialog };
}