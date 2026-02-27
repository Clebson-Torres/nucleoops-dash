import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Table } from "../../components/ui/Table";
import { useAuth } from "../../lib/auth/AuthContext";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api/client";
import { useToast } from "../../components/ui/Toast";
import { formatTime } from "../../lib/format";
import type { AdminUser, AllowedCommand, InviteAdminUserResponse, OperationTemplate, Role } from "../../types/api";

function poll(intervalMs: number) {
  return () => (document.hidden ? false : intervalMs);
}

export function UsersSettingsPage() {
  const auth = useAuth();
  const toast = useToast();
  const headers = auth.getAuthHeadersState();

  const [adminId, setAdminId] = useState("");
  const [adminRole, setAdminRole] = useState<Role>("support");
  const [adminActive, setAdminActive] = useState(true);

  const [commandName, setCommandName] = useState("");
  const [commandText, setCommandText] = useState("");
  const [commandDescription, setCommandDescription] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("network");
  const [templatePlatform, setTemplatePlatform] = useState("any");
  const [templateType, setTemplateType] = useState("network_ping");
  const [templateAdminOnly, setTemplateAdminOnly] = useState(false);
  const [templateSchema, setTemplateSchema] = useState("{\"required\":[],\"properties\":{}}");

  const usersQuery = useQuery({
    queryKey: ["admin-users", headers.accessToken],
    queryFn: () => apiGet<AdminUser[]>("/admin/users?limit=300", headers),
    enabled: auth.role === "admin",
    refetchInterval: auth.role === "admin" ? poll(15_000) : false,
  });

  const allowedCommandsQuery = useQuery({
    queryKey: ["settings-allowed-commands", headers.accessToken],
    queryFn: () => apiGet<AllowedCommand[]>("/commands?limit=300", headers),
    enabled: auth.role === "admin",
    refetchInterval: auth.role === "admin" ? poll(15_000) : false,
  });

  const operationTemplatesQuery = useQuery({
    queryKey: ["operation-templates", headers.accessToken],
    queryFn: () => apiGet<OperationTemplate[]>("/operations/templates?limit=500", headers),
    enabled: auth.role === "admin",
    refetchInterval: auth.role === "admin" ? poll(15_000) : false,
  });

  async function saveAdminUser() {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    if (!adminId.trim()) {
      toast.showError("Informe o email/admin_id.");
      return;
    }

    try {
      await apiPost<AdminUser>(
        "/admin/users",
        {
          admin_id: adminId.trim(),
          role: adminRole,
          active: adminActive,
        },
        headers
      );
      toast.showSuccess("Usuario atualizado.");
      setAdminId("");
      await usersQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao salvar usuario.");
    }
  }

  async function inviteAdminUser() {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    if (!adminId.trim()) {
      toast.showError("Informe o email/admin_id.");
      return;
    }

    try {
      const result = await apiPost<InviteAdminUserResponse>(
        "/admin/users/invite",
        {
          admin_id: adminId.trim(),
          role: adminRole,
          active: adminActive,
        },
        headers
      );
      toast.showSuccess(`Convite enviado para ${result.user.admin_id}.`);
      setAdminId("");
      await usersQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao enviar convite.");
    }
  }

  async function saveAllowedCommand() {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    if (!commandName.trim() || !commandText.trim()) {
      toast.showError("Informe nome e comando.");
      return;
    }
    try {
      await apiPost<AllowedCommand>(
        "/commands",
        {
          name: commandName.trim(),
          command_text: commandText.trim(),
          description: commandDescription.trim() || null,
          active: true,
        },
        headers
      );
      toast.showSuccess("Comando allowlist criado.");
      setCommandName("");
      setCommandText("");
      setCommandDescription("");
      await allowedCommandsQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao criar comando.");
    }
  }

  async function toggleAllowedCommand(command: AllowedCommand) {
    try {
      await apiPatch<AllowedCommand>(`/commands/${command.id}`, { active: !command.active }, headers);
      toast.showSuccess(`Comando ${!command.active ? "ativado" : "desativado"}.`);
      await allowedCommandsQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao atualizar comando.");
    }
  }

  async function saveOperationTemplate() {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    if (!templateKey.trim() || !templateName.trim()) {
      toast.showError("Informe key e nome do template.");
      return;
    }
    let parsedSchema: Record<string, unknown>;
    try {
      parsedSchema = JSON.parse(templateSchema);
    } catch {
      toast.showError("parameter_schema inválido (JSON).");
      return;
    }

    try {
      await apiPost<OperationTemplate>(
        "/operations/templates",
        {
          key: templateKey.trim(),
          name: templateName.trim(),
          category: templateCategory,
          platform: templatePlatform,
          operation_type: templateType,
          parameter_schema: parsedSchema,
          active: true,
          admin_only: templateAdminOnly,
        },
        headers
      );
      toast.showSuccess("Template operacional criado.");
      setTemplateKey("");
      setTemplateName("");
      setTemplateSchema("{\"required\":[],\"properties\":{}}");
      await operationTemplatesQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao criar template.");
    }
  }

  async function toggleOperationTemplate(item: OperationTemplate) {
    try {
      await apiPatch<OperationTemplate>(
        `/operations/templates/${item.id}`,
        { active: !item.active },
        headers
      );
      toast.showSuccess(`Template ${!item.active ? "ativado" : "desativado"}.`);
      await operationTemplatesQuery.refetch();
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Falha ao atualizar template.");
    }
  }

  function editAdminUser(user: AdminUser) {
    setAdminId(user.admin_id);
    setAdminRole(user.role);
    setAdminActive(user.active);
  }

  async function deleteAdminUser(adminIdValue: string) {
    if (auth.role !== "admin") {
      toast.showError("Acao restrita ao perfil admin.");
      return;
    }
    const confirmed = window.confirm(`Excluir usuario ${adminIdValue}?`);
    if (!confirmed) return;

    try {
      await apiDelete(`/admin/users/${encodeURIComponent(adminIdValue)}`, headers);
      toast.showSuccess("Usuario excluido.");
      await usersQuery.refetch();
    } catch (error) {
      if (error instanceof Error && error.message.includes("409")) {
        toast.showError("Nao e possivel excluir o ultimo admin ativo.");
      } else {
        toast.showError(error instanceof Error ? error.message : "Falha ao excluir usuario.");
      }
    }
  }

  return (
    <div className="page-content">
      <PageHeader title="Configuracoes" subtitle="Usuarios e comandos permitidos (allowlist)" />

      <div className="two-col-grid">
        <Card title="Usuarios da plataforma">
          {auth.role !== "admin" ? (
            <EmptyState title="Restrito" subtitle="Acao restrita ao perfil admin." />
          ) : (
            <>
              <div className="form-grid">
                <label>
                  E-mail/admin_id
                  <input value={adminId} onChange={(event) => setAdminId(event.target.value)} placeholder="nome@empresa.com" />
                </label>
                <label>
                  Perfil
                  <select value={adminRole} onChange={(event) => setAdminRole(event.target.value as Role)}>
                    <option value="support">support</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
              </div>
              <label className="check-inline">
                <input type="checkbox" checked={adminActive} onChange={(event) => setAdminActive(event.target.checked)} />
                Ativo
              </label>
              <div className="row">
                <button type="button" onClick={() => void saveAdminUser()}>
                  Salvar usuario
                </button>
                <button className="btn-secondary" type="button" onClick={() => void inviteAdminUser()}>
                  Convidar por e-mail
                </button>
                <button className="btn-secondary" type="button" onClick={() => void usersQuery.refetch()}>
                  Atualizar lista
                </button>
              </div>

              <Table headers={["admin_id", "role", "active", "updated_at", "acoes"]}>
                {(usersQuery.data ?? []).map((user) => (
                  <tr key={user.admin_id}>
                    <td>{user.admin_id}</td>
                    <td>{user.role}</td>
                    <td>{user.active ? "sim" : "nao"}</td>
                    <td>{formatTime(user.updated_at)}</td>
                    <td>
                      <div className="row">
                        <button className="btn-secondary" type="button" onClick={() => editAdminUser(user)}>
                          Editar
                        </button>
                        <button className="btn-secondary" type="button" onClick={() => void deleteAdminUser(user.admin_id)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </Card>

        <Card title="Comandos permitidos (allowlist)">
          {auth.role !== "admin" ? (
            <EmptyState title="Restrito" subtitle="Somente admin pode gerenciar allowlist." />
          ) : (
            <>
              <div className="form-grid">
                <label>
                  Nome
                  <input value={commandName} onChange={(event) => setCommandName(event.target.value)} placeholder="reiniciar-spooler" />
                </label>
                <label>
                  Descricao
                  <input
                    value={commandDescription}
                    onChange={(event) => setCommandDescription(event.target.value)}
                    placeholder="Comando aprovado para suporte"
                  />
                </label>
              </div>
              <label>
                Comando
                <textarea value={commandText} onChange={(event) => setCommandText(event.target.value)} />
              </label>
              <div className="row">
                <button type="button" onClick={() => void saveAllowedCommand()}>
                  Criar comando
                </button>
                <button className="btn-secondary" type="button" onClick={() => void allowedCommandsQuery.refetch()}>
                  Atualizar lista
                </button>
              </div>

              <Table headers={["id", "nome", "active", "comando", "acoes"]}>
                {(allowedCommandsQuery.data ?? []).map((command) => (
                  <tr key={command.id}>
                    <td>{command.id}</td>
                    <td>{command.name}</td>
                    <td>{command.active ? "sim" : "nao"}</td>
                    <td>{command.command_text}</td>
                    <td>
                      <button className="btn-secondary" type="button" onClick={() => void toggleAllowedCommand(command)}>
                        {command.active ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </Card>
      </div>

      <Card title="Operation Templates (admin)">
        {auth.role !== "admin" ? (
          <EmptyState title="Restrito" subtitle="Somente admin pode gerenciar operation templates." />
        ) : (
          <>
            <div className="form-grid">
              <label>
                Key
                <input value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} placeholder="win-network-ping" />
              </label>
              <label>
                Nome
                <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Windows Ping Host" />
              </label>
              <label>
                Categoria
                <select value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)}>
                  <option value="network">network</option>
                  <option value="services">services</option>
                  <option value="software">software</option>
                  <option value="logs">logs</option>
                </select>
              </label>
              <label>
                Plataforma
                <select value={templatePlatform} onChange={(event) => setTemplatePlatform(event.target.value)}>
                  <option value="any">any</option>
                  <option value="windows">windows</option>
                  <option value="linux">linux</option>
                </select>
              </label>
              <label>
                Tipo
                <select value={templateType} onChange={(event) => setTemplateType(event.target.value)}>
                  <option value="network_ping">network_ping</option>
                  <option value="network_speed">network_speed</option>
                  <option value="service_control">service_control</option>
                  <option value="software_uninstall">software_uninstall</option>
                  <option value="log_collect">log_collect</option>
                </select>
              </label>
            </div>
            <label>
              parameter_schema (JSON)
              <textarea value={templateSchema} onChange={(event) => setTemplateSchema(event.target.value)} />
            </label>
            <label className="check-inline">
              <input type="checkbox" checked={templateAdminOnly} onChange={(event) => setTemplateAdminOnly(event.target.checked)} />
              Admin only
            </label>
            <div className="row">
              <button type="button" onClick={() => void saveOperationTemplate()}>Criar template</button>
              <button className="btn-secondary" type="button" onClick={() => void operationTemplatesQuery.refetch()}>Atualizar lista</button>
            </div>

            <Table headers={["id", "key", "tipo", "plataforma", "active", "admin_only", "acoes"]}>
              {(operationTemplatesQuery.data ?? []).map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.key}</td>
                  <td>{item.operation_type}</td>
                  <td>{item.platform}</td>
                  <td>{item.active ? "sim" : "nao"}</td>
                  <td>{item.admin_only ? "sim" : "nao"}</td>
                  <td>
                    <button className="btn-secondary" type="button" onClick={() => void toggleOperationTemplate(item)}>
                      {item.active ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Card>
    </div>
  );
}
