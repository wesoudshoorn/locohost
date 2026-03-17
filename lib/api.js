import http from 'http';
import fs from 'fs';
import path from 'path';
import { getLocalhostProcesses, killProcess } from './processes.js';
import * as monitor from './health/monitor.js';
import { getDockerInfo, stopContainer } from './docker.js';

// Allowed CORS origins (localhost only)
function getAllowedOrigin(req) {
  const origin = req.headers.origin || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }
  return null;
}

/**
 * Create the Locohost HTTP API server.
 * @param {object} options
 * @param {string} options.staticDir - If set, serve static files from this directory
 * @param {number} options.port - Port to listen on
 * @returns {http.Server}
 */
export function createAPIServer({ staticDir, port }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // CORS headers
    const origin = getAllowedOrigin(req);
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (req.headers.origin === 'null') {
      // file:// protocol sends origin: null
      res.setHeader('Access-Control-Allow-Origin', 'null');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // API: Get processes
    if (url.pathname === '/api/processes' && req.method === 'GET') {
      try {
        const processes = await getLocalhostProcesses();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(processes));
      } catch (e) {
        console.error('Error in /api/processes:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to get processes' }));
      }
      return;
    }

    // API: Health data
    if (url.pathname === '/api/health' && req.method === 'GET') {
      const findings = monitor.getLatestFindings();
      const battery = monitor.getLatestBattery();
      const summary = monitor.getLatestSummary();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ findings, battery, summary }));
      return;
    }

    // API: Trigger health check now
    if (url.pathname === '/api/health/check' && req.method === 'POST') {
      try {
        const result = await monitor.runChecks();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        console.error('Error in /api/health/check:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Health check failed' }));
      }
      return;
    }

    // API: Docker info
    if (url.pathname === '/api/docker' && req.method === 'GET') {
      try {
        const info = await getDockerInfo();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(info));
      } catch (e) {
        console.error('Error in /api/docker:', e);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ available: false, reason: 'error', containers: [], diskUsage: null }));
      }
      return;
    }

    // API: Stop Docker container
    if (url.pathname.startsWith('/api/docker/stop/') && req.method === 'POST') {
      const containerId = url.pathname.split('/').pop();
      try {
        const result = await stopContainer(containerId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        console.error('Error stopping container:', e);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
      return;
    }

    // API: Kill process
    if (url.pathname.startsWith('/api/kill/') && req.method === 'POST') {
      const pid = parseInt(url.pathname.split('/').pop(), 10);
      const result = await killProcess(pid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // Serve static files (standalone mode only)
    if (staticDir) {
      const filePath = url.pathname === '/' || url.pathname === '/index.html'
        ? path.join(staticDir, 'index.html')
        : path.join(staticDir, url.pathname);

      const resolved = path.resolve(filePath);
      if (resolved.startsWith(path.resolve(staticDir))) {
        try {
          const content = fs.readFileSync(resolved);
          const ext = path.extname(resolved);
          const mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.png': 'image/png',
            '.svg': 'image/svg+xml'
          };
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
          res.end(content);
          return;
        } catch (e) {
          // fall through to 404
        }
      }
    }

    // 404
    res.writeHead(404);
    res.end('Not Found');
  });

  return server;
}

/**
 * Start listening and handle EADDRINUSE gracefully.
 */
export function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n  Error: Port ${port} is already in use.`);
        console.error(`  Try: PORT=${Number(port) + 1} npm start\n`);
        process.exit(1);
      }
      reject(err);
    });

    server.listen(port, '127.0.0.1', () => {
      resolve();
    });
  });
}
