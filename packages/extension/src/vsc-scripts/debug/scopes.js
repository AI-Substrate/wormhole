const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { createDebugError, DebugErrorCode } = require('@core/errors/debug-errors');

/**
 * @typedef {any} ScriptContext
 */

/**
 * List scopes query script
 * Returns available scopes for a given frame
 */
class ScopesScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            frameId: z.number().int().min(0),
            sessionId: z.string().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{frameId: number, sessionId?: string}} params
     * @returns {Promise<{success: boolean, data?: any, reason?: string}>}
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
                throw createDebugError(DebugErrorCode.E_NO_SESSION, `Session ${params.sessionId} not found`);
            }
        } else {
            // Use active session
            session = vscode.debug.activeDebugSession;
            if (!session) {
                throw createDebugError(DebugErrorCode.E_NO_SESSION, 'No active debug session');
            }
        }

        try {
            // Use DAP scopes request
            const response = await session.customRequest('scopes', {
                frameId: params.frameId
            });

            const scopes = response.body?.scopes || response.scopes || [];

            // Log to output channel
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[dbg.scopes] Retrieved ${scopes.length} scope(s) for frame ${params.frameId}`
                );
            }

            return {
                scopes: scopes.map(scope => ({
                    name: scope.name,
                    variablesReference: scope.variablesReference,
                    expensive: scope.expensive || false,
                    namedVariables: scope.namedVariables,
                    indexedVariables: scope.indexedVariables
                }))
            };
        } catch (e) {
            throw createDebugError(DebugErrorCode.E_INTERNAL, `Failed to get scopes: ${e.message}`);
        }
    }
}

module.exports = { ScopesScript };