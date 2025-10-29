# Debugging with Dynamic Scripts

This document describes how we used dynamic scripts to debug and fix the `tests.debug-single` implementation for C# xUnit test debugging.

## Problem

The `tests.debug-single` script was timing out when trying to debug C# xUnit tests, even though manual "Debug Test" from the UI worked perfectly. We needed to understand why the script couldn't detect when the debugger was paused.

## Challenge: Debugging Compiled Code

The production `tests.debug-single` script is:
1. **Webpack bundled** - compiled into a single minified line
2. **No source maps for stepping** - difficult to set breakpoints
3. **Requires rebuild** - slow iteration cycle (~30s per change)

This made it nearly impossible to debug what was happening in the polling logic.

## Solution: Use a Dynamic Script

Dynamic scripts are **hot-reload JavaScript files** that run directly from source without compilation. They allowed us to:
- Add detailed logging at every step
- Iterate instantly (no rebuild needed)
- Test fixes immediately

### The Dynamic Script Approach

We created `/scripts/sample/dynamic/test-csharp-debug.js` that mimicked `tests.debug-single` but with:

1. **Extensive logging** at each step:
```javascript
log('Poll 1 (0ms): Requesting threads...');
log('Poll 1 threads response', threadsResponse);
log('Poll 1: Requesting stack for thread 345810...');
```

2. **Custom polling loop** instead of using the helper:
```javascript
while (Date.now() - startTime < timeoutMs) {
    try {
        const threadsResponse = await currentSession.customRequest('threads');
        const stackResponse = await currentSession.customRequest('stackTrace', { threadId, ... });
        // Detailed logging of each response
    } catch (error) {
        log(`Poll ${pollCount} ERROR`, { message: error.message });
    }
}
```

3. **Instant testing** - just edit and re-run:
```bash
vscb script run -f ../scratch/test-csharp-debug.js \
  --param path=/path/to/test.cs \
  --param line=17
```

## What We Discovered

Through the dynamic script logs, we found **two critical issues**:

### Issue 1: `testing.debugAtCursor` Blocks

```
[CSHARP-DEBUG] Executing testing.debugAtCursor...
[... nothing more logs ...]
```

The command was blocking and never returning because `testing.debugAtCursor` doesn't complete until the debug session ends.

**Fix**: Don't await it - fire and forget:
```javascript
// BEFORE:
await vscode.commands.executeCommand('testing.debugAtCursor');

// AFTER:
vscode.commands.executeCommand('testing.debugAtCursor');
```

### Issue 2: Different Startup Times

The logs showed:
```
[CSHARP-DEBUG] Session appeared after 1400ms  // C#
[CSHARP-DEBUG] Session appeared after 600ms   // Python
[CSHARP-DEBUG] Session appeared after 1500ms  // Jest
```

Different languages take different times to start their debug sessions.

**Fix**: Poll for session instead of fixed 500ms wait:
```javascript
let session = null;
const pollInterval = 100;
const maxPolls = Math.ceil(params.timeoutMs / pollInterval);

while (!session && pollCount < maxPolls) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    session = vscode.debug.activeDebugSession;
    pollCount++;
}
```

### Issue 3: C# Pauses at `[External Code]` First

The detailed logs revealed:
```
Poll 4: Paused at [External Code], continuing to real breakpoint...
[DebugSessionCapture] 🏁 Adapter process exited: code=0
```

When we auto-continued past `[External Code]`, the test completed before hitting the actual breakpoint.

**Fix**: Return immediately when ANY pause is detected (even `[External Code]`):
```javascript
// Just return whatever we found - no special handling
if (stackResponse.stackFrames && stackResponse.stackFrames.length > 0) {
    return {
        event: 'stopped',
        file: topFrame.source?.path || 'unknown',
        line: topFrame.line,
        // ... rest of data
    };
}
```

## Results

After applying these fixes to production `tests.debug-single`:

| Language | Status | Pause Location | Time |
|----------|--------|----------------|------|
| Python   | ✅ Success | Line 21 (test code) | ~600ms |
| Jest     | ✅ Success | Line 530 (test code) | ~1.5s |
| C#       | ✅ Success | Line 0 (`[External Code]`) | ~3.7s |

All three languages now work without timeout!

## Key Takeaway

**Dynamic scripts are invaluable for debugging complex issues in compiled code:**

1. **Fast iteration** - no rebuild needed
2. **Full control** - add logging anywhere
3. **Same environment** - runs in actual VS Code extension host
4. **Easy testing** - just `vscb script run -f path/to/script.js`

Once the fix is proven in the dynamic script, port it back to the production code with confidence.

## Running the Example

Test the dynamic script yourself:

```bash
# From test workspace
cd test

# Python test
vscb script run -f ../scripts/sample/dynamic/test-csharp-debug.js \
  --param path=/Users/jak/github/vsc-bridge/test/python/test_example.py \
  --param line=21

# Jest test
vscb script run -f ../scripts/sample/dynamic/test-csharp-debug.js \
  --param path=/Users/jak/github/vsc-bridge/test/javascript/example.test.js \
  --param line=533

# C# test
vscb script run -f ../scripts/sample/dynamic/test-csharp-debug.js \
  --param path=/Users/jak/github/vsc-bridge/test/csharp/SampleTests/CalculatorTests.cs \
  --param line=17
```

Check the Extension Host Debug Console for detailed logs showing exactly what's happening at each polling step.
