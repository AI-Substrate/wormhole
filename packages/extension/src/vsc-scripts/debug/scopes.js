const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');

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
                return ScriptResult.failure(
                    `Session ${params.sessionId} not found`,
                    ErrorCode.E_NO_SESSION
                );
            }
        } else {
            // Use active session
            session = vscode.debug.activeDebugSession;
            if (!session) {
                return ScriptResult.failure(
                    'No active debug session',
                    ErrorCode.E_NO_SESSION
                );
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

            return ScriptResult.success({
                scopes: scopes.map(scope => ({
                    name: scope.name,
                    variablesReference: scope.variablesReference,
                    expensive: scope.expensive || false,
                    namedVariables: scope.namedVariables,
                    indexedVariables: scope.indexedVariables
                }))
            });
        } catch (e) {
            return ScriptResult.failure(
                `Failed to get scopes: ${e.message}`,
                ErrorCode.E_INTERNAL
            );
        }
    }
}

module.exports = { ScopesScript };