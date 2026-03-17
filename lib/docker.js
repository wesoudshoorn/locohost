import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Check if Docker CLI is available and daemon is running
async function checkDocker() {
  try {
    await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 5000 });
    return { available: true };
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { available: false, reason: 'not-installed' };
    }
    if (e.stderr?.includes('Cannot connect') || e.stderr?.includes('Is the docker daemon running')) {
      return { available: false, reason: 'daemon-stopped' };
    }
    if (e.killed) {
      return { available: false, reason: 'timeout' };
    }
    return { available: false, reason: 'error' };
  }
}

// Get running containers
async function getContainers() {
  try {
    const { stdout } = await execFileAsync('docker', [
      'ps', '--format', '{{json .}}'
    ], { timeout: 10000 });

    if (!stdout.trim()) return [];

    return stdout.trim().split('\n').map(line => {
      const c = JSON.parse(line);
      return {
        id: c.ID,
        name: c.Names,
        image: c.Image,
        status: c.Status,
        ports: c.Ports || '',
        created: c.CreatedAt || c.RunningFor || '',
        runningFor: c.RunningFor || '',
        size: c.Size || ''
      };
    });
  } catch (e) {
    console.error('Error getting Docker containers:', e.message);
    return [];
  }
}

// Get Docker disk usage
async function getDiskUsage() {
  try {
    const { stdout } = await execFileAsync('docker', [
      'system', 'df', '--format', '{{json .}}'
    ], { timeout: 10000 });

    if (!stdout.trim()) return null;

    const lines = stdout.trim().split('\n');
    const usage = { total: 0, breakdown: [] };

    for (const line of lines) {
      const d = JSON.parse(line);
      const item = {
        type: d.Type,
        total: parseInt(d.TotalCount, 10) || 0,
        active: parseInt(d.Active, 10) || 0,
        size: d.Size || '0B',
        reclaimable: d.Reclaimable || '0B'
      };
      usage.breakdown.push(item);
    }

    return usage;
  } catch (e) {
    console.error('Error getting Docker disk usage:', e.message);
    return null;
  }
}

// Get all Docker info in one call
export async function getDockerInfo() {
  const status = await checkDocker();
  if (!status.available) {
    return { available: false, reason: status.reason, containers: [], diskUsage: null };
  }

  const [containers, diskUsage] = await Promise.all([
    getContainers(),
    getDiskUsage()
  ]);

  return { available: true, containers, diskUsage };
}

// Stop a Docker container
export async function stopContainer(containerId) {
  if (!containerId || !/^[a-f0-9]+$/i.test(containerId)) {
    return { success: false, error: 'Invalid container ID' };
  }

  try {
    await execFileAsync('docker', ['stop', containerId], { timeout: 15000 });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
