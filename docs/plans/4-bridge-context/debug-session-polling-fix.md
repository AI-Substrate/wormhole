# Debug Session Polling Implementation

## Problem Statement
The `testing.debugAtCursor` VS Code command is **blocking** - it doesn't return until the debug session completes. This prevented our transactional CLI model from detecting breakpoint hits and returning immediately.

## Solution: Non-Blocking Execution with Polling

### The Issue Discovered
When debugging test execution, we found that `await vscode.commands.executeCommand('testing.debugAtCursor')` was blocking at line 152 in `polling-executor.ts`. The code would never proceed past that point until the entire debug session ended.

### Implementation Details

#### Phase 1: Pure Polling Approach
Moved from complex event-based detection with race conditions to a simple, robust polling approach.

| Task | Status | Description | Notes |
|------|--------|-------------|-------|
| 1.1 | [x] | Create polling-executor.ts | Implemented ultra-simple polling without session tracking [^54] |
| 1.2 | [x] | Remove complex Promise.race logic | Eliminated race conditions where errors could "win" [^55] |
| 1.3 | [x] | Implement waitForAnyPause() | Simple polling of activeDebugSession for paused threads [^56] |
| 1.4 | [x] | Update TestExecutor | Simplified to call debugTestAtCursorPolling() directly [^57] |

#### Phase 2: Fix Blocking Command Issue
The critical fix was executing the debug command without awaiting it.

| Task | Status | Description | Notes |
|------|--------|-------------|-------|
| 2.1 | [x] | Identify blocking issue | testing.debugAtCursor blocks until session ends [^58] |
| 2.2 | [x] | Implement non-blocking execution | Wrap in Promise.resolve() and don't await [^59] |
| 2.3 | [x] | Fix TypeScript compilation | Added explicit type annotation for error handler [^60] |
| 2.4 | [x] | Test and verify | Confirmed immediate return with breakpoint detection [^61] |

### Key Code Changes

#### Before (Blocking):
```typescript
// This would hang until debug session completed
await vscode.commands.executeCommand('testing.debugAtCursor');
```

#### After (Non-Blocking):
```typescript
// Execute without awaiting - runs in background
Promise.resolve(vscode.commands.executeCommand('testing.debugAtCursor'))
  .then(() => {
    console.log('[Polling] Debug command completed');
  })
  .catch((err: any) => {
    console.log('[Polling] Debug command error:', err);
  });

// Give the debug session a moment to start
await sleep(500);

// Immediately start polling for paused state
const debugResult = await waitForAnyPause({...});
```

### Testing Results

The fix was verified with the test script which now successfully:
1. Triggers debug command without blocking
2. Detects breakpoint hit through polling
3. Returns immediately with debug information

```json
{
  "status": "paused",
  "pauseReason": "breakpoint",
  "pauseLocation": {
    "name": "test_simple_multiplication",
    "source": "/Users/jordanknight/github/vsc-bridge/test/python/test_example.py",
    "line": 38
  }
}
```

### CLI JSON Output Configuration

Additionally, we updated the CLI to default to JSON output format for easier programmatic parsing:

| Task | Status | Description | Notes |
|------|--------|-------------|-------|
| 3.1 | [x] | Change default outputFormat in config schema | Changed from 'auto' to 'json' [^62] |
| 3.2 | [x] | Fix format override in script command | Use config setting when no --json flag [^63] |
| 3.3 | [x] | Rebuild and test CLI | Verified JSON output by default [^64] |

---

## Footnotes

[^54]: Created [`polling-executor.ts`](extension/src/core/testing/polling-executor.ts) – **Pure polling implementation** that checks vscode.debug.activeDebugSession without tracking specific sessions.

[^55]: Modified [`test-executor.ts:46-91`](extension/src/core/testing/test-executor.ts#L46) – **Removed Promise.race logic** and complex event-based detection, simplified to call polling directly.

[^56]: Implemented [`polling-executor.ts:8-106`](extension/src/core/testing/polling-executor.ts#L8) – **waitForAnyPause()** polls activeDebugSession and checks thread states via DAP customRequest.

[^57]: Modified [`test-executor.ts:67`](extension/src/core/testing/test-executor.ts#L67) – **Direct call** to debugTestAtCursorPolling() without complex promise orchestration.

[^58]: Discovered at [`polling-executor.ts:152`](extension/src/core/testing/polling-executor.ts#L152) – **Blocking behavior** of testing.debugAtCursor command prevents polling from starting.

[^59]: Fixed [`polling-executor.ts:151-160`](extension/src/core/testing/polling-executor.ts#L151) – **Non-blocking execution** using Promise.resolve() wrapper without await.

[^60]: Fixed [`polling-executor.ts:158`](extension/src/core/testing/polling-executor.ts#L158) – **TypeScript error** by adding explicit (err: any) type annotation.

[^61]: Tested with [`scratch/test-breakpoint.sh`](scratch/test-breakpoint.sh) – **Successful detection** of breakpoint at line 38 with immediate return.

[^62]: Modified [`cli/src/lib/config.ts:9`](cli/src/lib/config.ts#L9) – **Changed default** outputFormat from 'auto' to 'json' in ConfigSchema.

[^63]: Modified [`cli/src/commands/script.ts:330,393`](cli/src/commands/script.ts#L330) – **Respect config** by passing undefined instead of 'pretty' when no --json flag.

[^64]: Verified with `vscb script run bp.list` – **JSON output** now appears by default without --json flag.