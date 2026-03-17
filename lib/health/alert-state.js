import fs from 'fs';
import path from 'path';
import os from 'os';

const STATE_DIR = path.join(os.homedir(), 'mac-health-watch');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const SUPPRESSION_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const WORSENED_THRESHOLD = 0.5; // 50% worse to re-alert

// In-memory state
let alertHistory = new Map();

// Load persisted state
export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      alertHistory = new Map(Object.entries(data));
    }
  } catch (e) {
    alertHistory = new Map();
  }
}

// Save state to disk
function saveState() {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    const obj = Object.fromEntries(alertHistory);
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    // Best effort
  }
}

// Generate a unique key for a finding
function findingKey(finding) {
  return `${finding.pid}-${finding.metric}-${finding.name}`;
}

// Filter findings to only those that should trigger a new notification
export function filterSuppressed(findings, batteryState) {
  const now = Date.now();
  const allowed = [];

  // Clean up old entries
  for (const [key, entry] of alertHistory) {
    if (now - entry.timestamp > SUPPRESSION_WINDOW_MS) {
      alertHistory.delete(key);
    }
  }

  for (const finding of findings) {
    const key = findingKey(finding);
    const prev = alertHistory.get(key);

    if (!prev) {
      allowed.push(finding);
      continue;
    }

    const timeSince = now - prev.timestamp;
    if (timeSince > SUPPRESSION_WINDOW_MS) {
      allowed.push(finding);
      continue;
    }

    // Re-alert if significantly worse
    const prevValue = prev.value || 0;
    const currentValue = finding.value || 0;
    if (currentValue > prevValue * (1 + WORSENED_THRESHOLD)) {
      allowed.push(finding);
      continue;
    }

    // Re-alert if battery just dropped low
    if (batteryState && !batteryState.charging && batteryState.percentage < 15 && prev.batteryWasOk) {
      allowed.push(finding);
      continue;
    }

    // Suppressed
  }

  return allowed;
}

// Record that we alerted on these findings
export function recordAlerts(findings, batteryState) {
  const now = Date.now();
  const batteryOk = !batteryState || batteryState.charging || (batteryState.percentage && batteryState.percentage > 15);

  for (const finding of findings) {
    const key = findingKey(finding);
    alertHistory.set(key, {
      timestamp: now,
      value: finding.value,
      severity: finding.severity,
      batteryWasOk: batteryOk
    });
  }

  saveState();
}

// Check if new issues appeared (beyond what's suppressed)
export function hasNewIssues(findings) {
  return findings.some(f => !alertHistory.has(findingKey(f)));
}
