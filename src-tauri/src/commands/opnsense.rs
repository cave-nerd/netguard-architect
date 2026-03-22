use keyring::Entry;
use serde::Serialize;
use tauri::State;
use zeroize::Zeroizing;

use crate::opnsense::{client::OPNsenseClient, rules::{FirewallRule, OPNsenseRuleRow}};
use crate::{AppState, StoredConfig};

const KEYRING_SERVICE: &str = "netguard-architect";
/// Hard cap on rules per deploy — prevents bulk DoS against OPNsense.
const MAX_RULES_PER_DEPLOY: usize = 200;

// ── Host validation ───────────────────────────────────────────────────────────

/// Validate `host` is a plain hostname/IP — no scheme, no `@`, no path.
/// Guards against SSRF via crafted userinfo (e.g. `attacker.com@192.168.1.1`).
fn validate_host(host: &str) -> Result<(), String> {
    let h = host.trim();
    if h.is_empty() {
        return Err("Host cannot be empty.".into());
    }
    if h.contains("://") {
        return Err("Host must not include a URL scheme (e.g. https://).".into());
    }
    if h.contains('@') {
        return Err("Host contains invalid character '@'.".into());
    }
    // Strip optional port before checking hostname chars
    let without_port = h.split(':').next().unwrap_or(h);
    let valid = without_port
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '[' | ']'));
    if !valid {
        return Err("Host contains invalid characters.".into());
    }
    Ok(())
}

// ── Keyring helpers (internal, not Tauri commands) ────────────────────────────

fn keyring_set(name: &str, value: &str) -> Result<(), String> {
    Entry::new(KEYRING_SERVICE, name)
        .map_err(|e| e.to_string())?
        .set_password(value)
        .map_err(|e| e.to_string())
}

fn keyring_get(name: &str) -> Result<String, String> {
    Entry::new(KEYRING_SERVICE, name)
        .map_err(|e| e.to_string())?
        .get_password()
        .map_err(|_| format!("Credential '{}' not found in keyring.", name))
}

fn keyring_delete(name: &str) {
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, name) {
        let _ = entry.delete_credential();
    }
}

// ── AppState client factory ───────────────────────────────────────────────────

fn make_client(state: &State<'_, AppState>) -> Result<OPNsenseClient, String> {
    let guard = state
        .config
        .lock()
        .map_err(|_| "Internal state lock poisoned.".to_string())?;
    let cfg = guard.as_ref().ok_or(
        "OPNsense is not configured. Go to Settings and save your credentials first.".to_string(),
    )?;
    OPNsenseClient::new(
        &cfg.host,
        cfg.api_key.as_str().to_string(),
        cfg.api_secret.as_str().to_string(),
        cfg.verify_tls,
    )
    .map_err(|e| e.to_string())
}

// ── Config lifecycle commands ─────────────────────────────────────────────────

/// Returned to the frontend after loading — host only, secrets stay in Rust.
#[derive(Serialize)]
pub struct ConfigSummary {
    pub host: String,
    pub verify_tls: bool,
}

/// Validate + save credentials to OS keyring and populate Rust AppState.
/// After this call the frontend never needs to transmit the secret over IPC again.
#[tauri::command]
pub fn save_opnsense_config(
    state: State<'_, AppState>,
    host: String,
    api_key: String,
    api_secret: String,
    verify_tls: bool,
) -> Result<(), String> {
    validate_host(&host)?;

    keyring_set("opnsense_host", &host)?;
    keyring_set("opnsense_api_key", &api_key)?;
    keyring_set("opnsense_api_secret", &api_secret)?;
    keyring_set("opnsense_verify_tls", if verify_tls { "true" } else { "false" })?;

    let mut guard = state
        .config
        .lock()
        .map_err(|_| "Internal state lock poisoned.".to_string())?;
    *guard = Some(StoredConfig {
        host,
        api_key: Zeroizing::new(api_key),
        api_secret: Zeroizing::new(api_secret),
        verify_tls,
    });
    Ok(())
}

/// Load credentials from OS keyring into Rust AppState.
/// Returns only {host, verify_tls} — secrets remain in Rust.
#[tauri::command]
pub fn load_opnsense_config(state: State<'_, AppState>) -> Result<ConfigSummary, String> {
    let host = keyring_get("opnsense_host")?;
    let api_key = keyring_get("opnsense_api_key")?;
    let api_secret = keyring_get("opnsense_api_secret")?;
    let verify_tls = keyring_get("opnsense_verify_tls")
        .map(|v| v != "false")
        .unwrap_or(true);

    validate_host(&host)?;

    let summary = ConfigSummary {
        host: host.clone(),
        verify_tls,
    };

    let mut guard = state
        .config
        .lock()
        .map_err(|_| "Internal state lock poisoned.".to_string())?;
    *guard = Some(StoredConfig {
        host,
        api_key: Zeroizing::new(api_key),
        api_secret: Zeroizing::new(api_secret),
        verify_tls,
    });

    Ok(summary)
}

/// Clear credentials from keyring and wipe Rust AppState.
#[tauri::command]
pub fn clear_opnsense_config(state: State<'_, AppState>) -> Result<(), String> {
    keyring_delete("opnsense_host");
    keyring_delete("opnsense_api_key");
    keyring_delete("opnsense_api_secret");
    keyring_delete("opnsense_verify_tls");

    let mut guard = state
        .config
        .lock()
        .map_err(|_| "Internal state lock poisoned.".to_string())?;
    *guard = None;
    Ok(())
}

// ── OPNsense API commands (secrets come from Rust state only) ─────────────────

#[derive(Serialize)]
pub struct ApplyResult {
    pub rules_added: usize,
    pub backup_taken: bool,
    pub applied: bool,
}

#[derive(Serialize)]
pub struct ValidationResult {
    pub target: String,
    pub previously_open: Vec<u16>,
    pub now_filtered: Vec<u16>,
    pub still_open: Vec<u16>,
}

/// Verify connectivity and return the OPNsense firmware version.
#[tauri::command]
pub async fn test_opnsense_connection(state: State<'_, AppState>) -> Result<String, String> {
    let client = make_client(&state)?;
    client.test_connection().await.map_err(|e| e.to_string())
}

/// Download a full config backup.
#[tauri::command]
pub async fn backup_opnsense_config(state: State<'_, AppState>) -> Result<String, String> {
    let client = make_client(&state)?;
    client.backup_config().await.map_err(|e| e.to_string())
}

/// Fetch the currently configured firewall rules.
#[tauri::command]
pub async fn get_existing_rules(
    state: State<'_, AppState>,
) -> Result<Vec<OPNsenseRuleRow>, String> {
    let client = make_client(&state)?;
    client.list_rules().await.map_err(|e| e.to_string())
}

/// Apply proposed firewall rules to OPNsense.
/// Always takes a config backup first (fail-safe).
/// Capped at MAX_RULES_PER_DEPLOY to prevent bulk DoS.
#[tauri::command]
pub async fn apply_firewall_rules(
    state: State<'_, AppState>,
    rules: Vec<FirewallRule>,
) -> Result<ApplyResult, String> {
    if rules.len() > MAX_RULES_PER_DEPLOY {
        return Err(format!(
            "Too many rules in one batch ({}). Maximum is {}.",
            rules.len(),
            MAX_RULES_PER_DEPLOY
        ));
    }

    let client = make_client(&state)?;

    // Fail-safe: backup before any modification
    client
        .backup_config()
        .await
        .map_err(|e| format!("Backup failed, aborting rule deployment: {}", e))?;

    let mut added = 0usize;
    for rule in &rules {
        client
            .add_rule(rule)
            .await
            .map_err(|e| format!("Failed to add rule '{}': {}", rule.description, e))?;
        added += 1;
    }

    client
        .apply_rules()
        .await
        .map_err(|e| format!("Failed to apply rule set: {}", e))?;

    Ok(ApplyResult {
        rules_added: added,
        backup_taken: true,
        applied: true,
    })
}

/// After rule deployment, re-scan the target to confirm ports are now filtered.
/// Uses internally-constructed nmap arguments only.
#[tauri::command]
pub async fn validate_scan(
    app: tauri::AppHandle,
    target: String,
    previously_open: Vec<u16>,
) -> Result<ValidationResult, String> {
    if previously_open.is_empty() {
        return Ok(ValidationResult {
            target,
            previously_open: vec![],
            now_filtered: vec![],
            still_open: vec![],
        });
    }

    // Port numbers are u16 — safe to format directly, no injection risk
    let port_list = previously_open
        .iter()
        .map(|p| p.to_string())
        .collect::<Vec<_>>()
        .join(",");

    // Call the internal (non-IPC) nmap invoker with trusted args
    let scan_result =
        super::nmap::invoke_nmap(&app, &target, &["-p".to_string(), port_list]).await?;

    let mut now_filtered = Vec::new();
    let mut still_open = Vec::new();

    for host in &scan_result.hosts {
        for port in &host.ports {
            if previously_open.contains(&port.port) {
                match port.state.as_str() {
                    "filtered" | "closed" => now_filtered.push(port.port),
                    "open" => still_open.push(port.port),
                    _ => {}
                }
            }
        }
    }

    Ok(ValidationResult {
        target,
        previously_open,
        now_filtered,
        still_open,
    })
}
