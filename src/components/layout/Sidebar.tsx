import { NavLink } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";

export function Sidebar() {
  const auth = useAuth();

  return (
    <aside className="sidebar card">
      <h1 className="brand">NúcleoOps</h1>
      <p className="brand-subtitle">Operações diárias</p>
      <nav className="nav-links">
        <NavLink to="/overview" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Overview
        </NavLink>
        <NavLink to="/jobs" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Jobs
        </NavLink>
        <NavLink to="/agents" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Agents
        </NavLink>
        {auth.role === "admin" ? (
          <NavLink to="/settings/users" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            Configurações
          </NavLink>
        ) : null}
      </nav>
    </aside>
  );
}
