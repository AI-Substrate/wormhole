import * as assert from 'assert';
import {
  CommandJson,
  ClaimedJson,
  HostJson,
  EventJson,
  ResponseJson,
  ErrorJson,
  isCommandJson,
  isResponseJson,
  isErrorJson,
  ErrorCode,
  CancellationError
} from '../../src/core/fs-bridge/types';

describe('Filesystem Bridge Types', () => {
  describe('CommandJson validation', () => {
    it('should validate a well-formed command', () => {
      const command: CommandJson = {
        version: 1,
        clientId: 'cli-1234',
        id: '20250916T124512083Z-0001-abc',
        createdAt: '2025-09-16T12:45:12.083Z',
        scriptName: 'bp.set',
        params: { path: '/test.py', line: 42 }
      };

      assert.strictEqual(isCommandJson(command), true);
    });

    it('should reject commands with missing required fields', () => {
      const invalid = [
        { version: 1, clientId: 'cli', id: 'id' }, // missing scriptName
        { version: 2, clientId: 'cli', id: 'id', scriptName: 'test', params: {} }, // wrong version
        { version: 1, id: 'id', scriptName: 'test', params: {} }, // missing clientId
        { version: 1, clientId: 'cli', scriptName: 'test', params: {} }, // missing id
      ];

      for (const cmd of invalid) {
        assert.strictEqual(
          isCommandJson(cmd),
          false,
          `Should reject: ${JSON.stringify(cmd)}`
        );
      }
    });

    it('should accept optional timeout field', () => {
      const command: CommandJson = {
        version: 1,
        clientId: 'cli-1234',
        id: '20250916T124512083Z-0001-abc',
        createdAt: '2025-09-16T12:45:12.083Z',
        scriptName: 'debug.start',
        params: { config: 'launch' },
        timeout: 60000
      };

      assert.strictEqual(isCommandJson(command), true);
      assert.strictEqual(command.timeout, 60000);
    });
  });

  describe('ClaimedJson structure', () => {
    it('should represent a valid claim with lease', () => {
      const now = new Date();
      const lease = new Date(now.getTime() + 60000);

      const claim: ClaimedJson = {
        bridgeId: 'extHost-abc123',
        claimedAt: now.toISOString(),
        pid: process.pid,
        leaseExpiresAt: lease.toISOString()
      };

      assert.strictEqual(claim.bridgeId, 'extHost-abc123');
      assert.ok(claim.claimedAt);
      assert.ok(claim.leaseExpiresAt);
      assert.strictEqual(typeof claim.pid, 'number');
    });

    it('should calculate lease expiration correctly', () => {
      const claim: ClaimedJson = {
        bridgeId: 'test',
        claimedAt: '2025-01-01T00:00:00.000Z',
        pid: 1234,
        leaseExpiresAt: '2025-01-01T00:01:00.000Z'
      };

      const claimedTime = new Date(claim.claimedAt).getTime();
      const leaseTime = new Date(claim.leaseExpiresAt).getTime();
      const diff = leaseTime - claimedTime;

      assert.strictEqual(diff, 60000, 'Lease should be 60 seconds');
    });
  });

  describe('EventJson for unified event stream', () => {
    it('should represent progress events', () => {
      const event: EventJson = {
        ts: Date.now(),
        seq: 0,
        type: 'progress',
        pct: 50,
        msg: 'Processing files...'
      };

      assert.strictEqual(event.type, 'progress');
      assert.strictEqual(event.pct, 50);
      assert.ok(event.msg);
    });

    it('should represent log events with levels', () => {
      const event: EventJson = {
        ts: Date.now(),
        seq: 1,
        type: 'log',
        level: 'info',
        text: 'Operation started'
      };

      assert.strictEqual(event.type, 'log');
      assert.strictEqual(event.level, 'info');
      assert.ok(event.text);
    });

    it('should represent warning events', () => {
      const event: EventJson = {
        ts: Date.now(),
        seq: 2,
        type: 'warn',
        text: 'File has unsaved changes'
      };

      assert.strictEqual(event.type, 'warn');
      assert.ok(event.text);
    });

    it('should maintain sequence ordering', () => {
      const events: EventJson[] = [];
      for (let i = 0; i < 10; i++) {
        events.push({
          ts: Date.now() + i,
          seq: i,
          type: 'log',
          text: `Event ${i}`
        });
      }

      for (let i = 1; i < events.length; i++) {
        assert.ok(events[i].seq > events[i - 1].seq, 'Sequence should increase');
        assert.ok(events[i].ts >= events[i - 1].ts, 'Timestamp should increase');
      }
    });
  });

  describe('Response envelopes', () => {
    it('should validate success response with inline data', () => {
      const response: ResponseJson = {
        ok: true,
        type: 'success',
        data: { breakpoints: [{ path: '/test.py', line: 42 }] },
        meta: {
          requestId: '20250916T124512083Z-0001-abc',
          mode: 'normal',
          timestamp: new Date().toISOString(),
          duration: 98
        }
      };

      assert.strictEqual(isResponseJson(response), true);
      assert.strictEqual(isErrorJson(response), false);
      assert.ok(response.data);
      assert.strictEqual(response.dataRef, undefined);
    });

    it('should validate success response with dataRef for large payloads', () => {
      const response: ResponseJson = {
        ok: true,
        type: 'success',
        dataRef: 'data.json',
        meta: {
          requestId: '20250916T124512083Z-0001-abc',
          mode: 'normal',
          timestamp: new Date().toISOString(),
          duration: 250
        }
      };

      assert.strictEqual(isResponseJson(response), true);
      assert.strictEqual(response.data, undefined);
      assert.strictEqual(response.dataRef, 'data.json');
    });

    it('should validate error response with error code', () => {
      const error: ErrorJson = {
        ok: false,
        type: 'error',
        error: {
          code: ErrorCode.E_SCRIPT_NOT_FOUND,
          message: 'Script not found: invalid.script',
          details: { scriptName: 'invalid.script' }
        },
        meta: {
          requestId: '20250916T124512083Z-0001-abc',
          mode: 'normal',
          timestamp: new Date().toISOString(),
          duration: 5
        }
      };

      assert.strictEqual(isErrorJson(error), true);
      assert.strictEqual(isResponseJson(error), false);
      assert.strictEqual(error.error.code, ErrorCode.E_SCRIPT_NOT_FOUND);
    });
  });

  describe('Error codes', () => {
    it('should have distinct error codes for different error types', () => {
      const codes = new Set(Object.values(ErrorCode));
      assert.strictEqual(codes.size, Object.keys(ErrorCode).length);
    });

    it('should use E_ prefix convention', () => {
      for (const code of Object.values(ErrorCode)) {
        assert.ok(code.startsWith('E_'), `${code} should start with E_`);
      }
    });
  });

  describe('CancellationError', () => {
    it('should be instanceof Error', () => {
      const err = new CancellationError();
      assert.ok(err instanceof Error);
      assert.strictEqual(err.name, 'CancellationError');
    });

    it('should accept custom message', () => {
      const err = new CancellationError('Custom cancel message');
      assert.strictEqual(err.message, 'Custom cancel message');
    });
  });

  describe('ID format validation', () => {
    it('should validate short ID format is under 30 chars', () => {
      // Format: YYYYMMDDTHHMMSSfffZ-0001-rand
      const id = '20250916T124512083Z-0001-abc';
      assert.ok(id.length <= 30, `ID length ${id.length} should be <= 30`);
    });

    it('should be sortable lexicographically', () => {
      const ids = [
        '20250916T124512083Z-0001-abc',
        '20250916T124512084Z-0001-def',
        '20250916T124513000Z-0001-ghi',
      ];

      const sorted = [...ids].sort();
      assert.deepStrictEqual(sorted, ids, 'IDs should sort chronologically');
    });
  });
});