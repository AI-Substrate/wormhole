/**
 * Debug Status Query Script - Proof of Concept for @RegisterScript Decorator
 *
 * This is the first real script converted to TypeScript with decorator registration.
 * Serves as validation that Phase 2 decorator system works in production context.
 *
 * Queries comprehensive debugger status including:
 * - Session information
 * - Pause state detection
 * - Thread information
 * - Stack frames
 * - Current location
 * - Scopes (preparation for variable queries)
 *
 * Key insight from research: The 'threads' DAP request only succeeds when paused
 */

import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '../../core/scripts/ScriptResult';
import * as vscode from 'vscode';

// Decorator applied - Phase 2 proof of concept
@RegisterScript('debug.status')
export class DebugStatusScript extends QueryScript<any, any> {
    constructor() {
        super();
        // No parameters needed for debug status (use z.object({}) not optional for void-like params)
        this.paramsSchema = z.object({});

        this.resultSchema = z.object({
            isActive: z.boolean(),
            isPaused: z.boolean(),
            sessionId: z.string().optional(),
            sessionType: z.string().optional(),
            sessionName: z.string().optional(),
            message: z.string().optional()
        });
    }

    async execute(bridgeContext: IBridgeContext, params?: any): Promise<ScriptResult> {
        const vscodeApi = bridgeContext.vscode;
        const session = vscodeApi.debug.activeDebugSession;

        // No active session
        if (!session) {
            return ScriptResult.success({
                isActive: false,
                isPaused: false,
                message: "No active debug session"
            });
        }

        // Basic session info
        const status: any = {
            isActive: true,
            sessionId: session.id,
            sessionType: session.type,
            sessionName: session.name,
            sessionConfiguration: session.configuration
        };

        try {
            // Try to get threads - this is the key pause detection
            // This request only succeeds when the debugger is paused
            console.log(`[DEBUG-STATUS] Attempting threads request for session ${session.id}...`);
            const threadsResponse = await session.customRequest('threads');

            // If we get here, we're paused
            status.isPaused = true;
            status.threads = threadsResponse.threads;
            console.log(`[DEBUG-STATUS] Got ${threadsResponse.threads.length} threads - debugger is PAUSED`);

            // Find which thread is actually paused (has stack frames with source code)
            // This is critical for multi-threaded/isolate debugging (Dart, Java, C#)
            if (threadsResponse.threads && threadsResponse.threads.length > 0) {
                let pausedThread: any = null;
                let stackTraceResponse: any = null;

                // Try each thread to find the one that's paused with source code
                for (const thread of threadsResponse.threads) {
                    try {
                        console.log(`[DEBUG-STATUS] Checking thread ${thread.id} (${thread.name})...`);
                        const stackResponse = await session.customRequest('stackTrace', {
                            threadId: thread.id,
                            startFrame: 0,
                            levels: 50  // Get up to 50 frames
                        });

                        // Check if this thread has frames with actual source code
                        if (stackResponse.stackFrames?.length > 0 &&
                            stackResponse.stackFrames[0].source?.path) {
                            pausedThread = thread;
                            stackTraceResponse = stackResponse;
                            console.log(`[DEBUG-STATUS] Found paused thread: ${thread.id} at ${stackResponse.stackFrames[0].source.path}:${stackResponse.stackFrames[0].line}`);
                            break;
                        }
                    } catch (error: any) {
                        // Thread not paused or error - continue to next thread
                        console.log(`[DEBUG-STATUS] Thread ${thread.id} not paused: ${error.message}`);
                    }
                }

                if (pausedThread && stackTraceResponse) {
                    status.currentThread = {
                        id: pausedThread.id,
                        name: pausedThread.name
                    };
                    status.stackFrames = stackTraceResponse.stackFrames;
                    status.totalFrames = stackTraceResponse.totalFrames;
                } else {
                    // No thread found with source code - still mark as paused but note limitation
                    status.isPaused = true;
                    status.currentThread = {
                        id: threadsResponse.threads[0].id,
                        name: threadsResponse.threads[0].name
                    };
                    status.error = `Thread ${status.currentThread.id} is not paused`;
                    status.errorExplanation = "Unable to query debug status. See error message.";
                    console.log(`[DEBUG-STATUS] No paused thread found with source code`);
                    return ScriptResult.success(status);
                }

                // Extract current location from top frame
                if (stackTraceResponse.stackFrames && stackTraceResponse.stackFrames.length > 0) {
                    const topFrame = stackTraceResponse.stackFrames[0];
                    status.currentLocation = {
                        source: topFrame.source?.path || topFrame.source?.name || 'unknown',
                        line: topFrame.line,
                        column: topFrame.column,
                        functionName: topFrame.name,
                        frameId: topFrame.id
                    };

                    // Get scopes for the top frame (preparation for Phase 1 variable queries)
                    try {
                        console.log(`[DEBUG-STATUS] Getting scopes for frame ${topFrame.id}...`);
                        const scopesResponse = await session.customRequest('scopes', {
                            frameId: topFrame.id
                        });

                        status.scopes = scopesResponse.scopes.map((scope: any) => ({
                            name: scope.name,
                            variablesReference: scope.variablesReference,
                            expensive: scope.expensive,
                            namedVariables: scope.namedVariables,
                            indexedVariables: scope.indexedVariables
                        }));

                        console.log(`[DEBUG-STATUS] Got ${scopesResponse.scopes.length} scopes`);
                    } catch (scopeError: any) {
                        console.warn(`[DEBUG-STATUS] Failed to get scopes: ${scopeError.message}`);
                        status.scopeError = scopeError.message;
                    }
                }
            }

            // Check which breakpoint might have been hit (basic check)
            const breakpoints = vscodeApi.debug.breakpoints;
            status.totalBreakpoints = breakpoints.length;

            // Try to match current location with breakpoints
            if (status.currentLocation) {
                const sourceBreakpoints = breakpoints.filter((bp: vscode.Breakpoint) =>
                    bp instanceof vscodeApi.SourceBreakpoint
                );

                const possibleHit = sourceBreakpoints.find((bp: vscode.SourceBreakpoint) => {
                    const bpPath = bp.location.uri.fsPath;
                    const bpLine = bp.location.range.start.line + 1; // VS Code uses 0-based
                    return bpPath === status.currentLocation.source &&
                           bpLine === status.currentLocation.line;
                });

                if (possibleHit) {
                    status.hitBreakpoint = {
                        id: possibleHit.id,
                        line: possibleHit.location.range.start.line + 1,
                        source: possibleHit.location.uri.fsPath,
                        enabled: possibleHit.enabled,
                        condition: possibleHit.condition
                    };
                }
            }

        } catch (error: any) {
            // Not paused or other error
            status.isPaused = false;
            status.error = error.message;

            // Common error messages and what they mean
            if (error.message.includes('not stopped') || error.message.includes('notStopped')) {
                status.errorExplanation = "Debugger is running. Pause at a breakpoint to query status.";
            } else if (error.message.includes('timeout')) {
                status.errorExplanation = "Request timed out. Debug adapter may be unresponsive.";
            } else {
                status.errorExplanation = "Unable to query debug status. See error message.";
            }

            console.log(`[DEBUG-STATUS] Not paused or error: ${error.message}`);
        }

        // Log summary to console
        console.log('[DEBUG-STATUS] Summary:', {
            isActive: status.isActive,
            isPaused: status.isPaused,
            sessionType: status.sessionType,
            currentLocation: status.currentLocation,
            frameCount: status.stackFrames?.length,
            scopeCount: status.scopes?.length
        });

        // Log to output channel
        bridgeContext.logger.info('Debug status query complete:', JSON.stringify(status, null, 2));

        return ScriptResult.success(status);
    }
}

export default DebugStatusScript;
