# Locohost

Localhost dev server tracker - shows all processes running on localhost ports.

## Quick Start

```bash
npm run setup  # First time setup
npm run dev    # Start with hot reload
```

## Scripts

- `npm run setup` - Check Node version, create .nvmrc, install deps if needed
- `npm run dev` - Start server with --watch (auto-reload)
- `npm start` - Start server (production)

## Environment

- `PORT` or `CONDUCTOR_PORT` - Server port (default: 3847)

## Architecture

Single-file Node.js server (`server.js`) with no dependencies:
- Queries `lsof` to find processes on localhost ports
- Optional Conductor database integration for workspace info
- Serves HTML dashboard at http://localhost:3847
