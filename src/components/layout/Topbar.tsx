import { useState } from "react";
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
      onSuccess("Sessão encerrada.");
      showStatus("Sessão encerrada.", false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no logout.";
      onError(message);
      showStatus(message, true);
    }
  }

  async function handleForgotPassword() {
    try {
      if (!loginEmail.trim()) throw new Error("Informe o e-mail para recuperação.");
      await sendPasswordReset(loginEmail.trim());
      showStatus("E-mail de recuperação enviado. Verifique sua caixa de entrada.", false);
      onSuccess("E-mail de recuperação enviado.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar recuperação.";
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
            ? `Sessão Supabase ativa: ${session.user.email ?? session.user.id}`
            : supabaseConfigured
              ? "Sem sessão Supabase ativa."
              : "Supabase não configurado."}
        </div>
        <div className={`status-line ${backendUser ? "" : "error"}`}>
          {backendUser
            ? `Autenticado no backend: ${backendUser.admin_id} (${backendUser.role})`
            : "Não autenticado no backend. Faça login Supabase."}
        </div>
        {inlineMessage ? <div className={`status-line ${inlineError ? "error" : ""}`}>{inlineMessage}</div> : null}
      </div>
    </header>
  );
}
