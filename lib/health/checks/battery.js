import { execFileAsync } from '../utils.js';

export async function check() {
  try {
    const { stdout } = await execFileAsync('pmset', ['-g', 'batt']);
    if (!stdout.trim()) return null;

    const lines = stdout.trim().split('\n');

    // First line: power source
    const powerSource = lines[0]?.includes('AC Power') ? 'ac' :
                        lines[0]?.includes('Battery Power') ? 'battery' : 'unknown';

    // Second line typically has percentage
    const pctMatch = stdout.match(/(\d+)%/);
    const percentage = pctMatch ? parseInt(pctMatch[1], 10) : null;

    const charging = /charging/i.test(stdout) && !/not charging/i.test(stdout) && !/discharging/i.test(stdout);
    const charged = /charged/i.test(stdout) && !/discharged/i.test(stdout);

    return {
      percentage,
      powerSource,
      charging: charging || charged,
      raw: stdout.trim()
    };
  } catch (e) {
    return null;
  }
}
