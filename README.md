# Locohost

<p align="center">
  <img src="./logo.svg" alt="Locohost" width="300">
</p>

<p align="center">
  <em>Keep your localhost from going loco.</em>
</p>

<p align="center">
  A macOS menubar app for vibe coders who spawn servers and forget about them.<br>
  Track dev servers, Docker containers, and system health — all from your menubar.
</p>

---

## Install

**Homebrew:**

```bash
brew tap wesoudshoorn/locohost
brew install --cask locohost
```

**Download:**

Grab the latest DMG from [GitHub Releases](https://github.com/wesoudshoorn/locohost/releases).

> First launch: right-click the app → Open (unsigned builds require this once).

---

## Features

### Dev Servers
See everything running on localhost ports, grouped by [Conductor](https://conductor.build) workspace. One click to open, one click to kill. Live uptime counters make zombie servers obvious.

### Docker
First-class Docker tab showing running containers, mapped ports, and total disk usage. Stop containers directly. Health alerts when Docker eats >20GB of disk.

### System Health
7 automated health checks running every 30 minutes:
- **CPU** — flags dev servers, browsers, and other processes above threshold
- **Memory** — flags processes using >4GB or >10% of system RAM
- **Dev servers** — warns about servers running >6 hours with high resources
- **Docker** — warns about disk usage >20GB and stale containers
- **Browser** — flags Chrome/Arc tabs eating CPU or memory
- **Spotlight** — detects active re-indexing (explains the fan noise)
- **Sleep blockers** — finds processes preventing your Mac from sleeping
- **Battery** — escalates all warnings when battery is low

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `r` | Refresh |
| `↑/↓` | Navigate rows |
| `k` | Kill focused process |
| `o` | Open in browser |
| `Esc` | Clear focus |

---

## Built for Conductor

Locohost integrates with [Conductor](https://conductor.build) to group servers by workspace, show active/initializing state, and display which coding agent started each server.

---

## Quick Start (Development)

```bash
npm run setup      # Install deps, generate icons, create log dirs
npm run dev        # Web server with hot reload → http://localhost:3847
npm run electron   # Menubar app
```

## Auto-Start on Login

```bash
npm run install-agent    # Install launchd agent
npm run uninstall-agent  # Remove it
```

## Build

```bash
npm run dist             # Build universal DMG
```

---

## Stack

- **Zero runtime dependencies** — vanilla Node.js + Electron menubar
- macOS-native tray icon with health status (green/amber/red)
- Uses `lsof`, `ps`, `pmset` for system data — no daemons, no kernel extensions
- Reads Conductor SQLite DB for workspace metadata (optional, graceful fallback)
- Alert suppression with 2-hour window + re-alert on worsening

## License

MIT
