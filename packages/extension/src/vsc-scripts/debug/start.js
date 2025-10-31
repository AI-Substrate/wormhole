const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');
const { waitUntilPausedAndGetLocation } = require('@core/debug/debug-polling-helpers');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Start debug session waitable script
 * Starts a debug session and waits until it's initialized
 *
 * When wait=true, behaves like tests.debug-single:
 * - Launches the program via launch configuration
 * - Waits for breakpoint hit, error, or program exit
 * - Returns the outcome event
 */
class StartDebugScript extends WaitableScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            launch: z.string().min(1),
            folder: z.string().optional(),
            timeoutMs: z.number().int().min(1).max(300000).default(30000),
            wait: z.boolean().default(false)
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{launch: string, folder?: string, timeoutMs?: number, wait?: boolean}} params
     * @returns {Promise<{sessionId: string, adapterType: string, workspaceFolder?: string, event?: string, file?: string, line?: number}>}
     */
    async wait(bridgeContext, params) {
        try {
            const vscode = bridgeContext.vscode;
            const outputChannel = bridgeContext.outputChannel;

            // Find the launch configuration
            const workspaceFolder = params.folder
                ? vscode.workspace.workspaceFolders?.find(f => f.uri.fsPath === params.folder)
                : vscode.workspace.workspaceFolders?.[0];

            if (!workspaceFolder) {
                const error = new Error(`Workspace folder not found: ${params.folder || 'default'}`);
                error.code = ErrorCode.E_NOT_FOUND;
                throw error;
            }

            // Start the debug session
            const sessionStartedPromise = new Promise((resolve, reject) => {
                let disposable;
                const timeout = setTimeout(() => {
                    if (disposable) disposable.dispose();
                    const error = new Error('Debug session failed to start');
                    error.code = ErrorCode.E_TIMEOUT;
                    reject(error);
                }, params.timeoutMs);

                // Listen for session start
                disposable = vscode.debug.onDidStartDebugSession((session) => {
                    clearTimeout(timeout);
                    disposable.dispose();
                    resolve(session);
                });
            });

            // Start debugging with the launch configuration
            const started = await vscode.debug.startDebugging(
                workspaceFolder,
                params.launch
            );

            if (!started) {
                const error = new Error(`Failed to start debug configuration: ${params.launch}`);
                error.code = ErrorCode.E_OPERATION_FAILED;
                throw error;
            }

            // Wait for session to be fully initialized
            const session = await sessionStartedPromise;

            // Wait a bit for the session to be fully ready
            await new Promise(resolve => setTimeout(resolve, 500));

            // Log to output channel
            if (outputChannel) {
                outputChannel.appendLine(
                    `[debug.start] Started debug session: ${session.name} (${session.type})`
                );
            }

            // Base response
            const baseResponse = {
                sessionId: session.id,
                sessionName: session.name,
                adapterType: session.type,
                workspaceFolder: workspaceFolder.uri.fsPath,
                configuration: session.configuration
            };

            // If wait=false, return immediately (legacy behavior)
            if (!params.wait) {
                return ScriptResult.success(baseResponse);
            }

            // If wait=true, wait for outcome (breakpoint/error/exit)
            if (outputChannel) {
                outputChannel.appendLine('[debug.start] wait=true, waiting for breakpoint/error/exit...');
            }

            // Use useActiveSession=true to dynamically query the active session each poll
            // (the session object might become stale after startDebugging, similar to debug-single)
            const outcome = await waitUntilPausedAndGetLocation(session, params.timeoutMs, vscode, true);

            if (outputChannel) {
                if (outcome.event === 'stopped') {
                    outputChannel.appendLine(
                        `[debug.start] Paused at ${outcome.file}:${outcome.line}` +
                        (outcome.functionName ? ` in ${outcome.functionName}` : '')
                    );
                } else if (outcome.event === 'terminated') {
                    outputChannel.appendLine('[debug.start] Debug session terminated (program exited)');
                } else if (outcome.event === 'error') {
                    // ST001c: Log error code and hint when available
                    const errorMsg = outcome.code
                        ? `[${outcome.code}] ${outcome.message}`
                        : outcome.message;
                    outputChannel.appendLine(`[debug.start] Error: ${errorMsg}`);
                    if (outcome.hint) {
                        outputChannel.appendLine(`💡 Hint: ${outcome.hint}`);
                    }
                }
            }

            // Merge base response with outcome
            return ScriptResult.success({
                ...baseResponse,
                ...outcome
            });

        } catch (error) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}

module.exports = { StartDebugScript };