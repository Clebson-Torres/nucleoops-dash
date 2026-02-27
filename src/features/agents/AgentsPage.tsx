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
import { formatTime, isRecent, summarizeOutput } from "../../lib/format";
import { useToast } from "../../components/ui/Toast";
import type {
  Agent,
  AgentDetails,
  AgentLogsQueryRequest,
  ExecuteOperationRequest,
  ExecuteOperationResponse,
  JobExecution,
  JobLogResult,
  OperationTemplate,
} from "../../types/api";

function poll(intervalMs: number) {
  return () => (document.hidden ? false : intervalMs);
}

function isWindowsAgent(agent?: Agent | null): boolean {
  const os = `${agent?.os_name ?? ""} ${agent?.os_version ?? ""}`.toLowerCase();
  return os.includes("windows") || os.includes("win");
}

export function AgentsPage() {
  const auth = useAuth();
  const toast = useToast();
  const headers = auth.getAuthHeadersState();

  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const [pingHost, setPingHost] = useState("8.8.8.8");
  const [speedUrl, setSpeedUrl] = useState("http://speedtest.tele2.net/100MB.zip");
  const [serviceName, setServiceName] = useState("Spooler");
  const [serviceOperation, setServiceOperation] = useState<"status" | "start" | "stop" | "restart">("restart");
  const [packageIdentifier, setPackageIdentifier] = useState("");

  const [logSource, setLogSource] = useState<"event_system" | "event_application" | "event_security" | "journal">("event_system");
  const [logLevel, setLogLevel] = useState<"info" | "warn" | "error" | "critical">("error");
  const [logContains, setLogContains] = useState("");
  const [logSinceMinutes, setLogSinceMinutes] = useState(10);
  const [logLimitLines, setLogLimitLines] = useState(500);

  const [latestLogJobId, setLatestLogJobId] = useState<number | null>(null);
  const [latestOperationJobId, setLatestOperationJobId] = useState<number | null>(null);
  const [openOperationResults, setOpenOperationResults] = useState(false);
  const [openLogResults, setOpenLogResults] = useState(false);

  const agentsQuery = useQuery({
    queryKey: ["agents-list", headers.accessToken],
    queryFn: () => apiGet<Agent[]>("/agents?limit=600", headers),
    refetchInterval: poll(15_000),
  });

  const selectedAgent = useMemo(() => {
    return (agentsQuery.data ?? []).find((item) => item.agent_id === selectedAgentId) ?? null;
  }, [agentsQuery.data, selectedAgentId]);

  const selectedAgentDetailsQuery = useQuery({
    queryKey: ["agent-details", selectedAgentId, headers.accessToken],
    queryFn: () => apiGet<AgentDetails>(`/agents/${encodeURIComponent(selectedAgentId ?? "")}/details`, headers),
    enabled: Boolean(selectedAgentId),
    refetchInterval: selectedAgentId ? poll(15_000) : false,
  });

  const operationTemplatesQuery = useQuery({
    queryKey: ["operation-templates", headers.accessToken],
    queryFn: () => apiGet<OperationTemplate[]>("/operations/templates?limit=500&active=true", headers),
    refetchInterval: poll(30_000),
  });

  const logResultsQuery = useQuery({
    queryKey: ["agent-log-results", latestLogJobId, headers.accessToken],
    queryFn: () => apiGet<JobLogResult[]>(`/jobs/${latestLogJobId ?? 0}/log-results?limit=50`, headers),
    enabled: Boolean(latestLogJobId),
    refetchInterval: latestLogJobId && openLogResults ? poll(5_000) : false,
  });

  const operationExecutionsQuery = useQuery({
    queryKey: ["operation-job-executions", latestOperationJobId, headers.accessToken],
    queryFn: () => apiGet<JobExecution[]>(`/jobs/${latestOperationJobId ?? 0}/executions?limit=100`, headers),
    enabled: Boolean(latestOperationJobId),
    refetchInterval: latestOperationJobId && openOperationResults ? poll(5_000) : false,
  });

  const serviceSamples = selectedAgentDetailsQuery.data?.latest_report?.services?.sample ?? [];
  const softwareSamples = selectedAgentDetailsQuery.data?.latest_report?.installed_apps?.sample ?? [];

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

  function findTemplateForAgent(windowsPrefix: string, linuxPrefix: string): string | null {
    const items = operationTemplatesQuery.data ?? [];
    const wantWindows = isWindowsAgent(selectedAgent);
    const first = items.find((item) => item.active && item.key.startsWith(wantWindows ? windowsPrefix : linuxPrefix))?.key;
    const fallback = items.find((item) => item.active && item.key.startsWith(wantWindows ? linuxPrefix : windowsPrefix))?.key;
    return first ?? fallback ?? null;
  }

  async function executeOperation(payload: ExecuteOperationRequest, openResultModal = false) {
    try {
      const result = await apiPost<ExecuteOperationResponse>("/operations/execute", payload, headers);
      toast.showSuccess(`Operacao enviada. Job ${result.job_id}`);
      setLatestOperationJobId(result.job_id);
      if (openResultModal) setOpenOperationResults(true);
      return result;
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao executar operacao.");
      return null;
    }
  }

  async function runPing() {
    if (!selectedAgentId) {
      toast.showError("Selecione um agent.");
      return;
    }
    const templateKey = findTemplateForAgent("win-network-ping", "linux-network-ping");
    if (!templateKey) {
      toast.showError("Template de ping nao encontrado.");
      return;
    }
    await executeOperation(
      {
        template_key: templateKey,
        target_agent_ids: [selectedAgentId],
        params: { host: pingHost.trim(), count: 4 },
        rollout_profile: "safe",
      },
      true
    );
  }

  async function runSpeedTest() {
    if (!selectedAgentId) {
      toast.showError("Selecione um agent.");
      return;
    }
    const templateKey = findTemplateForAgent("win-network-speed", "linux-network-speed");
    if (!templateKey) {
      toast.showError("Template de speed test nao encontrado.");
      return;
    }
    await executeOperation(
      {
        template_key: templateKey,
        target_agent_ids: [selectedAgentId],
        params: { target_url: speedUrl.trim(), duration_seconds: 10 },
        rollout_profile: "safe",
      },
      true
    );
  }

  async function runServiceControl() {
    if (!selectedAgentId) {
      toast.showError("Selecione um agent.");
      return;
    }
    const templateKey = serviceOperation === "status"
      ? findTemplateForAgent("win-service-status", "linux-service-status")
      : findTemplateForAgent("win-service-restart", "linux-service-restart");
    if (!templateKey) {
      toast.showError("Template de servico nao encontrado.");
      return;
    }

    if ((serviceOperation === "stop" || serviceOperation === "restart") && !window.confirm(`Confirmar ${serviceOperation} no servico ${serviceName}?`)) {
      return;
    }

    await executeOperation(
      {
        template_key: templateKey,
        target_agent_ids: [selectedAgentId],
        params: { service_name: serviceName.trim(), operation: serviceOperation },
        rollout_profile: "safe",
      },
      true
    );
  }

  async function runUninstall() {
    if (!selectedAgentId) {
      toast.showError("Selecione um agent.");
      return;
    }
    if (!packageIdentifier.trim()) {
      toast.showError("Selecione um software para desinstalar.");
      return;
    }
    if (!window.confirm(`Desinstalar ${packageIdentifier}? Esta acao eh destrutiva.`)) {
      return;
    }
    const templateKey = findTemplateForAgent("win-software-uninstall-winget", "linux-software-uninstall-package");
    if (!templateKey) {
      toast.showError("Template de desinstalacao nao encontrado.");
      return;
    }
    const result = await executeOperation(
      {
        template_key: templateKey,
        target_agent_ids: [selectedAgentId],
        params: { package_identifier: packageIdentifier.trim(), manager: "auto" },
        rollout_profile: "safe",
      },
      true
    );
    if (result) setPackageIdentifier("");
  }

  async function queryLogs() {
    if (!selectedAgentId) {
      toast.showError("Selecione um agent.");
      return;
    }
    const since = Math.max(10, Math.min(logSinceMinutes, 10_080));
    const limit = Math.max(100, Math.min(logLimitLines, 5_000));
    const payload: AgentLogsQueryRequest = {
      source: logSource,
      level: logLevel,
      since_minutes: since,
      limit_lines: limit,
      contains: logContains.trim() || undefined,
    };

    try {
      const result = await apiPost<ExecuteOperationResponse>(
        `/agents/${encodeURIComponent(selectedAgentId)}/logs/query`,
        payload,
        headers
      );
      setLatestLogJobId(result.job_id);
      setOpenLogResults(true);
      toast.showSuccess(`Coleta de logs iniciada. Job ${result.job_id}`);
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao consultar logs.");
    }
  }

  return (
    <div className="page-content">
      <PageHeader title="Agents" subtitle="Inventario operacional, saude e operacoes remotas" />

      <Card title="Inventario de Agents">
        <div className="row">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar host, agent_id, SO" />
          <select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="healthy">Saudaveis</option>
            <option value="offline">Sem check-in</option>
          </select>
        </div>

        {filteredAgents.length === 0 ? (
          <EmptyState title="Nenhum agent encontrado" subtitle="Ajuste os filtros para visualizar resultados." />
        ) : (
          <Table headers={["Host", "Agent ID", "SO", "Agent", "Service", "Last Seen", "saude", "Acoes"]}>
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
                      Operacoes
                    </button>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal open={Boolean(selectedAgentId)} title={`Operacoes ${selectedAgentId ?? ""}`} onClose={() => setSelectedAgentId(null)} wide>
        {selectedAgentDetailsQuery.data ? (
          <>
            <div className="detail-grid">
              <div>
                <h4>Resumo</h4>
                <p>
                  Host: {selectedAgentDetailsQuery.data.agent.hostname}<br />
                  Agent: {selectedAgentDetailsQuery.data.agent.agent_id}<br />
                  SO: {selectedAgentDetailsQuery.data.agent.os_name} {selectedAgentDetailsQuery.data.agent.os_version}<br />
                  ultimo check-in: {formatTime(selectedAgentDetailsQuery.data.agent.last_seen)}
                </p>
              </div>
              <div>
                <h4>Rede</h4>
                <label>
                  Host (ping)
                  <input value={pingHost} onChange={(event) => setPingHost(event.target.value)} />
                </label>
                <button type="button" onClick={() => void runPing()}>Executar ping</button>
                <label>
                  URL (speed test)
                  <input value={speedUrl} onChange={(event) => setSpeedUrl(event.target.value)} />
                </label>
                <p className="small">Sugestao para teste sem TLS: http://speedtest.tele2.net/100MB.zip</p>
                <button type="button" onClick={() => void runSpeedTest()}>Executar speed test</button>
              </div>
            </div>

            <div className="detail-grid">
              <div>
                <h4>Servicos</h4>
                <label>
                  Servico detectado
                  <select value={serviceName} onChange={(event) => setServiceName(event.target.value)}>
                    {serviceName && !serviceSamples.includes(serviceName) ? <option value={serviceName}>{serviceName}</option> : null}
                    {serviceSamples.length === 0 ? <option value="">(sem amostra)</option> : null}
                    {serviceSamples.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Acao
                  <select value={serviceOperation} onChange={(event) => setServiceOperation(event.target.value as "status" | "start" | "stop" | "restart")}>
                    <option value="status">status</option>
                    <option value="start">start</option>
                    <option value="stop">stop</option>
                    <option value="restart">restart</option>
                  </select>
                </label>
                <button type="button" onClick={() => void runServiceControl()}>Executar acao no servico</button>
              </div>
              <div>
                <h4>Softwares</h4>
                <label>
                  Software detectado
                  <select value={packageIdentifier} onChange={(event) => setPackageIdentifier(event.target.value)}>
                    <option value="">Selecione um software</option>
                    {packageIdentifier && !softwareSamples.some((app) => app.name === packageIdentifier) ? (
                      <option value={packageIdentifier}>{packageIdentifier}</option>
                    ) : null}
                    {softwareSamples.map((app) => (
                      <option key={`${app.name}-${app.version ?? ""}`} value={app.name}>{`${app.name}${app.version ? ` (${app.version})` : ""}`}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => void runUninstall()}>Desinstalar pacote</button>
              </div>
            </div>

            <div className="detail-grid">
              <div>
                <h4>Logs do sistema</h4>
                <label>
                  Fonte
                  <select value={logSource} onChange={(event) => setLogSource(event.target.value as "event_system" | "event_application" | "event_security" | "journal")}>
                    <option value="event_system">event_system</option>
                    <option value="event_application">event_application</option>
                    <option value="event_security">event_security</option>
                    <option value="journal">journal</option>
                  </select>
                </label>
                {logSource === "event_security" ? (
                  <p className="small">event_security exige agent em modo servico com privilegio elevado.</p>
                ) : null}
                <label>
                  nivel
                  <select value={logLevel} onChange={(event) => setLogLevel(event.target.value as "info" | "warn" | "error" | "critical") }>
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                    <option value="critical">critical</option>
                  </select>
                </label>
                <div className="row">
                  <label>
                    Janela (min)
                    <input
                      type="number"
                      min={10}
                      max={10080}
                      value={logSinceMinutes}
                      onChange={(event) => setLogSinceMinutes(Number(event.target.value || 10))}
                    />
                  </label>
                  <label>
                    Limite linhas
                    <input
                      type="number"
                      min={100}
                      max={5000}
                      value={logLimitLines}
                      onChange={(event) => setLogLimitLines(Number(event.target.value || 500))}
                    />
                  </label>
                </div>
                <label>
                  Filtro texto (contains)
                  <input value={logContains} onChange={(event) => setLogContains(event.target.value)} placeholder="Erro, timeout, spooler..." />
                </label>
                <div className="row">
                  <button type="button" onClick={() => void queryLogs()}>Consultar logs</button>
                  {latestLogJobId ? (
                    <button className="btn-secondary" type="button" onClick={() => setOpenLogResults(true)}>
                      Ver resultado do job {latestLogJobId}
                    </button>
                  ) : null}
                </div>
              </div>
              <div>
                <h4>Resultados</h4>
                <div className="row">
                  {latestOperationJobId ? (
                    <button className="btn-secondary" type="button" onClick={() => setOpenOperationResults(true)}>
                      Ver execucao de operacao ({latestOperationJobId})
                    </button>
                  ) : (
                    <p className="small">Sem operacao recente.</p>
                  )}
                </div>
                <div className="row">
                  {latestLogJobId ? (
                    <button className="btn-secondary" type="button" onClick={() => setOpenLogResults(true)}>
                      Ver logs coletados ({latestLogJobId})
                    </button>
                  ) : (
                    <p className="small">Sem coleta de logs recente.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="small">Carregando detalhes...</p>
        )}
      </Modal>

      <Modal
        open={openOperationResults}
        title={`Resultado da operacao (job ${latestOperationJobId ?? "-"})`}
        onClose={() => setOpenOperationResults(false)}
        wide
      >
        {(operationExecutionsQuery.data ?? []).length === 0 ? (
          <EmptyState title="Sem execucoes ainda" subtitle="Aguardando retorno do agent." />
        ) : (
          <Table headers={["Exec", "Agent", "Status", "Exit", "Duracao", "Saida", "Atualizado"]}>
            {(operationExecutionsQuery.data ?? []).map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.agent_id}</td>
                <td>
                  <Badge tone={item.status === "failed" || item.status === "timeout" ? "error" : item.status === "success" ? "ok" : "warn"}>
                    {item.status}
                  </Badge>
                </td>
                <td>{item.exit_code ?? "-"}</td>
                <td>{item.duration_ms ?? "-"} ms</td>
                <td>{summarizeOutput(item.stdout, item.stderr)}</td>
                <td>{formatTime(item.updated_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Modal>

      <Modal
        open={openLogResults}
        title={`Resultado de logs (job ${latestLogJobId ?? "-"})`}
        onClose={() => setOpenLogResults(false)}
        wide
      >
        {(logResultsQuery.data ?? []).length === 0 ? (
          <EmptyState title="Sem logs retornados" subtitle="Aguarde o processamento do job de coleta." />
        ) : (
          <pre className="log-pre">
            {(logResultsQuery.data ?? [])
              .map((item) => `#${item.execution_id} ${item.agent_id} ${item.status}\n${item.stdout ?? ""}\n${item.stderr ?? ""}`.trim())
              .join("\n\n")}
          </pre>
        )}
      </Modal>
    </div>
  );
}

