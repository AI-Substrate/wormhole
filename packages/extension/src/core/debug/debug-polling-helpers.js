/**
 * Reusable debug polling helpers for step commands
 *
 * These functions provide a simple polling-based approach to waiting for
 * debug state changes, avoiding race conditions with event-based approaches.
 *
 * Per Subtask 001 ST001b: Standardized to return IDebugError objects (never throw).
 */

const { findCoreclrThreadWithSource } = require('@core/debug/session-helpers');
const { DebugErrorCode, createDebugError } = require('@core/errors/debug-errors');

/**
 * Wait for a stopped event after a step operation (capture-query approach)
 *
 * CRITICAL: DAP step operations (next, stepIn, stepOut, continue) are asynchronous.
 * The customRequest() returns immediately to acknowledge the request, but the actual
 * step happens later. The debug adapter sends a 'stopped' event when ready.
 *
 * This function uses DebugSessionCaptureService to detect when the debugger stops:
 * 1. Record the current count of stopped events
 * 2. Send the step operation
 * 3. Poll the capture service until a NEW stopped event appears
 * 4. Query stackTrace once (state is fresh)
 *
 * @param {any} session - VS Code debug session
 * @param {number} threadId - Thread ID that will be stepped
 * @param {any} _vscode - VS Code API (unused, kept for compatibility)
 * @param {Function} stepOperation - Async function that sends the DAP step request
 * @param {number} timeoutMs - Maximum time to wait for stopped event
 * @returns {Promise<object>} Debug outcome {event: 'stopped', file, line, ...}
 */
async function waitForStoppedEventAndGetLocation(session, threadId, _vscode, stepOperation, timeoutMs = 5000) {
    const startTime = Date.now();
    const pollInterval = 50; // ms between polling attempts

    // Get the capture service instance from global (installed by extension activation)
    const captureService = global.debugSessionCaptureService;
    const capturedSession = captureService.getSession(session.id);

    if (!capturedSession) {
        throw new Error(`No captured session data found for session ${session.id}`);
    }

    // Record how many stopped events existed BEFORE we send the step request
    const initialStoppedCount = capturedSession.stoppedEvents.length;

    // Send the step operation
    await stepOperation();

    // Poll until we see a NEW stopped event or termination in the capture service
    while (Date.now() - startTime < timeoutMs) {
        // Check if session terminated (program exited)
        if (capturedSession.terminated) {
            return {
                event: 'terminated',
                sessionId: session.id,
                exitCode: capturedSession.exitCode
            };
        }

        const currentStoppedCount = capturedSession.stoppedEvents.length;

        // New stopped event detected!
        if (currentStoppedCount > initialStoppedCount) {
            // Get the latest stopped event
            const latestStoppedEvent = capturedSession.stoppedEvents[currentStoppedCount - 1];

            // Now query the fresh location
            const stackResponse = await session.customRequest('stackTrace', {
                threadId: latestStoppedEvent.threadId || threadId,
                startFrame: 0,
                levels: 1
            });

            if (!stackResponse.stackFrames || stackResponse.stackFrames.length === 0) {
                throw new Error('No stack frames available after step');
            }

            const topFrame = stackResponse.stackFrames[0];

            // Use the centralized formatter
            return formatPausedLocation(session, topFrame, latestStoppedEvent.threadId || threadId);
        }

        // Not stopped yet, wait and poll again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout - return IDebugError instead of throwing (ST001b)
    const timeoutError = createDebugError(
        DebugErrorCode.E_NOT_STOPPED,
        `Timeout waiting for stopped event after ${timeoutMs}ms. The debugger did not pause within the expected time.`
    );

    return {
        event: 'error',
        sessionId: session.id,
        code: timeoutError.code,
        message: timeoutError.message,
        hint: timeoutError.hint,
        detail: timeoutError.detail
    };
}

/**
 * Poll until debugger is paused, terminated, or error occurs
 *
 * This function handles ALL possible debug outcomes:
 * - stopped: Debugger paused at breakpoint or after step
 * - terminated: Debug session ended (program exit)
 * - error: Timeout or other error
 *
 * @param {any} session - VS Code debug session (or null if useActiveSession=true)
 * @param {number} timeoutMs - Maximum time to wait in milliseconds
 * @param {any} vscode - VS Code API (for checking active session)
 * @param {boolean} useActiveSession - If true, use vscode.debug.activeDebugSession dynamically each poll (for debug-single)
 * @returns {Promise<object>} Debug outcome {event: 'stopped'|'terminated'|'error', ...}
 */
async function waitUntilPausedAndGetLocation(session, timeoutMs = 5000, vscode = null, useActiveSession = false) {
    const startTime = Date.now();
    const pollInterval = 50; // ms between polling attempts

    while (Date.now() - startTime < timeoutMs) {
        try {
            // Get the session to query (either the passed session or the current active session)
            const currentSession = useActiveSession ? vscode?.debug.activeDebugSession : session;

            if (!currentSession) {
                // No active session - means terminated
                return {
                    event: 'terminated',
                    sessionId: session?.id || 'unknown'
                };
            }

            // Try to get threads - only succeeds when paused
            const threadsResponse = await currentSession.customRequest('threads');

            if (!threadsResponse.threads || threadsResponse.threads.length === 0) {
                throw new Error('No threads available');
            }

            let threadId;
            let topFrame;

            // C#-SPECIFIC: Use shared helper to find thread with actual source code
            if (currentSession.type === 'coreclr') {
                const result = await findCoreclrThreadWithSource(currentSession);
                if (result) {
                    threadId = result.threadId;
                    topFrame = result.frame;
                } else {
                    // Fallback to first thread if no valid source found
                    threadId = threadsResponse.threads[0].id;
                    const stackResponse = await currentSession.customRequest('stackTrace', {
                        threadId,
                        startFrame: 0,
                        levels: 1
                    });
                    topFrame = stackResponse.stackFrames?.[0];
                }
            } else {
                // Other languages: Find which thread is actually paused (has stack frames with source code)
                // CRITICAL for multi-threaded/isolate languages (Dart, Java, C#)
                let foundPausedThread = false;

                for (const thread of threadsResponse.threads) {
                    try {
                        const stackResponse = await currentSession.customRequest('stackTrace', {
                            threadId: thread.id,
                            startFrame: 0,
                            levels: 1  // Only need top frame
                        });

                        // Check if this thread has frames with actual source code
                        if (stackResponse.stackFrames?.length > 0 &&
                            stackResponse.stackFrames[0].source?.path) {
                            threadId = thread.id;
                            topFrame = stackResponse.stackFrames[0];
                            foundPausedThread = true;
                            break;
                        }
                    } catch (error) {
                        // Thread not paused or error - continue to next thread
                        continue;
                    }
                }

                if (!foundPausedThread) {
                    throw new Error('No thread found with source code paused');
                }
            }

            if (!topFrame) {
                throw new Error('No stack frames available');
            }

            // STOPPED - Call centralized formatter
            return formatPausedLocation(currentSession, topFrame, threadId);

        } catch (error) {
            // Check if session terminated using vscode API (most reliable)
            if (vscode) {
                const activeSession = vscode.debug.activeDebugSession;

                if (useActiveSession) {
                    // Mode for debug-single: Just check if ANY active session exists
                    if (!activeSession) {
                        // TERMINATED - no active session at all
                        return {
                            event: 'terminated',
                            sessionId: session?.id || 'unknown'
                        };
                    }
                } else {
                    // Mode for step commands: Validate specific session ID
                    if (!activeSession || activeSession.id !== session.id) {
                        // TERMINATED - session no longer active
                        return {
                            event: 'terminated',
                            sessionId: session.id
                        };
                    }
                }
            }

            // Also check error message patterns for termination
            if (error.message?.includes('Session') ||
                error.message?.includes('terminated') ||
                error.message?.includes('No debugger available') ||
                error.message?.includes('not stopped')) {
                // TERMINATED - detected from error message
                return {
                    event: 'terminated',
                    sessionId: session.id
                };
            }

            // Not paused yet, continue polling
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
    }

    // TIMEOUT - return IDebugError with proper code (ST001b)
    const timeoutError = createDebugError(
        DebugErrorCode.E_NOT_STOPPED,
        `Timeout waiting for debug outcome after ${timeoutMs}ms. The debugger did not pause within the expected time.`
    );

    return {
        event: 'error',
        sessionId: session.id,
        code: timeoutError.code,
        message: timeoutError.message,
        hint: timeoutError.hint,
        detail: timeoutError.detail
    };
}

/**
 * Centralized formatter for paused location info
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH for what gets returned when hitting a breakpoint.
 * When we want to add local variables or other info, we add it here.
 *
 * @param {any} session - VS Code debug session
 * @param {object} topFrame - Top stack frame from DAP stackTrace response
 * @param {number} threadId - Thread ID
 * @returns {object} Standardized paused location info
 */
function formatPausedLocation(session, topFrame, threadId) {
    return {
        event: 'stopped',
        file: topFrame.source?.path || topFrame.source?.name || 'unknown',
        line: topFrame.line,
        column: topFrame.column,
        functionName: topFrame.name,
        threadId: threadId,
        sessionId: session.id

        // FUTURE ENHANCEMENT: Add local variable names here
        // This is where we'll add:
        // locals: await getLocalVariableNames(session, topFrame.id)
    };
}

module.exports = {
    waitUntilPausedAndGetLocation,
    waitForStoppedEventAndGetLocation,
    formatPausedLocation
};
