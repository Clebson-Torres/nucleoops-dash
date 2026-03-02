import { NavLink } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { useAlertsSummary } from "../../features/alerts/useAlerts";
import { AlertBadge } from "../ui/AlertBadge";

export function Sidebar() {
  const auth = useAuth();
  const alertsSummaryQuery = useAlertsSummary(10_000);
  const openAlerts = alertsSummaryQuery.data?.open_total ?? 0;

  return (
    <aside className="sidebar card">
      <h1 className="brand">NucleoOps</h1>
      <p className="brand-subtitle">
        Operacoes diarias <AlertBadge count={openAlerts} />
      </p>
      <nav className="nav-links">
        <NavLink to="/overview" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          <span className="row nav-inline">
            Overview <AlertBadge count={openAlerts} />
          </span>
        </NavLink>
        <NavLink to="/jobs" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Jobs
        </NavLink>
        <NavLink to="/agents" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Agents
        </NavLink>
        {auth.role === "admin" ? (
          <NavLink to="/deploy" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            Deploy Agent
          </NavLink>
        ) : null}
        {auth.role === "admin" ? (
          <NavLink to="/settings/users" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            Configuracoes
          </NavLink>
        ) : null}
      </nav>
    </aside>
  );
}

