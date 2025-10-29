const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { executeStepOperation } = require('@core/debug/step-operations');
const {
    MultiThreadResolver,
    MultiThreadStepExecutor,
    EventDrivenWaitStrategy
} = require('@core/debug/step-strategies');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Continue debug execution waitable script
 * Continues execution until next breakpoint hit or program exit
 *
 * Uses unified step operation architecture (upgraded from polling to event-driven).
 */
class ContinueDebugScript extends WaitableScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            timeoutMs: z.number().int().min(1).max(300000).default(30000)
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{sessionId?: string, timeoutMs?: number}} params
     * @returns {Promise<{event: string, file?: string, line?: number, sessionId: string}>}
     */
    async wait(bridgeContext, params) {
        // Use unified step operation architecture
        return await executeStepOperation(bridgeContext, params, {
            threadResolver: new MultiThreadResolver(),
            stepExecutor: new MultiThreadStepExecutor('continue'),
            waitStrategy: new EventDrivenWaitStrategy(),
            commandName: 'debug.continue'
        });
    }
}

module.exports = { ContinueDebugScript };
