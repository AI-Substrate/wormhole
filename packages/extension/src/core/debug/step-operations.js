/**
 * Step Operation Execution Framework
 *
 * Provides unified abstraction for all debug stepping commands (step-over, step-into, step-out, continue).
 * Uses Strategy Pattern to handle differences between languages:
 * - Thread Resolution: Single vs multi-thread/isolate detection
 * - Step Execution: Single vs multi-thread DAP request patterns
 * - Wait Strategy: Event-driven vs polling outcome detection
 *
 * This eliminates ~140 lines of duplication across 4 stepping commands and provides
 * a clear extension point for language-specific threading models (Dart isolates, Java threads, etc.)
 */

/**
 * Execute a step operation with pluggable strategies
 *
 * @param {object} bridgeContext - VS Code bridge context (vscode API, output channel, etc.)
 * @param {object} params - Command parameters (sessionId, timeoutMs)
 * @param {object} config - Strategy configuration
 * @param {object} config.threadResolver - Strategy for resolving which threads to step
 * @param {object} config.stepExecutor - Strategy for executing the DAP step request
 * @param {object} config.waitStrategy - Strategy for waiting for step completion
 * @param {string} config.commandName - Name of the step command (for logging)
 * @returns {Promise<object>} Debug outcome {event: 'stopped'|'terminated'|'error', ...}
 */
async function executeStepOperation(bridgeContext, params, config) {
    const { vscode, outputChannel } = bridgeContext;
    const { threadResolver, stepExecutor, waitStrategy, commandName } = config;

    // Get the debug session
    const { getDebugSession } = require('@core/debug/session-helpers');
    const session = getDebugSession(vscode, params.sessionId);

    // Phase 1: Resolve which threads to step
    const threadIds = await threadResolver.resolve(session, vscode);

    // Phase 2: Execute the step operation
    const stepOperation = () => stepExecutor.execute(session, threadIds);

    // Phase 3: Wait for outcome (stopped, terminated, or error)
    const result = await waitStrategy.wait(
        session,
        threadIds,
        vscode,
        stepOperation,
        params.timeoutMs || 5000
    );

    // Phase 4: Log outcome to output channel
    if (outputChannel) {
        if (result.event === 'stopped') {
            // Show column if available (JavaScript/TypeScript expression-level precision)
            const location = `${result.file}:${result.line}:${result.column}`;
            outputChannel.appendLine(
                `[${commandName}] Stepped to ${location}`
            );
        } else if (result.event === 'terminated') {
            outputChannel.appendLine(
                `[${commandName}] Program exited`
            );
        } else if (result.event === 'error') {
            // Per ST001c: Log error code and hint when available
            const errorMsg = result.code
                ? `[${result.code}] ${result.message}`
                : result.message;
            outputChannel.appendLine(
                `[${commandName}] Error: ${errorMsg}`
            );
            if (result.hint) {
                outputChannel.appendLine(`💡 Hint: ${result.hint}`);
            }
        }
    }

    return result;
}

module.exports = {
    executeStepOperation
};
