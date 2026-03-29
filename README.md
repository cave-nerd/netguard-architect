<div align="center">

# RuleForge

**Turn Nmap scans into OPNsense firewall rules — in seconds.**

[![Release](https://img.shields.io/github/v/release/cave-nerd/ruleforge?style=flat-square&color=6366f1)](https://github.com/cave-nerd/ruleforge/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-blue?style=flat-square&color=0ea5e9)](https://github.com/cave-nerd/ruleforge/releases/latest)
[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-10b981?style=flat-square)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202.0-ffc131?style=flat-square&logo=tauri)](https://tauri.app/)

[Download](#-download) · [Workflow](#-workflow) · [OPNsense Setup](#-opnsense-setup) · [Getting Started](#-getting-started-development)

</div>

---

## Features

| | Feature | Description |
|---|---|---|
| 📡 | **Nmap XML Import** | Parse scan output into a structured host/port view |
| 🦈 | **PCAP Import** | Load Wireshark `.pcap` / `.pcapng` captures as an alternative input |
| ⚙️ | **Recommendation Engine** | Three risk profiles generate OPNsense-ready rules automatically |
| 🛡️ | **OPNsense Integration** | Deploy rules directly via the REST API |
| 🗂️ | **Staging Area** | Review, reorder, and remove rules before they go live |
| 💾 | **Backup Before Deploy** | Automatic config backup taken first — deploy aborts if backup fails |
| ✅ | **Post-Deploy Validation** | Re-runs Nmap to confirm previously open ports are now filtered |
| 🔐 | **OS Keyring Storage** | Credentials live in Keychain / Credential Manager / Secret Service — never on disk |
| 📋 | **Audit Log** | Timestamped record of every action within a session |

### Risk Profiles

| Profile | Behavior |
|---------|----------|
| **Strict** | Zero-trust — block all unless service confidence = 10 |
| **Balanced** | CIS Level 1 baseline |
| **Permissive** | Log-only, no blocking |

---

## Download

| Platform | File |
|----------|------|
| 🐧 Linux | `RuleForge_0.1.0_amd64.AppImage` |
| 🪟 Windows | `ruleforge.exe` |

**[→ Latest Release](https://github.com/cave-nerd/ruleforge/releases/latest)**

### Linux
```bash
chmod +x 'RuleForge_0.1.0_amd64.AppImage'
./'RuleForge_0.1.0_amd64.AppImage'
```

> Requires WebKit2GTK: `sudo apt install libwebkit2gtk-4.1-0`

### Windows
Run `ruleforge.exe` directly — no installer needed.

---

## Workflow

```
1. Import    →  Open an Nmap XML (nmap -oX scan.xml <target>) or trigger a live scan
2. Review    →  Inspect discovered hosts, open ports, and service fingerprints
3. Generate  →  Pick a risk profile; the engine produces a full rule set
4. Stage     →  Review, reorder, or remove individual rules
5. Deploy    →  Apply to OPNsense (config backup taken automatically)
6. Validate  →  Follow-up scan confirms filtered ports
```

---

## OPNsense Setup

1. In your OPNsense web UI go to **System > Access > Users** and create a dedicated API user with firewall privileges
2. Generate an API key and secret for that user
3. In RuleForge open **Settings** and enter your OPNsense hostname/IP, API key, and API secret
4. Click **Test Connection** — the detected firmware version confirms the connection

> Credentials are stored in your OS keyring and loaded at startup. They are never written to disk or sent back to the UI after the initial save.

---

## PCAP / Wireshark Files

RuleForge parses `.pcap` and `.pcapng` files in addition to Nmap XML — useful when you have an existing traffic capture and want to derive rules from observed connections rather than active scanning.

> **Note:** If your PCAP fails to load, uncheck **Use Rich File Format** in the import dialog. Wireshark's extended format includes metadata blocks the parser does not currently support; standard pcap and plain pcapng files load without issue.

---

## Getting Started (Development)

### Prerequisites
- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) 18+
- [Nmap](https://nmap.org/download.html) on your `PATH`
- Tauri system dependencies — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

### Run locally
```bash
npm install
npm run tauri dev
```

### Build for distribution
```bash
# Linux AppImage / Windows .exe
npm run tauri build
```

---

## Architecture

```
src/                         # React frontend
  components/                # Dashboard, StagingArea, LogsPanel, Settings, Sidebar, CapturePanel
  hooks/                     # useTheme, useLogs

src-tauri/src/
  nmap/mod.rs                # Nmap XML parser → ScanResult
  opnsense/
    client.rs                # OPNsense REST client (reqwest + rustls, zeroizing creds)
    rules.rs                 # FirewallRule types and validation
  commands/
    nmap.rs                  # parse_nmap_xml, run_live_scan
    opnsense.rs              # save/load/clear config, deploy rules, validate scan
    recommendation.rs        # generate_recommendations
    capture.rs               # PCAP import
  engine/mod.rs              # Recommendation engine (Strict / Balanced / Permissive)
  lib.rs                     # AppState, plugin registration, command handler registration
```

---

## Security Notes

- TLS verification is enabled by default; a toggle is available for self-signed cert setups (dev only)
- Rule deployments are capped at 200 rules per batch to prevent accidental bulk changes
- SSRF protection: the OPNsense host field rejects URL schemes, `@` characters, and non-hostname characters
- Credentials are zeroed from memory when `OPNsenseClient` is dropped (`zeroize` crate)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri 2.0](https://tauri.app/) |
| Backend | [Rust](https://www.rust-lang.org/) (tokio async runtime) |
| Frontend | [React 18](https://react.dev/) + TypeScript + [Vite](https://vitejs.dev/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) + [Lucide](https://lucide.dev/) icons |
| HTTP client | reqwest (rustls-tls) |
| XML parsing | quick-xml |
| PCAP parsing | pcap-file + etherparse |
| Credential storage | keyring v3 |
| Memory safety | zeroize |

---

## Contributing

Issues and pull requests are welcome. For significant changes please open an issue first to discuss what you'd like to change.

---

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

You are free to use, modify, and distribute this software under the terms of the GPLv3. Any distributed modifications must also be released under the GPLv3.

---

<div align="center">
  <sub>Built with care by <a href="https://github.com/cave-nerd">cave-nerd</a></sub>
</div>
