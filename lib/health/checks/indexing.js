import { execFileAsync } from '../utils.js';

const INDEXING_PROCESSES = ['mds', 'mds_stores', 'mdworker_shared', 'mdworker'];

export async function check(batteryState) {
  const findings = [];

  try {
    const { stdout } = await execFileAsync('ps', ['aux']);
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return findings;

    let combinedCPU = 0;
    const indexingProcs = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length < 11) continue;

      const pid = parseInt(parts[1], 10);
      const cpuPct = parseFloat(parts[2]);
      const memPct = parseFloat(parts[3]);
      const shortName = parts[10].split('/').pop();

      if (!INDEXING_PROCESSES.includes(shortName)) continue;

      combinedCPU += cpuPct;
      indexingProcs.push({ pid, name: shortName, cpuPct, memPct });
    }

    // Only flag if combined CPU is notably high
    if (combinedCPU < 50) return findings;

    // Lower severity unless battery is low
    const batteryLow = batteryState && batteryState.percentage < 30 && !batteryState.charging;
    const severity = batteryLow ? 'warning' : 'info';

    findings.push({
      pid: indexingProcs[0]?.pid || 0,
      name: 'Spotlight indexing',
      metric: 'cpu',
      value: Math.round(combinedCPU),
      threshold: '50% combined',
      severity,
      detail: batteryLow
        ? `Spotlight is re-indexing your disk using ${Math.round(combinedCPU)}% CPU while on battery. This will stop on its own but is draining power fast.`
        : `Spotlight is re-indexing your disk (${Math.round(combinedCPU)}% CPU). Usually temporary — things will calm down on their own.`,
      processes: indexingProcs
    });
  } catch (e) {
    // Silent failure
  }

  return findings;
}
