/**
 * @file scanner.ts
 * @brief Job scanner module for detecting unclaimed jobs
 *
 * The scanner is a safety net that catches jobs missed by FileSystemWatcher.
 * It runs periodically (every 2 seconds) and detects unclaimed jobs that need processing.
 *
 * Key features:
 * - Capacity-aware: skips scanning when at MAX_CONCURRENT
 * - DLQ-aware: skips jobs in dead letter queue
 * - Optimized: early exits to reduce filesystem stat() calls
 * - Testable: uses IFilesystem abstraction for unit testing
 */

import * as path from 'path';
import { IFilesystem, FileType } from './fs-abstraction';
import { isDlqJob } from './dlq';

/**
 * Scan execute directory for unclaimed jobs
 *
 * Returns array of job directory paths that:
 * - Have command.json (unclaimed work)
 * - Don't have claimed.json (not being processed)
 * - Don't have done marker (not completed)
 * - Aren't in DLQ (not quarantined)
 *
 * This function is the core scanner logic, extracted from BridgeManager for testability.
 *
 * @param executeDir - Absolute path to execute directory
 * @param inFlight - Current number of jobs being processed
 * @param maxConcurrent - Maximum concurrent jobs allowed
 * @param fs - Filesystem abstraction (VsCodeFilesystem or NodeFilesystem)
 * @returns Array of job directory paths that need processing
 */
export async function scanForUnclaimedJobs(
  executeDir: string,
  inFlight: number,
  maxConcurrent: number,
  fs: IFilesystem
): Promise<string[]> {
  // T015: Capacity check - early exit if at capacity
  if (inFlight >= maxConcurrent) {
    return [];
  }

  const unclaimedJobs: string[] = [];

  try {
    // Read all entries in execute directory
    const entries = await fs.readDirectory(executeDir);

    for (const [name, type] of entries) {
      // T017: Early exit optimization - skip non-directories
      if (type !== FileType.Directory) {
        continue;
      }

      const jobDir = path.join(executeDir, name);

      // T017: Early exit optimization - check for command.json first
      // If no command.json, this isn't a valid job, skip remaining checks
      const hasCommand = await fs.exists(path.join(jobDir, 'command.json'));
      if (!hasCommand) {
        continue;
      }

      // T006: Skip DLQ jobs (prevent reprocessing quarantined jobs)
      if (await isDlqJob(jobDir, fs)) {
        continue;
      }

      // T004: Skip claimed jobs
      const hasClaimed = await fs.exists(path.join(jobDir, 'claimed.json'));
      if (hasClaimed) {
        continue;
      }

      // T005: Skip completed jobs
      const isDone = await fs.exists(path.join(jobDir, 'done'));
      if (isDone) {
        continue;
      }

      // Found an unclaimed job that needs processing
      unclaimedJobs.push(jobDir);
    }
  } catch (err) {
    // Error handling: Return empty array and log warning
    // Don't throw - scanner runs every 2 seconds, errors shouldn't crash the interval
    console.warn(`[Scanner] Error scanning ${executeDir}:`, err);
    return [];
  }

  return unclaimedJobs;
}

/**
 * Get current in-flight job count (placeholder for integration)
 *
 * In production, BridgeManager will track this via launched jobs.
 * For now, this is a helper for testing.
 *
 * @internal
 */
export function getInFlightCount(/* jobTracker */): number {
  // TODO: Implement job tracking in BridgeManager
  return 0;
}
