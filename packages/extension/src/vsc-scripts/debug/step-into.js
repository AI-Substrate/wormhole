const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { executeStepOperation } = require('@core/debug/step-operations');
const {
    getStepStrategies,
    EventDrivenWaitStrategy
} = require('@core/debug/step-strategies');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Step into debug operation waitable script
 * Steps into the function call and waits until stopped
 *
 * Uses unified step operation architecture (upgraded from polling to event-driven).
 */
class StepIntoDebugScript extends WaitableScript {
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
        const vscode = bridgeContext.vscode;
        const session = params.sessionId
            ? vscode.debug.activeDebugSession?.id === params.sessionId
                ? vscode.debug.activeDebugSession
                : undefined
            : vscode.debug.activeDebugSession;

        if (!session) {
            throw new Error(`E_NO_SESSION: No active debug session${params.sessionId ? ` with ID ${params.sessionId}` : ''}`);
        }

        // Get language-appropriate strategies based on session type
        const { threadResolver, stepExecutor } = getStepStrategies(session.type, 'stepIn');

        // Use unified step operation architecture
        return await executeStepOperation(bridgeContext, params, {
            threadResolver,
            stepExecutor,
            waitStrategy: new EventDrivenWaitStrategy(),
            commandName: 'debug.step-into'
        });
    }
}

module.exports = { StepIntoDebugScript };
