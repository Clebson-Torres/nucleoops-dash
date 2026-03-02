import { useState } from "react";
import { useToast } from "../../components/ui/Toast";
import { Badge } from "../../components/ui/Badge";
import { apiPatch } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/AuthContext";
import { formatTime } from "../../lib/format";
import type { Alert } from "../../types/api";

type AlertsPanelProps = {
  alerts: Alert[];
  onChanged: () => Promise<void>;
};

export function AlertsPanel({ alerts, onChanged }: AlertsPanelProps) {
  const auth = useAuth();
  const toast = useToast();
  const headers = auth.getAuthHeadersState();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function setStatus(alert: Alert, status: "ack" | "resolved") {
    try {
      setBusyId(alert.id);
      await apiPatch<Alert>(`/alerts/${alert.id}`, { status }, headers);
      await onChanged();
      toast.showSuccess(`Alerta #${alert.id} atualizado para ${status}.`);
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao atualizar alerta.");
    } finally {
      setBusyId(null);
    }
  }

  if (alerts.length === 0) {
    return <p className="small">Sem alertas abertos.</p>;
  }

  return (
    <div className="compact-list">
      {alerts.map((alert) => (
        <div key={alert.id} className="compact-item">
          <div>
            <strong>#{alert.id} {alert.title}</strong>
            <p>{alert.message}</p>
            <p className="small">{formatTime(alert.updated_at)}</p>
          </div>
          <div className="row">
            <Badge tone={alert.severity === "error" ? "error" : "warn"}>{alert.alert_type}</Badge>
            <button
              className="btn-secondary"
              type="button"
              disabled={busyId === alert.id}
              onClick={() => void setStatus(alert, "ack")}
            >
              Ack
            </button>
            {auth.role === "admin" ? (
              <button
                className="btn-secondary"
                type="button"
                disabled={busyId === alert.id}
                onClick={() => void setStatus(alert, "resolved")}
              >
                Resolver
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

