use crate::{models, api_client, state::AppState};
use std::sync::Arc;
use tauri::State;
use serde::{Deserialize, Serialize};

#[tauri::command]
pub async fn get_latest_metrics(
    state: State<'_, Arc<AppState>>,
    limit: usize,
) -> Result<Vec<models::AgentMetrics>, String> {
    let client = state.api_client.clone();
    client.get_latest_metrics(limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_hosts_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<models::HostSummary>, String> {
    let client = state.api_client.clone();
    client.get_hosts_list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_host_metrics(
    state: State<'_, Arc<AppState>>,
    hostname: String,
    hours: u32,
) -> Result<Vec<models::AgentMetrics>, String> {
    let client = state.api_client.clone();
    client.get_host_metrics(&hostname, hours)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_system_stats(
    state: State<'_, Arc<AppState>>,
) -> Result<models::SystemStats, String> {
    let client = state.api_client.clone();
    client.get_system_stats()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_live_stream(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.start_live_stream(app)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_live_stream(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.stop_live_stream()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_metrics_data(
    state: State<'_, Arc<AppState>>,
    format: String,
    start_time: Option<String>,
    end_time: Option<String>,
) -> Result<String, String> {
    let client = state.api_client.clone();
    client.export_metrics(&format, start_time, end_time)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_config(
    state: State<'_, Arc<AppState>>,
) -> Result<models::DashboardConfig, String> {
    state.get_config()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_config(
    state: State<'_, Arc<AppState>>,
    config: models::DashboardConfig,
) -> Result<(), String> {
    state.update_config(config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, Arc<AppState>>,
    url: Option<String>,
) -> Result<bool, String> {
    let client = state.api_client.clone();
    
    if let Some(new_url) = url {
        state.update_server_url(&new_url).await?;
    }
    
    client.test_connection()
        .await
        .map_err(|e| e.to_string())
}