/**
 * Dynamic diagnostic script for C# xUnit test debugging
 *
 * Tests if we can detect when coreclr debugger pauses at a test breakpoint.
 * Mimics tests.debug-single but with extensive logging for debugging.
 *
 * Usage:
 *   cd test && vscb script run -f ../scratch/test-csharp-debug.js \
 *     --param path=/Users/jak/github/vsc-bridge/test/csharp/SampleTests/CalculatorTests.cs \
 *     --param line=17 \
 *     --param timeoutMs=10000
 */

const path = require('path');

module.exports = async function(bridgeContext, params) {
    const { vscode, outputChannel, extensionRoot } = bridgeContext;

    // Load the polling helper from source
    const pollingHelpersPath = path.join(extensionRoot, 'src/core/debug/debug-polling-helpers.js');
    const { waitUntilPausedAndGetLocation } = require(pollingHelpersPath);

    function log(message, data) {
        const line = data !== undefined
            ? `[CSHARP-DEBUG] ${message}: ${JSON.stringify(data, null, 2)}`
            : `[CSHARP-DEBUG] ${message}`;
        console.log(line);
        outputChannel?.appendLine(line);
    }

    // Default params
    const testPath = params?.path;
    const testLine = params?.line;
    const testColumn = params?.column ?? 1;
    const timeoutMs = params?.timeoutMs ?? 30000;

    if (!testPath || !testLine) {
        throw new Error('Missing required params: path, line');
    }

    try {
        log('=== C# TEST DEBUG START ===');
        log('Test location', { path: testPath, line: testLine, column: testColumn });
        log('Timeout', `${timeoutMs}ms`);

        // Check if testing.debugAtCursor is available
        const commands = await vscode.commands.getCommands();
        const hasDebugAtCursor = commands.includes('testing.debugAtCursor');
        log('testing.debugAtCursor available?', hasDebugAtCursor);

        if (!hasDebugAtCursor) {
            throw new Error('E_API_UNAVAILABLE: testing.debugAtCursor command not available');
        }

        // Open and position document at test location
        log('Opening document...');
        const uri = vscode.Uri.file(testPath);
        const document = await vscode.workspace.openTextDocument(uri);
        const position = new vscode.Position(testLine - 1, testColumn - 1);

        await vscode.window.showTextDocument(document, {
            selection: new vscode.Range(position, position),
            preserveFocus: false
        });
        log('Positioned cursor', `${testPath}:${testLine}:${testColumn}`);

        // Execute testing.debugAtCursor (NON-BLOCKING - don't await!)
        log('Executing testing.debugAtCursor...');
        // NOTE: testing.debugAtCursor BLOCKS until debug completes, so we fire and forget
        vscode.commands.executeCommand('testing.debugAtCursor');
        log('Command fired (not waiting for completion)');

        // Wait for session to initialize
        // Start with short wait, then poll for session
        log('Waiting for session to start...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Poll for session to appear (different languages take different times)
        let waitCount = 0;
        const maxWaitCount = 40; // 40 * 100ms = 4s max
        while (!vscode.debug.activeDebugSession && waitCount < maxWaitCount) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
        }
        log(`Session appeared after ${500 + waitCount * 100}ms`);

        // Get the debug session
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            throw new Error('E_NO_SESSION: No active debug session after testing.debugAtCursor');
        }

        log('Debug session started', {
            id: session.id,
            name: session.name,
            type: session.type,
            workspaceFolder: session.workspaceFolder?.name
        });

        // Check if session is still active
        const stillActive = vscode.debug.activeDebugSession?.id === session.id;
        log('Session still active?', stillActive);

        // CUSTOM POLLING LOOP with detailed logging
        log('=== STARTING CUSTOM POLLING LOOP ===');
        const startTime = Date.now();
        const pollInterval = 50;
        let pollCount = 0;

        while (Date.now() - startTime < timeoutMs) {
            pollCount++;
            const elapsed = Date.now() - startTime;

            try {
                // Get current active session
                const currentSession = vscode.debug.activeDebugSession;

                if (!currentSession) {
                    log(`Poll ${pollCount} (${elapsed}ms): NO ACTIVE SESSION - terminated`);
                    return {
                        success: false,
                        event: 'terminated',
                        message: 'Session terminated before pause detected'
                    };
                }

                // Try threads request
                log(`Poll ${pollCount} (${elapsed}ms): Requesting threads...`);
                const threadsResponse = await currentSession.customRequest('threads');

                log(`Poll ${pollCount} threads response`, {
                    threadCount: threadsResponse.threads?.length,
                    threads: threadsResponse.threads?.map(t => ({
                        id: t.id,
                        name: t.name,
                        state: t.state || 'unknown'
                    }))
                });

                if (!threadsResponse.threads || threadsResponse.threads.length === 0) {
                    log(`Poll ${pollCount}: No threads, continuing...`);
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    continue;
                }

                // Try to get stack trace for first thread
                const threadId = threadsResponse.threads[0].id;
                log(`Poll ${pollCount}: Requesting stack for thread ${threadId}...`);

                const stackResponse = await currentSession.customRequest('stackTrace', {
                    threadId,
                    startFrame: 0,
                    levels: 1
                });

                log(`Poll ${pollCount} stack response`, {
                    frameCount: stackResponse.stackFrames?.length,
                    topFrame: stackResponse.stackFrames?.[0] ? {
                        id: stackResponse.stackFrames[0].id,
                        name: stackResponse.stackFrames[0].name,
                        source: stackResponse.stackFrames[0].source?.path,
                        line: stackResponse.stackFrames[0].line,
                        column: stackResponse.stackFrames[0].column
                    } : null
                });

                if (stackResponse.stackFrames && stackResponse.stackFrames.length > 0) {
                    const topFrame = stackResponse.stackFrames[0];

                    log('=== PAUSED DETECTED ===', {
                        file: topFrame.source?.path,
                        line: topFrame.line,
                        column: topFrame.column,
                        function: topFrame.name
                    });

                    // Just return whatever we found - no special handling
                    return {
                        success: true,
                        event: 'stopped',
                        file: topFrame.source?.path || topFrame.source?.name || 'unknown',
                        line: topFrame.line,
                        column: topFrame.column,
                        functionName: topFrame.name,
                        threadId: threadId,
                        sessionId: currentSession.id,
                        sessionName: currentSession.name,
                        sessionType: currentSession.type,
                        pollCount: pollCount,
                        elapsedMs: elapsed
                    };
                }

                log(`Poll ${pollCount}: No stack frames yet, continuing...`);

            } catch (error) {
                log(`Poll ${pollCount} ERROR`, {
                    message: error.message,
                    code: error.code
                });

                // Check if session terminated
                if (!vscode.debug.activeDebugSession) {
                    log(`Poll ${pollCount}: Session terminated (error path)`);
                    return {
                        success: false,
                        event: 'terminated',
                        message: 'Session terminated during polling',
                        lastError: error.message
                    };
                }

                // Not paused yet, continue
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        log('=== TIMEOUT ===', { pollCount, timeoutMs });
        return {
            success: false,
            event: 'error',
            message: `Timeout after ${timeoutMs}ms (${pollCount} polls)`,
            sessionId: session.id
        };

    } catch (error) {
        log('FATAL ERROR', {
            message: error.message,
            stack: error.stack
        });
        return {
            success: false,
            event: 'error',
            error: error.message,
            stack: error.stack
        };
    }
};
