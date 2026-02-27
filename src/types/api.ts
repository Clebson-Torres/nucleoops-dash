export type Role = "admin" | "support";
export type RolloutProfile = "safe" | "balanced" | "fast";
export type ServiceMode = "windows_service" | "systemd" | "manual";
export type OperationCategory = "network" | "services" | "software" | "logs";
export type OperationType =
  | "network_ping"
  | "network_speed"
  | "service_control"
  | "software_uninstall"
  | "log_collect";

export type Agent = {
  tenant_id: string;
  agent_id: string;
  hostname: string;
  os_name: string;
  os_version: string;
  kernel_version: string;
  agent_version?: string | null;
  service_mode?: ServiceMode | null;
  last_bootstrap_at?: string | null;
  last_registration_at?: string | null;
  active: boolean;
  last_seen?: string | null;
  updated_at: string;
};

export type AgentsHealthSummary = {
  total_agents: number;
  healthy_last_5m: number;
};

export type Job = {
  id: number;
  name: string;
  action_type: string;
  command: string;
  command_id?: number | null;
  artifact_id?: number | null;
  target_path?: string | null;
  timeout_seconds: number;
  batch_size: number;
  batch_delay_seconds: number;
  rollout_profile: RolloutProfile;
  status: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type JobCreateRequest = {
  name: string;
  action_type:
    | "run_command"
    | "download_artifact"
    | "download_and_execute"
    | "network_ping"
    | "network_speed"
    | "service_control"
    | "software_uninstall"
    | "log_collect";
  command?: string;
  command_id?: number;
  artifact_id?: number;
  target_path?: string;
  target_agent_ids: string[];
  timeout_seconds: number;
  rollout_profile: RolloutProfile;
  batch_size?: number;
  batch_delay_seconds?: number;
};

export type JobCreateResponse = {
  job_id: number;
  targets_count: number;
  status: string;
};

export type JobExecution = {
  id: number;
  job_id: number;
  agent_id: string;
  status: string;
  attempts: number;
  wave_no: number;
  available_at: string;
  leased_until?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  exit_code?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  duration_ms?: number | null;
  error_message?: string | null;
  updated_at: string;
};

export type JobWave = {
  job_id: number;
  wave_no: number;
  total: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  timeout: number;
};

export type Artifact = {
  id: number;
  file_name: string;
  content_type?: string | null;
  size_bytes: number;
  sha256: string;
  created_at: string;
};

export type AllowedCommand = {
  id: number;
  name: string;
  command_text: string;
  description?: string | null;
  active: boolean;
  created_by?: string | null;
};

export type ApiError = {
  code?: string;
  message: string;
};

export type AuthMe = {
  admin_id: string;
  role: Role;
};

export type AdminUser = {
  admin_id: string;
  role: Role;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type InviteAdminUserRequest = {
  admin_id: string;
  role: Role;
  active?: boolean;
  redirect_to?: string;
};

export type InviteAdminUserResponse = {
  invited: boolean;
  user: AdminUser;
};

export type OperationTemplate = {
  id: number;
  key: string;
  name: string;
  category: OperationCategory;
  platform: "windows" | "linux" | "any";
  operation_type: OperationType;
  parameter_schema: Record<string, unknown>;
  command_template?: string | null;
  active: boolean;
  admin_only: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type ExecuteOperationRequest = {
  template_key: string;
  target_agent_ids: string[];
  params: Record<string, unknown>;
  rollout_profile?: RolloutProfile;
};

export type ExecuteOperationResponse = {
  job_id: number;
  resolved_action_type: string;
  resolved_command_preview: string;
};

export type AgentLogsQueryRequest = {
  source: "event_system" | "event_application" | "event_security" | "journal";
  level?: "info" | "warn" | "error" | "critical";
  since_minutes?: number;
  limit_lines?: number;
  contains?: string;
};

export type JobLogResult = {
  execution_id: number;
  agent_id: string;
  status: string;
  stdout?: string | null;
  stderr?: string | null;
  updated_at: string;
};

export type AgentDetails = {
  agent: Agent;
  latest_report?: {
    system?: {
      os_name?: string;
      os_version?: string;
      kernel_version?: string;
      uptime_seconds?: number;
    };
    resources?: {
      cpu?: { usage_percent?: number; model?: string; logical_cores?: number };
      memory?: { used_bytes?: number; total_bytes?: number };
      process_count?: number;
    };
    services?: { running_count?: number; sample?: string[] };
    installed_apps?: {
      count?: number;
      sample?: Array<{ name: string; version?: string | null; publisher?: string | null }>;
    };
    runtime?: {
      agent_version?: string;
      service_mode?: ServiceMode;
      started_at_unix_ms?: number;
      last_bootstrap_at_unix_ms?: number | null;
      last_registration_at_unix_ms?: number | null;
    };
  } | null;
  latest_snapshot_received_at?: string | null;
  latest_collected_at_unix_ms?: number | null;
};

export type DeploymentCredential = {
  id: number;
  name: string;
  kind: "ssh_key" | "ssh_password" | "winrm_password";
  username: string;
  description?: string | null;
  active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateDeploymentCredentialRequest = {
  name: string;
  kind: "ssh_key" | "ssh_password" | "winrm_password";
  username: string;
  secret: string;
  description?: string | null;
};

export type DeploymentHostInput = {
  host: string;
  port?: number;
  platform?: "windows" | "linux";
};

export type CreateAgentDeploymentRequest = {
  tenant_id: string;
  platform: "windows" | "linux" | "mixed";
  transport: "ssh" | "winrm";
  hosts: DeploymentHostInput[];
  credential_ref: number;
  agent_version: string;
  rollout_profile?: RolloutProfile;
  dry_run?: boolean;
};

export type CreateAgentDeploymentResponse = {
  deployment_id: number;
  job_id?: number | null;
};

export type AgentDeployment = {
  id: number;
  tenant_id: string;
  platform: string;
  transport: string;
  credential_ref: number;
  agent_version: string;
  rollout_profile: string;
  dry_run: boolean;
  status: string;
  total_hosts: number;
  success_hosts: number;
  failed_hosts: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type AgentDeploymentHost = {
  id: number;
  deployment_id: number;
  host: string;
  port: number;
  platform: string;
  status: string;
  error_reason?: string | null;
  command_preview?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at: string;
};

export type AgentDeploymentDetails = {
  deployment: AgentDeployment;
  hosts: AgentDeploymentHost[];
};

export type RetryDeploymentResponse = {
  deployment_id: number;
  retried_hosts: number;
};

export type AgentDownloadArtifact = {
  platform: "windows" | "linux";
  arch: string;
  version: string;
  filename: string;
  sha256: string;
  size_bytes: number;
  url: string;
};

export type AgentDownloadManifest = {
  generated_at: string;
  artifacts: AgentDownloadArtifact[];
};

export type TenantSummary = {
  tenant_id: string;
  name: string;
  active: boolean;
  metrics_url: string;
  register_url: string;
  report_interval_seconds: number;
  poll_interval_seconds: number;
  max_services: number;
  max_installed_apps: number;
  created_at: string;
  updated_at: string;
};
