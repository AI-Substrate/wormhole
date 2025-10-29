# Debugging Step Operations: Handover Document

**Date:** 2025-10-21
**Status:** In Progress - Currently debugging at breakpoint
**Phase:** Phase 1 - Dart/Flutter Debugging Support (87% complete)

---

## Executive Summary

We are fixing a critical bug where DAP step operations (step-over, step-into, step-out, continue) timeout or fail to detect when the debugger has moved to a new location. The root cause is a misunderstanding of how VS Code's DAP event APIs work, combined with the asynchronous nature of DAP protocol operations.

**Current State:** The Extension Host is paused at a breakpoint in our new implementation. We need to scientifically verify that our new approach using `DebugSessionCaptureService` correctly detects when step operations complete.

---

## The Problem

### Technical Background

The Debug Adapter Protocol (DAP) is asynchronous:

1. When you call `session.customRequest('next', { threadId })` to step over a line
2. The DAP adapter returns **immediately** with an acknowledgment
3. The actual step happens later (could be milliseconds, could be longer)
4. The adapter sends a `stopped` event when execution pauses at the new location
5. Only AFTER the stopped event is safe to query `stackTrace` for the new location

**The Race Condition:**
```javascript
// ❌ WRONG - This was our original polling approach
await session.customRequest('next', { threadId });
// Returns immediately, step hasn't happened yet!

const stackResponse = await session.customRequest('stackTrace', { threadId });
// Queries too early - returns STALE data (same location as before step)
```

### Symptom

When running `vscb script run debug.step-over` on a paused Dart debug session:

```json
{
  "ok": false,
  "type": "error",
  "error": {
    "code": "E_INTERNAL",
    "message": "Timeout waiting for stopped event after 5000ms"
  }
}
```

OR the command returns success but reports the same location (didn't advance).

### Impact

- Step-over, step-into, step-out, continue all fail
- Affects all languages (Dart, Python, C#, Java, TypeScript)
- Makes interactive debugging via CLI/MCP tools unusable

---

## What We've Tried

### Attempt #1: Polling stackTrace (Original Implementation)

**File:** `packages/extension/src/core/debug/debug-polling-helpers.js`
**Function:** `waitUntilPausedAndGetLocation()`

**Approach:**
```javascript
await session.customRequest('next', { threadId });
// Poll stackTrace every 50ms until it returns different data
while (Date.now() - startTime < timeoutMs) {
    const stackResponse = await session.customRequest('stackTrace', { threadId });
    // Check if location changed
    await new Promise(resolve => setTimeout(resolve, 50));
}
```

**Why It Failed:**
- Race condition: stackTrace query happens before stopped event
- Returns stale data (same location)
- No reliable way to know when step actually completed

---

### Attempt #2: Using `onDidReceiveDebugSessionCustomEvent`

**File:** `packages/extension/src/core/debug/debug-polling-helpers.js`
**Function:** `waitForStoppedEventAndGetLocation()` (first version)

**Approach:**
```javascript
vscode.debug.onDidReceiveDebugSessionCustomEvent(async (event) => {
    if (event.session.id === session.id &&
        event.event === 'stopped' &&
        event.body.threadId === threadId) {
        // Event fired! Query stackTrace now
    }
});
await session.customRequest('next', { threadId });
```

**Why It Failed:**
- `onDidReceiveDebugSessionCustomEvent` **ONLY fires for CUSTOM events**
- Standard DAP protocol events (like `stopped`, `continued`, `terminated`) do NOT trigger this API
- We got 5-second timeouts because the event handler never fired

**Evidence from VS Code GitHub Issue #113725:**
> "As the description says `onDidReceiveDebugSessionCustomEvent` fires for 'custom' events. You cannot use it to intercept regular DAP events."
>
> Q: "How do I intercept regular DAP events, then?"
>
> A: "You can use the **DebugAdapterTracker** API."

---

## Current Solution Attempt

### Architecture Discovery

**Key Finding:** The vsc-bridge codebase ALREADY has infrastructure to capture DAP events!

**File:** `packages/extension/src/core/debug/debug-session-capture.ts`

This is a singleton service that:
- Registers a `DebugAdapterTrackerFactory` for ALL debug types (`'*'`)
- Implements `onDidSendMessage` to intercept DAP messages FROM adapter TO VS Code
- Captures ALL stopped events, output events, exceptions, etc.
- Stores data in-memory indexed by `sessionId`
- Is installed at extension activation (line 67 of `extension.ts`)

**The Service API:**
```typescript
interface CapturedSession {
  sessionId: string;
  type: string;
  name: string;
  startTime: number;
  outputs: OutputEvent[];
  exceptions: ExceptionEvent[];
  stoppedEvents: StoppedEvent[];  // ← This is what we need!
  exitCode?: number;
  terminated: boolean;
}

interface StoppedEvent {
  ts: number;
  reason: string;  // 'entry', 'step', 'breakpoint', 'exception', etc.
  threadId?: number;
  text?: string;
  hitBreakpointIds?: number[];
  allThreadsStopped?: boolean;
}

// Singleton access
DebugSessionCaptureService.instance.getSession(sessionId): CapturedSession | undefined
```

### Our New Implementation

**File:** `packages/extension/src/core/debug/debug-polling-helpers.js`
**Lines:** 11-81
**Function:** `waitForStoppedEventAndGetLocation()` (NEW VERSION)

**Approach:**
```javascript
// 1. Get the capture service instance
const captureService = DebugSessionCaptureService.instance;
const capturedSession = captureService.getSession(session.id);

// 2. Record how many stopped events existed BEFORE step
const initialStoppedCount = capturedSession.stoppedEvents.length;

// 3. Send the step operation
await stepOperation();

// 4. Poll until a NEW stopped event appears
while (Date.now() - startTime < timeoutMs) {
    const currentStoppedCount = capturedSession.stoppedEvents.length;

    if (currentStoppedCount > initialStoppedCount) {
        // New stopped event detected!
        const latestStoppedEvent = capturedSession.stoppedEvents[currentStoppedCount - 1];

        // NOW query stackTrace (state is fresh)
        const stackResponse = await session.customRequest('stackTrace', {
            threadId: latestStoppedEvent.threadId,
            startFrame: 0,
            levels: 1
        });

        return formatPausedLocation(session, stackResponse.stackFrames[0], ...);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
}
```

**Why This Should Work:**
- `DebugSessionCaptureService` uses `DebugAdapterTracker` (correct API)
- Captures ALL stopped events in real-time
- We poll the captured data (not the DAP directly)
- No race condition: stopped event is captured BEFORE we poll
- Simple counter-based detection: old count vs new count

---

## What We Need to Validate

### Current Debug Session State

**Extension Host:** Paused at breakpoint
**File:** `packages/extension/src/core/debug/debug-polling-helpers.js`
**Line:** 37
**Code:** `const capturedSession = captureService.getSession(session.id);`

**Debug Session Info:**
- **Type:** Dart test debug session
- **File:** `/workspaces/vsc-bridge-devcontainer/test/integration-simple/dart/test/debug_test.dart`
- **Test paused at:** Line 19 (after hitting initial breakpoint)
- **Session started:** 3 stopped events were captured during initialization
  - Event 1: reason `'entry'`, thread 1
  - Event 2: reason `'entry'`, thread 2 (Dart test isolate)
  - Event 3: reason `'breakpoint'`, thread 2 (test breakpoint hit)

### Critical Validation Steps

**Step 1: Verify capturedSession Exists**

At line 37, after stepping over, check:
```javascript
capturedSession !== undefined
```

**Expected:** Should be a `CapturedSession` object
**If undefined:** `DebugSessionCaptureService` doesn't have this session (CRITICAL FAILURE)

**Step 2: Verify Session Has Stopped Events**

At line 39 (after checking `capturedSession`), check:
```javascript
capturedSession.sessionId  // Should match current debug session ID
capturedSession.type       // Should be 'dart'
capturedSession.stoppedEvents.length  // Should be 3 (from initialization)
```

**Expected:** 3 stopped events captured before step operation
**If different:** Timing issue or wrong session

**Step 3: Record Initial Count**

At line 45, after stepping over:
```javascript
initialStoppedCount  // Should be 3
```

**Step 4: Send Step Operation**

At line 47, this sends `customRequest('next', { threadId })` to the Dart debug adapter.

**Expected:** Returns immediately (doesn't wait for step to complete)
**Effect:** Dart debugger starts stepping, will send stopped event when done

**Step 5: Poll for New Stopped Event**

At line 51-55, we loop waiting for:
```javascript
currentStoppedCount = capturedSession.stoppedEvents.length
currentStoppedCount > initialStoppedCount  // Waiting for 4 > 3
```

**Expected Timeline:**
1. Loop iteration 1: count still 3, wait 50ms
2. Loop iteration 2: count still 3, wait 50ms
3. (Dart step completes, sends stopped event)
4. Breakpoint at line 154 (debug-session-capture.ts) should fire
5. Loop iteration 3: count now 4, condition met!
6. Line 55: Get latest stopped event from array

**Step 6: Verify Stopped Event Data**

At line 56, check:
```javascript
latestStoppedEvent.reason    // Should be 'step'
latestStoppedEvent.threadId  // Should be 2 (Dart test thread)
latestStoppedEvent.ts        // Timestamp when step completed
```

**Step 7: Query Fresh Location**

Lines 59-63: Now query stackTrace with fresh state:
```javascript
stackResponse.stackFrames[0].line  // Should be 20 (next line after step)
stackResponse.stackFrames[0].source.path  // debug_test.dart
```

**Expected:** Line 20 (advanced from line 19)
**If line 19:** Step didn't work OR we queried too early (shouldn't happen with our approach)

---

## Build and Run Instructions

### Prerequisites

- VS Code with devcontainer open
- Extension Host running (debuggable instance)
- Dart SDK installed in devcontainer

### 1. Build the Extension

```bash
cd /workspaces/vsc-bridge-devcontainer
just build
```

**Expected output:**
```
✅ Full build complete!
```

**What this does:**
- Compiles TypeScript extension code
- Bundles with webpack
- Generates script manifest
- Builds CLI tool

**If build fails:**
- Check TypeScript errors in output
- Ensure all imports resolve correctly
- Verify webpack config is valid

### 2. Reload Extension Host

**Option A: Using MCP Tool**
```javascript
await mcp__vsc_bridge__util_restart_vscode();
```

**Option B: Manual**
- Press `Ctrl+Shift+P` in Extension Host window
- Type "Developer: Reload Window"
- Wait for reload to complete

### 3. Verify Extension is Active

```bash
cd /workspaces/vsc-bridge-devcontainer/test
vscb script run breakpoint.list
```

**Expected:**
```json
{
  "ok": true,
  "type": "success",
  "data": {
    "breakpoints": [...],
    "total": 0
  }
}
```

**If error:**
- Check bridge is running: `ls -la .vsc-bridge/`
- Verify extension activated: Check Extension Host output channel

### 4. Start Dart Debug Session

**From command line:**
```bash
cd /workspaces/vsc-bridge-devcontainer/test

vscb script run test.debug-single \
  --param path=/workspaces/vsc-bridge-devcontainer/test/integration-simple/dart/test/debug_test.dart \
  --param line=15
```

**Expected response:**
```json
{
  "ok": true,
  "type": "success",
  "data": {
    "event": "stopped",
    "file": ".../debug_test.dart",
    "line": 19,
    "functionName": "main.<anonymous closure>",
    "threadId": 2,
    "sessionId": "466730df-05ad-4401-8371-81f2b8011c92"
  }
}
```

**Key data:**
- `line: 19` - Paused at first executable line in test
- `threadId: 2` - Dart test isolate
- `sessionId` - Unique ID for this debug session

**What happened:**
- VS Code launched Dart test runner
- Debugger attached to test process
- Paused at line 19 (first line with `final x = 5;`)
- `DebugSessionCaptureService` captured 3 stopped events:
  1. Entry on main thread
  2. Entry on test isolate thread
  3. Breakpoint hit at line 19

### 5. Attempt Step-Over

```bash
vscb script run debug.step-over
```

**Expected (if our fix works):**
```json
{
  "ok": true,
  "type": "success",
  "data": {
    "event": "stopped",
    "file": ".../debug_test.dart",
    "line": 20,
    "functionName": "main.<anonymous closure>",
    "threadId": 2
  }
}
```

**Currently getting (before fix validation):**
```json
{
  "ok": false,
  "type": "error",
  "error": {
    "code": "E_INTERNAL",
    "message": "No captured session data found for session 466730df-..."
  }
}
```

---

## Debugging Using MCP Tools

### Setup: Dogfooding (Debugging the Extension Itself)

We use the vsc-bridge MCP tools to debug the Extension Host that's running our extension code.

**Key Concept:** There are TWO debug sessions:
1. **Inner session:** Dart test being debugged (in Extension Host workspace)
2. **Outer session:** Extension Host itself being debugged (via MCP tools)

We set breakpoints in the extension source code and debug how it handles the Dart test.

### Step-by-Step MCP Debugging

**1. Clear all breakpoints first:**
```javascript
await mcp__vsc_bridge__breakpoint_clear_project();
```

**2. Set breakpoints in extension code:**

```javascript
// Where we get the captured session
await mcp__vsc_bridge__breakpoint_set({
    path: '/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/debug/debug-polling-helpers.js',
    line: 37
});

// Where we record initial stopped count
await mcp__vsc_bridge__breakpoint_set({
    path: '/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/debug/debug-polling-helpers.js',
    line: 45
});

// Where we detect new stopped event
await mcp__vsc_bridge__breakpoint_set({
    path: '/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/debug/debug-polling-helpers.js',
    line: 55
});

// Where stopped events are captured
await mcp__vsc_bridge__breakpoint_set({
    path: '/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/debug/debug-session-capture.ts',
    line: 154
});
```

**3. Verify breakpoints set:**
```javascript
const result = await mcp__vsc_bridge__breakpoint_list();
console.log(result.data.breakpoints);
// Should show 4 breakpoints
```

**4. User starts Dart debug session manually**

The user runs:
```bash
vscb script run test.debug-single \
  --param path=/workspaces/vsc-bridge-devcontainer/test/integration-simple/dart/test/debug_test.dart \
  --param line=15
```

**Expected:** Breakpoint at line 154 (debug-session-capture.ts) will be hit 3 times as the Dart debugger starts up. These are initialization events, not the step event.

**Let these pass** - have the user continue the Extension Host until the Dart test is paused at line 19.

**5. User runs step-over command**

```bash
vscb script run debug.step-over
```

**Expected:** Extension Host hits breakpoint at line 37 (debug-polling-helpers.js)

**6. Inspect state at line 37**

After stepping over to line 39:
```javascript
await mcp__vsc_bridge__debug_step_over();
await mcp__vsc_bridge__debug_evaluate({ expression: 'capturedSession' });
```

**Critical check:**
```javascript
{
  result: "CapturedSession {sessionId: '466730df-...', type: 'dart', ...}"
}
```

**If undefined:**
- Session not in capture service
- Check: `captureService.getSession()` might have wrong session ID
- Check: Service might not be installed

**If defined:**
```javascript
await mcp__vsc_bridge__debug_evaluate({ expression: 'capturedSession.sessionId' });
await mcp__vsc_bridge__debug_evaluate({ expression: 'capturedSession.stoppedEvents.length' });
```

**Expected stoppedEvents.length:** 3

**7. Continue to line 45**

```javascript
await mcp__vsc_bridge__debug_continue();
// Should hit breakpoint at line 45
await mcp__vsc_bridge__debug_step_over();
await mcp__vsc_bridge__debug_evaluate({ expression: 'initialStoppedCount' });
```

**Expected:** `3`

**8. Continue to send step operation**

```javascript
await mcp__vsc_bridge__debug_continue();
// Extension sends 'next' DAP command to Dart debugger
// Dart debugger starts stepping
```

**9. Watch for stopped event capture**

The breakpoint at line 154 (debug-session-capture.ts) should fire when the Dart step completes.

```javascript
// When hit:
await mcp__vsc_bridge__debug_step_over();
await mcp__vsc_bridge__debug_evaluate({ expression: 'stoppedEvent.reason' });
await mcp__vsc_bridge__debug_evaluate({ expression: 'stoppedEvent.threadId' });
```

**Expected:**
- `reason: 'step'`
- `threadId: 2`

**10. Continue to polling loop**

```javascript
await mcp__vsc_bridge__debug_continue();
// Should hit line 51 multiple times as it polls
// Eventually hits line 55 when new stopped event detected
```

At line 55:
```javascript
await mcp__vsc_bridge__debug_evaluate({ expression: 'currentStoppedCount' });
await mcp__vsc_bridge__debug_evaluate({ expression: 'initialStoppedCount' });
await mcp__vsc_bridge__debug_evaluate({ expression: 'latestStoppedEvent' });
```

**Expected:**
- `currentStoppedCount: 4`
- `initialStoppedCount: 3`
- `latestStoppedEvent.reason: 'step'`

**11. Verify final location**

Continue to the stackTrace query:
```javascript
await mcp__vsc_bridge__debug_continue();
// After stackTrace query
await mcp__vsc_bridge__debug_evaluate({ expression: 'topFrame.line' });
await mcp__vsc_bridge__debug_evaluate({ expression: 'topFrame.source.path' });
```

**Expected:**
- `line: 20` (advanced from 19)
- `path: .../debug_test.dart`

---

## Important Debugging Notes

### Breakpoint Behavior

**CRITICAL:** Breakpoints execute BEFORE the line.

**Wrong approach:**
```javascript
// Set breakpoint on line 37
await mcp__vsc_bridge__breakpoint_set({ path: FILE, line: 37 });
// When hit, line 37 hasn't executed yet!
await mcp__vsc_bridge__debug_evaluate({ expression: 'capturedSession' });
// ❌ Returns undefined - variable not assigned yet
```

**Correct approach:**
```javascript
// Set breakpoint on line 37
await mcp__vsc_bridge__breakpoint_set({ path: FILE, line: 37 });
// Step over to execute line 37
await mcp__vsc_bridge__debug_step_over();
// NOW at line 39, line 37 has executed
await mcp__vsc_bridge__debug_evaluate({ expression: 'capturedSession' });
// ✅ Returns actual value
```

**Alternative:**
```javascript
// Set breakpoint on line AFTER the assignment
await mcp__vsc_bridge__breakpoint_set({ path: FILE, line: 39 });
// When hit, line 37 already executed
await mcp__vsc_bridge__debug_evaluate({ expression: 'capturedSession' });
// ✅ Returns actual value
```

### Invalid Breakpoint Locations

**Will NOT work:**
- Empty lines
- Comment-only lines
- Closing braces `}`
- Import/require statements (sometimes)

### Multiple Debug Sessions

**Remember:** When debugging startup, `DebugSessionCaptureService` may capture sessions from:
1. Pre-initialization (file discovery)
2. Actual debug session start

Check the session ID matches what you expect:
```javascript
// In step-over code
await mcp__vsc_bridge__debug_evaluate({ expression: 'session.id' });
// Compare with:
await mcp__vsc_bridge__debug_evaluate({ expression: 'capturedSession.sessionId' });
// Must match!
```

### Polling Loop Breakpoints

If you set a breakpoint inside the `while` loop (line 51), it will hit MANY times (every 50ms). This can be overwhelming.

**Better approach:**
- Set breakpoint at line 55 (inside the `if (currentStoppedCount > initialStoppedCount)`)
- This only fires ONCE when the new stopped event is detected

---

## Known Issues and Gotchas

### Issue #1: capturedSession is undefined

**Symptom:**
```javascript
capturedSession === undefined
```

**Possible causes:**

**A. Session ID mismatch**
```javascript
// Debug session ID
session.id = '466730df-05ad-4401-8371-81f2b8011c92'

// But capture service has different ID
captureService.getSession('22ab332c-997b-48d5-a855-9254b4281761')  // Wrong session!
```

**Solution:** Verify session IDs match

**B. DebugSessionCaptureService not installed**
```javascript
captureService.installed === false
```

**Solution:** Check extension activation in extension.ts:67

**C. Session started before extension activated**

If you start debugging before the extension is fully loaded, the tracker won't attach.

**Solution:** Restart debug session after extension is active

### Issue #2: Stopped event captured but count doesn't increase

**Symptom:**
- Breakpoint at line 154 (capture service) fires
- But `capturedSession.stoppedEvents.length` stays the same

**Possible cause:** Looking at wrong session

```javascript
// Check which session is being updated
await mcp__vsc_bridge__debug_evaluate({ expression: 'session.id' });
await mcp__vsc_bridge__debug_evaluate({ expression: 'sessionData.sessionId' });
```

### Issue #3: Step command returns old location (line 19 instead of line 20)

**Symptom:**
```json
{
  "ok": true,
  "data": {
    "line": 19  // Didn't advance!
  }
}
```

**Possible causes:**

**A. Step operation hasn't completed yet**
- Polling detected event too early
- Check timestamp of stopped event vs query time

**B. Querying wrong thread**
```javascript
stackTrace({ threadId: 1 })  // Wrong thread!
// Should be threadId: 2 (Dart test isolate)
```

**C. Step operation failed silently**
```javascript
// Check if DAP 'next' command succeeded
await session.customRequest('next', { threadId });
// Should not throw error
```

---

## File Reference

### Files Modified
- `packages/extension/src/core/debug/debug-polling-helpers.js` (lines 9, 11-81)
- `AGENTS-TEMPLATE.md` (added breakpoint debugging best practices)

### Files to Understand
- `packages/extension/src/core/debug/debug-session-capture.ts` - Event capture service
- `packages/extension/src/extension.ts` - Extension activation (line 67 installs capture service)
- `packages/extension/src/vsc-scripts/debug/step-over.js` - Step-over script that calls our helper
- `packages/extension/src/vsc-scripts/debug/step-into.js` - Needs same fix
- `packages/extension/src/vsc-scripts/debug/step-out.js` - Needs same fix
- `packages/extension/src/vsc-scripts/debug/continue.js` - Needs same fix

### Test Files
- `test/integration-simple/dart/test/debug_test.dart` - Dart test for validation

---

## Next Steps After Validation

If validation proves the approach works:

1. **Update remaining step scripts:**
   - `step-into.js` - Change to use `waitForStoppedEventAndGetLocation`
   - `step-out.js` - Change to use `waitForStoppedEventAndGetLocation`
   - `continue.js` - May need similar pattern

2. **Add error handling:**
   - What if `capturedSession` is undefined? Fall back to polling?
   - What if timeout occurs? Better error message?

3. **Test across languages:**
   - Python debugging
   - C# debugging
   - Java debugging
   - TypeScript debugging

4. **Performance optimization:**
   - Is 50ms poll interval optimal?
   - Should we use exponential backoff?

5. **Update documentation:**
   - Document the capture-query pattern
   - Update CLAUDE.md with findings
   - Add to AGENTS-TEMPLATE.md

---

## Critical Questions to Answer

1. **Does `capturedSession` exist?**
   Line 37 → Line 39, check if defined

2. **Does it have the correct session ID?**
   Compare `session.id` with `capturedSession.sessionId`

3. **Does it have 3 stopped events before step?**
   Line 45, verify `initialStoppedCount === 3`

4. **Does a 4th stopped event appear after step?**
   Line 51-55, verify `currentStoppedCount === 4`

5. **Is the stopped event reason 'step'?**
   Line 56, verify `latestStoppedEvent.reason === 'step'`

6. **Does stackTrace return the new location?**
   Line 59-63, verify `topFrame.line === 20`

7. **Does the final result return to the CLI correctly?**
   Line 72, verify `formatPausedLocation` returns expected structure

---

## Success Criteria

✅ **Implementation is successful if:**

1. `vscb script run debug.step-over` returns `ok: true`
2. Response shows `line: 20` (advanced from 19)
3. No timeout errors
4. Consistent behavior across multiple step operations
5. Works for step-into, step-out, continue with same pattern

❌ **Implementation has failed if:**

1. `capturedSession` is undefined
2. Timeout after 5 seconds
3. Returns same location (line 19)
4. Works once but fails on subsequent steps
5. Only works for some languages but not others

---

## Contact Points

- **Previous session summary:** See conversation archive
- **Research findings:** `docs/plans/19-dart-flutter-support/`
- **VS Code API reference:** DebugAdapterTracker documentation
- **Perplexity research:** Saved in conversation about DAP event detection

---

## Emergency Rollback

If this approach fails completely:

```bash
cd /workspaces/vsc-bridge-devcontainer
git checkout packages/extension/src/core/debug/debug-polling-helpers.js
just build
```

This reverts to the polling approach (which also has issues, but won't break existing functionality).

---

**End of Handover Document**

Next LLM Agent: Start by reading this document fully, then examine the Extension Host state at line 37. Good luck!
