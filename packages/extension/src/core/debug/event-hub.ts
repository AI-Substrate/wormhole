import * as vscode from 'vscode';

/**
 * @deprecated This event-based debug tracking approach has been replaced by the polling-based
 * approach in debug-polling-helpers.ts. All debug operations now use waitUntilPausedAndGetLocation()
 * for consistent behavior across step commands, test debugging, and launch config debugging.
 *
 * This file is kept for backwards compatibility but will be removed in a future cleanup phase.
 *
 * Migration path: Replace DebugEventHub.waitForOutcome() with waitUntilPausedAndGetLocation()
 * See: debug-polling-helpers.ts for the standard polling implementation
 *
 * Standardization benefits:
 * - Single source of truth for debug outcome format (formatPausedLocation function)
 * - Future enhancements (like adding local variables) propagate to ALL debug operations automatically
 * - No race conditions with event timing
 * - Consistent behavior across all debug commands
 */

/**
 * Raw Debug Adapter Protocol event
 */
type DapEvent = {
  type: 'event';
  event: string;
  body?: any;
  seq?: number;
};

/**
 * Possible debug session outcomes
 */
export type DebugOutcome =
  | {
      kind: 'stopped';
      reason: string;
      threadId?: number;
      hitBreakpointIds?: number[];
      text?: string;
      allThreadsStopped?: boolean;
    }
  | {
      kind: 'terminated';
    }
  | {
      kind: 'exited';
      exitCode?: number;
    }
  | {
      kind: 'error';
      message: string;
      category?: string;
      output?: string;
    };

/**
 * Singleton hub for managing debug events across all sessions.
 * Uses Debug Adapter Trackers to capture raw DAP events, avoiding race conditions.
 */
export class DebugEventHub {
  private static _instance: DebugEventHub | null = null;

  /**
   * Get the singleton instance
   */
  static get instance(): DebugEventHub {
    return (this._instance ??= new DebugEventHub());
  }

  private disposables: vscode.Disposable[] = [];
  private buffers = new Map<string, DapEvent[]>(); // sessionId -> buffered events
  private waiters = new Map<string, ((outcome: DebugOutcome) => void)[]>(); // sessionId -> callbacks
  private lastStoppedEvents = new Map<string, DapEvent>(); // sessionId -> last stopped event
  private installed = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Install global debug event listeners and trackers.
   * Safe to call multiple times - only installs once.
   *
   * @param debugTypes Debug adapter types to track (e.g., 'node', 'python')
   */
  install(debugTypes: string[] = ['*']) {
    if (this.installed) return;
    this.installed = true;

    // Listen for session lifecycle events
    this.disposables.push(
      vscode.debug.onDidStartDebugSession(session => {
        // console.log(`[DebugEventHub] onDidStartDebugSession:`, {
        //   id: session.id,
        //   type: session.type,
        //   name: session.name,
        //   parentId: session.parentSession?.id
        // });
        this.ensureBuffer(session.id);
      }),

      vscode.debug.onDidTerminateDebugSession(session => {
        // Create a terminated event
        this.pushEvent(session.id, {
          type: 'event',
          event: 'terminated'
        });

        // Clean up buffer after a delay
        setTimeout(() => {
          this.buffers.delete(session.id);
          this.waiters.delete(session.id);
          this.lastStoppedEvents.delete(session.id);
        }, 5000);
      }),

      // Custom events (not standard DAP events like 'stopped')
      vscode.debug.onDidReceiveDebugSessionCustomEvent(event => {
        this.pushEvent(event.session.id, {
          type: 'event',
          event: event.event,
          body: event.body
        });
      })
    );

    // Register Debug Adapter Trackers for all debug types using wildcard
    // This ensures we capture events from ALL debug adapters
    for (const debugType of debugTypes) {
      try {
        const trackerFactory: vscode.DebugAdapterTrackerFactory = {
          createDebugAdapterTracker: (session: vscode.DebugSession) => {
            // console.log(`[DebugEventHub] Tracker attached to session:`, {
            //   id: session.id,
            //   type: session.type,
            //   name: session.name,
            //   parentId: session.parentSession?.id
            // });

            const tracker: vscode.DebugAdapterTracker = {
              onWillStartSession: () => {
                // console.log(`[DebugEventHub] onWillStartSession for ${session.id}`);
                this.ensureBuffer(session.id);
              },

              onDidSendMessage: (message: any) => {
                // Capture all DAP events
                if (message?.type === 'event') {
                  // console.log(`[DebugEventHub] onDidSendMessage for ${session.id}:`, {
                  //   event: message.event,
                  //   reason: message.body?.reason,
                  //   threadId: message.body?.threadId
                  // });
                  this.pushEvent(session.id, message as DapEvent);
                }
              },

              onError: (error: Error) => {
                // Create error event
                this.pushEvent(session.id, {
                  type: 'event',
                  event: 'vscb.error',
                  body: {
                    message: error.message || String(error),
                    stack: error.stack
                  }
                });
              },

              onExit: (code?: number, signal?: string) => {
                // Adapter process exited
                if (code !== undefined || signal !== undefined) {
                  this.pushEvent(session.id, {
                    type: 'event',
                    event: 'exited',
                    body: { exitCode: code, signal }
                  });
                }
              }
            };
            return tracker;
          }
        };

        const disposable = vscode.debug.registerDebugAdapterTrackerFactory(debugType, trackerFactory);
        this.disposables.push(disposable);
      } catch (err) {
        // Ignore if debug type not available on this system
        console.warn(`Could not register tracker for debug type '${debugType}':`, err);
      }
    }
  }

  /**
   * Dispose all resources
   */
  dispose() {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    this.buffers.clear();
    this.waiters.clear();
    this.lastStoppedEvents.clear();
    this.installed = false;
  }

  /**
   * Ensure a buffer exists for the session
   */
  private ensureBuffer(sessionId: string) {
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, []);
    }
  }

  /**
   * Push an event to the buffer and notify waiters if it's an outcome event
   */
  private pushEvent(sessionId: string, event: DapEvent) {
    this.ensureBuffer(sessionId);
    const buffer = this.buffers.get(sessionId)!;
    buffer.push(event);

    // Keep buffer size reasonable (last 100 events)
    if (buffer.length > 100) {
      buffer.shift();
    }

    // Track last stopped event for threadId resolution
    if (event.event === 'stopped') {
      this.lastStoppedEvents.set(sessionId, event);
    }

    // Check if this is an outcome event
    if (this.isOutcomeEvent(event)) {
      const outcome = this.toOutcome(event);
      if (outcome) {
        // Notify all waiters for this session
        const waiters = this.waiters.get(sessionId);
        if (waiters && waiters.length > 0) {
          for (const callback of waiters) {
            callback(outcome);
          }
          this.waiters.delete(sessionId);
        }
      }
    }
  }

  /**
   * Check if an event represents a session outcome
   */
  private isOutcomeEvent(event: DapEvent): boolean {
    return (
      event.event === 'stopped' ||
      event.event === 'terminated' ||
      event.event === 'exited' ||
      event.event === 'vscb.error' ||
      (event.event === 'output' && event.body?.category === 'stderr')
    );
  }

  /**
   * Convert a DAP event to an outcome
   */
  private toOutcome(event: DapEvent): DebugOutcome | undefined {
    switch (event.event) {
      case 'stopped':
        const body = event.body || {};
        return {
          kind: 'stopped',
          reason: body.reason || 'unknown',
          threadId: body.threadId,
          hitBreakpointIds: body.hitBreakpointIds,
          text: body.text || body.description,
          allThreadsStopped: body.allThreadsStopped
        };

      case 'terminated':
        return { kind: 'terminated' };

      case 'exited':
        return {
          kind: 'exited',
          exitCode: event.body?.exitCode
        };

      case 'vscb.error':
        return {
          kind: 'error',
          message: event.body?.message || 'Unknown error',
          category: 'adapter'
        };

      case 'output':
        if (event.body?.category === 'stderr') {
          return {
            kind: 'error',
            message: event.body?.output?.trim() || 'stderr output',
            category: 'stderr',
            output: event.body?.output
          };
        }
        break;
    }

    return undefined;
  }

  /**
   * Check if there's already an outcome in the buffer
   */
  peekOutcome(sessionId: string, threadId?: number): DebugOutcome | undefined {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) return undefined;

    // Look through buffer for first outcome event matching threadId filter
    for (const event of buffer) {
      if (this.isOutcomeEvent(event)) {
        const outcome = this.toOutcome(event);
        if (outcome && this.matchesThread(outcome, threadId)) {
          return outcome;
        }
      }
    }

    return undefined;
  }

  /**
   * Get the last stopped threadId for a session (useful for step commands)
   */
  getLastStoppedThreadId(sessionId: string): number | undefined {
    const lastStopped = this.lastStoppedEvents.get(sessionId);
    return lastStopped?.body?.threadId;
  }

  /**
   * Check if an outcome matches the threadId filter
   */
  private matchesThread(outcome: DebugOutcome, threadId?: number): boolean {
    // No filter = match all
    if (threadId === undefined) {
      return true;
    }

    // Always match terminated/exited regardless of thread
    if (outcome.kind === 'terminated' || outcome.kind === 'exited' || outcome.kind === 'error') {
      return true;
    }

    // For stopped events, match if allThreadsStopped or specific threadId matches
    if (outcome.kind === 'stopped') {
      return outcome.allThreadsStopped === true || outcome.threadId === threadId;
    }

    return false;
  }

  /**
   * Wait for the next outcome for a debug session
   *
   * @param session - Debug session to wait for
   * @param timeoutMs - Timeout in milliseconds
   * @param threadId - Optional threadId to filter stopped events (undefined = match all)
   */
  waitForOutcome(session: vscode.DebugSession, timeoutMs: number = 30000, threadId?: number): Promise<DebugOutcome> {
    const sessionId = session.id;

    // console.log(`[DebugEventHub] waitForOutcome called:`, {
    //   sessionId,
    //   threadId,
    //   timeoutMs,
    //   hasBuffer: this.buffers.has(sessionId),
    //   bufferSize: this.buffers.get(sessionId)?.length ?? 0
    // });

    // Check if outcome already happened
    const existing = this.peekOutcome(sessionId, threadId);
    if (existing) {
      // console.log(`[DebugEventHub] Found existing outcome in buffer:`, existing);
      return Promise.resolve(existing);
    }

    // Wait for future outcome
    return new Promise<DebugOutcome>((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        // Remove this waiter from the list
        const waiters = this.waiters.get(sessionId) || [];
        const index = waiters.indexOf(onOutcome);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
      };

      const onOutcome = (outcome: DebugOutcome) => {
        // Filter by threadId if specified
        if (this.matchesThread(outcome, threadId)) {
          cleanup();
          resolve(outcome);
        }
        // If doesn't match, keep waiting for another outcome
      };

      // Set timeout
      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for debug outcome after ${timeoutMs}ms`));
      }, timeoutMs);

      // Add to waiters list
      const waiters = this.waiters.get(sessionId) || [];
      waiters.push(onOutcome);
      this.waiters.set(sessionId, waiters);
    });
  }

  /**
   * Get all events for a session (for debugging)
   */
  getSessionEvents(sessionId: string): DapEvent[] {
    return this.buffers.get(sessionId) || [];
  }
}