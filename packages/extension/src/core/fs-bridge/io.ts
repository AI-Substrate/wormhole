/**
 * Filesystem I/O utilities for atomic operations
 *
 * Critical for preventing partial reads in the filesystem bridge protocol.
 * All JSON files must be written atomically to prevent the watcher from
 * observing incomplete data.
 */

import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';

/**
 * Write JSON data atomically using temp file + rename pattern
 *
 * This prevents readers from seeing partial data by:
 * 1. Writing to a temporary file
 * 2. Ensuring data is flushed to disk
 * 3. Atomically renaming to final location
 *
 * @param filePath Target file path
 * @param data Data to serialize as JSON
 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);

  // Create unique temp filename with PID and timestamp
  // This prevents collisions even with concurrent writers
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);

  const fd = fs.openSync(tmp, 'w');
  try {
    // Write and flush data
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(fd, json, 'utf8');

    // Force flush to disk (not needed on Windows, critical on POSIX)
    if (process.platform !== 'win32') {
      fs.fsyncSync(fd);
    }
  } finally {
    fs.closeSync(fd);
  }

  // Atomic rename (on same filesystem)
  // This is atomic on POSIX and Windows NTFS
  fs.renameSync(tmp, filePath);

  // Sync directory to persist the rename (durability on crash)
  if (process.platform !== 'win32') {
    try {
      // Open directory to get fd for fsync
      const dirFd = fs.openSync(dir, 'r');
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // Ignore errors - directory sync is best effort
    }
  }
}

/**
 * Write JSON data atomically (async version)
 */
export async function writeJsonAtomicAsync(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);

  const json = JSON.stringify(data, null, 2);

  // Write to temp file
  const handle = await fsPromises.open(tmp, 'w');
  try {
    await handle.writeFile(json, 'utf8');

    // Force flush on POSIX systems
    if (process.platform !== 'win32') {
      await handle.sync();
    }
  } finally {
    await handle.close();
  }

  // Atomic rename
  await fsPromises.rename(tmp, filePath);

  // Sync directory to persist the rename (durability on crash)
  if (process.platform !== 'win32') {
    try {
      const dirHandle = await fsPromises.opendir(dir);
      try {
        // @ts-ignore Node types: (dirHandle as any).fd is valid in practice
        const fd = (dirHandle as any).fd;
        if (fd !== undefined) {
          // Use promisified version of fs.fsync
          await new Promise<void>((resolve, reject) => {
            fs.fsync(fd, err => err ? reject(err) : resolve());
          });
        }
      } finally {
        await dirHandle.close();
      }
    } catch {
      // Ignore errors - directory sync is best effort
    }
  }
}

/**
 * Read JSON file safely with retry logic
 *
 * Handles race conditions where file might be mid-rename
 */
export async function readJsonSafe<T = any>(filePath: string, maxRetries = 3): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const data = await fsPromises.readFile(filePath, 'utf8');
      return JSON.parse(data) as T;
    } catch (err: any) {
      lastError = err;

      // ENOENT might mean file is being renamed, retry
      if (err.code === 'ENOENT' && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
        continue;
      }

      // JSON parse error is fatal, don't retry
      if (err instanceof SyntaxError) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Failed to read JSON file');
}

/**
 * Check if file exists
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create directory if it doesn't exist
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fsPromises.mkdir(dirPath, { recursive: true });
}

/**
 * Clean up temporary files in a directory
 *
 * Removes any .tmp files older than the specified age
 */
export async function cleanupTempFiles(dir: string, maxAgeMs = 60000): Promise<number> {
  let cleaned = 0;
  const now = Date.now();

  try {
    const files = await fsPromises.readdir(dir);

    for (const file of files) {
      if (!file.endsWith('.tmp')) continue;

      const filePath = path.join(dir, file);
      try {
        const stats = await fsPromises.stat(filePath);
        const age = now - stats.mtime.getTime();

        if (age > maxAgeMs) {
          await fsPromises.unlink(filePath);
          cleaned++;
        }
      } catch {
        // File might have been deleted already
      }
    }
  } catch {
    // Directory might not exist
  }

  return cleaned;
}