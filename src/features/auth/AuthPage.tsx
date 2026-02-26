import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { supabase } from "../../lib/auth/supabase";

function flowType(): string | null {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.get("type") ?? query.get("type");
}

async function ensureSessionFromUrl(): Promise<boolean> {
  if (!supabase) return false;

  const current = await supabase.auth.getSession();
  if (current.data.session) return true;

  const code = new URL(window.location.href).searchParams.get("code");
  if (code) {
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    if (exchanged.error) return false;
    return Boolean(exchanged.data.session);
  }

  const after = await supabase.auth.getSession();
  return Boolean(after.data.session);
}

export function AuthPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("Validando link...");
  const [error, setError] = useState(false);
  const [validating, setValidating] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function validate() {
      if (!supabase) {
        if (mounted) {
          setError(true);
          setMessage("Supabase não configurado.");
          setValidating(false);
        }
        return;
      }

      const kind = flowType();
      const ready = await ensureSessionFromUrl();
      if (!mounted) return;

      if (!ready) {
        setError(true);
        setMessage("Sessão de convite/recuperação inválida. Reabra o link do e-mail.");
      } else if (kind === "invite") {
        setError(false);
        setMessage("Convite confirmado. Defina sua senha para concluir o acesso.");
      } else if (kind === "recovery") {
        setError(false);
        setMessage("Recuperação validada. Defina sua nova senha.");
      } else {
        setError(false);
        setMessage("Sessão válida. Você pode definir/alterar sua senha.");
      }

      setValidating(false);
    }

    void validate();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleUpdate() {
    setError(false);
    if (!supabase) {
      setError(true);
      setMessage("Supabase não configurado.");
      return;
    }
    if (password.length < 8) {
      setError(true);
      setMessage("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError(true);
      setMessage("A confirmação não confere.");
      return;
    }

    const ready = await ensureSessionFromUrl();
    if (!ready) {
      setError(true);
      setMessage("Sessão inválida. Reabra o link do e-mail.");
      return;
    }

    const result = await supabase.auth.updateUser({ password });
    if (result.error) {
      setError(true);
      setMessage(`Falha ao atualizar senha: ${result.error.message}`);
      return;
    }

    setMessage("Senha atualizada com sucesso. Redirecionando...");
    window.setTimeout(() => navigate("/overview"), 1000);
  }

  return (
    <div className="auth-page">
      <Card title="Definir nova senha" className="auth-card">
        <p className={error ? "error" : "small"}>{message}</p>
        <label>
          Nova senha
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        </label>
        <label>
          Confirmar senha
          <input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" />
        </label>
        <div className="row">
          <button type="button" onClick={() => void handleUpdate()} disabled={validating}>
            Atualizar senha
          </button>
          <button className="btn-secondary" type="button" onClick={() => navigate("/overview")}>Ir para painel</button>
        </div>
      </Card>
    </div>
  );
}
