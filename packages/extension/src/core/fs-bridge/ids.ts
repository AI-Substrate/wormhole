/**
 * Job ID generation utilities
 *
 * Generates Windows-safe, collision-proof, chronologically sortable IDs
 * for filesystem-based job directories.
 */

import * as crypto from 'crypto';

/**
 * Generate a Windows-safe, collision-proof job ID
 *
 * Format: YYYYMMDDTHHMMSS.mmmZ-<pid>-<random>
 * - No colons, slashes, or backslashes (Windows compatibility)
 * - Chronologically sortable (timestamp first)
 * - Collision-proof (PID + random suffix)
 * - Human-readable timestamp
 *
 * @param now Optional date for testing
 * @returns Job ID string
 */
export function newJobId(now = new Date()): string {
  // Pad numbers to ensure consistent width
  const pad = (n: number, width = 2): string =>
    String(n).padStart(width, '0');

  // Build ISO-like timestamp without special characters
  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  const hours = pad(now.getUTCHours());
  const minutes = pad(now.getUTCMinutes());
  const seconds = pad(now.getUTCSeconds());
  const millis = pad(now.getUTCMilliseconds(), 3);

  // Format: YYYYMMDDTHHMMSS.mmmZ
  const timestamp = `${year}${month}${day}T${hours}${minutes}${seconds}.${millis}Z`;

  // Add PID for process uniqueness
  const pid = process.pid;

  // Add random suffix for absolute uniqueness (6 chars of base36)
  // This gives us 36^6 = 2.2 billion unique values
  const random = crypto.randomBytes(4).toString('hex').substring(0, 6);

  return `${timestamp}-${pid}-${random}`;
}

/**
 * Validate that a job ID is Windows-safe
 *
 * @param jobId The job ID to validate
 * @returns True if valid for all platforms
 */
export function isValidJobId(jobId: string): boolean {
  // Check for Windows-forbidden characters
  const forbidden = /[<>:"/\\|?*]/;
  if (forbidden.test(jobId)) {
    return false;
  }

  // Check for Windows-reserved names
  const reserved = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;
  if (reserved.test(jobId)) {
    return false;
  }

  // Check length (Windows MAX_PATH considerations)
  // Job ID should be reasonable to leave room for full path
  if (jobId.length > 64) {
    return false;
  }

  // Must not end with dot or space (Windows restriction)
  if (jobId.endsWith('.') || jobId.endsWith(' ')) {
    return false;
  }

  return true;
}

/**
 * Parse a job ID to extract components
 *
 * @param jobId The job ID to parse
 * @returns Parsed components or null if invalid
 */
export function parseJobId(jobId: string): {
  timestamp: Date;
  pid: number;
  random: string;
} | null {
  // Expected format: YYYYMMDDTHHMMSS.mmmZ-<pid>-<random>
  const pattern = /^(\d{8}T\d{6}\.\d{3}Z)-(\d+)-([a-f0-9]{6})$/;
  const match = jobId.match(pattern);

  if (!match) {
    return null;
  }

  const [, timestampStr, pidStr, random] = match;

  // Parse timestamp
  // Format: YYYYMMDDTHHMMSS.mmmZ
  const year = parseInt(timestampStr.substring(0, 4), 10);
  const month = parseInt(timestampStr.substring(4, 6), 10) - 1; // 0-indexed
  const day = parseInt(timestampStr.substring(6, 8), 10);
  const hours = parseInt(timestampStr.substring(9, 11), 10);
  const minutes = parseInt(timestampStr.substring(11, 13), 10);
  const seconds = parseInt(timestampStr.substring(13, 15), 10);
  const millis = parseInt(timestampStr.substring(16, 19), 10);

  const timestamp = new Date(Date.UTC(year, month, day, hours, minutes, seconds, millis));
  const pid = parseInt(pidStr, 10);

  return {
    timestamp,
    pid,
    random
  };
}

/**
 * Generate a unique job ID with collision detection
 *
 * If a collision is detected (via existsFn), regenerates with a new random suffix.
 *
 * @param existsFn Function to check if ID already exists
 * @param maxRetries Maximum attempts before giving up
 * @returns Unique job ID
 */
export async function generateUniqueJobId(
  existsFn: (id: string) => Promise<boolean>,
  maxRetries = 10
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const id = newJobId();

    if (!await existsFn(id)) {
      return id;
    }

    // Wait a tiny bit to ensure timestamp changes
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  throw new Error(`Failed to generate unique job ID after ${maxRetries} attempts`);
}

/**
 * Compare job IDs for sorting (chronological order)
 *
 * @param a First job ID
 * @param b Second job ID
 * @returns Comparison result for Array.sort()
 */
export function compareJobIds(a: string, b: string): number {
  // Since timestamp is first in the ID, string comparison works
  return a.localeCompare(b);
}

/**
 * Get age of a job ID in milliseconds
 *
 * @param jobId The job ID
 * @returns Age in milliseconds, or null if invalid
 */
export function getJobAge(jobId: string): number | null {
  const parsed = parseJobId(jobId);
  if (!parsed) {
    return null;
  }

  return Date.now() - parsed.timestamp.getTime();
}