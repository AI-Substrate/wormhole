/**
 * @fileoverview Crash Recovery Component Tests
 *
 * Tests the filesystem-based crash detection contract:
 * "Given job directory with claimed.json + no done + no dlq → detect as crashed"
 *
 * Testing Philosophy:
 * - Component tests validate detection logic correctness
 * - Use NodeFilesystem for real filesystem operations (fast, no Extension Host)
 * - E2E integration test (T020) validates real crash scenario with Extension Host
 *
 * Test Organization:
 * - Core Detection Tests (T003-T008): State combinations, batch processing
 * - Edge Case Tests (T009-T014): Error handling, race conditions, malformed data
 * - Cleanup Integration (T014a): Validates cleanup preserves DLQ jobs
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NodeFilesystem } from '../../../src/core/fs-bridge/fs-abstraction';

/**
 * Test fixture specification
 */
interface JobFixture {
  name: string;
  hasCommand: boolean;
  hasClaimed: boolean;
  hasDone: boolean;
  hasDlq: boolean;
  claimedData?: any; // Optional malformed data for T009
}

/**
 * Create job directory fixture with specific marker files
 */
async function createJobFixture(
  executeDir: string,
  fixture: JobFixture,
  filesystem: NodeFilesystem
): Promise<string> {
  const jobDir = path.join(executeDir, fixture.name);
  await filesystem.promises.mkdir(jobDir, { recursive: true });

  if (fixture.hasCommand) {
    await filesystem.promises.writeFile(
      path.join(jobDir, 'command.json'),
      JSON.stringify({
        id: fixture.name,
        scriptName: 'test-script',
        params: {}
      })
    );
  }

  if (fixture.hasClaimed) {
    const claimData = fixture.claimedData || {
      bridgeId: 'test-bridge',
      pid: process.pid,
      claimedAt: new Date().toISOString()
    };
    await filesystem.promises.writeFile(
      path.join(jobDir, 'claimed.json'),
      typeof claimData === 'string' ? claimData : JSON.stringify(claimData)
    );
  }

  if (fixture.hasDone) {
    await filesystem.promises.writeFile(path.join(jobDir, 'done'), '');
  }

  if (fixture.hasDlq) {
    await filesystem.promises.writeFile(
      path.join(jobDir, 'dlq'),
      JSON.stringify({
        reason: 'E_SCRIPT_FAILED',
        timestamp: new Date().toISOString(),
        bridgeId: 'test-bridge',
        pid: process.pid
      })
    );
  }

  return jobDir;
}

describe('Crash Recovery - Core Detection Tests', () => {
  let testDir: string;
  let executeDir: string;
  let filesystem: NodeFilesystem;

  beforeEach(() => {
    filesystem = new NodeFilesystem();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-recovery-test-'));
    executeDir = path.join(testDir, 'execute');
    fs.mkdirSync(executeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Test ID: CRASH-RECOVERY-T003
   *
   * Purpose: Verify detectCrashedJobs() identifies jobs with claimed.json but no done marker
   *
   * Why: Crash detection is core safety mechanism; must correctly identify interrupted jobs
   *      to prevent lost work or stale state
   *
   * Contract: detectCrashedJobs(executeDir, bridgeId, output) returns CrashRecoveryStats
   *          with counts of scanned, crashed, quarantined, and skipped jobs
   *
   * Usage Notes: Call once on startup before watcher starts; pass OutputChannel for logging
   *
   * Quality Contribution: Critical path test; prevents false negatives (missed crashes)
   *                       and false positives (incorrectly quarantining active jobs)
   *
   * Worked Example:
   *   Given: job-001 with command.json + claimed.json, no done
   *   When: const stats = await detectCrashedJobs(executeDir, 'bridge-1', mockOutput)
   *   Then: stats = { scanned: 1, crashed: 1, quarantined: 1, skipped: 0 }
   *         AND dlq marker created with reason='E_CRASH_RECOVERY'
   *         AND OutputChannel logs "Crash recovery: scanned 1, quarantined 1"
   */
  it('FS-BRIDGE-CRASH-RECOVERY-003: should detect single crashed job', async () => {
    // Create crashed job fixture
    await createJobFixture(executeDir, {
      name: 'job-001',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    // Import function (will fail until implemented)
    const { detectCrashedJobs } = await import('../../../src/core/fs-bridge/recovery');

    // Execute
    const stats = await detectCrashedJobs(executeDir, 'test-bridge', undefined);

    // Verify stats
    expect(stats.scanned).toBe(1);
    expect(stats.crashed).toBe(1);
    expect(stats.quarantined).toBe(1);
    expect(stats.skipped).toBe(0);

    // Verify DLQ marker created
    const dlqPath = path.join(executeDir, 'job-001', 'dlq');
    expect(fs.existsSync(dlqPath)).toBe(true);

    const dlqMarker = JSON.parse(fs.readFileSync(dlqPath, 'utf8'));
    expect(dlqMarker.reason).toBe('E_CRASH_RECOVERY');
    expect(dlqMarker.timestamp).toBeDefined();
    expect(dlqMarker.bridgeId).toBe('test-bridge');
  });

  /**
   * Test ID: CRASH-RECOVERY-T004
   *
   * Purpose: Verify detectCrashedJobs() returns zero crashes when all jobs are complete
   *
   * Why: Happy path validation ensures detection doesn't create false positives by
   *      quarantining jobs that completed successfully before startup
   *
   * Contract: detectCrashedJobs(executeDir, bridgeId, output) returns CrashRecoveryStats
   *          with crashed=0 when all jobs have done markers
   *
   * Usage Notes: Call on clean startup after successful previous session; validates no
   *             crash recovery needed when Extension Host shut down cleanly
   *
   * Quality Contribution: Prevents false positives; ensures complete jobs are never
   *                       quarantined to DLQ; validates skipped count accuracy
   *
   * Worked Example:
   *   Given: 2 jobs with command.json + claimed.json + done markers
   *   When: const stats = await detectCrashedJobs(executeDir, 'bridge-1', undefined)
   *   Then: stats = { scanned: 2, crashed: 0, quarantined: 0, skipped: 2 }
   *         AND no DLQ markers created
   */
  it('FS-BRIDGE-CRASH-RECOVERY-004: should return zero crashes on clean startup', async () => {
    // Create complete jobs
    await createJobFixture(executeDir, {
      name: 'job-001',
      hasCommand: true,
      hasClaimed: true,
      hasDone: true,
      hasDlq: false
    }, filesystem);

    await createJobFixture(executeDir, {
      name: 'job-002',
      hasCommand: true,
      hasClaimed: true,
      hasDone: true,
      hasDlq: false
    }, filesystem);

    const { detectCrashedJobs } = await import('../../../src/core/fs-bridge/recovery');

    const stats = await detectCrashedJobs(executeDir, 'test-bridge', undefined);

    expect(stats.scanned).toBe(2);
    expect(stats.crashed).toBe(0);
    expect(stats.quarantined).toBe(0);
    expect(stats.skipped).toBe(2);
  });

  /**
   * Test ID: CRASH-RECOVERY-T007
   *
   * Purpose: Verify detectCrashedJobs() detects and quarantines multiple crashed jobs in single scan
   *
   * Why: Batch processing validation ensures detector handles multiple crashes correctly
   *      without data loss or partial quarantine
   *
   * Contract: detectCrashedJobs(executeDir, bridgeId, output) returns CrashRecoveryStats
   *          with crashed=N where N is count of jobs with claimed + no done + no dlq
   *
   * Usage Notes: Common scenario after Extension Host crash while processing multiple jobs;
   *             validates all crashed jobs are quarantined atomically in single pass
   *
   * Quality Contribution: Prevents partial recovery; ensures crash detector is not O(1)
   *                       limited; validates DLQ marker creation scales linearly
   *
   * Worked Example:
   *   Given: 3 jobs with command.json + claimed.json, all missing done markers
   *   When: const stats = await detectCrashedJobs(executeDir, 'bridge-1', undefined)
   *   Then: stats = { scanned: 3, crashed: 3, quarantined: 3, skipped: 0 }
   *         AND all 3 jobs have DLQ markers with reason='E_CRASH_RECOVERY'
   */
  it('FS-BRIDGE-CRASH-RECOVERY-007: should detect multiple crashed jobs', async () => {
    // Create 3 crashed jobs
    await createJobFixture(executeDir, {
      name: 'job-001',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    await createJobFixture(executeDir, {
      name: 'job-002',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    await createJobFixture(executeDir, {
      name: 'job-003',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    const { detectCrashedJobs } = await import('../../../src/core/fs-bridge/recovery');

    const stats = await detectCrashedJobs(executeDir, 'test-bridge', undefined);

    expect(stats.scanned).toBe(3);
    expect(stats.crashed).toBe(3);
    expect(stats.quarantined).toBe(3);
    expect(stats.skipped).toBe(0);

    // Verify all have DLQ markers
    for (let i = 1; i <= 3; i++) {
      const dlqPath = path.join(executeDir, `job-00${i}`, 'dlq');
      expect(fs.existsSync(dlqPath)).toBe(true);
    }
  });

  /**
   * Test ID: CRASH-RECOVERY-T008
   *
   * Purpose: Verify detectCrashedJobs() correctly filters job states (complete/crashed/unclaimed)
   *
   * Why: State filtering correctness is critical; detector must distinguish between jobs
   *      that completed normally, crashed during processing, and never started
   *
   * Contract: detectCrashedJobs(executeDir, bridgeId, output) returns CrashRecoveryStats
   *          with accurate counts for each state category (crashed vs skipped)
   *
   * Usage Notes: Real-world scenario with mixed job outcomes; validates detector doesn't
   *             over-quarantine or miss actual crashes when job states vary
   *
   * Quality Contribution: Comprehensive state validation; prevents false positives (quarantining
   *                       complete/unclaimed jobs) and false negatives (missing crashes)
   *
   * Worked Example:
   *   Given: 5 jobs - 2 complete (done markers), 1 crashed (claimed, no done), 2 unclaimed
   *   When: const stats = await detectCrashedJobs(executeDir, 'bridge-1', undefined)
   *   Then: stats = { scanned: 5, crashed: 1, quarantined: 1, skipped: 4 }
   *         AND only crashed job has DLQ marker
   */
  it('FS-BRIDGE-CRASH-RECOVERY-008: should handle mixed job states correctly', async () => {
    // 2 complete
    await createJobFixture(executeDir, {
      name: 'job-complete-1',
      hasCommand: true,
      hasClaimed: true,
      hasDone: true,
      hasDlq: false
    }, filesystem);

    await createJobFixture(executeDir, {
      name: 'job-complete-2',
      hasCommand: true,
      hasClaimed: true,
      hasDone: true,
      hasDlq: false
    }, filesystem);

    // 1 crashed
    await createJobFixture(executeDir, {
      name: 'job-crashed',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    // 2 unclaimed
    await createJobFixture(executeDir, {
      name: 'job-unclaimed-1',
      hasCommand: true,
      hasClaimed: false,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    await createJobFixture(executeDir, {
      name: 'job-unclaimed-2',
      hasCommand: true,
      hasClaimed: false,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    const { detectCrashedJobs } = await import('../../../src/core/fs-bridge/recovery');

    const stats = await detectCrashedJobs(executeDir, 'test-bridge', undefined);

    expect(stats.scanned).toBe(5);
    expect(stats.crashed).toBe(1);
    expect(stats.quarantined).toBe(1);
    expect(stats.skipped).toBe(4);

    // Only crashed job should have DLQ marker
    expect(fs.existsSync(path.join(executeDir, 'job-crashed', 'dlq'))).toBe(true);
    expect(fs.existsSync(path.join(executeDir, 'job-complete-1', 'dlq'))).toBe(false);
    expect(fs.existsSync(path.join(executeDir, 'job-unclaimed-1', 'dlq'))).toBe(false);
  });
});

describe('Crash Recovery - Edge Cases', () => {
  let testDir: string;
  let executeDir: string;
  let filesystem: NodeFilesystem;

  beforeEach(() => {
    filesystem = new NodeFilesystem();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-recovery-test-'));
    executeDir = path.join(testDir, 'execute');
    fs.mkdirSync(executeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Test ID: CRASH-RECOVERY-T005
   *
   * Purpose: Verify DLQ marker is created with correct E_CRASH_RECOVERY reason code
   *
   * Why: DLQ reason code distinguishes crash recovery from other failure types (script
   *      errors, timeouts, etc); critical for post-mortem analysis and metrics
   *
   * Contract: detectCrashedJobs() calls writeDlqMarker() with reason='E_CRASH_RECOVERY'
   *          for each crashed job, creating dlq file with metadata
   *
   * Usage Notes: DLQ marker allows operators to distinguish Extension Host crashes from
   *             other job failures; enables crash-specific analytics and alerting
   *
   * Quality Contribution: Validates DLQ integration; ensures crash recovery jobs are
   *                       identifiable in DLQ; prevents reason code confusion
   *
   * Worked Example:
   *   Given: job-001 with command.json + claimed.json, no done marker
   *   When: await detectCrashedJobs(executeDir, 'bridge-1', undefined)
   *   Then: dlq marker exists at job-001/dlq with { reason: 'E_CRASH_RECOVERY',
   *         bridgeId: 'bridge-1', timestamp: ISO8601, pid: number }
   */
  it('FS-BRIDGE-CRASH-RECOVERY-005: should create DLQ marker with E_CRASH_RECOVERY reason', async () => {
    await createJobFixture(executeDir, {
      name: 'job-001',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    const { detectCrashedJobs } = await import('../../../src/core/fs-bridge/recovery');

    await detectCrashedJobs(executeDir, 'test-bridge', undefined);

    const dlqPath = path.join(executeDir, 'job-001', 'dlq');
    const dlqMarker = JSON.parse(fs.readFileSync(dlqPath, 'utf8'));

    expect(dlqMarker.reason).toBe('E_CRASH_RECOVERY');
    expect(dlqMarker.bridgeId).toBe('test-bridge');
    expect(dlqMarker.timestamp).toBeDefined();
    expect(dlqMarker.pid).toBe(process.pid);
  });

  /**
   * Test ID: CRASH-RECOVERY-T006
   *
   * Purpose: Verify detectCrashedJobs() logs recovery actions to VS Code OutputChannel
   *
   * Why: OutputChannel logging provides visibility into crash recovery during Extension
   *      Host startup; critical for debugging and operational awareness
   *
   * Contract: detectCrashedJobs(executeDir, bridgeId, output) calls output.appendLine()
   *          with summary messages when OutputChannel is provided
   *
   * Usage Notes: Pass VS Code OutputChannel to get formatted logs in VS Code UI; omit
   *             parameter to use console.log fallback (test environments)
   *
   * Quality Contribution: Validates observability integration; ensures operators can see
   *                       crash recovery events without reading file system directly
   *
   * Worked Example:
   *   Given: job-001 crashed (claimed, no done), OutputChannel mock provided
   *   When: await detectCrashedJobs(executeDir, 'bridge-1', mockOutput)
   *   Then: mockOutput.appendLine called with '[Recovery]' prefix containing
   *         'scanned' and 'quarantined' keywords in summary message
   */
  it('FS-BRIDGE-CRASH-RECOVERY-006: should log to OutputChannel when provided', async () => {
    await createJobFixture(executeDir, {
      name: 'job-001',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    // Mock OutputChannel
    const mockOutput = {
      appendLine: vi.fn()
    };

    const { detectCrashedJobs } = await import('../../../src/core/fs-bridge/recovery');

    await detectCrashedJobs(executeDir, 'test-bridge', mockOutput as any);

    expect(mockOutput.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[Recovery]')
    );
    expect(mockOutput.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('scanned')
    );
    expect(mockOutput.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('quarantined')
    );
  });

  /**
   * Test ID: CRASH-RECOVERY-T009
   *
   * Purpose: Verify detectCrashedJobs() handles malformed claimed.json without crashing
   *
   * Why: Defensive error handling prevents crash detector itself from failing due to
   *      corrupted filesystem state; ensures robustness under adverse conditions
   *
   * Contract: detectCrashedJobs() catches JSON parse errors, logs warning, and continues
   *          scanning; still quarantines job despite malformed claim data
   *
   * Usage Notes: Common scenario when filesystem corruption or incomplete writes occur;
   *             detector prioritizes availability over perfect data validation
   *
   * Quality Contribution: Validates graceful degradation; ensures one bad job doesn't
   *                       prevent detection of other crashed jobs; prevents cascading failures
   *
   * Worked Example:
   *   Given: job-001 with command.json + claimed.json='{ invalid json', no done
   *   When: const stats = await detectCrashedJobs(executeDir, 'bridge-1', undefined)
   *   Then: stats.crashed >= 1 (job still quarantined despite parse error)
   *         AND dlq marker created
   *         AND no exception thrown
   */
  it('FS-BRIDGE-CRASH-RECOVERY-009: should handle malformed claimed.json gracefully', async () => {
    await createJobFixture(executeDir, {
      name: 'job-001',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: false,
      claimedData: '{ invalid json' // Malformed JSON
    }, filesystem);

    const { detectCrashedJobs } = await import('../../../src/core/fs-bridge/recovery');

    // Should not throw
    const stats = await detectCrashedJobs(executeDir, 'test-bridge', undefined);

    // Job should still be quarantined despite parse error
    expect(stats.crashed).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(executeDir, 'job-001', 'dlq'))).toBe(true);
  });

  /**
   * Test ID: CRASH-RECOVERY-T010
   *
   * Purpose: Verify detectCrashedJobs() skips directories without command.json (orphaned dirs)
   *
   * Why: Prevents false positives from orphaned directories created but never populated
   *      with command data; avoids quarantining non-jobs
   *
   * Contract: detectCrashedJobs() checks for command.json existence before evaluating
   *          crash state; increments skipped count for directories without commands
   *
   * Usage Notes: Common when job creation interrupted (mkdir succeeded, write failed);
   *             orphaned job cleanup is handled separately by cleanOrphanedJobs()
   *
   * Quality Contribution: Avoids false positives; ensures only valid job directories are
   *                       evaluated for crash detection; validates early exit optimization
   *
   * Worked Example:
   *   Given: orphaned-dir/ with claimed.json but no command.json
   *   When: const stats = await detectCrashedJobs(executeDir, 'bridge-1', undefined)
   *   Then: stats = { scanned: 1, crashed: 0, quarantined: 0, skipped: 1 }
   *         AND no DLQ marker created for orphaned-dir
   */
  it('FS-BRIDGE-CRASH-RECOVERY-010: should skip directories without command.json', async () => {
    // Create directory without command.json
    const jobDir = path.join(executeDir, 'orphaned-dir');
    await filesystem.promises.mkdir(jobDir, { recursive: true });
    await filesystem.promises.writeFile(path.join(jobDir, 'claimed.json'), '{}');

    const { detectCrashedJobs } = await import('../../../src/core/fs-bridge/recovery');

    const stats = await detectCrashedJobs(executeDir, 'test-bridge', undefined);

    // Should be skipped
    expect(stats.scanned).toBe(1);
    expect(stats.crashed).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(fs.existsSync(path.join(jobDir, 'dlq'))).toBe(false);
  });

  /**
   * Test ID: CRASH-RECOVERY-T011
   *
   * Purpose: Verify detectCrashedJobs() handles empty execute directory gracefully (no-op)
   *
   * Why: Edge case validation for first Extension Host startup or after complete cleanup;
   *      ensures detector doesn't fail when no jobs exist
   *
   * Contract: detectCrashedJobs() returns stats with all counters at zero when execute
   *          directory contains no job directories
   *
   * Usage Notes: Common scenario on fresh extension installation or after aggressive cleanup;
   *             validates detector has no minimum data requirements
   *
   * Quality Contribution: Validates edge case handling; ensures detector is resilient to
   *                       empty state; prevents startup failures on clean systems
   *
   * Worked Example:
   *   Given: empty execute/ directory (no subdirectories)
   *   When: const stats = await detectCrashedJobs(executeDir, 'bridge-1', undefined)
   *   Then: stats = { scanned: 0, crashed: 0, quarantined: 0, skipped: 0 }
   *         AND no errors thrown
   */
  it('FS-BRIDGE-CRASH-RECOVERY-011: should handle empty execute directory', async () => {
    const { detectCrashedJobs } = await import('../../../src/core/fs-bridge/recovery');

    const stats = await detectCrashedJobs(executeDir, 'test-bridge', undefined);

    expect(stats.scanned).toBe(0);
    expect(stats.crashed).toBe(0);
    expect(stats.quarantined).toBe(0);
    expect(stats.skipped).toBe(0);
  });

  /**
   * Test ID: CRASH-RECOVERY-T014
   *
   * Purpose: Verify DLQ marker contains complete metadata (reason, timestamp, bridgeId, pid)
   *
   * Why: Complete metadata enables post-mortem analysis, debugging, and operational metrics;
   *      missing fields reduce diagnostic value of DLQ markers
   *
   * Contract: detectCrashedJobs() creates DLQ markers with all required fields populated:
   *          reason (string), timestamp (ISO8601), bridgeId (string), pid (number)
   *
   * Usage Notes: Metadata fields enable correlation with logs, bridge identification, and
   *             timestamp-based retention policies; pid helps identify claiming process
   *
   * Quality Contribution: Validates metadata completeness; ensures DLQ markers have full
   *                       diagnostic value; prevents incomplete crash recovery evidence
   *
   * Worked Example:
   *   Given: job-001 crashed (claimed, no done)
   *   When: await detectCrashedJobs(executeDir, 'bridge-123', undefined)
   *   Then: dlq marker contains { reason: 'E_CRASH_RECOVERY', timestamp: ISO8601 string,
   *         bridgeId: 'bridge-123', pid: number (current process) }
   */
  it('FS-BRIDGE-CRASH-RECOVERY-014: should include complete metadata in DLQ marker', async () => {
    await createJobFixture(executeDir, {
      name: 'job-001',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    const { detectCrashedJobs } = await import('../../../src/core/fs-bridge/recovery');

    await detectCrashedJobs(executeDir, 'test-bridge-123', undefined);

    const dlqPath = path.join(executeDir, 'job-001', 'dlq');
    const dlqMarker = JSON.parse(fs.readFileSync(dlqPath, 'utf8'));

    // Verify all required metadata fields
    expect(dlqMarker.reason).toBe('E_CRASH_RECOVERY');
    expect(dlqMarker.timestamp).toBeDefined();
    expect(dlqMarker.bridgeId).toBe('test-bridge-123');
    expect(dlqMarker.pid).toBeDefined();
    expect(typeof dlqMarker.pid).toBe('number');
  });
});

describe('Crash Recovery - Cleanup Integration', () => {
  let testDir: string;
  let executeDir: string;
  let filesystem: NodeFilesystem;

  beforeEach(() => {
    filesystem = new NodeFilesystem();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-recovery-test-'));
    executeDir = path.join(testDir, 'execute');
    fs.mkdirSync(executeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Test ID: CRASH-RECOVERY-T014a
   *
   * Purpose: Verify cleanAllPendingJobs() skips DLQ-quarantined jobs
   *
   * Why: Cleanup must preserve crash evidence; deleting DLQ jobs loses diagnostic data
   *      needed for post-mortem analysis and debugging
   *
   * Contract: cleanAllPendingJobs() deletes incomplete jobs WITHOUT DLQ markers,
   *          leaves incomplete jobs WITH DLQ markers untouched
   *
   * Usage Notes: Critical integration test for startup sequence ordering; validates
   *             cleanup preserves DLQ evidence after crash detection runs; ensures
   *             crash recovery evidence survives aggressive cleanup policies
   *
   * Quality Contribution: Prevents accidental deletion of crash evidence; validates critical
   *                       cleanup+DLQ interaction; ensures diagnostic data retention
   *
   * Worked Example:
   *   Given: 3 incomplete jobs - job-001 (has DLQ), job-002 (no DLQ), job-003 (unclaimed)
   *   When: await cleanAllPendingJobs(executeDir)
   *   Then: job-001 directory exists (DLQ preserved)
   *         AND job-002 deleted (incomplete, no DLQ)
   *         AND job-003 deleted (unclaimed)
   */
  it('FS-BRIDGE-CRASH-RECOVERY-014a: cleanAllPendingJobs should skip DLQ jobs', async () => {
    // Job 1: Incomplete with DLQ marker (should survive)
    await createJobFixture(executeDir, {
      name: 'job-001-dlq',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: true
    }, filesystem);

    // Job 2: Incomplete without DLQ (should be deleted)
    await createJobFixture(executeDir, {
      name: 'job-002-no-dlq',
      hasCommand: true,
      hasClaimed: true,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    // Job 3: Unclaimed (should be deleted)
    await createJobFixture(executeDir, {
      name: 'job-003-unclaimed',
      hasCommand: true,
      hasClaimed: false,
      hasDone: false,
      hasDlq: false
    }, filesystem);

    // Import cleanAllPendingJobs (will fail until T019 implements modification)
    const { cleanAllPendingJobs } = await import('../../../src/core/fs-bridge/recovery');

    // Execute cleanup
    await cleanAllPendingJobs(executeDir);

    // Verify: DLQ job survives, others deleted
    expect(fs.existsSync(path.join(executeDir, 'job-001-dlq'))).toBe(true);
    expect(fs.existsSync(path.join(executeDir, 'job-002-no-dlq'))).toBe(false);
    expect(fs.existsSync(path.join(executeDir, 'job-003-unclaimed'))).toBe(false);
  });
});
