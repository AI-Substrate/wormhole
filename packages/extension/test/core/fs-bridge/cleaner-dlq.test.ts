/**
 * @fileoverview GC DLQ Retention Tests
 *
 * Tests for garbage collection behavior with DLQ jobs.
 * DLQ jobs should be retained for 7 days (longer than normal 24h retention).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { cleanOldJobs } from '../../../src/core/fs-bridge/cleaner';
import { writeDlqMarker } from '../../../src/core/fs-bridge/dlq';

describe('GC DLQ Retention', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-dlq-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Test ID: FS-BRIDGE-GC-DLQ-001
   *
   * Purpose: Verify DLQ jobs retained for 7 days, deleted after
   *
   * Why: DLQ jobs contain diagnostic information for debugging; they should be
   *      kept longer than normal jobs (7 days vs 24 hours)
   *
   * Contract: cleanOldJobs() with maxAgeMs keeps DLQ jobs <7 days old,
   *          deletes DLQ jobs >7 days old
   *
   * Usage Notes: GC checks for 'dlq' marker file; if present, applies 7-day retention
   *
   * Quality Contribution: Validates DLQ retention policy; ensures diagnostic data
   *                       available for investigation
   */
  it('FS-BRIDGE-GC-DLQ-001: should retain DLQ jobs <7 days, delete >7 days', async () => {
    // Create recent DLQ job (3 days old)
    const recentDlqDir = path.join(testDir, 'recent-dlq-job');
    fs.mkdirSync(recentDlqDir, { recursive: true });
    await writeDlqMarker(recentDlqDir, {
      reason: 'E_INTERNAL',
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(path.join(recentDlqDir, 'done'), '');

    // Set done marker to 3 days ago
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(recentDlqDir, 'done'), threeDaysAgo, threeDaysAgo);

    // Create old DLQ job (8 days old)
    const oldDlqDir = path.join(testDir, 'old-dlq-job');
    fs.mkdirSync(oldDlqDir, { recursive: true });
    await writeDlqMarker(oldDlqDir, {
      reason: 'E_TIMEOUT',
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(path.join(oldDlqDir, 'done'), '');

    // Set done marker to 8 days ago
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(oldDlqDir, 'done'), eightDaysAgo, eightDaysAgo);

    // Run GC with 7-day retention for DLQ jobs
    const stats = await cleanOldJobs(testDir, 7 * 24 * 60 * 60 * 1000);

    // Verify recent DLQ job (3 days old) kept
    expect(fs.existsSync(recentDlqDir)).toBe(true);

    // Verify old DLQ job (8 days old) deleted
    expect(fs.existsSync(oldDlqDir)).toBe(false);

    // Verify stats
    expect(stats.scanned).toBe(2);
    expect(stats.deleted).toBe(1);
    expect(stats.kept).toBe(1);
  });

  /**
   * Test ID: FS-BRIDGE-GC-DLQ-002
   *
   * Purpose: Verify normal jobs deleted at 24h, DLQ jobs kept until 7 days
   *
   * Why: Different retention policies for normal vs DLQ jobs; DLQ needs longer
   *      retention for debugging
   *
   * Contract: Normal jobs deleted after maxAgeMs (24h), DLQ jobs get extended
   *          retention (7 days)
   *
   * Usage Notes: Pass appropriate maxAgeMs to cleanOldJobs() for job type
   *
   * Quality Contribution: Validates differential retention logic
   */
  it('FS-BRIDGE-GC-DLQ-002: normal jobs deleted at 24h, DLQ retained', async () => {
    // Create normal job (2 days old - should be deleted with 24h retention)
    const normalJobDir = path.join(testDir, 'normal-job');
    fs.mkdirSync(normalJobDir, { recursive: true });
    fs.writeFileSync(path.join(normalJobDir, 'command.json'), '{}');
    fs.writeFileSync(path.join(normalJobDir, 'response.json'), '{}');
    fs.writeFileSync(path.join(normalJobDir, 'done'), '');

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(normalJobDir, 'done'), twoDaysAgo, twoDaysAgo);

    // Create DLQ job (2 days old - should be kept with 7-day retention)
    const dlqJobDir = path.join(testDir, 'dlq-job');
    fs.mkdirSync(dlqJobDir, { recursive: true });
    await writeDlqMarker(dlqJobDir, {
      reason: 'E_INTERNAL',
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(path.join(dlqJobDir, 'done'), '');

    fs.utimesSync(path.join(dlqJobDir, 'done'), twoDaysAgo, twoDaysAgo);

    // Run GC with 24h retention
    const stats = await cleanOldJobs(testDir, 24 * 60 * 60 * 1000);

    // For now, both will be kept because shouldDeleteJob doesn't check DLQ yet
    // This test will fail (RED) until we implement T014
    expect(fs.existsSync(normalJobDir)).toBe(false); // Should be deleted (>24h)
    expect(fs.existsSync(dlqJobDir)).toBe(true);     // Should be kept (DLQ)
  });
});
