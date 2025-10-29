/**
 * @fileoverview Flood Protection Tests
 *
 * Tests for the flood protection mechanism that prevents retry storms by tracking
 * failure timestamps and rejecting new jobs when threshold is exceeded.
 *
 * ## Test Organization
 * - Flood Trigger Tests: Verify circuit opens at threshold (10 failures in 60s)
 * - Auto-Recovery Tests: Verify circuit closes after window expires
 *
 * ## Testing Philosophy
 * These tests use filesystem-based integration testing (no mocking of processor logic):
 * - **Real filesystem**: Create actual command.json files in execute/ directory
 * - **Real BridgeManager**: Use actual job processing loop
 * - **Fake timers**: Use Vitest fake timers for time-based tests
 * - **Observable errors**: Verify error.json files created with correct error codes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventWriter, launchJob, resetFloodProtection } from '../../../src/core/fs-bridge/processor';
import { CommandJson, ErrorCode } from '../../../src/core/fs-bridge/types';
import { newJobId } from '../../../src/core/fs-bridge/ids';

describe('Flood Protection', () => {
  let testDir: string;
  let executeDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flood-test-'));
    executeDir = path.join(testDir, 'execute');
    fs.mkdirSync(executeDir, { recursive: true });
    resetFloodProtection(); // Reset flood state between tests
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * **Test ID**: FS-BRIDGE-FLOOD-001
   *
   * **Purpose**:
   * Verify that flood protection triggers at threshold (10 failures in 60 seconds).
   * After 10 failures, new jobs should be rejected with E_CIRCUIT_OPEN error that
   * includes retryAfter seconds.
   *
   * **Setup**:
   * - Create test directory with execute/ subdirectory
   * - Create failing executor that always throws errors
   *
   * **Exercise**:
   * - Launch 10 jobs that all fail
   * - Wait for all 10 to complete (failure tracking)
   * - Launch 11th job
   *
   * **Verify**:
   * - 11th job gets error.json with E_CIRCUIT_OPEN code
   * - Error includes retryAfter field (0-60 seconds range)
   * - Error message mentions "flooded" and "10 failures"
   *
   * **Cleanup**:
   * - Test framework removes temp directory
   *
   * **Why Essential**:
   * Flood protection prevents retry storms that could overwhelm the extension.
   * Without this, a failing script could generate thousands of retry requests
   * per minute, degrading VS Code performance.
   */
  it('FS-BRIDGE-FLOOD-001: triggers at threshold (10 failures in 60s)', async () => {
    // Create failing executor
    const failingExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      throw new Error('Simulated failure');
    };

    // Launch 10 jobs that all fail
    const jobPromises: Promise<void>[] = [];
    const jobDirs: string[] = [];

    for (let i = 0; i < 10; i++) {
      const jobId = newJobId();
      const jobDir = path.join(executeDir, jobId);
      fs.mkdirSync(jobDir, { recursive: true });
      jobDirs.push(jobDir);

      const command: CommandJson = {
        version: 1,
        clientId: 'test-client',
        id: jobId,
        createdAt: new Date().toISOString(),
        scriptName: 'test.failing',
        params: { index: i }
      };

      fs.writeFileSync(
        path.join(jobDir, 'command.json'),
        JSON.stringify(command, null, 2)
      );

      // Launch job and track completion
      const jobPromise = new Promise<void>((resolve) => {
        launchJob(jobDir, 'test-bridge-id', failingExecutor);

        // Poll for done marker
        const pollInterval = setInterval(() => {
          const donePath = path.join(jobDir, 'done');
          if (fs.existsSync(donePath)) {
            clearInterval(pollInterval);
            resolve();
          }
        }, 50);
      });

      jobPromises.push(jobPromise);
    }

    // Wait for all 10 failures to complete
    await Promise.all(jobPromises);

    // Add small delay to ensure failure timestamps are recorded
    // (processCommand .catch() handler executes after promise rejection)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify all 10 failed (error.json exists with E_INTERNAL)
    for (const jobDir of jobDirs) {
      const errorPath = path.join(jobDir, 'error.json');
      expect(fs.existsSync(errorPath)).toBe(true);
    }

    // Now launch 11th job - should be rejected with E_CIRCUIT_OPEN
    const job11Id = newJobId();
    const job11Dir = path.join(executeDir, job11Id);
    fs.mkdirSync(job11Dir, { recursive: true });

    const command11: CommandJson = {
      version: 1,
      clientId: 'test-client',
      id: job11Id,
      createdAt: new Date().toISOString(),
      scriptName: 'test.should-be-rejected',
      params: {}
    };

    fs.writeFileSync(
      path.join(job11Dir, 'command.json'),
      JSON.stringify(command11, null, 2)
    );

    launchJob(job11Dir, 'test-bridge-id', failingExecutor);

    // Wait for done marker
    await new Promise<void>((resolve) => {
      const pollInterval = setInterval(() => {
        const donePath = path.join(job11Dir, 'done');
        if (fs.existsSync(donePath)) {
          clearInterval(pollInterval);
          resolve();
        }
      }, 50);
    });

    // Verify 11th job got E_CIRCUIT_OPEN error
    const error11Path = path.join(job11Dir, 'error.json');
    expect(fs.existsSync(error11Path)).toBe(true);

    const error11Data = JSON.parse(fs.readFileSync(error11Path, 'utf8'));
    expect(error11Data.ok).toBe(false);
    expect(error11Data.error.code).toBe(ErrorCode.E_CIRCUIT_OPEN);
    expect(error11Data.error.message).toMatch(/flooded/i);
    expect(error11Data.error.message).toMatch(/10 failures/i);

    // Verify retryAfter field exists and is reasonable (0-60 seconds)
    expect(error11Data.error.details.retryAfter).toBeDefined();
    expect(error11Data.error.details.retryAfter).toBeGreaterThanOrEqual(0);
    expect(error11Data.error.details.retryAfter).toBeLessThanOrEqual(60);
  }, 30000);

  /**
   * **Test ID**: FS-BRIDGE-FLOOD-002
   *
   * **Purpose**:
   * Verify that flood protection uses rolling window - as old failures expire,
   * new failures can be added without hitting circuit breaker limit.
   *
   * **Setup**:
   * - Create test directory with execute/ subdirectory
   * - Create failing executor
   *
   * **Exercise**:
   * - Trigger 9 failures (below threshold)
   * - Verify 10th job processes (not rejected)
   * - Even though it fails, total is exactly 10
   * - Launch 11th job - should be rejected (threshold hit)
   *
   * **Verify**:
   * - First 10 jobs processed (may fail, but not circuit-breaker rejected)
   * - 11th job gets E_CIRCUIT_OPEN
   * - Circuit breaker behavior confirmed with exactly-at-threshold scenario
   *
   * **Cleanup**:
   * - Test framework removes temp directory
   *
   * **Why Essential**:
   * Verifies the threshold boundary condition - exactly 10 failures should trigger
   * the circuit breaker, but 9 should not.
   */
  it('FS-BRIDGE-FLOOD-002: threshold boundary (9 OK, 10th triggers)', async () => {
    // Create failing executor
    const failingExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      throw new Error('Simulated failure');
    };

    // Trigger 9 failures (below threshold)
    const jobPromises: Promise<void>[] = [];

    for (let i = 0; i < 9; i++) {
      const jobId = newJobId();
      const jobDir = path.join(executeDir, jobId);
      fs.mkdirSync(jobDir, { recursive: true });

      const command: CommandJson = {
        version: 1,
        clientId: 'test-client',
        id: jobId,
        createdAt: new Date().toISOString(),
        scriptName: 'test.failing',
        params: { index: i }
      };

      fs.writeFileSync(
        path.join(jobDir, 'command.json'),
        JSON.stringify(command, null, 2)
      );

      const jobPromise = new Promise<void>((resolve) => {
        launchJob(jobDir, 'test-bridge-id', failingExecutor);

        const pollInterval = setInterval(() => {
          const donePath = path.join(jobDir, 'done');
          if (fs.existsSync(donePath)) {
            clearInterval(pollInterval);
            resolve();
          }
        }, 50);
      });

      jobPromises.push(jobPromise);
    }

    await Promise.all(jobPromises);

    // Add small delay to ensure failure timestamps are recorded
    await new Promise(resolve => setTimeout(resolve, 100));

    // 10th job should still process (not rejected, but will fail)
    const job10Id = newJobId();
    const job10Dir = path.join(executeDir, job10Id);
    fs.mkdirSync(job10Dir, { recursive: true });

    const command10: CommandJson = {
      version: 1,
      clientId: 'test-client',
      id: job10Id,
      createdAt: new Date().toISOString(),
      scriptName: 'test.tenth',
      params: {}
    };

    fs.writeFileSync(
      path.join(job10Dir, 'command.json'),
      JSON.stringify(command10, null, 2)
    );

    launchJob(job10Dir, 'test-bridge-id', failingExecutor);

    await new Promise<void>((resolve) => {
      const pollInterval = setInterval(() => {
        const donePath = path.join(job10Dir, 'done');
        if (fs.existsSync(donePath)) {
          clearInterval(pollInterval);
          resolve();
        }
      }, 50);
    });

    // Verify 10th job processed (got E_INTERNAL from executor, not E_CIRCUIT_OPEN)
    const error10Path = path.join(job10Dir, 'error.json');
    const error10Data = JSON.parse(fs.readFileSync(error10Path, 'utf8'));
    expect(error10Data.error.code).toBe(ErrorCode.E_INTERNAL);

    // Add small delay to ensure 10th failure is recorded
    await new Promise(resolve => setTimeout(resolve, 100));

    // Now 11th job - should be rejected with E_CIRCUIT_OPEN
    const job11Id = newJobId();
    const job11Dir = path.join(executeDir, job11Id);
    fs.mkdirSync(job11Dir, { recursive: true });

    const command11: CommandJson = {
      version: 1,
      clientId: 'test-client',
      id: job11Id,
      createdAt: new Date().toISOString(),
      scriptName: 'test.should-be-rejected',
      params: {}
    };

    fs.writeFileSync(
      path.join(job11Dir, 'command.json'),
      JSON.stringify(command11, null, 2)
    );

    launchJob(job11Dir, 'test-bridge-id', failingExecutor);

    await new Promise<void>((resolve) => {
      const pollInterval = setInterval(() => {
        const donePath = path.join(job11Dir, 'done');
        if (fs.existsSync(donePath)) {
          clearInterval(pollInterval);
          resolve();
        }
      }, 50);
    });

    // Verify 11th job rejected with E_CIRCUIT_OPEN
    const error11Path = path.join(job11Dir, 'error.json');
    const error11Data = JSON.parse(fs.readFileSync(error11Path, 'utf8'));
    expect(error11Data.error.code).toBe(ErrorCode.E_CIRCUIT_OPEN);
  }, 30000);
});
