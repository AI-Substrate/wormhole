import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import {
  CommandJson,
  ClaimedJson,
  ResponseJson,
  ErrorJson,
  EventJson,
  ErrorCode,
  CancellationError,
  ResponseMeta
} from './types';
import { writeJsonAtomic, writeJsonAtomicAsync } from './io';
import { writeDlqMarker } from './dlq';
import { ITelemetry } from '../telemetry';

/**
 * Maximum number of concurrent jobs
 */
export const MAX_CONCURRENT = 10;

/**
 * Current number of in-flight jobs
 */
export let inFlight = 0;

/**
 * Failure timestamps for flood protection (rolling 60-second window)
 */
let failureTimestamps: number[] = [];

/**
 * Last flood telemetry event timestamp (for 60s throttling)
 */
let lastFloodEventTime = 0;

/**
 * Reset flood protection state (for testing only)
 * @internal
 */
export function resetFloodProtection(): void {
  failureTimestamps = [];
}

/**
 * Event writer for streaming events to NDJSON file
 */
export class EventWriter {
  private seq = 0;
  private stream: fs.WriteStream | null = null;
  private closed = false;
  private pendingWrites: Promise<void> = Promise.resolve();
  private lastError: Error | null = null;

  constructor(private eventPath: string) {}

  private ensureStream(): fs.WriteStream {
    if (!this.stream && !this.closed) {
      this.stream = fs.createWriteStream(this.eventPath, { flags: 'a' });
      // Note: Error event handler registered per-write in writeLine()
      // to enable proper promise rejection
    }
    if (!this.stream) {
      throw new Error('Event stream is closed');
    }
    return this.stream;
  }

  private async writeLine(line: string): Promise<void> {
    const stream = this.ensureStream();

    // Check for pre-existing error
    if (this.lastError) {
      throw this.lastError;
    }

    // Wrap in promise to catch synchronous and asynchronous errors
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      // Set up one-time error handler for this write
      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        stream.off('drain', onDrain);
        this.lastError = err;
        reject(err);
      };

      const onDrain = () => {
        if (settled) return;
        settled = true;
        stream.off('error', onError);
        resolve();
      };

      stream.once('error', onError);

      const writeResult = stream.write(line, (err) => {
        if (settled) return;
        settled = true;
        stream.off('error', onError);
        stream.off('drain', onDrain);

        if (err) {
          this.lastError = err;
          reject(err);
        } else {
          resolve();
        }
      });

      // Check backpressure AFTER write call
      if (!writeResult) {
        // Buffer full, wait for drain
        stream.once('drain', onDrain);
      }
      // Note: If writeResult is true, callback will handle resolution
    });
  }

  async writeEvent(type: EventJson['type'], data: Partial<EventJson>): Promise<void> {
    // Fail-fast: throw immediately if stream has errored (per /didyouknow Insight #1)
    if (this.lastError) {
      throw this.lastError;
    }
    if (this.closed) {
      throw new Error('Cannot write to closed EventWriter');
    }

    const event: EventJson = {
      ts: Date.now(),
      seq: this.seq++,
      type,
      ...data
    };

    // Chain writes to maintain order - await the same promise we create
    const writePromise = this.pendingWrites.then(async () => {
      await this.writeLine(JSON.stringify(event) + '\n');
    });

    this.pendingWrites = writePromise;
    await writePromise;
  }

  writeProgress(pct: number, msg: string): void {
    this.writeEvent('progress', { pct, msg }).catch(() => {});
  }

  writeLog(level: EventJson['level'], text: string, data?: any): void {
    this.writeEvent('log', { level, text, data }).catch(() => {});
  }

  writeWarning(text: string): void {
    this.writeEvent('warn', { text }).catch(() => {});
  }

  writeError(text: string, data?: any): void {
    this.writeEvent('error', { text, data }).catch(() => {});
  }

  close(): Promise<void> {
    if (this.closed && !this.stream) {
      // Already closed, idempotent
      return Promise.resolve();
    }

    this.closed = true;

    return new Promise((resolve, reject) => {
      // Wait for pending writes first
      this.pendingWrites
        .catch(() => {}) // Ignore write errors, we're closing anyway
        .finally(() => {
          if (!this.stream) {
            return resolve();
          }

          // Add timeout protection (5s, per /didyouknow Insight #2)
          const timeout = setTimeout(() => {
            reject(new Error('EventWriter close timeout after 5s'));
          }, 5000);

          this.stream.once('finish', () => {
            clearTimeout(timeout);
            resolve();
          });

          this.stream.end();
        });
    });
  }
}

/**
 * Check if bridge is flooded (10 failures in 60 seconds)
 * Returns flood status and retryAfter seconds if flooded
 */
function isFlooded(): { flooded: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowStart = now - 60_000; // 60 seconds ago

  // Remove failures outside window
  failureTimestamps = failureTimestamps.filter(t => t > windowStart);

  if (failureTimestamps.length >= 10) {
    const oldestFailure = Math.min(...failureTimestamps);
    const retryAfter = Math.ceil((oldestFailure + 60_000 - now) / 1000);
    return { flooded: true, retryAfter };
  }

  return { flooded: false };
}

/**
 * Launch a job with capacity checking and counter management
 *
 * Checks if we're at capacity (MAX_CONCURRENT). If so, writes E_CAPACITY error
 * and returns immediately. Otherwise, increments counter, launches processCommand
 * in fire-and-forget mode, and ensures counter is decremented in finally block.
 */
export function launchJob(
  jobDir: string,
  bridgeId: string,
  executor: (command: CommandJson, eventWriter: EventWriter) => Promise<any>,
  telemetry?: ITelemetry
): void {
  // Check flood protection FIRST (before capacity)
  const floodCheck = isFlooded();
  if (floodCheck.flooded) {
    // Send JobFloodDetected event with 60s throttling (T015, T013)
    try {
      const now = Date.now();
      if (telemetry?.isEnabled() && (now - lastFloodEventTime) > 60000) {
        telemetry.sendEvent('JobFloodDetected', {
          sessionId: telemetry.getSessionId(),
          reason: 'flood_protection',
          telemetrySchemaVersion: '2' // Phase 3: Privacy-enhanced schema (Finding DR-05)
        }, {
          failureCount: failureTimestamps.length,
          retryAfterSeconds: floodCheck.retryAfter || 0
        });
        lastFloodEventTime = now;
      }
    } catch (error) {
      // Graceful degradation
    }

    const errorEnvelope = createErrorEnvelope(
      ErrorCode.E_CIRCUIT_OPEN,
      `Bridge is flooded (10 failures in 60 seconds). Try again in ${floodCheck.retryAfter}s.`,
      path.basename(jobDir),
      Date.now()
    );

    // Add retryAfter to error details
    errorEnvelope.error.details = {
      ...errorEnvelope.error.details,
      retryAfter: floodCheck.retryAfter
    };

    writeResponse(jobDir, errorEnvelope)
      .then(() => writeDone(jobDir))
      .catch(err => console.error(`[Processor] Failed to write flood error: ${err}`));

    console.log(`[Processor] Job rejected (flood): ${path.basename(jobDir)}`);
    return;
  }

  // Check capacity
  if (inFlight >= MAX_CONCURRENT) {
    // Send JobCapacityReached event (T014, T013)
    try {
      if (telemetry?.isEnabled()) {
        telemetry.sendEvent('JobCapacityReached', {
          sessionId: telemetry.getSessionId(),
          reason: 'capacity_exceeded',
          telemetrySchemaVersion: '2' // Phase 3: Privacy-enhanced schema (Finding DR-05)
        }, {
          inFlightCount: inFlight,
          maxConcurrent: MAX_CONCURRENT
        });
      }
    } catch (error) {
      // Graceful degradation
    }

    // Write E_CAPACITY error inline
    const errorEnvelope = createErrorEnvelope(
      ErrorCode.E_CAPACITY,
      `Capacity limit reached (${MAX_CONCURRENT} concurrent jobs)`,
      path.basename(jobDir),
      Date.now()
    );

    // Write error and done marker synchronously (blocking is acceptable for rejection)
    writeResponse(jobDir, errorEnvelope)
      .then(() => writeDone(jobDir))
      .catch(err => console.error(`[Processor] Failed to write capacity error: ${err}`));

    console.log(`[Processor] Job rejected (capacity): ${path.basename(jobDir)}`);
    return;
  }

  // Increment counter
  inFlight++;
  console.log(`[Processor] Job launched (inFlight: ${inFlight}/${MAX_CONCURRENT}): ${path.basename(jobDir)}`);

  // Launch job without awaiting (fire-and-forget)
  processCommand(jobDir, bridgeId, executor, telemetry)
    .finally(() => {
      // Always decrement counter
      inFlight--;
      console.log(`[Processor] Job completed (inFlight: ${inFlight}/${MAX_CONCURRENT}): ${path.basename(jobDir)}`);
    });
}

/**
 * Atomically claim a job using exclusive file creation
 *
 * This is THE critical synchronization primitive. Only one
 * process can successfully create the claimed.json file.
 */
export function claimJobAtomic(jobDir: string, bridgeId: string): boolean {
  const claimedPath = path.join(jobDir, 'claimed.json');

  try {
    // 'wx' flag ensures exclusive creation - fails if file exists
    const fd = fs.openSync(claimedPath, 'wx');

    const claim: ClaimedJson = {
      bridgeId,
      claimedAt: new Date().toISOString(),
      pid: process.pid
    };

    // Write directly with fd since we already have exclusive lock
    // No need for atomic write here since 'wx' already guarantees atomicity
    fs.writeFileSync(fd, JSON.stringify(claim, null, 2));
    fs.closeSync(fd);

    console.log(`[Processor] Successfully claimed job: ${path.basename(jobDir)}`);
    return true;

  } catch (err: any) {
    if (err.code === 'EEXIST') {
      // Another process claimed it first
      console.log(`[Processor] Job already claimed: ${path.basename(jobDir)}`);
      return false;
    }
    // Unexpected error
    console.error(`[Processor] Failed to claim job: ${err}`);
    throw err;
  }
}

/**
 * Check if a job has been cancelled
 */
export async function checkCancellation(jobDir: string): Promise<boolean> {
  const cancelPath = path.join(jobDir, 'cancel');
  try {
    await fsPromises.access(cancelPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write response atomically
 */
export async function writeResponse(
  jobDir: string,
  envelope: ResponseJson | ErrorJson
): Promise<void> {
  const isError = !envelope.ok;
  const filename = isError ? 'error.json' : 'response.json';
  const filePath = path.join(jobDir, filename);

  // Check for large payload (only for success responses)
  if (!isError && envelope.data) {
    const dataSize = JSON.stringify(envelope.data).length;

    if (dataSize > 2 * 1024 * 1024) { // 2MB threshold
      // Write large data to separate file atomically
      const dataPath = path.join(jobDir, 'data.json');
      await writeJsonAtomicAsync(dataPath, envelope.data);

      // Create response with reference
      const responseWithRef: ResponseJson = {
        ...envelope,
        data: undefined,
        dataRef: 'data.json'
      };

      await writeJsonAtomicAsync(filePath, responseWithRef);
    } else {
      // Write inline for small responses
      await writeJsonAtomicAsync(filePath, envelope);
    }
  } else {
    // Write error or response without data
    await writeJsonAtomicAsync(filePath, envelope);
  }
}

/**
 * Write done marker file
 */
export async function writeDone(jobDir: string): Promise<void> {
  const donePath = path.join(jobDir, 'done');
  await fsPromises.writeFile(donePath, '');
}

/**
 * Create error envelope
 */
export function createErrorEnvelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  startTime: number,
  details?: any
): ErrorJson {
  return {
    ok: false,
    type: 'error',
    error: {
      code,
      message,
      details
    },
    meta: {
      requestId,
      mode: 'normal',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime
    }
  };
}

/**
 * Create success envelope
 */
export function createSuccessEnvelope(
  data: any,
  requestId: string,
  startTime: number,
  editorContext?: any
): ResponseJson {
  return {
    ok: true,
    type: 'success',
    data,
    meta: {
      requestId,
      mode: 'normal',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime
    },
    editorContext
  };
}


/**
 * Process a command with cancellation support
 */
export async function processCommand(
  jobDir: string,
  bridgeId: string,
  executor: (command: CommandJson, eventWriter: EventWriter) => Promise<any>,
  telemetry?: ITelemetry
): Promise<void> {
  const startTime = Date.now();
  const commandPath = path.join(jobDir, 'command.json');
  const eventWriter = new EventWriter(path.join(jobDir, 'events.ndjson'));
  let scriptName = 'unknown';
  let cancelled = false;

  try {
    // Read command
    const commandData = await fsPromises.readFile(commandPath, 'utf8');
    const command = JSON.parse(commandData) as CommandJson;
    scriptName = command.scriptName;

    // Log command details to console for debugging
    console.log(`[Processor] Processing command: ${command.scriptName}`);
    if (Object.keys(command.params || {}).length > 0) {
      console.log(`[Processor] Parameters:`, command.params);
    } else {
      console.log(`[Processor] Parameters: (none)`);
    }

    eventWriter.writeLog('info', `Processing command: ${command.scriptName}`);

    // Set up cancellation checking with platform-aware polling
    const isWSL = !!process.env.WSL_DISTRO_NAME;
    const cancelPollMs = isWSL ? 125 : 50; // 100-150ms WSL; 50ms native

    // Create a promise that rejects on cancellation
    const cancelPromise = new Promise<never>((_, reject) => {
      const interval = setInterval(async () => {
        if (await checkCancellation(jobDir)) {
          clearInterval(interval);
          reject(new CancellationError());
        }
      }, cancelPollMs);
    });

    // Execute command with cancellation race
    let result: any;
    try {
      result = await Promise.race([
        executor(command, eventWriter),
        cancelPromise
      ]);
    } catch (err) {
      // Re-throw to be handled by outer catch
      throw err;
    }

    // Write success response (preserving editorContext from Phase 2)
    const envelope = createSuccessEnvelope(result.data, command.id, startTime, result.editorContext);
    await writeResponse(jobDir, envelope);

    eventWriter.writeLog('info', 'Command completed successfully');

    // Send CommandProcessingCompleted event (T016, T013 - success path)
    try {
      if (telemetry?.isEnabled()) {
        telemetry.sendEvent('CommandProcessingCompleted', {
          sessionId: telemetry.getSessionId(),
          scriptName,
          success: 'true',
          cancelled: 'false',
          telemetrySchemaVersion: '2' // Phase 3: Privacy-enhanced schema (Finding DR-05)
        }, {
          durationMs: Date.now() - startTime
        });
      }
    } catch (error) {
      // Graceful degradation
    }

  } catch (err: any) {
    let errorEnvelope: ErrorJson;

    if (err instanceof CancellationError) {
      cancelled = true;
      errorEnvelope = createErrorEnvelope(
        ErrorCode.E_CANCELLED,
        'Operation cancelled by user',
        path.basename(jobDir),
        startTime
      );
      eventWriter.writeLog('warn', 'Command cancelled');
    } else {
      // Record failure for flood tracking (non-cancellation errors only)
      failureTimestamps.push(Date.now());

      const message = err.message || 'Unknown error';
      errorEnvelope = createErrorEnvelope(
        ErrorCode.E_INTERNAL,
        message,
        path.basename(jobDir),
        startTime,
        { error: String(err), stack: err.stack }
      );
      eventWriter.writeError('Command failed', { error: message });

      // Write DLQ marker for failed jobs (immediate quarantine, no retry)
      // Read command to get script name for DLQ metadata
      let scriptName = 'unknown';
      try {
        const commandPath = path.join(jobDir, 'command.json');
        const commandData = await fsPromises.readFile(commandPath, 'utf8');
        const command = JSON.parse(commandData) as CommandJson;
        scriptName = command.scriptName;
      } catch {
        // Ignore if we can't read command; use 'unknown'
      }

      await writeDlqMarker(jobDir, {
        reason: ErrorCode.E_INTERNAL,
        scriptName,
        error: message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
        bridgeId
      });
    }

    await writeResponse(jobDir, errorEnvelope);

    // Send CommandProcessingCompleted event (T016, T013 - error/cancelled path)
    try {
      if (telemetry?.isEnabled()) {
        telemetry.sendEvent('CommandProcessingCompleted', {
          sessionId: telemetry.getSessionId(),
          scriptName,
          success: 'false',
          cancelled: cancelled ? 'true' : 'false',
          telemetrySchemaVersion: '2' // Phase 3: Privacy-enhanced schema (Finding DR-05)
        }, {
          durationMs: Date.now() - startTime
        });
      }
    } catch (error) {
      // Graceful degradation
    }

  } finally {
    // Always write done marker and close event stream (per /didyouknow Insight #3: KISS)
    try {
      await eventWriter.close();
    } catch (err) {
      console.error(`[Processor] EventWriter close failed: ${err}`);
      // Continue to done marker anyway
    }
    await writeDone(jobDir);
  }
}