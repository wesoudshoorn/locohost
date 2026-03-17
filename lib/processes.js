import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// Conductor database path (optional integration)
const CONDUCTOR_DB = path.join(
  process.env.HOME || '',
  'Library/Application Support/com.conductor.app/conductor.db'
);

// Cache for Conductor workspace data (refreshed per request cycle)
let conductorWorkspaces = null;

// Cache for known PIDs and their commands (used to validate kill requests)
let knownProcesses = new Map(); // pid -> command

// Query Conductor database for workspace info (optional, graceful fallback)
export async function getConductorWorkspaces() {
  try {
    if (!fs.existsSync(CONDUCTOR_DB)) {
      return null;
    }

    const query = `SELECT id, directory_name, state FROM workspaces WHERE state != 'archived'`;
    const { stdout } = await execFileAsync('sqlite3', ['-json', CONDUCTOR_DB, query], {
      timeout: 5000
    }).catch(() => ({ stdout: '' }));

    if (!stdout.trim()) return null;

    const workspaces = JSON.parse(stdout);
    const lookup = new Map();
    for (const ws of workspaces) {
      lookup.set(ws.directory_name, { id: ws.id, state: ws.state });
    }
    return lookup;
  } catch (e) {
    console.error('Error reading Conductor DB:', e.message);
    return null;
  }
}

// Get CWD for a PID using lsof
async function getProcessCwd(pid) {
  try {
    const { stdout } = await execFileAsync('lsof', ['-p', String(pid), '-a', '-d', 'cwd', '-Fn'], {
      timeout: 5000
    });
    const match = stdout.match(/^n(.+)$/m);
    return match ? match[1] : '';
  } catch (e) {
    return '';
  }
}

// Get git branch for a directory
async function getGitBranch(dir) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      timeout: 5000
    });
    let branch = stdout.trim();
    if (branch.includes('/')) {
      branch = branch.split('/').slice(1).join('/');
    }
    return branch;
  } catch (e) {
    return '';
  }
}

// Get process start times from ps
async function getProcessStartTimes(pids) {
  if (pids.length === 0) return new Map();
  try {
    const { stdout } = await execFileAsync('ps', ['-o', 'pid=,lstart=', '-p', pids.join(',')], {
      timeout: 5000
    });
    const times = new Map();
    for (const line of stdout.trim().split('\n')) {
      if (!line.trim()) continue;
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (match) {
        const pid = parseInt(match[1], 10);
        const dateStr = match[2].trim();
        const startTime = new Date(dateStr).toISOString();
        if (startTime !== 'Invalid Date') {
          times.set(pid, startTime);
        }
      }
    }
    return times;
  } catch (e) {
    return new Map();
  }
}

// Get all processes listening on localhost ports
export async function getLocalhostProcesses() {
  try {
    conductorWorkspaces = await getConductorWorkspaces();

    const { stdout } = await execAsync(
      `lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null | grep -E '(localhost|127\\.0\\.0\\.1|\\*:)' || true`,
      { timeout: 10000 }
    );

    const lines = stdout.trim().split('\n').filter(Boolean);
    const rawProcesses = [];
    const seen = new Set();

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;

      const [command, pid] = parts;
      const name = parts[parts.length - 1];
      const portMatch = name.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1], 10);
      const pidNum = parseInt(pid, 10);

      const key = `${pidNum}-${port}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rawProcesses.push({ pid: pidNum, port, command: command.substring(0, 20) });
    }

    // Get start times for all PIDs in parallel with enrichment
    const allPids = [...new Set(rawProcesses.map(p => p.pid))];
    const startTimesPromise = getProcessStartTimes(allPids.map(String));

    // Enrich all processes in parallel (CWD + git branch)
    const enrichedPromise = Promise.all(
      rawProcesses.map(async (proc) => {
        const cwd = await getProcessCwd(proc.pid);
        let projectName = '';
        let workspaceName = '';
        let branch = '';
        let workspaceId = null;
        let workspaceState = null;

        if (cwd) {
          const conductorMatch = cwd.match(/\/conductor\/workspaces\/([^/]+)\/([^/]+)/);
          if (conductorMatch) {
            workspaceName = conductorMatch[1];
            projectName = conductorMatch[2];

            if (conductorWorkspaces) {
              const wsInfo = conductorWorkspaces.get(projectName);
              if (wsInfo) {
                workspaceId = wsInfo.id;
                workspaceState = wsInfo.state;
              }
            }
          } else {
            projectName = path.basename(cwd);
          }

          branch = await getGitBranch(cwd);
        }

        return {
          pid: proc.pid,
          port: proc.port,
          command: proc.command,
          cwd,
          project: projectName || 'Unknown',
          workspace: workspaceName || '-',
          branch: branch || '-',
          running: `localhost:${proc.port}`,
          workspaceId,
          workspaceState
        };
      })
    );

    const [enriched, startTimes] = await Promise.all([enrichedPromise, startTimesPromise]);

    // Merge start times
    for (const proc of enriched) {
      proc.startTime = startTimes.get(proc.pid) || null;
    }

    const result = enriched.sort((a, b) => a.port - b.port);

    // Track known processes for kill validation
    knownProcesses = new Map();
    for (const p of result) {
      knownProcesses.set(p.pid, p.command);
    }

    return result;
  } catch (error) {
    console.error('Error getting processes:', error);
    return [];
  }
}

// Kill a process by PID (validated against known processes)
export async function killProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return { success: false, error: 'Invalid PID' };
  }

  if (!knownProcesses.has(pid)) {
    return { success: false, error: 'PID not found in known processes. Refresh first.' };
  }

  // Verify the process command still matches (PID recycling protection)
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'comm='], { timeout: 3000 });
    const currentCommand = stdout.trim().split('/').pop().substring(0, 20);
    const expectedCommand = knownProcesses.get(pid);
    if (currentCommand && expectedCommand && !currentCommand.startsWith(expectedCommand.split('/').pop())) {
      return { success: false, error: 'Process has changed (PID recycled). Refresh and try again.' };
    }
  } catch (e) {
    // Process already dead — that's fine
  }

  try {
    await execFileAsync('kill', ['-9', String(pid)], { timeout: 5000 });
    knownProcesses.delete(pid);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
