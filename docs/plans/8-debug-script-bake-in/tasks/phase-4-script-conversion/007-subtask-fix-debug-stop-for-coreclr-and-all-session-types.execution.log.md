# Subtask 007: Fix debug.stop for C# coreclr - Execution Log

**Status**: ✅ Phase 0 Complete - Dynamic Script Validated
**Date**: 2025-10-07

## Phase 0: Dynamic Script Development & Validation

### ST001: Create Dynamic Script ✅ COMPLETE

**File Created**: `/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/debug-stop.js`

**Key Changes from Baked-In Script**:
1. **Removed narrow error check**: Changed from `if (e.message?.includes('not supported'))` to always trying disconnect after ANY terminate failure
2. **Added extensive logging**: Full diagnostic output at each step
3. **Enhanced error details**: Captures error name, code, and message
4. **Verification step**: Checks if session actually stopped after 100ms

**Code Structure**:
```javascript
try {
    await session.customRequest('terminate', {});
    stoppedBy = 'terminate';
} catch (terminateError) {
    // ALWAYS try disconnect, regardless of error message
    try {
        await session.customRequest('disconnect', { terminateDebuggee: true });
        stoppedBy = 'disconnect';
    } catch (disconnectError) {
        // Final fallback
        await vscode.debug.stopDebugging(session);
        stoppedBy = 'stopDebugging';
    }
}
```

### ST002: Test with C# coreclr Sessions ✅ COMPLETE

**Test 1**: First C# debug session
- **Session ID**: `709cde25-11f1-40da-9958-c64d05cfd606`
- **Session Type**: `coreclr`
- **Result**: ✅ **SUCCESS**
- **Method Used**: `disconnect` (terminate failed, disconnect succeeded)
- **Attempts**: `["terminate", "disconnect"]`
- **Duration**: 164ms

**Test 2**: Second C# debug session (verification)
- **Session ID**: `9526fefb-099d-4537-81df-0bd76781795c`
- **Session Type**: `coreclr`
- **Result**: ✅ **SUCCESS**
- **Method Used**: `disconnect` (terminate failed, disconnect succeeded)
- **Attempts**: `["terminate", "disconnect"]`
- **Duration**: 147ms

**Verification**: Both times confirmed via `debug.status` showing "No active debug session"

### Key Findings

#### 🎯 Root Cause Confirmed

The baked-in script at `extension/src/vsc-scripts/debug/stop.js` has this logic:
```javascript
try {
    await session.customRequest('terminate', {});
} catch (e) {
    if (e.message?.includes('not supported')) {  // ❌ TOO NARROW
        await session.customRequest('disconnect', { terminateDebuggee: true });
    } else {
        await vscode.debug.stopDebugging(session);  // C# was jumping here
    }
}
```

**Problem**: C# coreclr throws a different error message that doesn't contain "not supported", so it skips the disconnect attempt and goes straight to `stopDebugging()`, which doesn't work reliably.

**Solution**: Remove the error message check and ALWAYS try disconnect after ANY terminate failure.

#### 🔬 Adapter Behavior Matrix (Discovered)

| Adapter | Session Type | terminate | disconnect | stopDebugging |
|---------|--------------|-----------|------------|---------------|
| **C# coreclr** | `coreclr` | ❌ Fails | ✅ **Works** | ❓ Not tested |
| **Python** | `debugpy` | ❓ Not tested | ❓ Not tested | ❓ Not tested |
| **JavaScript** | `pwa-node` | ❓ Not tested | ❓ Not tested | ❓ Not tested |

#### 📊 C#-Specific Quirks

1. **terminate always fails** for coreclr sessions (both tests)
2. **disconnect with terminateDebuggee: true works reliably** (both tests, ~150ms)
3. **No error about "not supported"** - different error message triggered narrow check failure
4. **Session termination is async** - 100ms delay needed before verification

### Next Steps

**Ready to Port to Baked-In Script**:
- [x] Dynamic script proven working for C# coreclr
- [ ] Port changes to `extension/src/vsc-scripts/debug/stop.js`
- [ ] Rebuild extension
- [ ] Test all three adapters with baked-in script:
  - [ ] Python (debugpy) - baseline test
  - [ ] JavaScript (pwa-node) - baseline test
  - [ ] C# (coreclr) - verify fix works in production

## Implementation Plan

### Changes to Port

**File**: `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/debug/stop.js`

**Change 1**: Remove narrow error check (lines ~40-52)

**Before**:
```javascript
try {
    await session.customRequest('terminate', {});
} catch (e) {
    if (e.message?.includes('not supported')) {
        await session.customRequest('disconnect', {
            terminateDebuggee: true
        });
    } else {
        await vscode.debug.stopDebugging(session);
    }
}
```

**After**:
```javascript
try {
    await session.customRequest('terminate', {});
} catch (terminateError) {
    try {
        await session.customRequest('disconnect', {
            terminateDebuggee: true
        });
    } catch (disconnectError) {
        await vscode.debug.stopDebugging(session);
    }
}
```

**Change 2**: Add diagnostic logging (optional but recommended)

```javascript
if (bridgeContext.outputChannel) {
    bridgeContext.outputChannel.appendLine(
        `[debug.stop] Session type: ${session.type}, stopped via: ${method}`
    );
}
```

### Testing Plan

**Manual Test Sequence** (from `/docs/manual-test/debug-single.md`):

1. **Python (debugpy)**:
   - Run test: `tests.debug-single --param path=test/python/test_example.py --param line=21`
   - Check status: Should show paused at line 21
   - Stop: `debug.stop`
   - Verify: `debug.status` should show "No active debug session"

2. **JavaScript (pwa-node)**:
   - Run test: `tests.debug-single --param path=test/javascript/example.test.js --param line=533`
   - Check status: Should show paused
   - Stop: `debug.stop`
   - Verify: `debug.status` should show "No active debug session"

3. **C# (coreclr)**:
   - Run test: `tests.debug-single --param path=test/csharp/SampleTests/CalculatorTests.cs --param line=17`
   - Check status: Should show paused at [External Code]
   - Stop: `debug.stop` (**should work now, not require debug.continue**)
   - Verify: `debug.status` should show "No active debug session"

### Success Criteria

- [x] Dynamic script works for C# coreclr (2 tests passed)
- [ ] Baked-in script updated with fix
- [ ] Extension rebuilt
- [ ] Python debug.stop continues working (baseline)
- [ ] JavaScript debug.stop continues working (baseline)
- [ ] C# debug.stop newly working (no more workaround needed)
- [ ] Manual test documentation updated (remove C# workaround)

## Evidence

**Dynamic Script**: `/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/debug-stop.js` (170 lines)

**Test Results**:
```json
// Test 1
{
  "success": true,
  "status": "terminated",
  "method": "disconnect",
  "attempts": ["terminate", "disconnect"],
  "sessionType": "coreclr"
}

// Test 2
{
  "success": true,
  "status": "terminated",
  "method": "disconnect",
  "attempts": ["terminate", "disconnect"],
  "sessionType": "coreclr"
}
```

**Verification**:
```json
{
  "isActive": false,
  "message": "No active debug session"
}
```
