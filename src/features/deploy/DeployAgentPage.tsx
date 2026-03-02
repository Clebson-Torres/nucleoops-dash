import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Table } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { apiGet, apiPost } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/AuthContext";
import { useToast } from "../../components/ui/Toast";
import { formatTime } from "../../lib/format";
import type {
  AgentDeploymentDetails,
  AgentDownloadArtifact,
  AgentDownloadManifest,
  CreateAgentDeploymentRequest,
  CreateAgentDeploymentResponse,
  CreateDeploymentCredentialRequest,
  DeploymentCredential,
  RetryDeploymentResponse,
  TenantSummary,
} from "../../types/api";

function poll(intervalMs: number) {
  return () => (document.hidden ? false : intervalMs);
}

type ParsedHost = { host: string; port?: number; platform?: "windows" | "linux" };

function parseHosts(raw: string): ParsedHost[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      const host = parts[0] ?? "";
      const port = parts[1] ? Number(parts[1]) : undefined;
      const platform = parts[2] === "windows" || parts[2] === "linux"
        ? (parts[2] as "windows" | "linux")
        : undefined;
      return { host, port: Number.isFinite(port) ? port : undefined, platform };
    })
    .filter((item) => item.host.length > 0);
}

function pickArtifact(
  artifacts: AgentDownloadArtifact[],
  platform: "windows" | "linux",
  version: string
): AgentDownloadArtifact | null {
  const filtered = artifacts.filter((item) => item.platform === platform && item.arch === "x64");
  if (filtered.length === 0) return null;
  const exact = filtered.find((item) => item.version === version.trim());
  if (exact) return exact;
  return filtered[filtered.length - 1] ?? null;
}

function sanitizeFileToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function toLinuxRuntimeUrl(raw: string): { expr: string; needsHostDiscovery: boolean } {
  try {
    const parsed = new URL(raw);
    if (!isLoopbackHost(parsed.hostname)) {
      return { expr: raw, needsHostDiscovery: false };
    }
    const port = parsed.port ? `:${parsed.port}` : "";
    return {
      expr: `${parsed.protocol}//<SERVER_IP>${port}${parsed.pathname}${parsed.search}${parsed.hash}`,
      needsHostDiscovery: true,
    };
  } catch {
    return { expr: raw, needsHostDiscovery: false };
  }
}

function remapUrlToBase(rawUrl: string, baseUrl: string): string {
  try {
    const raw = new URL(rawUrl);
    const base = new URL(baseUrl);
    raw.protocol = base.protocol;
    raw.hostname = base.hostname;
    raw.port = base.port;
    return raw.toString();
  } catch {
    return rawUrl;
  }
}

export function DeployAgentPage() {
  const auth = useAuth();
  const toast = useToast();
  const headers = auth.getAuthHeadersState();

  const [tenantId, setTenantId] = useState("default");
  const [tenantToken, setTenantToken] = useState("");
  const [platform, setPlatform] = useState<"windows" | "linux" | "mixed">("linux");
  const [transport, setTransport] = useState<"ssh" | "winrm">("ssh");
  const [agentVersion, setAgentVersion] = useState("latest");
  const [credentialRef, setCredentialRef] = useState<number | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [hostsRaw, setHostsRaw] = useState("");
  const [deploymentId, setDeploymentId] = useState<number | null>(null);
  const [openDetails, setOpenDetails] = useState(false);

  const [credName, setCredName] = useState("");
  const [credKind, setCredKind] = useState<"ssh_key" | "ssh_password" | "winrm_password">("ssh_key");
  const [credUser, setCredUser] = useState("");
  const [credSecret, setCredSecret] = useState("");
  const [credDescription, setCredDescription] = useState("");
  const [serverBaseUrl, setServerBaseUrl] = useState("");

  const tenantsQuery = useQuery({
    queryKey: ["deploy-tenants", headers.accessToken],
    queryFn: () => apiGet<TenantSummary[]>("/tenants?limit=200", headers),
    enabled: auth.role === "admin",
  });

  const credentialsQuery = useQuery({
    queryKey: ["deploy-credentials", headers.accessToken],
    queryFn: () => apiGet<DeploymentCredential[]>("/deployments/credentials?limit=200", headers),
    enabled: auth.role === "admin",
  });

  const manifestQuery = useQuery({
    queryKey: ["deploy-manifest", headers.accessToken],
    queryFn: () => apiGet<AgentDownloadManifest>("/downloads/agent/manifest.json", headers),
    enabled: auth.role === "admin",
  });

  const deploymentDetailsQuery = useQuery({
    queryKey: ["deploy-details", deploymentId, headers.accessToken],
    queryFn: () => apiGet<AgentDeploymentDetails>(`/deployments/${deploymentId ?? 0}`, headers),
    enabled: auth.role === "admin" && Boolean(deploymentId),
    refetchInterval: deploymentId && openDetails ? poll(5_000) : false,
  });

  const windowsArtifact = useMemo<AgentDownloadArtifact | null>(() => {
    const entries = manifestQuery.data?.artifacts ?? [];
    return pickArtifact(entries, "windows", agentVersion);
  }, [manifestQuery.data, agentVersion]);

  const linuxArtifact = useMemo<AgentDownloadArtifact | null>(() => {
    const entries = manifestQuery.data?.artifacts ?? [];
    return pickArtifact(entries, "linux", agentVersion);
  }, [manifestQuery.data, agentVersion]);

  const effectiveServerBase = useMemo(() => {
    const typed = serverBaseUrl.trim().replace(/\/+$/, "");
    if (typed.length > 0) return typed;
    const inferredFromArtifact = windowsArtifact?.url ?? linuxArtifact?.url;
    if (inferredFromArtifact) {
      try {
        return new URL(inferredFromArtifact).origin;
      } catch {
        return window.location.origin.replace(":5173", ":8080");
      }
    }
    return window.location.origin.replace(":5173", ":8080");
  }, [serverBaseUrl, windowsArtifact?.url, linuxArtifact?.url]);

  const oneLinerWindows = useMemo(() => {
    if (!windowsArtifact || !tenantToken.trim()) return "";
    return `powershell -ExecutionPolicy Bypass -Command "iwr -UseBasicParsing '${effectiveServerBase}/downloads/agent/install/windows.ps1' -OutFile $env:TEMP\\install-agent-windows.ps1; & $env:TEMP\\install-agent-windows.ps1 -BinaryUrl '${windowsArtifact.url}' -BinarySha256 '${windowsArtifact.sha256}' -TenantToken '${tenantToken.trim()}' -ServerBaseUrl '${effectiveServerBase}'"`;
  }, [windowsArtifact, tenantToken, effectiveServerBase]);

  const oneLinerLinux = useMemo(() => {
    if (!linuxArtifact || !tenantToken.trim()) return "";
    const normalizedArtifactUrl = remapUrlToBase(linuxArtifact.url, effectiveServerBase);
    const scriptUrl = toLinuxRuntimeUrl(`${effectiveServerBase}/downloads/agent/install/linux.sh`);
    const binaryUrl = toLinuxRuntimeUrl(normalizedArtifactUrl);
    const serverUrl = toLinuxRuntimeUrl(effectiveServerBase);
    return `curl -fsSL "${scriptUrl.expr}" | sudo BINARY_URL="${binaryUrl.expr}" BINARY_SHA256="${linuxArtifact.sha256}" TENANT_TOKEN="${tenantToken.trim()}" SERVER_BASE_URL="${serverUrl.expr}" bash`;
  }, [linuxArtifact, tenantToken, effectiveServerBase]);

  const linuxAutoHostMode = useMemo(() => {
    const server = toLinuxRuntimeUrl(effectiveServerBase);
    const binary = linuxArtifact ? toLinuxRuntimeUrl(linuxArtifact.url) : { expr: "", needsHostDiscovery: false };
    return server.needsHostDiscovery || binary.needsHostDiscovery;
  }, [effectiveServerBase, linuxArtifact]);

  async function copyCommand(label: "Windows" | "Linux", command: string) {
    if (!command) {
      toast.showError(`Comando ${label} indisponivel. Verifique tenant token e manifesto.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(command);
      toast.showSuccess(`Comando ${label} copiado.`);
    } catch {
      toast.showError("Falha ao copiar. Copie manualmente o campo.");
    }
  }

  function buildWindowsInstallerPs1(): string {
    if (!windowsArtifact || !tenantToken.trim()) return "";
    return [
      "$ErrorActionPreference = 'Stop'",
      `$ServerBaseUrl = '${effectiveServerBase}'`,
      `$TenantToken = '${tenantToken.trim()}'`,
      `$BinaryUrl = '${windowsArtifact.url}'`,
      `$BinarySha256 = '${windowsArtifact.sha256}'`,
      "$Installer = Join-Path $env:TEMP 'install-agent-windows.ps1'",
      "Invoke-WebRequest -UseBasicParsing -Uri \"$ServerBaseUrl/downloads/agent/install/windows.ps1\" -OutFile $Installer",
      "& $Installer -BinaryUrl $BinaryUrl -BinarySha256 $BinarySha256 -TenantToken $TenantToken -ServerBaseUrl $ServerBaseUrl",
    ].join("\r\n");
  }

  function buildWindowsInstallerCmd(): string {
    if (!windowsArtifact || !tenantToken.trim()) return "";
    return [
      "@echo off",
      "setlocal",
      `set SERVER_BASE_URL=${effectiveServerBase}`,
      `set TENANT_TOKEN=${tenantToken.trim()}`,
      `set BINARY_URL=${windowsArtifact.url}`,
      `set BINARY_SHA256=${windowsArtifact.sha256}`,
      "powershell -ExecutionPolicy Bypass -Command \"iwr -UseBasicParsing '%SERVER_BASE_URL%/downloads/agent/install/windows.ps1' -OutFile $env:TEMP\\install-agent-windows.ps1; & $env:TEMP\\install-agent-windows.ps1 -BinaryUrl '%BINARY_URL%' -BinarySha256 '%BINARY_SHA256%' -TenantToken '%TENANT_TOKEN%' -ServerBaseUrl '%SERVER_BASE_URL%'\"",
      "endlocal",
    ].join("\r\n");
  }

  function buildLinuxInstallerSh(): string {
    if (!linuxArtifact || !tenantToken.trim()) return "";
    const normalizedArtifactUrl = remapUrlToBase(linuxArtifact.url, effectiveServerBase);
    const server = toLinuxRuntimeUrl(effectiveServerBase);
    const binary = toLinuxRuntimeUrl(normalizedArtifactUrl);
    return [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `SERVER_BASE_URL="${server.expr}"`,
      `TENANT_TOKEN="${tenantToken.trim()}"`,
      `BINARY_URL="${binary.expr}"`,
      `BINARY_SHA256="${linuxArtifact.sha256}"`,
      "curl -fsSL \"$SERVER_BASE_URL/downloads/agent/install/linux.sh\" | sudo BINARY_URL=\"$BINARY_URL\" BINARY_SHA256=\"$BINARY_SHA256\" TENANT_TOKEN=\"$TENANT_TOKEN\" SERVER_BASE_URL=\"$SERVER_BASE_URL\" bash",
    ].join("\n");
  }

  function downloadInstallerFile(kind: "ps1" | "cmd" | "sh") {
    const token = sanitizeFileToken(tenantId || "tenant");
    if (kind === "ps1") {
      const content = buildWindowsInstallerPs1();
      if (!content) {
        toast.showError("Preencha tenant token e valide artefato Windows no manifesto.");
        return;
      }
      downloadTextFile(`nucleoops-install-${token}.ps1`, content);
      toast.showSuccess("Arquivo .ps1 gerado.");
      return;
    }
    if (kind === "cmd") {
      const content = buildWindowsInstallerCmd();
      if (!content) {
        toast.showError("Preencha tenant token e valide artefato Windows no manifesto.");
        return;
      }
      downloadTextFile(`nucleoops-install-${token}.cmd`, content);
      toast.showSuccess("Arquivo .cmd gerado.");
      return;
    }
    const content = buildLinuxInstallerSh();
    if (!content) {
      toast.showError("Preencha tenant token e valide artefato Linux no manifesto.");
      return;
    }
    downloadTextFile(`nucleoops-install-${token}.sh`, content);
    toast.showSuccess("Arquivo .sh gerado.");
  }

  async function createCredential() {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    if (!credName.trim() || !credUser.trim() || !credSecret.trim()) {
      toast.showError("Preencha nome, usuario e segredo.");
      return;
    }
    const payload: CreateDeploymentCredentialRequest = {
      name: credName.trim(),
      kind: credKind,
      username: credUser.trim(),
      secret: credSecret,
      description: credDescription.trim() || undefined,
    };
    try {
      const created = await apiPost<DeploymentCredential>("/deployments/credentials", payload, headers);
      toast.showSuccess(`Credencial ${created.name} salva.`);
      setCredName("");
      setCredUser("");
      setCredSecret("");
      setCredDescription("");
      setCredentialRef(created.id);
      await credentialsQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao salvar credencial.");
    }
  }

  async function createDeployment() {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    if (!credentialRef) {
      toast.showError("Selecione uma credencial.");
      return;
    }
    const hosts = parseHosts(hostsRaw);
    if (hosts.length === 0) {
      toast.showError("Informe ao menos um host.");
      return;
    }
    const payload: CreateAgentDeploymentRequest = {
      tenant_id: tenantId,
      platform,
      transport,
      hosts,
      credential_ref: credentialRef,
      agent_version: agentVersion,
      rollout_profile: "balanced",
      dry_run: dryRun,
    };
    try {
      const response = await apiPost<CreateAgentDeploymentResponse>("/deployments/agent", payload, headers);
      setDeploymentId(response.deployment_id);
      setOpenDetails(true);
      toast.showSuccess(`Deployment iniciado: #${response.deployment_id}`);
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao criar deployment.");
    }
  }

  async function retryFailed() {
    if (!deploymentId) return;
    try {
      const response = await apiPost<RetryDeploymentResponse>(`/deployments/${deploymentId}/retry-failed`, {}, headers);
      toast.showSuccess(`Retry iniciado para ${response.retried_hosts} host(s).`);
      await deploymentDetailsQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao executar retry.");
    }
  }

  return (
    <div className="page-content">
      <PageHeader title="Deploy Agent" subtitle="Instalacao em massa via gateway (SSH/WinRM) e one-liners por tenant" />

      {auth.role !== "admin" ? (
        <EmptyState title="Restrito" subtitle="Somente admin pode executar deploy de agent." />
      ) : (
        <>
          <div className="two-col-grid">
            <Card title="Criar deployment">
              <div className="form-grid">
                <label>
                  Tenant
                  <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
                    {(tenantsQuery.data ?? []).map((item) => (
                      <option key={item.tenant_id} value={item.tenant_id}>
                        {item.tenant_id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Platform
                  <select value={platform} onChange={(event) => setPlatform(event.target.value as "windows" | "linux" | "mixed")}>
                    <option value="linux">linux</option>
                    <option value="windows">windows</option>
                    <option value="mixed">mixed</option>
                  </select>
                </label>
                <label>
                  Transport
                  <select value={transport} onChange={(event) => setTransport(event.target.value as "ssh" | "winrm")}>
                    <option value="ssh">ssh</option>
                    <option value="winrm">winrm</option>
                  </select>
                </label>
                <label>
                  Agent version
                  <input value={agentVersion} onChange={(event) => setAgentVersion(event.target.value)} placeholder="latest ou 0.1.0" />
                </label>
                <label>
                  Credencial
                  <select
                    value={credentialRef ?? ""}
                    onChange={(event) => setCredentialRef(event.target.value ? Number(event.target.value) : null)}
                  >
                    <option value="">Selecione...</option>
                    {(credentialsQuery.data ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        #{item.id} {item.name} ({item.kind}/{item.username})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="check-inline">
                <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
                Dry-run (somente conectividade)
              </label>
              <label>
                Hosts (um por linha: host,port,platform)
                <textarea
                  value={hostsRaw}
                  onChange={(event) => setHostsRaw(event.target.value)}
                  placeholder={"192.168.1.10,22,linux\n192.168.1.11,5985,windows"}
                />
              </label>
              <div className="row">
                <button type="button" onClick={() => void createDeployment()}>
                  Iniciar deployment
                </button>
                {deploymentId ? (
                  <button className="btn-secondary" type="button" onClick={() => setOpenDetails(true)}>
                    Ver deployment #{deploymentId}
                  </button>
                ) : null}
              </div>
            </Card>

            <Card title="Credenciais (cofre)">
              <div className="form-grid">
                <label>
                  Nome
                  <input value={credName} onChange={(event) => setCredName(event.target.value)} />
                </label>
                <label>
                  Tipo
                  <select value={credKind} onChange={(event) => setCredKind(event.target.value as "ssh_key" | "ssh_password" | "winrm_password")}>
                    <option value="ssh_key">ssh_key</option>
                    <option value="ssh_password">ssh_password</option>
                    <option value="winrm_password">winrm_password</option>
                  </select>
                </label>
                <label>
                  Usuario
                  <input value={credUser} onChange={(event) => setCredUser(event.target.value)} />
                </label>
                <label>
                  Descricao
                  <input value={credDescription} onChange={(event) => setCredDescription(event.target.value)} />
                </label>
              </div>
              <label>
                Segredo
                <textarea value={credSecret} onChange={(event) => setCredSecret(event.target.value)} placeholder="senha ou chave privada SSH" />
              </label>
              <div className="row">
                <button type="button" onClick={() => void createCredential()}>
                  Salvar credencial
                </button>
                <button className="btn-secondary" type="button" onClick={() => void credentialsQuery.refetch()}>
                  Atualizar lista
                </button>
              </div>
            </Card>
          </div>

          <Card title="One-liners rapidos (manual)">
            <div className="form-grid">
              <label>
                Tenant token
                <input value={tenantToken} onChange={(event) => setTenantToken(event.target.value)} placeholder="token de bootstrap do tenant" />
              </label>
              <label>
                Server base URL
                <input
                  value={serverBaseUrl}
                  onChange={(event) => setServerBaseUrl(event.target.value)}
                  placeholder={effectiveServerBase}
                />
              </label>
            </div>
            <p className="small">URL efetiva: {effectiveServerBase}</p>
            <label>
              Windows {windowsArtifact ? `(v${windowsArtifact.version})` : "(sem artefato)"}
              <textarea value={oneLinerWindows} readOnly />
            </label>
            <div className="row">
              <button type="button" onClick={() => void copyCommand("Windows", oneLinerWindows)}>
                Copiar comando Windows
              </button>
              <button className="btn-secondary" type="button" onClick={() => downloadInstallerFile("ps1")}>
                Baixar .ps1
              </button>
              <button className="btn-secondary" type="button" onClick={() => downloadInstallerFile("cmd")}>
                Baixar .cmd
              </button>
            </div>
            <label>
              Linux {linuxArtifact ? `(v${linuxArtifact.version})` : "(sem artefato)"}
              <textarea value={oneLinerLinux} readOnly />
            </label>
            {linuxAutoHostMode ? (
              <p className="small">
                Modo localhost detectado: substitua <code>&lt;SERVER_IP&gt;</code> pelo IP de rede do servidor
                (ex.: <code>192.168.1.107</code>) antes de executar em Linux/VM.
              </p>
            ) : null}
            <div className="row">
              <button type="button" onClick={() => void copyCommand("Linux", oneLinerLinux)}>
                Copiar comando Linux
              </button>
              <button className="btn-secondary" type="button" onClick={() => downloadInstallerFile("sh")}>
                Baixar .sh
              </button>
            </div>
            <p className="small">
              Manifesto de binarios: {manifestQuery.data?.artifacts.length ?? 0} artefato(s) encontrado(s).
            </p>
          </Card>
        </>
      )}

      <Modal
        open={openDetails}
        onClose={() => setOpenDetails(false)}
        title={`Deployment ${deploymentId ?? ""}`}
        wide
      >
        {deploymentDetailsQuery.data ? (
          <>
            <div className="row">
              <Badge tone={deploymentDetailsQuery.data.deployment.status === "success" ? "ok" : deploymentDetailsQuery.data.deployment.status === "failed" ? "error" : "warn"}>
                {deploymentDetailsQuery.data.deployment.status}
              </Badge>
              <span className="small">
                {deploymentDetailsQuery.data.deployment.success_hosts}/{deploymentDetailsQuery.data.deployment.total_hosts} sucesso
              </span>
              <button className="btn-secondary" type="button" onClick={() => void retryFailed()}>
                Retry failed
              </button>
            </div>
            <Table headers={["Host", "Porta", "Platform", "Status", "Erro", "Atualizado"]}>
              {deploymentDetailsQuery.data.hosts.map((item) => (
                <tr key={item.id}>
                  <td>{item.host}</td>
                  <td>{item.port}</td>
                  <td>{item.platform}</td>
                  <td>
                    <Badge tone={item.status === "success" ? "ok" : item.status === "failed" ? "error" : "warn"}>
                      {item.status}
                    </Badge>
                  </td>
                  <td title={item.error?.hint ?? undefined}>
                    {item.error ? `[${item.error.code}] ${item.error.message}` : item.error_reason ?? "-"}
                  </td>
                  <td>{formatTime(item.updated_at)}</td>
                </tr>
              ))}
            </Table>
          </>
        ) : (
          <p className="small">Carregando detalhes...</p>
        )}
      </Modal>
    </div>
  );
}
