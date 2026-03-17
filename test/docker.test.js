import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../lib/health/checks/docker.js';

describe('Docker health check', () => {
  it('returns an array', async () => {
    // This test works regardless of Docker installation status
    const findings = await check();
    assert.ok(Array.isArray(findings), 'check() should return an array');
  });

  it('findings have correct structure', async () => {
    const findings = await check();
    for (const f of findings) {
      assert.ok(f.name, 'finding should have a name');
      assert.ok(f.detail, 'finding should have detail');
      assert.ok(f.metric, 'finding should have a metric');
      assert.ok(f.severity, 'finding should have severity');
      assert.ok(['critical', 'warning', 'info'].includes(f.severity), 'severity should be valid');
      assert.equal(f.category, 'docker', 'category should be docker');
    }
  });
});

describe('Docker disk size parsing (integration)', () => {
  // These tests validate the check returns valid findings
  // The actual parsing is internal to the module, so we test via the check function
  it('does not crash on check', async () => {
    // Should never throw, even if Docker is not installed
    const findings = await check();
    assert.ok(findings !== undefined);
  });
});
