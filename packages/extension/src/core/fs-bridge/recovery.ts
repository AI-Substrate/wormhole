import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import * as vscode from 'vscode';
import { ClaimedJson, CommandJson } from './types';
import { claimJobAtomic, processCommand } from './processor';
import { writeDlqMarker } from './dlq';

/**
 * Recovery statistics
 */
export interface RecoveryStats {
  scanned: number;
  stale: number;
  recovered: number;
  failed: number;
}

/**
 * Crash recovery statistics
 */
export interface CrashRecoveryStats {
  scanned: number;      // Total job directories examined
  crashed: number;      // Jobs with claimed + no done + no dlq
  quarantined: number;  // Successfully moved to DLQ
  skipped: number;      // Already complete/unclaimed/in DLQ
}

/**
 * Detect crashed jobs from previous Extension Host session
 *
 * This function scans the execute directory for jobs that were claimed but
 * never completed. These jobs are quarantined to DLQ with E_CRASH_RECOVERY reason.
 *
 * Crash detection criteria:
 * - Has command.json (valid job)
 * - Has claimed.json (was actively processing)
 * - No done file (never completed)
 * - No dlq file (not already quarantined)
 *
 * This should be called BEFORE cleanAllPendingJobs() during startup to
 * preserve crash evidence before cleanup.
 *
 * @param executeDir - Absolute path to execute directory
 * @param bridgeId - Current bridge ID for DLQ metadata
 * @param output - Optional VS Code OutputChannel for logging
 * @returns Statistics about crash detection and quarantine
 */
export async function detectCrashedJobs(
  executeDir: string,
  bridgeId: string,
  output?: vscode.OutputChannel
): Promise<CrashRecoveryStats> {
  const stats: CrashRecoveryStats = {
    scanned: 0,
    crashed: 0,
    quarantined: 0,
    skipped: 0
  };

  try {
    const entries = await fsPromises.readdir(executeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      stats.scanned++;
      const jobDir = path.join(executeDir, entry.name);

      try {
        // Check job state markers
        const commandPath = path.join(jobDir, 'command.json');
        const claimedPath = path.join(jobDir, 'claimed.json');
        const donePath = path.join(jobDir, 'done');
        const dlqPath = path.join(jobDir, 'dlq');

        // Check if this is a valid job directory
        const hasCommand = await fileExists(commandPath);
        if (!hasCommand) {
          stats.skipped++;
          continue;
        }

        // Check if already complete or in DLQ
        const hasDone = await fileExists(donePath);
        const hasDlq = await fileExists(dlqPath);

        if (hasDone || hasDlq) {
          stats.skipped++;
          continue;
        }

        // Check if claimed (crash condition: claimed + no done + no dlq)
        const hasClaimed = await fileExists(claimedPath);
        if (!hasClaimed) {
          stats.skipped++;
          continue;
        }

        // Detected crashed job - quarantine to DLQ
        stats.crashed++;

        // Read script name from command.json for metadata
        let scriptName: string | undefined;
        try {
          const commandData = await fsPromises.readFile(commandPath, 'utf8');
          const command = JSON.parse(commandData) as CommandJson;
          scriptName = command.scriptName;
        } catch (err) {
          // Malformed command.json - still quarantine but no script name
          console.error(`[Recovery] Failed to read command.json for ${entry.name}:`, err);
        }

        // Create DLQ marker
        await writeDlqMarker(jobDir, {
          reason: 'E_CRASH_RECOVERY',
          scriptName,
          error: 'Extension Host crashed or was terminated during job processing',
          timestamp: new Date().toISOString(),
          bridgeId
        });

        stats.quarantined++;

        // Log to OutputChannel if provided
        if (output) {
          output.appendLine(`[Recovery] Quarantined crashed job: ${entry.name} (script: ${scriptName || 'unknown'})`);
        } else {
          console.log(`[Recovery] Quarantined crashed job: ${entry.name} (script: ${scriptName || 'unknown'})`);
        }
      } catch (err) {
        console.error(`[Recovery] Error processing ${entry.name}:`, err);
        stats.skipped++;
      }
    }

    // Summary logging
    const summary = `[Recovery] Crash recovery complete: scanned ${stats.scanned}, quarantined ${stats.quarantined}, skipped ${stats.skipped}`;
    if (output) {
      output.appendLine(summary);
    } else {
      console.log(summary);
    }
  } catch (err) {
    console.error(`[Recovery] Failed to scan directory for crashed jobs:`, err);
  }

  return stats;
}

/**
 * Helper: Check if file exists (ENOENT safe)
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recover stale jobs in the execute directory
 *
 * This function scans for jobs that have been claimed but not completed
 * within the lease period. Such jobs are considered abandoned and can be
 * reclaimed for processing.
 */
export async function recoverStaleJobs(
  executeDir: string,
  bridgeId: string,
  leaseMs = 60000,
  executor?: (command: CommandJson, eventWriter: any) => Promise<any>
): Promise<RecoveryStats> {
  const stats: RecoveryStats = {
    scanned: 0,
    stale: 0,
    recovered: 0,
    failed: 0
  };

  try {
    const entries = await fsPromises.readdir(executeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      stats.scanned++;
      const jobDir = path.join(executeDir, entry.name);

      try {
        const isStale = await isJobStale(jobDir, leaseMs);

        if (isStale) {
          stats.stale++;
          console.log(`[Recovery] Found stale job: ${entry.name}`);

          const recovered = await reclaimAndProcess(jobDir, bridgeId, executor);

          if (recovered) {
            stats.recovered++;
            console.log(`[Recovery] Successfully recovered: ${entry.name}`);
          } else {
            stats.failed++;
          }
        }
      } catch (err) {
        console.error(`[Recovery] Error processing ${entry.name}: ${err}`);
        stats.failed++;
      }
    }

    console.log(`[Recovery] Stats: ${JSON.stringify(stats)}`);
  } catch (err) {
    console.error(`[Recovery] Failed to scan directory: ${err}`);
  }

  return stats;
}

/**
 * Check if a job is stale (claimed but expired and not done)
 */
export async function isJobStale(jobDir: string, leaseMs: number): Promise<boolean> {
  const claimedPath = path.join(jobDir, 'claimed.json');
  const donePath = path.join(jobDir, 'done');

  try {
    // If done exists, job is complete (not stale)
    await fsPromises.access(donePath);
    return false;
  } catch {
    // Done doesn't exist, check if claimed
  }

  try {
    const claimData = await fsPromises.readFile(claimedPath, 'utf8');
    const claim = JSON.parse(claimData) as ClaimedJson;

    // Calculate lease expiry from claim time
    const claimTime = new Date(claim.claimedAt).getTime();
    const leaseExpiry = new Date(claimTime + leaseMs);
    const now = new Date();

    if (now > leaseExpiry) {
      // Also check if the claiming process is still alive (basic check)
      if (!isProcessAlive(claim.pid)) {
        return true; // Process is dead, definitely stale
      }

      // Process might be alive but lease expired - still consider stale
      return true;
    }

    return false; // Lease still valid
  } catch (err) {
    // No claim file or invalid - not stale (might be unclaimed)
    return false;
  }
}

/**
 * Check if a process is still alive (platform-specific)
 */
function isProcessAlive(pid: number): boolean {
  try {
    // Send signal 0 to check if process exists (works on Unix-like systems)
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // ESRCH means process doesn't exist
    // EPERM means process exists but we don't have permission (still alive)
    return err.code === 'EPERM';
  }
}

/**
 * Reclaim a stale job and optionally process it
 */
export async function reclaimAndProcess(
  jobDir: string,
  bridgeId: string,
  executor?: (command: CommandJson, eventWriter: any) => Promise<any>
): Promise<boolean> {
  const claimedPath = path.join(jobDir, 'claimed.json');

  try {
    // Remove the stale claim
    await fsPromises.unlink(claimedPath);
    console.log(`[Recovery] Removed stale claim: ${path.basename(jobDir)}`);

    // Try to claim it ourselves
    if (claimJobAtomic(jobDir, bridgeId)) {
      console.log(`[Recovery] Reclaimed job: ${path.basename(jobDir)}`);

      // Process if executor provided
      if (executor) {
        await processCommand(jobDir, bridgeId, executor);
      }

      return true;
    } else {
      // Someone else claimed it first (race condition)
      console.log(`[Recovery] Lost race to reclaim: ${path.basename(jobDir)}`);
      return false;
    }
  } catch (err) {
    console.error(`[Recovery] Failed to reclaim ${path.basename(jobDir)}: ${err}`);
    return false;
  }
}

/**
 * Start periodic stale job recovery
 */
export function startRecoveryTimer(
  executeDir: string,
  bridgeId: string,
  intervalMs = 30000, // Check every 30 seconds
  leaseMs = 60000,
  executor?: (command: CommandJson, eventWriter: any) => Promise<any>
): NodeJS.Timeout {
  // Do an initial recovery sweep
  recoverStaleJobs(executeDir, bridgeId, leaseMs, executor);

  // Then check periodically
  return setInterval(() => {
    recoverStaleJobs(executeDir, bridgeId, leaseMs, executor);
  }, intervalMs);
}

/**
 * Clean up orphaned job directories (no command.json)
 *
 * This handles cases where job directory was created but
 * command write failed or was interrupted.
 */
export async function cleanOrphanedJobs(executeDir: string): Promise<number> {
  let cleaned = 0;

  try {
    const entries = await fsPromises.readdir(executeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const jobDir = path.join(executeDir, entry.name);
      const commandPath = path.join(jobDir, 'command.json');

      try {
        // Check if command.json exists
        await fsPromises.access(commandPath);
      } catch {
        // No command.json - this is an orphaned job
        try {
          // Check age (don't delete very recent ones)
          const stats = await fsPromises.stat(jobDir);
          const age = Date.now() - stats.mtime.getTime();

          if (age > 60000) { // Older than 1 minute
            await fsPromises.rm(jobDir, { recursive: true, force: true });
            console.log(`[Recovery] Cleaned orphaned job: ${entry.name}`);
            cleaned++;
          }
        } catch (err) {
          console.error(`[Recovery] Failed to clean orphaned job ${entry.name}: ${err}`);
        }
      }
    }
  } catch (err) {
    console.error(`[Recovery] Failed to clean orphaned jobs: ${err}`);
  }

  return cleaned;
}

/**
 * Clean all stale pending jobs on startup
 *
 * This removes ALL jobs that are not completed (no 'done' file) and not
 * marked for keeping (no 'keep' file or 'dlq' file). This ensures a clean slate on startup.
 *
 * CRITICAL: DLQ jobs are preserved to maintain crash recovery evidence.
 * This must be called AFTER detectCrashedJobs() to avoid deleting crash evidence.
 */
export async function cleanAllPendingJobs(executeDir: string): Promise<number> {
  let cleaned = 0;

  try {
    const entries = await fsPromises.readdir(executeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const jobDir = path.join(executeDir, entry.name);
      const donePath = path.join(jobDir, 'done');
      const keepPath = path.join(jobDir, 'keep');
      const dlqPath = path.join(jobDir, 'dlq');

      try {
        // Check if job is done
        try {
          await fsPromises.access(donePath);
          continue; // Job is done, skip it
        } catch {
          // Not done, check if we should keep it
        }

        // Check if job should be kept for debugging
        try {
          await fsPromises.access(keepPath);
          continue; // Has keep file, skip it
        } catch {
          // No keep file, check for DLQ
        }

        // Check if job is in DLQ (crash recovery evidence)
        try {
          await fsPromises.access(dlqPath);
          continue; // Has DLQ marker, preserve it
        } catch {
          // No DLQ marker, safe to delete
        }

        // Delete this pending job
        await fsPromises.rm(jobDir, { recursive: true, force: true });
        console.log(`[Recovery] Cleaned pending job on startup: ${entry.name}`);
        cleaned++;
      } catch (err) {
        console.error(`[Recovery] Failed to clean pending job ${entry.name}: ${err}`);
      }
    }

    if (cleaned > 0) {
      console.log(`[Recovery] Cleaned ${cleaned} pending jobs from previous sessions`);
    }
  } catch (err) {
    console.error(`[Recovery] Failed to clean pending jobs: ${err}`);
  }

  return cleaned;
}