import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "../components/layout/Sidebar";
import { Topbar } from "../components/layout/Topbar";
import { useToast } from "../components/ui/Toast";

export function AppShell() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const flow = hash.get("type") ?? query.get("type");
    const hasAuthCode = Boolean(query.get("code") || query.get("token_hash"));
    if ((flow === "invite" || flow === "recovery" || hasAuthCode) && location.pathname !== "/auth") {
      navigate(`/auth${window.location.search}${window.location.hash}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Topbar onError={toast.showError} onSuccess={toast.showSuccess} />
        <Outlet />
      </main>
    </div>
  );
}
