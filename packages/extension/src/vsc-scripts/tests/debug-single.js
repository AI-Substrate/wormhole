const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');
const { waitUntilPausedAndGetLocation } = require('@core/debug/debug-polling-helpers');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Debug single test waitable script
 * Debugs a single test at specified file location using VS Code Testing API
 *
 * Uses standardized polling approach for consistent outcome detection.
 */
class DebugSingleTestScript extends WaitableScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            path: z.string().min(1),
            line: z.number().int().min(1),
            column: z.number().int().min(1).default(1),
            timeoutMs: z.number().int().min(1).max(300000).default(30000)
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{path: string, line: number, column?: number, timeoutMs?: number}} params
     * @returns {Promise<{event: string, file?: string, line?: number, sessionId: string, sessionName?: string, testName?: string, framework?: string, workspaceFolder?: string}>}
     */
    async wait(bridgeContext, params) {
        try {
            const vscode = bridgeContext.vscode;
            const outputChannel = bridgeContext.outputChannel;

            // Log start
            if (outputChannel) {
                outputChannel.appendLine(
                    `[tests.debug-single] Starting test debug at ${params.path}:${params.line}:${params.column || 1}`
                );
            }

            // Check if testing.debugAtCursor command is available
            const commands = await vscode.commands.getCommands();
            const hasDebugAtCursor = commands.includes('testing.debugAtCursor');

            if (!hasDebugAtCursor) {
                if (outputChannel) {
                    outputChannel.appendLine('[tests.debug-single] testing.debugAtCursor command not available');
                }
                const error = new Error('testing.debugAtCursor command not available');
                error.code = ErrorCode.E_OPERATION_FAILED;
                throw error;
            }

            if (outputChannel) {
                outputChannel.appendLine('[tests.debug-single] testing.debugAtCursor command available');
            }

            // Open and position document at test location
            const uri = vscode.Uri.file(params.path);
            const document = await vscode.workspace.openTextDocument(uri);
            const position = new vscode.Position(params.line - 1, (params.column || 1) - 1);

            await vscode.window.showTextDocument(document, {
                selection: new vscode.Range(position, position),
                preserveFocus: false
            });

            if (outputChannel) {
                outputChannel.appendLine(
                    `[tests.debug-single] Positioned cursor at ${params.path}:${params.line}:${params.column || 1}`
                );
            }

            // Phase 1: Execute testing.debugAtCursor to start debug session
            // NOTE: testing.debugAtCursor blocks until debug completes, so don't await
            vscode.commands.executeCommand('testing.debugAtCursor');

            if (outputChannel) {
                outputChannel.appendLine('[tests.debug-single] Fired testing.debugAtCursor (non-blocking)');
            }

            // Poll for session to appear (languages take different startup times)
            // Python: ~500ms, Jest: ~1.5s, C#: ~2-4s
            let session = null;
            const pollInterval = 100;
            const maxPolls = Math.ceil(params.timeoutMs / pollInterval);
            let pollCount = 0;

            while (!session && pollCount < maxPolls) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                session = vscode.debug.activeDebugSession;
                pollCount++;

                // Provide helpful feedback at intervals
                if (pollCount === 50 && outputChannel) { // After 5 seconds
                    outputChannel.appendLine(
                        `[tests.debug-single] Still waiting for debug session (5s elapsed)... ` +
                        `If this continues, check Test Explorer to verify test is discovered.`
                    );
                }
                if (pollCount === 150 && outputChannel) { // After 15 seconds
                    outputChannel.appendLine(
                        `[tests.debug-single] WARNING: Still no debug session after 15s. ` +
                        `This usually means test discovery hasn't completed. Check Test Explorer.`
                    );
                }
            }

            if (!session) {
                const error = new Error(
                    `No debug session started after ${params.timeoutMs}ms\n\n` +
                    `Possible causes:\n` +
                    `  1. Test not discovered - Check Test Explorer (beaker/flask icon in sidebar)\n` +
                    `  2. Testing extension not active for this language\n` +
                    `  3. Test framework not configured (pytest/jest/xunit)\n\n` +
                    `File: ${params.path}\n` +
                    `Line: ${params.line}\n\n` +
                    `Actions:\n` +
                    `  - Open Test Explorer and verify test is visible\n` +
                    `  - For Python: Ensure pytest is installed (pip install pytest)\n` +
                    `  - For JavaScript: Ensure Jest extension is installed\n` +
                    `  - For C#: Ensure C# Dev Kit is installed\n` +
                    `  - Wait for test discovery to complete before debugging`
                );
                error.code = ErrorCode.E_NO_SESSION;
                throw error;
            }

            if (outputChannel) {
                outputChannel.appendLine(
                    `[tests.debug-single] Debug session started: ${session.name} (${session.id})`
                );
                outputChannel.appendLine(
                    `[tests.debug-single] Active session check: ${vscode.debug.activeDebugSession?.id === session.id ? 'MATCH' : 'MISMATCH'}`
                );
            }

            // Phase 2: Wait for outcome using standardized polling helper
            // Use useActiveSession=true to dynamically query the active session each poll
            // (the session object might become stale after testing.debugAtCursor)
            if (outputChannel) {
                outputChannel.appendLine(`[tests.debug-single] Calling waitUntilPausedAndGetLocation with session ${session.id}, useActiveSession=true`);
            }
            const result = await waitUntilPausedAndGetLocation(session, params.timeoutMs, vscode, true);
            if (outputChannel) {
                outputChannel.appendLine(`[tests.debug-single] waitUntilPausedAndGetLocation returned: ${JSON.stringify(result)}`);
            }

            // Get test metadata (simplified - no framework/testName detection for now)
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

            // Build response with standardized format + test metadata
            const response = {
                ...result,  // event, file, line, column, functionName, threadId, sessionId
                sessionName: session.name,
                workspaceFolder: workspaceFolder?.uri.fsPath
            };

            // Log outcome
            if (outputChannel) {
                if (result.event === 'stopped') {
                    outputChannel.appendLine(
                        `[tests.debug-single] Paused at ${result.file}:${result.line}` +
                        (result.functionName ? ` in ${result.functionName}` : '')
                    );
                } else if (result.event === 'terminated') {
                    outputChannel.appendLine('[tests.debug-single] Debug session terminated (test exited)');
                } else if (result.event === 'error') {
                    // ST001c: Log error code and hint when available
                    const errorMsg = result.code
                        ? `[${result.code}] ${result.message}`
                        : result.message;
                    outputChannel.appendLine(`[tests.debug-single] Error: ${errorMsg}`);
                    if (result.hint) {
                        outputChannel.appendLine(`💡 Hint: ${result.hint}`);
                    }
                }
            }

            return ScriptResult.success(response);

        } catch (error) {
            const errorMessage = error.message || String(error);

            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(`[tests.debug-single] Error: ${errorMessage}`);
            }

            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }

}

module.exports = { DebugSingleTestScript };
