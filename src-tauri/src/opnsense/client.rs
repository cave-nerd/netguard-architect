use anyhow::{anyhow, Result};
use reqwest::{Client, StatusCode};
use serde_json::Value;
use zeroize::Zeroizing;

use super::rules::{FirewallRule, OPNsenseRuleListResponse, OPNsenseRulePayload, OPNsenseRuleRow};

/// OPNsense REST API client.
/// Credentials are held in Zeroizing wrappers so they are cleared from RAM
/// when this struct is dropped.
pub struct OPNsenseClient {
    client: Client,
    base_url: String,
    api_key: Zeroizing<String>,
    api_secret: Zeroizing<String>,
}

impl OPNsenseClient {
    /// Build a new client.
    /// `verify_tls` should be `true` in production; `false` only for self-signed dev setups.
    pub fn new(
        host: &str,
        api_key: String,
        api_secret: String,
        verify_tls: bool,
    ) -> Result<Self> {
        let builder = Client::builder()
            .use_rustls_tls()
            .danger_accept_invalid_certs(!verify_tls)
            .timeout(std::time::Duration::from_secs(30));

        let client = builder.build()?;

        let base_url = format!("https://{}/api", host.trim_end_matches('/'));

        Ok(Self {
            client,
            base_url,
            api_key: Zeroizing::new(api_key),
            api_secret: Zeroizing::new(api_secret),
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}/{}", self.base_url, path.trim_start_matches('/'))
    }

    async fn get(&self, path: &str) -> Result<Value> {
        let resp = self
            .client
            .get(self.url(path))
            .basic_auth(self.api_key.as_str(), Some(self.api_secret.as_str()))
            .send()
            .await?;

        self.check_status(&resp)?;
        Ok(resp.json().await?)
    }

    async fn post(&self, path: &str, body: &impl serde::Serialize) -> Result<Value> {
        let resp = self
            .client
            .post(self.url(path))
            .basic_auth(self.api_key.as_str(), Some(self.api_secret.as_str()))
            .json(body)
            .send()
            .await?;

        self.check_status(&resp)?;
        Ok(resp.json().await?)
    }

    fn check_status(&self, resp: &reqwest::Response) -> Result<()> {
        match resp.status() {
            StatusCode::OK | StatusCode::CREATED => Ok(()),
            StatusCode::UNAUTHORIZED => Err(anyhow!("OPNsense: authentication failed — check API key/secret")),
            StatusCode::FORBIDDEN => Err(anyhow!("OPNsense: insufficient privileges for this endpoint")),
            StatusCode::NOT_FOUND => Err(anyhow!("OPNsense: endpoint not found — check OPNsense version")),
            s => Err(anyhow!("OPNsense: unexpected status {}", s)),
        }
    }

    // ── Connection test ─────────────────────────────────────────────────────

    pub async fn test_connection(&self) -> Result<String> {
        let val = self.get("core/firmware/info").await?;
        let version = val
            .get("firmware")
            .and_then(|f| f.get("version"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        Ok(version)
    }

    // ── Backup ──────────────────────────────────────────────────────────────

    pub async fn backup_config(&self) -> Result<String> {
        let val = self.get("core/backup/download/this").await?;
        Ok(val.to_string())
    }

    // ── Rule management (MVC endpoints) ────────────────────────────────────

    pub async fn list_rules(&self) -> Result<Vec<OPNsenseRuleRow>> {
        let val = self.get("firewall/filter/searchRule").await?;
        let response: OPNsenseRuleListResponse = serde_json::from_value(val)?;
        Ok(response.rows.unwrap_or_default())
    }

    pub async fn add_rule(&self, rule: &FirewallRule) -> Result<String> {
        rule.validate().map_err(|e| anyhow::anyhow!("Rule validation failed: {}", e))?;
        let payload = OPNsenseRulePayload::from(rule);
        let val = self.post("firewall/filter/addRule", &payload).await?;
        let uuid = val
            .get("uuid")
            .and_then(|u| u.as_str())
            .unwrap_or("")
            .to_string();
        Ok(uuid)
    }

    pub async fn apply_rules(&self) -> Result<()> {
        let _val = self
            .post("firewall/filter/apply", &serde_json::json!({}))
            .await?;
        Ok(())
    }

    // ── Validation scan ─────────────────────────────────────────────────────
    // After applying rules we verify that previously-open ports are now filtered.
    // This calls back into the nmap module at the command layer.
    pub async fn get_rule_count(&self) -> Result<usize> {
        let rules = self.list_rules().await?;
        Ok(rules.len())
    }
}
