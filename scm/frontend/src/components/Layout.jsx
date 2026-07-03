import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          MV Console
          <small>Inspection Control</small>
        </div>

        <div className="nav-group">Overview</div>
        <NavLink to="/dashboard" className="nav-link">Dashboard</NavLink>

        <div className="nav-group">Parts</div>
        <NavLink to="/parts" className="nav-link">Parts</NavLink>
        {isAdmin && <NavLink to="/parts/new" className="nav-link">Add new part</NavLink>}
        <NavLink to="/ai-models" className="nav-link">AI models</NavLink>

        <div className="nav-group">Production</div>
        <NavLink to="/sessions" className="nav-link">Sessions</NavLink>

        <div className="sidebar-foot">
          <div className="who">{user?.user_name}</div>
          <div className="role">{user?.role}</div>
          <button className="btn btn-ghost" style={{ marginTop: 10, width: "100%" }} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}
