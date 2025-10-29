/**
 * Test evaluate request for Object.is()
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const session = vscode.debug.activeDebugSession;

    if (!session) {
        return { error: "No active debug session" };
    }

    // Get frame ID
    try {
        const threadsResponse = await session.customRequest('threads');
        const threadId = threadsResponse.threads[0].id;

        const stackResponse = await session.customRequest('stackTrace', {
            threadId: threadId,
            startFrame: 0,
            levels: 1
        });

        const frameId = stackResponse.stackFrames[0].id;

        // Test Object.is() evaluation
        const expr = `Object.is(simpleCircular.self, simpleCircular)`;
        console.log(`Testing: ${expr}`);

        const result = await session.customRequest('evaluate', {
            expression: expr,
            frameId: frameId,
            context: 'hover'
        });

        return {
            success: true,
            expression: expr,
            result: result.result,
            type: result.type,
            isCircular: result.result === 'true'
        };

    } catch (error) {
        return {
            error: error.message,
            stack: error.stack
        };
    }
};