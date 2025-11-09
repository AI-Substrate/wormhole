/**
 * Filesystem bridge client for CLI
 */
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { release } from 'os';

export type CommandJson = {
  version: 1;
  clientId: string;
  id: string;
  createdAt: string;
  scriptName: string;
  params: Record<string, unknown>;
  timeout?: number;
  scriptContent?: string;  // For dynamic script execution
};

export type RunOptions = {
  timeout?: number;
  onEvent?: (e: any) => void;
  signal?: AbortSignal;
  verbose?: boolean;
};

/**
 * Maximum time to wait for bridge to claim job (pickup acknowledgment)
 * Used in Phase 3 pickup acknowledgment polling
 */
export const PICKUP_TIMEOUT_MS = 5000;

/**
 * Error code: E_BRIDGE_UNAVAILABLE
 * Used when: Health check fails (bridge not running or crashed)
 * Returned by: Phase 2 pre-submission health check
 */

/**
 * Error code: E_PICKUP_TIMEOUT
 * Used when: Bridge doesn't create claimed.json within PICKUP_TIMEOUT_MS
 * Returned by: Phase 3 pickup acknowledgment polling
 */

/**
 * Find the bridge root directory by traversing upward
 */
export async function findBridgeRoot(startDir?: string): Promise<string> {
  let dir = startDir || process.cwd();

  // Traverse upward until we find .vsc-bridge or hit root
  while (true) {
    const bridgeDir = path.join(dir, '.vsc-bridge');

    try {
      // Check for both host.json and execute directory
      const hostPath = path.join(bridgeDir, 'host.json');
      const executeDir = path.join(bridgeDir, 'execute');

      await fs.access(hostPath);
      await fs.access(executeDir);

      // Found it! Read and log workspace info
      try {
        const hostData = await fs.readFile(hostPath, 'utf8');
        const host = JSON.parse(hostData);
        console.error(`ℹ Found bridge for workspace: ${host.workspace}`);
        console.error(`  Bridge ID: ${host.bridgeId}`);
        console.error(`  Started at: ${host.startedAt}`);
      } catch (err) {
        // Continue even if we can't read host.json details
      }

      return bridgeDir;
    } catch {
      // Not found, go up
      const parent = path.dirname(dir);
      if (parent === dir) {
        // Hit filesystem root
        throw new Error(
          'VSC Bridge not found. Make sure VS Code extension is running and you are in a workspace.\n\n' +
          'To install the VS Code extension:\n' +
          '  npx github:AI-Substrate/wormhole get-vsix --install\n\n' +
          'Or download manually:\n' +
          '  npx github:AI-Substrate/wormhole get-vsix'
        );
      }
      dir = parent;
    }
  }
}

/**
 * Generate a sortable, Windows-safe ID
 * Format: YYYYMMDDTHHMMSSfffZ-<seq4>-<rand4hex>
 * Example: 20250916T124512083Z-0001-ab12
 * Total length: ≤30 chars
 */
export function sortableId(seq: number): string {
  const now = new Date();

  // Format date components with zero padding
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const millis = String(now.getUTCMilliseconds()).padStart(3, '0');

  // Format: YYYYMMDDTHHMMSSfffZ (19 chars)
  const timestamp = `${year}${month}${day}T${hours}${minutes}${seconds}${millis}Z`;

  // Zero-pad sequence to 4 digits
  const seqPadded = String(seq).padStart(4, '0').slice(-4);

  // Random component (4 hex chars)
  const random = crypto.randomBytes(2).toString('hex');

  // Total: 19 + 1 + 4 + 1 + 4 = 29 chars (under 30 limit)
  return `${timestamp}-${seqPadded}-${random}`;
}

/**
 * Create a normalized error envelope
 * Exported for testing purposes
 */
export function makeErrorEnvelope(code: string, message: string): any {
  return {
    ok: false,
    type: 'error',
    error: {
      code,
      message
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Execute a command through the filesystem bridge
 */
export async function runCommand(
  bridgeRoot: string,
  payload: CommandJson,
  opts?: RunOptions
): Promise<any> {
  // Pre-submission health check (Phase 2)
  const health = await checkBridgeHealth(bridgeRoot);
  if (!health.healthy) {
    // Calculate age for diagnostic detail
    const lastSeenTime = health.lastSeen.getTime();
    const isEpoch = lastSeenTime === 0;

    let diagnostic: string;
    if (isEpoch) {
      diagnostic = 'host.json not found';
    } else {
      const ageSeconds = Math.floor((Date.now() - lastSeenTime) / 1000);
      diagnostic = `host.json age: ${ageSeconds}s (stale)`;
    }

    return makeErrorEnvelope(
      'E_BRIDGE_UNAVAILABLE',
      `Bridge is unavailable (Extension not running, crashed, or not installed). ${diagnostic}. Check that VS Code is open with vsc-bridge extension installed and active.\n\n` +
      `To install the VS Code extension:\n` +
      `  vscb get-vsix --install\n\n` +
      `Or download manually:\n` +
      `  vscb get-vsix`
    );
  }

  const jobDir = path.join(bridgeRoot, 'execute', payload.id);

  // Create job directory with restricted permissions
  await fs.mkdir(jobDir, { recursive: true, mode: 0o700 });

  // Write command atomically (write to tmp, fsync, then rename)
  const commandPath = path.join(jobDir, 'command.json');
  const tmpPath = `${commandPath}.tmp`;

  // Write to temp file with fsync for durability
  const fd = await fs.open(tmpPath, 'w');
  try {
    await fd.writeFile(JSON.stringify(payload, null, 2));
    await fd.sync(); // Ensure data is flushed to disk before rename
    await fd.close();
  } catch (err) {
    await fd.close();
    throw err;
  }

  await fs.rename(tmpPath, commandPath);

  // Phase 4: Track overall start time
  const totalTimeout = opts?.timeout || 30000; // Duration: total time budget
  const overallStartTime = Date.now(); // NEW: Absolute timestamp - track overall start for absolute deadline

  // Phase 3: Wait for pickup acknowledgment
  // Respect total timeout: don't wait longer than the caller's budget
  const pickupLimit = Math.min(totalTimeout, PICKUP_TIMEOUT_MS);
  const pickupStartTime = Date.now(); // NEW: Absolute timestamp - pickup phase start
  const pickupResult = await waitForPickupAck(jobDir, pickupLimit, opts?.signal);
  const pickupEndTime = Date.now(); // NEW: Absolute timestamp - pickup phase end
  const pickupDuration = pickupEndTime - pickupStartTime; // NEW: Duration - actual pickup time

  if (!pickupResult.claimed) {
    const pickupElapsed = Date.now() - overallStartTime;
    // If we've exhausted the total timeout budget, return E_TIMEOUT (not E_PICKUP_TIMEOUT)
    if (pickupElapsed >= totalTimeout) {
      return makeErrorEnvelope(
        'E_TIMEOUT',
        `Command timed out after ${totalTimeout}ms`
      );
    }
    // Otherwise, pickup timeout occurred within budget (bridge overloaded/crashed)
    return makeErrorEnvelope(
      'E_PICKUP_TIMEOUT',
      `Bridge did not pick up job within 5 seconds. The extension might be overloaded, at capacity, crashed, or not installed. If extension crashed, try restarting VS Code. Check bridge logs and capacity settings (MAX_CONCURRENT).\n\n` +
      `To install the VS Code extension:\n` +
      `  vscb get-vsix --install\n\n` +
      `Or download manually:\n` +
      `  vscb get-vsix`
    );
  }

  // Phase 5: Verbose logging - log pickup duration when verbose flag enabled
  if (opts?.verbose) {
    process.stderr.write(`[DEBUG] Job claimed in ${pickupDuration}ms\n`);
  }

  // Phase 4: Calculate remaining timeout for execution phase
  const remainingTimeout = totalTimeout - pickupDuration; // Duration: time left for execution

  // Edge case: pickup consumed full timeout (T013)
  if (remainingTimeout <= 0) {
    return makeErrorEnvelope(
      'E_TIMEOUT',
      `Command timed out after ${totalTimeout}ms`
    );
  }

  // Setup timeout for execution phase
  const executionStartTime = Date.now(); // NEW: Absolute timestamp - execution phase start

  // Poll for completion
  const pollInterval = isWSL() ? 150 : 50; // Higher interval for WSL

  while (true) {
    // Phase 4: Absolute deadline check (safety net)
    const totalElapsed = Date.now() - overallStartTime; // Duration: total time since start
    if (totalElapsed > totalTimeout) {
      return makeErrorEnvelope('E_TIMEOUT', `Command timed out after ${totalTimeout}ms`);
    }

    // Phase 4: Remaining timeout check
    const executionElapsed = Date.now() - executionStartTime; // Duration: time in execution phase
    if (executionElapsed > remainingTimeout) {
      return makeErrorEnvelope('E_TIMEOUT', `Command timed out after ${totalTimeout}ms`);
    }

    // Check for abort signal
    if (opts?.signal?.aborted) {
      await cancelCommand(bridgeRoot, payload.id);
      // Continue polling for actual cancellation
    }

    // Check for done file
    const donePath = path.join(jobDir, 'done');
    try {
      await fs.access(donePath);
      // Done! Read response
      break;
    } catch {
      // Not done yet, continue polling
    }

    // Check for events if handler provided
    if (opts?.onEvent) {
      const eventsPath = path.join(jobDir, 'events.ndjson');
      try {
        // We'll implement watchEvents separately
        // For now just check if file exists
        await fs.access(eventsPath);
      } catch {}
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Read response or error
  const errorPath = path.join(jobDir, 'error.json');
  const responsePath = path.join(jobDir, 'response.json');

  try {
    // Prefer error over response
    const errorData = await fs.readFile(errorPath, 'utf8');
    return JSON.parse(errorData);
  } catch {
    // No error, try response
    try {
      const responseData = await fs.readFile(responsePath, 'utf8');
      const response = JSON.parse(responseData);

      // Check for dataRef (large payload)
      if (response.dataRef) {
        const dataPath = path.join(jobDir, response.dataRef);
        const largeDataText = await fs.readFile(dataPath, 'utf8');
        // Parse as JSON to maintain envelope type parity
        response.data = JSON.parse(largeDataText);
        delete response.dataRef;
      }

      return response;
    } catch {
      // No response either
      return makeErrorEnvelope('E_NO_RESPONSE', 'Command completed without response');
    }
  }
}

// Helper to detect WSL (imported from wsl.ts in real impl)
function isWSL(): boolean {
  return /microsoft|wsl/i.test(release());
}

/**
 * Wait for bridge to claim job by creating claimed.json
 * Returns when claimed.json detected or timeout expires
 * Uses lenient validation: file existence only, no structure parsing
 *
 * @param jobDir - Absolute path to job directory
 * @param timeoutMs - Maximum time to wait for pickup (typically PICKUP_TIMEOUT_MS)
 * @param signal - Optional AbortSignal for cancellation during pickup
 * @returns Promise resolving to { claimed: boolean }
 */
async function waitForPickupAck(
  jobDir: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ claimed: boolean }> {
  const startTime = Date.now();
  const pollInterval = isWSL() ? 150 : 50;
  const claimedPath = path.join(jobDir, 'claimed.json');

  while (true) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      return { claimed: false };
    }

    // Check abort signal
    if (signal?.aborted) {
      return { claimed: false };
    }

    // Check for claimed.json (lenient: file existence only)
    try {
      await fs.access(claimedPath);
      // File exists - that's sufficient (lenient validation decision)
      return { claimed: true };
    } catch {
      // File doesn't exist yet
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

/**
 * Cancel a running command
 */
export async function cancelCommand(bridgeRoot: string, id: string): Promise<void> {
  const cancelPath = path.join(bridgeRoot, 'execute', id, 'cancel');

  try {
    // Write cancel sentinel with restricted permissions (idempotent)
    await fs.writeFile(cancelPath, '', { mode: 0o600 });
  } catch {
    // Job directory might not exist, that's OK
  }
}

/**
 * Watch events from an event stream file with robust partial line handling
 */
export async function watchEvents(
  eventPath: string,
  cb: (e: any) => void
): Promise<() => void> {
  let watching = true;
  let byteOffset = 0;
  let partialLine = ''; // Buffer for incomplete lines

  // Polling-based approach for reliability
  const pollInterval = isWSL() ? 150 : 50;

  const poll = async () => {
    if (!watching) return;

    try {
      // Check if file exists and get size
      const stats = await fs.stat(eventPath);

      if (stats.size > byteOffset) {
        // Read only new bytes
        const fd = await fs.open(eventPath, 'r');
        try {
          const buffer = Buffer.alloc(stats.size - byteOffset);
          await fd.read(buffer, 0, buffer.length, byteOffset);
          await fd.close();

          // Combine with any partial line from previous read
          const text = buffer.toString('utf8');
          const lines = text.split('\n');
          lines[0] = partialLine + lines[0];   // prepend any prior partial
          partialLine = lines.pop() ?? '';      // last item is the new partial (maybe '')

          // Process all complete lines
          for (const line of lines) {
            if (!line) continue;
            try {
              const event = JSON.parse(line);
              cb(event);
            } catch (err) {
              // Log malformed JSON for debugging but don't fail
              console.error('Malformed event line:', line);
            }
          }

          // Update offset to current file size (we've read all available bytes)
          byteOffset = stats.size;
        } catch (err) {
          await fd.close();
          throw err;
        }
      }
    } catch (err: any) {
      // File might not exist yet (ENOENT is expected)
      if (err.code !== 'ENOENT') {
        console.error('Error reading events:', err.message);
      }
    }

    if (watching) {
      setTimeout(poll, pollInterval);
    }
  };

  // Start polling
  poll();

  // Return unsubscribe function
  return () => {
    watching = false;
  };
}

/**
 * Check bridge health status
 */
export async function checkBridgeHealth(
  bridgeRoot: string
): Promise<{ healthy: boolean; lastSeen: Date }> {
  const hostPath = path.join(bridgeRoot, 'host.json');

  try {
    const stats = await fs.stat(hostPath);
    const mtime = stats.mtime;
    const age = Date.now() - mtime.getTime();

    // Consider healthy if updated within 30 seconds
    // (Extension updates every ~10s)
    const healthy = age < 30000;

    return {
      healthy,
      lastSeen: mtime
    };
  } catch {
    // File doesn't exist
    return {
      healthy: false,
      lastSeen: new Date(0)
    };
  }
}