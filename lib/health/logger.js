import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_DIR = path.join(os.homedir(), 'mac-health-watch', 'logs');
const LATEST_FILE = path.join(os.homedir(), 'mac-health-watch', 'latest_alert.txt');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFile() {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOG_DIR, `${date}.log`);
}

function timestamp() {
  return new Date().toISOString();
}

export function logRun(findings, batteryState, notified) {
  ensureLogDir();

  const lines = [];
  lines.push(`--- ${timestamp()} ---`);

  if (batteryState) {
    lines.push(`Battery: ${batteryState.percentage ?? 'N/A'}% (${batteryState.powerSource}, ${batteryState.charging ? 'charging' : 'not charging'})`);
  } else {
    lines.push('Battery: N/A (desktop or unavailable)');
  }

  if (findings.length === 0) {
    lines.push('Status: All clear');
  } else {
    lines.push(`Findings: ${findings.length} issue(s)`);
    lines.push(`Notified: ${notified ? 'yes' : 'suppressed'}`);
    lines.push('');

    for (const f of findings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.detail}`);
      if (f.command) lines.push(`    command: ${f.command}`);
      if (f.cwd) lines.push(`    cwd: ${f.cwd}`);
      if (f.ports?.length) lines.push(`    ports: ${f.ports.join(', ')}`);
    }
  }

  lines.push('');
  fs.appendFileSync(getLogFile(), lines.join('\n') + '\n');
}

export function writeLatestAlert(summary, findings) {
  ensureLogDir();

  const lines = [];
  lines.push(`Last alert: ${timestamp()}`);
  lines.push(`${summary.title}`);
  lines.push(`${summary.body}`);
  lines.push('');

  for (const f of findings) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.detail}`);
  }

  fs.writeFileSync(LATEST_FILE, lines.join('\n') + '\n');
}
