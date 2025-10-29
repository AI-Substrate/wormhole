# Debug Event Waiting Standard

## Overview

All VSC-Bridge scripts that wait for debug state changes MUST use the standardized polling helper to ensure consistent detection of pause, termination, and timeout outcomes.

## The Two-Phase Pattern (Mandatory)

Every debug operation follows this universal pattern:

```
Phase 1: Unique Action (command-specific)
Phase 2: Wait for Outcome (THE SAME FOR ALL)
```

## Standard Pattern

### Required Helper

**ALL scripts MUST use:**

```javascript
const { waitUntilPausedAndGetLocation } = require('@core/debug/debug-polling-helpers');
```

**Location**: `/Users/jak/github/vsc-bridge/extension/src/core/debug/debug-polling-helpers.js`

### Pattern Template

```javascript
async wait(bridgeContext, params) {
    const vscode = bridgeContext.vscode;

    // Get session and thread (use session-helpers for common logic)
    const { getDebugSession, getActiveThreadId } = require('@core/debug/session-helpers');
    const session = await getDebugSession(vscode, params.sessionId);
    const threadId = await getActiveThreadId(session, vscode);

    // ============================================================================
    // PHASE 1: Unique Action (command-specific)
    // ============================================================================
    // Send DAP command specific to this script
    await session.customRequest('continue', { threadId });  // or stepIn/next/stepOut/evaluate/etc.

    // ============================================================================
    // PHASE 2: Wait for Outcome (THE SAME FOR ALL)
    // ============================================================================
    const result = await waitUntilPausedAndGetLocation(session, params.timeoutMs, vscode);

    // Log outcome
    if (bridgeContext.outputChannel) {
        if (result.event === 'stopped') {
            bridgeContext.outputChannel.appendLine(
                `[script] Paused at ${result.file}:${result.line}`
            );
        } else if (result.event === 'terminated') {
            bridgeContext.outputChannel.appendLine(
                `[script] Session terminated`
            );
        } else if (result.event === 'error') {
            bridgeContext.outputChannel.appendLine(
                `[script] Error: ${result.message}`
            );
        }
    }

    return result;
}
```

## Return Value Standard

**ALL scripts MUST return this format:**

```javascript
{
    event: 'stopped' | 'terminated' | 'error',  // REQUIRED

    // For 'stopped' events:
    reason?: string,           // 'breakpoint', 'step', 'exception', etc.
    file?: string,             // Source file path
    line?: number,             // Line number
    column?: number,           // Column number
    functionName?: string,     // Function name
    threadId?: number,         // Thread ID

    // For 'error' events:
    message?: string,          // Error description

    // Always present:
    sessionId: string,         // Debug session ID

    // Optional extras (context-specific):
    sessionName?: string,      // For test scripts
    testName?: string,         // For test scripts
    framework?: string,        // For test scripts
    workspaceFolder?: string   // For test scripts
}
```

## How It Works

The `waitUntilPausedAndGetLocation` helper:

1. **Polls every 50ms** attempting:
   - `session.customRequest('threads')`
   - `session.customRequest('stackTrace', {threadId})`

2. **Detects 3 outcomes**:

   **✅ STOPPED** - When `stackTrace` succeeds:
   ```javascript
   {
       event: 'stopped',
       file: topFrame.source.path,
       line: topFrame.line,
       column: topFrame.column,
       functionName: topFrame.name,
       threadId: threadId,
       sessionId: session.id
   }
   ```

   **✅ TERMINATED** - When session no longer active:
   ```javascript
   // Checks: vscode.debug.activeDebugSession?.id !== session.id
   {
       event: 'terminated',
       sessionId: session.id
   }
   ```

   **✅ ERROR** - When timeout exceeded:
   ```javascript
   {
       event: 'error',
       message: 'Timeout waiting for debug outcome after {timeoutMs}ms',
       sessionId: session.id
   }
   ```

## Examples by Script Type

### Step Commands

```javascript
// continue.js, step-into.js, step-over.js, step-out.js
const { waitUntilPausedAndGetLocation } = require('@core/debug/debug-polling-helpers');
const { getDebugSession, getActiveThreadId } = require('@core/debug/session-helpers');

async wait(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const session = await getDebugSession(vscode, params.sessionId);
    const threadId = await getActiveThreadId(session, vscode);

    // Phase 1: Send step command (unique to each)
    await session.customRequest('next', { threadId });  // or 'continue'/'stepIn'/'stepOut'

    // Phase 2: Wait (THE SAME)
    return await waitUntilPausedAndGetLocation(session, params.timeoutMs, vscode);
}
```

### Test Debug Scripts

```javascript
// debug-single.js
const { waitUntilPausedAndGetLocation } = require('@core/debug/debug-polling-helpers');

async wait(bridgeContext, params) {
    const vscode = bridgeContext.vscode;

    // Phase 1: Start test debug (unique)
    await vscode.commands.executeCommand('testing.debugAtCursor');
    await sleep(500); // Let session initialize

    const session = vscode.debug.activeDebugSession;
    if (!session) {
        throw new Error('E_NO_SESSION: Debug session failed to start');
    }

    // Phase 2: Wait (THE SAME)
    const result = await waitUntilPausedAndGetLocation(session, params.timeoutMs, vscode);

    // Add test-specific metadata
    return {
        ...result,
        sessionName: session.name,
        testName: await getTestName(...),
        framework: await detectFramework(...),
        workspaceFolder: workspaceFolder?.uri.fsPath
    };
}
```

### Custom Debug Operations

```javascript
// Any script that needs to wait for debug state change
async wait(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const session = await getDebugSession(vscode, params.sessionId);

    // Phase 1: Your unique operation
    await session.customRequest('evaluate', {
        expression: params.code,
        frameId: params.frameId
    });

    // Phase 2: Wait (THE SAME)
    return await waitUntilPausedAndGetLocation(session, params.timeoutMs, vscode);
}
```

## Anti-Patterns (FORBIDDEN)

### ❌ WRONG: Custom Polling Logic

```javascript
// DON'T duplicate polling logic
while (Date.now() < deadline) {
    try {
        const threads = await session.customRequest('threads');
        // ... custom polling ...
    } catch (e) {
        await sleep(50);
    }
}
```

**Why wrong**: Duplicates code, may miss termination detection, inconsistent timeout handling

### ❌ WRONG: Event-Based Waiting (for step/continue)

```javascript
// DON'T use event listeners for step commands
vscode.debug.onDidChangeActiveStackItem((stackItem) => {
    // ... event handling ...
});
```

**Why wrong**: Race conditions, session correlation issues, complexity

### ❌ WRONG: Incomplete Polling

```javascript
// DON'T check only for pause
while (true) {
    const stackTrace = await session.customRequest('stackTrace', {threadId});
    if (stackTrace.stackFrames.length > 0) {
        return {event: 'stopped', ...};
    }
    // ❌ Never checks for termination!
}
```

**Why wrong**: Infinite loop when session terminates, no timeout

### ❌ WRONG: Different Return Formats

```javascript
// DON'T use inconsistent property names
return {
    status: 'paused',           // ❌ Should be 'event'
    pauseReason: 'breakpoint',  // ❌ Should be 'reason'
    pauseLocation: {            // ❌ Should be flat: file, line
        source: '...',
        line: 10
    }
};
```

**Why wrong**: Inconsistent API, harder for consumers to handle

## Rationale

**Problem Solved**: Before standardization:
- Multiple scripts duplicated polling logic (56 lines across 4 scripts)
- `debugTestAtCursorPolling` only detected pause/timeout, never termination
- Inconsistent return formats (`status` vs `event`, nested vs flat)
- `debug-wait` duplicated `debug-single` with broken backwards compatibility

**Benefits**:
1. **Reliability**: Correctly detects all 3 outcomes (pause, terminate, timeout)
2. **Consistency**: All scripts behave identically
3. **Maintainability**: Single source of truth for polling logic
4. **Debuggability**: Predictable return format across all scripts

## Session Helpers (Companion Standard)

To eliminate further duplication, use session helpers for common operations:

```javascript
const { getDebugSession, getActiveThreadId } = require('@core/debug/session-helpers');

// Get session with error handling
const session = await getDebugSession(vscode, params.sessionId);
// Throws: E_NO_SESSION if not found

// Get thread ID with fallback logic
const threadId = await getActiveThreadId(session, vscode);
// Throws: E_NO_THREAD if not available
```

**Location**: `/Users/jak/github/vsc-bridge/extension/src/core/debug/session-helpers.js`

## Validation Checklist

Before committing a debug script, verify:

- [ ] Imports `waitUntilPausedAndGetLocation` from `@core/debug/debug-polling-helpers`
- [ ] Follows two-phase pattern: unique action → standardized wait
- [ ] Returns standard format: `{event, file?, line?, sessionId, ...}`
- [ ] Uses `getDebugSession` and `getActiveThreadId` from session-helpers (if applicable)
- [ ] No custom polling loops
- [ ] No event-based waiting for step/continue commands
- [ ] Handles all 3 outcomes: stopped, terminated, error
- [ ] Logs outcomes appropriately

## References

- **Critical Discovery 07**: Main plan section documenting this requirement
- **Subtask 005**: Implementation of this standardization
- **Helper Implementation**: `/Users/jak/github/vsc-bridge/extension/src/core/debug/debug-polling-helpers.js`
- **Session Helpers**: `/Users/jak/github/vsc-bridge/extension/src/core/debug/session-helpers.js`

## Summary

**Golden Rule**: If your script waits for a debug state change, use `waitUntilPausedAndGetLocation`. No exceptions.

**The Pattern**:
```
Phase 1: Do your unique thing
Phase 2: await waitUntilPausedAndGetLocation(session, timeoutMs, vscode)
```

**The Contract**:
- Input: `(session, timeoutMs, vscode)`
- Output: `{event: 'stopped'|'terminated'|'error', ...}`
- Polls: Every 50ms
- Detects: All outcomes reliably
