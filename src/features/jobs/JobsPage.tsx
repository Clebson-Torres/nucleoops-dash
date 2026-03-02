import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAuth } from "../../lib/auth/AuthContext";
import { apiGet, apiPost, apiPostForm } from "../../lib/api/client";
import { formatBytes, formatTime, sanitizePath, summarizeOutput } from "../../lib/format";
import type {
  AllowedCommand,
  Agent,
  Artifact,
  Job,
  JobCreateRequest,
  JobCreateResponse,
  JobExecution,
  JobWave,
  RolloutProfile,
} from "../../types/api";
import { useToast } from "../../components/ui/Toast";

type FixedTemplate = {
  key: string;
  name: string;
  label: string;
  commandText: string;
  platform: "windows" | "linux" | "any";
  category: "network" | "services" | "software" | "logs";
};

type QuickTemplate = {
  key: string;
  label: string;
  source: "fixed" | "admin" | "execute";
  commandText?: string;
  commandId?: number;
  commandName?: string;
  platform?: "windows" | "linux" | "any";
  category?: "network" | "services" | "software" | "logs";
};

const FIXED_TEMPLATES: FixedTemplate[] = [
  { key: "win-dns-flush", name: "win-dns-flush", label: "Windows DNS Flush", commandText: "ipconfig /flushdns", platform: "windows", category: "network" },
  { key: "win-gpupdate-force", name: "win-gpupdate-force", label: "Windows GPUpdate Force", commandText: "gpupdate /force", platform: "windows", category: "services" },
  { key: "win-spooler-restart", name: "win-spooler-restart", label: "Windows Restart Spooler", commandText: "Restart-Service -Name 'Spooler' -Force", platform: "windows", category: "services" },
  {
    key: "win-winget-upgrade-all",
    name: "win-winget-upgrade-all",
    label: "Windows Winget Upgrade All",
    commandText: "winget upgrade --all --silent --accept-package-agreements --accept-source-agreements",
    platform: "windows",
    category: "software",
  },
  {
    key: "win-disk-clean-temp",
    name: "win-disk-clean-temp",
    label: "Windows Clean Temp",
    commandText:
      "PowerShell -NoProfile -Command \"Get-ChildItem $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue\"",
    platform: "windows",
    category: "software",
  },
  {
    key: "win-quick-diagnostics",
    name: "win-quick-diagnostics",
    label: "Windows Quick Diagnostics",
    commandText: "systeminfo; ipconfig /all; Get-Service | Where-Object {$_.Status -eq 'Running'} | Select-Object -First 30",
    platform: "windows",
    category: "logs",
  },
  { key: "linux-apt-update", name: "linux-apt-update", label: "Linux APT Update", commandText: "sudo -n apt-get update -y", platform: "linux", category: "software" },
  {
    key: "linux-apt-upgrade",
    name: "linux-apt-upgrade",
    label: "Linux APT Upgrade",
    commandText: "sudo -n env DEBIAN_FRONTEND=noninteractive apt-get upgrade -y",
    platform: "linux",
    category: "software",
  },
  { key: "linux-disk-usage", name: "linux-disk-usage", label: "Linux Disk Usage", commandText: "df -h", platform: "linux", category: "logs" },
  { key: "linux-system-uptime", name: "linux-system-uptime", label: "Linux Uptime + Memory", commandText: "uptime && free -h", platform: "linux", category: "logs" },
  {
    key: "linux-restart-service-template",
    name: "linux-restart-service-template",
    label: "Linux Restart Service (Template)",
    commandText: "sudo -n systemctl restart <service_name>",
    platform: "linux",
    category: "services",
  },
  { key: "linux-journal-tail", name: "linux-journal-tail", label: "Linux Journal Tail", commandText: "sudo -n journalctl -n 200 --no-pager", platform: "linux", category: "logs" },
];

const EXECUTE_TEMPLATES: FixedTemplate[] = [
  { key: "exec-auto", name: "exec-auto", label: "Auto by selected artifact", commandText: "{{auto_silent}}", platform: "any", category: "software" },
  { key: "exec-msi-silent", name: "exec-msi-silent", label: "Install MSI silent", commandText: "msiexec /i {{artifact_path}} /qn /norestart", platform: "windows", category: "software" },
  {
    key: "exec-exe-silent",
    name: "exec-exe-silent",
    label: "Install EXE silent",
    commandText: "Start-Process -FilePath {{artifact_path}} -ArgumentList '/S','/quiet','/norestart' -Wait",
    platform: "windows",
    category: "software",
  },
  { key: "exec-ps1", name: "exec-ps1", label: "Run PS1 script", commandText: "powershell -NoProfile -ExecutionPolicy Bypass -File {{artifact_path}}", platform: "windows", category: "software" },
  { key: "exec-cmd", name: "exec-cmd", label: "Run CMD/BAT script", commandText: "cmd /c {{artifact_path}}", platform: "windows", category: "software" },
];

type JobAction = "run_command" | "download_artifact" | "download_and_execute";

function poll(intervalMs: number) {
  return () => (document.hidden ? false : intervalMs);
}

function autoSilentCommand(fileName?: string): string {
  const lower = (fileName || "").toLowerCase();
  if (lower.endsWith(".msi")) return "msiexec /i {{artifact_path}} /qn /norestart";
  if (lower.endsWith(".ps1")) return "powershell -NoProfile -ExecutionPolicy Bypass -File {{artifact_path}}";
  if (lower.endsWith(".cmd") || lower.endsWith(".bat")) return "cmd /c {{artifact_path}} /quiet";
  if (lower.endsWith(".exe")) return "Start-Process -FilePath {{artifact_path}} -ArgumentList '/S','/quiet','/norestart' -Wait";
  return "{{artifact_path}} /quiet /norestart";
}

export function JobsPage() {
  const auth = useAuth();
  const toast = useToast();
  const headers = auth.getAuthHeadersState();

  const [name, setName] = useState("job-manual");
  const [action, setAction] = useState<JobAction>("run_command");
  const [command, setCommand] = useState("echo hello from ui");
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [rolloutProfile, setRolloutProfile] = useState<RolloutProfile>("balanced");
  const [manualBatch, setManualBatch] = useState(false);
  const [batchSize, setBatchSize] = useState(50);
  const [batchDelaySeconds, setBatchDelaySeconds] = useState(15);
  const [targetPath, setTargetPath] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<number | null>(null);
  const [selectedAllowedCommandId, setSelectedAllowedCommandId] = useState<number | null>(null);
  const [selectedQuickTemplateKey, setSelectedQuickTemplateKey] = useState<string>("");
  const [templatePlatformFilter, setTemplatePlatformFilter] = useState<"all" | "windows" | "linux" | "any">("all");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<"all" | "network" | "services" | "software" | "logs">("all");
  const [useDirectCommand, setUseDirectCommand] = useState(true);
  const [jobFilter, setJobFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<JobExecution | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAllJobs, setShowAllJobs] = useState(false);

  const agentsQuery = useQuery({
    queryKey: ["jobs-agents", headers.accessToken],
    queryFn: () => apiGet<Agent[]>("/agents?limit=400", headers),
    refetchInterval: poll(15_000),
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs-list", headers.accessToken],
    queryFn: () => apiGet<Job[]>("/jobs?limit=300", headers),
    refetchInterval: poll(15_000),
  });

  const artifactsQuery = useQuery({
    queryKey: ["jobs-artifacts", headers.accessToken],
    queryFn: () => apiGet<Artifact[]>("/artifacts?limit=200", headers),
    refetchInterval: poll(15_000),
  });

  const allowedCommandsQuery = useQuery({
    queryKey: ["allowed-commands", headers.accessToken],
    queryFn: () => apiGet<AllowedCommand[]>("/commands?limit=300", headers),
    refetchInterval: poll(15_000),
  });

  const executionsQuery = useQuery({
    queryKey: ["job-executions", selectedJob?.id, headers.accessToken],
    queryFn: () => apiGet<JobExecution[]>(`/jobs/${selectedJob?.id ?? 0}/executions?limit=500`, headers),
    enabled: Boolean(selectedJob),
    refetchInterval: selectedJob ? poll(5_000) : false,
  });

  const wavesQuery = useQuery({
    queryKey: ["job-waves", selectedJob?.id, headers.accessToken],
    queryFn: () => apiGet<JobWave[]>(`/jobs/${selectedJob?.id ?? 0}/waves`, headers),
    enabled: Boolean(selectedJob),
    refetchInterval: selectedJob ? poll(5_000) : false,
  });

  const filteredJobs = useMemo(() => {
    const list = jobsQuery.data ?? [];
    const filtered = list.filter((job) => {
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      const needle = jobFilter.trim().toLowerCase();
      const matchesText = !needle || `${job.id} ${job.name} ${job.action_type}`.toLowerCase().includes(needle);
      return matchesStatus && matchesText;
    });

    return filtered.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  }, [jobsQuery.data, jobFilter, statusFilter]);

  const visibleJobs = useMemo(() => {
    if (showAllJobs) return filteredJobs;
    return filteredJobs.slice(0, 10);
  }, [filteredJobs, showAllJobs]);

  const quickTemplates = useMemo<QuickTemplate[]>(() => {
    const adminCommands = (allowedCommandsQuery.data ?? [])
      .filter((item) => item.active && item.created_by && item.created_by !== "system")
      .map((item) => ({
        key: `admin:${item.id}`,
        label: `${item.name} [Admin]`,
        source: "admin" as const,
        commandId: item.id,
        commandText: item.command_text,
        commandName: item.name,
        platform: "any" as const,
        category: "services" as const,
      }));

    const fixed = FIXED_TEMPLATES.map((item) => ({
      key: `fixed:${item.key}`,
      label: `${item.label} [Padrao]`,
      source: "fixed" as const,
      commandText: item.commandText,
      commandName: item.name,
      platform: item.platform,
      category: item.category,
    }));

    return [...fixed, ...adminCommands].filter((item) => {
      const platformOk =
        templatePlatformFilter === "all" ||
        item.platform === templatePlatformFilter ||
        item.platform === "any";
      const categoryOk = templateCategoryFilter === "all" || item.category === templateCategoryFilter;
      return platformOk && categoryOk;
    });
  }, [allowedCommandsQuery.data, templatePlatformFilter, templateCategoryFilter]);

  const executeTemplates = useMemo<QuickTemplate[]>(() => {
    return EXECUTE_TEMPLATES.map((item) => ({
      key: `execute:${item.key}`,
      label: `${item.label} [Execucao]`,
      source: "execute" as const,
      commandText: item.commandText,
      commandName: item.name,
      platform: item.platform,
      category: item.category,
    }));
  }, []);

  const needsArtifact = action === "download_artifact" || action === "download_and_execute";
  const needsCommand = action === "run_command" || action === "download_and_execute";
  const isDownloadAndExecute = action === "download_and_execute";
  const role = auth.role ?? "admin";
  const forceAllowList = role === "support";
  const displayedQuickTemplates = action === "download_and_execute" ? executeTemplates : quickTemplates;

  useEffect(() => {
    if (role === "support" && action === "download_and_execute") {
      setAction("run_command");
    }
  }, [role, action]);

  useEffect(() => {
    setSelectedQuickTemplateKey("");
  }, [action]);

  useEffect(() => {
    if (isDownloadAndExecute) {
      setUseDirectCommand(true);
      setSelectedAllowedCommandId(null);
    }
  }, [isDownloadAndExecute]);

  function toggleTarget(agentId: string, checked: boolean) {
    setSelectedTargets((prev) => {
      if (checked) return [...new Set([...prev, agentId])];
      return prev.filter((id) => id !== agentId);
    });
  }

  function applyTemplate(templateKey: string) {
    setSelectedQuickTemplateKey(templateKey);
    const selected = displayedQuickTemplates.find((item) => item.key === templateKey);
    if (!selected) return;

    if (selected.source === "execute") {
      const raw = selected.commandText ?? "";
      if (raw === "{{auto_silent}}") {
        const selectedArtifact = (artifactsQuery.data ?? []).find((item) => item.id === selectedArtifactId);
        setCommand(autoSilentCommand(selectedArtifact?.file_name));
      } else {
        setCommand(raw);
      }
      return;
    }

    if (selected.source === "admin") {
      if (selected.commandId) setSelectedAllowedCommandId(selected.commandId);
      if (role === "admin" && selected.commandText) setCommand(selected.commandText);
      return;
    }

    const matchedAllow = (allowedCommandsQuery.data ?? []).find((item) => item.active && item.name === selected.commandName);

    if (matchedAllow) {
      setSelectedAllowedCommandId(matchedAllow.id);
    }

    if (role === "admin") {
      if (selected.commandText) setCommand(selected.commandText);
    } else if (!matchedAllow) {
      toast.showError("Template requer aprovacao allowlist para suporte.");
    }
  }

  async function createJob() {
    try {
      if (!name.trim()) throw new Error("Informe um nome para o job.");
      if (selectedTargets.length === 0) throw new Error("Selecione ao menos um target.");
      if (needsArtifact && !selectedArtifactId) throw new Error("Selecione um artefato.");
      if (needsCommand && !forceAllowList && useDirectCommand && !command.trim()) {
        throw new Error("Informe o comando.");
      }
      if (needsCommand && (forceAllowList || !useDirectCommand) && !selectedAllowedCommandId) {
        throw new Error("Selecione um comando permitido.");
      }

      const payload: JobCreateRequest = {
        name: name.trim(),
        action_type: action,
        target_agent_ids: selectedTargets,
        timeout_seconds: timeoutSeconds,
        rollout_profile: rolloutProfile,
      };

      if (needsArtifact && selectedArtifactId) {
        payload.artifact_id = selectedArtifactId;
      }
      if (needsArtifact && targetPath.trim()) {
        payload.target_path = sanitizePath(targetPath.trim());
      }
      if (needsCommand) {
        if (forceAllowList || !useDirectCommand) {
          if (selectedAllowedCommandId) payload.command_id = selectedAllowedCommandId;
        } else {
          payload.command = command.trim();
          if (selectedAllowedCommandId) payload.command_id = selectedAllowedCommandId;
        }
      }
      if (manualBatch) {
        payload.batch_size = batchSize;
        payload.batch_delay_seconds = batchDelaySeconds;
      }

      const response = await apiPost<JobCreateResponse>("/jobs", payload, headers);
      toast.showSuccess(`Job criado com sucesso (id ${response.job_id}).`);
      await jobsQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao criar job.");
    }
  }

  async function uploadArtifact(file: File | null) {
    if (!file) {
      toast.showError("Selecione um arquivo para upload.");
      return;
    }
    try {
      setUploading(true);
      const form = new FormData();
      form.append("file", file);
      const artifact = await apiPostForm<Artifact>("/artifacts", form, headers);
      setSelectedArtifactId(artifact.id);
      toast.showSuccess(`Artefato enviado: ${artifact.file_name}`);
      await artifactsQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha no upload.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="page-content">
      <PageHeader title="Jobs" subtitle="Rollout em ondas, execucao e rastreabilidade operacional" />

      <div className="two-col-grid">
        <Card title="Criar Job">
          <div className="form-grid">
            <label>
              Nome
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Acao
              <select value={action} onChange={(event) => setAction(event.target.value as JobAction)}>
                <option value="run_command">run_command</option>
                <option value="download_artifact">download_artifact</option>
                {role === "admin" ? <option value="download_and_execute">download_and_execute</option> : null}
              </select>
            </label>
            <label>
              Timeout (s)
              <input type="number" min={10} value={timeoutSeconds} onChange={(event) => setTimeoutSeconds(Number(event.target.value || 60))} />
            </label>
            <label>
              Perfil rollout
              <select value={rolloutProfile} onChange={(event) => setRolloutProfile(event.target.value as RolloutProfile)}>
                <option value="safe">safe</option>
                <option value="balanced">balanced</option>
                <option value="fast">fast</option>
              </select>
            </label>
          </div>

          <div className="row">
            <label className="check-inline">
              <input type="checkbox" checked={manualBatch} onChange={(event) => setManualBatch(event.target.checked)} />
              Ajuste manual de batch
            </label>
          </div>
          {manualBatch ? (
            <div className="row">
              <label>
                Batch size
                <input type="number" min={1} value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value || 1))} />
              </label>
              <label>
                Delay entre ondas (s)
                <input type="number" min={0} value={batchDelaySeconds} onChange={(event) => setBatchDelaySeconds(Number(event.target.value || 0))} />
              </label>
            </div>
          ) : null}

          {needsCommand ? (
            <>
              {forceAllowList ? <p className="small">Perfil support: apenas command_id allowlist e permitido.</p> : null}
              <div className="row">
                <select value={selectedQuickTemplateKey} onChange={(event) => applyTemplate(event.target.value)}>
                  <option value="" disabled>
                    Template rapido
                  </option>
                  {displayedQuickTemplates.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.label}
                    </option>
                  ))}
                </select>
                {!isDownloadAndExecute ? (
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={forceAllowList ? false : useDirectCommand}
                      disabled={forceAllowList}
                      onChange={(event) => setUseDirectCommand(event.target.checked)}
                    />
                    Comando direto (admin)
                  </label>
                ) : null}
              </div>
              {!isDownloadAndExecute ? (
                <div className="row">
                  <label>
                    Plataforma template
                    <select value={templatePlatformFilter} onChange={(event) => setTemplatePlatformFilter(event.target.value as "all" | "windows" | "linux" | "any")}>
                      <option value="all">all</option>
                      <option value="windows">windows</option>
                      <option value="linux">linux</option>
                      <option value="any">any</option>
                    </select>
                  </label>
                  <label>
                    Categoria template
                    <select value={templateCategoryFilter} onChange={(event) => setTemplateCategoryFilter(event.target.value as "all" | "network" | "services" | "software" | "logs")}>
                      <option value="all">all</option>
                      <option value="network">network</option>
                      <option value="services">services</option>
                      <option value="software">software</option>
                      <option value="logs">logs</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {!isDownloadAndExecute ? (
                <select
                  value={selectedAllowedCommandId ?? ""}
                  onChange={(event) => setSelectedAllowedCommandId(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">Comando permitido (opcional para admin)</option>
                  {(allowedCommandsQuery.data ?? [])
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        #{item.id} {item.name}
                      </option>
                    ))}
                </select>
              ) : (
                <p className="small">Modo download_and_execute: use os templates de execucao acima.</p>
              )}

              <textarea
                disabled={forceAllowList || !useDirectCommand}
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder={forceAllowList ? "support nao pode usar comando direto" : ""}
              />
            </>
          ) : null}

          {needsArtifact ? (
            <>
              <select
                value={selectedArtifactId ?? ""}
                onChange={(event) => setSelectedArtifactId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">Selecione artefato</option>
                {(artifactsQuery.data ?? []).map((artifact) => (
                  <option key={artifact.id} value={artifact.id}>
                    {artifact.file_name} ({formatBytes(artifact.size_bytes)})
                  </option>
                ))}
              </select>
              <label>
                Destino no agent (opcional)
                <input value={targetPath} onChange={(event) => setTargetPath(event.target.value)} placeholder="app\\update.msi" />
              </label>
              <label className="upload-inline">
                Upload artefato
                <input type="file" onChange={(event) => void uploadArtifact(event.target.files?.[0] ?? null)} disabled={uploading} />
              </label>
              {action === "download_and_execute" ? (
                <p className="small">Comando auto-silent sugerido: {autoSilentCommand((artifactsQuery.data ?? []).find((a) => a.id === selectedArtifactId)?.file_name)}</p>
              ) : null}
            </>
          ) : null}

          <div className="target-list">
            {(agentsQuery.data ?? []).map((agent) => (
              <label key={agent.agent_id} className="target-item">
                <input
                  type="checkbox"
                  checked={selectedTargets.includes(agent.agent_id)}
                  onChange={(event) => toggleTarget(agent.agent_id, event.target.checked)}
                />
                {agent.hostname} <span className="small">({agent.agent_id})</span>
              </label>
            ))}
          </div>

          <div className="row">
            <button type="button" onClick={() => void createJob()}>
              Criar job
            </button>
            <button className="btn-secondary" type="button" onClick={() => setSelectedTargets((agentsQuery.data ?? []).map((item) => item.agent_id))}>
              Selecionar todos
            </button>
          </div>
        </Card>

        <Card title="Lista de Jobs">
          <div className="row">
            <input value={jobFilter} onChange={(event) => setJobFilter(event.target.value)} placeholder="Buscar por id/nome/Acao" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="pending">pending</option>
              <option value="running">running</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
          </div>

          {filteredJobs.length === 0 ? (
            <EmptyState title="Nenhum job encontrado" subtitle="Ajuste filtros ou crie um novo job." />
          ) : (
            <Table headers={["ID", "Nome", "Status", "Rollout", "Atualizado", "Acoes"]}>
              {visibleJobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.id}</td>
                  <td>{job.name}</td>
                  <td>
                    <Badge tone={job.status === "failed" ? "error" : job.status === "completed" ? "ok" : "warn"}>{job.status}</Badge>
                  </td>
                  <td>
                    {job.rollout_profile} ({job.batch_size}/{job.batch_delay_seconds}s)
                  </td>
                  <td>{formatTime(job.updated_at)}</td>
                  <td>
                    <button className="btn-secondary" type="button" onClick={() => setSelectedJob(job)}>
                      Ver execucoes
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          {filteredJobs.length > 10 ? (
            <div className="row">
              <button className="btn-secondary" type="button" onClick={() => setShowAllJobs((prev) => !prev)}>
                {showAllJobs ? "Mostrar apenas 10 ultimas" : `Expandir lista (${filteredJobs.length})`}
              </button>
            </div>
          ) : null}
        </Card>
      </div>

      <Modal open={Boolean(selectedJob)} title={`execucoes do Job ${selectedJob?.id ?? ""}`} onClose={() => setSelectedJob(null)} wide>
        {(executionsQuery.data ?? []).length === 0 ? (
          <EmptyState title="Sem execucoes" subtitle="Aguardando primeiro resultado dos agents." />
        ) : (
          <Table headers={["Exec", "Agent", "Status", "Wave", "Tentativas", "Exit", "Saida", "Atualizado", "Acoes"]}>
            {(executionsQuery.data ?? []).map((execution) => (
              <tr key={execution.id}>
                <td>{execution.id}</td>
                <td>{execution.agent_id}</td>
                <td>
                  <Badge tone={execution.status === "failed" || execution.status === "timeout" ? "error" : execution.status === "success" ? "ok" : "warn"}>
                    {execution.status}
                  </Badge>
                </td>
                <td>{execution.wave_no}</td>
                <td>{execution.attempts}</td>
                <td>{execution.exit_code ?? "-"}</td>
                <td>{summarizeOutput(execution.stdout, execution.stderr)}</td>
                <td>{formatTime(execution.updated_at)}</td>
                <td>
                  <button className="btn-secondary" type="button" onClick={() => setSelectedExecution(execution)}>
                    Log completo
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}

        <h3>Ondas</h3>
        {(wavesQuery.data ?? []).length === 0 ? (
          <p className="small">Sem dados de ondas para este job.</p>
        ) : (
          <div className="waves-grid">
            {(wavesQuery.data ?? []).map((wave) => {
              const finished = wave.success + wave.failed + wave.timeout;
              const progress = wave.total > 0 ? Math.round((finished / wave.total) * 100) : 0;
              return (
                <div key={wave.wave_no} className="wave-card">
                  <div className="wave-title">Onda {wave.wave_no}</div>
                  <div className="wave-progress">
                    <div className="wave-progress-bar" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="small">
                    total {wave.total} | ok {wave.success} | failed {wave.failed} | timeout {wave.timeout} | running {wave.running}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(selectedExecution)} title={`Log execucao ${selectedExecution?.id ?? ""}`} onClose={() => setSelectedExecution(null)}>
        {selectedExecution ? (
          <pre className="log-pre">{[
            `status: ${selectedExecution.status}`,
            `exit_code: ${selectedExecution.exit_code ?? "-"}`,
            `duration_ms: ${selectedExecution.duration_ms ?? "-"}`,
            `updated_at: ${selectedExecution.updated_at}`,
            "",
            "=== STDOUT ===",
            selectedExecution.stdout ?? "(vazio)",
            "",
            "=== STDERR ===",
            selectedExecution.stderr ?? "(vazio)",
            "",
            "=== ERROR_MESSAGE ===",
            selectedExecution.error_message ?? "(vazio)",
          ].join("\n")}</pre>
        ) : null}
      </Modal>
    </div>
  );
}


