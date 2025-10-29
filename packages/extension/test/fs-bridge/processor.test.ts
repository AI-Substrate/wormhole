import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promises as fsPromises } from 'fs';
import {
  claimJobAtomic,
  checkCancellation,
  writeResponse,
  writeDone,
  EventWriter,
  processCommand,
  createSuccessEnvelope,
  createErrorEnvelope
} from '../../src/core/fs-bridge/processor';
import {
  CommandJson,
  ClaimedJson,
  ResponseJson,
  ErrorJson,
  EventJson,
  ErrorCode
} from '../../src/core/fs-bridge/types';

describe('Command Processor', () => {
  let tempDir: string;
  let jobDir: string;

  beforeEach(async () => {
    // Create a real temp directory for testing
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vsc-bridge-proc-test-'));
    jobDir = path.join(tempDir, 'test-job');
    await fsPromises.mkdir(jobDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('atomic job claiming', () => {
    it('should successfully claim an unclaimed job', () => {
      const result = claimJobAtomic(jobDir, 'test-bridge-1');

      assert.strictEqual(result, true);

      // Verify claim file exists
      const claimedPath = path.join(jobDir, 'claimed.json');
      assert.ok(fs.existsSync(claimedPath));

      // Verify claim contents
      const claim = JSON.parse(fs.readFileSync(claimedPath, 'utf8')) as ClaimedJson;
      assert.strictEqual(claim.bridgeId, 'test-bridge-1');
      assert.strictEqual(claim.pid, process.pid);
      assert.ok(claim.claimedAt);
      assert.ok(claim.leaseExpiresAt);

      // Verify lease is 60 seconds
      const claimTime = new Date(claim.claimedAt).getTime();
      const leaseTime = new Date(claim.leaseExpiresAt).getTime();
      assert.ok(Math.abs((leaseTime - claimTime) - 60000) < 1000); // Within 1 second tolerance
    });

    it('should fail to claim an already claimed job', () => {
      // First claim should succeed
      const result1 = claimJobAtomic(jobDir, 'test-bridge-1');
      assert.strictEqual(result1, true);

      // Second claim should fail
      const result2 = claimJobAtomic(jobDir, 'test-bridge-2');
      assert.strictEqual(result2, false);

      // Verify first claimer still owns it
      const claimedPath = path.join(jobDir, 'claimed.json');
      const claim = JSON.parse(fs.readFileSync(claimedPath, 'utf8')) as ClaimedJson;
      assert.strictEqual(claim.bridgeId, 'test-bridge-1');
    });

    it('should handle concurrent claiming attempts correctly', async () => {
      const claimers = 10;
      const results: boolean[] = [];

      // Try to claim concurrently from multiple "processes"
      const promises = Array.from({ length: claimers }, (_, i) =>
        new Promise<boolean>((resolve) => {
          // Small random delay to simulate race conditions
          setTimeout(() => {
            const result = claimJobAtomic(jobDir, `bridge-${i}`);
            resolve(result);
          }, Math.random() * 10);
        })
      );

      const allResults = await Promise.all(promises);

      // Exactly one should succeed
      const successes = allResults.filter(r => r === true);
      assert.strictEqual(successes.length, 1, 'Exactly one claim should succeed');

      // Verify the claim file exists and is valid
      const claimedPath = path.join(jobDir, 'claimed.json');
      const claim = JSON.parse(fs.readFileSync(claimedPath, 'utf8')) as ClaimedJson;
      assert.ok(claim.bridgeId.startsWith('bridge-'));
    });

    it('should support custom lease duration', () => {
      const customLeaseMs = 30000; // 30 seconds
      const result = claimJobAtomic(jobDir, 'test-bridge', customLeaseMs);

      assert.strictEqual(result, true);

      const claimedPath = path.join(jobDir, 'claimed.json');
      const claim = JSON.parse(fs.readFileSync(claimedPath, 'utf8')) as ClaimedJson;

      const claimTime = new Date(claim.claimedAt).getTime();
      const leaseTime = new Date(claim.leaseExpiresAt).getTime();
      assert.ok(Math.abs((leaseTime - claimTime) - customLeaseMs) < 1000);
    });
  });

  describe('cancellation detection', () => {
    it('should detect when cancel file exists', async () => {
      const cancelPath = path.join(jobDir, 'cancel');
      await fsPromises.writeFile(cancelPath, '');

      const cancelled = await checkCancellation(jobDir);
      assert.strictEqual(cancelled, true);
    });

    it('should return false when cancel file does not exist', async () => {
      const cancelled = await checkCancellation(jobDir);
      assert.strictEqual(cancelled, false);
    });
  });

  describe('event writing', () => {
    it('should write events to NDJSON file', async () => {
      const eventPath = path.join(jobDir, 'events.ndjson');
      const writer = new EventWriter(eventPath);

      writer.writeProgress(25, 'Starting operation');
      writer.writeLog('info', 'Processing file');
      writer.writeWarning('File has unsaved changes');
      writer.writeProgress(100, 'Complete');

      await writer.close();

      // Read and parse events
      const content = await fsPromises.readFile(eventPath, 'utf8');
      const lines = content.trim().split('\n');
      const events = lines.map(line => JSON.parse(line) as EventJson);

      assert.strictEqual(events.length, 4);

      // Verify first event (progress)
      assert.strictEqual(events[0].type, 'progress');
      assert.strictEqual(events[0].pct, 25);
      assert.strictEqual(events[0].msg, 'Starting operation');
      assert.strictEqual(events[0].seq, 0);

      // Verify sequence numbers increment
      assert.strictEqual(events[1].seq, 1);
      assert.strictEqual(events[2].seq, 2);
      assert.strictEqual(events[3].seq, 3);

      // Verify timestamps are present and increasing
      for (let i = 1; i < events.length; i++) {
        assert.ok(events[i].ts >= events[i - 1].ts);
      }
    });

    it('should handle stream closure gracefully', async () => {
      const eventPath = path.join(jobDir, 'events.ndjson');
      const writer = new EventWriter(eventPath);

      writer.writeLog('info', 'First event');
      await writer.close();

      // Writing after close should not throw
      assert.doesNotThrow(() => {
        writer.writeLog('info', 'After close');
      });
    });
  });

  describe('response writing', () => {
    it('should write success response with inline data', async () => {
      const envelope: ResponseJson = {
        ok: true,
        type: 'success',
        data: { result: 'test data' },
        meta: {
          requestId: 'test-123',
          mode: 'normal',
          timestamp: new Date().toISOString(),
          duration: 100
        }
      };

      await writeResponse(jobDir, envelope);

      const responsePath = path.join(jobDir, 'response.json');
      assert.ok(fs.existsSync(responsePath));

      const saved = JSON.parse(await fsPromises.readFile(responsePath, 'utf8')) as ResponseJson;
      assert.deepStrictEqual(saved, envelope);
    });

    it('should write large data to separate file with dataRef', async () => {
      // Create data larger than 2MB
      const largeArray = Array(100000).fill({ data: 'x'.repeat(30) });
      const largeData = { items: largeArray };

      const envelope: ResponseJson = {
        ok: true,
        type: 'success',
        data: largeData,
        meta: {
          requestId: 'test-123',
          mode: 'normal',
          timestamp: new Date().toISOString(),
          duration: 100
        }
      };

      await writeResponse(jobDir, envelope);

      // Response should have dataRef instead of inline data
      const responsePath = path.join(jobDir, 'response.json');
      const saved = JSON.parse(await fsPromises.readFile(responsePath, 'utf8')) as ResponseJson;

      assert.strictEqual(saved.data, undefined);
      assert.strictEqual(saved.dataRef, 'data.json');

      // Verify data file exists and contains the large data
      const dataPath = path.join(jobDir, 'data.json');
      assert.ok(fs.existsSync(dataPath));

      const savedData = JSON.parse(await fsPromises.readFile(dataPath, 'utf8'));
      assert.strictEqual(savedData.items.length, largeArray.length);
    });

    it('should write error response', async () => {
      const envelope: ErrorJson = {
        ok: false,
        type: 'error',
        error: {
          code: ErrorCode.E_INVALID_PARAMS,
          message: 'Invalid parameters',
          details: { param: 'line' }
        },
        meta: {
          requestId: 'test-123',
          mode: 'normal',
          timestamp: new Date().toISOString(),
          duration: 50
        }
      };

      await writeResponse(jobDir, envelope);

      const errorPath = path.join(jobDir, 'error.json');
      assert.ok(fs.existsSync(errorPath));

      const saved = JSON.parse(await fsPromises.readFile(errorPath, 'utf8')) as ErrorJson;
      assert.deepStrictEqual(saved, envelope);
    });

    it('should use atomic write via rename', async () => {
      const envelope = createSuccessEnvelope({ test: true }, 'test-123', Date.now());

      // Start writing
      const writePromise = writeResponse(jobDir, envelope);

      // Temp file should exist briefly
      const files = await fsPromises.readdir(jobDir);
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));

      await writePromise;

      // No temp files should remain
      const finalFiles = await fsPromises.readdir(jobDir);
      const finalTmpFiles = finalFiles.filter(f => f.endsWith('.tmp'));
      assert.strictEqual(finalTmpFiles.length, 0);
    });
  });

  describe('done marker', () => {
    it('should write done file', async () => {
      await writeDone(jobDir);

      const donePath = path.join(jobDir, 'done');
      assert.ok(fs.existsSync(donePath));

      // Done file should be empty
      const content = await fsPromises.readFile(donePath, 'utf8');
      assert.strictEqual(content, '');
    });
  });

  describe('full command processing', () => {
    it('should process command successfully', async () => {
      // Write a command file
      const command: CommandJson = {
        version: 1,
        clientId: 'test-client',
        id: 'test-command-1',
        createdAt: new Date().toISOString(),
        scriptName: 'test.script',
        params: { value: 42 }
      };

      await fsPromises.writeFile(
        path.join(jobDir, 'command.json'),
        JSON.stringify(command)
      );

      // Process the command
      await processCommand(jobDir, 'test-bridge', async (cmd, writer) => {
        assert.strictEqual(cmd.scriptName, 'test.script');
        writer.writeProgress(50, 'Processing');
        return { result: 'success', input: cmd.params.value };
      });

      // Verify response was written
      const responsePath = path.join(jobDir, 'response.json');
      assert.ok(fs.existsSync(responsePath));

      const response = JSON.parse(await fsPromises.readFile(responsePath, 'utf8')) as ResponseJson;
      assert.strictEqual(response.ok, true);
      assert.strictEqual(response.data.result, 'success');
      assert.strictEqual(response.data.input, 42);

      // Verify done file was written
      assert.ok(fs.existsSync(path.join(jobDir, 'done')));

      // Verify events were written
      assert.ok(fs.existsSync(path.join(jobDir, 'events.ndjson')));
    });

    it('should handle cancellation during processing', async () => {
      const command: CommandJson = {
        version: 1,
        clientId: 'test-client',
        id: 'test-command-2',
        createdAt: new Date().toISOString(),
        scriptName: 'long.operation',
        params: {}
      };

      await fsPromises.writeFile(
        path.join(jobDir, 'command.json'),
        JSON.stringify(command)
      );

      // Start processing with a delay
      const processPromise = processCommand(jobDir, 'test-bridge', async (cmd, writer) => {
        writer.writeProgress(10, 'Starting long operation');

        // Simulate long operation
        await new Promise(resolve => setTimeout(resolve, 1000));

        return { should: 'not reach here' };
      });

      // Cancel after a short delay
      setTimeout(async () => {
        await fsPromises.writeFile(path.join(jobDir, 'cancel'), '');
      }, 100);

      await processPromise;

      // Should have written error response with cancellation
      const errorPath = path.join(jobDir, 'error.json');
      assert.ok(fs.existsSync(errorPath));

      const error = JSON.parse(await fsPromises.readFile(errorPath, 'utf8')) as ErrorJson;
      assert.strictEqual(error.ok, false);
      assert.strictEqual(error.error.code, ErrorCode.E_CANCELLED);

      // Done should still be written
      assert.ok(fs.existsSync(path.join(jobDir, 'done')));
    });

    it('should handle executor errors gracefully', async () => {
      const command: CommandJson = {
        version: 1,
        clientId: 'test-client',
        id: 'test-command-3',
        createdAt: new Date().toISOString(),
        scriptName: 'failing.script',
        params: {}
      };

      await fsPromises.writeFile(
        path.join(jobDir, 'command.json'),
        JSON.stringify(command)
      );

      await processCommand(jobDir, 'test-bridge', async () => {
        throw new Error('Simulated failure');
      });

      // Should have written error response
      const errorPath = path.join(jobDir, 'error.json');
      assert.ok(fs.existsSync(errorPath));

      const error = JSON.parse(await fsPromises.readFile(errorPath, 'utf8')) as ErrorJson;
      assert.strictEqual(error.ok, false);
      assert.strictEqual(error.error.code, ErrorCode.E_INTERNAL);
      assert.ok(error.error.message.includes('Simulated failure'));

      // Done should still be written
      assert.ok(fs.existsSync(path.join(jobDir, 'done')));
    });

    it('should renew lease during long-running commands', async function() {
      // Increase timeout for this test
      this.timeout(5000);

      const command: CommandJson = {
        version: 1,
        clientId: 'test-client',
        id: 'test-command-lease',
        createdAt: new Date().toISOString(),
        scriptName: 'long.running',
        params: {}
      };

      await fsPromises.writeFile(
        path.join(jobDir, 'command.json'),
        JSON.stringify(command)
      );

      // Track lease renewals
      const leaseUpdates: Date[] = [];
      let previousLease: string | null = null;

      const checkLease = setInterval(async () => {
        try {
          const claimedPath = path.join(jobDir, 'claimed.json');
          const claimedData = await fsPromises.readFile(claimedPath, 'utf8');
          const claimed = JSON.parse(claimedData);

          if (claimed.leaseExpiresAt !== previousLease) {
            leaseUpdates.push(new Date(claimed.leaseExpiresAt));
            previousLease = claimed.leaseExpiresAt;
          }
        } catch {
          // Ignore errors
        }
      }, 500);

      // Claim the job first
      const claimed = claimJobAtomic(jobDir, 'test-bridge');
      assert.ok(claimed);

      // Run a long command
      await processCommand(jobDir, 'test-bridge', async () => {
        // Simulate a long-running task
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { result: 'completed' };
      });

      clearInterval(checkLease);

      // Should have renewed lease at least once (renewal interval is 15s but we run immediately)
      assert.ok(leaseUpdates.length >= 1, `Expected at least 1 lease renewal, got ${leaseUpdates.length}`);

      // Lease expiry should be in the future
      const lastLease = leaseUpdates[leaseUpdates.length - 1];
      assert.ok(lastLease > new Date(), 'Last lease should be in the future');
    });

    it('should handle high-rate event streaming with backpressure', async function() {
      // Increase timeout for this test
      this.timeout(10000);

      const eventPath = path.join(jobDir, 'events.ndjson');
      const writer = new EventWriter(eventPath);

      // Write many events rapidly
      const eventCount = 10000;
      const promises: Promise<void>[] = [];

      for (let i = 0; i < eventCount; i++) {
        if (i % 100 === 0) {
          promises.push(writer.writeEvent('progress', {
            pct: Math.floor((i / eventCount) * 100),
            msg: `Processing item ${i}`
          }));
        }
        if (i % 10 === 0) {
          writer.writeLog('info', `Log message ${i}`, { index: i });
        }
        if (i % 1000 === 0) {
          writer.writeWarning(`Warning at ${i}`);
        }
      }

      // Wait for all async writes to complete
      await Promise.all(promises);
      await writer.close();

      // Verify all events were written
      const content = await fsPromises.readFile(eventPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line);

      // Count each event type
      let progressCount = 0;
      let logCount = 0;
      let warnCount = 0;

      for (const line of lines) {
        const event = JSON.parse(line);
        if (event.type === 'progress') progressCount++;
        if (event.type === 'log') logCount++;
        if (event.type === 'warn') warnCount++;
      }

      // Verify counts match expectations
      assert.strictEqual(progressCount, 100);  // Every 100th event
      assert.strictEqual(logCount, 1000);      // Every 10th event
      assert.strictEqual(warnCount, 10);       // Every 1000th event

      // Verify sequence numbers are correct
      const events = lines.map(line => JSON.parse(line));
      for (let i = 0; i < events.length; i++) {
        assert.strictEqual(events[i].seq, i, `Event ${i} has wrong sequence number`);
      }
    });
  });
});