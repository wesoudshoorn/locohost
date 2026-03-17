import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test ps output parsing used in health checks

describe('CPU threshold classification', () => {
  // From lib/health/checks/cpu.js
  const DEV_SERVER_THRESHOLD = 150;
  const BROWSER_THRESHOLD = 80;
  const OTHER_THRESHOLD = 100;

  function classifyProcess(command) {
    const devPatterns = /node|next|vite|webpack|esbuild|bun|deno|ruby|rails|python|flask|django|php|cargo|go run/i;
    const browserPatterns = /chrome|firefox|safari|arc|brave|electron|webkit/i;

    if (devPatterns.test(command)) return { category: 'dev-server', threshold: DEV_SERVER_THRESHOLD };
    if (browserPatterns.test(command)) return { category: 'browser', threshold: BROWSER_THRESHOLD };
    return { category: 'other', threshold: OTHER_THRESHOLD };
  }

  it('classifies Node.js as dev-server', () => {
    assert.equal(classifyProcess('node').category, 'dev-server');
  });

  it('classifies next-server as dev-server', () => {
    assert.equal(classifyProcess('next-server').category, 'dev-server');
  });

  it('classifies Chrome as browser', () => {
    assert.equal(classifyProcess('Google Chrome Helper').category, 'browser');
  });

  it('classifies Arc as browser', () => {
    assert.equal(classifyProcess('Arc Helper (Renderer)').category, 'browser');
  });

  it('classifies unknown as other with 100% threshold', () => {
    const result = classifyProcess('someRandomProcess');
    assert.equal(result.category, 'other');
    assert.equal(result.threshold, 100);
  });

  it('gives dev servers a higher threshold than browsers', () => {
    assert.ok(DEV_SERVER_THRESHOLD > BROWSER_THRESHOLD);
  });
});

describe('Memory threshold checks', () => {
  // From lib/health/checks/memory.js
  function isHighMemory(rssKB, memPct) {
    const rssGB = rssKB / (1024 * 1024);
    return memPct > 10 || rssGB > 4;
  }

  function isCriticalMemory(rssKB, memPct) {
    const rssGB = rssKB / (1024 * 1024);
    return memPct > 20 || rssGB > 8;
  }

  it('flags >10% memory as high', () => {
    assert.ok(isHighMemory(1000000, 12));
  });

  it('flags >4GB RSS as high', () => {
    assert.ok(isHighMemory(5 * 1024 * 1024, 3)); // 5GB, 3%
  });

  it('does not flag moderate usage', () => {
    assert.ok(!isHighMemory(2 * 1024 * 1024, 5)); // 2GB, 5%
  });

  it('flags >20% as critical', () => {
    assert.ok(isCriticalMemory(1000000, 25));
  });

  it('flags >8GB as critical', () => {
    assert.ok(isCriticalMemory(9 * 1024 * 1024, 5));
  });
});

describe('Dev server elapsed time parsing', () => {
  // From lib/health/checks/dev-servers.js
  function parseElapsed(str) {
    if (!str) return 0;
    // Format: [[DD-]HH:]MM:SS
    const parts = str.trim().split(/[-:]/);
    if (parts.length === 2) {
      // MM:SS
      return parseInt(parts[0], 10) / 60; // hours
    }
    if (parts.length === 3) {
      // HH:MM:SS
      return parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
    }
    if (parts.length === 4) {
      // DD-HH:MM:SS
      return parseInt(parts[0], 10) * 24 + parseInt(parts[1], 10) + parseInt(parts[2], 10) / 60;
    }
    return 0;
  }

  it('parses MM:SS', () => {
    const hours = parseElapsed('30:00');
    assert.ok(hours < 1);
  });

  it('parses HH:MM:SS', () => {
    const hours = parseElapsed('02:30:00');
    assert.equal(Math.floor(hours), 2);
  });

  it('parses DD-HH:MM:SS', () => {
    const hours = parseElapsed('1-06:00:00');
    assert.equal(hours, 30); // 1 day + 6 hours
  });

  it('returns 0 for empty', () => {
    assert.equal(parseElapsed(''), 0);
    assert.equal(parseElapsed(null), 0);
  });
});
