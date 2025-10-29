# BridgeContext Quick Start

## For Script Authors

### What is BridgeContext?

BridgeContext gives your script access to Python test framework detection. That's it.

### How to Use It

#### 1. Opt-in to BridgeContext

Add this symbol to your script:

```javascript
export function execute(bridgeContext, ctx, params) {
    // Your script here
}

// This line opts in to BridgeContext
execute[Symbol.for('bridge.acceptsContext')] = true;
```

#### 2. Get Python Test Environment

```javascript
const env = await bridgeContext.getPythonEnv(params.filePath);

// env contains:
// - framework: 'pytest' | 'unittest' | 'none'
// - debugConfig: { module: 'pytest', ... }  // Uses module, not program!
// - confidence: 0.0 to 1.0
// - reasons: ['Found pytest.ini', ...]
```

### Complete Examples

#### Pytest Example

```javascript
export async function execute(bridgeContext, ctx, params) {
    const env = await bridgeContext.getPythonEnv(params.file);

    if (env.framework === 'pytest') {
        bridgeContext.logger.info(`Found pytest with ${env.confidence} confidence`);
        // env.debugConfig.module === 'pytest' ✅
        return env.debugConfig;
    }
}
execute[Symbol.for('bridge.acceptsContext')] = true;
```

#### Unittest Example

```javascript
export async function execute(bridgeContext, ctx, params) {
    const env = await bridgeContext.getPythonEnv(params.file);

    if (env.framework === 'unittest') {
        bridgeContext.logger.info('Found unittest');
        // env.debugConfig.module === 'unittest' ✅
        return env.debugConfig;
    }
}
execute[Symbol.for('bridge.acceptsContext')] = true;
```

### That's It!

You only need to know:
1. Add the Symbol to opt-in
2. Call `getPythonEnv()`
3. Use the returned debug config (it has `module`, not `program`)

Everything else is handled for you.