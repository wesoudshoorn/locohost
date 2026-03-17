import { execFileAsync } from '../utils.js';

const BROWSER_PATTERNS = [
  'Google Chrome Helper (Renderer)',
  'Chrome.*Helper',
  'Arc.*Helper',
  'Electron Helper (Renderer)',
  'WebKit WebContent',
  'WebKit GPU'
];

const PATTERN_REGEX = new RegExp(BROWSER_PATTERNS.join('|'), 'i');

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

      if (!PATTERN_REGEX.test(command)) continue;

      const rssGB = rssKB / 1024 / 1024;
      const highCPU = cpuPct > 50;
      const highMem = rssGB > 1.5;

      if (!highCPU && !highMem) continue;

      const shortName = command.match(/Google Chrome|Arc|Electron|WebKit|Safari/i)?.[0] || 'Browser';
      const severity = (cpuPct > 100 || rssGB > 3) ? 'critical' : 'warning';

      findings.push({
        pid,
        name: `${shortName} renderer`,
        metric: highCPU ? 'cpu' : 'memory',
        value: highCPU ? cpuPct : rssGB,
        threshold: highCPU ? '50% CPU' : '1.5GB',
        severity,
        detail: highCPU && highMem
          ? `A ${shortName} tab is using ${Math.round(cpuPct)}% CPU and ${rssGB.toFixed(1)}GB RAM. Likely a heavy web app or runaway script.`
          : highCPU
          ? `A ${shortName} tab is spinning at ${Math.round(cpuPct)}% CPU. Check for heavy animations or an infinite loop.`
          : `A ${shortName} tab is holding ${rssGB.toFixed(1)}GB of memory. Try closing unused tabs to free it up.`,
        command: command.substring(0, 120),
        cpuPct,
        memPct,
        rssGB: Math.round(rssGB * 100) / 100
      });
    }
  } catch (e) {
    // Silent failure
  }

  return findings;
}
