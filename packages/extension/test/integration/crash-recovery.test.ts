/**
 * @file crash-recovery.test.ts
 * @brief Extension Host integration tests for crash recovery on startup
 *
 * These tests require VS Code Extension Host runtime to test crash recovery behavior.
 * They verify that crashed jobs (claimed but incomplete) are detected and quarantined
 * to DLQ when the Extension Host restarts.
 *
 * Run with: vscb script run tests.debug-single --param path=<path-to-this-file> --param line=<test-line>
 *
 * Testing Strategy:
 * - Component tests (crash-recovery.test.ts) validate detection logic
 * - This integration test validates end-to-end behavior with Extension Host
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import { detectCrashedJobs } from '../../src/core/fs-bridge/recovery';

/**
 * Test Doc: Crash Recovery Integration Test
 *
 * Purpose: Validate end-to-end crash detection and DLQ quarantine across Extension Host restart
 *
 * Why: Extension Host integration test exercises real VS Code APIs and filesystem behavior;
 *      component tests use NodeFilesystem which doesn't cover VS Code-specific edge cases
 *
 * Contract: detectCrashedJobs() correctly identifies crashed jobs using vscode.workspace.fs
 *          and creates DLQ markers via atomic writes in Extension Host environment
 *
 * Critical Scenario: Extension Host crashes while processing jobs, leaving claimed.json
 *                   without done markers; on restart, detectCrashedJobs() quarantines
 *                   these jobs to DLQ with E_CRASH_RECOVERY reason
 */
describe('Crash Recovery - Extension Host Integration', () => {
  let testWorkspaceDir: string;
  let executeDir: string;

  beforeEach(async () => {
    // Use actual workspace folder for Extension Host tests
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open - Extension Host tests require workspace');
    }

    testWorkspaceDir = workspaceFolders[0].uri.fsPath;
    executeDir = path.join(testWorkspaceDir, '.vsc-bridge-crash-test', 'execute');

    // Create test execute directory
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(executeDir));
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await vscode.workspace.fs.delete(
        vscode.Uri.file(path.join(testWorkspaceDir, '.vsc-bridge-crash-test')),
        { recursive: true }
      );
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Test ID: CRASH-RECOVERY-T020
   *
   * Purpose: Verify crash detection works end-to-end with Extension Host restart simulation
   *
   * Why: Integration test validates real-world crash recovery behavior using VS Code APIs;
   *      ensures component test assumptions hold in production Extension Host environment
   *
   * Contract: detectCrashedJobs(executeDir, bridgeId, output) detects crashed jobs created
   *          via vscode.workspace.fs and creates DLQ markers atomically
   *
   * Usage Notes: Simulates Extension Host crash by creating job with claimed.json, then
   *             calling detectCrashedJobs() as if Extension Host restarted; validates
   *             DLQ quarantine and stats accuracy in real VS Code environment
   *
   * Quality Contribution: End-to-end validation of crash recovery; catches VS Code API
   *                       compatibility issues; validates atomic write behavior in Extension Host
   *
   * Worked Example:
   *   Given: Extension Host was processing job-001 (command.json + claimed.json written)
   *          THEN Extension Host crashed (done marker never written)
   *          THEN Extension Host restarts
   *   When: BridgeManager.setupBridgeServices() calls detectCrashedJobs()
   *   Then: stats = { scanned: 1, crashed: 1, quarantined: 1, skipped: 0 }
   *         AND DLQ marker created with reason='E_CRASH_RECOVERY'
   *         AND job directory preserved for post-mortem analysis
   */
  it('T020: should detect crashed job and quarantine to DLQ on Extension Host restart', async () => {
    // ARRANGE: Simulate Extension Host crash scenario
    // Create job that was actively processing when crash occurred
    const jobId = 'crashed-job-001';
    const jobDir = path.join(executeDir, jobId);

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(jobDir));

    // 1. Write command.json (job was created)
    const commandJson = {
      id: jobId,
      scriptName: 'debug.step-over',
      params: { foo: 'bar' }
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(jobDir, 'command.json')),
      Buffer.from(JSON.stringify(commandJson, null, 2))
    );

    // 2. Write claimed.json (job was claimed and processing started)
    const claimedJson = {
      bridgeId: 'test-bridge-restart',
      pid: process.pid,
      claimedAt: new Date().toISOString()
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(jobDir, 'claimed.json')),
      Buffer.from(JSON.stringify(claimedJson, null, 2))
    );

    // 3. NO done marker written (Extension Host crashed before completion)
    // This is the critical crash state: claimed + no done = crashed

    // ACT: Simulate Extension Host restart and crash detection
    // BridgeManager.setupBridgeServices() calls detectCrashedJobs() on startup
    const stats = await detectCrashedJobs(executeDir, 'test-bridge-restart', undefined);

    // ASSERT: Crash detected and quarantined to DLQ
    expect(stats.scanned).toBe(1);
    expect(stats.crashed).toBe(1);
    expect(stats.quarantined).toBe(1);
    expect(stats.skipped).toBe(0);

    // Verify DLQ marker created
    const dlqPath = vscode.Uri.file(path.join(jobDir, 'dlq'));
    const dlqExists = await vscode.workspace.fs.stat(dlqPath)
      .then(() => true)
      .catch(() => false);

    expect(dlqExists).toBe(true);

    // Verify DLQ marker contents
    const dlqContent = await vscode.workspace.fs.readFile(dlqPath);
    const dlqMarker = JSON.parse(Buffer.from(dlqContent).toString('utf8'));

    expect(dlqMarker.reason).toBe('E_CRASH_RECOVERY');
    expect(dlqMarker.bridgeId).toBe('test-bridge-restart');
    expect(dlqMarker.timestamp).toBeDefined();
    expect(dlqMarker.pid).toBe(process.pid);
    expect(dlqMarker.scriptName).toBe('debug.step-over');
  });

  /**
   * Test ID: CRASH-RECOVERY-T020b
   *
   * Purpose: Verify complete jobs are not quarantined (no false positives)
   *
   * Why: Happy path integration test ensures crash detector doesn't quarantine jobs
   *      that completed successfully before Extension Host restart
   *
   * Contract: detectCrashedJobs() returns crashed=0 for jobs with done markers
   *
   * Usage Notes: Validates Extension Host restart after clean shutdown; ensures
   *             crash detector distinguishes complete vs crashed jobs correctly
   *
   * Quality Contribution: Prevents false positives in integration environment;
   *                       validates done marker detection with vscode.workspace.fs
   *
   * Worked Example:
   *   Given: job-complete with command.json + claimed.json + done marker
   *   When: const stats = await detectCrashedJobs(executeDir, 'bridge-1', undefined)
   *   Then: stats = { scanned: 1, crashed: 0, quarantined: 0, skipped: 1 }
   *         AND no DLQ marker created
   */
  it('T020b: should not quarantine complete jobs (no false positives)', async () => {
    // ARRANGE: Create complete job (has done marker)
    const jobId = 'complete-job-001';
    const jobDir = path.join(executeDir, jobId);

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(jobDir));

    // Write command.json
    const commandJson = {
      id: jobId,
      scriptName: 'bp.list',
      params: {}
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(jobDir, 'command.json')),
      Buffer.from(JSON.stringify(commandJson, null, 2))
    );

    // Write claimed.json
    const claimedJson = {
      bridgeId: 'test-bridge',
      pid: process.pid,
      claimedAt: new Date().toISOString()
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(jobDir, 'claimed.json')),
      Buffer.from(JSON.stringify(claimedJson, null, 2))
    );

    // Write done marker (job completed successfully)
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(jobDir, 'done')),
      Buffer.from('')
    );

    // ACT: Detect crashed jobs on restart
    const stats = await detectCrashedJobs(executeDir, 'test-bridge', undefined);

    // ASSERT: Complete job is NOT quarantined
    expect(stats.scanned).toBe(1);
    expect(stats.crashed).toBe(0);
    expect(stats.quarantined).toBe(0);
    expect(stats.skipped).toBe(1);

    // Verify NO DLQ marker created
    const dlqPath = vscode.Uri.file(path.join(jobDir, 'dlq'));
    const dlqExists = await vscode.workspace.fs.stat(dlqPath)
      .then(() => true)
      .catch(() => false);

    expect(dlqExists).toBe(false);
  });

  /**
   * Test ID: CRASH-RECOVERY-T020c
   *
   * Purpose: Verify multiple crashed jobs are all quarantined in single pass
   *
   * Why: Batch processing validation in Extension Host environment; ensures detector
   *      handles multiple crashes without data loss or partial quarantine
   *
   * Contract: detectCrashedJobs() quarantines all crashed jobs atomically
   *
   * Usage Notes: Common scenario when Extension Host crashes while processing queue;
   *             validates DLQ marker creation scales correctly in production
   *
   * Quality Contribution: Validates batch quarantine in Extension Host; ensures no
   *                       performance issues with multiple DLQ writes via vscode.workspace.fs
   *
   * Worked Example:
   *   Given: 3 crashed jobs (all with claimed.json, no done)
   *   When: const stats = await detectCrashedJobs(executeDir, 'bridge-1', undefined)
   *   Then: stats = { scanned: 3, crashed: 3, quarantined: 3, skipped: 0 }
   *         AND all 3 jobs have DLQ markers with reason='E_CRASH_RECOVERY'
   */
  it('T020c: should quarantine multiple crashed jobs in single pass', async () => {
    // ARRANGE: Create 3 crashed jobs
    const crashedJobs = ['crashed-001', 'crashed-002', 'crashed-003'];

    for (const jobId of crashedJobs) {
      const jobDir = path.join(executeDir, jobId);
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(jobDir));

      // Write command.json
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(path.join(jobDir, 'command.json')),
        Buffer.from(JSON.stringify({ id: jobId, scriptName: 'test', params: {} }))
      );

      // Write claimed.json
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(path.join(jobDir, 'claimed.json')),
        Buffer.from(JSON.stringify({ bridgeId: 'test-bridge', pid: process.pid, claimedAt: new Date().toISOString() }))
      );

      // NO done marker (all crashed)
    }

    // ACT: Detect all crashed jobs
    const stats = await detectCrashedJobs(executeDir, 'test-bridge', undefined);

    // ASSERT: All 3 jobs quarantined
    expect(stats.scanned).toBe(3);
    expect(stats.crashed).toBe(3);
    expect(stats.quarantined).toBe(3);
    expect(stats.skipped).toBe(0);

    // Verify all have DLQ markers
    for (const jobId of crashedJobs) {
      const dlqPath = vscode.Uri.file(path.join(executeDir, jobId, 'dlq'));
      const dlqExists = await vscode.workspace.fs.stat(dlqPath)
        .then(() => true)
        .catch(() => false);

      expect(dlqExists).toBe(true);

      const dlqContent = await vscode.workspace.fs.readFile(dlqPath);
      const dlqMarker = JSON.parse(Buffer.from(dlqContent).toString('utf8'));

      expect(dlqMarker.reason).toBe('E_CRASH_RECOVERY');
    }
  });
});
