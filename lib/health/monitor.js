import { check as checkCPU } from './checks/cpu.js';
import { check as checkMemory } from './checks/memory.js';
import { check as checkDevServers } from './checks/dev-servers.js';
import { check as checkBrowser } from './checks/browser.js';
import { check as checkIndexing } from './checks/indexing.js';
import { check as checkBattery } from './checks/battery.js';
import { check as checkSleepBlockers } from './checks/sleep-blockers.js';
import { check as checkDocker } from './checks/docker.js';
import { adjustForBattery, shouldNotify, buildSummary } from './severity.js';
import { loadState, filterSuppressed, recordAlerts } from './alert-state.js';
import { logRun, writeLatestAlert } from './logger.js';
import { getLocalhostProcesses } from '../processes.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let latestFindings = [];
let latestBattery = null;
let latestSummary = null;
let intervalId = null;
let notifyFn = null; // Set by Electron main process

export function setNotifier(fn) {
  notifyFn = fn;
}

export function getLatestFindings() {
  return latestFindings;
}

export function getLatestBattery() {
  return latestBattery;
}

export async function refreshBattery() {
  try {
    latestBattery = await checkBattery();
  } catch (e) {
    // keep previous value
  }
  return latestBattery;
}

export function getLatestSummary() {
  return latestSummary;
}

export async function runChecks() {
  try {
    // Get battery state first (used by other checks)
    const batteryState = await checkBattery();
    latestBattery = batteryState;

    // Run all checks in parallel
    const [cpu, memory, devServers, browser, indexing, sleepBlockers, docker] = await Promise.all([
      checkCPU(),
      checkMemory(),
      checkDevServers(),
      checkBrowser(),
      checkIndexing(batteryState),
      checkSleepBlockers(),
      checkDocker()
    ]);

    // Combine all findings
    let findings = [...cpu, ...memory, ...devServers, ...browser, ...indexing, ...sleepBlockers, ...docker];

    // Deduplicate by PID — keep the highest-severity finding per process
    // A next-server can appear in cpu.js, memory.js, AND dev-servers.js
    const byPid = new Map();
    const severityRank = { critical: 0, warning: 1, info: 2 };
    for (const f of findings) {
      const existing = byPid.get(f.pid);
      if (!existing || severityRank[f.severity] < severityRank[existing.severity]) {
        // Merge extra info from other findings
        if (existing) {
          f.detail = f.detail || existing.detail;
          f.cwd = f.cwd || existing.cwd;
          f.ports = f.ports?.length ? f.ports : existing.ports;
        }
        byPid.set(f.pid, f);
      } else if (existing) {
        // Merge useful info from lower-priority finding
        existing.cwd = existing.cwd || f.cwd;
        existing.ports = existing.ports?.length ? existing.ports : f.ports;
      }
    }
    findings = [...byPid.values()];

    // Enrich findings with process info (project name, port, workspace)
    try {
      const processes = await getLocalhostProcesses();
      const procByPid = new Map();
      for (const p of processes) {
        procByPid.set(p.pid, p);
      }
      for (const f of findings) {
        const proc = procByPid.get(f.pid);
        if (proc) {
          f.project = proc.project;
          f.port = proc.port;
          f.workspace = proc.workspace;
          // Use project name as the finding name if it's more descriptive
          if (proc.project && proc.project !== 'Unknown' && proc.workspace !== '-') {
            f.name = proc.project;
          }
        }
      }
    } catch (e) {
      // Enrichment is best-effort
    }

    // Adjust severity based on battery
    findings = adjustForBattery(findings, batteryState);

    // Sort by severity
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    latestFindings = findings;

    // Check if we should notify
    if (findings.length > 0 && shouldNotify(findings)) {
      const unsuppressed = filterSuppressed(findings, batteryState);

      if (unsuppressed.length > 0) {
        const summary = buildSummary(findings);
        latestSummary = summary;

        // Send notification
        if (notifyFn) {
          notifyFn(summary);
        }

        // Record alerts and log
        recordAlerts(unsuppressed, batteryState);
        logRun(findings, batteryState, true);
        writeLatestAlert(summary, findings);
      } else {
        latestSummary = findings.length > 0 ? buildSummary(findings) : null;
        logRun(findings, batteryState, false);
      }
    } else {
      latestSummary = findings.length > 0 ? buildSummary(findings) : null;
      logRun(findings, batteryState, false);
    }

    return { findings, batteryState };
  } catch (error) {
    console.error('Health check error:', error);
    return { findings: [], batteryState: null };
  }
}

export function start() {
  loadState();
  // Run immediately on start
  runChecks();
  // Then every 30 minutes
  intervalId = setInterval(runChecks, CHECK_INTERVAL_MS);
}

export function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
