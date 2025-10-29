const { z } = require('zod');
const { ActionScript } = require('@script-base');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Stop debug session action script
 * Stops the active or specified debug session
 */
class StopDebugScript extends ActionScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{sessionId?: string}} params
     * @returns {Promise<{success: boolean, reason?: string, details?: any}>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        // Get the active debug session
        const session = vscode.debug.activeDebugSession;

        if (!session) {
            return this.failure('E_NO_SESSION', { message: 'No active debug session' });
        }

        const stoppedSessions = [];

        // Track which method succeeded for logging
        let stoppedBy = null;

        // Stop the active debug session
        try {
            // Try DAP terminate request first
            if (session.customRequest) {
                try {
                    await session.customRequest('terminate', {});
                    stoppedBy = 'terminate';
                } catch (terminateError) {
                    // Try disconnect for ANY terminate failure (not just "not supported")
                    // This fixes C# coreclr sessions which throw different error messages
                    try {
                        await session.customRequest('disconnect', {
                            terminateDebuggee: true
                        });
                        stoppedBy = 'disconnect';
                    } catch (disconnectError) {
                        // Final fallback to VS Code API
                        await vscode.debug.stopDebugging(session);
                        stoppedBy = 'stopDebugging';
                    }
                }
            } else {
                // Fallback to VS Code API
                await vscode.debug.stopDebugging(session);
                stoppedBy = 'stopDebugging';
            }

            stoppedSessions.push(session.id);
        } catch (e) {
            // Log error
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[debug.stop] Failed to stop session ${session.id}: ${e.message}`
                );
            }
            throw e;
        }

        // Log to output channel
        if (bridgeContext.outputChannel) {
            bridgeContext.outputChannel.appendLine(
                `[debug.stop] Session type: ${session.type}, stopped via: ${stoppedBy || 'unknown'}, count: ${stoppedSessions.length}`
            );
        }

        return this.success({
            status: 'terminated',
            stoppedCount: stoppedSessions.length,
            stoppedSessions
        });
    }
}

module.exports = { StopDebugScript };