/**
 * @fileoverview Dead Letter Queue (DLQ) System
 *
 * Provides immediate quarantine of failed jobs without retry attempts.
 * DLQ markers are created in job directories to prevent reprocessing and
 * provide diagnostic information for debugging.
 *
 * ## Key Functions
 * - writeDlqMarker(): Create DLQ marker with failure metadata
 * - isDlqJob(): Check if job directory contains DLQ marker
 *
 * ## Design Principles
 * - KISS: Single attempt write, log error, continue (no retry logic)
 * - Atomic writes: Use writeJsonAtomicAsync for idempotent marker creation
 * - No coupling: DLQ is dumping ground, callers handle retries
 */

import * as path from 'path';
import { writeJsonAtomicAsync } from './io';
import { IFilesystem } from './fs-abstraction';

/**
 * DLQ marker metadata stored in job directory
 */
export interface DlqMarker {
  /** Error reason/code (e.g., 'E_SCRIPT_FAILED', 'E_TIMEOUT') */
  reason: string;

  /** Script name that failed */
  scriptName?: string;

  /** Error message */
  error?: string;

  /** Stack trace */
  stack?: string;

  /** ISO 8601 timestamp of failure */
  timestamp: string;

  /** Process ID that created marker */
  pid?: number;

  /** Bridge ID */
  bridgeId?: string;
}

/**
 * Write DLQ marker file to job directory
 *
 * Creates a 'dlq' file in the job directory with failure metadata.
 * Uses atomic write pattern (temp + rename) for idempotency.
 *
 * KISS error handling: Single attempt, log error, continue (no retry).
 *
 * @param jobDir - Absolute path to job directory
 * @param metadata - Failure information to store
 */
export async function writeDlqMarker(jobDir: string, metadata: DlqMarker): Promise<void> {
  try {
    const dlqPath = path.join(jobDir, 'dlq');
    const data: DlqMarker = {
      ...metadata,
      pid: process.pid,
      timestamp: metadata.timestamp || new Date().toISOString()
    };

    await writeJsonAtomicAsync(dlqPath, data);
  } catch (err: any) {
    // KISS: Single attempt, log error, continue (no retry)
    console.error(`[DLQ] Failed to write marker for ${path.basename(jobDir)}:`, err.message);
  }
}

/**
 * Check if job directory contains DLQ marker
 *
 * @param jobDir - Absolute path to job directory
 * @param fs - Filesystem abstraction (VsCodeFilesystem for production, NodeFilesystem for tests)
 * @returns True if DLQ marker exists, false otherwise
 */
export async function isDlqJob(jobDir: string, fs: IFilesystem): Promise<boolean> {
  const dlqPath = path.join(jobDir, 'dlq');
  return await fs.exists(dlqPath);
}
