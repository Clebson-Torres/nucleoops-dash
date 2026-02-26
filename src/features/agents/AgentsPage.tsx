import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Table } from "../../components/ui/Table";
import { EmptyState } from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/Modal";
import { useAuth } from "../../lib/auth/AuthContext";
import { apiGet, apiPost } from "../../lib/api/client";
import { formatTime, isRecent } from "../../lib/format";
import { useToast } from "../../components/ui/Toast";
import type { Agent, AgentDetails, JobCreateResponse } from "../../types/api";

function poll(intervalMs: number) {
  return () => (document.hidden ? false : intervalMs);
}

export function AgentsPage() {
  const auth = useAuth();
  const toast = useToast();
  const headers = auth.getAuthHeadersState();

  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("Spooler");

  const agentsQuery = useQuery({
    queryKey: ["agents-list", headers.accessToken],
    queryFn: () => apiGet<Agent[]>("/agents?limit=600", headers),
    refetchInterval: poll(15_000),
  });

  const selectedAgentDetailsQuery = useQuery({
    queryKey: ["agent-details", selectedAgentId, headers.accessToken],
    queryFn: () => apiGet<AgentDetails>(`/agents/${encodeURIComponent(selectedAgentId ?? "")}/details`, headers),
    enabled: Boolean(selectedAgentId),
    refetchInterval: selectedAgentId ? poll(15_000) : false,
  });

  const filteredAgents = useMemo(() => {
    return (agentsQuery.data ?? []).filter((agent) => {
      const needle = search.trim().toLowerCase();
      const textOk =
        !needle ||
        `${agent.hostname} ${agent.agent_id} ${agent.os_name} ${agent.os_version}`.toLowerCase().includes(needle);

      const healthy = isRecent(agent.last_seen, 5);
      const healthOk =
        healthFilter === "all" ||
        (healthFilter === "healthy" && healthy) ||
        (healthFilter === "offline" && !healthy);
      return textOk && healthOk;
    });
  }, [agentsQuery.data, search, healthFilter]);

  async function createServiceJob(action: "start" | "stop" | "restart") {
    if (auth.role !== "admin") {
      toast.showError("Ação restrita ao perfil admin.");
      return;
    }
    if (!selectedAgentId) {
      toast.showError("Selecione um agent.");
      return;
    }
    if (!serviceName.trim()) {
      toast.showError("Informe o nome do serviço.");
      return;
    }

    const cmd =
      action === "start"
        ? `Start-Service -Name '${serviceName.trim()}'`
        : action === "stop"
          ? `Stop-Service -Name '${serviceName.trim()}' -Force`
          : `Restart-Service -Name '${serviceName.trim()}' -Force`;

    try {
      const result = await apiPost<JobCreateResponse>(
        "/jobs",
        {
          name: `service-${action}-${serviceName.trim()}`,
          action_type: "run_command",
          command: cmd,
          timeout_seconds: 60,
          rollout_profile: "safe",
          target_agent_ids: [selectedAgentId],
        },
        headers
      );
      toast.showSuccess(`Job de serviço criado (id ${result.job_id}).`);
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao criar job de serviço.");
    }
  }

  return (
    <div className="page-content">
      <PageHeader title="Agents" subtitle="Inventário operacional, saúde e ações remotas" />

      <Card title="Inventário de Agents">
          <div className="row">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar host, agent_id, SO" />
            <select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="healthy">Saudáveis</option>
              <option value="offline">Sem check-in</option>
            </select>
          </div>

          {filteredAgents.length === 0 ? (
            <EmptyState title="Nenhum agent encontrado" subtitle="Ajuste os filtros para visualizar resultados." />
          ) : (
            <Table headers={["Host", "Agent ID", "SO", "Agent", "Service", "Last Seen", "Saúde", "Ações"]}>
              {filteredAgents.map((agent) => {
                const healthy = isRecent(agent.last_seen, 5);
                return (
                  <tr key={agent.agent_id}>
                    <td>{agent.hostname}</td>
                    <td>{agent.agent_id}</td>
                    <td>{agent.os_name} {agent.os_version}</td>
                    <td>{agent.agent_version ?? "-"}</td>
                    <td>{agent.service_mode ?? "-"}</td>
                    <td>{formatTime(agent.last_seen)}</td>
                    <td>
                      <Badge tone={healthy ? "ok" : "warn"}>{healthy ? "healthy" : "offline"}</Badge>
                    </td>
                    <td>
                      <button className="btn-secondary" type="button" onClick={() => setSelectedAgentId(agent.agent_id)}>
                        Detalhes
                      </button>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

      <Modal open={Boolean(selectedAgentId)} title={`Detalhes ${selectedAgentId ?? ""}`} onClose={() => setSelectedAgentId(null)} wide>
        {selectedAgentDetailsQuery.data ? (
          <>
            <div className="detail-grid">
              <div>
                <h4>Resumo</h4>
                <p>
                  Host: {selectedAgentDetailsQuery.data.agent.hostname}<br />
                  Agent: {selectedAgentDetailsQuery.data.agent.agent_id}<br />
                  SO: {selectedAgentDetailsQuery.data.agent.os_name} {selectedAgentDetailsQuery.data.agent.os_version}<br />
                  Último check-in: {formatTime(selectedAgentDetailsQuery.data.agent.last_seen)}
                </p>
              </div>
              <div>
                <h4>Ações de serviço</h4>
                <input value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="Spooler" />
                <div className="row">
                  <button type="button" onClick={() => void createServiceJob("start")}>Start</button>
                  <button type="button" onClick={() => void createServiceJob("stop")}>Stop</button>
                  <button type="button" onClick={() => void createServiceJob("restart")}>Restart</button>
                </div>
              </div>
            </div>

            <h4>Serviços (amostra)</h4>
            <pre className="log-pre">{(selectedAgentDetailsQuery.data.latest_report?.services?.sample ?? []).join("\n") || "(vazio)"}</pre>

            <h4>Apps instalados (amostra)</h4>
            <pre className="log-pre">
              {(selectedAgentDetailsQuery.data.latest_report?.installed_apps?.sample ?? [])
                .map((app) => `${app.name} ${app.version ?? ""} ${app.publisher ?? ""}`.trim())
                .join("\n") || "(vazio)"}
            </pre>
          </>
        ) : (
          <p className="small">Carregando detalhes...</p>
        )}
      </Modal>
    </div>
  );
}
