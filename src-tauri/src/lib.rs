pub mod capture;
pub mod commands;
pub mod engine;
pub mod nmap;
pub mod opnsense;

use std::sync::Mutex;
use zeroize::Zeroizing;

use commands::{
    capture::{generate_recommendations_from_capture, parse_capture, run_tshark_on_capture},
    nmap::{parse_nmap_xml, run_nmap_scan},
    opnsense::{
        apply_firewall_rules, backup_opnsense_config, clear_opnsense_config, get_existing_rules,
        load_opnsense_config, save_opnsense_config, test_opnsense_connection, validate_scan,
    },
    recommendation::generate_recommendations,
};

/// Sensitive config held entirely in Rust — never sent back across the IPC bridge.
pub struct StoredConfig {
    pub host: String,
    pub api_key: Zeroizing<String>,
    pub api_secret: Zeroizing<String>,
    pub verify_tls: bool,
}

/// Shared Tauri application state.
pub struct AppState {
    pub config: Mutex<Option<StoredConfig>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            config: Mutex::new(None),
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // OPNsense config lifecycle (secrets stored in OS keyring + Rust state)
            save_opnsense_config,
            load_opnsense_config,
            clear_opnsense_config,
            // OPNsense API (reads secrets from Rust state — never from frontend)
            test_opnsense_connection,
            backup_opnsense_config,
            get_existing_rules,
            apply_firewall_rules,
            validate_scan,
            // Nmap
            parse_nmap_xml,
            run_nmap_scan,
            // Recommendation engine
            generate_recommendations,
            // Packet capture (pcap/pcapng/tshark JSON)
            parse_capture,
            run_tshark_on_capture,
            generate_recommendations_from_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
