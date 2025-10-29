import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { isDlqJob } from './dlq';
import { NodeFilesystem } from './fs-abstraction';

/**
 * Cleanup statistics
 */
export interface CleanupStats {
  scanned: number;
  deleted: number;
  kept: number;
  errors: number;
}

/**
 * Start garbage collection timer
 *
 * Periodically cleans up old completed jobs from the execute directory.
 * Jobs with a 'keep' file are preserved for debugging.
 */
export function startGarbageCollection(
  bridgeDir: string,
  maxAgeMs = 24 * 60 * 60 * 1000, // 24 hours default
  intervalMs = 30 * 60 * 1000     // 30 minutes default
): NodeJS.Timeout {
  const executeDir = path.join(bridgeDir, 'execute');

  // Do initial cleanup
  cleanOldJobs(executeDir, maxAgeMs).catch(err => {
    console.error(`[GC] Initial cleanup failed: ${err}`);
  });

  // Schedule periodic cleanup
  return setInterval(() => {
    cleanOldJobs(executeDir, maxAgeMs).catch(err => {
      console.error(`[GC] Cleanup failed: ${err}`);
    });
  }, intervalMs);
}

/**
 * Clean old completed jobs from execute directory
 */
export async function cleanOldJobs(
  executeDir: string,
  maxAgeMs: number
): Promise<CleanupStats> {
  const stats: CleanupStats = {
    scanned: 0,
    deleted: 0,
    kept: 0,
    errors: 0
  };

  try {
    const entries = await fsPromises.readdir(executeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      stats.scanned++;
      const jobDir = path.join(executeDir, entry.name);

      try {
        const shouldDelete = await shouldDeleteJob(jobDir, maxAgeMs);

        if (shouldDelete) {
          await fsPromises.rm(jobDir, { recursive: true, force: true });
          stats.deleted++;
          console.log(`[GC] Deleted old job: ${entry.name}`);
        } else {
          stats.kept++;
        }
      } catch (err) {
        console.error(`[GC] Error processing ${entry.name}: ${err}`);
        stats.errors++;
      }
    }

    if (stats.deleted > 0) {
      console.log(`[GC] Cleanup complete: deleted ${stats.deleted}, kept ${stats.kept}`);
    }
  } catch (err) {
    console.error(`[GC] Failed to scan directory: ${err}`);
  }

  return stats;
}

/**
 * Determine if a job should be deleted
 */
export async function shouldDeleteJob(
  jobDir: string,
  maxAgeMs: number
): Promise<boolean> {
  // Check for keep file first
  if (await shouldKeepJob(jobDir)) {
    return false;
  }

  // Check if this is a DLQ job - apply 7-day retention
  const nodeFs = new NodeFilesystem();
  const isDlq = await isDlqJob(jobDir, nodeFs);
  const DLQ_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const effectiveMaxAge = isDlq ? DLQ_RETENTION_MS : maxAgeMs;

  // Check if job is complete
  const donePath = path.join(jobDir, 'done');
  try {
    const doneStats = await fsPromises.stat(donePath);
    const age = Date.now() - doneStats.mtime.getTime();

    // Delete if older than effective max age (7 days for DLQ, normal maxAge for others)
    return age > effectiveMaxAge;
  } catch (err) {
    // No done file - check directory age
    try {
      const dirStats = await fsPromises.stat(jobDir);
      const age = Date.now() - dirStats.mtime.getTime();

      // Delete incomplete jobs that are very old (> 2x max age)
      return age > effectiveMaxAge * 2;
    } catch {
      // Can't stat directory, probably should delete
      return true;
    }
  }
}

/**
 * Check if job should be kept for debugging
 */
export async function shouldKeepJob(jobDir: string): Promise<boolean> {
  const keepPath = path.join(jobDir, 'keep');
  try {
    await fsPromises.access(keepPath);
    return true; // Keep file exists
  } catch {
    return false; // No keep file
  }
}

/**
 * Create a keep file to prevent garbage collection
 */
export async function markJobForKeeping(jobDir: string, reason?: string): Promise<void> {
  const keepPath = path.join(jobDir, 'keep');
  const content = reason || `Kept for debugging at ${new Date().toISOString()}`;
  await fsPromises.writeFile(keepPath, content, 'utf8');
}

/**
 * Get statistics about jobs in execute directory
 */
export async function getJobStats(executeDir: string): Promise<{
  total: number;
  completed: number;
  incomplete: number;
  kept: number;
  oldestJob?: Date;
  newestJob?: Date;
}> {
  const stats = {
    total: 0,
    completed: 0,
    incomplete: 0,
    kept: 0,
    oldestJob: undefined as Date | undefined,
    newestJob: undefined as Date | undefined
  };

  try {
    const entries = await fsPromises.readdir(executeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      stats.total++;
      const jobDir = path.join(executeDir, entry.name);

      // Check if complete
      const donePath = path.join(jobDir, 'done');
      try {
        const doneStats = await fsPromises.stat(donePath);
        stats.completed++;

        // Track oldest and newest
        const jobTime = doneStats.mtime;
        if (!stats.oldestJob || jobTime < stats.oldestJob) {
          stats.oldestJob = jobTime;
        }
        if (!stats.newestJob || jobTime > stats.newestJob) {
          stats.newestJob = jobTime;
        }
      } catch {
        stats.incomplete++;
      }

      // Check if kept
      if (await shouldKeepJob(jobDir)) {
        stats.kept++;
      }
    }
  } catch (err) {
    console.error(`[GC] Failed to get job stats: ${err}`);
  }

  return stats;
}

/**
 * Clean up all jobs (for testing or reset)
 */
export async function cleanAllJobs(
  executeDir: string,
  force = false
): Promise<CleanupStats> {
  const stats: CleanupStats = {
    scanned: 0,
    deleted: 0,
    kept: 0,
    errors: 0
  };

  try {
    const entries = await fsPromises.readdir(executeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      stats.scanned++;
      const jobDir = path.join(executeDir, entry.name);

      try {
        // Skip kept jobs unless forced
        if (!force && await shouldKeepJob(jobDir)) {
          stats.kept++;
          continue;
        }

        await fsPromises.rm(jobDir, { recursive: true, force: true });
        stats.deleted++;
      } catch (err) {
        console.error(`[GC] Error deleting ${entry.name}: ${err}`);
        stats.errors++;
      }
    }

    console.log(`[GC] Clean all complete: deleted ${stats.deleted}, kept ${stats.kept}`);
  } catch (err) {
    console.error(`[GC] Failed to clean all jobs: ${err}`);
  }

  return stats;
}