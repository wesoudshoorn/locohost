import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adjustForBattery, shouldNotify, buildSummary } from '../lib/health/severity.js';

describe('adjustForBattery', () => {
  it('does nothing when charging', () => {
    const findings = [{ severity: 'info', metric: 'cpu', detail: 'test' }];
    const result = adjustForBattery(findings, { percentage: 10, charging: true });
    assert.equal(result[0].severity, 'info');
  });

  it('does nothing when no battery state', () => {
    const findings = [{ severity: 'info', metric: 'cpu', detail: 'test' }];
    const result = adjustForBattery(findings, null);
    assert.equal(result[0].severity, 'info');
  });

  it('escalates to warning at <15% battery', () => {
    const findings = [{ severity: 'info', metric: 'cpu', detail: 'test' }];
    const result = adjustForBattery(findings, { percentage: 12, charging: false });
    assert.equal(result[0].severity, 'warning');
    assert.ok(result[0].detail.includes('battery 12%'));
  });

  it('escalates warning to critical at <15% battery', () => {
    const findings = [{ severity: 'warning', metric: 'cpu', detail: 'test' }];
    const result = adjustForBattery(findings, { percentage: 8, charging: false });
    assert.equal(result[0].severity, 'critical');
  });

  it('leaves critical as critical at <15% battery', () => {
    const findings = [{ severity: 'critical', metric: 'cpu', detail: 'test' }];
    const result = adjustForBattery(findings, { percentage: 5, charging: false });
    assert.equal(result[0].severity, 'critical');
  });

  it('bumps CPU info to warning at <30% battery', () => {
    const findings = [{ severity: 'info', metric: 'cpu', detail: 'test' }];
    const result = adjustForBattery(findings, { percentage: 25, charging: false });
    assert.equal(result[0].severity, 'warning');
  });

  it('does not bump non-CPU info at <30% battery', () => {
    const findings = [{ severity: 'info', metric: 'memory', detail: 'test' }];
    const result = adjustForBattery(findings, { percentage: 25, charging: false });
    assert.equal(result[0].severity, 'info');
  });
});

describe('shouldNotify', () => {
  it('notifies on critical', () => {
    assert.ok(shouldNotify([{ severity: 'critical' }]));
  });

  it('notifies on warning', () => {
    assert.ok(shouldNotify([{ severity: 'warning' }]));
  });

  it('notifies on 3+ info', () => {
    assert.ok(shouldNotify([
      { severity: 'info' },
      { severity: 'info' },
      { severity: 'info' }
    ]));
  });

  it('does not notify on 1-2 info', () => {
    assert.ok(!shouldNotify([{ severity: 'info' }, { severity: 'info' }]));
  });

  it('does not notify on empty', () => {
    assert.ok(!shouldNotify([]));
  });
});

describe('buildSummary', () => {
  it('builds correct title and severity', () => {
    const findings = [
      { severity: 'critical', name: 'Node', metric: 'cpu', value: 200 },
      { severity: 'warning', name: 'Vite', metric: 'memory', valueGB: '4.2', value: 12 }
    ];
    const summary = buildSummary(findings);
    assert.equal(summary.title, 'Locohost: 2 issues found');
    assert.equal(summary.severity, 'critical');
    assert.equal(summary.counts.critical, 1);
    assert.equal(summary.counts.warning, 1);
  });

  it('handles single finding', () => {
    const summary = buildSummary([{ severity: 'info', name: 'Test', metric: 'other' }]);
    assert.equal(summary.title, 'Locohost: 1 issue found');
    assert.equal(summary.severity, 'info');
  });
});
