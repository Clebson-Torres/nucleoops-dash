import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAuth } from "../../lib/auth/AuthContext";
import { useToast } from "../../components/ui/Toast";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api/client";
import { formatTime } from "../../lib/format";
import type {
  CreateNetworkProbeRequest,
  NetworkDiscoveryRequest,
  NetworkDiscoveryResponse,
  NetworkProbe,
  NetworkProbeCheck,
  NetworkProbesSummary,
  UpdateNetworkProbeRequest,
} from "../../types/api";

function poll(intervalMs: number) {
  return () => (document.hidden ? false : intervalMs);
}

function toneByStatus(status?: string): "ok" | "warn" | "error" {
  const normalized = (status ?? "unknown").toLowerCase();
  if (normalized === "online") return "ok";
  if (normalized === "offline") return "error";
  return "warn";
}

export function NetworkPage() {
  const auth = useAuth();
  const toast = useToast();
  const headers = auth.getAuthHeadersState();

  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [location, setLocation] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [timeoutMs, setTimeoutMs] = useState(1200);
  const [selectedProbeId, setSelectedProbeId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const [discoveryCidr, setDiscoveryCidr] = useState("");
  const [discoveryLocation, setDiscoveryLocation] = useState("descoberta-local");
  const [discoverySaveAsProbes, setDiscoverySaveAsProbes] = useState(true);
  const [discoveryResult, setDiscoveryResult] = useState<NetworkDiscoveryResponse | null>(null);

  const probesQuery = useQuery({
    queryKey: ["network-probes", activeFilter, headers.accessToken],
    queryFn: () =>
      apiGet<NetworkProbe[]>(
        `/network/probes?limit=500${
          activeFilter === "all" ? "" : activeFilter === "active" ? "&active=true" : "&active=false"
        }`,
        headers
      ),
    refetchInterval: poll(10_000),
  });

  const summaryQuery = useQuery({
    queryKey: ["network-probes-summary", headers.accessToken],
    queryFn: () => apiGet<NetworkProbesSummary>("/network/probes/summary", headers),
    refetchInterval: poll(10_000),
  });

  const checksQuery = useQuery({
    queryKey: ["network-probe-checks", selectedProbeId, headers.accessToken],
    queryFn: () =>
      apiGet<NetworkProbeCheck[]>(
        `/network/probes/${selectedProbeId ?? 0}/checks?limit=100`,
        headers
      ),
    enabled: Boolean(selectedProbeId),
    refetchInterval: selectedProbeId ? poll(5_000) : false,
  });

  const selectedProbe = useMemo(
    () => (probesQuery.data ?? []).find((probe) => probe.id === selectedProbeId) ?? null,
    [probesQuery.data, selectedProbeId]
  );

  async function createProbe() {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    if (!name.trim() || !ipAddress.trim()) {
      toast.showError("Informe nome e IP.");
      return;
    }
    const payload: CreateNetworkProbeRequest = {
      name: name.trim(),
      ip_address: ipAddress.trim(),
      location: location.trim() || undefined,
      interval_seconds: intervalSeconds,
      timeout_ms: timeoutMs,
      active: true,
    };
    try {
      await apiPost<NetworkProbe>("/network/probes", payload, headers);
      setName("");
      setIpAddress("");
      setLocation("");
      toast.showSuccess("Alvo de rede criado.");
      await probesQuery.refetch();
      await summaryQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao criar alvo.");
    }
  }

  async function toggleProbe(probe: NetworkProbe) {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    const payload: UpdateNetworkProbeRequest = { active: !probe.active };
    try {
      await apiPatch<NetworkProbe>(`/network/probes/${probe.id}`, payload, headers);
      toast.showSuccess(`Alvo ${probe.active ? "desativado" : "ativado"}.`);
      await probesQuery.refetch();
      await summaryQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao atualizar alvo.");
    }
  }

  async function removeProbe(probe: NetworkProbe) {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    if (!window.confirm(`Remover alvo ${probe.name}?`)) return;
    try {
      await apiDelete(`/network/probes/${probe.id}`, headers);
      if (selectedProbeId === probe.id) setSelectedProbeId(null);
      toast.showSuccess("Alvo removido.");
      await probesQuery.refetch();
      await summaryQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao remover alvo.");
    }
  }

  async function renameProbe(probe: NetworkProbe) {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    const nextName = window.prompt("Novo nome do host", probe.name)?.trim();
    if (!nextName) return;
    try {
      await apiPatch<NetworkProbe>(`/network/probes/${probe.id}`, { name: nextName }, headers);
      toast.showSuccess("Nome atualizado.");
      await probesQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao renomear host.");
    }
  }

  async function runDiscovery() {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    const payload: NetworkDiscoveryRequest = {
      cidr: discoveryCidr.trim() || undefined,
      save_as_probes: discoverySaveAsProbes,
      interval_seconds: intervalSeconds,
      timeout_ms: timeoutMs,
      location: discoveryLocation.trim() || undefined,
    };
    try {
      const result = await apiPost<NetworkDiscoveryResponse>("/network/discovery/run", payload, headers);
      setDiscoveryResult(result);
      toast.showSuccess(
        `Descoberta concluida: ${result.online_hosts} host(s) online, ${result.saved_probes} salvo(s).`
      );
      await probesQuery.refetch();
      await summaryQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha na descoberta de rede.");
    }
  }

  const probes = probesQuery.data ?? [];

  return (
    <div className="page-content">
      <PageHeader title="Network Monitor" subtitle="Ping periódico por IP para estado On/Off" />

      <div className="three-col-grid">
        <Card title="Resumo">
          <div className="stat-grid">
            <div className="stat">
              <span className="label">Total</span>
              <strong>{summaryQuery.data?.total ?? 0}</strong>
            </div>
            <div className="stat">
              <span className="label">Online</span>
              <strong>{summaryQuery.data?.online ?? 0}</strong>
            </div>
            <div className="stat">
              <span className="label">Offline</span>
              <strong>{summaryQuery.data?.offline ?? 0}</strong>
            </div>
          </div>
        </Card>

        <Card title="Filtro">
          <label>
            Exibicao
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value as "all" | "active" | "inactive")}
            >
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </select>
          </label>
        </Card>

        <Card title="Novo alvo">
          {auth.role === "admin" ? (
            <div className="form-grid">
              <label>
                Nome
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                IP/Host
                <input value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} placeholder="192.168.1.10" />
              </label>
              <label>
                Local
                <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Filial SP / Sala TI" />
              </label>
              <div className="row">
                <label>
                  Intervalo(s)
                  <input
                    type="number"
                    min={10}
                    max={3600}
                    value={intervalSeconds}
                    onChange={(event) => setIntervalSeconds(Number(event.target.value || 60))}
                  />
                </label>
                <label>
                  Timeout(ms)
                  <input
                    type="number"
                    min={200}
                    max={10000}
                    value={timeoutMs}
                    onChange={(event) => setTimeoutMs(Number(event.target.value || 1200))}
                  />
                </label>
              </div>
              <button type="button" onClick={() => void createProbe()}>Salvar alvo</button>
            </div>
          ) : (
            <EmptyState title="Restrito" subtitle="Somente admin pode criar ou editar alvos." />
          )}
        </Card>
      </div>

      <Card title="Descoberta local (manual)">
        <div className="form-grid">
          <label>
            CIDR (opcional)
            <input
              value={discoveryCidr}
              onChange={(event) => setDiscoveryCidr(event.target.value)}
              placeholder="192.168.1.0/24"
            />
          </label>
          <label>
            Local para hosts descobertos
            <input
              value={discoveryLocation}
              onChange={(event) => setDiscoveryLocation(event.target.value)}
              placeholder="Filial SP"
            />
          </label>
        </div>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={discoverySaveAsProbes}
            onChange={(event) => setDiscoverySaveAsProbes(event.target.checked)}
          />
          Salvar host descoberto automaticamente como probe ativo
        </label>
        <div className="row">
          <button type="button" onClick={() => void runDiscovery()}>Executar descoberta</button>
          <span className="small">
            Intervalo e timeout usados no monitoramento: {intervalSeconds}s / {timeoutMs}ms.
          </span>
        </div>
        {discoveryResult ? (
          <div className="compact-list">
            <p className="small">
              Rede: {discoveryResult.cidr_used} | local: {discoveryResult.local_hostname ?? "-"} (
              {discoveryResult.local_ip ?? "-"}) | gateway: {discoveryResult.gateway_ip ?? "-"} (
              {discoveryResult.gateway_mac ?? "-"})
            </p>
            <Table headers={["IP", "Host name", "MAC", "Gateway", "Probe"]}>
              {discoveryResult.devices.map((item) => (
                <tr key={item.ip_address}>
                  <td>{item.ip_address}</td>
                  <td>{item.host_name ?? "-"}</td>
                  <td>{item.mac_address ?? "-"}</td>
                  <td>{item.is_gateway ? "sim" : "nao"}</td>
                  <td>{item.saved_probe_id ?? "-"}</td>
                </tr>
              ))}
            </Table>
          </div>
        ) : null}
      </Card>

      <Card title="Alvos monitorados">
        {probes.length === 0 ? (
          <EmptyState title="Sem alvos" subtitle="Cadastre IPs para monitoramento." />
        ) : (
          <Table headers={["Nome", "IP/Host", "Local", "Status", "Latencia", "Ultimo check", "Falhas", "Acoes"]}>
            {probes.map((probe) => (
              <tr key={probe.id}>
                <td>
                  <button className="btn-link" type="button" onClick={() => setSelectedProbeId(probe.id)}>
                    {probe.name}
                  </button>
                </td>
                <td>{probe.ip_address}</td>
                <td>{probe.location ?? "-"}</td>
                <td>
                  <Badge tone={toneByStatus(probe.last_status)}>{probe.last_status}</Badge>
                </td>
                <td>{probe.last_latency_ms ? `${probe.last_latency_ms} ms` : "-"}</td>
                <td>{probe.last_checked_at ? formatTime(probe.last_checked_at) : "-"}</td>
                <td>{probe.consecutive_failures}</td>
                <td>
                  <div className="row">
                    <button className="btn-secondary" type="button" onClick={() => void toggleProbe(probe)}>
                      {probe.active ? "Desativar" : "Ativar"}
                    </button>
                    <button className="btn-secondary" type="button" onClick={() => void renameProbe(probe)}>
                      Renomear
                    </button>
                    <button className="btn-secondary" type="button" onClick={() => void removeProbe(probe)}>
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title={`Historico de checks ${selectedProbe ? `- ${selectedProbe.name}` : ""}`}>
        {!selectedProbe ? (
          <p className="small">Selecione um alvo na tabela para ver os checks.</p>
        ) : checksQuery.data && checksQuery.data.length > 0 ? (
          <Table headers={["Quando", "Status", "Latencia", "Erro"]}>
            {checksQuery.data.map((item) => (
              <tr key={item.id}>
                <td>{formatTime(item.checked_at)}</td>
                <td>
                  <Badge tone={toneByStatus(item.status)}>{item.status}</Badge>
                </td>
                <td>{item.latency_ms ? `${item.latency_ms} ms` : "-"}</td>
                <td>{item.error_message ?? "-"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="small">Sem checks ainda para este alvo.</p>
        )}
      </Card>
    </div>
  );
}
