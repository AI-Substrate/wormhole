import * as vscode from 'vscode';

/**
 * Captured output event from DAP
 */
export interface OutputEvent {
  ts: number;
  category: 'stdout' | 'stderr' | 'console' | 'telemetry';
  text: string;
  source?: {
    path?: string;
    name?: string;
  };
  line?: number;
  column?: number;
}

/**
 * Captured exception event from DAP
 */
export interface ExceptionEvent {
  ts: number;
  threadId?: number;
  message?: string;
  description?: string;
}

/**
 * Captured stopped event from DAP
 */
export interface StoppedEvent {
  ts: number;
  reason: string;
  threadId?: number;
  text?: string;
  hitBreakpointIds?: number[];
  allThreadsStopped?: boolean;
}

/**
 * Complete captured debug session data
 */
export interface CapturedSession {
  sessionId: string;
  type: string;
  name: string;
  parentSessionId?: string;
  startTime: number;
  endTime?: number;
  outputs: OutputEvent[];
  exceptions: ExceptionEvent[];
  stoppedEvents: StoppedEvent[];
  lastStoppedThreadId?: number;  // Cache most recent stopped thread ID for getActiveThreadId()
  exitCode?: number;
  terminated: boolean;
}

/**
 * Singleton service for capturing all debug session DAP events.
 *
 * This service registers a global DebugAdapterTrackerFactory that captures
 * output events, exceptions, stopped events, and exit codes from ALL debug
 * sessions. Data is stored in-memory and accessible via simple query methods.
 *
 * Usage:
 *   - Install at extension activation: DebugSessionCaptureService.instance.install(context)
 *   - Query latest session: DebugSessionCaptureService.instance.getSession()
 *   - Query specific session: DebugSessionCaptureService.instance.getSession(sessionId)
 */
export class DebugSessionCaptureService {
  private static _instance: DebugSessionCaptureService | null = null;

  /**
   * Get the singleton instance
   */
  static get instance(): DebugSessionCaptureService {
    return (this._instance ??= new DebugSessionCaptureService());
  }

  private sessions = new Map<string, CapturedSession>();
  private lastSessionId: string | null = null;
  private disposables: vscode.Disposable[] = [];
  private installed = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Install the capture tracker.
   * Safe to call multiple times - only installs once.
   *
   * @param context - Extension context for disposable registration
   */
  install(context: vscode.ExtensionContext): void {
    if (this.installed) return;
    this.installed = true;

    // Register tracker factory for ALL debug types
    const trackerFactory: vscode.DebugAdapterTrackerFactory = {
      createDebugAdapterTracker: (session: vscode.DebugSession) => {
        console.log(`[DebugSessionCapture] 🎯 Tracker attached to session: ${session.id} (${session.type})`);
        console.log(`[DebugSessionCapture]    └─ Name: "${session.name}"`);

        // Initialize session data
        const sessionData: CapturedSession = {
          sessionId: session.id,
          type: session.type,
          name: session.name,
          parentSessionId: session.parentSession?.id,
          startTime: Date.now(),
          outputs: [],
          exceptions: [],
          stoppedEvents: [],
          terminated: false
        };

        this.sessions.set(session.id, sessionData);
        this.lastSessionId = session.id;

        return {
          onWillStartSession: () => {
            sessionData.startTime = Date.now();
            console.log(`[DebugSessionCapture] ▶️  Session starting: ${session.id}`);
          },

          onDidSendMessage: (message: any) => {
            if (message?.type !== 'event') return;

            const ts = Date.now();

            switch (message.event) {
              case 'output':
                sessionData.outputs.push({
                  ts,
                  category: message.body?.category || 'console',
                  text: message.body?.output || '',
                  source: message.body?.source,
                  line: message.body?.line,
                  column: message.body?.column
                });
                console.log(`[DebugSessionCapture] 📝 Output [${message.body?.category || 'console'}]: ${(message.body?.output || '').substring(0, 60)}${(message.body?.output || '').length > 60 ? '...' : ''}`);
                break;

              case 'stopped':
                const stoppedEvent: StoppedEvent = {
                  ts,
                  reason: message.body?.reason || 'unknown',
                  threadId: message.body?.threadId,
                  text: message.body?.text,
                  hitBreakpointIds: message.body?.hitBreakpointIds,
                  allThreadsStopped: message.body?.allThreadsStopped
                };
                sessionData.stoppedEvents.push(stoppedEvent);

                // Cache the most recent stopped thread ID for getActiveThreadId()
                if (message.body?.threadId != null) {
                  sessionData.lastStoppedThreadId = message.body.threadId;
                }

                console.log(`[DebugSessionCapture] ⏸️  Stopped [${message.body?.reason}]: thread=${message.body?.threadId}`);

                // Track exceptions separately
                if (message.body?.reason === 'exception') {
                  sessionData.exceptions.push({
                    ts,
                    threadId: message.body?.threadId,
                    message: message.body?.text,
                    description: message.body?.description
                  });
                  console.log(`[DebugSessionCapture] ❌ Exception captured: ${message.body?.text || 'unknown'}`);
                }
                break;

              case 'exited':
                sessionData.exitCode = message.body?.exitCode;
                sessionData.endTime = Date.now();
                console.log(`[DebugSessionCapture] 🚪 Exited: exitCode=${message.body?.exitCode}`);
                break;

              case 'terminated':
                sessionData.terminated = true;
                sessionData.endTime = Date.now();
                console.log(`[DebugSessionCapture] ⏹️  Terminated: ${session.id}`);
                console.log(`[DebugSessionCapture]    └─ Captured: ${sessionData.outputs.length} outputs, ${sessionData.exceptions.length} exceptions, ${sessionData.stoppedEvents.length} stops`);
                break;
            }
          },

          onExit: (code?: number, signal?: string) => {
            if (code !== undefined && sessionData.exitCode === undefined) {
              sessionData.exitCode = code;
            }
            if (!sessionData.endTime) {
              sessionData.endTime = Date.now();
            }
            console.log(`[DebugSessionCapture] 🏁 Adapter process exited: code=${code}, signal=${signal}`);
          },

          onError: (error: Error) => {
            // Store error as special output event
            sessionData.outputs.push({
              ts: Date.now(),
              category: 'stderr',
              text: `[Adapter Error] ${error.message || String(error)}`
            });
            console.log(`[DebugSessionCapture] ⚠️  Adapter error: ${error.message || String(error)}`);
          }
        };
      }
    };

    const disposable = vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory);
    this.disposables.push(disposable);
    context.subscriptions.push(disposable);
  }

  /**
   * Get a captured session by ID, or the most recent session if no ID provided.
   *
   * @param sessionId - Optional session ID. If omitted, returns the most recent session.
   * @returns The captured session data, or undefined if not found
   */
  getSession(sessionId?: string): CapturedSession | undefined {
    if (sessionId) {
      return this.sessions.get(sessionId);
    }

    // Return latest session
    if (this.lastSessionId) {
      return this.sessions.get(this.lastSessionId);
    }

    return undefined;
  }

  /**
   * Get all captured sessions
   *
   * @returns Array of all captured sessions, most recent first
   */
  getAllSessions(): CapturedSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Get the ID of the most recent session
   *
   * @returns The most recent session ID, or null if no sessions captured
   */
  getLastSessionId(): string | null {
    return this.lastSessionId;
  }

  /**
   * Clear all captured session data
   */
  clear(): void {
    this.sessions.clear();
    this.lastSessionId = null;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    this.sessions.clear();
    this.lastSessionId = null;
    this.installed = false;
  }
}
