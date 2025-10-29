const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { createDebugError, DebugErrorCode } = require('@core/errors/debug-errors');
const { getActiveThreadId } = require('@core/debug/session-helpers');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Evaluate expression query script
 * Evaluates an expression in the context of a debug frame
 */
class EvaluateScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            expression: z.string().min(1),
            frameId: z.number().int().min(0).optional(),
            context: z.enum(['repl', 'watch', 'hover']).optional(),
            sessionId: z.string().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{expression: string, frameId?: number, context?: 'repl'|'watch'|'hover', sessionId?: string}} params
     * @returns {Promise<{success: boolean, data?: any, reason?: string}>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        // Get the target session
        let session;
        if (params.sessionId) {
            // Find specific session by ID
            // Fixed: was vscode.debug.breakpoints (wrong), now iterate active sessions
            const allSessions = vscode.debug.activeDebugSession
                ? [vscode.debug.activeDebugSession]
                : [];
            session = allSessions.find(s => s.id === params.sessionId);
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
            // If no frameId provided, try to get the top frame
            let frameId = params.frameId;
            if (frameId === undefined) {
                try {
                    // Use shared thread detection logic (same as step commands)
                    // This ensures we use the SAME thread that step operations just used
                    const threadId = await getActiveThreadId(session, bridgeContext.vscode);

                    // Get stack trace for the active thread
                    const stackResponse = await session.customRequest('stackTrace', {
                        threadId: threadId,
                        levels: 1
                    });
                    const frames = stackResponse.body?.stackFrames || stackResponse.stackFrames || [];
                    if (frames.length > 0) {
                        frameId = frames[0].id;
                    }
                } catch (e) {
                    // Continue without frameId - evaluate will try without it
                }
            }

            // Use DAP evaluate request
            const response = await session.customRequest('evaluate', {
                expression: params.expression,
                frameId: frameId,
                context: params.context || 'repl'
            });

            const result = response.body || response;

            // Log to output channel
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[dbg.evaluate] Evaluated "${params.expression}" = ${result.result}`
                );
            }

            return {
                result: result.result,
                type: result.type,
                variablesReference: result.variablesReference,
                namedVariables: result.namedVariables,
                indexedVariables: result.indexedVariables
            };
        } catch (e) {
            throw createDebugError(DebugErrorCode.E_INTERNAL, `Failed to evaluate expression: ${e.message}`);
        }
    }
}

module.exports = { EvaluateScript };