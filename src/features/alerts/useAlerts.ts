import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/AuthContext";
import type { Alert, AlertStatus, AlertSummary } from "../../types/api";

function poll(intervalMs: number) {
  return () => (document.hidden ? false : intervalMs);
}

export function useAlertsSummary(intervalMs = 10_000) {
  const auth = useAuth();
  const headers = auth.getAuthHeadersState();

  return useQuery({
    queryKey: ["alerts-summary", headers.accessToken],
    queryFn: () => apiGet<AlertSummary>("/alerts/summary", headers),
    refetchInterval: poll(intervalMs),
    enabled: Boolean(headers.accessToken),
  });
}

export function useAlertsList(status: AlertStatus = "open", limit = 50, intervalMs = 15_000) {
  const auth = useAuth();
  const headers = auth.getAuthHeadersState();

  return useQuery({
    queryKey: ["alerts-list", status, limit, headers.accessToken],
    queryFn: () => apiGet<Alert[]>(`/alerts?status=${status}&limit=${limit}`, headers),
    refetchInterval: poll(intervalMs),
    enabled: Boolean(headers.accessToken),
  });
}

