import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAuth } from "../../lib/auth/AuthContext";
import { apiGet } from "../../lib/api/client";
import { formatTime, isRecent } from "../../lib/format";
import type { Agent, Alert, AlertSummary, AgentsHealthSummary } from "../../types/api";
import { Link } from "react-router-dom";
import { AlertsPanel } from "./AlertsPanel";

function poll(intervalMs: number) {
  return () => (document.hidden ? false : intervalMs);
}

export function OverviewPage() {
  const auth = useAuth();
  const headers = auth.getAuthHeadersState();

  const healthQuery = useQuery({
    queryKey: ["health-summary", headers.accessToken],
    queryFn: () => apiGet<AgentsHealthSummary>("/agents/health/summary", headers),
    refetchInterval: poll(10_000),
  });

  const alertSummaryQuery = useQuery({
    queryKey: ["overview-alerts-summary", headers.accessToken],
    queryFn: () => apiGet<AlertSummary>("/alerts/summary", headers),
    refetchInterval: poll(10_000),
  });

  const alertsQuery = useQuery({
    queryKey: ["overview-alerts-open", headers.accessToken],
    queryFn: () => apiGet<Alert[]>("/alerts?status=open&limit=50", headers),
    refetchInterval: poll(15_000),
  });

  const agentsQuery = useQuery({
    queryKey: ["agents-overview", headers.accessToken],
    queryFn: () => apiGet<Agent[]>("/agents?limit=300", headers),
    refetchInterval: poll(15_000),
  });

  const staleAgents = useMemo(
    () => (agentsQuery.data ?? []).filter((agent) => !isRecent(agent.last_seen, 5)).slice(0, 8),
    [agentsQuery.data]
  );

  const failedAlerts = useMemo(
    () => (alertsQuery.data ?? []).filter((alert) => alert.alert_type === "job.failed").slice(0, 8),
    [alertsQuery.data]
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Overview"
        subtitle="Visao operacional rapida para decisao imediata"
        actions={
          <div className="row">
            <Link className="btn-link" to="/jobs">
              Jobs
            </Link>
            <Link className="btn-link secondary" to="/agents">
              Agents
            </Link>
            {auth.role === "admin" ? (
              <Link className="btn-link secondary" to="/settings/users">
                Configuracoes
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="kpi-grid three-kpi-grid">
        <Card>
          <div className="kpi-title">Agentes totais</div>
          <div className="kpi-value">{healthQuery.data?.total_agents ?? "-"}</div>
        </Card>
        <Card>
          <div className="kpi-title">Saudáveis (5 min)</div>
          <div className="kpi-value">{healthQuery.data?.healthy_last_5m ?? "-"}</div>
        </Card>
        <Card>
          <div className="kpi-title">Falhas recentes (15 min)</div>
          <div className="kpi-value">{alertSummaryQuery.data?.failed_last_15m ?? "-"}</div>
        </Card>
      </div>

      <div className="two-col-grid">
        <Card title="Alertas abertos">
          <AlertsPanel alerts={(alertsQuery.data ?? []).slice(0, 8)} onChanged={() => alertsQuery.refetch().then(() => undefined)} />
        </Card>

        <Card title="Agentes sem check-in recente">
          {staleAgents.length > 0 ? (
            <div className="compact-list">
              {staleAgents.map((agent) => (
                <div key={agent.agent_id} className="compact-item">
                  <div>
                    <strong>{agent.hostname}</strong>
                    <p>{agent.agent_id}</p>
                  </div>
                  <div>
                    <Badge tone="warn">offline</Badge>
                    <p className="small">{formatTime(agent.last_seen)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Tudo em dia" subtitle="Nenhum agente sem check-in recente." />
          )}
        </Card>
      </div>

      <Card title="Falhas de execução (últimas)">
        {failedAlerts.length > 0 ? (
          <div className="compact-list">
            {failedAlerts.map((alert) => (
              <div key={alert.id} className="compact-item">
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.message}</p>
                </div>
                <div>
                  <Badge tone="error">{alert.severity}</Badge>
                  <p className="small">{formatTime(alert.updated_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Sem falhas recentes" subtitle="Nenhuma execução failed/timeout na janela recente." />
        )}
      </Card>
    </div>
  );
}
