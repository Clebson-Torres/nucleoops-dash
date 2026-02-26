import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AuthMe, Role } from "../../types/api";
import { fetchMe, type AuthHeaderState } from "../api/client";
import { supabase, supabaseConfigured } from "./supabase";

type AuthContextValue = {
  session: Session | null;
  accessToken: string | null;
  role: Role | null;
  backendUser: AuthMe | null;
  supabaseConfigured: boolean;
  loading: boolean;
  loginEmail: string;
  setLoginEmail: (value: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  getAuthHeadersState: () => AuthHeaderState;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const LOGIN_EMAIL_KEY = "ops.loginEmail";

async function ensureSessionFromUrl(): Promise<void> {
  if (!supabase) return;
  const code = new URL(window.location.href).searchParams.get("code");
  if (!code) return;
  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) {
    throw new Error(exchanged.error.message);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [backendUser, setBackendUser] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginEmail, setLoginEmailState] = useState(localStorage.getItem(LOGIN_EMAIL_KEY) || "");

  const accessToken = session?.access_token ?? null;

  const getAuthHeadersState = useCallback((): AuthHeaderState => ({ accessToken }), [accessToken]);

  const refreshMe = useCallback(async () => {
    if (!accessToken) {
      setBackendUser(null);
      return;
    }
    const me = await fetchMe(getAuthHeadersState());
    setBackendUser(me);
  }, [accessToken, getAuthHeadersState]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      if (!supabase) {
        setBackendUser(null);
        if (mounted) setLoading(false);
        return;
      }

      await ensureSessionFromUrl();
      const current = await supabase.auth.getSession();
      if (mounted) {
        setSession(current.data.session);
      }
      await refreshMe();
      if (mounted) setLoading(false);
    }

    init().catch(() => setLoading(false));

    const subscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void refreshMe();
    });

    return () => {
      mounted = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, [refreshMe]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase não configurado");
    }
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      throw new Error(result.error.message);
    }
    setLoginEmailState(email);
    localStorage.setItem(LOGIN_EMAIL_KEY, email);
    setSession(result.data.session);
    await refreshMe();
  }, [refreshMe]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.auth.signOut();
    if (result.error) {
      throw new Error(result.error.message);
    }
    setSession(null);
    await refreshMe();
  }, [refreshMe]);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new Error("Supabase não configurado");
    const result = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (result.error) throw new Error(result.error.message);
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!supabase) throw new Error("Supabase não configurado");
    await ensureSessionFromUrl();
    const current = await supabase.auth.getSession();
    if (!current.data.session) {
      throw new Error("Sessão de recuperação/convite inválida. Reabra o link do e-mail.");
    }
    const result = await supabase.auth.updateUser({ password: newPassword });
    if (result.error) throw new Error(result.error.message);
  }, []);

  const setLoginEmail = useCallback((value: string) => {
    setLoginEmailState(value);
    localStorage.setItem(LOGIN_EMAIL_KEY, value);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      accessToken,
      role: backendUser?.role ?? null,
      backendUser,
      supabaseConfigured,
      loading,
      loginEmail,
      setLoginEmail,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      refreshMe,
      getAuthHeadersState,
    }),
    [
      session,
      accessToken,
      backendUser,
      loading,
      loginEmail,
      setLoginEmail,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      refreshMe,
      getAuthHeadersState,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
