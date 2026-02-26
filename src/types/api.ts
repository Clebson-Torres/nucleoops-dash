export type Role = "admin" | "support";
export type RolloutProfile = "safe" | "balanced" | "fast";
export type ServiceMode = "windows_service" | "systemd" | "manual";

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
  action_type: "run_command" | "download_artifact" | "download_and_execute";
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
