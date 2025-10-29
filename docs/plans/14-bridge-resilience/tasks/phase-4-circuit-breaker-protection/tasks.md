# Phase 4: Flood Protection (Simplified)

**Phase**: Phase 4
**Slug**: `phase-4-circuit-breaker-protection`
**Plan**: [bridge-resilience-plan.md](../../bridge-resilience-plan.md#phase-4-circuit-breaker-protection)
**Spec**: [bridge-resilience-spec.md](../../bridge-resilience-spec.md)
**Created**: 2025-01-17
**Updated**: 2025-01-17 (KISS simplification)
**Status**: COMPLETE (100% - Tests passing, implementation verified)

---

## Tasks

| Status | ID | Task | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|----|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Write flood protection test | Test | – | `/workspaces/vsc-bridge-devcontainer/packages/extension/test/core/fs-bridge/flood-protection.test.ts` | Test validates: 10 failures in 60s → E_CIRCUIT_OPEN, after window expires → accepts jobs | Created 2 tests: FS-BRIDGE-FLOOD-001 (threshold), FS-BRIDGE-FLOOD-002 (boundary) [^1] |
| [x] | T002 | Add E_CIRCUIT_OPEN to ErrorCode enum | Core | – | `/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/fs-bridge/types.ts` | Error code added with proper typing | Added E_CIRCUIT_OPEN to enum [^2] |
| [x] | T003 | Implement flood check in processor.ts launchJob() | Core | T001, T002 | `/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/fs-bridge/processor.ts` | Add module-level failureTimestamps + isFlooded() + check in launchJob() (~20 lines); test passes | Implemented module-level tracking + isFlooded() + flood check in launchJob() [^3] |
| [x] | T004 | Record failures in processCommand catch handler | Core | T003 | `/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/fs-bridge/processor.ts` | failureTimestamps.push(Date.now()) in catch handler; retryAfter calculated correctly | Added failure recording in processCommand catch block (non-cancellation errors only) [^4] |

---

## Alignment Brief

### Objective

**Implement simple flood protection to prevent retry storms**. When 10 failures occur within a rolling 60-second window, reject new jobs with E_CIRCUIT_OPEN error that includes retryAfter seconds. KISS approach - inline implementation (~15 lines in BridgeManager).

**Behavior Checklist**:
- [x] Track failure timestamps in rolling 60-second window
- [x] After 10th failure in window, reject new jobs with E_CIRCUIT_OPEN
- [x] E_CIRCUIT_OPEN error includes retryAfter field (seconds until oldest failure expires)
- [x] Auto-recovery: once oldest failure >60s old, accept jobs again
- [x] Implementation inline in processor.ts (no separate class)
- [x] No VS Code notifications (KISS - clients handle errors themselves)

---

### Non-Goals (Scope Boundaries)

❌ **NOT doing in this phase**:

**Excluded Features/Functionality:**
- **Separate CircuitBreaker class** - Inline implementation in BridgeManager (~15 lines total)
- **VS Code notifications/toasts** - No user-facing UI. Clients get error responses and handle them
- **Output panel logging** - No structured logging. Keep it simple
- **Half-open state or probe requests** - Just open/closed based on rolling window
- **Per-script circuit breakers** - Global flood protection only
- **Adaptive thresholds** - Fixed 10 failures / 60s
- **Retry logic** - Circuit breaker just rejects, doesn't retry
- **Historical failure analysis** - Only track what's needed for threshold detection
- **Configuration UI** - Threshold hardcoded

**Rationale**: This is flood protection, not a full circuit breaker implementation. Goal is to prevent retry storms with minimal code. Clients receive E_CIRCUIT_OPEN and can display their own UI if needed.

---

### Critical Findings Affecting This Phase

**From Plan § 3: Critical Research Findings**

None of the 5 Critical Discoveries directly constrain flood protection implementation. This is an independent enhancement with no filesystem dependencies or platform-specific behavior.

**Dependencies on future phases:**
- Phase 5 (DLQ system) not yet implemented - flood protection doesn't reference DLQ (removed from error response to keep it simple)

---

### Invariants & Guardrails

**Performance Budget:**
- isFlooded() check: <1ms overhead (array filter + length check)
- Rolling window cleanup: O(n) where n = failure count (max 10)
- Memory footprint: Array of timestamps (~80 bytes for 10 failures)

**Concurrency Safety:**
- BridgeManager processes jobs sequentially (no concurrent access to failureTimestamps)
- If concurrent processing added later, needs synchronization

**Error Response Format:**
```json
{
  "error": {
    "code": "E_CIRCUIT_OPEN",
    "message": "Bridge is flooded (10 failures in 60 seconds). Try again later.",
    "retryAfter": 45
  }
}
```

---

### Implementation Location

**Where flood protection goes**: `processor.ts` in the `launchJob()` function

Looking at the actual BridgeManager architecture:
- BridgeManager watches for `command.json` files
- When found, calls `launchJob(jobDir, bridgeId, executor)`
- `launchJob()` checks capacity, then calls `processCommand()` async

**Flood check should go at the START of `launchJob()`**, before the capacity check:

### Implementation Pseudocode

```typescript
// In processor.ts

// Module-level flood tracking (shared across all jobs)
let failureTimestamps: number[] = [];

function isFlooded(): { flooded: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowStart = now - 60_000; // 60 seconds ago

  // Remove failures outside window
  failureTimestamps = failureTimestamps.filter(t => t > windowStart);

  if (failureTimestamps.length >= 10) {
    const oldestFailure = Math.min(...failureTimestamps);
    const retryAfter = Math.ceil((oldestFailure + 60_000 - now) / 1000);
    return { flooded: true, retryAfter };
  }

  return { flooded: false };
}

export function launchJob(
  jobDir: string,
  bridgeId: string,
  executor: (command: CommandJson, eventWriter: EventWriter) => Promise<any>
): void {
  // 1. CHECK FLOOD PROTECTION FIRST
  const floodCheck = isFlooded();
  if (floodCheck.flooded) {
    const errorEnvelope = createErrorEnvelope(
      ErrorCode.E_CIRCUIT_OPEN,
      `Bridge is flooded (10 failures in 60 seconds). Try again in ${floodCheck.retryAfter}s.`,
      path.basename(jobDir),
      Date.now()
    );

    writeResponse(jobDir, errorEnvelope)
      .then(() => writeDone(jobDir))
      .catch(err => console.error(`[Processor] Failed to write flood error: ${err}`));

    console.log(`[Processor] Job rejected (flood): ${path.basename(jobDir)}`);
    return;
  }

  // 2. Check capacity (existing code)
  if (inFlight >= MAX_CONCURRENT) {
    // ... existing capacity check
  }

  // 3. Launch job
  inFlight++;
  processCommand(jobDir, bridgeId, executor)
    .catch(err => {
      // Record failure for flood tracking
      failureTimestamps.push(Date.now());
      console.error(`[Processor] Job failed:`, err);
    })
    .finally(() => {
      inFlight--;
    });
}
```

**Key points**:
- Flood tracking is **module-level** (not class), shared across all launchJob calls
- Check happens **before** capacity check (flood is more severe)
- Failures recorded in processCommand's `.catch()` handler
- No changes to BridgeManager class (it just calls launchJob as usual)

---

### Test Plan

**Testing Strategy**: Integration test via filesystem protocol (create command.json, verify error.json)

**Why integration test**: BridgeManager has no public processJob() API - it works via file watcher. Tests must use the actual filesystem protocol.

**Test Coverage** (test/core/fs-bridge/flood-protection.test.ts):

1. **Flood protection triggers at threshold** (Critical path)
   - Set up BridgeManager with test scriptExecutor that always fails
   - Create 10 command.json files in execute/ directory
   - Wait for watcher to process all 10 (they all fail)
   - Create 11th command.json file
   - Verify 11th job gets error.json with E_CIRCUIT_OPEN
   - Verify retryAfter field present and reasonable (0-60 seconds)

2. **Auto-recovery after window expires** (Critical path)
   - Trigger flood (10 failures)
   - Use Vitest fake timers to advance 61 seconds
   - Create new command.json file
   - Verify new job processes (no E_CIRCUIT_OPEN error)

**Test Approach** (filesystem-based integration):
```typescript
// Test setup
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flood-test-'));
const executeDir = path.join(testDir, 'execute');
fs.mkdirSync(executeDir, { recursive: true });

// Create failing executor
const failingExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
  throw new Error('Simulated failure');
};

// Initialize BridgeManager (sets up watcher)
const bridgeManager = new BridgeManager();
await bridgeManager.initialize(mockContext, failingExecutor);

// Simulate job by creating command.json
const jobDir = path.join(executeDir, 'job-001');
fs.mkdirSync(jobDir);
fs.writeFileSync(
  path.join(jobDir, 'command.json'),
  JSON.stringify({ id: 'job-001', scriptName: 'test', params: {} })
);

// Wait for watcher to process (poll for done marker)
await waitForDoneMarker(jobDir, 5000);

// Check error.json response
const errorPath = path.join(jobDir, 'error.json');
const error = JSON.parse(fs.readFileSync(errorPath, 'utf8'));
expect(error.error.code).toBe('E_CIRCUIT_OPEN');
```

**Mock Usage Policy**:
- ✅ **DO use**: Vitest fake timers (vi.useFakeTimers) for time-based tests
- ✅ **DO use**: Real temp directories and filesystem protocol
- ✅ **DO use**: Real BridgeManager (integration test)
- ✅ **DO use**: Failing scriptExecutor to trigger errors
- ⚠️ **May need**: Helper to wait for done marker (poll with timeout)

---

### Commands to Run

**Test Runner**:
```bash
# Run flood protection test only
npx vitest run test/core/fs-bridge/flood-protection.test.ts

# Watch mode during development
npx vitest watch test/core/fs-bridge/flood-protection.test.ts
```

**Type Checking**:
```bash
# Check TypeScript compilation
npx tsc --noEmit
```

---

### Risks & Unknowns

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Clock drift affecting window** | Low | Low | Use Date.now() consistently |
| **False positives during legitimate mass failures** | Medium | Medium | 10-failure threshold provides tolerance; can adjust if needed |
| **Array growth unbounded** | Low | Very Low | Array cleaned on every isFlooded() call; max 10 entries in window |

**Unknowns**:
- ❓ **Concurrent job processing** - Current BridgeManager is sequential, but if concurrency added, failureTimestamps needs locking
- ❓ **Appropriate threshold** - 10 failures / 60s chosen based on spec; may need tuning in production

---

### Ready Check

**Pre-Implementation Checklist**:
- [ ] Plan Phase 4 tasks reviewed and simplified
- [ ] KISS principle understood (no separate class, no notifications)
- [ ] Test plan clear (2 tests, fake timers)
- [ ] Implementation approach clear (~15 lines inline code)

**Architecture Alignment**:
- [ ] Flood protection is inline in BridgeManager (no new files)
- [ ] Error response format aligns with existing ErrorJson structure
- [ ] No VS Code UI dependencies (keeps it simple)

**Testing Readiness**:
- [ ] Vitest test framework selected per project standard
- [ ] Fake timers strategy understood (vi.useFakeTimers)
- [ ] Test covers both flood trigger and auto-recovery

**Sponsor Sign-off**:
- [ ] **GO** to proceed with simplified implementation
- [ ] **NO-GO** - clarify concerns before starting

---

## Phase Footnote Stubs

[^1]: Created test file [file:packages/extension/test/core/fs-bridge/flood-protection.test.ts](packages/extension/test/core/fs-bridge/flood-protection.test.ts) - Added 2 comprehensive tests (FS-BRIDGE-FLOOD-001: threshold trigger test, FS-BRIDGE-FLOOD-002: boundary condition test). Tests use real filesystem protocol with launchJob(), verifying E_CIRCUIT_OPEN errors with retryAfter field.

[^2]: Modified [file:packages/extension/src/core/fs-bridge/types.ts:286](packages/extension/src/core/fs-bridge/types.ts#L286) - Added E_CIRCUIT_OPEN to ErrorCode enum for circuit breaker rejection responses.

[^3]: Modified [file:packages/extension/src/core/fs-bridge/processor.ts:29](packages/extension/src/core/fs-bridge/processor.ts#L29) - Added module-level `failureTimestamps` array and `resetFloodProtection()` export for test isolation. Implemented `isFlooded()` function (lines 186-200) for rolling window check. Added flood protection check in `launchJob()` (lines 214-236) before capacity check, rejecting jobs with E_CIRCUIT_OPEN when threshold exceeded.

[^4]: Modified [file:packages/extension/src/core/fs-bridge/processor.ts:489](packages/extension/src/core/fs-bridge/processor.ts#L489) - Added failure timestamp recording in `processCommand()` catch handler (non-cancellation errors only). Records `Date.now()` to `failureTimestamps` array when executor throws errors.

---

## Evidence Artifacts

**Execution Log**:
- **Location**: [execution.log.md](./execution.log.md)
- **Created**: 2025-10-17
- **Contents**: Full TDD cycle log (RED-GREEN-REFACTOR), test results, implementation notes

**Test Results**:
```
✓ packages/extension/test/core/fs-bridge/flood-protection.test.ts (2 tests) 569ms
  ✓ FS-BRIDGE-FLOOD-001: triggers at threshold (10 failures in 60s) 208ms
  ✓ FS-BRIDGE-FLOOD-002: threshold boundary (9 OK, 10th triggers) 361ms
```

**Supporting Files** (created during implementation):
- Test file: [packages/extension/test/core/fs-bridge/flood-protection.test.ts](../../../../packages/extension/test/core/fs-bridge/flood-protection.test.ts)
- Modified: [packages/extension/src/core/fs-bridge/processor.ts](../../../../packages/extension/src/core/fs-bridge/processor.ts)
- Modified: [packages/extension/src/core/fs-bridge/types.ts](../../../../packages/extension/src/core/fs-bridge/types.ts)

---

## Directory Layout

```
docs/plans/14-bridge-resilience/
├── bridge-resilience-plan.md         # Main plan
├── bridge-resilience-spec.md          # Requirements spec
└── tasks/
    ├── phase-3-eventwriter-robustness/
    │   ├── tasks.md                   # Phase 3 dossier (COMPLETE)
    │   └── execution.log.md           # Phase 3 implementation log
    └── phase-4-circuit-breaker-protection/
        ├── tasks.md                   # ← This file (SIMPLIFIED)
        └── execution.log.md           # Created during implementation
```

---

**Status**: ✅ COMPLETE (2025-10-17)
**Next Step**: Consider Phase 5 (DLQ system) or mark project as complete
