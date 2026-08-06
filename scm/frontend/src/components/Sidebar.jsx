import { useState } from "react";
import {
  Box, Button, Typography, Divider, IconButton, List, Tooltip, Dialog, DialogTitle, DialogActions,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useLocation } from "react-router-dom";
import logo from "../assets/raph.logo.png";

import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import SettingsIcon from "@mui/icons-material/Settings";
import CategoryIcon from "@mui/icons-material/Category";
import SupportAgentOutlinedIcon from "@mui/icons-material/SupportAgentOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import PlayCircleOutlinedIcon from "@mui/icons-material/PlayCircleOutlined";
import AddCircleOutlinedIcon from "@mui/icons-material/AddCircleOutlined";

const EXPANDED = 260;
const COLLAPSED = 74;

/**
 * Sidebar surface: one faint step below theme background.default (#F5F6F8),
 * staying in the same cool-grey family so the rail reads as a recessed panel
 * rather than a different material. Everything else comes from theme tokens.
 * Want it fainter? Move `bg` to #F0F2F5. Deeper? #E6E9EF.
 */
const SURFACE = {
  bg: "#ECEFF3",
  border: "#DDE1E8",
  hover: "#E2E6EC",
  disabledBg: "#E0E4EA",
  disabledText: "#A3ABB8",
};

const Sidebar = ({ loginData, onNavigate }) => {
  const theme = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const [confirmLogout, setConfirmLogout] = useState(false);

  const isAdmin =
    loginData?.role === "administrator" || loginData?.role === "superadministrator";
  const roleLabel = loginData?.role
    ? loginData.role.charAt(0).toUpperCase() + loginData.role.slice(1)
    : "Guest";

  const menuItems = [
    { name: "Dashboard", path: "/dashboard", icon: <DashboardIcon /> },
    { name: "Part Details", path: "/part-details", icon: <CategoryIcon /> },
    { name: "Health Check", path: "/health-check", icon: <DevicesOutlinedIcon /> },
    { name: "Device Settings", path: "/device-settings", icon: <SettingsIcon /> },
  ];

  const bottomItems = [
    { name: "Technical Support", path: "/technical-support", icon: <SupportAgentOutlinedIcon fontSize="small" /> },
  ];

  // reusable nav button (handles collapsed = icon-only + tooltip)
  const NavButton = ({ name, path, icon }) => {
    const active = location.pathname === path;
    const btn = (
      <Button
        onClick={() => onNavigate(path)}
        fullWidth
        startIcon={collapsed ? null : icon}
        sx={{
          justifyContent: collapsed ? "center" : "flex-start",
          textTransform: "none",
          minWidth: 0,
          px: collapsed ? 0 : 2,
          mb: 1,
          fontWeight: active ? 600 : 500,
          fontSize: "15px",
          color: active ? "primary.main" : "text.primary",
          bgcolor: active ? "peach.main" : "transparent",
          borderRadius: 1,
          "&:hover": { bgcolor: active ? "peach.main" : SURFACE.hover },
        }}
      >
        {collapsed ? icon : name}
      </Button>
    );
    return collapsed ? <Tooltip title={name} placement="right">{btn}</Tooltip> : btn;
  };

  return (
    <Box
      sx={{
        width: collapsed ? COLLAPSED : EXPANDED,
        transition: "width 0.2s ease",
        bgcolor: SURFACE.bg,
        color: "text.primary",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100vh",
        borderRight: `1px solid ${SURFACE.border}`,
        overflowX: "hidden",
        overflowY: "auto",
        userSelect: "none",
        caretColor: "transparent",
      }}
    >
      {/* TOP SECTION */}
      <Box sx={{ p: 1.5 }}>
        {/* Hide Menu toggle */}
        <Button
          onClick={() => setCollapsed((c) => !c)}
          startIcon={<MenuIcon />}
          sx={{
            justifyContent: collapsed ? "center" : "flex-start",
            textTransform: "none",
            minWidth: 0,
            color: "text.secondary",
            mb: 1,
            "&:hover": { bgcolor: SURFACE.hover, color: "text.primary" },
            "& .MuiButton-startIcon": { m: collapsed ? 0 : undefined },
          }}
        >
          {!collapsed && "Hide Menu"}
        </Button>

        {/* Logo */}
        <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
          <img
            src={logo}
            alt="Raph Technology Labs"
            style={{
              width: collapsed ? 38 : 140,
              height: "auto",
              transition: "width 0.2s ease",
              pointerEvents: "none",
            }}
            onError={(e) => (e.target.style.display = "none")}
          />
        </Box>

        {/* + New Session (theme secondary / black) */}
        {collapsed ? (
          <Tooltip title="New Session" placement="right">
            <IconButton
              onClick={() => onNavigate("/mode-selection")}
              sx={{
                width: "100%", borderRadius: 1, mb: 1,
                bgcolor: "secondary.main", color: "#fff",
                "&:hover": { bgcolor: "#333" },
              }}
            >
              <PlayCircleOutlinedIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Button
            fullWidth
            onClick={() => onNavigate("/mode-selection")}
            sx={{
              bgcolor: "secondary.main", color: "#fff",
              borderRadius: 1, py: 1, mb: 1,
              textTransform: "none", fontWeight: 600,
              "&:hover": { bgcolor: "#333" },
            }}
          >
            + New Session
          </Button>
        )}

        {/* + Add Item (theme primary red for admin, muted for operator) */}
        {collapsed ? (
          <Tooltip title="Add Item" placement="right">
            <span>
              <IconButton
                disabled={!isAdmin}
                onClick={() => onNavigate("/add-part")}
                sx={{
                  width: "100%", borderRadius: 1, mb: 2,
                  bgcolor: isAdmin ? "primary.main" : SURFACE.disabledBg,
                  color: isAdmin ? "#fff" : SURFACE.disabledText,
                  "&:hover": { bgcolor: isAdmin ? "primary.dark" : SURFACE.disabledBg },
                  "&.Mui-disabled": { bgcolor: SURFACE.disabledBg, color: SURFACE.disabledText },
                }}
              >
                <AddCircleOutlinedIcon />
              </IconButton>
            </span>
          </Tooltip>
        ) : (
          <Button
            fullWidth
            disabled={!isAdmin}
            onClick={() => onNavigate("/add-part")}
            sx={{
              bgcolor: isAdmin ? "primary.main" : SURFACE.disabledBg,
              color: isAdmin ? "#fff" : SURFACE.disabledText,
              borderRadius: 1, py: 1, mb: 3, textTransform: "none", fontWeight: 600,
              "&:hover": { bgcolor: isAdmin ? "primary.dark" : SURFACE.disabledBg },
              "&.Mui-disabled": { bgcolor: SURFACE.disabledBg, color: SURFACE.disabledText },
            }}
          >
            + Add Item
          </Button>
        )}

        <Divider sx={{ mb: 2, borderColor: SURFACE.border }} />

        {/* Main Navigation */}
        <List disablePadding>
          {menuItems.map((item) => (
            <NavButton key={item.path} {...item} />
          ))}
        </List>
      </Box>

      {/* BOTTOM SECTION */}
      <Box sx={{ p: 1.5, borderTop: `1px solid ${SURFACE.border}`, mt: "auto" }}>
        {bottomItems.map((item) => (
          <NavButton key={item.path} {...item} />
        ))}

        <Divider sx={{ my: 1, borderColor: SURFACE.border }} />

        {/* User info + logout */}
        {collapsed ? (
          <Tooltip title="Logout" placement="right">
            <IconButton
              onClick={() => setConfirmLogout(true)}
              sx={{
                width: "100%", color: "text.secondary",
                "&:hover": { color: "primary.main", bgcolor: SURFACE.hover },
              }}
            >
              <LogoutOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1 }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
                {roleLabel}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "13px" }}>
                {loginData?.user_name || "Not logged in"}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() => setConfirmLogout(true)}
              sx={{ color: "text.secondary", "&:hover": { color: "primary.main", bgcolor: SURFACE.hover } }}
            >
              <LogoutOutlinedIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>
       {/* Logout confirmation */}
      <Dialog open={confirmLogout} onClose={() => setConfirmLogout(false)}>
        <DialogTitle>Do you want to logout?</DialogTitle>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmLogout(false)} sx={{ color: "text.secondary", textTransform: "none" }}>
            No
          </Button>
          <Button
            variant="contained"
            color="primary"
            sx={{ textTransform: "none" }}
            onClick={() => { setConfirmLogout(false); onNavigate("/signout"); }}
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Sidebar;