use quick_xml::de::from_str;
use serde::{Deserialize, Serialize};

// ── Nmap XML types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NmapRun {
    #[serde(rename = "host", default)]
    pub hosts: Vec<NmapHost>,
    #[serde(rename = "@scanner", default)]
    pub scanner: String,
    #[serde(rename = "@startstr", default)]
    pub start_str: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NmapHost {
    #[serde(rename = "address", default)]
    pub addresses: Vec<NmapAddress>,
    #[serde(rename = "hostnames")]
    pub hostnames: Option<NmapHostnames>,
    #[serde(rename = "ports")]
    pub ports: Option<NmapPorts>,
    #[serde(rename = "status")]
    pub status: Option<NmapStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NmapStatus {
    #[serde(rename = "@state", default)]
    pub state: String,
    #[serde(rename = "@reason", default)]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NmapAddress {
    #[serde(rename = "@addr", default)]
    pub addr: String,
    #[serde(rename = "@addrtype", default)]
    pub addr_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NmapHostnames {
    #[serde(rename = "hostname", default)]
    pub hostnames: Vec<NmapHostname>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NmapHostname {
    #[serde(rename = "@name", default)]
    pub name: String,
    #[serde(rename = "@type", default)]
    pub hostname_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NmapPorts {
    #[serde(rename = "port", default)]
    pub ports: Vec<NmapPort>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NmapPort {
    #[serde(rename = "@protocol", default)]
    pub protocol: String,
    #[serde(rename = "@portid", default)]
    pub port_id: String,
    #[serde(rename = "state")]
    pub state: Option<NmapPortState>,
    #[serde(rename = "service")]
    pub service: Option<NmapService>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NmapPortState {
    #[serde(rename = "@state", default)]
    pub state: String,
    #[serde(rename = "@reason", default)]
    pub reason: String,
    #[serde(rename = "@reason_ttl", default)]
    pub reason_ttl: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NmapService {
    #[serde(rename = "@name", default)]
    pub name: String,
    #[serde(rename = "@product", default)]
    pub product: String,
    #[serde(rename = "@version", default)]
    pub version: String,
    #[serde(rename = "@extrainfo", default)]
    pub extra_info: String,
    #[serde(rename = "@conf", default)]
    pub conf: String,
    #[serde(rename = "@method", default)]
    pub method: String,
}

// ── Flat scan result (serialized to frontend) ───────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub hosts: Vec<HostResult>,
    pub total_open: usize,
    pub total_filtered: usize,
    pub total_closed: usize,
    pub scan_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostResult {
    pub ip: String,
    pub hostname: Option<String>,
    pub status: String,
    pub ports: Vec<PortResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortResult {
    pub port: u16,
    pub protocol: String,
    pub state: String,
    pub reason: String,
    pub service_name: String,
    pub product: String,
    pub version: String,
    pub conf: u8,
    pub method: String,
}

// ── Parser ──────────────────────────────────────────────────────────────────

pub fn parse_xml(xml: &str) -> anyhow::Result<ScanResult> {
    let nmap_run: NmapRun = from_str(xml)?;

    let mut hosts_out = Vec::new();
    let mut total_open = 0usize;
    let mut total_filtered = 0usize;
    let mut total_closed = 0usize;

    for host in &nmap_run.hosts {
        let ip = host
            .addresses
            .iter()
            .find(|a| a.addr_type == "ipv4" || a.addr_type == "ipv6")
            .map(|a| a.addr.clone())
            .unwrap_or_default();

        let hostname = host
            .hostnames
            .as_ref()
            .and_then(|h| h.hostnames.first())
            .map(|h| h.name.clone());

        let status = host
            .status
            .as_ref()
            .map(|s| s.state.clone())
            .unwrap_or_default();

        let mut ports_out = Vec::new();

        if let Some(ports) = &host.ports {
            for p in &ports.ports {
                let state_str = p
                    .state
                    .as_ref()
                    .map(|s| s.state.clone())
                    .unwrap_or_default();
                let reason = p
                    .state
                    .as_ref()
                    .map(|s| s.reason.clone())
                    .unwrap_or_default();

                match state_str.as_str() {
                    "open" => total_open += 1,
                    "filtered" => total_filtered += 1,
                    "closed" => total_closed += 1,
                    _ => {}
                }

                let port_num: u16 = p.port_id.parse().unwrap_or(0);
                let conf: u8 = p
                    .service
                    .as_ref()
                    .and_then(|s| s.conf.parse().ok())
                    .unwrap_or(0);

                ports_out.push(PortResult {
                    port: port_num,
                    protocol: p.protocol.clone(),
                    state: state_str,
                    reason,
                    service_name: p
                        .service
                        .as_ref()
                        .map(|s| s.name.clone())
                        .unwrap_or_default(),
                    product: p
                        .service
                        .as_ref()
                        .map(|s| s.product.clone())
                        .unwrap_or_default(),
                    version: p
                        .service
                        .as_ref()
                        .map(|s| s.version.clone())
                        .unwrap_or_default(),
                    conf,
                    method: p
                        .service
                        .as_ref()
                        .map(|s| s.method.clone())
                        .unwrap_or_default(),
                });
            }
        }

        hosts_out.push(HostResult {
            ip,
            hostname,
            status,
            ports: ports_out,
        });
    }

    Ok(ScanResult {
        hosts: hosts_out,
        total_open,
        total_filtered,
        total_closed,
        scan_time: nmap_run.start_str,
    })
}
