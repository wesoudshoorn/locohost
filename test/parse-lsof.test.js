import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test lsof output parsing logic extracted from processes.js
// We test the parsing logic inline since the function isn't exported separately

// Replicate the actual parsing from processes.js
// lsof output has the address in the 9th column (index 8), but may have (LISTEN) after
function parseLsofLine(line) {
  const parts = line.split(/\s+/);
  if (parts.length < 9) return null;

  const [command, pid] = parts;
  // Find the TCP address field — it's the one containing a colon and port
  // In real lsof output: "TCP 127.0.0.1:3000 (LISTEN)" or "TCP *:8080 (LISTEN)"
  let name = null;
  for (const part of parts) {
    if (/:(\d+)$/.test(part)) {
      name = part;
      break;
    }
  }
  if (!name) return null;

  const portMatch = name.match(/:(\d+)$/);
  if (!portMatch) return null;

  return {
    pid: parseInt(pid, 10),
    port: parseInt(portMatch[1], 10),
    command: command.substring(0, 20)
  };
}

describe('lsof output parsing', () => {
  it('parses a standard node process', () => {
    const line = 'node      12345 user   25u  IPv4 0x1234  0t0  TCP 127.0.0.1:3000 (LISTEN)';
    const result = parseLsofLine(line);
    assert.deepEqual(result, { pid: 12345, port: 3000, command: 'node' });
  });

  it('parses a process on wildcard address', () => {
    const line = 'node      67890 user   25u  IPv6 0x5678  0t0  TCP *:8080 (LISTEN)';
    const result = parseLsofLine(line);
    assert.deepEqual(result, { pid: 67890, port: 8080, command: 'node' });
  });

  it('parses localhost address', () => {
    const line = 'ruby      11111 user   10u  IPv4 0xabcd  0t0  TCP localhost:4567 (LISTEN)';
    const result = parseLsofLine(line);
    assert.deepEqual(result, { pid: 11111, port: 4567, command: 'ruby' });
  });

  it('truncates long command names', () => {
    const line = 'some-very-long-command-name 99999 user   10u  IPv4 0x1  0t0  TCP 127.0.0.1:9000 (LISTEN)';
    const result = parseLsofLine(line);
    assert.equal(result.command, 'some-very-long-comma');
    assert.equal(result.command.length, 20);
  });

  it('returns null for lines with too few fields', () => {
    const result = parseLsofLine('node 1234 user');
    assert.equal(result, null);
  });

  it('returns null for lines without port', () => {
    const line = 'node 1234 user 10u IPv4 0x1 0t0 TCP 127.0.0.1:* (LISTEN)';
    const result = parseLsofLine(line);
    assert.equal(result, null);
  });

  it('parses high port numbers', () => {
    const line = 'node      12345 user   25u  IPv4 0x1234  0t0  TCP 127.0.0.1:49152 (LISTEN)';
    const result = parseLsofLine(line);
    assert.equal(result.port, 49152);
  });
});

describe('uptime formatting', () => {
  function formatUptime(startTime) {
    const ms = Date.now() - new Date(startTime).getTime();
    if (ms < 0) return '';
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  it('formats minutes', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    assert.equal(formatUptime(fiveMinAgo), '5m');
  });

  it('formats hours and minutes', () => {
    const twoHoursAgo = new Date(Date.now() - 2.5 * 3600000).toISOString();
    assert.equal(formatUptime(twoHoursAgo), '2h 30m');
  });

  it('formats days and hours', () => {
    const twoDaysAgo = new Date(Date.now() - 50 * 3600000).toISOString();
    assert.equal(formatUptime(twoDaysAgo), '2d 2h');
  });

  it('returns empty for future dates', () => {
    const future = new Date(Date.now() + 60000).toISOString();
    assert.equal(formatUptime(future), '');
  });
});
