# Locohost

<p align="center">
  <img src="./logo.svg" alt="Locohost" width="300">
</p>

A browser-based utility to track and manage localhost dev servers.

## Features

- **Track all localhost processes** - See everything running on localhost ports
- **Grouped by workspace** - Organized by Conductor workspace for easy navigation
- **Conductor integration** - Shows which workspaces are active in Conductor
- **Kill processes** - Stop servers directly from the browser
- **Copy kill commands** - Copy `kill -9 <pid>` to clipboard
- **Keyboard shortcuts** - Press `r` to refresh

## Quick Start

```bash
npm start
```

Then open http://localhost:3847

## Development

```bash
npm run dev  # runs with --watch for auto-reload
```

## Stack

- Pure Node.js (no dependencies)
- Single file server (~600 lines)
- Uses `lsof` to detect processes
- Reads Conductor SQLite DB for workspace info

## Screenshot

| Port | Agent | Branch |
|------|-------|--------|
| localhost:3000 | auckland | main |
| localhost:3847 | seville | localhost-tracker |

## License

MIT
