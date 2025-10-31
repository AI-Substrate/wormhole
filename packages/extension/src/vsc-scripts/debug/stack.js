const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Get call stack query script
 * Returns the current call stack frames
 */
class StackDebugScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{sessionId?: string}} params
     * @returns {Promise<{frames: Array<{id: string, name: string, source: {path: string, name: string}, line: number, column: number}>}>}
     */
    async execute(bridgeContext, params) {
        try {
            const vscode = bridgeContext.vscode;

            // Get the active debug session
            const session = params.sessionId
                ? vscode.debug.activeDebugSession?.id === params.sessionId
                    ? vscode.debug.activeDebugSession
                    : undefined
                : vscode.debug.activeDebugSession;

            if (!session) {
                return ScriptResult.failure(
                    `No active debug session${params.sessionId ? ` with ID ${params.sessionId}` : ''}`,
                    ErrorCode.E_NO_SESSION
                );
            }

            // Check if debugger is stopped
            const activeFrame = vscode.debug.activeStackItem;
            if (!activeFrame) {
                return ScriptResult.failure(
                    'Debugger must be stopped to get call stack',
                    ErrorCode.E_NOT_STOPPED
                );
            }

            // TODO: Full implementation requires DAP integration to get complete stack
            // For now, return the active frame information
            const frames = [];

            // Add the active frame
            if (activeFrame) {
                frames.push({
                    id: activeFrame.id || '0',
                    name: activeFrame.name || 'unknown',
                    source: {
                        path: activeFrame.source?.path || 'unknown',
                        name: activeFrame.source?.name || 'unknown'
                    },
                    line: activeFrame.line || 0,
                    column: activeFrame.column || 0
                });
            }

            // Log to output channel
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[debug.stack] Retrieved ${frames.length} stack frame(s)`
                );
            }

            return ScriptResult.success({
                frames,
                threadId: activeFrame?.threadId || 0,
                note: 'Full stack trace requires DAP integration'
            });
        } catch (error) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}

module.exports = { StackDebugScript };