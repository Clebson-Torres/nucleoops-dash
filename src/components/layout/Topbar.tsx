import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ApiVersion } from "../../types/api";
import { apiGetPublic } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/AuthContext";

type TopbarProps = {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function Topbar({ onError, onSuccess }: TopbarProps) {
  const {
    supabaseConfigured,
    session,
    backendUser,
    loginEmail,
    setLoginEmail,
    signIn,
    signOut,
    sendPasswordReset,
  } = useAuth();

  const [password, setPassword] = useState("");
  const [inlineMessage, setInlineMessage] = useState("");
  const [inlineError, setInlineError] = useState(false);
  const versionQuery = useQuery({
    queryKey: ["api-version"],
    queryFn: () => apiGetPublic<ApiVersion>("/version"),
    staleTime: 60_000,
    retry: 1,
  });

  function showStatus(message: string, isError: boolean) {
    setInlineMessage(message);
    setInlineError(isError);
  }

  async function handleLogin() {
    try {
      if (!loginEmail.trim() || !password.trim()) {
        throw new Error("Informe e-mail e senha.");
      }
      await signIn(loginEmail.trim(), password);
      setPassword("");
      onSuccess("Login realizado com sucesso.");
      showStatus("Login efetuado com sucesso.", false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no login.";
      onError(message);
      showStatus(message, true);
    }
  }

  async function handleLogout() {
    try {
      await signOut();
      onSuccess("Sessao encerrada.");
      showStatus("Sessao encerrada.", false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no logout.";
      onError(message);
      showStatus(message, true);
    }
  }

  async function handleForgotPassword() {
    try {
      if (!loginEmail.trim()) throw new Error("Informe o e-mail para recuperacao.");
      await sendPasswordReset(loginEmail.trim());
      showStatus("E-mail de recuperacao enviado. Verifique sua caixa de entrada.", false);
      onSuccess("E-mail de recuperacao enviado.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar recuperacao.";
      showStatus(message, true);
      onError(message);
    }
  }

  return (
    <header className="topbar card">
      <div className="topbar-grid">
        {!session ? (
          <div className="row">
            <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="e-mail Supabase" />
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="senha" />
            <button type="button" onClick={handleLogin} disabled={!supabaseConfigured}>
              Entrar
            </button>
            <button className="btn-secondary" type="button" onClick={handleForgotPassword} disabled={!supabaseConfigured}>
              Esqueci a senha
            </button>
          </div>
        ) : (
          <div className="row">
            <button className="btn-secondary" type="button" onClick={handleLogout} disabled={!supabaseConfigured}>
              Sair
            </button>
          </div>
        )}

        <div className="status-line">
          {session
            ? `Sessao Supabase ativa: ${session.user.email ?? session.user.id}`
            : supabaseConfigured
              ? "Sem sessao Supabase ativa."
              : "Supabase nao configurado."}
        </div>
        <div className={`status-line ${backendUser ? "" : "error"}`}>
          {backendUser
            ? `Autenticado no backend: ${backendUser.admin_id} (${backendUser.role})`
            : "Nao autenticado no backend. Faca login Supabase."}
        </div>
        <div className="status-line">
          {versionQuery.data
            ? `API: ${versionQuery.data.service} v${versionQuery.data.version} (schema ${versionQuery.data.schema_version})`
            : "API: versao indisponivel"}
        </div>
        {inlineMessage ? <div className={`status-line ${inlineError ? "error" : ""}`}>{inlineMessage}</div> : null}
      </div>
    </header>
  );
}
