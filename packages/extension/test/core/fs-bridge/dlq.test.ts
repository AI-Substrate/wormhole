/**
 * @fileoverview Dead Letter Queue (DLQ) Tests
 *
 * Tests for the DLQ system that quarantines failed jobs without retry attempts.
 *
 * ## Test Organization
 * - DLQ Marker Creation: Verify dlq file created with complete metadata
 * - DLQ Job Identification: Verify isDlqJob() correctly detects DLQ jobs
 * - Non-Happy-Path: Graceful degradation and idempotency
 *
 * ## Testing Philosophy (Full TDD)
 * - Write tests FIRST (RED)
 * - Implement minimal code (GREEN)
 * - Refactor for quality (REFACTOR)
 * - Real filesystem operations (no mocking fs)
 * - Mock VS Code APIs only
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NodeFilesystem } from '../../../src/core/fs-bridge/fs-abstraction';

describe('DLQ Marker Creation', () => {
  let testDir: string;
  let jobDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlq-test-'));
    jobDir = path.join(testDir, 'job-001');
    fs.mkdirSync(jobDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Test ID: FS-BRIDGE-DLQ-001
   *
   * Purpose: Verify DLQ marker file is created with complete metadata
   *
   * Why: DLQ markers must contain full diagnostic information (reason, timestamp,
   *      error, stack trace, script name) for debugging failed jobs
   *
   * Contract: writeDlqMarker() creates a 'dlq' file in job directory with JSON
   *          containing all required fields
   *
   * Usage Notes: Call writeDlqMarker(jobDir, metadata) with full error context
   *
   * Quality Contribution: Prevents diagnostic data loss; ensures developers have
   *                       complete failure information for investigation
   */
  it('FS-BRIDGE-DLQ-001: should create dlq marker with reason/timestamp/error', async () => {
    const error = new Error('Test failure');
    error.stack = 'Error: Test failure\n  at test.ts:10:5';

    // Import dynamically (will fail until dlq.ts exists)
    const { writeDlqMarker } = await import('../../../src/core/fs-bridge/dlq');

    await writeDlqMarker(jobDir, {
      reason: 'E_SCRIPT_FAILED',
      scriptName: 'debug.evaluate',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    const dlqPath = path.join(jobDir, 'dlq');
    expect(fs.existsSync(dlqPath)).toBe(true);

    const dlq = JSON.parse(fs.readFileSync(dlqPath, 'utf8'));
    expect(dlq.reason).toBe('E_SCRIPT_FAILED');
    expect(dlq.scriptName).toBe('debug.evaluate');
    expect(dlq.error).toBe('Test failure');
    expect(dlq.stack).toContain('test.ts:10:5');
    expect(dlq.timestamp).toBeDefined();
  });

  /**
   * Test ID: FS-BRIDGE-DLQ-002
   *
   * Purpose: Verify DLQ marker contains complete metadata fields
   *
   * Why: All diagnostic fields (error, stack, scriptName, timestamp, pid) must be
   *      present in DLQ marker for complete debugging information
   *
   * Contract: DLQ marker JSON includes all required and optional metadata fields
   *
   * Usage Notes: Metadata can include optional fields (scriptName, error, stack);
   *             timestamp and pid are always populated
   *
   * Quality Contribution: Ensures DLQ markers are self-contained diagnostic artifacts
   */
  it('FS-BRIDGE-DLQ-002: should include all metadata fields', async () => {
    const { writeDlqMarker } = await import('../../../src/core/fs-bridge/dlq');

    const testError = new Error('Metadata test error');
    testError.stack = 'Error: Metadata test error\n  at dlq.test.ts:100:20';

    await writeDlqMarker(jobDir, {
      reason: 'E_TIMEOUT',
      scriptName: 'debug.continue',
      error: testError.message,
      stack: testError.stack,
      timestamp: '2025-10-17T12:34:56.789Z',
      bridgeId: 'test-bridge-123'
    });

    const dlqPath = path.join(jobDir, 'dlq');
    const dlq = JSON.parse(fs.readFileSync(dlqPath, 'utf8'));

    // Verify all fields present
    expect(dlq.reason).toBe('E_TIMEOUT');
    expect(dlq.scriptName).toBe('debug.continue');
    expect(dlq.error).toBe('Metadata test error');
    expect(dlq.stack).toContain('dlq.test.ts:100:20');
    expect(dlq.timestamp).toBe('2025-10-17T12:34:56.789Z');
    expect(dlq.pid).toBe(process.pid);
    expect(dlq.bridgeId).toBe('test-bridge-123');
  });

  /**
   * Test ID: FS-BRIDGE-DLQ-003
   *
   * Purpose: Verify immediate DLQ marker creation (no retry attempts)
   *
   * Why: Per Critical Discovery 04, failed jobs go directly to DLQ without any
   *      retry logic to keep system simple (KISS)
   *
   * Contract: Single writeDlqMarker() call creates marker, no retry attempts,
   *          graceful degradation on write failure
   *
   * Usage Notes: Call writeDlqMarker() once per failure; function handles errors
   *             internally without throwing
   *
   * Quality Contribution: Prevents retry storms; validates KISS error handling
   */
  it('FS-BRIDGE-DLQ-003: should create marker immediately (no retry)', async () => {
    const { writeDlqMarker } = await import('../../../src/core/fs-bridge/dlq');

    const startTime = Date.now();

    await writeDlqMarker(jobDir, {
      reason: 'E_INTERNAL',
      timestamp: new Date().toISOString()
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Verify marker created immediately (< 100ms, no retry delays)
    expect(duration).toBeLessThan(100);

    const dlqPath = path.join(jobDir, 'dlq');
    expect(fs.existsSync(dlqPath)).toBe(true);
  });
});

describe('DLQ Job Identification', () => {
  let testDir: string;
  let jobDir: string;
  let nodeFs: NodeFilesystem;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlq-test-'));
    jobDir = path.join(testDir, 'job-002');
    fs.mkdirSync(jobDir, { recursive: true });
    nodeFs = new NodeFilesystem();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Test ID: FS-BRIDGE-DLQ-004
   *
   * Purpose: Verify isDlqJob() correctly identifies DLQ jobs
   *
   * Why: Scanner must detect DLQ jobs to skip reprocessing; prevents infinite
   *      failure loops
   *
   * Contract: isDlqJob() returns false for normal jobs, true for jobs with dlq marker
   *
   * Usage Notes: Call isDlqJob(jobDir) before attempting to claim/process job
   *
   * Quality Contribution: Core scanner integration test; prevents DLQ job reprocessing
   */
  it('FS-BRIDGE-DLQ-004: should identify DLQ jobs correctly', async () => {
    const { writeDlqMarker, isDlqJob } = await import('../../../src/core/fs-bridge/dlq');

    // Initially, job should NOT be DLQ
    expect(await isDlqJob(jobDir, nodeFs)).toBe(false);

    // Write DLQ marker
    await writeDlqMarker(jobDir, {
      reason: 'E_TIMEOUT',
      timestamp: new Date().toISOString()
    });

    // Now job should be DLQ
    expect(await isDlqJob(jobDir, nodeFs)).toBe(true);
  });

  /**
   * Test ID: FS-BRIDGE-DLQ-005
   *
   * Purpose: Verify DLQ jobs are skipped by scanner logic
   *
   * Why: DLQ jobs must not be claimed/processed again; scanner should skip them
   *      early to avoid wasted work
   *
   * Contract: Jobs with dlq marker return true from isDlqJob(), signaling scanner
   *          to skip without claiming
   *
   * Usage Notes: Scanner checks isDlqJob() before claim attempt; early exit if true
   *
   * Quality Contribution: Validates scanner integration point; prevents reprocessing
   */
  it('FS-BRIDGE-DLQ-005: should allow scanner to skip DLQ jobs', async () => {
    const { writeDlqMarker, isDlqJob } = await import('../../../src/core/fs-bridge/dlq');

    // Create DLQ marker
    await writeDlqMarker(jobDir, {
      reason: 'E_INTERNAL',
      timestamp: new Date().toISOString()
    });

    // Create command.json (simulating failed job)
    fs.writeFileSync(
      path.join(jobDir, 'command.json'),
      JSON.stringify({ id: '002', scriptName: 'test', params: {} })
    );

    // Scanner should detect DLQ and skip
    const shouldSkip = await isDlqJob(jobDir, nodeFs);
    expect(shouldSkip).toBe(true);

    // Verify no claimed.json created (simulating scanner skipping)
    expect(fs.existsSync(path.join(jobDir, 'claimed.json'))).toBe(false);
  });
});

describe('DLQ Non-Happy-Path', () => {
  let testDir: string;
  let jobDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlq-test-'));
    jobDir = path.join(testDir, 'job-003');
    fs.mkdirSync(jobDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Test ID: FS-BRIDGE-DLQ-015
   *
   * Purpose: Verify graceful degradation when DLQ write fails (KISS: single attempt)
   *
   * Why: Per KISS principle, writeDlqMarker() should try once, log error, and continue
   *      without throwing or retrying
   *
   * Contract: On write failure (ENOSPC, permissions, etc.), function logs error and
   *          returns normally (doesn't throw)
   *
   * Usage Notes: writeDlqMarker() handles all errors internally; callers don't need
   *             try-catch
   *
   * Quality Contribution: Validates KISS error handling; prevents exception propagation
   */
  it('FS-BRIDGE-DLQ-015: should handle write failure gracefully (single attempt)', async () => {
    const { writeDlqMarker } = await import('../../../src/core/fs-bridge/dlq');

    // Make job directory read-only to trigger write failure
    fs.chmodSync(jobDir, 0o444);

    // Should not throw, should complete gracefully
    await expect(writeDlqMarker(jobDir, {
      reason: 'E_INTERNAL',
      timestamp: new Date().toISOString()
    })).resolves.toBeUndefined();

    // Verify no dlq marker created (write failed)
    const dlqPath = path.join(jobDir, 'dlq');
    expect(fs.existsSync(dlqPath)).toBe(false);

    // Restore permissions for cleanup
    fs.chmodSync(jobDir, 0o755);
  });

  /**
   * Test ID: FS-BRIDGE-DLQ-016
   *
   * Purpose: Verify idempotency - multiple writes don't fail
   *
   * Why: If writeDlqMarker() is called multiple times (edge case), it should
   *      not throw errors; last write wins
   *
   * Contract: Multiple writeDlqMarker() calls succeed; last write overwrites previous
   *
   * Usage Notes: Atomic writes ensure safe overwrites; no file corruption
   *
   * Quality Contribution: Validates atomic write pattern; prevents corruption
   */
  it('FS-BRIDGE-DLQ-016: should be idempotent (multiple writes safe)', async () => {
    const { writeDlqMarker } = await import('../../../src/core/fs-bridge/dlq');

    // First write
    await writeDlqMarker(jobDir, {
      reason: 'E_INTERNAL',
      timestamp: '2025-10-17T12:00:00Z'
    });

    // Second write (last write wins)
    await writeDlqMarker(jobDir, {
      reason: 'E_TIMEOUT',
      timestamp: '2025-10-17T12:00:01Z'
    });

    const dlqPath = path.join(jobDir, 'dlq');
    const dlq = JSON.parse(fs.readFileSync(dlqPath, 'utf8'));

    // Verify last write won
    expect(dlq.reason).toBe('E_TIMEOUT');
    expect(dlq.timestamp).toBe('2025-10-17T12:00:01Z');
  });
});
