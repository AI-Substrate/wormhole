# Bridge Resilience & Self-Healing Job Queue

## Summary

The filesystem bridge currently experiences reliability issues where jobs hang, fail to process, or affect subsequent jobs. Users encounter situations where the extension must be restarted, debugging workflows are interrupted, and commands fail unpredictably. This feature will make the bridge system resilient, self-healing, and capable of handling failures gracefully without requiring manual intervention.

**User Value**: Developers using VSC-Bridge will experience reliable, fast command execution with automatic recovery from failures, eliminating the need for manual restarts and ensuring debugging workflows proceed smoothly even under load or in failure scenarios.

## Goals

- **Eliminate system hangs** that currently require manual extension restart
- **Prevent job isolation failures** where one failing job blocks or corrupts subsequent jobs
- **Enable concurrent job processing** to remove single-threaded bottlenecks and improve throughput
- **Provide automatic detection** of crashed jobs and failed jobs with immediate DLQ quarantine
- **Ensure data integrity** by preventing race conditions that can corrupt job state or results
- **Support LLM usage patterns** with simple queue management (optimized for 1-2 requests per 10 seconds)
- **Maintain backward compatibility** with existing CLI and MCP clients (no wire format changes)
- **Enable observability** of queue health, job states, and failure patterns for debugging

## Non-Goals

- Distributed multi-host job processing (remains single Extension Host)
- Replacing filesystem-based IPC with network protocols (HTTP/WebSocket)
- Changing the client-visible contract (command.json, response.json, done marker remain the same)
- Adding authentication or authorization to the bridge (remains trust-based)
- Supporting job priorities in the initial implementation (can be added later)
- Real-time streaming of job progress to clients (events.ndjson remains file-based)

## Acceptance Criteria

### 1. Job Isolation & Fault Tolerance
**Given** multiple jobs are submitted to the bridge
**When** one job throws an unhandled exception or hangs
**Then** other jobs continue processing without interruption and the failing job is quarantined

**Observable**: Submit 10 jobs where job #5 throws an error; verify jobs 1-4, 6-10 all complete successfully and return results.

### 2. Concurrent Processing
**Given** N jobs are submitted simultaneously (where N > 1)
**When** job execution capacity is available
**Then** multiple jobs process concurrently up to the configured concurrency limit

**Observable**: Submit 5 jobs concurrently; monitor timestamps showing overlapping execution times rather than sequential processing.

### 3. Failed Job Quarantine
**Given** a job fails during processing (exception, timeout, or job crash)
**When** the failure is detected
**Then** the job is immediately moved to DLQ without retry attempts

**Observable**: Submit a job that throws an exception; verify it's quarantined in DLQ immediately with no retry attempts.

### 4. Race Condition Prevention
**Given** two concurrent attempts to claim the same job simultaneously
**When** both use atomic file operations
**Then** exactly one claim attempt succeeds in claiming the job and processing it

**Observable**: Simulate concurrent claim attempts; verify only one `claimed.json` exists and only one `response.json` is written.

### 5. Job Crash Detection
**Given** the extension process crashes while processing a job
**When** the extension restarts and scans for incomplete jobs
**Then** crashed jobs are immediately moved to DLQ without reprocessing

**Observable**: Kill extension process mid-job; restart; verify the job is in DLQ, not reprocessed.

### 6. Concurrency Control
**Given** 8 jobs are actively executing
**When** new jobs arrive
**Then** jobs queue and execute when execution slots become available (unbounded queue, suitable for LLM usage patterns)

**Observable**: Submit 20 jobs with 8 concurrent execution slots; verify first 8 execute immediately, remaining 12 queue and execute as slots complete.

### 7. Dead Letter Queue (DLQ)
**Given** a job fails during processing
**When** the failure is detected (exception, timeout, crash)
**Then** the job is immediately moved to DLQ with failure reason (no retries)

**Observable**: Submit a job that throws an error; verify it's immediately quarantined in DLQ with a `dlq` marker file.

### 8. Circuit Breaker Protection
**Given** 10 jobs fail within a 60-second window (global threshold)
**When** the circuit opens
**Then** all new jobs fail fast without execution until the cooldown period expires

**Observable**: Submit 10 failing jobs within 60s; verify the circuit opens and subsequent jobs immediately return circuit-open errors.

### 9. File Watcher Reliability
**Given** file watcher events are missed or delayed (common on WSL)
**When** periodic scanning detects unclaimed jobs
**Then** jobs are picked up and processed within the scan interval

**Observable**: Disable file watcher; submit job; verify it's processed within 2 seconds via periodic scan.

### 10. EventWriter Robustness
**Given** an EventWriter encounters a write error or stream closure
**When** subsequent events are written
**Then** errors are surfaced and the job fails gracefully without hanging

**Observable**: Simulate disk full scenario; verify job completes with error.json and no hung event stream.

### 11. Graceful Shutdown
**Given** the extension is deactivating with jobs in progress
**When** shutdown is initiated
**Then** in-flight jobs complete or timeout, and no jobs are left in corrupted state

**Observable**: Stop extension while jobs are running; verify all jobs have either `done` or can be recovered on next startup.

### 12. Cross-Platform Consistency
**Given** the bridge runs on Windows, macOS, Linux, and WSL
**When** jobs are submitted on each platform
**Then** behavior is consistent and all acceptance criteria pass on all platforms

**Observable**: Run integration test suite on all supported platforms; verify 100% pass rate.

## Risks & Assumptions

### Risks

1. **Performance Impact**: Adding concurrency control and job execution coordination may add latency to job processing
   - *Mitigation*: Profile hot paths and optimize; use async I/O throughout; 8 concurrent jobs should provide sufficient parallelism

2. **Platform-Specific Bugs**: Filesystem behavior differs across Windows/macOS/Linux/WSL, especially for file locking and mtime precision
   - *Mitigation*: Extensive cross-platform testing; use platform-specific polling intervals

3. **Migration Complexity**: Transitioning to concurrent job execution and removing retry logic requires careful coordination
   - *Mitigation*: Additive changes only; new mechanisms can coexist with current single-threaded processing during rollout

4. **Race Windows**: Filesystem operations are never truly atomic across all layers; small race windows may remain
   - *Mitigation*: Use atomic O_EXCL file creation for claims; accept that edge cases may occur but will be quarantined in DLQ

5. **WSL Performance**: Filesystem operations on WSL are 2-3x slower than native, which could impact responsiveness
   - *Mitigation*: Platform-specific polling intervals; optimize scan algorithms to minimize stat() calls

### Assumptions

1. **Single Extension Host**: Only one VS Code extension instance controls the bridge per workspace (multi-instance coordination is out of scope)

2. **Filesystem Reliability**: The underlying filesystem provides atomic rename within the same directory and preserves mtime with reasonable precision (1s or better)

3. **Clock Monotonicity**: System clock is monotonic for lease expiration checks; clock skew between reads is negligible (< 1s)

4. **Concurrency Limit**: 8 concurrent jobs is sufficient for typical debugging workloads and high-concurrency scenarios

5. **No Automatic Recovery**: Jobs that fail are permanently dead and should be quarantined in DLQ for manual investigation

6. **Client Behavior**: CLI and MCP clients correctly implement polling with exponential backoff and handle timeout errors

7. **Disk Space**: Sufficient disk space exists for job directories, event logs, and DLQ (garbage collection runs periodically)

## Open Questions

1. **Concurrency Limit**: ✅ **RESOLVED** - Fixed at 8 concurrent jobs (not configurable)
   - *Decision*: Operations are fast; 8 concurrent jobs provides headroom without complexity of configuration

2. **Lease Duration**: ✅ **RESOLVED** - No automatic recovery/retries; failed jobs go to DLQ immediately
   - *Decision*: Jobs never take long enough to warrant recovery timeouts; if a job fails, it's dead and should be quarantined in DLQ for investigation

3. **DLQ Retention**: ✅ **RESOLVED** - 7 days retention with VS Code Output panel warnings
   - *Decision*: Balances disk space with investigation time; non-intrusive notification via Output panel

4. **Circuit Breaker Tuning**: ✅ **RESOLVED** - 10 failures in 60s, global (all scripts)
   - *Decision*: Global circuit provides simpler implementation and broad protection against systemic issues

5. **Observability**: Should queue health metrics be exposed to users via VS Code status bar or dedicated panel?
   - *Proposed*: Add status bar item showing queue depth and health; expose detailed metrics via command

6. **Backwards Compatibility**: Do we need a feature flag to enable/disable the new resilience mechanisms during rollout?
   - *Proposed*: No flag; changes are additive and don't break existing clients

7. **Event Stream Backpressure**: How should we handle slow event consumers? Drop events, block, or buffer?
   - *Proposed*: Respect backpressure and block writer; fail job if buffer fills completely

8. **Scan Interval**: ✅ **RESOLVED** - 2000ms (2 seconds) on all platforms
   - *Decision*: File watcher is primary mechanism; 2s scan is sufficient as safety net with minimal CPU impact

## Testing Strategy

**Approach**: Full TDD (Test-Driven Development)

**Rationale**: This feature involves critical race conditions, cross-platform filesystem operations, complex failure recovery mechanisms, and concurrency patterns. The risk of subtle bugs causing data corruption or system hangs is extremely high, making comprehensive test coverage essential.

**Focus Areas**:
- **Race condition scenarios**: Concurrent claim attempts, atomic file operations
- **Failure detection & DLQ**: Exception handling, crash detection on restart, immediate quarantine (no retries)
- **Concurrency**: Concurrent job execution behavior (8 jobs), queue management, concurrent execution
- **Platform-specific**: Windows/macOS/Linux/WSL filesystem semantics, atomic operations, scan timing
- **Circuit breaker**: Global failure threshold (10 failures in 60s), cooldown periods, fail-fast behavior
- **EventWriter**: Stream error handling, backpressure respect, graceful closure
- **Integration scenarios**: Full job lifecycle from submission through completion/failure/DLQ

**Excluded**: None - given the critical nature of this infrastructure, all components require thorough testing.

**Mock Usage**: Targeted mocks for external systems and slow dependencies only

**Mock Policy Rationale**: Filesystem semantics (atomic operations, race conditions, mtime behavior) must be tested with real operations to catch platform-specific bugs. Mock only VS Code APIs that are slow or require UI interaction (FileSystemWatcher events, extension context), and allow timer/clock control for lease expiration testing.

## Documentation Strategy

**Location**: Package-local documentation (co-located with code in `packages/extension/src/core/fs-bridge/`)

**Rationale**: The bridge system is being extracted as a standalone component for reuse by other systems. Documentation should live alongside the code to facilitate extraction and remain self-contained.

**Content Structure**:
- **`README.md`** in `fs-bridge/` directory: Architecture overview, queue design, state machine, job lifecycle
- **`CONTRIBUTING.md`**: Testing strategy, how to add new features, debugging techniques
- **`TROUBLESHOOTING.md`**: Common failure scenarios, recovery procedures, diagnostics
- **Inline JSDoc**: API documentation for public interfaces (job execution, EventWriter, etc.)

**Target Audience**:
- Developers extracting/reusing the bridge component in other projects
- Future maintainers of the fs-bridge module
- Contributors debugging bridge failures or adding resilience features

**Maintenance**: Update docs inline with code changes; treat documentation as part of the PR acceptance criteria.

---

## Clarifications

### Session 2025-01-15

**Q1: Testing Strategy**
- **Question**: What testing approach best fits this feature's complexity and risk profile?
- **Answer**: A (Full TDD)
- **Rationale**: User selected comprehensive testing approach due to critical race conditions, cross-platform requirements, and high risk of data corruption/hangs.

**Q2: Mock/Stub Usage Policy**
- **Question**: How should mocks/stubs/fakes be used during implementation?
- **Answer**: B (Allow targeted mocks)
- **Rationale**: User chose to test filesystem semantics with real operations to catch platform-specific bugs, while mocking only slow/external dependencies (VS Code APIs, timers).

**Q3: Documentation Strategy**
- **Question**: Where should this feature's documentation live?
- **Answer**: Package-local (co-located with code in `packages/extension/src/core/fs-bridge/`)
- **Rationale**: Bridge system is being extracted as a standalone component for reuse; documentation must remain self-contained and travel with the code. Will include README.md, CONTRIBUTING.md, TROUBLESHOOTING.md, and inline JSDoc.

**Q4: Concurrency Limit & Configuration**
- **Question**: What should be the default concurrency limit and how should it be configured?
- **Answer**: Fixed at 8 concurrent jobs (not configurable)
- **Rationale**: Operations are fast and concurrency needs are predictable; 8 concurrent jobs provides sufficient headroom without configuration complexity.

**Q5: Circuit Breaker Thresholds**
- **Question**: What failure threshold should trigger the circuit breaker, and should it be per-script or global?
- **Answer**: C (10 failures in 60s, global across all scripts)
- **Rationale**: Global circuit breaker provides simpler implementation and broader protection against systemic issues affecting the entire queue.

**Q6: DLQ Retention & User Notification**
- **Question**: How long should DLQ jobs be retained, and how should users be notified?
- **Answer**: A (7 days retention with VS Code Output panel warnings)
- **Rationale**: Balances disk space management with sufficient time for investigation; non-intrusive warnings avoid notification fatigue.

**Q7: Lease Duration & Recovery Strategy**
- **Question**: What should be the lease timeout and grace period for job recovery?
- **Answer**: No automatic recovery - failed jobs go to DLQ immediately (no retries)
- **Rationale**: Jobs execute quickly; failures indicate real problems that warrant investigation, not automatic retry. Simplifies implementation by removing lease renewal, cooperative revoke, and fencing token complexity.

**Q8: Scan Interval for Job Discovery**
- **Question**: What should be the periodic scan interval for detecting unclaimed jobs?
- **Answer**: D (2000ms / 2 seconds on all platforms)
- **Rationale**: File watcher is the primary mechanism; 2-second scan serves as safety net with minimal CPU impact.

---

## Clarification Coverage Summary

### ✅ Resolved (8 questions)

| Topic | Decision | Impact |
|-------|----------|--------|
| Testing Strategy | Full TDD | Comprehensive test coverage required due to critical race conditions and cross-platform complexity |
| Mock Usage | Targeted mocks only | Real filesystem operations for accuracy; mock only VS Code APIs and timers |
| Documentation | Package-local (fs-bridge/) | Co-located with code for extraction as standalone component |
| Concurrency Limit | 8 concurrent jobs (fixed) | Sufficient concurrency without configuration complexity |
| Circuit Breaker | 10 failures/60s (global) | Simple implementation with broad systemic protection |
| DLQ Retention | 7 days + Output warnings | Balances investigation time with disk space |
| Recovery Strategy | **No retries/recovery** | **Major simplification**: Failed jobs → DLQ immediately; removes lease renewal, fencing tokens, cooperative revoke |
| Scan Interval | 2000ms (all platforms) | Minimal CPU; watcher is primary mechanism |

### 🟡 Deferred (3 questions)

| Topic | Status | Notes |
|-------|--------|-------|
| Observability | Proposed in spec | Add status bar + metrics command (implement during architecture phase) |
| Backwards Compatibility | Proposed in spec | No feature flag needed; changes are additive |
| Event Stream Backpressure | Proposed in spec | Block on backpressure; fail if buffer fills (implement during architecture phase) |

### 📊 Key Insights

1. **Major Simplification**: Eliminating automatic recovery/retries removes significant complexity:
   - ❌ No lease renewal/heartbeat files
   - ❌ No cooperative revoke protocol
   - ❌ No fencing tokens
   - ❌ No stale job detection via lease renewal
   - ✅ Simpler: Failed jobs go directly to DLQ

2. **Architecture Impact**: The research recommendations included lease/heartbeat/fencing mechanisms, but user clarification revealed these aren't needed for this use case. Focus shifts to:
   - Concurrent job execution (8 concurrent jobs)
   - Atomic claim operations (O_EXCL)
   - Circuit breaker (global, 10/60s)
   - DLQ quarantine (7-day retention)

3. **Testing Impact**: Full TDD with real filesystem operations ensures cross-platform correctness without complex failure recovery scenarios.

---

**Next Steps**: Run `/plan-3-architect` to generate phase-based implementation plan reflecting the simplified no-retry architecture.
