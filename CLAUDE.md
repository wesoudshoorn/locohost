# Locohost

macOS menubar utility for tracking localhost dev servers, Docker containers, and system health.

## Quick Start

```bash
npm run setup      # First time setup (install deps, generate icons, create log dirs)
npm run dev        # Standalone web server with hot reload
npm run electron   # Menubar app (Electron)
npm test           # Run tests
```

## Scripts

- `npm run setup` - Install deps, generate tray icons, create ~/mac-health-watch/logs/
- `npm run dev` - Standalone server with --watch (auto-reload)
- `npm start` - Standalone server (production)
- `npm run electron` - Launch as macOS menubar app
- `npm run install-agent` - Install launchd agent for auto-start on login
- `npm run uninstall-agent` - Remove launchd agent
- `npm test` - Run test suite
- `npm run dist` - Build universal DMG

## Environment

- `PORT` or `CONDUCTOR_PORT` - Server port (default: 3847)

## Architecture

### Standalone mode (`server.js`)
Uses shared API server from `lib/api.js`, serves dashboard UI from `ui/`.

### Menubar mode (`main.js`)
Electron app using `menubar` package. Uses same shared API server (without static file serving).

### Key modules
- `lib/api.js` - Shared HTTP API server (routing, CORS, endpoints)
- `lib/processes.js` - Queries `lsof` for localhost listening processes, Conductor DB integration
- `lib/docker.js` - Docker container listing, disk usage, container stop
- `lib/health/monitor.js` - Orchestrates health checks every 30 minutes
- `lib/health/checks/` - Individual checks: cpu, memory, dev-servers, docker, browser, indexing, battery, sleep-blockers
- `lib/health/alert-state.js` - Repeat suppression (2h window, persisted to ~/mac-health-watch/state.json)
- `lib/health/severity.js` - Severity classification and battery-aware adjustment
- `lib/health/logger.js` - Logs to ~/mac-health-watch/logs/YYYY-MM-DD.log
- `ui/` - Dashboard HTML/CSS/JS with tabs: Servers, Health, Docker, System

### API Endpoints
- `GET /api/processes` - All localhost listening processes
- `GET /api/health` - Latest health findings, battery state, summary
- `GET /api/docker` - Docker containers, disk usage, availability
- `POST /api/health/check` - Trigger immediate health check
- `POST /api/kill/:pid` - Kill a process (validated against known PIDs + command match)
- `POST /api/docker/stop/:id` - Stop a Docker container

### Health Checks
All checks use `execFile` (not shell strings) for safety. Thresholds:
- CPU: >150% dev servers, >80% browser, >100% other
- Memory: >10% or >4GB resident
- Dev servers: >6h with high resources, or >24h unconditionally
- Docker: disk >20GB (warning), >50GB (critical), containers >7d (warning)
- Browser tabs: CPU >50% or memory >1.5GB
- Indexing: mds/mdworker combined CPU >50%
- Battery: severity increases when <30% (warning) or <15% (critical)
- Sleep blockers: persistent PreventUserIdleSystemSleep >5min
