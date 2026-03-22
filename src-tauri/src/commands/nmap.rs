use std::fs;

use tauri_plugin_shell::ShellExt;

use crate::nmap::{parse_xml, ScanResult};

// ── Input validation ──────────────────────────────────────────────────────────

/// Validate a user-supplied nmap target to prevent flag injection.
/// Accepts IPs, CIDR ranges, hostnames, and IPv6 bracket notation.
/// Rejects anything starting with '-' and any shell-special characters.
fn validate_nmap_target(target: &str) -> Result<(), String> {
    let t = target.trim();
    if t.is_empty() {
        return Err("Target cannot be empty.".into());
    }
    // A leading '-' would be parsed by nmap as a flag
    if t.starts_with('-') {
        return Err("Invalid target: must not start with '-'.".into());
    }
    // Allowlist: characters valid in IPs, CIDRs, hostnames, and IPv6
    let valid = t.chars().all(|c| {
        c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '/' | ':' | '[' | ']' | '_')
    });
    if !valid {
        return Err(
            "Invalid target: only alphanumeric characters and '.', '-', '/', ':', '[', ']' are permitted.".into(),
        );
    }
    Ok(())
}

/// Validate that a file path supplied by the frontend for XML upload is safe.
fn validate_xml_path(path: &str) -> Result<(), String> {
    // Reject NUL bytes (NUL injection guard)
    if path.contains('\0') {
        return Err("File path contains invalid characters.".into());
    }
    // Reject path traversal sequences
    if path.contains("..") {
        return Err("File path must not contain '..'".into());
    }
    // Reject shell metacharacters
    let has_metachar = path.chars().any(|c| {
        matches!(c, ';' | '|' | '&' | '$' | '`' | '\'' | '"' | '>' | '<' | '(' | ')' | '!' | '\n' | '\r')
    });
    if has_metachar {
        return Err("File path contains disallowed characters.".into());
    }
    // Must have an .xml extension to prevent reading arbitrary sensitive files
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if !ext.eq_ignore_ascii_case("xml") {
        return Err("File must have a .xml extension.".into());
    }
    Ok(())
}

// ── Internal nmap invoker (pub(crate) — NOT a Tauri command) ─────────────────
// Used by validate_scan in opnsense.rs with internally-constructed, trusted args.

pub(crate) async fn invoke_nmap(
    app: &tauri::AppHandle,
    target: &str,
    extra_args: &[String],
) -> Result<ScanResult, String> {
    validate_nmap_target(target)?;

    let mut args = vec![
        "-sV".to_string(),
        "--version-intensity".to_string(),
        "7".to_string(),
        "-oX".to_string(),
        "-".to_string(), // XML to stdout
    ];

    // extra_args come only from trusted internal callers (not from IPC)
    args.extend_from_slice(extra_args);
    args.push(target.to_string());

    let shell = app.shell();
    let output = shell
        .command("nmap")
        .args(&args)
        .output()
        .await
        .map_err(|e| {
            format!(
                "Failed to invoke nmap: {}. Ensure nmap is installed and on PATH.",
                e
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("nmap exited with error: {}", stderr));
    }

    let xml = String::from_utf8_lossy(&output.stdout);
    parse_xml(&xml).map_err(|e| format!("Failed to parse nmap output: {}", e))
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Parse an Nmap XML file selected by the user via the file dialog.
/// The file_path is validated — it must have a .xml extension.
#[tauri::command]
pub fn parse_nmap_xml(file_path: String) -> Result<ScanResult, String> {
    validate_xml_path(&file_path)?;
    let xml = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    parse_xml(&xml).map_err(|e| format!("Failed to parse Nmap XML: {}", e))
}

/// Run Nmap against a validated target.
/// `extra_args` is intentionally NOT exposed via IPC — nmap flags are fixed
/// internally to prevent injection attacks.
#[tauri::command]
pub async fn run_nmap_scan(
    app: tauri::AppHandle,
    target: String,
) -> Result<ScanResult, String> {
    invoke_nmap(&app, &target, &[]).await
}
