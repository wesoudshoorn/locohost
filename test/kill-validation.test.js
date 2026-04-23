import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSameProcess } from '../lib/processes.js';

describe('isSameProcess (PID recycling check)', () => {
  it('treats equal start times as the same process', () => {
    const t = '2026-04-23T08:00:00.000Z';
    assert.equal(isSameProcess(t, t), true);
  });

  it('treats different start times as a recycled PID', () => {
    assert.equal(
      isSameProcess('2026-04-23T08:00:00.000Z', '2026-04-23T09:15:00.000Z'),
      false
    );
  });

  it('allows kill attempt when the current process is gone', () => {
    assert.equal(isSameProcess('2026-04-23T08:00:00.000Z', null), true);
    assert.equal(isSameProcess('2026-04-23T08:00:00.000Z', undefined), true);
  });

  it('allows kill attempt when stored start time is unknown', () => {
    assert.equal(isSameProcess(null, '2026-04-23T08:00:00.000Z'), true);
  });
});
