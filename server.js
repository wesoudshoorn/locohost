import http from 'http';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);
const PORT = process.env.CONDUCTOR_PORT || process.env.PORT || 3847;

// Conductor database path (optional integration)
const CONDUCTOR_DB = path.join(
  process.env.HOME || '',
  'Library/Application Support/com.conductor.app/conductor.db'
);

// Cache for Conductor workspace data (refreshed per request cycle)
let conductorWorkspaces = null;

// Query Conductor database for workspace info (optional, graceful fallback)
async function getConductorWorkspaces() {
  try {
    // Check if DB exists
    if (!fs.existsSync(CONDUCTOR_DB)) {
      return null;
    }

    // Query workspaces using sqlite3 CLI (no dependencies needed)
    const query = `SELECT id, directory_name, state FROM workspaces WHERE state != 'archived'`;
    const { stdout } = await execAsync(
      `sqlite3 -json "${CONDUCTOR_DB}" "${query}" 2>/dev/null || true`
    );

    if (!stdout.trim()) return null;

    const workspaces = JSON.parse(stdout);
    // Create lookup by directory_name for fast matching
    const lookup = new Map();
    for (const ws of workspaces) {
      lookup.set(ws.directory_name, { id: ws.id, state: ws.state });
    }
    return lookup;
  } catch (e) {
    // Conductor not installed or DB not accessible - that's fine
    return null;
  }
}

// Get all processes listening on localhost ports
async function getLocalhostProcesses() {
  try {
    // Fetch Conductor workspace data (optional)
    conductorWorkspaces = await getConductorWorkspaces();

    // Get all listening TCP ports with their PIDs
    const { stdout } = await execAsync(
      `lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null | grep -E '(localhost|127\\.0\\.0\\.1|\\*:)' || true`
    );

    const lines = stdout.trim().split('\n').filter(Boolean);
    const processes = new Map();

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;

      const [command, pid, user, fd, type, device, size, node, name] = parts;
      const portMatch = name.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1], 10);
      const pidNum = parseInt(pid, 10);

      // Include ourselves too (mark it)

      // Avoid duplicates (same PID can have multiple entries)
      const key = `${pidNum}-${port}`;
      if (processes.has(key)) continue;

      // Get the working directory of the process
      let cwd = '';
      let projectName = '';
      let workspaceName = '';
      let branch = '';

      try {
        const { stdout: cwdOutput } = await execAsync(`lsof -p ${pidNum} -Fn 2>/dev/null | grep '^n.*cwd' | head -1 || true`);
        if (cwdOutput) {
          cwd = cwdOutput.replace(/^n/, '').replace('cwd', '').trim();
        }

        // If that didn't work, try pwdx (Linux) or proc
        if (!cwd) {
          const { stdout: pwdOutput } = await execAsync(`lsof -p ${pidNum} -a -d cwd -Fn 2>/dev/null | grep '^n/' | sed 's/^n//' || true`);
          cwd = pwdOutput.trim();
        }
      } catch (e) {
        // Ignore errors
      }

      // Extract project/workspace info from path
      let workspaceId = null;
      let workspaceState = null;

      if (cwd) {
        // Check for Conductor workspace pattern
        const conductorMatch = cwd.match(/\/conductor\/workspaces\/([^/]+)\/([^/]+)/);
        if (conductorMatch) {
          workspaceName = conductorMatch[1];
          projectName = conductorMatch[2];

          // Look up workspace in Conductor DB (if available)
          if (conductorWorkspaces) {
            const wsInfo = conductorWorkspaces.get(projectName);
            if (wsInfo) {
              workspaceId = wsInfo.id;
              workspaceState = wsInfo.state;
            }
          }
        } else {
          // Use the last directory component as project name
          projectName = path.basename(cwd);
        }

        // Try to get git branch
        try {
          const { stdout: branchOutput } = await execAsync(
            `git -C "${cwd}" rev-parse --abbrev-ref HEAD 2>/dev/null || true`
          );
          branch = branchOutput.trim();
          // Strip username prefix (e.g., "wesoudshoorn/feature" → "feature")
          if (branch.includes('/')) {
            branch = branch.split('/').slice(1).join('/');
          }
        } catch (e) {
          // Not a git repo
        }
      }

      processes.set(key, {
        pid: pidNum,
        port,
        command: command.substring(0, 20),
        cwd,
        project: projectName || 'Unknown',
        workspace: workspaceName || '-',
        branch: branch || '-',
        running: `localhost:${port}`,
        workspaceId: workspaceId,
        workspaceState: workspaceState
      });
    }

    return Array.from(processes.values()).sort((a, b) => a.port - b.port);
  } catch (error) {
    console.error('Error getting processes:', error);
    return [];
  }
}

// Kill a process by PID
async function killProcess(pid) {
  try {
    await execAsync(`kill -9 ${pid}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// HTML template
const getHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Locohost</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #000;
      color: #fff;
      padding: 48px;
      min-height: 100vh;
    }

    .container { max-width: 1200px; margin: 0 auto; }

    header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      margin-bottom: 48px;
    }

    .logo svg { height: 36px; width: auto; }

    .tabs {
      display: flex;
      gap: 4px;
      background: #111;
      padding: 6px;
      border-radius: 8px;
    }

    .tab {
      background: none;
      border: none;
      color: #666;
      font-size: 15px;
      cursor: pointer;
      padding: 8px 16px;
      border-radius: 6px;
    }

    .tab:hover { color: #999; }
    .tab.active { color: #000; background: #fff; }

    .count {
      color: #666;
      font-size: 13px;
      margin-left: 6px;
    }

    .workspace-group {
      margin-bottom: 48px;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 24px;
    }
    .workspace-title {
      font-size: 16px;
      font-weight: 500;
      color: #fff;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #222;
    }

    .table-header {
      display: flex;
      align-items: center;
      padding: 0 0 12px 0;
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .row {
      display: flex;
      align-items: center;
      padding: 20px 0;
      border-top: 1px solid #222;
      cursor: pointer;
      text-decoration: none;
      color: inherit;
    }
    .row:hover { background: #111; margin: 0 -16px; padding-left: 16px; padding-right: 16px; border-radius: 6px; }

    .col-url {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 18px;
      width: 200px;
      flex-shrink: 0;
    }

    .col-agent {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 18px;
      width: 220px;
      flex-shrink: 0;
    }

    .col-branch {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 18px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .col-actions {
      display: flex;
      gap: 28px;
      flex-shrink: 0;
      white-space: nowrap;
      min-width: 120px;
    }

    .action {
      background: none;
      border: none;
      color: #fff;
      cursor: pointer;
      font-size: 18px;
      text-decoration: underline;
      padding: 0;
    }

    .action:hover { color: #aaa; }

    .conductor-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-left: 12px;
    }
    .conductor-badge .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
    }
    .conductor-badge.initializing .dot { background: #f59e0b; }

    .empty {
      text-align: center;
      padding: 64px;
      color: #666;
      font-size: 16px;
    }

    .loading {
      text-align: center;
      padding: 64px;
      color: #666;
      font-size: 16px;
    }
    .loading::after {
      content: '';
      animation: dots 1.5s infinite;
    }
    @keyframes dots {
      0%, 20% { content: ''; }
      40% { content: '.'; }
      60% { content: '..'; }
      80%, 100% { content: '...'; }
    }

    .toast {
      position: fixed;
      bottom: 32px;
      right: 32px;
      background: #fff;
      color: #000;
      padding: 14px 20px;
      border-radius: 6px;
      font-size: 15px;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.2s;
    }

    .toast.show { opacity: 1; transform: translateY(0); }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo"><svg width="552" height="89" viewBox="0 0 552 89" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M107.403 87V18.3H125.303V72.3H160.203V87H107.403ZM188.907 88.2C183.041 88.2 178.007 87.2 173.807 85.2C169.674 83.2 166.474 80.1667 164.207 76.1C162.007 71.9667 160.907 66.8 160.907 60.6C160.907 54.4 162.007 49.2667 164.207 45.2C166.474 41.1333 169.674 38.1 173.807 36.1C178.007 34.1 183.041 33.1 188.907 33.1C194.841 33.1 199.874 34.1 204.007 36.1C208.207 38.1 211.407 41.1333 213.607 45.2C215.874 49.2667 217.007 54.4 217.007 60.6C217.007 66.8 215.874 71.9667 213.607 76.1C211.407 80.1667 208.207 83.2 204.007 85.2C199.874 87.2 194.841 88.2 188.907 88.2ZM188.907 76.3C191.641 76.3 193.841 75.7667 195.507 74.7C197.241 73.6333 198.474 72.1 199.207 70.1C200.007 68.0333 200.407 65.5 200.407 62.5V58.8C200.407 55.8 200.007 53.2667 199.207 51.2C198.474 49.1333 197.241 47.6 195.507 46.6C193.841 45.5333 191.641 45 188.907 45C186.241 45 184.041 45.5333 182.307 46.6C180.641 47.6 179.407 49.1333 178.607 51.2C177.874 53.2667 177.507 55.8 177.507 58.8V62.5C177.507 65.5 177.874 68.0333 178.607 70.1C179.407 72.1 180.641 73.6333 182.307 74.7C184.041 75.7667 186.241 76.3 188.907 76.3ZM246.784 88.2C240.984 88.2 236.051 87.2 231.984 85.2C227.917 83.2 224.784 80.1667 222.584 76.1C220.451 71.9667 219.384 66.8 219.384 60.6C219.384 54.4 220.484 49.2667 222.684 45.2C224.884 41.0667 228.017 38 232.084 36C236.151 34 241.051 33 246.784 33C250.517 33 253.951 33.4333 257.084 34.3C260.284 35.1667 263.051 36.5 265.384 38.3C267.784 40.1 269.617 42.3667 270.884 45.1C272.151 47.8333 272.784 51.1 272.784 54.9H256.684C256.684 52.6333 256.284 50.7667 255.484 49.3C254.751 47.8333 253.651 46.7333 252.184 46C250.717 45.2667 248.884 44.9 246.684 44.9C244.151 44.9 242.084 45.4333 240.484 46.5C238.951 47.5667 237.817 49.1333 237.084 51.2C236.351 53.2667 235.984 55.8333 235.984 58.9V62.5C235.984 65.5 236.351 68.0333 237.084 70.1C237.817 72.1667 239.017 73.7333 240.684 74.8C242.351 75.8 244.484 76.3 247.084 76.3C249.351 76.3 251.217 75.9667 252.684 75.3C254.217 74.5667 255.384 73.4667 256.184 72C256.984 70.4667 257.384 68.5667 257.384 66.3H272.784C272.784 69.9667 272.151 73.2 270.884 76C269.617 78.7333 267.817 81 265.484 82.8C263.151 84.6 260.384 85.9667 257.184 86.9C253.984 87.7667 250.517 88.2 246.784 88.2ZM303.614 88.2C297.748 88.2 292.714 87.2 288.514 85.2C284.381 83.2 281.181 80.1667 278.914 76.1C276.714 71.9667 275.614 66.8 275.614 60.6C275.614 54.4 276.714 49.2667 278.914 45.2C281.181 41.1333 284.381 38.1 288.514 36.1C292.714 34.1 297.748 33.1 303.614 33.1C309.548 33.1 314.581 34.1 318.714 36.1C322.914 38.1 326.114 41.1333 328.314 45.2C330.581 49.2667 331.714 54.4 331.714 60.6C331.714 66.8 330.581 71.9667 328.314 76.1C326.114 80.1667 322.914 83.2 318.714 85.2C314.581 87.2 309.548 88.2 303.614 88.2ZM303.614 76.3C306.348 76.3 308.548 75.7667 310.214 74.7C311.948 73.6333 313.181 72.1 313.914 70.1C314.714 68.0333 315.114 65.5 315.114 62.5V58.8C315.114 55.8 314.714 53.2667 313.914 51.2C313.181 49.1333 311.948 47.6 310.214 46.6C308.548 45.5333 306.348 45 303.614 45C300.948 45 298.748 45.5333 297.014 46.6C295.348 47.6 294.114 49.1333 293.314 51.2C292.581 53.2667 292.214 55.8 292.214 58.8V62.5C292.214 65.5 292.581 68.0333 293.314 70.1C294.114 72.1 295.348 73.6333 297.014 74.7C298.748 75.7667 300.948 76.3 303.614 76.3ZM337.891 87V18.3H355.791V44.7H383.691V18.3H401.591V87H383.691V59.3H355.791V87H337.891ZM435.802 88.2C429.935 88.2 424.902 87.2 420.702 85.2C416.569 83.2 413.369 80.1667 411.102 76.1C408.902 71.9667 407.802 66.8 407.802 60.6C407.802 54.4 408.902 49.2667 411.102 45.2C413.369 41.1333 416.569 38.1 420.702 36.1C424.902 34.1 429.935 33.1 435.802 33.1C441.735 33.1 446.769 34.1 450.902 36.1C455.102 38.1 458.302 41.1333 460.502 45.2C462.769 49.2667 463.902 54.4 463.902 60.6C463.902 66.8 462.769 71.9667 460.502 76.1C458.302 80.1667 455.102 83.2 450.902 85.2C446.769 87.2 441.735 88.2 435.802 88.2ZM435.802 76.3C438.535 76.3 440.735 75.7667 442.402 74.7C444.135 73.6333 445.369 72.1 446.102 70.1C446.902 68.0333 447.302 65.5 447.302 62.5V58.8C447.302 55.8 446.902 53.2667 446.102 51.2C445.369 49.1333 444.135 47.6 442.402 46.6C440.735 45.5333 438.535 45 435.802 45C433.135 45 430.935 45.5333 429.202 46.6C427.535 47.6 426.302 49.1333 425.502 51.2C424.769 53.2667 424.402 55.8 424.402 58.8V62.5C424.402 65.5 424.769 68.0333 425.502 70.1C426.302 72.1 427.535 73.6333 429.202 74.7C430.935 75.7667 433.135 76.3 435.802 76.3ZM491.379 88.2C487.912 88.2 484.645 87.8333 481.579 87.1C478.579 86.3667 475.912 85.3 473.579 83.9C471.312 82.5 469.512 80.7667 468.179 78.7C466.912 76.6333 466.279 74.2333 466.279 71.5C466.279 71.2333 466.279 71 466.279 70.8C466.279 70.5333 466.312 70.3 466.379 70.1H481.879C481.879 70.2333 481.879 70.4 481.879 70.6C481.879 70.7333 481.879 70.8667 481.879 71C481.945 72.4667 482.412 73.7 483.279 74.7C484.212 75.6333 485.412 76.3333 486.879 76.8C488.345 77.2 489.945 77.4 491.679 77.4C492.945 77.4 494.279 77.2667 495.679 77C497.145 76.7333 498.379 76.2667 499.379 75.6C500.379 74.9333 500.879 73.9667 500.879 72.7C500.879 71.3 500.245 70.2333 498.979 69.5C497.779 68.7667 496.145 68.1667 494.079 67.7C492.079 67.1667 489.912 66.6667 487.579 66.2C485.245 65.6667 482.879 65.0667 480.479 64.4C478.145 63.7333 475.979 62.8333 473.979 61.7C472.045 60.5 470.479 58.9667 469.279 57.1C468.079 55.2333 467.479 52.8667 467.479 50C467.479 46.9333 468.112 44.3333 469.379 42.2C470.712 40 472.512 38.2333 474.779 36.9C477.045 35.5667 479.645 34.6 482.579 34C485.579 33.4 488.745 33.1 492.079 33.1C495.145 33.1 498.045 33.4 500.779 34C503.579 34.6 506.079 35.5333 508.279 36.8C510.545 38 512.312 39.5667 513.579 41.5C514.845 43.3667 515.479 45.5667 515.479 48.1C515.479 48.4333 515.445 48.8 515.379 49.2C515.379 49.5333 515.379 49.7667 515.379 49.9H499.979V49.1C499.979 47.9667 499.612 47.0333 498.879 46.3C498.145 45.5667 497.145 45 495.879 44.6C494.612 44.1333 493.212 43.9 491.679 43.9C490.679 43.9 489.679 44 488.679 44.2C487.745 44.3333 486.879 44.5667 486.079 44.9C485.279 45.1667 484.612 45.5667 484.079 46.1C483.612 46.6333 483.379 47.3 483.379 48.1C483.379 49.1 483.812 49.9333 484.679 50.6C485.545 51.2 486.712 51.7 488.179 52.1C489.712 52.5 491.379 52.9333 493.179 53.4C495.645 53.9333 498.245 54.5 500.979 55.1C503.712 55.6333 506.279 56.4333 508.679 57.5C511.145 58.5 513.112 60.0333 514.579 62.1C516.112 64.1 516.879 66.8667 516.879 70.4C516.879 73.7333 516.212 76.5667 514.879 78.9C513.545 81.1667 511.712 83 509.379 84.4C507.045 85.7333 504.345 86.7 501.279 87.3C498.212 87.9 494.912 88.2 491.379 88.2ZM540.189 88.2C536.789 88.2 533.889 87.7 531.489 86.7C529.155 85.6333 527.389 84.0667 526.189 82C525.055 79.9333 524.489 77.4333 524.489 74.5V46.2H517.589V34.3H524.989L528.389 18.9H540.789V34.3H551.089V46.2H540.789V70.5C540.789 72.3667 541.155 73.8 541.889 74.8C542.622 75.8 543.955 76.3 545.889 76.3H551.089V86.5C550.222 86.7667 549.122 87.0333 547.789 87.3C546.522 87.6333 545.222 87.8667 543.889 88C542.555 88.1333 541.322 88.2 540.189 88.2Z" fill="white"/><path d="M65.4023 39.5L88.3057 21.083L75.167 87.6943H68.4951L70.6562 55.3057L40.6387 36.0557L19.5557 59.7041L21.3408 87.6943H13.1387L0 29.9443L17.417 38.1943L12.2227 8.55566L32.4023 29.9443L38.1943 0L49.9023 32L68.1387 0L65.4023 39.5ZM53 87H40.7773L39.7773 72.833L53 70.833V87ZM34.4023 57C36.3353 57 37.9023 58.567 37.9023 60.5C37.9023 62.433 36.3353 64 34.4023 64C32.4695 63.9998 30.9023 62.4329 30.9023 60.5C30.9023 58.5671 32.4695 57.0002 34.4023 57ZM55.4023 55C57.3353 55 58.9023 56.567 58.9023 58.5C58.9023 60.433 57.3353 62 55.4023 62C53.4695 61.9998 51.9023 60.4329 51.9023 58.5C51.9023 56.5671 53.4695 55.0002 55.4023 55Z" fill="white"/></svg></div>
      <div class="tabs">
        <button class="tab active" data-tab="dev">Dev Servers <span class="count" id="dev-count">0</span></button>
        <button class="tab" data-tab="system">System <span class="count" id="system-count">0</span></button>
      </div>
    </header>

    <div id="dev-content"><div class="loading">Loading</div></div>

    <div id="system-content" class="hidden"></div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    let processData = { dev: [], system: [] };
    let activeTab = 'dev';

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        document.getElementById('dev-content').classList.toggle('hidden', activeTab !== 'dev');
        document.getElementById('system-content').classList.toggle('hidden', activeTab !== 'system');
      });
    });

    async function loadProcesses() {
      try {
        const res = await fetch('/api/processes');
        const processes = await res.json();

        processData.dev = processes.filter(p => p.workspace !== '-');
        processData.system = processes.filter(p => p.workspace === '-');

        document.getElementById('dev-count').textContent = processData.dev.length;
        document.getElementById('system-count').textContent = processData.system.length;

        renderDev();
        renderSystem();
      } catch (error) {
        console.error('Failed to load processes:', error);
      }
    }

    function renderDev() {
      const container = document.getElementById('dev-content');
      if (processData.dev.length === 0) {
        container.innerHTML = '<div class="empty">No dev servers running</div>';
        return;
      }

      // Group by workspace
      const groups = {};
      processData.dev.forEach(p => {
        if (!groups[p.workspace]) groups[p.workspace] = [];
        groups[p.workspace].push(p);
      });

      container.innerHTML = Object.entries(groups).map(([workspace, procs]) => {
        // Check if any process in this workspace is tracked by Conductor
        const conductorProc = procs.find(p => p.workspaceId);
        const conductorBadge = conductorProc
          ? \`<span class="conductor-badge \${conductorProc.workspaceState === 'initializing' ? 'initializing' : ''}"><span class="dot"></span>Conductor</span>\`
          : '';
        return \`
        <div class="workspace-group">
          <div class="workspace-title">\${esc(workspace)}\${conductorBadge}</div>
          <div class="table-header">
            <div class="col-url">Port</div>
            <div class="col-agent">Agent</div>
            <div class="col-branch">Branch</div>
            <div class="col-actions"></div>
          </div>
          \${procs.map(p => \`
            <a class="row" href="http://localhost:\${p.port}" target="_blank" data-pid="\${p.pid}">
              <div class="col-url">localhost:\${p.port}</div>
              <div class="col-agent">\${esc(p.project)}</div>
              <div class="col-branch">\${esc(p.branch)}</div>
              <div class="col-actions">
                <button class="action" title="COPY KILL COMMAND" onclick="event.preventDefault();copyKill(\${p.pid})">copy</button>
                <button class="action" title="KILL THIS SERVER" onclick="event.preventDefault();kill(\${p.pid})">kill</button>
              </div>
            </a>
          \`).join('')}
        </div>
      \`}).join('');
    }

    function renderSystem() {
      const container = document.getElementById('system-content');
      if (processData.system.length === 0) {
        container.innerHTML = '<div class="empty">No system processes</div>';
        return;
      }
      container.innerHTML = \`
        <div class="workspace-group">
          <div class="workspace-title">System Processes</div>
          <div class="table-header">
            <div class="col-url">Port</div>
            <div class="col-agent">Process</div>
            <div class="col-branch">PID</div>
            <div class="col-actions"></div>
          </div>
          \${processData.system.map(p => \`
            <a class="row" href="http://localhost:\${p.port}" target="_blank" data-pid="\${p.pid}">
              <div class="col-url">localhost:\${p.port}</div>
              <div class="col-agent">\${esc(p.command)}</div>
              <div class="col-branch">\${p.pid}</div>
              <div class="col-actions">
                <button class="action" title="COPY KILL COMMAND" onclick="event.preventDefault();copyKill(\${p.pid})">copy</button>
                <button class="action" title="KILL THIS SERVER" onclick="event.preventDefault();kill(\${p.pid})">kill</button>
              </div>
            </a>
          \`).join('')}
        </div>
      \`;
    }

    function esc(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function copyKill(pid) {
      navigator.clipboard.writeText('kill -9 ' + pid);
      toast('Copied');
    }

    async function kill(pid) {
      if (!confirm('Kill process ' + pid + '?')) return;
      try {
        const res = await fetch('/api/kill/' + pid, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
          document.querySelector('[data-pid="' + pid + '"]')?.remove();
          toast('Killed');
        } else {
          toast('Failed');
        }
      } catch (e) {
        toast('Error');
      }
    }

    function toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 1500);
    }

    loadProcesses();

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) loadProcesses();
    });
  </script>
</body>
</html>`;

// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API: Get processes
  if (url.pathname === '/api/processes' && req.method === 'GET') {
    const processes = await getLocalhostProcesses();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(processes));
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

  // Serve HTML
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getHTML());
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n  Locohost running at:\n`);
  console.log(`  → http://localhost:${PORT}\n`);
});
