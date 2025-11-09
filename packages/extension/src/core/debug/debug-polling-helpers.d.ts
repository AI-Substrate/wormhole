/**
 * Type declarations for debug-polling-helpers.js
 *
 * Per Subtask 001 ST001b: Standardized to return IDebugError fields in error outcomes.
 * Helpers NEVER THROW - always return outcome objects.
 */

import { DebugErrorCode } from '../errors/debug-errors';

/**
 * Standard debug outcome result from polling helper
 *
 * ST001b: Error outcomes now include IDebugError fields (code, hint, detail)
 */
export type PollingResult =
  | {
      event: 'stopped';
      file: string;
      line: number;
      column: number;
      functionName: string;
      threadId: number;
      sessionId: string;
    }
  | {
      event: 'terminated';
      sessionId: string;
    }
  | {
      event: 'error';
      sessionId: string;
      code: DebugErrorCode;
      message: string;
      hint?: string;
      detail?: string;
    };

/**
 * Wait for a stopped event after a step operation (capture-query approach)
 *
 * NEVER THROWS - Returns error outcome with IDebugError fields on timeout/failure
 *
 * @param session - VS Code debug session
 * @param threadId - Thread ID that will be stepped (may be null for multi-thread scenarios)
 * @param vscode - VS Code API
 * @param stepOperation - Async function that sends the DAP step request
 * @param timeoutMs - Maximum time to wait for stopped event
 * @returns Promise resolving to debug outcome (stopped | terminated | error)
 */
export function waitForStoppedEventAndGetLocation(
  session: any,
  threadId: number | null,
  vscode: any,
  stepOperation: () => Promise<void>,
  timeoutMs?: number
): Promise<PollingResult>;

/**
 * Poll until debugger is paused, terminated, or error occurs
 *
 * NEVER THROWS - Returns error outcome with IDebugError fields on timeout/failure
 *
 * @param session - VS Code debug session (or null if useActiveSession=true)
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param vscode - VS Code API (for checking active session)
 * @param useActiveSession - If true, use vscode.debug.activeDebugSession dynamically each poll
 * @returns Promise resolving to debug outcome (stopped | terminated | error)
 */
export function waitUntilPausedAndGetLocation(
  session: any,
  timeoutMs?: number,
  vscode?: any,
  useActiveSession?: boolean
): Promise<PollingResult>;

/**
 * Centralized formatter for paused location info
 *
 * @param session - VS Code debug session
 * @param topFrame - Top stack frame from DAP stackTrace response
 * @param threadId - Thread ID
 * @returns Standardized paused location info
 */
export function formatPausedLocation(
  session: any,
  topFrame: any,
  threadId: number
): PollingResult & { event: 'stopped' };
