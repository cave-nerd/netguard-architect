// ── Nmap ────────────────────────────────────────────────────────────────────

export interface PortResult {
  port: number;
  protocol: string;
  state: "open" | "filtered" | "closed" | string;
  reason: string;
  service_name: string;
  product: string;
  version: string;
  conf: number;
  method: string;
}

export interface HostResult {
  ip: string;
  hostname: string | null;
  status: string;
  ports: PortResult[];
}

export interface ScanResult {
  hosts: HostResult[];
  total_open: number;
  total_filtered: number;
  total_closed: number;
  scan_time: string;
}

// ── OPNsense ─────────────────────────────────────────────────────────────────
// NOTE: OPNsenseConfig (with api_key/secret) is intentionally absent here.
// Credentials live only in the OS keyring and Rust AppState — they are never
// sent back across the IPC bridge.

export interface FirewallRule {
  uuid?: string;
  action: "pass" | "block" | "reject";
  direction: "in" | "out";
  interface: string;
  protocol: string;
  source_net: string;
  destination_net: string;
  destination_port: string;
  description: string;
  enabled: boolean;
  log: boolean;
}

export interface OPNsenseRuleRow {
  uuid?: string;
  action?: string;
  direction?: string;
  interface?: string;
  protocol?: string;
  source_net?: string;
  destination_net?: string;
  destination_port?: string;
  description?: string;
  enabled?: string;
}

export interface ApplyResult {
  rules_added: number;
  backup_taken: boolean;
  applied: boolean;
}

export interface ValidationResult {
  target: string;
  previously_open: number[];
  now_filtered: number[];
  still_open: number[];
}

// ── Engine ───────────────────────────────────────────────────────────────────

export type RiskProfile = "strict" | "balanced" | "permissive";

export type RiskSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface Recommendation {
  rule: FirewallRule;
  rationale: string;
  severity: RiskSeverity;
}

export interface RecommendationSet {
  profile: RiskProfile;
  recommendations: Recommendation[];
  summary: string;
}

// ── Capture (pcap / pcapng / tshark JSON) ────────────────────────────────────
// Field names match Rust serde serialization exactly.

// Rust enum uses #[serde(rename_all = "lowercase")]
export type CaptureFormat = "pcap" | "pcapng" | "tsharkjson";

export interface ProtocolCount {
  protocol: string;
  packets: number;
  bytes: number;
}

export interface Conversation {
  src_ip: string;
  dst_ip: string;
  dst_port: number | null;
  protocol: string;
  packets: number;
  bytes: number;
}

export interface CaptureFinding {
  severity: RiskSeverity;
  src_ip: string | null;
  dst_ip: string | null;
  port: number | null;
  description: string;
}

export interface CaptureHost {
  ip: string;
  packets_sent: number;
  packets_recv: number;
  bytes_sent: number;
  bytes_recv: number;
  protocols: string[];
  listening_ports: number[];
}

export interface CaptureResult {
  source_file: string;
  format: CaptureFormat;
  total_packets: number;
  total_bytes: number;
  hosts: CaptureHost[];
  conversations: Conversation[];
  protocol_counts: ProtocolCount[];
  risk_findings: CaptureFinding[];
}

// ── UI State ──────────────────────────────────────────────────────────────────

export type AppView = "dashboard" | "capture" | "staging" | "logs" | "settings";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}
