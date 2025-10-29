/**
 * Step Operation Strategy Pattern Classes
 *
 * Provides pluggable strategies for debug stepping operations:
 * - ThreadResolver: Determine which threads to step (single vs multi)
 * - StepExecutor: Execute DAP step requests (single vs multi-thread)
 * - WaitStrategy: Wait for step completion (event-driven vs polling)
 *
 * This architecture supports language-specific threading models:
 * - Python/JS/C#: Single thread (GIL or all-threads-stop)
 * - Dart: Multi-isolate (only ONE isolate pauses on breakpoint)
 * - Java: Configurable (can be either)
 */

const { getActiveThreadId } = require('@core/debug/session-helpers');
const { waitForStoppedEventAndGetLocation, waitUntilPausedAndGetLocation } = require('@core/debug/debug-polling-helpers');

// ============================================================================
// Thread Resolvers - Determine which threads to step
// ============================================================================

/**
 * Base class for thread resolution strategies
 */
class ThreadResolver {
    /**
     * Resolve which threads should receive the step command
     *
     * @param {any} session - VS Code debug session
     * @param {any} vscode - VS Code API
     * @returns {Promise<number[]>} Array of thread IDs to step
     */
    async resolve(session, vscode) {
        throw new Error('ThreadResolver.resolve() must be implemented by subclass');
    }
}

/**
 * Single-thread resolver for languages where only one thread is active
 * (Python with GIL, JS single-threaded, C# all-threads-stop)
 */
class SingleThreadResolver extends ThreadResolver {
    async resolve(session, vscode) {
        const threadId = await getActiveThreadId(session, vscode);
        return [threadId];
    }
}

/**
 * Multi-thread resolver for languages with concurrent threading/isolates
 * (Dart isolates, Java threads)
 *
 * Returns ALL threads so the step executor can send commands to all.
 * The DAP adapter will ignore threads that aren't paused.
 */
class MultiThreadResolver extends ThreadResolver {
    async resolve(session, vscode) {
        const threadsResponse = await session.customRequest('threads');
        const threads = threadsResponse.threads || [];
        return threads.map(t => t.id);
    }
}

// ============================================================================
// Step Executors - Execute DAP step requests
// ============================================================================

/**
 * Base class for step execution strategies
 */
class StepExecutor {
    /**
     * @param {string} dapCommand - DAP command name ('next', 'stepIn', 'stepOut', 'continue')
     */
    constructor(dapCommand) {
        this.dapCommand = dapCommand;
    }

    /**
     * Execute the step operation
     *
     * @param {any} session - VS Code debug session
     * @param {number[]} threadIds - Thread IDs to step (from ThreadResolver)
     * @returns {Promise<void>}
     */
    async execute(session, threadIds) {
        throw new Error('StepExecutor.execute() must be implemented by subclass');
    }
}

/**
 * Single-thread step executor
 * Sends DAP command to exactly one thread (the first in the array)
 */
class SingleThreadStepExecutor extends StepExecutor {
    async execute(session, threadIds) {
        if (threadIds.length === 0) {
            throw new Error('E_NO_THREAD: No thread ID provided for step operation');
        }

        // Send command to the single active thread
        await session.customRequest(this.dapCommand, { threadId: threadIds[0] });
    }
}

/**
 * Multi-thread step executor
 * Sends DAP command to ALL threads, ignoring errors from non-paused threads
 *
 * This is the Dart isolate pattern: step all isolates, let the VM
 * ignore commands to non-paused ones. Avoids race conditions from trying
 * to detect which single isolate is paused.
 */
class MultiThreadStepExecutor extends StepExecutor {
    async execute(session, threadIds) {
        // Send command to ALL threads - the VM will ignore threads that aren't paused
        await Promise.all(
            threadIds.map(threadId =>
                session.customRequest(this.dapCommand, { threadId }).catch(() => {
                    // Ignore errors - thread might not be steppable
                    // This is expected behavior for multi-isolate scenarios
                })
            )
        );
    }
}

// ============================================================================
// Wait Strategies - Wait for step completion
// ============================================================================

/**
 * Base class for wait strategies
 */
class WaitStrategy {
    /**
     * Wait for the step operation to complete
     *
     * @param {any} session - VS Code debug session
     * @param {number[]} threadIds - Thread IDs that were stepped
     * @param {any} vscode - VS Code API
     * @param {Function} stepOperation - Async function that sends the DAP step request
     * @param {number} timeoutMs - Maximum time to wait
     * @returns {Promise<object>} Debug outcome {event: 'stopped'|'terminated'|'error', ...}
     */
    async wait(session, threadIds, vscode, stepOperation, timeoutMs) {
        throw new Error('WaitStrategy.wait() must be implemented by subclass');
    }
}

/**
 * Event-driven wait strategy (RECOMMENDED)
 *
 * Uses DebugSessionCaptureService to detect stopped events from the debug adapter.
 * Faster and more reliable than polling (detects events immediately instead of every 50ms).
 */
class EventDrivenWaitStrategy extends WaitStrategy {
    async wait(session, threadIds, vscode, stepOperation, timeoutMs) {
        // Use the event-driven helper with capture service
        // threadId can be null since we detect the stopped event regardless of thread
        return await waitForStoppedEventAndGetLocation(
            session,
            threadIds[0] || null,  // Primary thread ID for reference (may be unused)
            vscode,
            stepOperation,
            timeoutMs
        );
    }
}

/**
 * Polling wait strategy (LEGACY)
 *
 * Polls stackTrace every 50ms until the debugger pauses.
 * Slower than event-driven but doesn't require DebugSessionCaptureService.
 *
 * NOTE: Event-driven is preferred. Polling kept for compatibility.
 */
class PollingWaitStrategy extends WaitStrategy {
    async wait(session, threadIds, vscode, stepOperation, timeoutMs) {
        // Execute the step operation first
        await stepOperation();

        // Then poll until paused
        return await waitUntilPausedAndGetLocation(
            session,
            timeoutMs,
            vscode,
            false  // useActiveSession=false for step commands
        );
    }
}

// ============================================================================
// Exports
// ============================================================================
// Strategy Selection Helper
// ============================================================================

/**
 * Get appropriate thread resolver and step executor based on session type
 *
 * Language-specific threading models:
 * - Python/JS/C#/TypeScript: Single-threaded or all-threads-stop → Single executors
 * - Dart: Multi-isolate (only ONE isolate pauses) → Multi executors
 * - Java: Configurable → Single executors (default)
 *
 * @param {string} sessionType - Debug session type (e.g., 'coreclr', 'dart', 'pwa-node')
 * @param {string} dapCommand - DAP command name ('next', 'stepIn', 'stepOut', 'continue')
 * @returns {{threadResolver: ThreadResolver, stepExecutor: StepExecutor}}
 */
function getStepStrategies(sessionType, dapCommand) {
    // Dart uses multi-isolate model - need to step ALL isolates
    if (sessionType === 'dart') {
        return {
            threadResolver: new MultiThreadResolver(),
            stepExecutor: new MultiThreadStepExecutor(dapCommand)
        };
    }

    // All other languages (C#, Python, JS, TypeScript, Java) use single-thread stepping
    return {
        threadResolver: new SingleThreadResolver(),
        stepExecutor: new SingleThreadStepExecutor(dapCommand)
    };
}

module.exports = {
    // Base classes
    ThreadResolver,
    StepExecutor,
    WaitStrategy,

    // Thread resolvers
    SingleThreadResolver,
    MultiThreadResolver,

    // Step executors
    SingleThreadStepExecutor,
    MultiThreadStepExecutor,

    // Wait strategies
    EventDrivenWaitStrategy,
    PollingWaitStrategy,

    // Helper
    getStepStrategies
};
