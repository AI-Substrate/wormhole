/**
 * DAP Session Capture Prototype - Atomic Iteration Mode
 *
 * Self-contained: Install tracker → Capture for 5 seconds → Dump results → Exit
 * Each run is independent - perfect for rapid iteration!
 *
 * Usage:
 *   (Start test in debugger first)
 *   just sample-dap-capture
 *   (Script installs tracker, waits 5s, dumps captured data, exits)
 *
 * Edit this file and re-run immediately - no compilation needed!
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const captureDuration = params.duration || 5000; // 5 seconds default

    console.log('=' + '='.repeat(58) + '=');
    console.log('DAP CAPTURE - ATOMIC RUN');
    console.log('=' + '='.repeat(58) + '=');
    console.log('');

    // Local state for THIS run only
    const capturedSessions = new Map();
    let activeSession = null;

    // Step 1: Install tracker (this run only)
    console.log('Step 1: Installing DAP tracker...');

    vscode.debug.registerDebugAdapterTrackerFactory('*', {
        createDebugAdapterTracker(session) {
            console.log(`[TRACKER] Attached to session: ${session.id}`);

            const sessionData = {
                sessionId: session.id,
                type: session.type,
                name: session.name,
                startTime: Date.now(),
                outputs: [],
                exceptions: [],
                stoppedEvents: [],
                exitCode: null,
                terminated: false
            };

            capturedSessions.set(session.id, sessionData);
            activeSession = session.id;

            return {
                onDidSendMessage(message) {
                    if (message?.type !== 'event') return;

                    switch (message.event) {
                        case 'output':
                            sessionData.outputs.push({
                                ts: Date.now(),
                                category: message.body?.category || 'console',
                                text: message.body?.output || ''
                            });
                            break;

                        case 'stopped':
                            sessionData.stoppedEvents.push(message.body);
                            break;

                        case 'exited':
                            sessionData.exitCode = message.body?.exitCode;
                            break;

                        case 'terminated':
                            sessionData.terminated = true;
                            break;
                    }
                }
            };
        }
    });

    console.log('✅ Tracker installed');
    console.log('');

    // Step 2: Wait and capture
    console.log(`Step 2: Capturing for ${captureDuration}ms...`);
    await new Promise(resolve => setTimeout(resolve, captureDuration));
    console.log('✅ Capture complete');
    console.log('');

    // Step 3: Dump results
    console.log('Step 3: Results:');
    console.log('=' + '='.repeat(58) + '=');

    if (capturedSessions.size === 0) {
        return {
            status: 'no_sessions',
            message: 'No debug sessions captured. Is a test running in debugger?',
            hint: 'Start debugging a test first, then run this script'
        };
    }

    const results = Array.from(capturedSessions.values()).map(s => ({
        sessionId: s.sessionId,
        type: s.type,
        name: s.name,
        outputCount: s.outputs.length,
        outputs: s.outputs,
        exceptionCount: s.exceptions.length,
        stoppedCount: s.stoppedEvents.length,
        exitCode: s.exitCode,
        terminated: s.terminated
    }));

    return {
        status: 'success',
        capturedSessions: results.length,
        activeSession,
        results
    };
};
