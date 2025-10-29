/**
 * Debug Status Query Script
 *
 * Queries comprehensive debugger status including:
 * - Session information
 * - Pause state detection
 * - Thread information
 * - Stack frames
 * - Current location
 * - Scopes (preparation for variable queries)
 *
 * Key insight from research: The 'threads' DAP request only succeeds when paused
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const session = vscode.debug.activeDebugSession;

    // No active session
    if (!session) {
        return {
            isActive: false,
            isPaused: false,
            message: "No active debug session"
        };
    }

    // Basic session info
    const status = {
        isActive: true,
        sessionId: session.id,
        sessionType: session.type,
        sessionName: session.name,
        sessionConfiguration: session.configuration
    };

    try {
        // Try to get threads - this is the key pause detection
        // This request only succeeds when the debugger is paused
        console.log(`[DEBUG-STATUS] Attempting threads request for session ${session.id}...`);
        const threadsResponse = await session.customRequest('threads');

        // If we get here, we're paused
        status.isPaused = true;
        status.threads = threadsResponse.threads;
        console.log(`[DEBUG-STATUS] Got ${threadsResponse.threads.length} threads - debugger is PAUSED`);

        // Get stack trace for the first thread (or the one that stopped)
        if (threadsResponse.threads && threadsResponse.threads.length > 0) {
            // Use first thread for now (could be enhanced to find the stopped thread)
            const threadId = threadsResponse.threads[0].id;
            status.currentThread = {
                id: threadId,
                name: threadsResponse.threads[0].name
            };

            console.log(`[DEBUG-STATUS] Getting stack trace for thread ${threadId}...`);
            const stackTraceResponse = await session.customRequest('stackTrace', {
                threadId: threadId,
                startFrame: 0,
                levels: 50  // Get up to 50 frames
            });

            status.stackFrames = stackTraceResponse.stackFrames;
            status.totalFrames = stackTraceResponse.totalFrames;

            // Extract current location from top frame
            if (stackTraceResponse.stackFrames && stackTraceResponse.stackFrames.length > 0) {
                const topFrame = stackTraceResponse.stackFrames[0];
                status.currentLocation = {
                    source: topFrame.source?.path || topFrame.source?.name || 'unknown',
                    line: topFrame.line,
                    column: topFrame.column,
                    functionName: topFrame.name,
                    frameId: topFrame.id
                };

                // Get scopes for the top frame (preparation for Phase 1 variable queries)
                try {
                    console.log(`[DEBUG-STATUS] Getting scopes for frame ${topFrame.id}...`);
                    const scopesResponse = await session.customRequest('scopes', {
                        frameId: topFrame.id
                    });

                    status.scopes = scopesResponse.scopes.map(scope => ({
                        name: scope.name,
                        variablesReference: scope.variablesReference,
                        expensive: scope.expensive,
                        namedVariables: scope.namedVariables,
                        indexedVariables: scope.indexedVariables
                    }));

                    console.log(`[DEBUG-STATUS] Got ${scopesResponse.scopes.length} scopes`);
                } catch (scopeError) {
                    console.warn(`[DEBUG-STATUS] Failed to get scopes: ${scopeError.message}`);
                    status.scopeError = scopeError.message;
                }
            }
        }

        // Check which breakpoint might have been hit (basic check)
        const breakpoints = vscode.debug.breakpoints;
        status.totalBreakpoints = breakpoints.length;

        // Try to match current location with breakpoints
        if (status.currentLocation) {
            const sourceBreakpoints = breakpoints.filter(bp =>
                bp instanceof vscode.SourceBreakpoint
            );

            const possibleHit = sourceBreakpoints.find(bp => {
                const bpPath = bp.location.uri.fsPath;
                const bpLine = bp.location.range.start.line + 1; // VS Code uses 0-based
                return bpPath === status.currentLocation.source &&
                       bpLine === status.currentLocation.line;
            });

            if (possibleHit) {
                status.hitBreakpoint = {
                    id: possibleHit.id,
                    line: possibleHit.location.range.start.line + 1,
                    source: possibleHit.location.uri.fsPath,
                    enabled: possibleHit.enabled,
                    condition: possibleHit.condition
                };
            }
        }

    } catch (error) {
        // Not paused or other error
        status.isPaused = false;
        status.error = error.message;

        // Common error messages and what they mean
        if (error.message.includes('not stopped') || error.message.includes('notStopped')) {
            status.errorExplanation = "Debugger is running. Pause at a breakpoint to query status.";
        } else if (error.message.includes('timeout')) {
            status.errorExplanation = "Request timed out. Debug adapter may be unresponsive.";
        } else {
            status.errorExplanation = "Unable to query debug status. See error message.";
        }

        console.log(`[DEBUG-STATUS] Not paused or error: ${error.message}`);
    }

    // Log summary to console
    console.log('[DEBUG-STATUS] Summary:', {
        isActive: status.isActive,
        isPaused: status.isPaused,
        sessionType: status.sessionType,
        currentLocation: status.currentLocation,
        frameCount: status.stackFrames?.length,
        scopeCount: status.scopes?.length
    });

    // Log to output channel
    bridgeContext.logger.info('Debug status query complete:', JSON.stringify(status, null, 2));

    return status;
};