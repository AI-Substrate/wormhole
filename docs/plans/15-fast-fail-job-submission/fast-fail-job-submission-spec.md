# Fast-Fail CLI Job Submission with Health Check and Pickup Acknowledgment

## Summary

The CLI currently submits jobs to the bridge and blindly waits up to 30 seconds for completion, with no ability to distinguish between "bridge is dead," "bridge is overloaded," or "job is slow." This feature adds two critical improvements:

1. **Pre-submission health check**: Verify the bridge is alive before submitting work, failing immediately (< 100ms) if the bridge is down
2. **Pickup acknowledgment**: Wait for explicit confirmation (max 5 seconds) that the bridge has claimed and started processing the job

This transforms the timeout model from a single 30-second wait into a two-phase approach: 5 seconds for pickup acknowledgment, then remaining time for execution. The result is faster failures, clearer error messages, and better operational visibility into bridge health and load.

## Goals

- **Fail fast when bridge is unavailable**: If the bridge extension is not running or has crashed, CLI commands fail in < 100ms instead of waiting 30 seconds
- **Clear error differentiation**: Developers can distinguish between three failure modes:
  - Bridge is dead/crashed (E_BRIDGE_UNAVAILABLE)
  - Bridge didn't pick up job within 5 seconds (E_PICKUP_TIMEOUT - suggests overload/capacity issues)
  - Job execution timed out (E_TIMEOUT - job is slow or hung)
- **Pickup visibility**: Developers receive confirmation when the bridge has claimed their job and begun processing it
- **Improved debugging**: Error messages include actionable troubleshooting guidance (check VS Code, check logs, check capacity)
- **Preserve total timeout budget**: Two-phase timeout (5s pickup + remaining execution) respects the original total timeout value (default 30s or user-specified)

## Non-Goals

- **Capacity checking in health check**: Health check only verifies the bridge is alive (host.json freshness), NOT whether it has capacity to accept jobs
- **Queue position visibility**: No indication of where a job sits in the queue or how many jobs are ahead of it
- **Retry logic**: If pickup times out, the CLI returns an error - it does NOT automatically retry with backoff
- **Bridge performance metrics**: No collection or reporting of bridge throughput, latency percentiles, or historical reliability
- **Multi-bridge support**: Assumes a single bridge per workspace; no load balancing across multiple bridge instances
- **Partial execution recovery**: If a job times out during execution, there's no mechanism to resume from a checkpoint
- **Custom health check strategies**: Health check logic is fixed (host.json mtime check); users cannot provide custom health validation
- **Opt-out of pickup acknowledgment**: No `--no-pickup-ack` flag; pickup acknowledgment is always enforced for consistent behavior
- **Configurable pickup timeout**: Pickup timeout is hardcoded to 5 seconds; no CLI flags or config file options to override
- **Metrics collection**: No collection of pickup latency metrics (p50, p95, p99); KISS principle - verbose logging provides sufficient visibility

## Acceptance Criteria

### AC1: Pre-Submission Health Check - Bridge Unavailable

**Given** the VS Code extension is not running (no bridge process)
**When** a user runs any `vscb` command
**Then** the CLI performs a health check before writing the job
**And** the health check fails (no host.json or stale host.json)
**And** the CLI returns an `E_BRIDGE_UNAVAILABLE` error in < 100ms
**And** the error message includes: "Bridge is unavailable (extension not running or crashed). Check that VS Code is open with vsc-bridge extension active."

### AC2: Pre-Submission Health Check - Bridge Healthy

**Given** the VS Code extension is running and healthy (host.json < 30s old)
**When** a user runs any `vscb` command
**Then** the health check succeeds
**And** the CLI proceeds to submit the job
**And** no health-related error is returned

### AC3: Pickup Acknowledgment - Fast Claim

**Given** the bridge is healthy and has capacity
**When** the CLI submits a job
**Then** the bridge creates `claimed.json` within the job directory
**And** the CLI detects `claimed.json` within 500ms (typical case)
**And** the CLI transitions to the execution phase (waiting for `done` marker)
**And** no pickup timeout error is returned

### AC4: Pickup Acknowledgment - Timeout

**Given** the bridge is healthy but does NOT claim the job (overloaded, capacity limit, etc.)
**When** the CLI submits a job
**Then** the CLI waits up to 5 seconds for `claimed.json` to appear
**And** if `claimed.json` does not appear within 5 seconds
**Then** the CLI returns an `E_PICKUP_TIMEOUT` error
**And** the error message includes: "Bridge did not pick up job within 5 seconds (might be overloaded or at capacity). Check bridge logs and capacity settings."

### AC5: Two-Phase Timeout - Pickup Fast, Execution Slow

**Given** a total timeout of 30 seconds (default)
**And** pickup timeout of 5 seconds (default)
**When** the bridge claims the job in 200ms (fast pickup)
**Then** the CLI waits for `done` marker with 29.8 seconds remaining (total - pickup duration)
**And** if execution takes 35 seconds total
**Then** the CLI returns an `E_TIMEOUT` error after 30 seconds total elapsed time
**And** the error indicates execution timeout, NOT pickup timeout

### AC6: Two-Phase Timeout - Pickup Slow, Execution Fast

**Given** a total timeout of 30 seconds (default)
**And** pickup timeout of 5 seconds (default)
**When** the bridge claims the job in 4.9 seconds (slow pickup, just under limit)
**Then** the CLI waits for `done` marker with 25.1 seconds remaining
**And** if execution completes in 10 seconds
**Then** the CLI returns the successful result (no timeout)
**And** total elapsed time is ~15 seconds (4.9 + 10)

### AC7: Error Message Clarity - Bridge Unavailable

**When** the CLI returns `E_BRIDGE_UNAVAILABLE`
**Then** the error output includes:
- Clear description: "Bridge is unavailable"
- Reason: "Extension not running, crashed, or not installed"
- Diagnostic detail: host.json age (if stale) or "not found"
- Actionable guidance: "Check that VS Code is open with vsc-bridge extension installed and active. Installation instructions: [TBD]"

### AC8: Error Message Clarity - Pickup Timeout

**When** the CLI returns `E_PICKUP_TIMEOUT`
**Then** the error output includes:
- Clear description: "Bridge did not pick up job within 5 seconds"
- Possible reasons: "Bridge might be overloaded, at capacity, crashed, or not installed"
- Actionable guidance: "Check that VS Code is running with vsc-bridge extension installed. If extension crashed, try restarting VS Code. Check bridge logs and capacity settings (MAX_CONCURRENT). Installation instructions: [TBD]"

### AC9: Backward Compatibility - Existing Behavior Preserved

**Given** all health checks pass and pickup is fast
**When** a user runs a `vscb` command
**Then** the overall job execution behavior is unchanged from the current system
**And** job completion, error handling, and response parsing work exactly as before
**And** only the pre-checks and pickup phase are new additions

### AC10: Total Timeout Still Respected

**Given** any combination of pickup timeout and execution timeout values
**When** the CLI runs a job
**Then** the sum of pickup wait time + execution wait time ≤ total timeout
**And** if total timeout is reached at ANY point (during pickup or execution), the CLI returns a timeout error
**And** the total timeout acts as an absolute deadline for the entire job lifecycle

### AC11: Verbose Logging - Pickup Duration

**Given** the user runs a `vscb` command with verbose/debug flag enabled
**When** the bridge claims the job
**Then** the CLI logs the pickup duration in milliseconds
**And** the log message format is: `[DEBUG] Job claimed in <duration>ms`
**And** this provides visibility into bridge responsiveness for debugging

## Risks & Assumptions

### Risks

1. **False negatives from health check**: If the bridge crashes immediately after the health check passes but before job submission, the CLI will submit a job that won't be picked up. This results in a pickup timeout (5s) instead of immediate failure.
   - **Mitigation**: The 5-second pickup timeout catches this case quickly; not as fast as < 100ms but still much better than 30s

2. **Race condition between health check and submission**: Time-of-check-time-of-use (TOCTOU) race - bridge could die between health check and job write.
   - **Mitigation**: Pickup timeout provides safety net; this is an acceptable tradeoff for improved UX in the common case

3. **Filesystem latency on remote workspaces**: In SSH/Codespaces scenarios, filesystem operations might be slower, causing `claimed.json` writes to appear delayed even though the bridge claimed the job quickly.
   - **Mitigation**: 5-second pickup timeout provides buffer; users on slow connections can increase via `--pickup-timeout` flag

4. **Confusion between E_PICKUP_TIMEOUT and E_TIMEOUT**: Developers might not understand the distinction between "bridge didn't claim job" vs "job execution timed out."
   - **Mitigation**: Clear error messages with actionable guidance; documentation explaining the two-phase model

5. **Bridge watcher delay**: If the filesystem watcher has lag, the bridge might not detect `command.json` immediately, causing spurious pickup timeouts.
   - **Mitigation**: The 2-second safety scanner provides fallback; 5s pickup timeout is generous for normal watcher latency (< 100ms typical)

### Assumptions

1. **host.json freshness is reliable health indicator**: We assume that if host.json was updated within the last 30 seconds, the bridge is alive and processing jobs. This relies on the bridge's 5-second heartbeat working correctly.

2. **claimed.json creation is atomic**: We assume the bridge's atomic write pattern (temp file + rename) ensures `claimed.json` either exists fully or not at all - no partial reads.

3. **Pickup timeout of 5 seconds is sufficient**: We assume that in normal operation, the bridge will claim jobs in < 500ms (watcher fires immediately + claim attempt). The 5-second timeout provides 10x headroom for edge cases.

4. **Default 30-second total timeout is still appropriate**: We assume existing timeout behavior is correct for job execution; we're only adding pre-checks and pickup acknowledgment.

5. **Single bridge per workspace**: We assume there's only one bridge process per workspace (enforced by host.lock), so health check and pickup apply to a single target.

6. **Filesystem polling is acceptable**: We assume polling for `claimed.json` every 50ms (150ms on WSL) is acceptable overhead, consistent with current `done` polling behavior.

## Testing Strategy

**Approach**: Hybrid (E)

**Rationale**: Integrate with existing unit tests from bridge resilience project (Plan 14). No new test files needed; extend existing test suites to cover new error codes and timing behavior.

**Focus Areas**:
- CLI-side health check logic (unit tests in CLI package)
- Pickup acknowledgment polling (extend existing fs-bridge tests)
- Two-phase timeout calculation (unit tests)
- Error code normalization (E_BRIDGE_UNAVAILABLE, E_PICKUP_TIMEOUT)

**Excluded**:
- No new integration tests (rely on existing integration test infrastructure)
- No end-to-end tests (covered by existing E2E suite)

**Mock Usage**: Targeted mocks for filesystem operations (use NodeFilesystem abstraction from bridge resilience tests)

**Test Files to Extend**:
- `packages/cli/test/fs-bridge.test.ts` (if exists, or create minimal unit tests for health check)
- `packages/extension/test/core/fs-bridge/processor.test.ts` (extend for timing scenarios)

## Documentation Strategy

**Location**: No new documentation (D)

**Rationale**: This is an internal improvement to CLI error handling and timing behavior. No user-facing documentation updates needed.

**Target Audience**: N/A

**Maintenance**: N/A

## Clarifications

### Session 2025-01-18

**Q1: Should we add a `--no-pickup-ack` flag to skip pickup acknowledgment and behave like the old system?**
- **Answer**: No (B)
- **Rationale**: Always enforce pickup acknowledgment. Simpler implementation, enforces new behavior consistently. No escape hatch needed.
- **Impact**: Non-Goals updated to exclude this flag.

**Q2: Should pickup timeout be configurable globally (config file) or only via CLI flag?**
- **Answer**: Hardcoded (no configuration)
- **Rationale**: Use hardcoded 5-second default. Applies to both CLI and MCP server. Simplest implementation, no flags or config needed.
- **Impact**: AC7 (Configurable Pickup Timeout) removed; Non-Goals updated; Goals updated to remove "configurable timeouts"

**Q3: Should the health check verify the bridge PID is still running (process.kill(pid, 0))?**
- **Answer**: No (B)
- **Rationale**: Use the exact same health check as `vscb status` - host.json mtime only. No PID verification, no additional logic.
- **Impact**: Health check implementation uses existing `checkBridgeHealth()` function unchanged.

**Q4: Should E_PICKUP_TIMEOUT suggest specific remediation actions based on bridge state?**
- **Answer**: No (B) - Generic message only
- **Rationale**: Keep error message simple. Bridge might not even be installed, or might have crashed. Error should include generic troubleshooting: check VS Code is running, try restarting VS Code if crashed, check extension is installed (installation instructions TBD).
- **Impact**: AC8 (Error Message Clarity - Pickup Timeout) updated to include installation guidance and restart suggestion; AC7 (Bridge Unavailable) updated similarly.

**Q5: Should the CLI log/display the pickup phase duration in verbose mode?**
- **Answer**: Yes (A)
- **Rationale**: Display pickup duration in verbose/debug mode. Helps developers understand bridge responsiveness and debug watcher latency issues.
- **Impact**: New AC11 added for verbose logging behavior; implementation must track pickup start/end times and respect CLI verbose flag.

**Q6: What should happen if claimed.json exists but done never appears (bridge crashes mid-job)?**
- **Answer**: Current behavior (A) - Wait until execution timeout, return E_TIMEOUT
- **Rationale**: Keep it simple. No stale claim detection. If bridge crashes mid-job, existing timeout mechanisms handle it.
- **Impact**: No additional complexity for stale claim detection.

**Q7: Should we add metrics collection for pickup latency?**
- **Answer**: No (B) - KISS
- **Rationale**: No metrics collection. Keep implementation simple. Verbose logging (Q5) provides enough visibility for debugging.
- **Impact**: Non-Goals updated to exclude metrics collection.

**Q8: Should health check also validate .vsc-bridge directory structure (execute/, host.json present)?**
- **Answer**: No (B) - mtime only
- **Rationale**: Only check host.json mtime, matching `vscb status` behavior. Faster, simpler, no additional filesystem operations.
- **Impact**: Health check remains simple and fast; relies on existing `checkBridgeHealth()` function.

## Clarification Summary

**Session**: 2025-01-18
**Questions Asked**: 8/8

| # | Question | Answer | Impact |
|---|----------|--------|--------|
| Q1 | Add `--no-pickup-ack` flag? | No (B) | Always enforce pickup ack; Non-Goals updated |
| Q2 | Configurable pickup timeout? | Hardcoded 5s | No flags/config; AC7 removed; applies to CLI + MCP |
| Q3 | Verify bridge PID? | No (B) | Use existing `checkBridgeHealth()` unchanged |
| Q4 | Enhanced error messages? | No (B) | Generic messages with install/restart guidance |
| Q5 | Verbose pickup logging? | Yes (A) | AC11 added; track pickup duration |
| Q6 | Detect stale claims? | No (A) | Keep current timeout behavior |
| Q7 | Collect metrics? | No (B) | KISS - verbose logging sufficient |
| Q8 | Validate directory structure? | No (B) | mtime check only, same as `vscb status` |

**Coverage**:
- ✅ **Resolved**: All 8 open questions answered
- ✅ **Testing Strategy**: Hybrid - integrate with existing bridge resilience tests
- ✅ **Documentation Strategy**: No new documentation needed
- ✅ **Outstanding**: None
