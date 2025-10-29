/**
 * Echo Message - Dynamic Script Hot-Reload Test with Parameters
 *
 * This script demonstrates:
 * 1. Hot-reload capability (change without recompilation)
 * 2. Parameter passing and parsing
 *
 * Usage:
 *   vscb script run -f ./scripts/sample/dynamic/echo-message.js --param greeting="Good morning"
 *   OR
 *   just sample-echo --param greeting="Good morning"
 */

module.exports = async function(bridgeContext, params) {
    // Default values
    const defaultGreeting = "Hello";
    const scriptVersion = "2.0-HOTRELOAD";  // CHANGE THIS to test hot-reload

    // Parse parameters - params is an object with key-value pairs
    const greeting = params?.greeting || defaultGreeting;
    const name = params?.name || "World";
    const shout = params?.shout === "true" || params?.shout === true;

    // Build the message
    let baseMessage = `${greeting}, ${name}!`;
    const fullMessage = shout ? baseMessage.toUpperCase() : baseMessage;

    // Version indicator - CHANGE THIS to test hot-reload
    const versionMessage = `[Dynamic Script v${scriptVersion}]`;

    // Log to output channel
    bridgeContext.logger.info(`Echo script called with params: ${JSON.stringify(params)}`);
    bridgeContext.logger.info(`Generated message: ${fullMessage}`);

    // Console output for immediate CLI feedback
    console.log(`\n🔊 ECHO MESSAGE ${versionMessage}:`);
    console.log(`${fullMessage}`);
    console.log(`\n📊 Parameters received:`);
    console.log(`  - greeting: "${greeting}" (default: "${defaultGreeting}")`);
    console.log(`  - name: "${name}" (default: "World")`);
    console.log(`  - shout: ${shout} (default: false)`);
    console.log(`  - raw params:`, params || "(none)");

    // Return structured data
    return {
        message: fullMessage,
        version: scriptVersion,
        parameters: {
            greeting,
            name,
            shout,
            raw: params
        },
        timestamp: new Date().toISOString()
    };
};
