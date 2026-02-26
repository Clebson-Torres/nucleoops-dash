use crate::{models, api_client};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::AppHandle;
use serde_json;

pub struct AppState {
    pub api_client: Arc<api_client::ApiClient>,
    pub config: Mutex<models::DashboardConfig>,
    pub live_stream_active: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        // Configuração padrão
        let config = models::DashboardConfig {
            server_url: "http://127.0.0.1:8080".to_string(),
            refresh_interval_sec: 5,
            theme: models::Theme::Dark,
            show_offline_hosts: true,
            cpu_threshold_warning: 70.0,
            cpu_threshold_critical: 90.0,
            memory_threshold_warning: 80.0,
            memory_threshold_critical: 95.0,
        };
        
        Self {
            api_client: Arc::new(api_client::ApiClient::new(&config.server_url)),
            config: Mutex::new(config),
            live_stream_active: Mutex::new(false),
        }
    }
    
    pub fn get_config(&self) -> Result<models::DashboardConfig, Box<dyn std::error::Error>> {
        let config = self.config.lock().unwrap();
        Ok(config.clone())
    }
    
    pub async fn update_config(&self, new_config: models::DashboardConfig) -> Result<(), Box<dyn std::error::Error>> {
        let mut config = self.config.lock().await;
        
        // Se a URL do servidor mudou, recria o cliente
        if config.server_url != new_config.server_url {
            self.api_client = Arc::new(api_client::ApiClient::new(&new_config.server_url));
        }
        
        *config = new_config;
        self.save_config().await?;
        Ok(())
    }
    
    pub async fn update_server_url(&self, url: &str) -> Result<(), String> {
        let mut config = self.config.lock().await;
        config.server_url = url.to_string();
        
        // Recria o cliente com a nova URL
        self.api_client = Arc::new(api_client::ApiClient::new(url));
        
        self.save_config().await
            .map_err(|e| e.to_string())
    }
    
    async fn save_config(&self) -> Result<(), Box<dyn std::error::Error>> {
        let config = self.config.lock().await;
        let config_str = serde_json::to_string(&*config)?;
        
        // Aqui você pode salvar em arquivo, usando tauri::api::path
        // Por enquanto, apenas log
        tracing::info!("Configuração salva: {}", config_str);
        Ok(())
    }
    
    pub async fn start_live_stream(&self, app: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
        let mut active = self.live_stream_active.lock().await;
        if *active {
            return Ok(());
        }
        
        *active = true;
        let app_clone = app.clone();
        let client = self.api_client.clone();
        
        tokio::spawn(async move {
            while *self.live_stream_active.lock().await {
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                
                match client.get_latest_metrics(10).await {
                    Ok(metrics) => {
                        if let Err(e) = app_clone.emit_all("metrics-update", metrics) {
                            tracing::error!("Falha ao emitir atualização: {}", e);
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Falha ao buscar métricas: {}", e);
                    }
                }
            }
        });
        
        Ok(())
    }
    
    pub async fn stop_live_stream(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut active = self.live_stream_active.lock().await;
        *active = false;
        Ok(())
    }
}