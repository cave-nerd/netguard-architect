import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Activity,
  AlertTriangle,
  FileSearch,
  Info,
  Plus,
  Tag,
  Upload,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  CaptureResult,
  CaptureFinding,
  LogEntry,
  RecommendationSet,
  RiskProfile,
  RiskSeverity,
} from "../types";

interface CapturePanelProps {
  captureResult: CaptureResult | null;
  setCaptureResult: (r: CaptureResult | null) => void;
  hostTags: Record<string, string[]>;
  setHostTags: (tags: Record<string, string[]>) => void;
  addLog: (level: LogEntry["level"], message: string) => void;
  opnsenseInterface: string;
  onRulesGenerated: (recs: RecommendationSet) => void;
}

// ── Tag system ────────────────────────────────────────────────────────────────

const ROLE_TAGS: { name: string; cls: string; hint: string }[] = [
  // Application tiers
  { name: "frontend",       cls: "bg-blue-900/60 text-blue-300 border-blue-700/60",       hint: "Accepts client traffic; proxies to backend" },
  { name: "backend",        cls: "bg-purple-900/60 text-purple-300 border-purple-700/60", hint: "Internal app tier; reachable from frontend only" },
  { name: "database",       cls: "bg-orange-900/60 text-orange-300 border-orange-700/60", hint: "Data tier; reachable from backend/frontend only" },
  { name: "cache",          cls: "bg-yellow-900/60 text-yellow-300 border-yellow-700/60", hint: "Cache layer; reachable from backend/frontend only" },
  // Infrastructure
  { name: "router",         cls: "bg-sky-900/60 text-sky-300 border-sky-700/60",          hint: "Layer-3 router or gateway; manages inter-VLAN routing" },
  { name: "firewall",       cls: "bg-red-950/70 text-red-300 border-red-800/60",          hint: "Perimeter or internal firewall appliance" },
  { name: "access-point",   cls: "bg-cyan-900/60 text-cyan-300 border-cyan-700/60",       hint: "Wireless access point; bridge between wireless and wired" },
  { name: "switch",         cls: "bg-slate-700/60 text-slate-300 border-slate-600/60",    hint: "Layer-2 switch; managed or unmanaged" },
  { name: "container-host", cls: "bg-indigo-900/60 text-indigo-300 border-indigo-700/60", hint: "Docker/Kubernetes node running containerised workloads" },
  { name: "vpn",            cls: "bg-violet-900/60 text-violet-300 border-violet-700/60", hint: "VPN gateway or endpoint; tunnelled traffic" },
  { name: "nas",            cls: "bg-lime-900/60 text-lime-300 border-lime-700/60",       hint: "Network-attached storage; SMB/NFS server" },
  { name: "iot",            cls: "bg-pink-900/60 text-pink-300 border-pink-700/60",       hint: "IoT/embedded device; minimal trust, should be isolated" },
  // Trust zones
  { name: "client",         cls: "bg-gray-700/60 text-gray-300 border-gray-600/60",       hint: "End-user host; may only reach frontend" },
  { name: "admin",          cls: "bg-red-900/60 text-red-300 border-red-700/60",          hint: "Privileged host; can reach everything" },
  { name: "monitor",        cls: "bg-green-900/60 text-green-300 border-green-700/60",    hint: "Monitoring/observability; can poll everything" },
  { name: "internal",       cls: "bg-teal-900/60 text-teal-300 border-teal-700/60",       hint: "Trusted internal host" },
  { name: "external",       cls: "bg-rose-900/60 text-rose-300 border-rose-700/60",       hint: "Untrusted external host; block from internal" },
  { name: "dmz",            cls: "bg-amber-900/60 text-amber-300 border-amber-700/60",    hint: "Demilitarized zone; limited trust" },
];

function tagCls(name: string): string {
  return ROLE_TAGS.find((t) => t.name === name)?.cls
    ?? "bg-surface-700 text-gray-300 border-surface-500";
}

// ── Tag editor ────────────────────────────────────────────────────────────────

function TagEditor({
  ip,
  tags,
  onChange,
}: {
  ip: string;
  tags: string[];
  onChange: (ip: string, next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const available = ROLE_TAGS.filter((t) => !tags.includes(t.name));

  return (
    <div ref={ref} className="relative flex flex-wrap gap-1 items-center min-w-[80px]">
      {tags.map((tag) => (
        <button
          key={tag}
          onClick={() => onChange(ip, tags.filter((t) => t !== tag))}
          title="Click to remove"
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs border transition-opacity hover:opacity-70 ${tagCls(tag)}`}
        >
          {tag}
          <X size={9} />
        </button>
      ))}
      {available.length > 0 && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-gray-600 hover:text-gray-300 transition-colors"
          title="Add role tag"
        >
          <Plus size={12} />
        </button>
      )}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-surface-800 border border-surface-600 rounded-lg shadow-xl p-1.5 w-36">
          {available.map((t) => (
            <button
              key={t.name}
              title={t.hint}
              onClick={() => { onChange(ip, [...tags, t.name]); setOpen(false); }}
              className={`block w-full text-left px-2 py-1 rounded text-xs border mb-0.5 last:mb-0 transition-opacity hover:opacity-80 ${t.cls}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function severityColor(s: RiskSeverity): string {
  switch (s) {
    case "critical": return "text-red-400 bg-red-900/30 border-red-700/50";
    case "high":     return "text-orange-400 bg-orange-900/30 border-orange-700/50";
    case "medium":   return "text-yellow-400 bg-yellow-900/30 border-yellow-700/50";
    case "low":      return "text-blue-400 bg-blue-900/30 border-blue-700/50";
    default:         return "text-gray-400 bg-surface-700 border-surface-500";
  }
}

function severityIcon(s: RiskSeverity) {
  switch (s) {
    case "critical":
    case "high":
      return <AlertTriangle size={14} />;
    case "medium":
      return <Zap size={14} />;
    default:
      return <Info size={14} />;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-surface-800 border border-surface-600 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function ProtocolBar({ counts }: { counts: CaptureResult["protocol_counts"] }) {
  const top = counts.slice(0, 8);
  const total = top.reduce((s, p) => s + p.packets, 0) || 1;
  const COLORS = [
    "bg-brand-500",
    "bg-cyan-500",
    "bg-purple-500",
    "bg-yellow-500",
    "bg-pink-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-indigo-500",
  ];

  return (
    <div className="bg-surface-800 border border-surface-600 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        Protocol Breakdown
      </h3>
      <div className="flex h-5 rounded overflow-hidden gap-0.5 mb-3">
        {top.map((p, i) => (
          <div
            key={p.protocol}
            className={`${COLORS[i % COLORS.length]} transition-all`}
            style={{ width: `${(p.packets / total) * 100}%` }}
            title={`${p.protocol}: ${p.packets} packets`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {top.map((p, i) => (
          <span key={p.protocol} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${COLORS[i % COLORS.length]}`} />
            {p.protocol} ({p.packets.toLocaleString()})
          </span>
        ))}
      </div>
    </div>
  );
}

function FindingsList({ findings }: { findings: CaptureFinding[] }) {
  if (findings.length === 0) {
    return (
      <div className="bg-surface-800 border border-surface-600 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Risk Findings</h3>
        <p className="text-xs text-gray-500">No risks detected in this capture.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-800 border border-surface-600 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        Risk Findings ({findings.length})
      </h3>
      <ul className="space-y-2">
        {findings.map((f, i) => (
          <li
            key={i}
            className={`flex items-start gap-2 text-xs px-3 py-2 rounded border ${severityColor(f.severity)}`}
          >
            <span className="mt-0.5 shrink-0">{severityIcon(f.severity)}</span>
            <span className="uppercase font-bold shrink-0 w-16">{f.severity}</span>
            <span>{f.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CapturePanel({
  captureResult,
  setCaptureResult,
  hostTags,
  setHostTags,
  addLog,
  opnsenseInterface,
  onRulesGenerated,
}: CapturePanelProps) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [useTshark, setUseTshark] = useState(true);
  const [profile, setProfile] = useState<RiskProfile>("balanced");

  async function handleGenerateRules() {
    if (!captureResult) return;
    setGenerating(true);
    addLog("info", `Generating ${profile} firewall rules from capture…`);
    try {
      const recs = await invoke<RecommendationSet>("generate_recommendations_from_capture", {
        capture: captureResult,
        profile,
        interface: opnsenseInterface || "wan",
        hostTags,
      });
      addLog("success", recs.summary);
      onRulesGenerated(recs);
    } catch (e) {
      addLog("error", `Rule generation failed: ${e}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleOpen() {
    let selected: string | string[] | null;
    try {
      selected = await open({
        title: "Open Capture File",
        filters: [
          { name: "Packet Captures", extensions: ["pcap", "pcapng", "cap", "json"] },
        ],
        multiple: false,
        directory: false,
      });
    } catch (e) {
      addLog("error", `File dialog failed: ${e}`);
      return;
    }
    if (!selected) return;
    const filePath = typeof selected === "string" ? selected : selected[0];
    await ingest(filePath);
  }

  async function ingest(filePath: string) {
    setLoading(true);
    addLog("info", `Loading capture: ${filePath}`);
    try {
      let result: CaptureResult;
      if (useTshark && (filePath.endsWith(".pcap") || filePath.endsWith(".pcapng") || filePath.endsWith(".cap"))) {
        result = await invoke<CaptureResult>("run_tshark_on_capture", { filePath });
        addLog("info", "Parsed via tshark (rich L7 detail)");
      } else {
        result = await invoke<CaptureResult>("parse_capture", { filePath });
        addLog("info", "Parsed via built-in Rust parser");
      }
      setCaptureResult(result);
      addLog(
        "success",
        `Loaded ${result.source_file}: ${result.total_packets.toLocaleString()} packets, ${result.hosts.length} hosts, ${result.risk_findings.length} findings`,
      );
    } catch (err) {
      addLog("error", `Capture parse failed: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-surface-600 bg-surface-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <Activity size={18} className="text-brand-400" />
          <h1 className="text-base font-semibold text-white">Capture Analysis</h1>
          {captureResult && (
            <span className="text-xs text-gray-500 ml-1">
              — {captureResult.source_file} ({captureResult.format})
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useTshark}
              onChange={(e) => setUseTshark(e.target.checked)}
              className="rounded border-surface-500 bg-surface-700 text-brand-500"
            />
            Use tshark (richer L7)
          </label>

          {/* Profile selector — shown when a capture is loaded */}
          {captureResult && (
            <div className="flex items-center gap-1">
              {(["strict", "balanced", "permissive"] as RiskProfile[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setProfile(p)}
                  className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                    profile === p
                      ? p === "strict"
                        ? "bg-red-600/30 text-red-300 border border-red-600/40"
                        : p === "balanced"
                        ? "bg-brand-600/30 text-brand-300 border border-brand-600/40"
                        : "bg-green-600/30 text-green-300 border border-green-600/40"
                      : "text-gray-500 hover:text-gray-300 hover:bg-surface-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Generate rules button — only when a capture is loaded */}
          {captureResult && (
            <button
              onClick={handleGenerateRules}
              disabled={generating || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap size={14} />
              {generating ? "Generating…" : "Generate Rules →"}
            </button>
          )}

          <button
            onClick={handleOpen}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={14} />
            {loading ? "Parsing…" : "Open Capture"}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {!captureResult ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <FileSearch size={48} className="text-surface-500" />
            <div>
              <p className="text-gray-400 font-medium">No capture loaded</p>
              <p className="text-xs text-gray-600 mt-1">
                Open a .pcap, .pcapng, or tshark JSON file to analyse network traffic.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Packets" value={captureResult.total_packets.toLocaleString()} />
              <StatCard label="Total Traffic" value={formatBytes(captureResult.total_bytes)} />
              <StatCard label="Unique Hosts" value={captureResult.hosts.length} />
              <StatCard label="Conversations" value={captureResult.conversations.length} />
            </div>

            {/* Protocol breakdown */}
            {captureResult.protocol_counts.length > 0 && (
              <ProtocolBar counts={captureResult.protocol_counts} />
            )}

            {/* Risk findings */}
            <FindingsList findings={captureResult.risk_findings} />

            {/* Host table */}
            <div className="bg-surface-800 border border-surface-600 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-600">
                <Wifi size={14} className="text-brand-400" />
                <h3 className="text-sm font-semibold text-gray-300">
                  Hosts ({captureResult.hosts.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-600 text-gray-500">
                      <th className="px-4 py-2 text-left font-medium">IP Address</th>
                      <th className="px-4 py-2 text-right font-medium">Pkts Sent</th>
                      <th className="px-4 py-2 text-right font-medium">Pkts Recv</th>
                      <th className="px-4 py-2 text-right font-medium">Bytes Out</th>
                      <th className="px-4 py-2 text-right font-medium">Bytes In</th>
                      <th className="px-4 py-2 text-left font-medium">Protocols</th>
                      <th className="px-4 py-2 text-left font-medium">Open Ports</th>
                      <th className="px-4 py-2 text-left font-medium">
                        <span className="flex items-center gap-1"><Tag size={11} /> Role Tags</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {captureResult.hosts.map((h) => (
                      <tr
                        key={h.ip}
                        className="border-b border-surface-700/50 hover:bg-surface-700/30 transition-colors"
                      >
                        <td className="px-4 py-2 font-mono text-gray-200">{h.ip}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{h.packets_sent.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{h.packets_recv.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{formatBytes(h.bytes_sent)}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{formatBytes(h.bytes_recv)}</td>
                        <td className="px-4 py-2 text-gray-400">{h.protocols.slice(0, 4).join(", ")}{h.protocols.length > 4 ? ` +${h.protocols.length - 4}` : ""}</td>
                        <td className="px-4 py-2 font-mono text-gray-400">
                          {h.listening_ports.length > 0
                            ? h.listening_ports.slice(0, 6).join(", ") + (h.listening_ports.length > 6 ? " …" : "")
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <TagEditor
                            ip={h.ip}
                            tags={hostTags[h.ip] ?? []}
                            onChange={(ip, next) => setHostTags({ ...hostTags, [ip]: next })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Conversation table */}
            {captureResult.conversations.length > 0 && (
              <div className="bg-surface-800 border border-surface-600 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-600">
                  <Activity size={14} className="text-brand-400" />
                  <h3 className="text-sm font-semibold text-gray-300">
                    Top Conversations (showing {Math.min(captureResult.conversations.length, 100)} of {captureResult.conversations.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-surface-600 text-gray-500">
                        <th className="px-4 py-2 text-left font-medium">Source</th>
                        <th className="px-4 py-2 text-left font-medium">Destination</th>
                        <th className="px-4 py-2 text-left font-medium">Proto</th>
                        <th className="px-4 py-2 text-right font-medium">Packets</th>
                        <th className="px-4 py-2 text-right font-medium">Bytes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {captureResult.conversations.slice(0, 100).map((c, i) => (
                        <tr
                          key={i}
                          className="border-b border-surface-700/50 hover:bg-surface-700/30 transition-colors"
                        >
                          <td className="px-4 py-2 font-mono text-gray-300">
                            {c.src_ip}
                          </td>
                          <td className="px-4 py-2 font-mono text-gray-300">
                            {c.dst_ip}{c.dst_port != null ? `:${c.dst_port}` : ""}
                          </td>
                          <td className="px-4 py-2 text-gray-400 uppercase">{c.protocol}</td>
                          <td className="px-4 py-2 text-right text-gray-400">{c.packets.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-gray-400">{formatBytes(c.bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
