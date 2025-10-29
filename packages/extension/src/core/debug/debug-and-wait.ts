import * as vscode from 'vscode';
import { waitUntilPausedAndGetLocation } from './debug-polling-helpers';

/**
 * Generate a unique run ID for session correlation
 */
function generateRunId(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `vscb:${(crypto as any).randomUUID()}`;
  }
  return `vscb:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Parameters for starting and waiting for debug session
 */
export interface DebugAndWaitParams {
  /** Absolute path to the file to debug */
  path: string;
  /** 1-based line number */
  line: number;
  /** 1-based column number (optional) */
  column?: number;
  /** Launch configuration name or inline config object */
  launch?: string | vscode.DebugConfiguration;
  /** Workspace folder to use */
  folder?: vscode.WorkspaceFolder;
  /** Breakpoint condition expression */
  condition?: string;
  /** Hit count expression (e.g., ">5", "==10") */
  hitCondition?: string;
  /** Log message for logpoint */
  logMessage?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Debug session result with detailed information
 */
export type DebugAndWaitResult =
  | {
      event: 'stopped';
      threadId?: number;
      file?: string;
      line?: number;
      column?: number;
      functionName?: string;
      sessionId: string;
    }
  | {
      event: 'terminated';
      sessionId: string;
    }
  | {
      event: 'exited';
      exitCode?: number;
      sessionId: string;
    }
  | {
      event: 'error';
      message: string;
      sessionId?: string;
    };

/**
 * Start a debug session and wait for an outcome (breakpoint hit, termination, or error).
 * This function uses Debug Adapter Trackers to avoid race conditions.
 */
export async function startDebugAndWait(params: DebugAndWaitParams): Promise<DebugAndWaitResult> {
  const runId = generateRunId();
  const timeoutMs = params.timeoutMs || 30000;

  try {
    // 1. Set breakpoint at the specified location (if line provided)
    let breakpoint: vscode.Breakpoint | undefined;
    if (params.line) {
      const uri = vscode.Uri.file(params.path);
      const position = new vscode.Position(Math.max(0, params.line - 1), (params.column || 1) - 1);
      const location = new vscode.Location(uri, position);

      breakpoint = new vscode.SourceBreakpoint(
        location,
        true, // enabled
        params.condition,
        params.hitCondition,
        params.logMessage
      );

      vscode.debug.addBreakpoints([breakpoint]);
    }

    // 2. Prepare launch configuration with runId for correlation
    let config: vscode.DebugConfiguration;

    if (typeof params.launch === 'string') {
      // Resolve named configuration from launch.json
      const folder = params.folder || vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        throw new Error('No workspace folder available to resolve launch configuration');
      }

      const launchConfigs = vscode.workspace.getConfiguration('launch', folder.uri).get<any[]>('configurations') || [];
      const found = launchConfigs.find(c => c.name === params.launch);

      if (!found) {
        throw new Error(`Launch configuration '${params.launch}' not found`);
      }

      config = { ...found, __runId: runId };
    } else if (params.launch) {
      // Use provided config object
      config = { ...params.launch, __runId: runId };
    } else {
      // Default configuration for current file
      const folder = params.folder || vscode.workspace.workspaceFolders?.[0];
      const fileExt = params.path.split('.').pop();

      if (fileExt === 'py') {
        config = {
          type: 'python',
          name: 'Debug Current File',
          request: 'launch',
          program: params.path,
          console: 'integratedTerminal',
          justMyCode: false,
          __runId: runId
        };
      } else if (fileExt === 'js' || fileExt === 'ts') {
        config = {
          type: 'node',
          name: 'Debug Current File',
          request: 'launch',
          program: params.path,
          skipFiles: ['<node_internals>/**'],
          __runId: runId
        };
      } else {
        throw new Error(`Cannot determine debug configuration for file type: ${fileExt}`);
      }
    }

    // 3. Set up session start listener BEFORE starting debug
    const sessionStartPromise = new Promise<vscode.DebugSession>((resolve, reject) => {
      let disposable: vscode.Disposable | undefined;
      let timeoutHandle: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (disposable) disposable.dispose();
        if (timeoutHandle) clearTimeout(timeoutHandle);
      };

      // Listen for session with our runId
      disposable = vscode.debug.onDidStartDebugSession((session) => {
        if ((session.configuration as any).__runId === runId) {
          cleanup();
          resolve(session);
        }
      });

      // Timeout if session never starts
      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error('Debug session failed to start'));
      }, Math.min(timeoutMs / 2, 10000));
    });

    // 4. Start debugging (listeners are already set up)
    const folder = params.folder || vscode.workspace.workspaceFolders?.[0];
    const started = await vscode.debug.startDebugging(folder, config);

    if (!started) {
      return {
        event: 'error',
        message: 'Failed to start debugging (startDebugging returned false)'
      };
    }

    // 5. Get the actual session
    let session: vscode.DebugSession;
    try {
      session = await sessionStartPromise;
    } catch (error: any) {
      return {
        event: 'error',
        message: error?.message || String(error)
      };
    }

    // 6. Wait for session to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // 7. Wait for outcome using standard polling helper
    const result = await waitUntilPausedAndGetLocation(session, timeoutMs, vscode);

    // 8. Return result with sessionId (already included, but ensure it's set)
    return {
      ...result,
      sessionId: session.id
    };

  } catch (error: any) {
    return {
      event: 'error',
      message: error?.message || String(error)
    };
  }
}