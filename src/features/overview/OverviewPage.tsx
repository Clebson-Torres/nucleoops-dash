import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAuth } from "../../lib/auth/AuthContext";
import { apiGet } from "../../lib/api/client";
import { formatTime, isRecent } from "../../lib/format";
import type { Agent, AgentsHealthSummary, Job } from "../../types/api";
import { Link } from "react-router-dom";

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

  const jobsQuery = useQuery({
    queryKey: ["jobs-overview", headers.accessToken],
    queryFn: () => apiGet<Job[]>("/jobs?limit=30", headers),
    refetchInterval: poll(15_000),
  });

  const agentsQuery = useQuery({
    queryKey: ["agents-overview", headers.accessToken],
    queryFn: () => apiGet<Agent[]>("/agents?limit=300", headers),
    refetchInterval: poll(15_000),
  });

  const metrics = useMemo(() => {
    const jobs = jobsQuery.data ?? [];
    const running = jobs.filter((job) => job.status === "running" || job.status === "pending").length;
    const failed = jobs.filter((job) => job.status === "failed").length;
    const failedRate = jobs.length > 0 ? Math.round((failed / jobs.length) * 100) : 0;
    return { running, failedRate };
  }, [jobsQuery.data]);

  const staleAgents = useMemo(
    () => (agentsQuery.data ?? []).filter((agent) => !isRecent(agent.last_seen, 5)).slice(0, 12),
    [agentsQuery.data]
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Overview"
        subtitle="Visão operacional rápida para decisão imediata"
        actions={
          <div className="row">
            <Link className="btn-link" to="/jobs">
              Criar job
            </Link>
            <Link className="btn-link secondary" to="/agents">
              Abrir agents
            </Link>
          </div>
        }
      />

      <div className="kpi-grid">
        <Card>
          <div className="kpi-title">Agentes totais</div>
          <div className="kpi-value">{healthQuery.data?.total_agents ?? "-"}</div>
        </Card>
        <Card>
          <div className="kpi-title">Saudáveis (5 min)</div>
          <div className="kpi-value">{healthQuery.data?.healthy_last_5m ?? "-"}</div>
        </Card>
        <Card>
          <div className="kpi-title">Jobs em execução</div>
          <div className="kpi-value">{metrics.running}</div>
        </Card>
        <Card>
          <div className="kpi-title">Taxa de falha recente</div>
          <div className="kpi-value">{metrics.failedRate}%</div>
        </Card>
      </div>

      <div className="two-col-grid">
        <Card title="Últimos jobs">
          {jobsQuery.data && jobsQuery.data.length > 0 ? (
            <div className="compact-list">
              {jobsQuery.data.slice(0, 10).map((job) => (
                <div key={job.id} className="compact-item">
                  <div>
                    <strong>#{job.id} {job.name}</strong>
                    <p>{job.action_type}</p>
                  </div>
                  <div>
                    <Badge tone={job.status === "failed" ? "error" : job.status === "completed" ? "ok" : "warn"}>
                      {job.status}
                    </Badge>
                    <p className="small">{formatTime(job.updated_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sem jobs recentes" subtitle="Crie o primeiro job para iniciar operações." />
          )}
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
    </div>
  );
}
