import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary:   { main: "#b71c1c", dark: "#8e1414", light: "#d32f2f" }, // red
    secondary: { main: "#111111" },                                     // black
    error:     { main: "#D92D20" },
    background: { default: "#F5F6F8", paper: "#FFFFFF" },                // grey / white
    text:      { primary: "#1A1A1A", secondary: "#6A7382" },            // dark / muted
    // custom peach accent (used for active states / highlights)
    peach:     { main: "#FEE2E2", dark: "#f7e582" },
    // extended accent tokens (used by pages like PartSelection for highlight boxes)
    accent: {
      main: "#FEE2E2",
      light: "#FDF1EF",
      dark: "#f7e582",
      contrastText: "#1A1A1A",
    },
    // gradient tokens (used for the dark sidebar/mode-toggle look, barcode banner, etc.)
    gradients: {
      primary: "linear-gradient(135deg, #b71c1c 0%, #8e1414 100%)",
      dark: "linear-gradient(135deg, #1A1A1A 0%, #000000 100%)",
    },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
    button: { textTransform: "none", fontWeight: 600 }, // no ALL-CAPS buttons
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "img": { userSelect: "none", WebkitUserDrag: "none" },
        "*": { caretColor: "transparent" },   // hides the text caret line app-wide
        "input, textarea": { caretColor: "auto" },
      },
    },
    // default styling for every MUI Button
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
          "&:hover": { backgroundColor: "#8e1414" },
        },
      },
    },
    // red focus border on every TextField
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#b71c1c",
          },
        },
      },
    },
  },
});

export default theme;