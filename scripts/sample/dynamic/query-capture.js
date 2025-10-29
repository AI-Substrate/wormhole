/**
 * Query Debug Session Capture Service
 *
 * Tests the production DebugSessionCaptureService by querying captured session data.
 *
 * Usage:
 *   # Get latest session
 *   just query-capture
 *
 *   # Get specific session
 *   just query-capture --param sessionId=abc-123
 *
 *   # Get all sessions
 *   just query-capture --param all=true
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;

    console.log('=' + '='.repeat(58) + '=');
    console.log('DEBUG SESSION CAPTURE QUERY');
    console.log('=' + '='.repeat(58) + '=');
    console.log('');

    // Access the service via global (set in extension.ts)
    const service = global.debugSessionCaptureService;

    if (!service) {
        return {
            error: 'DebugSessionCaptureService not found',
            hint: 'The service should be installed at extension activation. Check VSC-Bridge output logs.'
        };
    }

    // Query mode: all sessions or specific/latest
    if (params.all) {
        const sessions = service.getAllSessions();

        console.log(`Found ${sessions.length} captured session(s):`);
        console.log('');

        return {
            totalSessions: sessions.length,
            sessions: sessions.map(s => ({
                sessionId: s.sessionId,
                type: s.type,
                name: s.name,
                startTime: s.startTime,
                endTime: s.endTime,
                outputCount: s.outputs.length,
                exceptionCount: s.exceptions.length,
                stoppedCount: s.stoppedEvents.length,
                exitCode: s.exitCode,
                terminated: s.terminated
            }))
        };
    } else {
        const sessionId = params.sessionId || service.getLastSessionId();

        if (!sessionId) {
            return {
                error: 'No sessions captured yet',
                hint: 'Start a debug session first, then run this script'
            };
        }

        const session = service.getSession(sessionId);

        if (!session) {
            return {
                error: `Session not found: ${sessionId}`,
                availableSessions: service.getAllSessions().map(s => s.sessionId)
            };
        }

        console.log(`Session: ${session.sessionId}`);
        console.log(`Type: ${session.type}`);
        console.log(`Name: ${session.name}`);
        console.log(`Started: ${new Date(session.startTime).toISOString()}`);
        if (session.endTime) {
            console.log(`Ended: ${new Date(session.endTime).toISOString()}`);
            console.log(`Duration: ${session.endTime - session.startTime}ms`);
        }
        console.log('');
        console.log(`Outputs: ${session.outputs.length}`);
        console.log(`Exceptions: ${session.exceptions.length}`);
        console.log(`Stopped Events: ${session.stoppedEvents.length}`);
        console.log(`Exit Code: ${session.exitCode ?? 'N/A'}`);
        console.log(`Terminated: ${session.terminated}`);
        console.log('');

        // Show sample outputs (first 5)
        if (session.outputs.length > 0) {
            console.log('Sample Outputs:');
            session.outputs.slice(0, 5).forEach((out, i) => {
                console.log(`  [${i + 1}] [${out.category}] ${out.text.substring(0, 80)}${out.text.length > 80 ? '...' : ''}`);
            });
            if (session.outputs.length > 5) {
                console.log(`  ... and ${session.outputs.length - 5} more`);
            }
            console.log('');
        }

        return {
            sessionId: session.sessionId,
            type: session.type,
            name: session.name,
            startTime: session.startTime,
            endTime: session.endTime,
            duration: session.endTime ? session.endTime - session.startTime : null,
            outputCount: session.outputs.length,
            exceptionCount: session.exceptions.length,
            stoppedCount: session.stoppedEvents.length,
            exitCode: session.exitCode,
            terminated: session.terminated,
            outputs: session.outputs,
            exceptions: session.exceptions,
            stoppedEvents: session.stoppedEvents
        };
    }
};
