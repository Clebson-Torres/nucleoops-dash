import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { useAuth } from "../../lib/auth/AuthContext";
import { apiGet, apiPost, apiPut } from "../../lib/api/client";
import { useToast } from "../../components/ui/Toast";
import type { AlertSettings, UpdateAlertSettingsRequest } from "../../types/api";

function poll(intervalMs: number) {
  return () => (document.hidden ? false : intervalMs);
}

export function AlertsSettingsCard() {
  const auth = useAuth();
  const toast = useToast();
  const headers = auth.getAuthHeadersState();
  const [offlineThreshold, setOfflineThreshold] = useState(5);
  const [jobFailureEnabled, setJobFailureEnabled] = useState(true);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["alerts-settings", headers.accessToken],
    queryFn: () => apiGet<AlertSettings>("/alerts/settings", headers),
    enabled: auth.role === "admin",
    refetchInterval: auth.role === "admin" ? poll(15_000) : false,
  });

  function syncFromServer() {
    const settings = settingsQuery.data;
    if (!settings) return;
    setOfflineThreshold(settings.offline_threshold_minutes);
    setJobFailureEnabled(settings.job_failure_enabled);
    setWebhookEnabled(settings.webhook_enabled);
    setWebhookUrl(settings.webhook_url ?? "");
    setWebhookSecret("");
  }

  async function saveSettings() {
    try {
      const payload: UpdateAlertSettingsRequest = {
        offline_threshold_minutes: offlineThreshold,
        job_failure_enabled: jobFailureEnabled,
        webhook_enabled: webhookEnabled,
        webhook_url: webhookUrl.trim() || "",
      };
      if (webhookSecret.trim()) payload.webhook_secret = webhookSecret.trim();
      const updated = await apiPut<AlertSettings>("/alerts/settings", payload, headers);
      toast.showSuccess("Configurações de alertas salvas.");
      setOfflineThreshold(updated.offline_threshold_minutes);
      setJobFailureEnabled(updated.job_failure_enabled);
      setWebhookEnabled(updated.webhook_enabled);
      setWebhookUrl(updated.webhook_url ?? "");
      setWebhookSecret("");
      await settingsQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao salvar configuração de alertas.");
    }
  }

  async function testWebhook() {
    try {
      await apiPost<void>("/alerts/test-webhook", {}, headers);
      toast.showSuccess("Webhook testado com sucesso.");
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha no teste do webhook.");
    }
  }

  return (
    <Card title="Alertas (admin)">
      {auth.role !== "admin" ? (
        <p className="small">Ação restrita ao perfil admin.</p>
      ) : (
        <>
          <div className="row">
            <button className="btn-secondary" type="button" onClick={syncFromServer}>
              Carregar atual
            </button>
            <span className="small">
              Secret configurado: {settingsQuery.data?.webhook_secret_configured ? "sim" : "não"}
            </span>
          </div>
          <div className="form-grid">
            <label>
              Offline threshold (min)
              <input
                type="number"
                min={1}
                max={1440}
                value={offlineThreshold}
                onChange={(event) => setOfflineThreshold(Number(event.target.value || 5))}
              />
            </label>
            <label>
              Job failure alert
              <select
                value={jobFailureEnabled ? "on" : "off"}
                onChange={(event) => setJobFailureEnabled(event.target.value === "on")}
              >
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </label>
          </div>

          <label className="check-inline">
            <input
              type="checkbox"
              checked={webhookEnabled}
              onChange={(event) => setWebhookEnabled(event.target.checked)}
            />
            Webhook habilitado
          </label>

          <label>
            Webhook URL
            <input
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://hooks.slack.com/services/..."
            />
          </label>
          <label>
            Webhook secret (opcional)
            <input
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              placeholder="somente para atualizar"
            />
          </label>
          <div className="row">
            <button type="button" onClick={() => void saveSettings()}>
              Salvar alertas
            </button>
            <button className="btn-secondary" type="button" onClick={() => void testWebhook()}>
              Testar webhook
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

