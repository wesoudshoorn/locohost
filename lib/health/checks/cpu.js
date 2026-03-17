import { execFileAsync } from '../utils.js';

// Process name patterns for different categories
const DEV_SERVER_PATTERNS = /next-server|next\s+dev|\/node\s+.*\.(js|ts|mjs)|node_modules\/\.bin\/|vite|webpack|turbopack|turbo\s+dev|bun\s+(run|dev)|deno\s+(run|serve)|rails\s+server|overmind|foreman/i;
const BROWSER_PATTERNS = /Chrome Helper|Google Chrome|Arc.*Helper|Electron Helper|WebKit|Safari/i;
const SYSTEM_EXCLUDE = /^\/usr\/libexec\/|^\/usr\/sbin\/|^\/System\/|launchd|powerd|backupd|WindowServer|kernel_task|com\.apple\./i;

function friendlyName(command) {
  if (/next-server|next\s+(dev|start)/i.test(command)) return 'Next.js';
  if (/vite/i.test(command)) return 'Vite';
  if (/webpack/i.test(command)) return 'Webpack';
  if (/turbopack|turbo\s+dev/i.test(command)) return 'Turbopack';
  if (/bun/i.test(command)) return 'Bun';
  if (/deno/i.test(command)) return 'Deno';
  if (/rails/i.test(command)) return 'Rails';
  if (/Chrome/i.test(command)) return 'Chrome';
  if (/Arc/i.test(command)) return 'Arc';
  if (/Electron/i.test(command)) return 'Electron';
  if (/node/i.test(command)) return 'Node';
  return command.split('/').pop().split(' ')[0].substring(0, 20);
}

export async function check() {
  const findings = [];

  try {
    const { stdout } = await execFileAsync('ps', ['aux']);
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return findings;

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length < 11) continue;

      const pid = parseInt(parts[1], 10);
      const cpuPct = parseFloat(parts[2]);
      const memPct = parseFloat(parts[3]);
      const command = parts.slice(10).join(' ');
      const shortName = parts[10].split('/').pop();

      if (isNaN(cpuPct) || cpuPct < 20) continue;
      if (SYSTEM_EXCLUDE.test(command)) continue;

      let threshold;
      let category;

      if (DEV_SERVER_PATTERNS.test(command)) {
        threshold = 150;
        category = 'dev-server';
      } else if (BROWSER_PATTERNS.test(command)) {
        threshold = 80;
        category = 'browser';
      } else {
        threshold = 100;
        category = 'other';
      }

      if (cpuPct > threshold) {
        const name = friendlyName(command);
        const isCritical = cpuPct > threshold * 1.5;

        let detail;
        if (category === 'dev-server') {
          detail = isCritical
            ? `${name} is pegging your CPU at ${Math.round(cpuPct)}%. This will drain your battery fast — consider restarting it.`
            : `${name} is running hot at ${Math.round(cpuPct)}% CPU. Might be compiling or stuck in a loop.`;
        } else if (category === 'browser') {
          detail = `${name} tab is using ${Math.round(cpuPct)}% CPU. A tab might have heavy animations or a runaway script.`;
        } else {
          detail = `${name} is using ${Math.round(cpuPct)}% CPU, which is unusually high.`;
        }

        findings.push({
          pid,
          name: shortName.substring(0, 30),
          metric: 'cpu',
          value: Math.round(cpuPct),
          threshold,
          severity: isCritical ? 'critical' : 'warning',
          category,
          detail,
          command: command.substring(0, 120),
          memPct
        });
      }
    }
  } catch (e) {
    // Silent failure
  }

  return findings;
}
