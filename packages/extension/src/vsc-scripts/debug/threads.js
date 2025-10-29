const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Get debug threads query script
 * Returns information about active threads in the debug session
 */
class ThreadsDebugScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{sessionId?: string}} params
     * @returns {Promise<{threads: Array<{id: number, name: string}>}>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        // Get the active debug session
        const session = params.sessionId
            ? vscode.debug.activeDebugSession?.id === params.sessionId
                ? vscode.debug.activeDebugSession
                : undefined
            : vscode.debug.activeDebugSession;

        if (!session) {
            throw new Error(`E_NO_SESSION: No active debug session${params.sessionId ? ` with ID ${params.sessionId}` : ''}`);
        }

        // TODO: Full implementation requires DAP integration to get thread information
        // For now, return basic thread info if available
        const threads = [];

        // Most single-threaded applications will have just one thread
        const activeFrame = vscode.debug.activeStackItem;
        if (activeFrame && activeFrame.threadId !== undefined) {
            threads.push({
                id: activeFrame.threadId,
                name: `Thread ${activeFrame.threadId}`,
                active: true
            });
        } else {
            // Default thread for single-threaded apps
            threads.push({
                id: 1,
                name: 'Main Thread',
                active: true
            });
        }

        // Log to output channel
        if (bridgeContext.outputChannel) {
            bridgeContext.outputChannel.appendLine(
                `[debug.threads] Found ${threads.length} thread(s)`
            );
        }

        return {
            threads,
            activeThreadId: activeFrame?.threadId || 1,
            note: 'Full thread information requires DAP integration'
        };
    }
}

module.exports = { ThreadsDebugScript };