// Quick test to check Python detection
const path = require('path');
const { BridgeContext } = require('./extension/out/core/bridge-context/BridgeContext');

// Mock extension context
const mockExtensionContext = {
    extensionPath: '/Users/jordanknight/github/vsc-bridge/extension',
    subscriptions: [],
    extensionUri: { fsPath: '/Users/jordanknight/github/vsc-bridge/extension' }
};

async function test() {
    const bridgeContext = new BridgeContext(mockExtensionContext);

    const pytestFile = '/Users/jordanknight/github/vsc-bridge/extension/src/test/fixtures/python/pytest-basic/tests/test_sample.py';

    console.log('Testing Python detection for:', pytestFile);

    try {
        const result = await bridgeContext.getPythonEnv(pytestFile);
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();