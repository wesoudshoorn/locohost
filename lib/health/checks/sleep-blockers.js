import { execFileAsync } from '../utils.js';

// Transient/harmless assertions to ignore
const IGNORE_PATTERNS = [
  /powerd/i,
  /UserIsActive/i,
  /BackgroundTask/i,
  /com\.apple\.apsd/i
];

export async function check() {
  const findings = [];

  try {
    const { stdout } = await execFileAsync('pmset', ['-g', 'assertions']);
    if (!stdout.trim()) return findings;

    const lines = stdout.split('\n');
    let currentSection = '';

    for (const line of lines) {
      // Look for PreventUserIdleSystemSleep or PreventSystemSleep assertions
      if (/PreventUserIdleSystemSleep|PreventSystemSleep/.test(line)) {
        currentSection = 'sleep-blocker';
      }

      // Match assertion detail lines (pid, name, age)
      const assertionMatch = line.match(/pid (\d+)\(([^)]+)\).*?(\d+(?:\.\d+)?)\s*(?:secs|mins|hrs)/i);
      if (!assertionMatch) continue;

      const pid = parseInt(assertionMatch[1], 10);
      const processName = assertionMatch[2];
      const timeValue = parseFloat(assertionMatch[3]);

      // Skip harmless/transient ones
      if (IGNORE_PATTERNS.some(p => p.test(processName))) continue;
      if (IGNORE_PATTERNS.some(p => p.test(line))) continue;

      // Only flag meaningful blockers (active for more than 5 minutes)
      const isMinutes = /mins/i.test(line);
      const isHours = /hrs/i.test(line);
      const durationMinutes = isHours ? timeValue * 60 : isMinutes ? timeValue : timeValue / 60;

      if (durationMinutes < 5) continue;

      const severity = durationMinutes > 120 ? 'warning' : 'info';

      findings.push({
        pid,
        name: processName,
        metric: 'sleep-blocker',
        value: Math.round(durationMinutes),
        threshold: '5 min',
        severity,
        detail: durationMinutes > 120
          ? `${processName} has been keeping your Mac awake for ${Math.round(durationMinutes / 60)}h. Your laptop won't sleep while this runs.`
          : `${processName} is preventing your Mac from sleeping (${Math.round(durationMinutes)}m). Usually harmless but uses extra battery.`,
        command: processName
      });
    }
  } catch (e) {
    // Silent failure
  }

  return findings;
}
