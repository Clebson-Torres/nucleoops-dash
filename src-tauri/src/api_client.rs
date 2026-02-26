use crate::models::{AgentMetrics, HostSummary, SystemStats};
use anyhow::{Result, Context};
use reqwest::Client;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, error, warn};

#[derive(Clone)]
pub struct ApiClient {
    client: Client,
    base_url: String,
    last_error: Arc<Mutex<Option<String>>>,
}

impl ApiClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to build HTTP client"),
            base_url: base_url.trim_end_matches('/').to_string(),
            last_error: Arc::new(Mutex::new(None)),
        }
    }

    // Testa conexão com o servidor
    pub async fn test_connection(&self) -> Result<bool> {
        let url = format!("{}/health", self.base_url);
        match self.client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    info!("✅ Conexão com servidor estabelecida");
                    Ok(true)
                } else {
                    warn!("⚠️ Servidor respondeu com erro: {}", response.status());
                    Ok(false)
                }
            }
            Err(e) => {
                error!("❌ Falha na conexão: {}", e);
                *self.last_error.lock().await = Some(e.to_string());
                Err(e.into())
            }
        }
    }

    // Busca métricas mais recentes
    pub async fn get_latest_metrics(&self, limit: usize) -> Result<Vec<AgentMetrics>> {
        let url = format!("{}/api/metrics/latest?limit={}", self.base_url, limit);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .context("Falha ao buscar métricas")?;
        
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("Erro HTTP {}: {}", status, body));
        }
        
        let metrics: Vec<AgentMetrics> = response.json().await?;
        info!("📊 Buscadas {} métricas", metrics.len());
        Ok(metrics)
    }

    // Busca lista de hosts
    pub async fn get_hosts_list(&self) -> Result<Vec<HostSummary>> {
        let url = format!("{}/api/hosts", self.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .context("Falha ao buscar hosts")?;
        
        // Se o endpoint não existir ainda, retorna array vazio
        if response.status() == 404 {
            info!("Endpoint /api/hosts não implementado ainda");
            return Ok(vec![]);
        }
        
        response.error_for_status_ref()?;
        let hosts: Vec<HostSummary> = response.json().await?;
        Ok(hosts)
    }

    // Busca métricas de um host específico
    pub async fn get_host_metrics(
        &self,
        hostname: &str,
        hours: u32,
    ) -> Result<Vec<AgentMetrics>> {
        let url = format!(
            "{}/api/metrics/host/{}?hours={}",
            self.base_url, hostname, hours
        );
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .context("Falha ao buscar métricas do host")?;
        
        // Se endpoint não existir, retorna vazio
        if response.status() == 404 {
            return Ok(vec![]);
        }
        
        response.error_for_status_ref()?;
        let metrics: Vec<AgentMetrics> = response.json().await?;
        Ok(metrics)
    }

    // Busca estatísticas do sistema
    pub async fn get_system_stats(&self) -> Result<SystemStats> {
        let url = format!("{}/api/stats", self.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .context("Falha ao buscar estatísticas")?;
        
        // Se não existir, cria estatísticas básicas
        if response.status() == 404 {
            info("Endpoint /api/stats não implementado, retornando dados mock");
            return Ok(self.mock_system_stats().await);
        }
        
        response.error_for_status_ref()?;
        let stats: SystemStats = response.json().await?;
        Ok(stats)
    }

    async fn mock_system_stats(&self) -> SystemStats {
        use chrono::Utc;
        
        SystemStats {
            total_hosts: 0,
            online_hosts: 0,
            total_alerts: 0,
            avg_cpu_across_hosts: 0.0,
            avg_memory_across_hosts: 0.0,
            busiest_host: "N/A".to_string(),
            timestamp: Utc::now(),
        }
    }

    // Exporta dados para CSV/JSON
    pub async fn export_metrics(
        &self,
        format: &str,
        start_time: Option<String>,
        end_time: Option<String>,
    ) -> Result<String> {
        let url = format!("{}/api/export?format={}", self.base_url, format);
        
        let mut request = self.client.get(&url);
        
        if let Some(start) = start_time {
            request = request.query(&[("start", start)]);
        }
        if let Some(end) = end_time {
            request = request.query(&[("end", end)]);
        }
        
        let response = request
            .send()
            .await
            .context("Falha ao exportar dados")?;
        
        response.error_for_status_ref()?;
        let data = response.text().await?;
        Ok(data)
    }

    // Busca último erro
    pub async fn get_last_error(&self) -> Option<String> {
        self.last_error.lock().await.clone()
    }

    // Limpa erro
    pub async fn clear_error(&self) {
        *self.last_error.lock().await = None;
    }
}