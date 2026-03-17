import { execFileAsync } from '../utils.js';

function friendlyName(command) {
  if (/next-server|next\s+(dev|start)/i.test(command)) return 'Next.js';
  if (/vite/i.test(command)) return 'Vite';
  if (/webpack/i.test(command)) return 'Webpack';
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
      const rssKB = parseInt(parts[5], 10);
      const command = parts.slice(10).join(' ');
      const shortName = parts[10].split('/').pop();

      const rssGB = rssKB / 1024 / 1024;
      const flagByPercent = memPct > 10;
      const flagByAbsolute = rssGB > 4;

      if (!flagByPercent && !flagByAbsolute) continue;

      const severity = rssGB > 8 || memPct > 20 ? 'critical' : 'warning';
      const name = friendlyName(command);
      const gbStr = rssGB.toFixed(1);

      let detail;
      if (rssGB > 8) {
        detail = `${name} is eating ${gbStr}GB of RAM. This is a lot — your machine will start swapping soon if it hasn't already.`;
      } else if (rssGB > 4) {
        detail = `${name} is using ${gbStr}GB of memory. Consider restarting it to free up RAM.`;
      } else {
        detail = `${name} is taking up ${Math.round(memPct)}% of your total memory (${gbStr}GB).`;
      }

      findings.push({
        pid,
        name: shortName.substring(0, 30),
        metric: 'memory',
        value: memPct,
        valueGB: Math.round(rssGB * 100) / 100,
        threshold: flagByAbsolute ? '4GB' : '10%',
        severity,
        detail,
        command: command.substring(0, 120),
        cpuPct
      });
    }
  } catch (e) {
    // Silent failure
  }

  return findings;
}
