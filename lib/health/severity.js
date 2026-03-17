// Adjust severities based on battery state
export function adjustForBattery(findings, batteryState) {
  if (!batteryState || batteryState.charging || batteryState.percentage === null) {
    return findings;
  }

  const pct = batteryState.percentage;

  return findings.map(f => {
    const adjusted = { ...f };

    // Battery <15% with any suspicious process = critical
    if (pct < 15 && f.severity !== 'critical') {
      adjusted.severity = f.severity === 'info' ? 'warning' : 'critical';
      adjusted.detail += ` [battery ${pct}%]`;
    }
    // Battery <30% with heavy CPU load = bump severity
    else if (pct < 30 && f.metric === 'cpu' && f.severity === 'info') {
      adjusted.severity = 'warning';
      adjusted.detail += ` [battery ${pct}%]`;
    }

    return adjusted;
  });
}

// Determine if findings warrant a notification
export function shouldNotify(findings) {
  const hasWarning = findings.some(f => f.severity === 'warning');
  const hasCritical = findings.some(f => f.severity === 'critical');
  const infoCount = findings.filter(f => f.severity === 'info').length;

  return hasCritical || hasWarning || infoCount >= 3;
}

// Build notification summary
export function buildSummary(findings) {
  const critical = findings.filter(f => f.severity === 'critical');
  const warnings = findings.filter(f => f.severity === 'warning');
  const infos = findings.filter(f => f.severity === 'info');

  const total = findings.length;
  const highlights = [...critical, ...warnings, ...infos]
    .slice(0, 3)
    .map(f => f.name + (f.metric === 'cpu' ? ` ${f.value}% CPU` : f.metric === 'memory' ? ` ${f.valueGB || f.value}${f.valueGB ? 'GB' : '%'} mem` : ''))
    .join(', ');

  const maxSeverity = critical.length ? 'critical' : warnings.length ? 'warning' : 'info';

  return {
    title: `Locohost: ${total} issue${total !== 1 ? 's' : ''} found`,
    body: highlights,
    severity: maxSeverity,
    counts: { critical: critical.length, warning: warnings.length, info: infos.length }
  };
}
