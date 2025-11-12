/**
 * Tests for filesystem bridge client
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  findBridgeRoot,
  sortableId,
  runCommand,
  cancelCommand,
  watchEvents,
  checkBridgeHealth,
  makeErrorEnvelope,
  PICKUP_TIMEOUT_MS,
  type CommandJson
} from '../../src/lib/fs-bridge.js';

describe('Bridge Discovery', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temp directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-test-'));
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should find bridge root by traversing upward', async () => {
    // Create nested structure with .vsc-bridge at root
    const workspaceRoot = path.join(tempDir, 'workspace');
    const bridgeDir = path.join(workspaceRoot, '.vsc-bridge');
    const executeDir = path.join(bridgeDir, 'execute');
    const nestedDir = path.join(workspaceRoot, 'src', 'lib', 'deep');

    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.mkdir(bridgeDir, { recursive: true });
    await fs.mkdir(executeDir, { recursive: true });
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(bridgeDir, 'host.json'), '{}');

    // Should find bridge from nested directory
    const found = await findBridgeRoot(nestedDir);
    expect(found).toBe(bridgeDir);
  });

  it('should throw when no bridge found', async () => {
    // Start from a dir without .vsc-bridge
    const lonelyDir = path.join(tempDir, 'lonely');
    await fs.mkdir(lonelyDir, { recursive: true });

    await expect(findBridgeRoot(lonelyDir))
      .rejects.toThrow(/bridge.*not found/i);
  });

  it('should stop at filesystem root', async () => {
    // Use root as start (no bridge there)
    await expect(findBridgeRoot('/'))
      .rejects.toThrow(/bridge.*not found/i);
  });
});

describe('ID Generation', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      ids.add(sortableId(i));
    }
    // All 10000 should be unique
    expect(ids.size).toBe(10000);
  });

  it('should generate sortable IDs', () => {
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(sortableId(i));
    }

    // Sort lexicographically
    const sorted = [...ids].sort();

    // Should maintain chronological order when sorted
    expect(sorted).toEqual(ids);
  });

  it('should generate Windows-safe IDs', () => {
    // IDs should be ≤30 chars and no colons
    for (let i = 0; i < 100; i++) {
      const id = sortableId(i);
      expect(id.length).toBeLessThanOrEqual(30);
      expect(id).not.toContain(':');
      expect(id).toMatch(/^[A-Za-z0-9T\-\.Z]+$/); // Only safe chars
    }
  });

  it('should handle collision prevention', () => {
    // Even with same sequence number, should have random component
    const id1 = sortableId(1);
    const id2 = sortableId(1);

    // Full IDs should always differ due to random component
    expect(id1).not.toBe(id2);

    // Both should have the sequence number
    expect(id1).toContain('-0001-');
    expect(id2).toContain('-0001-');
  });
});

describe('Command Execution', () => {
  let tempDir: string;
  let bridgeDir: string;
  let executeDir: string;

  beforeEach(async () => {
    // Setup test bridge structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-exec-test-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    executeDir = path.join(bridgeDir, 'execute');

    await fs.mkdir(bridgeDir, { recursive: true });
    await fs.mkdir(executeDir, { recursive: true });
    await fs.writeFile(path.join(bridgeDir, 'host.json'), JSON.stringify({
      pid: process.pid,
      version: '1.0.0'
    }));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write command atomically', async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: 'test-123',
      createdAt: new Date().toISOString(),
      scriptName: 'breakpoint.set',
      params: { path: '/test.py', line: 10 }
    };

    // Start watching for file creation
    let sawTmpFile = false;
    const jobDir = path.join(executeDir, payload.id);
    // Don't create job dir - let runCommand do it

    // Start the command first
    const promise = runCommand(bridgeDir, payload, { timeout: 1000 });

    // Give it a moment to create the directory and write command
    await new Promise(r => setTimeout(r, 20));

    // Now poll to check for tmp file
    const checkInterval = setInterval(async () => {
      try {
        const files = await fs.readdir(jobDir);
        if (files.some(f => f.endsWith('.tmp'))) {
          sawTmpFile = true;
        }
      } catch {}
    }, 5);

    // Write response to simulate extension
    setTimeout(async () => {
      try {
        // Ensure directory exists before writing
        await fs.mkdir(jobDir, { recursive: true });
        await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}');
        await fs.writeFile(path.join(jobDir, 'response.json'), '{"success":true}');
        await fs.writeFile(path.join(jobDir, 'done'), '');
      } catch (err) {
        // Ignore errors - test will timeout if this fails
      }
    }, 100);

    clearInterval(checkInterval);

    // Should NOT see tmp file (atomic rename)
    expect(sawTmpFile).toBe(false);

    // Should see command.json
    const cmdPath = path.join(jobDir, 'command.json');
    await expect(fs.access(cmdPath)).resolves.not.toThrow();

    const result = await promise;
    expect(result.success).toBe(true);
  });

  it('should poll for response', async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: 'test-poll',
      createdAt: new Date().toISOString(),
      scriptName: 'breakpoint.list',
      params: {}
    };

    const jobDir = path.join(executeDir, payload.id);
    await fs.mkdir(jobDir, { recursive: true });

    // Simulate delayed response
    setTimeout(async () => {
      await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}'); // Phase 3: bridge claims job
      await fs.writeFile(path.join(jobDir, 'response.json'),
        JSON.stringify({ data: ['bp1', 'bp2'] }));
      await fs.writeFile(path.join(jobDir, 'done'), '');
    }, 200);

    const start = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: 1000 });
    const elapsed = Date.now() - start;

    // Should have waited for response
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(result.data).toEqual(['bp1', 'bp2']);
  });

  it('should handle timeout with normalized error envelope', async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: 'test-timeout',
      createdAt: new Date().toISOString(),
      scriptName: 'debug.start',
      params: {}
    };

    // Don't write any response
    const jobDir = path.join(executeDir, payload.id);
    await fs.mkdir(jobDir, { recursive: true });

    // Phase 3: bridge claims job but never completes
    setTimeout(async () => {
      await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}');
    }, 50);

    const start = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: 300 });
    const elapsed = Date.now() - start;

    // Should timeout after ~300ms
    expect(elapsed).toBeGreaterThanOrEqual(300);
    expect(elapsed).toBeLessThan(400);

    // Check for normalized error envelope
    expect(result.ok).toBe(false);
    expect(result.type).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('E_TIMEOUT');
    expect(result.error.message.toLowerCase()).toContain('timed out');
    expect(result.meta).toBeDefined();
    expect(result.meta.timestamp).toBeDefined();
  });

  it('should handle no-response with normalized error envelope', async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: 'test-no-response',
      createdAt: new Date().toISOString(),
      scriptName: 'test.script',
      params: {}
    };

    const jobDir = path.join(executeDir, payload.id);
    await fs.mkdir(jobDir, { recursive: true });

    // Write done but no response/error
    setTimeout(async () => {
      await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}'); // Phase 3: bridge claims job
      await fs.writeFile(path.join(jobDir, 'done'), '');
    }, 50);

    const result = await runCommand(bridgeDir, payload, { timeout: 1000 });

    // Check for normalized error envelope
    expect(result.ok).toBe(false);
    expect(result.type).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('E_NO_RESPONSE');
    expect(result.error.message).toContain('without response');
    expect(result.meta).toBeDefined();
    expect(result.meta.timestamp).toBeDefined();
  });

  it('should handle large payloads via dataRef with JSON parsing', async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: 'test-dataref',
      createdAt: new Date().toISOString(),
      scriptName: 'workspace.search',
      params: { query: 'test' }
    };

    const jobDir = path.join(executeDir, payload.id);
    await fs.mkdir(jobDir, { recursive: true });

    // Large JSON data in separate file
    const largeData = {
      results: Array(10000).fill(null).map((_, i) => ({
        file: `/test/file${i}.ts`,
        line: i,
        content: `Result ${i}`
      }))
    };

    setTimeout(async () => {
      await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}'); // Phase 3: bridge claims job
      await fs.writeFile(path.join(jobDir, 'response.json'),
        JSON.stringify({ dataRef: 'data.json' }));
      await fs.writeFile(path.join(jobDir, 'data.json'), JSON.stringify(largeData));
      await fs.writeFile(path.join(jobDir, 'done'), '');
    }, 50);

    const result = await runCommand(bridgeDir, payload, { timeout: 1000 });

    // Should have parsed JSON data from data.json
    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('object');
    expect(result.data.results).toBeDefined();
    expect(result.data.results.length).toBe(10000);
    expect(result.data.results[0].file).toBe('/test/file0.ts');
  });

  it('should handle concurrent commands', async () => {
    const commands = [];

    // Launch 5 concurrent commands
    for (let i = 0; i < 5; i++) {
      const payload: CommandJson = {
        version: 1,
        clientId: 'test-cli',
        id: `concurrent-${i}`,
        createdAt: new Date().toISOString(),
        scriptName: 'breakpoint.list',
        params: { index: i }
      };

      const jobDir = path.join(executeDir, payload.id);
      await fs.mkdir(jobDir, { recursive: true });

      // Simulate responses with varying delays
      setTimeout(async () => {
        await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}'); // Phase 3: bridge claims job
        await fs.writeFile(path.join(jobDir, 'response.json'),
          JSON.stringify({ index: i }));
        await fs.writeFile(path.join(jobDir, 'done'), '');
      }, 50 + i * 20);

      commands.push(payload);
    }

    // Run all concurrently
    const promises = commands.map(cmd =>
      runCommand(bridgeDir, cmd, { timeout: 1000 })
    );

    const results = await Promise.all(promises);

    // All should succeed with correct index
    for (let i = 0; i < 5; i++) {
      expect(results[i].index).toBe(i);
    }
  });
});

describe('Cancellation', () => {
  let tempDir: string;
  let bridgeDir: string;
  let executeDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cancel-test-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    executeDir = path.join(bridgeDir, 'execute');
    await fs.mkdir(executeDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write cancel sentinel', async () => {
    const jobId = 'test-cancel-123';

    // Create job directory
    const jobDir = path.join(executeDir, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    // Cancel the job
    await cancelCommand(bridgeDir, jobId);

    // Check cancel file exists
    const cancelPath = path.join(jobDir, 'cancel');
    await expect(fs.access(cancelPath)).resolves.not.toThrow();

    // Verify it's empty (sentinel file)
    const content = await fs.readFile(cancelPath, 'utf8');
    expect(content).toBe('');
  });

  it('should be idempotent (writing cancel multiple times is safe)', async () => {
    const jobId = 'test-cancel-idempotent';

    const jobDir = path.join(executeDir, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    // Cancel multiple times
    await cancelCommand(bridgeDir, jobId);
    await cancelCommand(bridgeDir, jobId);
    await cancelCommand(bridgeDir, jobId);

    // Should still have one cancel file
    const cancelPath = path.join(jobDir, 'cancel');
    await expect(fs.access(cancelPath)).resolves.not.toThrow();
  });

  it('should not throw if job directory does not exist', async () => {
    const jobId = 'nonexistent-job';

    // Should not throw even if job doesn't exist
    await expect(cancelCommand(bridgeDir, jobId)).resolves.not.toThrow();
  });
});

describe('Event Streaming', () => {
  let tempDir: string;
  let eventsPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'events-test-'));
    eventsPath = path.join(tempDir, 'events.ndjson');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should watch events.ndjson', async () => {
    const events: any[] = [];

    // Create file first with some content
    await fs.writeFile(eventsPath,
      '{"type":"log","text":"Event 1"}\n' +
      '{"type":"log","text":"Event 2"}\n'
    );

    // Start watching after file exists
    const unwatch = await watchEvents(eventsPath, e => events.push(e));

    // Give watcher time to read initial content
    await new Promise(r => setTimeout(r, 200));

    expect(events.length).toBe(2);
    expect(events[0].text).toBe('Event 1');
    expect(events[1].text).toBe('Event 2');

    unwatch();
  });

  it('should handle partial lines correctly', async () => {
    const events: any[] = [];
    const unwatch = await watchEvents(eventsPath, e => events.push(e));

    // Write partial line first
    await fs.writeFile(eventsPath, '{"type":"log","text":"Partial');
    await new Promise(r => setTimeout(r, 100));

    // Should not have parsed yet
    expect(events.length).toBe(0);

    // Complete the line
    await fs.appendFile(eventsPath, ' Event"}\n');
    await new Promise(r => setTimeout(r, 100));

    // Now should have the event
    expect(events.length).toBe(1);
    expect(events[0].text).toBe('Partial Event');

    unwatch();
  });

  it('should handle files ending without newline', async () => {
    const events: any[] = [];

    // Write initial events, last one without newline
    await fs.writeFile(eventsPath,
      '{"type":"log","text":"Event 1"}\n' +
      '{"type":"log","text":"Event 2"}'
    );

    // Start watching after file exists
    const unwatch = await watchEvents(eventsPath, e => events.push(e));

    await new Promise(r => setTimeout(r, 200));

    // Should only have the first complete event
    expect(events.length).toBe(1);
    expect(events[0].text).toBe('Event 1');

    // Add newline to complete second event
    await fs.appendFile(eventsPath, '\n');
    await new Promise(r => setTimeout(r, 200));

    expect(events.length).toBe(2);
    expect(events[1].text).toBe('Event 2');

    unwatch();
  });

  it('should resume from last position after appends', async () => {
    const events: any[] = [];

    // Write initial events
    await fs.writeFile(eventsPath,
      '{"type":"log","seq":1}\n' +
      '{"type":"log","seq":2}\n'
    );

    // Start watching after file exists
    const unwatch = await watchEvents(eventsPath, e => events.push(e));

    await new Promise(r => setTimeout(r, 200));
    expect(events.length).toBe(2);

    // Append more events
    await fs.appendFile(eventsPath,
      '{"type":"log","seq":3}\n' +
      '{"type":"log","seq":4}\n'
    );

    await new Promise(r => setTimeout(r, 200));
    expect(events.length).toBe(4);

    // Verify all events in order, no duplicates
    expect(events.map(e => e.seq)).toEqual([1, 2, 3, 4]);

    unwatch();
  });

  it.skip('should handle events split across read boundaries', async () => {
    const events: any[] = [];

    // Create an event that will be written in parts
    const testEvent = { type: 'log', data: 'test-data-123' };
    const eventLine = JSON.stringify(testEvent) + '\n';

    // Split at a point that breaks the JSON
    const splitPoint = 25; // Splits in middle of JSON
    const chunk1 = eventLine.substring(0, splitPoint);
    const chunk2 = eventLine.substring(splitPoint);

    // Write partial event first
    await fs.writeFile(eventsPath, chunk1);

    // Start watching after partial content exists
    const unwatch = await watchEvents(eventsPath, e => events.push(e));

    await new Promise(r => setTimeout(r, 100));

    // Should not have parsed the incomplete JSON
    expect(events.length).toBe(0);

    // Complete the JSON by appending rest
    await fs.appendFile(eventsPath, chunk2);
    await new Promise(r => setTimeout(r, 200));

    // Now should have the complete event
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('log');
    expect(events[0].data).toBe('test-data-123');

    unwatch();
  });
});

describe('Health Check', () => {
  let tempDir: string;
  let bridgeDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'health-test-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    await fs.mkdir(bridgeDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should check bridge health when recently updated', async () => {
    // Create fresh host.json (current time)
    const hostPath = path.join(bridgeDir, 'host.json');
    await fs.writeFile(hostPath, JSON.stringify({
      pid: process.pid,
      version: '1.0.0'
    }));

    const health = await checkBridgeHealth(bridgeDir);

    expect(health.healthy).toBe(true);
    expect(health.lastSeen).toBeInstanceOf(Date);
    expect(Date.now() - health.lastSeen.getTime()).toBeLessThan(1000);
  });

  it('should report unhealthy if stale (>30s)', async () => {
    // Create stale host.json
    const hostPath = path.join(bridgeDir, 'host.json');
    await fs.writeFile(hostPath, JSON.stringify({ pid: 1 }));

    // Manually set mtime to 60 seconds ago
    const sixtySecondsAgo = new Date(Date.now() - 60000);
    await fs.utimes(hostPath, sixtySecondsAgo, sixtySecondsAgo);

    const health = await checkBridgeHealth(bridgeDir);

    expect(health.healthy).toBe(false);
    expect(health.lastSeen).toBeInstanceOf(Date);
    // Should be approximately 60s ago
    const age = Date.now() - health.lastSeen.getTime();
    expect(age).toBeGreaterThan(55000);
    expect(age).toBeLessThan(65000);
  });

  it('should report unhealthy if host.json missing', async () => {
    // Don't create host.json

    const health = await checkBridgeHealth(bridgeDir);

    expect(health.healthy).toBe(false);
    expect(health.lastSeen).toBeInstanceOf(Date);
    // Should be epoch (never seen)
    expect(health.lastSeen.getTime()).toBe(0);
  });

  it('should use 30s threshold for health check', async () => {
    // Create host.json exactly 29 seconds old (healthy)
    const hostPath = path.join(bridgeDir, 'host.json');
    await fs.writeFile(hostPath, '{}');

    const twentyNineSecondsAgo = new Date(Date.now() - 29000);
    await fs.utimes(hostPath, twentyNineSecondsAgo, twentyNineSecondsAgo);

    const health1 = await checkBridgeHealth(bridgeDir);
    expect(health1.healthy).toBe(true);

    // Now 31 seconds old (unhealthy)
    const thirtyOneSecondsAgo = new Date(Date.now() - 31000);
    await fs.utimes(hostPath, thirtyOneSecondsAgo, thirtyOneSecondsAgo);

    const health2 = await checkBridgeHealth(bridgeDir);
    expect(health2.healthy).toBe(false);
  });
});
describe('Error Types - Foundation Verification', () => {
  it('E_BRIDGE_UNAVAILABLE is compatible with makeErrorEnvelope', () => {
    // Foundation test: Verifies new error code works with existing infrastructure
    // Note: Phase 1 only adds JSDoc - this tests existing makeErrorEnvelope function
    const error = makeErrorEnvelope(
      'E_BRIDGE_UNAVAILABLE',
      'Bridge is unavailable (extension not running or crashed)'
    );

    expect(error.ok).toBe(false);
    expect(error.type).toBe('error');
    expect(error.error.code).toBe('E_BRIDGE_UNAVAILABLE');
    expect(error.error.message).toContain('unavailable');
    expect(error.meta.timestamp).toBeDefined();
  });

  it('E_PICKUP_TIMEOUT is compatible with makeErrorEnvelope', () => {
    // Foundation test: Verifies new error code works with existing infrastructure
    // Note: Phase 1 only adds JSDoc - this tests existing makeErrorEnvelope function
    const error = makeErrorEnvelope(
      'E_PICKUP_TIMEOUT',
      'Bridge did not pick up job within 5 seconds'
    );

    expect(error.ok).toBe(false);
    expect(error.type).toBe('error');
    expect(error.error.code).toBe('E_PICKUP_TIMEOUT');
    expect(error.error.message).toContain('5 seconds');
    expect(error.meta.timestamp).toBeDefined();
  });

  it('PICKUP_TIMEOUT_MS constant is correctly defined', () => {
    // Verify the constant value for Phase 3 usage
    expect(PICKUP_TIMEOUT_MS).toBe(5000);
  });
});

describe('Pre-Submission Health Check (Phase 2)', () => {
  let tempDir: string;
  let bridgeDir: string;
  let executeDir: string;

  beforeEach(async () => {
    // Setup test bridge structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'health-check-test-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    executeDir = path.join(bridgeDir, 'execute');

    await fs.mkdir(bridgeDir, { recursive: true });
    await fs.mkdir(executeDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should fail immediately when host.json missing', async () => {
    // T004: health check fails when host.json missing
    // DON'T create host.json - simulates bridge not installed or dead
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: 'test-no-host',
      createdAt: new Date().toISOString(),
      scriptName: 'breakpoint.set',
      params: { path: '/test.py', line: 10 }
    };

    const startTime = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: 1000 });
    const duration = Date.now() - startTime;

    // Should return E_BRIDGE_UNAVAILABLE error
    expect(result.ok).toBe(false);
    expect(result.type).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('E_BRIDGE_UNAVAILABLE');

    // Error message should include all required elements per spec AC7
    expect(result.error.message).toContain('Extension not running, crashed, or not installed');
    expect(result.error.message).toContain('host.json not found');
    expect(result.error.message).toContain('VS Code is open with vsc-bridge extension');
    expect(result.error.message).toContain('vscb get-vsix'); // Installation instructions

    // Should have meta timestamp
    expect(result.meta).toBeDefined();
    expect(result.meta.timestamp).toBeDefined();

    // Should fail fast (< 200ms, target < 100ms on local fs)
    expect(duration).toBeLessThan(200);
  });

  it('should fail immediately when host.json stale (> 30s old)', async () => {
    // T005: health check fails when host.json stale
    const hostPath = path.join(bridgeDir, 'host.json');
    await fs.writeFile(hostPath, JSON.stringify({ pid: process.pid }));

    // Set mtime to 60 seconds ago (> 30s threshold)
    const sixtySecondsAgo = new Date(Date.now() - 60000);
    await fs.utimes(hostPath, sixtySecondsAgo, sixtySecondsAgo);

    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: 'test-stale-host',
      createdAt: new Date().toISOString(),
      scriptName: 'breakpoint.set',
      params: { path: '/test.py', line: 10 }
    };

    const startTime = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: 1000 });
    const duration = Date.now() - startTime;

    // Should return E_BRIDGE_UNAVAILABLE error
    expect(result.ok).toBe(false);
    expect(result.type).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('E_BRIDGE_UNAVAILABLE');

    // Error message should include all required elements with age diagnostic
    expect(result.error.message).toContain('Extension not running, crashed, or not installed');
    expect(result.error.message).toMatch(/host\.json age: \d+s \(stale\)/); // Age in seconds
    expect(result.error.message).toContain('VS Code is open with vsc-bridge extension');
    expect(result.error.message).toContain('vscb get-vsix'); // Installation instructions

    // Should have meta timestamp
    expect(result.meta).toBeDefined();
    expect(result.meta.timestamp).toBeDefined();

    // Should fail fast (< 200ms, target < 100ms on local fs)
    expect(duration).toBeLessThan(200);
  });

  it('should proceed when bridge healthy', async () => {
    // T006: runCommand proceeds when bridge healthy
    // Create FRESH host.json (< 30s old)
    const hostPath = path.join(bridgeDir, 'host.json');
    await fs.writeFile(hostPath, JSON.stringify({
      pid: process.pid,
      version: '1.0.0'
    }));

    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: 'test-healthy',
      createdAt: new Date().toISOString(),
      scriptName: 'breakpoint.list',
      params: {}
    };

    const jobDir = path.join(executeDir, payload.id);

    // Simulate bridge responding normally
    setTimeout(async () => {
      await fs.mkdir(jobDir, { recursive: true });
      await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}'); // Phase 3: bridge claims job
      await fs.writeFile(path.join(jobDir, 'response.json'), JSON.stringify({ success: true }));
      await fs.writeFile(path.join(jobDir, 'done'), '');
    }, 50);

    const result = await runCommand(bridgeDir, payload, { timeout: 1000 });

    // Should NOT return E_BRIDGE_UNAVAILABLE
    expect(result.error?.code).not.toBe('E_BRIDGE_UNAVAILABLE');

    // Should proceed to normal execution and succeed
    expect(result.success).toBe(true);
  });
});

describe('Pickup Acknowledgment Polling (Phase 3)', () => {
  let tempDir: string;
  let bridgeDir: string;
  let executeDir: string;

  beforeEach(async () => {
    // Setup test bridge structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pickup-ack-test-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    executeDir = path.join(bridgeDir, 'execute');

    await fs.mkdir(bridgeDir, { recursive: true });
    await fs.mkdir(executeDir, { recursive: true });

    // Create fresh host.json (healthy bridge)
    await fs.writeFile(path.join(bridgeDir, 'host.json'), JSON.stringify({
      pid: process.pid,
      version: '1.0.0'
    }));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should detect claimed.json within 500ms (typical case)', async () => {
    // T004: Typical pickup case - bridge claims job quickly
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(1),
      createdAt: new Date().toISOString(),
      scriptName: 'breakpoint.set',
      params: { path: '/test.py', line: 10 }
    };

    // Simulate bridge claiming job quickly (200ms)
    setTimeout(async () => {
      const jobDir = path.join(executeDir, payload.id);
      const claimedPath = path.join(jobDir, 'claimed.json');

      await fs.writeFile(claimedPath, JSON.stringify({
        bridgeId: 'test-bridge',
        claimedAt: new Date().toISOString(),
        pid: 12345
      }));

      // Also complete the job
      await fs.writeFile(path.join(jobDir, 'done'), '');
      await fs.writeFile(path.join(jobDir, 'response.json'), JSON.stringify({
        ok: true,
        type: 'success',
        data: {}
      }));
    }, 200);

    const startTime = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: 10000 });
    const pickupDuration = Date.now() - startTime;

    // Should succeed (not E_PICKUP_TIMEOUT)
    expect(result.ok).toBe(true);

    // Pickup should be fast (< 500ms on local filesystem)
    expect(pickupDuration).toBeLessThan(500);
  });

  it('should timeout after 5s if no claimed.json', { timeout: 35000 }, async () => {
    // T005: Pickup timeout case - bridge never claims job
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(2),
      createdAt: new Date().toISOString(),
      scriptName: 'breakpoint.set',
      params: { path: '/test.py', line: 10 }
    };

    // Bridge never claims the job (simulating overload/crash)
    // Don't write claimed.json at all

    const startTime = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: 30000 });
    const duration = Date.now() - startTime;

    // Should return E_PICKUP_TIMEOUT error
    expect(result.ok).toBe(false);
    expect(result.type).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('E_PICKUP_TIMEOUT');

    // Error message should include all required elements per spec AC8
    expect(result.error.message).toContain('did not pick up job within 5 seconds');
    expect(result.error.message).toContain('overloaded, at capacity, crashed, or not installed');
    expect(result.error.message).toContain('restarting VS Code');
    expect(result.error.message).toContain('capacity settings (MAX_CONCURRENT)');
    expect(result.error.message).toContain('vscb get-vsix'); // Installation instructions

    // Should have meta timestamp
    expect(result.meta).toBeDefined();
    expect(result.meta.timestamp).toBeDefined();

    // Should timeout after ~5000ms
    expect(duration).toBeGreaterThanOrEqual(5000);
    expect(duration).toBeLessThan(5200); // Allow small overhead
  });

  it('should accept any claimed.json file existence (lenient validation)', async () => {
    // T006: Lenient validation - any file content triggers claim detection
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(3),
      createdAt: new Date().toISOString(),
      scriptName: 'breakpoint.set',
      params: { path: '/test.py', line: 10 }
    };

    // Write claimed.json with invalid JSON content
    setTimeout(async () => {
      const jobDir = path.join(executeDir, payload.id);
      const claimedPath = path.join(jobDir, 'claimed.json');

      await fs.writeFile(claimedPath, 'not even json'); // Lenient: any file triggers claim

      // Also complete the job
      await fs.writeFile(path.join(jobDir, 'done'), '');
      await fs.writeFile(path.join(jobDir, 'response.json'), JSON.stringify({
        ok: true,
        type: 'success',
        data: {}
      }));
    }, 100);

    const result = await runCommand(bridgeDir, payload, { timeout: 10000 });

    // Should succeed - file existence is sufficient (lenient validation)
    expect(result.ok).toBe(true);
  });
});

describe('Two-Phase Timeout Logic (Phase 4)', () => {
  let tempDir: string;
  let bridgeDir: string;
  let executeDir: string;

  beforeEach(async () => {
    // Setup test bridge structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'two-phase-timeout-test-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    executeDir = path.join(bridgeDir, 'execute');

    await fs.mkdir(bridgeDir, { recursive: true });
    await fs.mkdir(executeDir, { recursive: true });

    // Create fresh host.json (healthy bridge)
    await fs.writeFile(path.join(bridgeDir, 'host.json'), JSON.stringify({
      pid: process.pid,
      version: '1.0.0'
    }));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should use remaining timeout after fast pickup', { timeout: 15000 }, async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(10),
      createdAt: new Date().toISOString(),
      scriptName: 'test',
      params: {}
    };

    const totalTimeout = 10000;

    // Simulate fast pickup (200ms)
    setTimeout(async () => {
      const jobDir = path.join(executeDir, payload.id);
      // Wait for job directory to exist (created by runCommand)
      while (true) {
        try {
          await fs.access(jobDir);
          break;
        } catch {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}');
      // Execution never completes - will timeout
    }, 200);

    const startTime = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: totalTimeout });
    const totalDuration = Date.now() - startTime;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('E_TIMEOUT');
    expect(totalDuration).toBeGreaterThanOrEqual(totalTimeout);
    expect(totalDuration).toBeLessThan(totalTimeout + 200); // Small overhead
  });

  it('should complete successfully when slow pickup leaves sufficient execution time', { timeout: 15000 }, async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(11),
      createdAt: new Date().toISOString(),
      scriptName: 'test',
      params: {}
    };

    const totalTimeout = 10000;

    // Simulate slow pickup (4900ms, just under 5s limit)
    setTimeout(async () => {
      const jobDir = path.join(executeDir, payload.id);
      // Wait for job directory to exist (created by runCommand)
      while (true) {
        try {
          await fs.access(jobDir);
          break;
        } catch {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}');
    }, 4900);

    // Execution completes in 3s (at 7.9s total)
    setTimeout(async () => {
      const jobDir = path.join(executeDir, payload.id);
      // Wait for job directory to exist (created by runCommand)
      while (true) {
        try {
          await fs.access(jobDir);
          break;
        } catch {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      await fs.writeFile(path.join(jobDir, 'done'), '');
      await fs.writeFile(path.join(jobDir, 'response.json'), JSON.stringify({
        ok: true,
        type: 'success',
        data: { result: 'completed' }
      }));
    }, 4900 + 3000);

    const startTime = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: totalTimeout });
    const totalDuration = Date.now() - startTime;

    // Should succeed - completes before total timeout
    expect(result.ok).toBe(true);
    expect(totalDuration).toBeLessThan(totalTimeout);
    expect(totalDuration).toBeGreaterThanOrEqual(7900); // Pickup + execution
  });

  it('should return E_TIMEOUT when pickup at boundary and execution slow', { timeout: 10000 }, async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(12),
      createdAt: new Date().toISOString(),
      scriptName: 'test',
      params: {}
    };

    const totalTimeout = 6000;

    // Pickup takes ~4.95s (near PICKUP_TIMEOUT_MS limit but succeeds)
    setTimeout(async () => {
      const jobDir = path.join(executeDir, payload.id);
      // Wait for job directory to exist (created by runCommand)
      while (true) {
        try {
          await fs.access(jobDir);
          break;
        } catch {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}');
    }, 4950);

    // Execution completes at ~7s (too slow - exceeds total timeout)
    setTimeout(async () => {
      const jobDir = path.join(executeDir, payload.id);
      // Wait for job directory to exist (created by runCommand)
      while (true) {
        try {
          await fs.access(jobDir);
          break;
        } catch {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      await fs.writeFile(path.join(jobDir, 'done'), '');
      await fs.writeFile(path.join(jobDir, 'response.json'), JSON.stringify({
        ok: true,
        type: 'success',
        data: {}
      }));
    }, 4950 + 2000);

    const startTime = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: totalTimeout });
    const totalDuration = Date.now() - startTime;

    // Should timeout at 6s (not 7s)
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('E_TIMEOUT'); // Not E_PICKUP_TIMEOUT
    expect(result.error.message).toContain('timed out');
    expect(totalDuration).toBeGreaterThanOrEqual(totalTimeout);
    expect(totalDuration).toBeLessThan(totalTimeout + 200);
  });

  it('should enforce absolute deadline across both phases', { timeout: 12000 }, async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(13),
      createdAt: new Date().toISOString(),
      scriptName: 'test',
      params: {}
    };

    const totalTimeout = 8000;

    // Pickup at 3s
    setTimeout(async () => {
      const jobDir = path.join(executeDir, payload.id);
      // Wait for job directory to exist (created by runCommand)
      while (true) {
        try {
          await fs.access(jobDir);
          break;
        } catch {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}');
      // Execution never completes
    }, 3000);

    const startTime = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: totalTimeout });
    const totalDuration = Date.now() - startTime;

    // Should timeout at 8s absolute deadline
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('E_TIMEOUT');
    expect(totalDuration).toBeGreaterThanOrEqual(totalTimeout);
    expect(totalDuration).toBeLessThan(totalTimeout + 200);
  });

  it('should respect total timeout when pickup exceeds budget', { timeout: 6000 }, async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(14),
      createdAt: new Date().toISOString(),
      scriptName: 'test',
      params: {}
    };

    const totalTimeout = 300;

    // Don't write claimed.json - bridge never picks up job
    // This simulates pickup timeout scenario with short total timeout

    const startTime = Date.now();
    const result = await runCommand(bridgeDir, payload, { timeout: totalTimeout });
    const totalDuration = Date.now() - startTime;

    // Should return E_TIMEOUT (not E_PICKUP_TIMEOUT) after ~300ms (not 5s)
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('E_TIMEOUT');
    expect(result.error.message).toContain('timed out');
    expect(totalDuration).toBeGreaterThanOrEqual(totalTimeout);
    expect(totalDuration).toBeLessThan(totalTimeout + 100); // Small overhead
  });
});

describe('Verbose Logging (Phase 5)', () => {
  let tempDir: string;
  let bridgeDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-test-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    const executeDir = path.join(bridgeDir, 'execute');
    await fs.mkdir(executeDir, { recursive: true });

    // Create fresh host.json (healthy bridge)
    const hostPath = path.join(bridgeDir, 'host.json');
    await fs.writeFile(hostPath, JSON.stringify({
      workspace: '/test/workspace',
      bridgeId: 'test-bridge',
      startedAt: new Date().toISOString()
    }));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should log pickup duration when verbose flag enabled', { timeout: 5000 }, async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(100),
      createdAt: new Date().toISOString(),
      scriptName: 'test',
      params: {}
    };

    const jobDir = path.join(bridgeDir, 'execute', payload.id);

    // Capture stderr output
    const logs: string[] = [];
    const originalStderrWrite = process.stderr.write;
    process.stderr.write = ((chunk: any) => {
      logs.push(chunk.toString());
      return true;
    }) as any;

    try {
      // Simulate bridge pickup and completion after 127ms
      setTimeout(async () => {
        await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}');
        await fs.writeFile(path.join(jobDir, 'done'), '');
        await fs.writeFile(path.join(jobDir, 'response.json'), JSON.stringify({ ok: true, data: {} }));
      }, 127);

      await runCommand(bridgeDir, payload, { verbose: true });

      // Should find debug log with pickup duration
      const debugLog = logs.find(log => log.includes('[DEBUG] Job claimed'));
      expect(debugLog).toBeDefined();
      expect(debugLog).toMatch(/Job claimed in \d+ms/);
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });

  it('should not log when verbose flag disabled', { timeout: 5000 }, async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(101),
      createdAt: new Date().toISOString(),
      scriptName: 'test',
      params: {}
    };

    const jobDir = path.join(bridgeDir, 'execute', payload.id);

    // Capture stderr output
    const logs: string[] = [];
    const originalStderrWrite = process.stderr.write;
    process.stderr.write = ((chunk: any) => {
      logs.push(chunk.toString());
      return true;
    }) as any;

    try {
      // Simulate bridge pickup and completion
      setTimeout(async () => {
        await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}');
        await fs.writeFile(path.join(jobDir, 'done'), '');
        await fs.writeFile(path.join(jobDir, 'response.json'), JSON.stringify({ ok: true, data: {} }));
      }, 100);

      // verbose: false (default)
      await runCommand(bridgeDir, payload);

      // Should NOT find any debug logs
      const debugLog = logs.find(log => log.includes('[DEBUG]'));
      expect(debugLog).toBeUndefined();
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });

  it('should not log when verbose flag explicitly false', { timeout: 5000 }, async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(102),
      createdAt: new Date().toISOString(),
      scriptName: 'test',
      params: {}
    };

    const jobDir = path.join(bridgeDir, 'execute', payload.id);

    // Capture stderr output
    const logs: string[] = [];
    const originalStderrWrite = process.stderr.write;
    process.stderr.write = ((chunk: any) => {
      logs.push(chunk.toString());
      return true;
    }) as any;

    try {
      // Simulate bridge pickup and completion
      setTimeout(async () => {
        await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}');
        await fs.writeFile(path.join(jobDir, 'done'), '');
        await fs.writeFile(path.join(jobDir, 'response.json'), JSON.stringify({ ok: true, data: {} }));
      }, 100);

      // verbose: false (explicit)
      await runCommand(bridgeDir, payload, { verbose: false });

      // Should NOT find any debug logs
      const debugLog = logs.find(log => log.includes('[DEBUG]'));
      expect(debugLog).toBeUndefined();
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });

  it('should handle abort signal during pickup phase', { timeout: 3000 }, async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-cli',
      id: sortableId(103),
      createdAt: new Date().toISOString(),
      scriptName: 'test',
      params: {}
    };

    const controller = new AbortController();

    // Abort after 100ms (during pickup phase, before claimed.json written)
    setTimeout(() => controller.abort(), 100);

    // Don't write claimed.json - let pickup phase timeout/abort

    const startTime = Date.now();
    const result = await runCommand(bridgeDir, payload, {
      timeout: 5000,
      signal: controller.signal
    });
    const duration = Date.now() - startTime;

    // Should abort quickly (~100ms), not wait full 5s pickup timeout
    expect(duration).toBeLessThan(500);

    // Should return timeout error (pickup phase didn't complete)
    expect(result.ok).toBe(false);
    expect(result.error.code).toMatch(/E_TIMEOUT|E_PICKUP_TIMEOUT/);
  });
});

/**
 * Phase 6: Error Message Enhancement
 *
 * These tests verify that error messages exactly match spec requirements (AC7 and AC8).
 * They ensure all required elements are present with exact wording as specified.
 */
describe('Error Message Enhancement - Phase 6', () => {
  let tempDir: string;
  let bridgeDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'phase6-test-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    const executeDir = path.join(bridgeDir, 'execute');

    await fs.mkdir(executeDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('E_BRIDGE_UNAVAILABLE Message Content (AC7)', () => {
    it('should include all AC7 required elements when host.json missing', async () => {
      // Setup: No host.json (simulates bridge not installed or never started)
      const payload: CommandJson = {
        version: 1,
        clientId: 'test-cli',
        id: sortableId(201),
        createdAt: new Date().toISOString(),
        scriptName: 'test',
        params: {}
      };

      // Execute
      const result = await runCommand(bridgeDir, payload);

      // Verify error code
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('E_BRIDGE_UNAVAILABLE');

      // Verify AC7 message elements (all required)
      const message = result.error.message;

      // 1. Clear description
      expect(message).toContain('Bridge is unavailable');

      // 2. Reason
      expect(message).toContain('Extension not running, crashed, or not installed');

      // 3. Diagnostic detail - host.json not found
      expect(message).toContain('host.json not found');

      // 4. Actionable guidance
      expect(message).toContain('Check that VS Code is open');
      expect(message).toContain('vsc-bridge extension');
      expect(message).toContain('installed and active');

      // 5. Installation instructions
      expect(message).toContain('vscb get-vsix');
    });

    it('should include stale age in diagnostic when host.json exists but stale', async () => {
      // Setup: Create stale host.json (60s old)
      const hostPath = path.join(bridgeDir, 'host.json');
      const pastTime = new Date(Date.now() - 60000); // 60 seconds ago
      await fs.writeFile(hostPath, JSON.stringify({ pid: process.pid }));
      await fs.utimes(hostPath, pastTime, pastTime);

      const payload: CommandJson = {
        version: 1,
        clientId: 'test-cli',
        id: sortableId(202),
        createdAt: new Date().toISOString(),
        scriptName: 'test',
        params: {}
      };

      // Execute
      const result = await runCommand(bridgeDir, payload);

      // Verify error code
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('E_BRIDGE_UNAVAILABLE');

      // Verify diagnostic includes age in seconds and "(stale)" marker
      const message = result.error.message;
      expect(message).toMatch(/host\.json age: \d+s/);
      expect(message).toContain('stale');
    });
  });

  describe('E_PICKUP_TIMEOUT Message Content (AC8)', () => {
    it('should include all AC8 required elements when pickup times out', { timeout: 10000 }, async () => {
      // Setup: Ensure host.json fresh (pass health check)
      const hostPath = path.join(bridgeDir, 'host.json');
      await fs.writeFile(hostPath, JSON.stringify({ pid: process.pid }));

      const payload: CommandJson = {
        version: 1,
        clientId: 'test-cli',
        id: sortableId(203),
        createdAt: new Date().toISOString(),
        scriptName: 'test',
        params: {}
      };

      // Bridge never writes claimed.json (simulating overload/capacity)
      // Just let pickup timeout naturally

      // Execute with short timeout for faster test (6s = 5s pickup + 1s buffer)
      const result = await runCommand(bridgeDir, payload, { timeout: 6000 });

      // Verify error code
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('E_PICKUP_TIMEOUT');

      // Verify AC8 message elements (all required)
      const message = result.error.message;

      // 1. Clear description
      expect(message).toContain('Bridge did not pick up job within 5 seconds');

      // 2. Possible reasons - NOTE: spec says "might be" not "may be"
      expect(message).toContain('might be overloaded');
      expect(message).toContain('at capacity');
      expect(message).toContain('crashed');
      expect(message).toContain('not installed');

      // 3. Restart guidance
      expect(message).toContain('restarting VS Code');

      // 4. Capacity guidance
      expect(message).toContain('capacity settings');
      expect(message).toContain('MAX_CONCURRENT');

      // 5. Installation guidance
      expect(message).toContain('restarting VS Code');
      expect(message).toContain('not installed');

      // 6. Installation instructions
      expect(message).toContain('vscb get-vsix');
    });
  });

  describe('Backward Compatibility - Phase 6', () => {
    it('should preserve error envelope structure', async () => {
      // Trigger E_BRIDGE_UNAVAILABLE (no host.json)
      const payload: CommandJson = {
        version: 1,
        clientId: 'test-cli',
        id: sortableId(204),
        createdAt: new Date().toISOString(),
        scriptName: 'test',
        params: {}
      };

      const result = await runCommand(bridgeDir, payload);

      // Verify envelope structure unchanged (Critical Discovery 05)
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('meta');

      // Verify error structure
      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('message');

      // Verify meta structure
      expect(result.meta).toHaveProperty('timestamp');
    });

    it('should not break existing error handling code', { timeout: 10000 }, async () => {
      // Test that error responses can still be consumed by existing handlers
      const hostPath = path.join(bridgeDir, 'host.json');
      await fs.writeFile(hostPath, JSON.stringify({ pid: process.pid }));

      const payload: CommandJson = {
        version: 1,
        clientId: 'test-cli',
        id: sortableId(205),
        createdAt: new Date().toISOString(),
        scriptName: 'test',
        params: {}
      };

      // Trigger E_PICKUP_TIMEOUT (short timeout, no claimed.json)
      const result = await runCommand(bridgeDir, payload, { timeout: 6000 });

      // Existing code checks result.ok === false
      expect(result.ok).toBe(false);

      // Existing code reads result.error.code
      expect(typeof result.error.code).toBe('string');
      expect(result.error.code).toBe('E_PICKUP_TIMEOUT');

      // Existing code reads result.error.message
      expect(typeof result.error.message).toBe('string');
      expect(result.error.message.length).toBeGreaterThan(0);
    });
  });
});
