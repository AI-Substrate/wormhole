/**
 * Dynamic Debug Stop Script with Improved C# Support
 *
 * Stops the active debug session using a cascade approach:
 * 1. Try DAP 'terminate' request
 * 2. If that fails, try DAP 'disconnect' request with terminateDebuggee
 * 3. If that fails, use VS Code stopDebugging API
 *
 * Includes extensive logging for debugging the stopping process.
 *
 * Usage:
 *   cd test
 *   vscb script run -f ../scripts/sample/dynamic/debug-stop.js
 *
 * Testing:
 *   # Start a debug session first
 *   vscb script run tests.debug-single --param path=/path/to/test.cs --param line=17
 *
 *   # Then stop it
 *   vscb script run -f ../scripts/sample/dynamic/debug-stop.js
 *
 *   # Verify it stopped
 *   vscb script run debug.status
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;

    // Logging helper
    function log(message, data) {
        const line = data !== undefined
            ? `[DBG-STOP] ${message}: ${JSON.stringify(data, null, 2)}`
            : `[DBG-STOP] ${message}`;
        console.log(line);
        if (bridgeContext.outputChannel) {
            bridgeContext.outputChannel.appendLine(line);
        }
    }

    log('=== DEBUG STOP START ===');

    // Get the active debug session
    const session = vscode.debug.activeDebugSession;

    if (!session) {
        log('No active debug session found');
        return {
            success: false,
            reason: 'E_NO_SESSION',
            message: 'No active debug session'
        };
    }

    // Log session info
    log('Active session found', {
        id: session.id,
        type: session.type,
        name: session.name,
        workspaceFolder: session.workspaceFolder?.name
    });

    // Track which method succeeded
    let stoppedBy = null;
    let attempts = [];

    try {
        // ATTEMPT 1: Try DAP 'terminate' request
        log('Attempt 1: Trying DAP terminate request...');
        attempts.push('terminate');

        try {
            await session.customRequest('terminate', {});
            stoppedBy = 'terminate';
            log('✅ Terminate succeeded');
        } catch (terminateError) {
            log('❌ Terminate failed', {
                message: terminateError.message,
                code: terminateError.code,
                name: terminateError.name
            });

            // ATTEMPT 2: Try DAP 'disconnect' request
            // NOTE: Don't check error message - just try it for ANY terminate failure
            log('Attempt 2: Trying DAP disconnect request with terminateDebuggee=true...');
            attempts.push('disconnect');

            try {
                await session.customRequest('disconnect', {
                    terminateDebuggee: true
                });
                stoppedBy = 'disconnect';
                log('✅ Disconnect succeeded');
            } catch (disconnectError) {
                log('❌ Disconnect failed', {
                    message: disconnectError.message,
                    code: disconnectError.code,
                    name: disconnectError.name
                });

                // ATTEMPT 3: Fallback to VS Code stopDebugging API
                log('Attempt 3: Trying vscode.debug.stopDebugging...');
                attempts.push('stopDebugging');

                try {
                    await vscode.debug.stopDebugging(session);
                    stoppedBy = 'stopDebugging';
                    log('✅ stopDebugging succeeded');
                } catch (stopError) {
                    log('❌ stopDebugging failed', {
                        message: stopError.message,
                        code: stopError.code,
                        name: stopError.name
                    });

                    // All methods failed
                    throw stopError;
                }
            }
        }

        // Success!
        log('=== DEBUG STOP SUCCESS ===', {
            method: stoppedBy,
            attempts: attempts
        });

        // Wait a moment for session to fully terminate
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify session is gone
        const stillActive = vscode.debug.activeDebugSession?.id === session.id;
        log('Verification', {
            sessionStillActive: stillActive,
            activeSessionId: vscode.debug.activeDebugSession?.id || 'none'
        });

        return {
            success: true,
            status: 'terminated',
            stoppedCount: 1,
            stoppedSessions: [session.id],
            method: stoppedBy,
            attempts: attempts,
            sessionType: session.type,
            verifiedStopped: !stillActive
        };

    } catch (error) {
        // All attempts failed
        log('=== DEBUG STOP FAILED ===', {
            error: error.message,
            errorName: error.name,
            errorCode: error.code,
            attempts: attempts
        });

        return {
            success: false,
            reason: 'E_STOP_FAILED',
            message: `Failed to stop debug session after ${attempts.length} attempts`,
            details: {
                sessionId: session.id,
                sessionType: session.type,
                attempts: attempts,
                lastError: error.message
            }
        };
    }
};
