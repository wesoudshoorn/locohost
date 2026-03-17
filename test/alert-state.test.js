import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { filterSuppressed, recordAlerts, loadState } from '../lib/health/alert-state.js';

// Note: these tests operate on the in-memory state, not the file system

describe('filterSuppressed', () => {
  beforeEach(() => {
    // Reset state by loading empty
    loadState(); // Will read from disk or start fresh
  });

  it('allows new findings through', () => {
    // Use a unique PID that won't exist in persisted state
    const uniquePid = 999000 + Math.floor(Math.random() * 1000);
    const findings = [
      { pid: uniquePid, metric: 'cpu', name: `test-node-${uniquePid}`, severity: 'warning', value: 150 }
    ];
    const result = filterSuppressed(findings, null);
    assert.equal(result.length, 1);
  });

  it('suppresses recently alerted findings', () => {
    const pid = 999100 + Math.floor(Math.random() * 100);
    const findings = [
      { pid, metric: 'cpu', name: `suppress-test-${pid}`, severity: 'warning', value: 150 }
    ];
    recordAlerts(findings, null);
    const result = filterSuppressed(findings, null);
    assert.equal(result.length, 0);
  });

  it('allows re-alert when value worsens by >50%', () => {
    const pid = 999200 + Math.floor(Math.random() * 100);
    const name = `worsen-test-${pid}`;
    const initial = [
      { pid, metric: 'cpu', name, severity: 'warning', value: 100 }
    ];
    recordAlerts(initial, null);

    const worse = [
      { pid, metric: 'cpu', name, severity: 'warning', value: 200 }
    ];
    const result = filterSuppressed(worse, null);
    assert.equal(result.length, 1, 'Should re-alert when 2x worse');
  });

  it('does not re-alert for minor worsening', () => {
    const pid = 999300 + Math.floor(Math.random() * 100);
    const name = `minor-test-${pid}`;
    const initial = [
      { pid, metric: 'cpu', name, severity: 'warning', value: 100 }
    ];
    recordAlerts(initial, null);

    const slightlyWorse = [
      { pid, metric: 'cpu', name, severity: 'warning', value: 120 }
    ];
    const result = filterSuppressed(slightlyWorse, null);
    assert.equal(result.length, 0, 'Should suppress when only 20% worse');
  });

  it('re-alerts when battery drops critically', () => {
    const pid = 999400 + Math.floor(Math.random() * 100);
    const name = `battery-test-${pid}`;
    const findings = [
      { pid, metric: 'cpu', name, severity: 'warning', value: 150 }
    ];
    recordAlerts(findings, { percentage: 80, charging: true });

    const result = filterSuppressed(findings, { percentage: 10, charging: false });
    assert.equal(result.length, 1, 'Should re-alert when battery drops to critical');
  });
});
