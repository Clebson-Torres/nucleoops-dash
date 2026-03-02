import type { AuthMe } from "../../types/api";

export type AuthHeaderState = {
  accessToken: string | null;
};

function buildHeaders(auth: AuthHeaderState, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (auth.accessToken) headers.set("Authorization", `Bearer ${auth.accessToken}`);
  return headers;
}

function ensureToken(auth: AuthHeaderState) {
  if (!auth.accessToken) {
    throw new Error("Faca login no Supabase para continuar.");
  }
}

async function throwApiError(response: Response): Promise<never> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let payload: { code?: string; message?: string } | null = null;
    try {
      payload = (await response.json()) as { code?: string; message?: string };
    } catch {
      payload = null;
    }
    if (payload?.message) {
      throw new Error(`${response.status} ${payload.message}`);
    }
    throw new Error(`${response.status} request failed`);
  }
  const text = await response.text();
  throw new Error(`${response.status} ${text}`.trim());
}

export async function apiGet<T>(path: string, auth: AuthHeaderState): Promise<T> {
  ensureToken(auth);
  const response = await fetch(`/api${path}`, { headers: buildHeaders(auth) });
  if (!response.ok) {
    await throwApiError(response);
  }
  return (await response.json()) as T;
}

export async function apiGetPublic<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown, auth: AuthHeaderState): Promise<T> {
  ensureToken(auth);
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: buildHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function apiPatch<T>(path: string, body: unknown, auth: AuthHeaderState): Promise<T> {
  ensureToken(auth);
  const response = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: buildHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function apiPut<T>(path: string, body: unknown, auth: AuthHeaderState): Promise<T> {
  ensureToken(auth);
  const response = await fetch(`/api${path}`, {
    method: "PUT",
    headers: buildHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function apiPostForm<T>(path: string, form: FormData, auth: AuthHeaderState): Promise<T> {
  ensureToken(auth);
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: buildHeaders(auth),
    body: form,
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return (await response.json()) as T;
}

export async function apiDelete(path: string, auth: AuthHeaderState): Promise<void> {
  ensureToken(auth);
  const response = await fetch(`/api${path}`, {
    method: "DELETE",
    headers: buildHeaders(auth),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
}

export async function fetchMe(auth: AuthHeaderState): Promise<AuthMe | null> {
  if (!auth.accessToken) return null;
  const response = await fetch("/api/auth/me", { headers: buildHeaders(auth) });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as AuthMe;
}

