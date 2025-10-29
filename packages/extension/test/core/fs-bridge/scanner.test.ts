/**
 * @file scanner.test.ts
 * @brief Unit tests for job scanner module using IFilesystem abstraction
 *
 * Tests the scanForUnclaimedJobs() function in isolation using NodeFilesystem adapter.
 * Covers capacity checks, DLQ filtering, optimization logic, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { scanForUnclaimedJobs } from '../../../src/core/fs-bridge/scanner';
import { NodeFilesystem } from '../../../src/core/fs-bridge/fs-abstraction';

/**
 * Test Doc: Job Scanner Core Functionality
 *
 * Critical: The scanner is the safety net for missed FileSystemWatcher events.
 * It MUST correctly identify unclaimed jobs while avoiding DLQ jobs and respecting capacity.
 *
 * Key behaviors:
 * - Returns array of job directories that need processing
 * - Filters out DLQ jobs (has .dlq.json marker)
 * - Filters out claimed jobs (has claimed.json)
 * - Filters out completed jobs (has done marker)
 * - Respects capacity limit (early exit when inFlight >= maxConcurrent)
 * - Optimizes stat calls (early exit on missing command.json)
 * - Handles errors gracefully (returns empty array, logs warning)
 */

describe('Job Scanner - Core Functionality', () => {
  let testDir: string;
  let executeDir: string;
  let fs: NodeFilesystem;

  beforeEach(async () => {
    // Create filesystem adapter first
    fs = new NodeFilesystem();

    // Create temp test directory
    testDir = path.join(process.cwd(), 'scratch', `scanner-test-${Date.now()}`);
    executeDir = path.join(testDir, 'execute');
    await fs.promises.mkdir(executeDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * T003: Basic unclaimed job detection
   */
  it('T003: should detect unclaimed jobs with command.json and no claimed.json', async () => {
    // Arrange: Create unclaimed job
    const jobId = 'job-001';
    const jobDir = path.join(executeDir, jobId);
    await fs.promises.mkdir(jobDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(jobDir, 'command.json'),
      JSON.stringify({ id: jobId, scriptName: 'test' })
    );

    // Act
    const result = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(jobDir);
  });

  /**
   * T004: Claimed job filtering
   */
  it('T004: should skip jobs that have been claimed (claimed.json exists)', async () => {
    // Arrange: Create claimed job
    const jobId = 'job-002';
    const jobDir = path.join(executeDir, jobId);
    await fs.promises.mkdir(jobDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(jobDir, 'command.json'),
      JSON.stringify({ id: jobId, scriptName: 'test' })
    );
    await fs.promises.writeFile(
      path.join(jobDir, 'claimed.json'),
      JSON.stringify({ bridgeId: 'test-bridge', timestamp: Date.now() })
    );

    // Act
    const result = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(0);
  });

  /**
   * T005: Completed job filtering
   */
  it('T005: should skip jobs that are done (done marker exists)', async () => {
    // Arrange: Create completed job
    const jobId = 'job-003';
    const jobDir = path.join(executeDir, jobId);
    await fs.promises.mkdir(jobDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(jobDir, 'command.json'),
      JSON.stringify({ id: jobId, scriptName: 'test' })
    );
    await fs.promises.writeFile(path.join(jobDir, 'done'), '');

    // Act
    const result = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(0);
  });

  /**
   * T006: DLQ job filtering
   */
  it('T006: should skip DLQ jobs (dlq marker exists)', async () => {
    // Arrange: Create DLQ job
    const jobId = 'job-004';
    const jobDir = path.join(executeDir, jobId);
    await fs.promises.mkdir(jobDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(jobDir, 'command.json'),
      JSON.stringify({ id: jobId, scriptName: 'test' })
    );
    // DLQ marker is 'dlq' file (no extension)
    await fs.promises.writeFile(
      path.join(jobDir, 'dlq'),
      JSON.stringify({ reason: 'TEST_FAILURE', timestamp: new Date().toISOString() })
    );

    // Act
    const result = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(0);
  });

  /**
   * T007: Capacity limit (early exit)
   */
  it('T007: should return empty array when inFlight >= maxConcurrent (capacity check)', async () => {
    // Arrange: Create unclaimed job
    const jobId = 'job-005';
    const jobDir = path.join(executeDir, jobId);
    await fs.promises.mkdir(jobDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(jobDir, 'command.json'),
      JSON.stringify({ id: jobId, scriptName: 'test' })
    );

    // Act: inFlight (5) >= maxConcurrent (5)
    const result = await scanForUnclaimedJobs(executeDir, 5, 5, fs);

    // Assert
    expect(result).toHaveLength(0);
  });

  /**
   * T008: Multiple unclaimed jobs
   */
  it('T008: should detect multiple unclaimed jobs in single scan', async () => {
    // Arrange: Create 3 unclaimed jobs
    const jobIds = ['job-006', 'job-007', 'job-008'];
    for (const jobId of jobIds) {
      const jobDir = path.join(executeDir, jobId);
      await fs.promises.mkdir(jobDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(jobDir, 'command.json'),
        JSON.stringify({ id: jobId, scriptName: 'test' })
      );
    }

    // Act
    const result = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(3);
    expect(result).toContain(path.join(executeDir, 'job-006'));
    expect(result).toContain(path.join(executeDir, 'job-007'));
    expect(result).toContain(path.join(executeDir, 'job-008'));
  });

  /**
   * T009: Mixed job states
   */
  it('T009: should correctly filter mixed job states (unclaimed, claimed, done, DLQ)', async () => {
    // Arrange: Create 4 jobs with different states
    const unclaimedDir = path.join(executeDir, 'unclaimed-job');
    await fs.promises.mkdir(unclaimedDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(unclaimedDir, 'command.json'),
      JSON.stringify({ id: 'unclaimed-job', scriptName: 'test' })
    );

    const claimedDir = path.join(executeDir, 'claimed-job');
    await fs.promises.mkdir(claimedDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(claimedDir, 'command.json'),
      JSON.stringify({ id: 'claimed-job', scriptName: 'test' })
    );
    await fs.promises.writeFile(path.join(claimedDir, 'claimed.json'), '{}');

    const doneDir = path.join(executeDir, 'done-job');
    await fs.promises.mkdir(doneDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(doneDir, 'command.json'),
      JSON.stringify({ id: 'done-job', scriptName: 'test' })
    );
    await fs.promises.writeFile(path.join(doneDir, 'done'), '');

    const dlqDir = path.join(executeDir, 'dlq-job');
    await fs.promises.mkdir(dlqDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(dlqDir, 'command.json'),
      JSON.stringify({ id: 'dlq-job', scriptName: 'test' })
    );
    // DLQ marker is 'dlq' file (no extension)
    await fs.promises.writeFile(
      path.join(dlqDir, 'dlq'),
      JSON.stringify({ reason: 'TEST', timestamp: new Date().toISOString() })
    );

    // Act
    const result = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(unclaimedDir);
  });

  /**
   * T010: Non-directory entries (optimization check)
   */
  it('T010: should skip non-directory entries in execute folder', async () => {
    // Arrange: Create file in execute dir (not a job directory)
    await fs.promises.writeFile(path.join(executeDir, 'random-file.txt'), 'test');

    // Also create valid unclaimed job
    const jobDir = path.join(executeDir, 'valid-job');
    await fs.promises.mkdir(jobDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(jobDir, 'command.json'),
      JSON.stringify({ id: 'valid-job', scriptName: 'test' })
    );

    // Act
    const result = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(jobDir);
  });

  /**
   * T011: Missing command.json (early exit optimization)
   */
  it('T011: should skip job directories without command.json (early exit)', async () => {
    // Arrange: Create directory without command.json
    const incompleteDir = path.join(executeDir, 'incomplete-job');
    await fs.promises.mkdir(incompleteDir, { recursive: true });
    await fs.promises.writeFile(path.join(incompleteDir, 'claimed.json'), '{}');

    // Also create valid unclaimed job
    const validDir = path.join(executeDir, 'valid-job');
    await fs.promises.mkdir(validDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(validDir, 'command.json'),
      JSON.stringify({ id: 'valid-job', scriptName: 'test' })
    );

    // Act
    const result = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(validDir);
  });
});

/**
 * Test Doc: Error Handling and Edge Cases
 *
 * Critical: Scanner runs every 2 seconds and must be resilient.
 * Errors should not crash the interval timer or spam logs.
 */
describe('Job Scanner - Error Handling', () => {
  let fs: NodeFilesystem;

  beforeEach(() => {
    fs = new NodeFilesystem();
  });

  /**
   * T012: Error handling for missing execute directory
   * NOTE: This is now an Extension Host integration test (not Vitest unit test)
   * See: test/integration/scanner-watcher.test.ts
   */
  it.skip('T012: MOVED TO INTEGRATION TEST - see scanner-watcher.test.ts', () => {
    // This test requires Extension Host to properly test FileSystemWatcher behavior
  });

  /**
   * T013: Error handling for concurrent watcher and scanner
   * NOTE: This is now an Extension Host integration test (not Vitest unit test)
   * See: test/integration/scanner-watcher.test.ts
   */
  it.skip('T013: MOVED TO INTEGRATION TEST - see scanner-watcher.test.ts', () => {
    // This test requires Extension Host to test watcher-scanner race conditions
  });

  /**
   * Additional error test: Nonexistent execute directory
   */
  it('should return empty array when execute directory does not exist', async () => {
    // Arrange: Use path that doesn't exist
    const nonexistentDir = path.join(process.cwd(), 'nonexistent-dir-' + Date.now());

    // Act
    const result = await scanForUnclaimedJobs(nonexistentDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(0);
  });
});
