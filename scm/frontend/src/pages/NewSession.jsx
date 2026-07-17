import { Box, Typography, Paper } from "@mui/material";
import { useNavigate } from "react-router-dom";
import FilterNoneIcon from "@mui/icons-material/FilterNone";
import SearchIcon from "@mui/icons-material/Search";
import StraightenIcon from "@mui/icons-material/Straighten";

const MODES = [
  {
    key: "Counting",
    title: "Counting",
    desc: "Count the number of parts in real time",
    icon: <FilterNoneIcon sx={{ fontSize: 34 }} />,
  },
  {
    key: "Defect Detection",
    title: "Defect Detection",
    desc: "Detect surface defects on each part",
    icon: <SearchIcon sx={{ fontSize: 34 }} />,
  },
  {
    key: "Measurement",
    title: "Measurement",
    desc: "Measure dimensions against tolerances",
    icon: <StraightenIcon sx={{ fontSize: 34 }} />,
  },
];

export default function NewSession() {
  const navigate = useNavigate();
  const handleSelect = (mode) => navigate("/part-selection", { state:  { operationMode: mode } });

  return (
    <Box sx={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: "#1A1A1A" }}>
        Select Operation Mode
      </Typography>
      <Typography variant="body1" sx={{ color: "text.secondary", mb: 6 }}>
        Choose how you want to run this session
      </Typography>

      <Box sx={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {MODES.map((m) => (
          <Paper
            key={m.key}
            elevation={0}
            onClick={() => handleSelect(m.key)}
            sx={{
              width: 260,
              p: 4,
              borderRadius: 4,
              border: "1px solid #E5E7EB",
              cursor: "pointer",
              textAlign: "center",
              transition: "all 0.18s ease",
              userSelect: "none",
              "&:hover": {
                borderColor: "primary.main",
                boxShadow: "0 10px 26px rgba(183,28,28,0.12)",
                transform: "translateY(-4px)",
                "& .mode-icon": { bgcolor: "primary.main", color: "#fff" },
                "& .mode-title": { color: "primary.main" },
              },
            }}
          >
            {/* icon in a soft circle */}
            <Box
              className="mode-icon"
              sx={{
                width: 74, height: 74, borderRadius: "50%",
                bgcolor: "#FEE2E2", color: "primary.main",
                display: "flex", alignItems: "center", justifyContent: "center",
                mx: "auto", mb: 2.5, transition: "all 0.18s ease",
              }}
            >
              {m.icon}
            </Box>

            <Typography className="mode-title" sx={{ fontWeight: 700, fontSize: 19, mb: 1, color: "#1A1A1A", transition: "color 0.18s ease" }}>
              {m.title}
            </Typography>
            <Typography sx={{ fontSize: 13.5, color: "text.secondary", lineHeight: 1.6 }}>
              {m.desc}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}