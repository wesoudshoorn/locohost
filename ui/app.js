let processData = { dev: [], system: [] };
let healthData = { findings: [], battery: null };
let dockerData = { available: false, containers: [], diskUsage: null };
let activeTab = 'dev';
let focusedIndex = -1;

// SVG icons for empty states (matching tab icons)
const ICONS = {
  servers: '<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  health: '<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  docker: '<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  system: '<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

// Determine API base (works both in Electron file:// and standalone server)
const API_BASE = window.location.protocol === 'file:'
  ? `http://localhost:${window.locohost?.port || 3847}`
  : '';

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    document.getElementById('dev-content').classList.toggle('hidden', activeTab !== 'dev');
    document.getElementById('system-content').classList.toggle('hidden', activeTab !== 'system');
    document.getElementById('health-content').classList.toggle('hidden', activeTab !== 'health');
    document.getElementById('docker-content').classList.toggle('hidden', activeTab !== 'docker');
    focusedIndex = -1;
    updateFocus();
    resizeWindow();
  });
});

// Dynamic window sizing — tell Electron to resize based on content
function resizeWindow() {
  requestAnimationFrame(() => {
    const height = document.body.scrollHeight;
    if (window.locohost?.resize) {
      window.locohost.resize(height);
    }
  });
}

// ── Data Loading ──

async function loadProcesses() {
  try {
    const res = await fetch(`${API_BASE}/api/processes`);
    const processes = await res.json();

    processData.dev = processes.filter(p => p.workspace !== '-');
    processData.system = processes.filter(p => p.workspace === '-');

    document.getElementById('dev-count').textContent = processData.dev.length;
    document.getElementById('system-count').textContent = processData.system.length;

    renderDev();
    renderSystem();
    resizeWindow();
  } catch (error) {
    console.error('Failed to load processes:', error);
  }
}

async function loadHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    healthData = await res.json();

    const actionable = (healthData.findings || []).filter(f => {
      if (f.category === 'dev-server') return true;
      if (f.category === 'docker') return true;
      if (f.metric === 'sleep-blocker') return true;
      if (f.name === 'Spotlight indexing') return true;
      if (f.category === 'browser') return true;
      if (f.category === 'other') return false;
      if (f.command && /node|next|vite|webpack|bun|deno|rails|python|ruby|php/i.test(f.command)) return true;
      if (f.metric === 'memory') return true;
      return false;
    });

    document.getElementById('health-count').textContent = actionable.length;
    healthData._actionable = actionable;
    renderHealth();
    resizeWindow();
  } catch (error) {
    console.error('Failed to load health:', error);
  }
}

async function loadDocker() {
  try {
    const res = await fetch(`${API_BASE}/api/docker`);
    dockerData = await res.json();

    document.getElementById('docker-count').textContent =
      dockerData.available ? dockerData.containers.length : 0;

    renderDocker();
    resizeWindow();
  } catch (error) {
    console.error('Failed to load Docker:', error);
  }
}

// ── Rendering ──

function renderDev() {
  const container = document.getElementById('dev-content');
  if (processData.dev.length === 0) {
    container.innerHTML = `<div class="empty">${ICONS.servers}No dev servers running<div class="empty-hint">Start a project to see it here</div></div>`;
    return;
  }

  const groups = {};
  processData.dev.forEach(p => {
    if (!groups[p.workspace]) groups[p.workspace] = [];
    groups[p.workspace].push(p);
  });

  container.innerHTML = Object.entries(groups).map(([workspace, procs]) => {
    const conductorProc = procs.find(p => p.workspaceId);
    const conductorBadge = conductorProc
      ? `<span class="conductor-badge ${conductorProc.workspaceState === 'initializing' ? 'initializing' : ''}"><span class="dot"></span>Conductor</span>`
      : '';
    const shortWorkspace = workspace.split('/').pop() || workspace;
    const pids = procs.map(p => p.pid).join(',');
    return `
    <div class="workspace-group">
      <div class="workspace-title">
        ${esc(shortWorkspace)}${conductorBadge}
        <button class="action kill-all" data-pids="${pids}" onclick="event.stopPropagation();killAll(this)" title="Kill all servers in this workspace">kill all</button>
      </div>
      ${procs.map(p => `
        <div class="row" data-pid="${p.pid}" onclick="openInBrowser('http://localhost:${p.port}')">
          <div class="col-port" onclick="event.stopPropagation();copyPort(${p.port}, this)" title="Click to copy URL">:${p.port}</div>
          <div class="col-info">
            <span class="agent-name">${esc(p.branch && p.branch !== '-' ? p.branch : p.project)}</span><span class="branch-name">${esc(p.branch && p.branch !== '-' ? p.workspace : '')}</span>
            ${p.startTime ? `<span class="uptime ${uptimeClass(p.startTime)}">${formatUptime(p.startTime)}</span>` : ''}
          </div>
          <div class="col-actions">
            <button class="action" title="Open in browser" onclick="event.stopPropagation();openInBrowser('http://localhost:${p.port}')">open</button>
            <button class="action kill" title="Kill this server" onclick="event.stopPropagation();confirmKill(this, ${p.pid})">kill</button>
          </div>
        </div>
      `).join('')}
    </div>
  `}).join('');
}

function renderSystem() {
  const container = document.getElementById('system-content');
  if (processData.system.length === 0) {
    container.innerHTML = `<div class="empty">${ICONS.system}No system processes on ports<div class="empty-hint">System services using localhost ports appear here</div></div>`;
    return;
  }
  container.innerHTML = `
    <div class="workspace-group">
      ${processData.system.map(p => `
        <div class="row" data-pid="${p.pid}" onclick="openInBrowser('http://localhost:${p.port}')">
          <div class="col-port" onclick="event.stopPropagation();copyPort(${p.port}, this)" title="Click to copy URL">:${p.port}</div>
          <div class="col-info">
            <span class="agent-name">${esc(p.command)}</span><span class="branch-name">pid ${p.pid}</span>
            ${p.startTime ? `<span class="uptime ${uptimeClass(p.startTime)}">${formatUptime(p.startTime)}</span>` : ''}
          </div>
          <div class="col-actions">
            <button class="action" title="Open in browser" onclick="event.stopPropagation();openInBrowser('http://localhost:${p.port}')">open</button>
            <button class="action kill" title="Kill this server" onclick="event.stopPropagation();confirmKill(this, ${p.pid})">kill</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderHealth() {
  const container = document.getElementById('health-content');
  const findings = healthData._actionable || [];
  const battery = healthData.battery;

  if (findings.length === 0 && !battery) {
    container.innerHTML = `<div class="empty">${ICONS.health}All clear<div class="empty-hint">Health issues will appear here</div></div>`;
    return;
  }

  let html = '';

  if (battery && battery.percentage !== null) {
    const pctClass = battery.percentage < 15 ? 'critical' : battery.percentage < 30 ? 'low' : '';
    const icon = battery.charging ? '&#9889;' : '&#128267;';
    html += `
      <div class="battery-bar">
        <span class="battery-icon">${icon}</span>
        <span class="battery-pct ${pctClass}">${battery.percentage}%</span>
        <span>${battery.powerSource === 'ac' ? 'AC Power' : 'Battery'}${battery.charging ? ' · Charging' : ''}</span>
      </div>
    `;
  }

  if (findings.length === 0) {
    html += `<div class="empty">${ICONS.health}All clear<div class="empty-hint">Health issues will appear here</div></div>`;
    container.innerHTML = html;
    return;
  }

  html += '<div class="findings-list">';
  for (const f of findings) {
    const portLabel = f.port ? `<span class="finding-port">:${f.port}</span>` : '';
    html += `
      <div class="health-finding">
        <div class="severity-badge ${f.severity}"></div>
        <div class="finding-content">
          <div class="finding-name">${esc(f.name)}${portLabel}</div>
          <div class="finding-detail">${esc(f.detail)}</div>
        </div>
        <div class="finding-actions">
          <span class="finding-value ${f.severity}">${formatValue(f)}</span>
          ${f.pid ? `<button class="action kill" title="Kill process" onclick="confirmKill(this, ${f.pid})">kill</button>` : ''}
        </div>
      </div>
    `;
  }
  html += '</div>';

  container.innerHTML = html;
}

function renderDocker() {
  const container = document.getElementById('docker-content');

  if (!dockerData.available) {
    const messages = {
      'not-installed': 'Docker not detected<div class="empty-hint">Install Docker Desktop to see containers here</div>',
      'daemon-stopped': 'Docker daemon is not running<div class="empty-hint">Start Docker Desktop to see containers</div>',
      'timeout': 'Docker is not responding<div class="empty-hint">Check Docker Desktop and try again</div>',
    };
    container.innerHTML = `<div class="empty">${ICONS.docker}${messages[dockerData.reason] || messages['not-installed']}</div>`;
    return;
  }

  let html = '';

  // Disk usage summary
  if (dockerData.diskUsage?.breakdown) {
    html += '<div class="docker-disk">';
    html += '<div class="docker-disk-title">Disk Usage</div>';
    html += '<div class="docker-disk-items">';
    for (const item of dockerData.diskUsage.breakdown) {
      html += `
        <div class="docker-disk-item">
          <span class="docker-disk-type">${esc(item.type)}</span>
          <span class="docker-disk-size">${esc(item.size)}</span>
          <span class="docker-disk-count">${item.active}/${item.total}</span>
        </div>
      `;
    }
    html += '</div></div>';
  }

  // Containers
  if (dockerData.containers.length === 0) {
    html += `<div class="empty">${ICONS.docker}No containers running<div class="empty-hint">Docker is ready but no containers are active</div></div>`;
    container.innerHTML = html;
    return;
  }

  html += '<div class="workspace-group">';
  html += '<div class="workspace-title">Running Containers</div>';
  for (const c of dockerData.containers) {
    const ports = extractDockerPorts(c.ports);
    const portLabel = ports.length > 0 ? `:${ports[0]}` : '';
    html += `
      <div class="row" data-container="${esc(c.id)}" ${ports.length ? `onclick="openInBrowser('http://localhost:${ports[0]}')"` : ''}>
        <div class="col-port docker-port"${ports.length ? ` onclick="event.stopPropagation();copyPort(${ports[0]}, this)" title="Click to copy URL"` : ''}>${portLabel || '<span class="no-port">--</span>'}</div>
        <div class="col-info">
          <span class="agent-name">${esc(c.name)}</span>
          <span class="branch-name">${esc(truncateImage(c.image))}</span>
          <span class="uptime">${esc(c.runningFor || c.status)}</span>
        </div>
        <div class="col-actions">
          ${ports.length ? `<button class="action" title="Open in browser" onclick="event.stopPropagation();openInBrowser('http://localhost:${ports[0]}')">open</button>` : ''}
          <button class="action kill" title="Stop container" onclick="event.stopPropagation();confirmStopContainer(this, '${esc(c.id)}')">stop</button>
        </div>
      </div>
    `;
  }
  html += '</div>';

  container.innerHTML = html;
}

// ── Helpers ──

function formatValue(f) {
  if (f.metric === 'cpu') return `${f.value}%`;
  if (f.metric === 'memory') return f.valueGB ? `${f.valueGB}GB` : `${f.value}%`;
  if (f.metric === 'long-running') return `${f.value}h`;
  if (f.metric === 'sleep-blocker') return `${f.value}m`;
  if (f.metric === 'docker-disk') return `${f.valueGB}GB`;
  if (f.metric === 'docker-stale') return `${f.value}d`;
  return '';
}

function esc(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatUptime(startTime) {
  const ms = Date.now() - new Date(startTime).getTime();
  if (ms < 0) return '';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function uptimeClass(startTime) {
  const hours = (Date.now() - new Date(startTime).getTime()) / 3600000;
  if (hours > 24) return 'uptime-critical';
  if (hours > 6) return 'uptime-warning';
  if (hours > 1) return 'uptime-normal';
  return 'uptime-fresh';
}

function extractDockerPorts(portsStr) {
  if (!portsStr) return [];
  const ports = [];
  const matches = portsStr.matchAll(/0\.0\.0\.0:(\d+)->|:::(\d+)->/g);
  for (const m of matches) {
    ports.push(parseInt(m[1] || m[2], 10));
  }
  return ports;
}

function truncateImage(image) {
  if (!image) return '';
  // Remove registry prefix and sha256 digest
  const short = image.replace(/^[^/]+\//, '').replace(/@sha256:.+$/, '');
  return short.length > 30 ? short.substring(0, 27) + '...' : short;
}

// ── Actions ──

function openInBrowser(url) {
  if (window.locohost?.openExternal) {
    window.locohost.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
}

function copyPort(port, el) {
  navigator.clipboard.writeText(`http://localhost:${port}`).then(() => {
    toast('Copied!');
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 600);
  }).catch(() => {
    toast('Copy failed');
  });
}

// Kill with confirmation: first click shows "sure?", second click kills
function confirmKill(btn, pid) {
  if (btn.dataset.confirming === 'true') {
    btn.dataset.confirming = '';
    btn.textContent = 'kill';
    btn.classList.remove('confirming');
    killProc(pid);
    return;
  }
  btn.dataset.confirming = 'true';
  btn.textContent = 'sure?';
  btn.classList.add('confirming');
  setTimeout(() => {
    if (btn.dataset.confirming === 'true') {
      btn.dataset.confirming = '';
      btn.textContent = 'kill';
      btn.classList.remove('confirming');
    }
  }, 2000);
}

function confirmStopContainer(btn, containerId) {
  if (btn.dataset.confirming === 'true') {
    btn.dataset.confirming = '';
    btn.textContent = 'stop';
    btn.classList.remove('confirming');
    stopContainer(containerId);
    return;
  }
  btn.dataset.confirming = 'true';
  btn.textContent = 'sure?';
  btn.classList.add('confirming');
  setTimeout(() => {
    if (btn.dataset.confirming === 'true') {
      btn.dataset.confirming = '';
      btn.textContent = 'stop';
      btn.classList.remove('confirming');
    }
  }, 2000);
}

function killAll(btn) {
  const pids = btn.dataset.pids.split(',').map(Number);
  if (btn.dataset.confirming === 'true') {
    btn.dataset.confirming = '';
    btn.textContent = 'kill all';
    btn.classList.remove('confirming');
    // Kill each process with a small delay
    pids.reduce((p, pid, i) =>
      p.then(() => new Promise(resolve => setTimeout(() => { killProc(pid); resolve(); }, i * 200)))
    , Promise.resolve());
    return;
  }
  btn.dataset.confirming = 'true';
  btn.textContent = 'sure?';
  btn.classList.add('confirming');
  setTimeout(() => {
    if (btn.dataset.confirming === 'true') {
      btn.dataset.confirming = '';
      btn.textContent = 'kill all';
      btn.classList.remove('confirming');
    }
  }, 2000);
}

async function killProc(pid) {
  try {
    const res = await fetch(`${API_BASE}/api/kill/${pid}`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      document.querySelector(`[data-pid="${pid}"]`)?.remove();
      toast('Killed');
      setTimeout(() => { loadProcesses(); loadHealth(); }, 500);
    } else {
      toast(result.error || 'Failed');
    }
  } catch (e) {
    toast('Error');
  }
}

async function stopContainer(containerId) {
  try {
    toast('Stopping...');
    const res = await fetch(`${API_BASE}/api/docker/stop/${containerId}`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      toast('Stopped');
      setTimeout(loadDocker, 500);
    } else {
      toast(result.error || 'Failed');
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

// ── Keyboard Navigation ──

function getVisibleRows() {
  const contentId = activeTab === 'dev' ? 'dev-content'
    : activeTab === 'docker' ? 'docker-content'
    : activeTab === 'system' ? 'system-content'
    : null;
  if (!contentId) return [];
  return [...document.getElementById(contentId).querySelectorAll('.row')];
}

function updateFocus() {
  document.querySelectorAll('.row.focused').forEach(r => r.classList.remove('focused'));
  const rows = getVisibleRows();
  if (focusedIndex >= 0 && focusedIndex < rows.length) {
    rows[focusedIndex].classList.add('focused');
    rows[focusedIndex].scrollIntoView({ block: 'nearest' });
  }
}

document.addEventListener('keydown', e => {
  // Don't capture when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const rows = getVisibleRows();

  if (e.key === 'ArrowDown' || e.key === 'j') {
    e.preventDefault();
    focusedIndex = Math.min(focusedIndex + 1, rows.length - 1);
    updateFocus();
    return;
  }
  if (e.key === 'ArrowUp' || e.key === 'i') {
    e.preventDefault();
    focusedIndex = Math.max(focusedIndex - 1, 0);
    updateFocus();
    return;
  }
  if (e.key === 'k' && focusedIndex >= 0 && focusedIndex < rows.length) {
    const row = rows[focusedIndex];
    const killBtn = row.querySelector('.action.kill');
    if (killBtn) killBtn.click();
    return;
  }
  if (e.key === 'o' && focusedIndex >= 0 && focusedIndex < rows.length) {
    const row = rows[focusedIndex];
    row.click();
    return;
  }
  if (e.key === 'r') {
    loadProcesses();
    loadHealth();
    loadDocker();
    return;
  }
  if (e.key === 'Escape') {
    focusedIndex = -1;
    updateFocus();
    return;
  }
});

// ── Uptime ticker ──
setInterval(() => {
  document.querySelectorAll('.uptime[class*="uptime-"]').forEach(el => {
    // Re-render uptimes from the data (the startTime is embedded in the render)
    // For simplicity, we re-render on data refresh instead
  });
  // Just re-render the active tab to update uptimes
  if (activeTab === 'dev') renderDev();
  else if (activeTab === 'system') renderSystem();
}, 60000); // Update every minute

// ── Initial load ──
loadProcesses();
loadHealth();
loadDocker();

// Auto-refresh
setInterval(() => {
  loadProcesses();
  loadHealth();
  loadDocker();
}, 10000);

// Expose for global onclick handlers
window.killProc = killProc;
window.openInBrowser = openInBrowser;
window.copyPort = copyPort;
window.confirmKill = confirmKill;
window.confirmStopContainer = confirmStopContainer;
window.killAll = killAll;
