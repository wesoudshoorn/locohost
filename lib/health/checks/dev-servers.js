import { execFileAsync } from '../utils.js';

// Strict dev server detection — only match actual dev server processes
// The command from `ps -eo command` is the full path + arguments
function isDevServer(command) {
  // Must contain a recognizable dev server binary or pattern
  if (/\bnext-server\b/i.test(command)) return true;
  if (/\bnode\b.*\bnext\b\s+(dev|start)\b/i.test(command)) return true;
  if (/\bnode_modules\/\.bin\/(vite|webpack|turbopack|next)\b/i.test(command)) return true;
  if (/\bbun\s+(run|dev)\b/i.test(command)) return true;
  if (/\bdeno\s+(run|serve)\b/i.test(command)) return true;
  if (/\bpython.*\b(http\.server|manage\.py\s+runserver)\b/i.test(command)) return true;
  if (/\brails\s+server\b/i.test(command)) return true;
  if (/\bovermind\s+start\b/i.test(command)) return true;
  if (/\bnpm\b.*\brun\s+dev\b/i.test(command)) return true;
  return false;
}

// Parse elapsed time from ps (formats: MM:SS, HH:MM:SS, D-HH:MM:SS)
function parseElapsedSeconds(elapsed) {
  if (!elapsed) return 0;
  elapsed = elapsed.trim();

  const dayMatch = elapsed.match(/(\d+)-(\d+):(\d+):(\d+)/);
  if (dayMatch) {
    return parseInt(dayMatch[1]) * 86400 + parseInt(dayMatch[2]) * 3600 +
           parseInt(dayMatch[3]) * 60 + parseInt(dayMatch[4]);
  }

  const parts = elapsed.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatRuntime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export async function check() {
  const findings = [];

  try {
    const { stdout } = await execFileAsync(
      'ps', ['-eo', 'pid,%cpu,%mem,etime,command']
    );
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return findings;

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length < 5) continue;

      const pid = parseInt(parts[0], 10);
      const cpuPct = parseFloat(parts[1]);
      const memPct = parseFloat(parts[2]);
      const elapsed = parts[3];
      const command = parts.slice(4).join(' ');

      if (!isDevServer(command)) continue;

      const seconds = parseElapsedSeconds(elapsed);
      const hours = seconds / 3600;

      // Flag if: runtime >6h AND (CPU >20% or mem >5%), or >24h regardless
      const longAndHeavy = hours > 6 && (cpuPct > 20 || memPct > 5);
      const veryLong = hours > 24;

      if (!longAndHeavy && !veryLong) continue;

      // Get working directory
      let cwd = '';
      try {
        const { stdout: cwdOut } = await execFileAsync(
          'lsof', ['-p', String(pid), '-a', '-d', 'cwd', '-Fn'],
          { timeout: 5000 }
        ).catch(() => ({ stdout: '' }));
        const cwdMatch = cwdOut.match(/^n(.+)$/m);
        cwd = cwdMatch ? cwdMatch[1] : '';
      } catch (e) {}

      const severity = veryLong && (cpuPct > 50 || memPct > 10) ? 'critical' :
                        veryLong ? 'warning' : 'info';

      const shortName = command.split('/').pop().split(' ')[0].substring(0, 30);

      // Extract project name from cwd
      let project = '';
      if (cwd) {
        const conductorMatch = cwd.match(/\/conductor\/workspaces\/([^/]+)\/([^/]+)/);
        if (conductorMatch) {
          project = `${conductorMatch[1]}/${conductorMatch[2]}`;
        } else {
          project = cwd.split('/').pop();
        }
      }

      findings.push({
        pid,
        name: project || shortName,
        metric: 'long-running',
        value: Math.round(hours * 10) / 10,
        threshold: veryLong ? '24h' : '6h',
        severity,
        detail: veryLong && (cpuPct > 50 || memPct > 10)
          ? `Running for ${formatRuntime(seconds)} and still using significant resources. Probably forgotten — safe to kill.`
          : veryLong
          ? `This dev server has been running for ${formatRuntime(seconds)}. You might have forgotten about it.`
          : `Running for ${formatRuntime(seconds)} with high resource usage (${Math.round(cpuPct)}% CPU). Might be stuck or doing a big build.`,
        command: command.substring(0, 120),
        cpuPct,
        memPct,
        runtime: formatRuntime(seconds),
        cwd
      });
    }
  } catch (e) {
    // Silent failure
  }

  return findings;
}
