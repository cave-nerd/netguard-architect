use crate::engine::{generate, RecommendationSet, RiskProfile};
use crate::nmap::ScanResult;

/// Generate firewall recommendations from a parsed scan result.
#[tauri::command]
pub fn generate_recommendations(
    scan: ScanResult,
    profile: RiskProfile,
    interface: String,
) -> Result<RecommendationSet, String> {
    let iface = if interface.is_empty() {
        "wan".to_string()
    } else {
        interface
    };
    Ok(generate(&scan, profile, &iface))
}
