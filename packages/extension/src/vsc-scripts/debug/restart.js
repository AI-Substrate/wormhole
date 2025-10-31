const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Restart debug session action script
 * Restarts the active or specified debug session
 */
class RestartDebugScript extends ActionScript {
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

        // Get the target session
        let session;
        if (params.sessionId) {
            // Find specific session by ID
            const sessions = vscode.debug.breakpoints;
            session = sessions.find(s => s.id === params.sessionId);
            if (!session) {
                return ScriptResult.failure(
                    `Debug session not found: ${params.sessionId}`,
                    ErrorCode.E_NO_SESSION,
                    { sessionId: params.sessionId }
                );
            }
        } else {
            // Use active session
            session = vscode.debug.activeDebugSession;
            if (!session) {
                return ScriptResult.failure(
                    'No active debug session available',
                    ErrorCode.E_NO_SESSION
                );
            }
        }

        try {
            // Try DAP restart via disconnect with restart flag
            if (session.customRequest) {
                try {
                    await session.customRequest('disconnect', {
                        restart: true
                    });
                } catch (e) {
                    // If restart not supported, use fallback
                    if (e.message?.includes('not supported') || e.message?.includes('restart')) {
                        throw e;
                    }
                }
            }
        } catch (e) {
            // Fallback to VS Code command
            await vscode.commands.executeCommand('workbench.action.debug.restart');
        }

        // Log to output channel
        if (bridgeContext.outputChannel) {
            bridgeContext.outputChannel.appendLine(
                `[dbg.restart] Restarted debug session${params.sessionId ? ` ${params.sessionId}` : ''}`
            );
        }

        return ScriptResult.success({
            restarted: true,
            sessionId: params.sessionId || session?.id
        });
    }
}

module.exports = { RestartDebugScript };