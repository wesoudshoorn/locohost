import path from 'path';
import { fileURLToPath } from 'url';
import { createAPIServer, listen } from './lib/api.js';
import * as monitor from './lib/health/monitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.CONDUCTOR_PORT || process.env.PORT || 3847;

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

// Start health monitoring
monitor.start();

// Create and start the API server with static file serving
const server = createAPIServer({
  staticDir: path.join(__dirname, 'ui'),
  port: PORT
});

listen(server, PORT).then(() => {
  console.log(`\n  Locohost v2.1.0 running at:\n`);
  console.log(`  → http://localhost:${PORT}\n`);
});
