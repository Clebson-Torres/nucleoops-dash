#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod api_client;
mod models;
mod state;

use std::sync::Arc;
use tauri::Manager;
use state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    
    tauri::Builder::default()
        .setup(|app| {
            // Inicializa estado da aplicação
            let state = AppState::new();
            app.manage(Arc::new(state));
            
            // Configura atualização automática
            let app_handle = app.handle();
            start_background_tasks(app_handle.clone());
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Comandos para métricas
            commands::get_latest_metrics,
            commands::get_hosts_list,
            commands::get_host_metrics,
            commands::get_system_stats,
            commands::start_live_stream,
            commands::stop_live_stream,
            commands::export_metrics_data,
            
            // Comandos para alertas
            commands::get_active_alerts,
            commands::set_alert_threshold,
            commands::acknowledge_alert,
            
            // Comandos de configuração
            commands::get_config,
            commands::update_config,
            commands::test_connection,
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao executar aplicação Tauri");
}

fn start_background_tasks(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            // Atualiza métricas a cada 5 segundos
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            
            // Aqui você pode enviar atualizações para o frontend
            // usando app.emit_all("metrics-update", data)
        }
    });
}