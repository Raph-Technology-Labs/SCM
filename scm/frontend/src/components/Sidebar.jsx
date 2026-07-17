import { useState } from "react";
import {
  Box, Button, Typography, Divider, IconButton, List, Tooltip, Dialog, DialogTitle, DialogActions,
} from "@mui/material";
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

const Sidebar = ({ loginData, onNavigate }) => {
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
          color: active ? "#D92D20" : "#1A1A1A",
          bgcolor: active ? "#FEE2E2" : "transparent",
          borderRadius: "5px",
          "&:hover": { bgcolor: active ? "#FEE2E2" : "#F3F4F6" },
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
        bgcolor: "#FFFFFF",
        color: "#1A1A1A",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100vh",
        borderRight: "1px solid #E5E7EB",
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
            color: "#1A1A1A",
            mb: 1,
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

        {/* + New Session (black) */}
        {collapsed ? (
          <Tooltip title="New Session" placement="right">
            <IconButton
              onClick={() => onNavigate("/mode-selection")}
              sx={{ width: "100%", borderRadius: "5px", bgcolor: "#111111", color: "#fff", mb: 1, "&:hover": { bgcolor: "#333" } }}
            >
              <PlayCircleOutlinedIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Button
            fullWidth
            onClick={() => onNavigate("/mode-selection")}
            sx={{
              bgcolor: "#111111", color: "#fff", borderRadius: "5px", py: 1, mb: 1,
              textTransform: "none", fontWeight: 500, "&:hover": { bgcolor: "#333" },
            }}
          >
            + New Session
          </Button>
        )}

        {/* + Add Item (red for admin, grey/disabled for operator) */}
        {collapsed ? (
          <Tooltip title="Add Item" placement="right">
            <span>
              <IconButton
                disabled={!isAdmin}
                onClick={() => onNavigate("/add-part")}
                sx={{
                  width: "100%", borderRadius: "5px", mb: 2,
                  bgcolor: isAdmin ? "primary.main" : "#F3F4F6",
                  color: isAdmin ? "#fff" : "#9AA1AC",
                  "&:hover": { bgcolor: isAdmin ? "primary.dark" : "#F3F4F6" },
                  "&.Mui-disabled": { bgcolor: "#F3F4F6", color: "#9AA1AC" },
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
              bgcolor: isAdmin ? "primary.main" : "#F3F4F6",
              color: isAdmin ? "#fff" : "#9AA1AC",
              borderRadius: "5px", py: 1, mb: 3, textTransform: "none", fontWeight: 500,
              "&:hover": { bgcolor: isAdmin ? "primary.dark" : "#F3F4F6" },
              "&.Mui-disabled": { bgcolor: "#F3F4F6", color: "#9AA1AC" },
            }}
          >
            + Add Item
          </Button>
        )}

        <Divider sx={{ mb: 2 }} />

        {/* Main Navigation */}
        <List disablePadding>
          {menuItems.map((item) => (
            <NavButton key={item.path} {...item} />
          ))}
        </List>
      </Box>

      {/* BOTTOM SECTION */}
      <Box sx={{ p: 1.5, borderTop: "1px solid #E5E7EB", mt: "auto" }}>
        {bottomItems.map((item) => (
          <NavButton key={item.path} {...item} />
        ))}

        <Divider sx={{ my: 1 }} />

        {/* User info + logout */}
        {collapsed ? (
          <Tooltip title="Logout" placement="right">
            <IconButton onClick={() => setConfirmLogout(true)} sx={{ width: "100%", "&:hover": { color: "#D92D20" } }}>
              <LogoutOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1 }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: "#202020" }}>
                {roleLabel}
              </Typography>
              <Typography variant="body2" sx={{ color: "#202020", fontSize: "13px" }}>
                {loginData?.user_name || "Not logged in"}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() => setConfirmLogout(true)}
              sx={{ color: "#1A1A1A", "&:hover": { color: "#D92D20" } }}
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