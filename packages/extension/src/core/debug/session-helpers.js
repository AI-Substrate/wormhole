/**
 * Shared debug session and thread helpers
 *
 * These utilities eliminate duplication across step commands and test debugging scripts.
 * Extract session/thread resolution logic into reusable functions.
 */

/**
 * Find Dart isolate with workspace source code
 *
 * DART-SPECIFIC: When Dart breakpoint hits, only ONE isolate pauses (the one
 * that hit the breakpoint). Other isolates continue running. This function scans
 * all isolates to find the one with workspace source code (not SDK code).
 *
 * Strategy matches DartDebugAdapter.findActiveIsolate():
 * 1. Scan all threads (isolates)
 * 2. For each thread, try to get stack trace
 * 3. Check if top frame has source code (frame.source.path exists)
 * 4. Return first thread with valid source code
 *
 * @param {any} session - VS Code debug session
 * @returns {Promise<{threadId: number, frame: object} | null>} Isolate ID and top frame, or null if not found
 */
async function findDartIsolateWithSource(session) {
    try {
        const threadsResponse = await session.customRequest('threads');
        const threads = threadsResponse.threads || [];

        // Scan all isolates for one with source code
        for (const thread of threads) {
            try {
                const stackResponse = await session.customRequest('stackTrace', {
                    threadId: thread.id,
                    startFrame: 0,
                    levels: 1
                });

                if (stackResponse.stackFrames && stackResponse.stackFrames.length > 0) {
                    const frame = stackResponse.stackFrames[0];

                    // Check if this isolate has actual source code (not all in SDK)
                    if (frame.source && frame.source.path) {
                        // Found the isolate with workspace source code!
                        return { threadId: thread.id, frame };
                    }
                }
            } catch (error) {
                // Isolate not paused or no stack, continue checking other isolates
                continue;
            }
        }

        // No isolate with valid source code found
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Find C# thread with actual source code (not [External Code])
 *
 * C#-SPECIFIC: When C# debugger pauses, it pauses ALL threads, but only ONE
 * thread contains the actual source code location. The rest show [External Code]
 * at line 0. This function iterates all threads to find the correct one.
 *
 * This is the single source of truth for C# thread detection, used by:
 * - getActiveThreadId() - For step commands
 * - waitUntilPausedAndGetLocation() - For location queries
 * - CoreClrDebugAdapter.findActiveThread() - For variable inspection
 *
 * @param {any} session - VS Code debug session
 * @returns {Promise<{threadId: number, frame: object} | null>} Thread ID and top frame, or null if not found
 */
async function findCoreclrThreadWithSource(session) {
    try {
        const threadsResponse = await session.customRequest('threads');
        const threads = threadsResponse.threads || [];

        // Iterate all threads to find the one with actual source code
        for (const thread of threads) {
            try {
                const stackResponse = await session.customRequest('stackTrace', {
                    threadId: thread.id,
                    startFrame: 0,
                    levels: 1
                });

                if (stackResponse.stackFrames && stackResponse.stackFrames.length > 0) {
                    const frame = stackResponse.stackFrames[0];

                    // Check if this thread has actual code (not [External Code])
                    if (frame.source && frame.source.path && frame.line > 0) {
                        // Found the thread with real source code!
                        return { threadId: thread.id, frame };
                    }
                }
            } catch (error) {
                // Thread not paused or no stack, continue checking other threads
                continue;
            }
        }

        // No thread with valid source code found, return null
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Get debug session by ID or active session
 *
 * @param {any} vscode - VS Code API
 * @param {string} [sessionId] - Optional session ID to find
 * @returns {any} Debug session
 * @throws {Error} E_NO_SESSION if session not found
 */
function getDebugSession(vscode, sessionId) {
    // Get the active debug session or find by ID
    const session = sessionId
        ? vscode.debug.activeDebugSession?.id === sessionId
            ? vscode.debug.activeDebugSession
            : undefined
        : vscode.debug.activeDebugSession;

    if (!session) {
        throw new Error(`E_NO_SESSION: No active debug session${sessionId ? ` with ID ${sessionId}` : ''}`);
    }

    return session;
}

/**
 * Get active thread ID from session
 *
 * THREAD DETECTION STRATEGY (in priority order):
 * 1. Cached thread ID from most recent stopped event (Dart-safe, all languages)
 * 2. C#-SPECIFIC: Scan for thread with actual source code (not [External Code])
 * 3. VS Code UI state (activeStackFrame.thread.id)
 * 4. First thread from DAP threads request
 *
 * The cache approach (strategy 1) fixes Dart multi-isolate debugging where only
 * ONE isolate pauses on breakpoint. VS Code's UI state may be stale/wrong for Dart.
 *
 * @param {any} session - VS Code debug session
 * @param {any} vscode - VS Code API
 * @returns {Promise<number>} Thread ID
 * @throws {Error} E_NO_THREAD if no thread available
 */
async function getActiveThreadId(session, vscode) {
    let threadId;

    // STRATEGY 1: Try cached thread ID from most recent stopped event
    // This is the ground truth for which thread actually paused
    const { DebugSessionCaptureService } = require('@core/debug/debug-session-capture');
    const capturedSession = DebugSessionCaptureService.instance.getSession(session.id);

    if (capturedSession?.lastStoppedThreadId !== null && capturedSession?.lastStoppedThreadId !== undefined) {
        // Validate the cached thread is still paused by requesting its stack
        try {
            await session.customRequest('stackTrace', {
                threadId: capturedSession.lastStoppedThreadId,
                levels: 1
            });
            // Success - thread is still paused, return it
            return capturedSession.lastStoppedThreadId;
        } catch (error) {
            // Thread no longer paused or doesn't exist, fall through to other strategies
        }
    }

    // STRATEGY 2A: DART-SPECIFIC - Find isolate with workspace source code (not SDK)
    if (session.type === 'dart') {
        const result = await findDartIsolateWithSource(session);
        if (result) {
            return result.threadId;
        }
        // Fall through to generic logic if Dart isolate detection failed
    }

    // STRATEGY 2B: C#-SPECIFIC - Find thread with actual source code (not [External Code])
    if (session.type === 'coreclr') {
        const result = await findCoreclrThreadWithSource(session);
        if (result) {
            return result.threadId;
        }
        // Fall through to generic logic if C# thread detection failed
    }

    // STRATEGY 3: For non-C# sessions OR if C# detection failed, use VS Code API
    // Try to get from active stack frame
    if (vscode.debug.activeStackFrame?.thread?.id) {
        threadId = vscode.debug.activeStackFrame.thread.id;
    } else {
        // STRATEGY 4: Fallback - query threads directly via DAP and use first one
        try {
            const threadsResponse = await session.customRequest('threads');
            threadId = threadsResponse.threads?.[0]?.id;
        } catch (error) {
            // Ignore error, will check threadId below
        }
    }

    if (threadId === null || threadId === undefined) {  // Check for null/undefined, but allow 0 (valid thread ID)
        throw new Error('E_NO_THREAD: No threadId available. Ensure debugger is paused before performing this operation.');
    }

    return threadId;
}

module.exports = {
    getDebugSession,
    getActiveThreadId,
    findDartIsolateWithSource,
    findCoreclrThreadWithSource
};
