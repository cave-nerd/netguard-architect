# NetGuard Architect

A desktop security tool that ingests Nmap scan results and automatically generates firewall rules for OPNsense — bridging the gap between network reconnaissance and firewall policy enforcement.

Built with Tauri 2.0 (Rust backend) + React 18 + TypeScript + Tailwind CSS.

## Features

- **Nmap XML import** — parse scan output into a structured host/port view
- **Wireshark/PCAP import** — load `.pcap` / `.pcapng` capture files as an alternative input source (see note below)
- **Recommendation engine** — three risk profiles generate OPNsense-ready rules:
  - **Strict** — zero-trust, block all unless service confidence = 10
  - **Balanced** — CIS Level 1 baseline
  - **Permissive** — log-only, no blocking
- **OPNsense integration** — deploy rules directly via the OPNsense REST API
- **Staging area** — review and edit generated rules before deploying
- **Backup before deploy** — automatic config backup is taken before any rule changes; deploy aborts if backup fails
- **Post-deploy validation scan** — re-runs Nmap against the target to confirm previously open ports are now filtered
- **Secure credential storage** — API key and secret live in the OS keyring (Keychain / Credential Manager / Secret Service), never in config files or transmitted back to the frontend
- **Audit log panel** — timestamped record of all actions within a session

## Screenshots

<!-- Add screenshots here -->

## Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) 18+
- [Nmap](https://nmap.org/download.html) on your `PATH` (required for live scans and post-deploy validation)
- Tauri system dependencies for your platform — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

## Getting Started

```bash
# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev

# Build a release AppImage (Linux) / .app (macOS) / .exe (Windows)
npm run tauri build
```

## OPNsense Setup

1. In your OPNsense web UI, go to **System > Access > Users** and create a dedicated API user with firewall privileges.
2. Generate an API key and secret for that user.
3. In NetGuard Architect, open **Settings** and enter your OPNsense hostname/IP, API key, and API secret.
4. Click **Test Connection** to verify — the detected firmware version will be displayed.

Credentials are stored in your OS keyring and loaded at startup. They are never written to disk or sent back to the UI after the initial save.

## Wireshark / PCAP Files

NetGuard Architect can parse Wireshark `.pcap` and `.pcapng` capture files in addition to Nmap XML. This is useful when you already have a traffic capture and want to derive firewall rules from observed connections rather than active scanning.

> **Note:** If your PCAP file fails to load, uncheck **Use Rich File Format** in the import dialog. Wireshark's rich/extended format includes extra metadata blocks that the parser does not currently support; standard pcap and plain pcapng files load without issue.

## Workflow

1. **Import** — open an Nmap XML file (`nmap -oX scan.xml <target>`) or trigger a live scan from the app
2. **Review** — inspect discovered hosts, open ports, and service fingerprints in the Dashboard
3. **Generate** — choose a risk profile and target interface; the engine produces a rule set
4. **Stage** — review, reorder, or remove individual rules in the Staging Area
5. **Deploy** — apply rules to OPNsense (backup is taken automatically)
6. **Validate** — run a follow-up scan to confirm ports are filtered

## Architecture

```
src/                        # React frontend
  components/               # UI panels (Dashboard, StagingArea, LogsPanel, Settings, Sidebar)
  hooks/                    # useTheme, useLogs

src-tauri/src/
  nmap/mod.rs               # Nmap XML parser -> ScanResult
  opnsense/
    client.rs               # OPNsense REST client (reqwest + rustls, Zeroizing creds)
    rules.rs                # FirewallRule types and validation
  commands/
    nmap.rs                 # Tauri commands: parse_nmap_xml, run_live_scan
    opnsense.rs             # Tauri commands: save/load/clear config, deploy rules, validate scan
    recommendation.rs       # Tauri command: generate_recommendations
  engine/                   # Recommendation engine (Strict / Balanced / Permissive profiles)
  lib.rs                    # AppState, plugin registration, command handler registration
```

## Security Notes

- TLS verification is enabled by default; a toggle is provided for self-signed certificate setups (dev only — do not disable in production)
- Rule deployments are capped at 200 rules per batch to prevent accidental bulk changes
- SSRF protection: the OPNsense host field rejects URL schemes, `@` characters, and non-hostname characters
- Credentials are zeroed from memory when the `OPNsenseClient` is dropped (`zeroize` crate)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Tauri 2.0 |
| Backend | Rust (tokio async runtime) |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + Lucide icons |
| HTTP client | reqwest (rustls-tls) |
| XML parsing | quick-xml |
| PCAP parsing | pcap-file + etherparse |
| Credential storage | keyring v3 |
| Memory safety | zeroize |

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

You are free to use, modify, and distribute this software under the terms of the GPLv3. Any distributed modifications must also be released under the GPLv3.
