import { getDockerInfo } from '../../docker.js';

// Parse Docker size strings like "2.5GB", "500MB", "1.2kB"
function parseSizeToGB(sizeStr) {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([\d.]+)\s*(B|kB|KB|MB|GB|TB)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers = { B: 1e-9, KB: 1e-6, MB: 1e-3, GB: 1, TB: 1000 };
  return val * (multipliers[unit] || 0);
}

export async function check() {
  const findings = [];

  try {
    const info = await getDockerInfo();
    if (!info.available) return findings;

    // Check total disk usage
    if (info.diskUsage?.breakdown) {
      let totalGB = 0;
      for (const item of info.diskUsage.breakdown) {
        totalGB += parseSizeToGB(item.size);
      }

      if (totalGB > 50) {
        findings.push({
          pid: null,
          name: 'Docker disk usage',
          detail: `Docker is using ${totalGB.toFixed(1)}GB of disk space. Run "docker system prune" to reclaim.`,
          metric: 'docker-disk',
          value: totalGB,
          valueGB: totalGB.toFixed(1),
          severity: 'critical',
          category: 'docker'
        });
      } else if (totalGB > 20) {
        findings.push({
          pid: null,
          name: 'Docker disk usage',
          detail: `Docker is using ${totalGB.toFixed(1)}GB of disk space.`,
          metric: 'docker-disk',
          value: totalGB,
          valueGB: totalGB.toFixed(1),
          severity: 'warning',
          category: 'docker'
        });
      }
    }

    // Check for long-running containers
    for (const c of info.containers) {
      const runningFor = c.runningFor || c.status || '';
      const days = extractDays(runningFor);

      if (days >= 7) {
        findings.push({
          pid: null,
          name: c.name,
          detail: `Container "${c.image}" running for ${runningFor}`,
          metric: 'docker-stale',
          value: days,
          severity: 'warning',
          category: 'docker',
          containerId: c.id
        });
      } else if (days >= 2) {
        findings.push({
          pid: null,
          name: c.name,
          detail: `Container "${c.image}" running for ${runningFor}`,
          metric: 'docker-stale',
          value: days,
          severity: 'info',
          category: 'docker',
          containerId: c.id
        });
      }
    }
  } catch (e) {
    // Docker checks are best-effort
  }

  return findings;
}

function extractDays(str) {
  if (!str) return 0;
  // "Up 3 days", "Up About an hour", "Up 2 weeks"
  const daysMatch = str.match(/(\d+)\s*day/i);
  if (daysMatch) return parseInt(daysMatch[1], 10);
  const weeksMatch = str.match(/(\d+)\s*week/i);
  if (weeksMatch) return parseInt(weeksMatch[1], 10) * 7;
  const monthsMatch = str.match(/(\d+)\s*month/i);
  if (monthsMatch) return parseInt(monthsMatch[1], 10) * 30;
  return 0;
}
