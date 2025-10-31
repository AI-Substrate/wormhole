const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { executeStepOperation } = require('@core/debug/step-operations');
const {
    getStepStrategies,
    EventDrivenWaitStrategy
} = require('@core/debug/step-strategies');
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Step over debug operation waitable script
 * Steps over the current line and waits until stopped at the next line
 *
 * Uses unified step operation architecture with multi-thread support for Dart isolates.
 */
class StepOverDebugScript extends WaitableScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            timeoutMs: z.number().int().min(1).max(10000).default(5000)
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{sessionId?: string, timeoutMs?: number}} params
     * @returns {Promise<{event: string, file: string, line: number, sessionId: string}>}
     */
    async wait(bridgeContext, params) {
        try {
            const vscode = bridgeContext.vscode;
            const session = params.sessionId
                ? vscode.debug.activeDebugSession?.id === params.sessionId
                    ? vscode.debug.activeDebugSession
                    : undefined
                : vscode.debug.activeDebugSession;

            if (!session) {
                const error = new Error(`No active debug session${params.sessionId ? ` with ID ${params.sessionId}` : ''}`);
                error.code = ErrorCode.E_NO_SESSION;
                throw error;
            }

            // Get language-appropriate strategies based on session type
            const { threadResolver, stepExecutor } = getStepStrategies(session.type, 'next');

            // Use unified step operation architecture
            const result = await executeStepOperation(bridgeContext, params, {
                threadResolver,
                stepExecutor,
                waitStrategy: new EventDrivenWaitStrategy(),
                commandName: 'debug.step-over'
            });

            return ScriptResult.success(result);
        } catch (error) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}

module.exports = { StepOverDebugScript };
