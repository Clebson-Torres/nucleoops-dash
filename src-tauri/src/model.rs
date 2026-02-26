use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

// Modelo para métricas do agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    pub hostname: String,
    pub ip: String,
    pub os: String,
    pub cpu_usage: f32,
    pub memory_usage: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub created_at: DateTime<Utc>,
    
    // Novos campos que podemos adicionar
    #[serde(default)]
    pub disk_usage: Option<f32>,
    #[serde(default)]
    pub network_in: Option<u64>,
    #[serde(default)]
    pub network_out: Option<u64>,
    #[serde(default)]
    pub uptime_seconds: Option<u64>,
    #[serde(default)]
    pub process_count: Option<u32>,
}

// Resumo por host
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostSummary {
    pub hostname: String,
    pub os: String,
    pub ip: String,
    pub last_seen: DateTime<Utc>,
    pub avg_cpu: f32,
    pub avg_memory: f32,
    pub alert_count: u32,
    pub status: HostStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HostStatus {
    Healthy,
    Warning,
    Critical,
    Offline,
}

// Estatísticas do sistema
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStats {
    pub total_hosts: usize,
    pub online_hosts: usize,
    pub total_alerts: usize,
    pub avg_cpu_across_hosts: f32,
    pub avg_memory_across_hosts: f32,
    pub busiest_host: String,
    pub timestamp: DateTime<Utc>,
}

// Configuração do dashboard
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardConfig {
    pub server_url: String,
    pub refresh_interval_sec: u64,
    pub theme: Theme,
    pub show_offline_hosts: bool,
    pub cpu_threshold_warning: f32,
    pub cpu_threshold_critical: f32,
    pub memory_threshold_warning: f32,
    pub memory_threshold_critical: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Theme {
    Light,
    Dark,
    System,
}

// Alertas
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub id: String,
    pub hostname: String,
    pub severity: AlertSeverity,
    pub message: String,
    pub metric: String,
    pub value: f32,
    pub threshold: f32,
    pub timestamp: DateTime<Utc>,
    pub acknowledged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertSeverity {
    Info,
    Warning,
    Critical,
}