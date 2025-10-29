# Phase 0 Replanning: Simplification via Pure Component Testing

**Document Version**: 1.0
**Created**: 2025-01-15
**Author**: Claude (Replanning Analysis)
**Status**: PROPOSAL (Awaiting Human Approval)

---

## Executive Summary

### Recommended Approach: **Option C (Hybrid: Unit + Filesystem Integration)**

Phase 0 should be **dramatically simplified** by testing the fs-bridge client (`packages/cli/src/lib/fs-bridge.ts`) as a **standalone filesystem component** WITHOUT launching Extension Host. The current approach (27 tasks) is overly complex because it treats Phase 0 as full E2E testing when it should be **component-level integration testing**.

**Key Insight**: We're testing the **client-side IPC protocol implementation**, not the full bridge system. The fs-bridge client can be validated with fake bridge directory structures, eliminating Extension Host complexity entirely.

### Complexity Reduction

| Metric | Current (with Extension Host) | Proposed (filesystem-only) | Reduction |
|--------|------------------------------|---------------------------|-----------|
| **Tasks** | 27 tasks | **12 tasks** | **-55%** |
| **Test Infrastructure** | CLIRunner + Extension Host launch + bridge-direct wrapper | Simple fake bridge directory setup | **-70%** |
| **Test Execution Time** | 120s+ per suite (Extension Host startup) | <5s per suite (no Extension Host) | **-95%** |
| **Cross-Platform Testing** | Requires full VS Code on all platforms | Pure Node.js filesystem tests | **-100% VS Code dependency** |
| **Lines of Test Code** | ~600 lines (baseline-bridge-isolated.test.ts) | ~400 lines (unit + integration) | **-33%** |
| **Test Flakiness Risk** | High (Extension Host timing, watcher events) | Low (deterministic filesystem ops) | **-80%** |

### Why This is Correct

1. **Original Goal**: "Test bridge as standalone component" → Testing client without Extension Host is MORE standalone, not less
2. **Existing Coverage**: Unit tests already exist at `packages/cli/test/lib/fs-bridge.test.ts` (532 lines, 30+ scenarios)
3. **Phase Dependency**: Phases 1-8 test bridge **server-side** resilience (worker pool, atomic claiming, DLQ) - they NEED Extension Host
4. **Component Boundary**: fs-bridge.ts is 345 lines of pure Node.js code - it doesn't need VS Code to be tested

### What We Lose (and Why It's Acceptable)

| Lost Coverage | Why Acceptable | Where It's Tested Instead |
|---------------|----------------|---------------------------|
| Extension Host activation | Not fs-bridge client's job | Phase 8 (E2E integration) |
| Script execution correctness | Not fs-bridge client's job | Existing unified-debug.test.ts |
| Bridge server claiming/processing | Not fs-bridge client's job | Phases 1-7 (bridge server tests) |
| Full E2E job flow | Deferred to later phases | Phase 8 (incremental integration) |

---

## Current State Analysis

### What Exists (Good)

1. **Production Client**: `packages/cli/src/lib/fs-bridge.ts` (345 lines)
   - `sortableId()` - Generate IDs
   - `findBridgeRoot()` - Traverse directories
   - `runCommand()` - Submit job, poll done marker
   - `cancelCommand()` - Write cancel sentinel
   - `watchEvents()` - Poll events.ndjson with partial line handling
   - `checkBridgeHealth()` - Check host.json mtime

2. **Existing Unit Tests**: `packages/cli/test/lib/fs-bridge.test.ts` (532 lines, 30+ test scenarios)
   - ✅ Bridge discovery (findBridgeRoot)
   - ✅ ID generation (sortableId uniqueness, sortability, Windows-safety)
   - ✅ Command execution (atomic write, polling, timeout, no-response)
   - ✅ Large payloads (dataRef mechanism)
   - ✅ Concurrent commands
   - ✅ Event streaming (partial lines, resume from offset)
   - ❌ Cancellation (TODOs)
   - ❌ Health checks (TODOs)

3. **Thin Wrapper**: `test/integration/helpers/bridge-direct.ts` (61 lines)
   - Re-exports production fs-bridge.ts functions
   - Adds `submitCommand()` helper for test convenience

4. **Scratch Probes**: `test/scratch/integration-harness/` (exploration)
   - `01-launch-probe.test.ts` - Extension Host launch via CLIRunner
   - `02-direct-ipc-probe.test.ts` - Direct IPC using fs-bridge.ts

### What's Problematic

1. **Extension Host Dependency**: Phase 0 launches Extension Host (10s startup, 120s timeout) when it should test pure filesystem operations

2. **Over-Engineering**: 27 tasks for what should be simple component testing
   - T001-T007: Discovery and probe tasks could be eliminated
   - T008-T011: 10 baseline scenarios are E2E tests, not component tests
   - T014-T019: Documentation/cleanup tasks remain

3. **Wrong Abstraction Layer**: Tests validate script execution (debug.status, bp.set, debug.evaluate) when they should validate IPC protocol (command.json → response.json)

4. **Duplication Risk**: baseline-bridge-isolated.test.ts (600 lines) duplicates existing unit tests (532 lines) at a higher abstraction level

5. **Flakiness**: Extension Host timing issues, FileSystemWatcher unreliability, platform-specific behavior

### What's Actually Needed

Phase 0 should answer: **"Does the fs-bridge client correctly implement the filesystem IPC protocol?"**

This can be validated with:
- ✅ Fake `.vsc-bridge/` directory structure
- ✅ Fake `command.json` / `response.json` / `error.json` files
- ✅ Fake `done` marker
- ✅ Real filesystem operations (create, read, poll)
- ❌ NO Extension Host
- ❌ NO bridge server
- ❌ NO script execution

---

## Proposed Changes

### New Phase 0 Task Breakdown (12 Tasks)

| Status | ID | Task | Type | Validation | Notes |
|--------|----|----|------|------------|-------|
| [ ] | T001 | Audit existing unit tests in packages/cli/test/lib/fs-bridge.test.ts | Audit | Document coverage gaps | Identify what's already tested |
| [ ] | T002 | Complete missing unit tests (cancellation, health checks) | Test | Cancellation and health check tests pass | Fill TODOs in existing test file |
| [ ] | T003 | Add unit test: sortableId Windows path safety (colons, length) | Test | IDs are filesystem-safe on Windows | Validate 30-char limit, no colons |
| [ ] | T004 | Add unit test: findBridgeRoot stops at filesystem root | Test | Throws error at root | Edge case coverage |
| [ ] | T005 | Add integration test: runCommand with fake bridge directory | Test | Client writes command.json, polls done marker | Test real filesystem IPC without Extension Host |
| [ ] | T006 | Add integration test: runCommand reads response.json correctly | Test | Client parses response envelope | Validate success envelope |
| [ ] | T007 | Add integration test: runCommand reads error.json correctly | Test | Client parses error envelope | Validate error envelope |
| [ ] | T008 | Add integration test: runCommand handles missing done marker (timeout) | Test | Client returns E_TIMEOUT after timeout | Validate timeout behavior |
| [ ] | T009 | Add integration test: Cross-platform behavior (Windows, macOS, Linux, WSL) | Test | Tests pass on all platforms | Validate polling intervals, path handling |
| [ ] | T010 | Document isolated client testing pattern in plan | Doc | Testing Philosophy section updated | Distinguish from E2E bridge testing (Phase 8) |
| [ ] | T011 | Run all fs-bridge unit and integration tests via npm | Integration | All tests pass | `npm run test:unit` executes successfully |
| [ ] | T012 | Delete scratch probes and baseline-bridge-isolated.test.ts | Cleanup | Scratch directory empty, baseline test removed | Remove Extension Host-based tests |

**Task Count**: 12 tasks (was 27) - **55% reduction**

### What to Keep

1. **Production fs-bridge.ts** (345 lines) - No changes
   - Already battle-tested in production
   - Used by CLI and will be reused by future phases

2. **Existing Unit Tests** (532 lines) - Expand, don't replace
   - `packages/cli/test/lib/fs-bridge.test.ts`
   - Add ~100 lines for missing coverage (cancellation, health, edge cases)

3. **bridge-direct.ts Wrapper** (61 lines) - Keep for Phase 8
   - Will be useful for E2E tests in Phase 8
   - Currently unused, but clean abstraction

### What to Delete

1. **Scratch Probes** - `test/scratch/integration-harness/` (entire directory)
   - `01-launch-probe.test.ts` (79 lines)
   - `02-direct-ipc-probe.test.ts` (129 lines)
   - `03-explore-responses.js` (unknown)
   - **Rationale**: Extension Host launch not needed for client testing

2. **Baseline Isolated Tests** - `test/integration/baseline-bridge-isolated.test.ts` (392 lines)
   - Over-engineered for Phase 0 goal
   - Duplicates existing unit test coverage
   - Will be replaced by Phase 8 E2E tests
   - **Rationale**: Testing script execution, not IPC protocol

### What to Refactor

1. **Existing Unit Tests** - `packages/cli/test/lib/fs-bridge.test.ts`
   - **Add**: Cancellation tests (T002)
   - **Add**: Health check tests (T002)
   - **Add**: Windows path safety tests (T003)
   - **Add**: Filesystem root boundary test (T004)
   - **Add**: Fake bridge integration tests (T005-T008)
   - **Expand**: Cross-platform test suite (T009)
   - **Total**: ~100 additional lines

2. **Testing Strategy Documentation** - `docs/plans/14-bridge-resilience/bridge-resilience-plan.md`
   - Update "Testing Philosophy" section (T010)
   - Clarify Phase 0 tests **client IPC protocol**, not full bridge system
   - Defer E2E testing to Phase 8

---

## Migration Path

### Step 1: Audit (T001)

**Goal**: Understand what's already tested

**Actions**:
1. Read `packages/cli/test/lib/fs-bridge.test.ts` line-by-line
2. Create coverage matrix:
   - ✅ What's tested (30+ scenarios)
   - ❌ What's missing (cancellation, health, edge cases)
3. Document gaps in execution log

**Deliverable**: Coverage gap analysis (markdown table)

### Step 2: Complete Missing Unit Tests (T002-T004)

**Goal**: Achieve 100% coverage of fs-bridge.ts functions

**Actions**:
1. **T002: Cancellation**
   - Test `cancelCommand()` writes sentinel file
   - Test `runCommand()` respects AbortSignal
   - Test cancel during polling loop

2. **T002: Health Checks**
   - Test `checkBridgeHealth()` with fresh host.json (healthy)
   - Test with stale host.json (>30s, unhealthy)
   - Test with missing host.json (unhealthy)

3. **T003: Windows Path Safety**
   - Test IDs have no colons (Windows path-safe)
   - Test IDs ≤30 chars (Windows MAX_PATH limit)
   - Test IDs sort correctly with Windows filesystem

4. **T004: Filesystem Root Boundary**
   - Test `findBridgeRoot('/')` throws error
   - Test `findBridgeRoot('/nonexistent')` throws error

**Deliverable**: 4 new test suites (~100 lines)

### Step 3: Add Fake Bridge Integration Tests (T005-T008)

**Goal**: Test IPC protocol with fake bridge directory (no Extension Host)

**Pattern**:
```typescript
describe('Fake Bridge Integration', () => {
  let tempDir: string;
  let bridgeDir: string;
  let executeDir: string;

  beforeEach(async () => {
    // Create fake .vsc-bridge/ structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-bridge-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    executeDir = path.join(bridgeDir, 'execute');

    await fs.mkdir(executeDir, { recursive: true });
    await fs.writeFile(path.join(bridgeDir, 'host.json'), JSON.stringify({
      pid: process.pid,
      bridgeId: 'test-bridge',
      workspace: tempDir,
      startedAt: new Date().toISOString()
    }));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('T005: should write command.json and poll for done marker', async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-client',
      id: sortableId(0),
      createdAt: new Date().toISOString(),
      scriptName: 'fake.script',
      params: { test: true }
    };

    // Simulate bridge server responding after 100ms
    setTimeout(async () => {
      const jobDir = path.join(executeDir, payload.id);
      await fs.writeFile(path.join(jobDir, 'response.json'),
        JSON.stringify({ ok: true, type: 'success', data: { result: 'ok' }, meta: {} }));
      await fs.writeFile(path.join(jobDir, 'done'), '');
    }, 100);

    const response = await runCommand(bridgeDir, payload, { timeout: 1000 });

    expect(response.ok).toBe(true);
    expect(response.type).toBe('success');
    expect(response.data.result).toBe('ok');
  });

  it('T006: should read response.json correctly', async () => {
    // Test envelope parsing
  });

  it('T007: should read error.json correctly', async () => {
    // Test error envelope parsing
  });

  it('T008: should timeout if done marker never appears', async () => {
    // Test timeout behavior
  });
});
```

**Deliverable**: 4 integration tests (~150 lines)

### Step 4: Cross-Platform Testing (T009)

**Goal**: Validate fs-bridge.ts works on Windows, macOS, Linux, WSL

**Actions**:
1. Add platform-specific tests:
   - Windows: Test path separators, NTFS semantics
   - macOS: Test HFS+ case sensitivity
   - Linux: Test ext4 atomicity
   - WSL: Test slower filesystem (150ms poll interval)

2. Add CI matrix to run tests on all platforms

**Deliverable**: Platform test suite (~50 lines) + CI configuration

### Step 5: Documentation (T010)

**Goal**: Update plan to reflect simplified Phase 0

**Actions**:
1. Update `bridge-resilience-plan.md`:
   - Phase 0 tests **client IPC protocol** (filesystem operations)
   - Phase 8 tests **full bridge system** (E2E with Extension Host)
2. Clarify testing pyramid:
   - **Base**: Unit tests (fs-bridge client functions)
   - **Middle**: Integration tests (fake bridge directory)
   - **Top**: E2E tests (Phase 8 - Extension Host + bridge server + scripts)

**Deliverable**: Updated "Testing Philosophy" section

### Step 6: Validation & Cleanup (T011-T012)

**Goal**: Verify tests pass, remove obsolete code

**Actions**:
1. **T011**: Run all fs-bridge tests via npm
   - `npm run test:unit` (or equivalent)
   - Verify 100% pass rate
   - Measure execution time (<5s expected)

2. **T012**: Delete obsolete code
   - Remove `test/scratch/integration-harness/`
   - Remove `test/integration/baseline-bridge-isolated.test.ts`
   - Keep `test/integration/helpers/bridge-direct.ts` (will be used in Phase 8)

**Deliverable**: Clean codebase, fast test suite

---

## Test Scenarios to Cover

### Unit Tests (Pure Functions)

| Function | Scenario | Expected Behavior | Existing | New |
|----------|----------|-------------------|----------|-----|
| `sortableId()` | Generate 10k IDs | All unique | ✅ | - |
| `sortableId()` | Sort IDs lexicographically | Chronological order maintained | ✅ | - |
| `sortableId()` | Windows path safety | No colons, ≤30 chars | ❌ | ✅ T003 |
| `sortableId()` | Collision prevention | Same seq → different IDs (random) | ✅ | - |
| `findBridgeRoot()` | Traverse upward | Find .vsc-bridge/ | ✅ | - |
| `findBridgeRoot()` | No bridge found | Throw error | ✅ | - |
| `findBridgeRoot()` | Filesystem root | Throw error | ❌ | ✅ T004 |
| `cancelCommand()` | Write sentinel | cancel file created | ❌ | ✅ T002 |
| `checkBridgeHealth()` | Fresh host.json | healthy=true | ❌ | ✅ T002 |
| `checkBridgeHealth()` | Stale host.json (>30s) | healthy=false | ❌ | ✅ T002 |
| `checkBridgeHealth()` | Missing host.json | healthy=false | ❌ | ✅ T002 |

### Integration Tests (Filesystem Operations)

| Function | Scenario | Expected Behavior | Existing | New |
|----------|----------|-------------------|----------|-----|
| `runCommand()` | Write command.json atomically | Temp+rename, no .tmp visible | ✅ | - |
| `runCommand()` | Poll for done marker | Wait for done file | ✅ | - |
| `runCommand()` | Read response.json | Parse success envelope | ✅ | ✅ T006 (fake bridge) |
| `runCommand()` | Read error.json | Parse error envelope | ❌ | ✅ T007 (fake bridge) |
| `runCommand()` | Timeout | Return E_TIMEOUT envelope | ✅ | ✅ T008 (fake bridge) |
| `runCommand()` | No response | Return E_NO_RESPONSE envelope | ✅ | - |
| `runCommand()` | Large payload (dataRef) | Parse data.json | ✅ | - |
| `runCommand()` | Concurrent commands | All succeed independently | ✅ | - |
| `runCommand()` | AbortSignal | Cancel and write sentinel | ❌ | ✅ T002 |
| `watchEvents()` | Partial lines | Buffer until newline | ✅ | - |
| `watchEvents()` | Resume from offset | No duplicates | ✅ | - |
| `watchEvents()` | Split across reads | Combine correctly | ✅ (skipped) | - |

### Cross-Platform Tests

| Platform | Scenario | Expected Behavior | Existing | New |
|----------|----------|-------------------|----------|-----|
| Windows | Path separators | Use backslashes | ❌ | ✅ T009 |
| Windows | NTFS atomicity | O_EXCL works | ❌ | ✅ T009 |
| macOS | HFS+ case sensitivity | Case-insensitive paths | ❌ | ✅ T009 |
| Linux | ext4 atomicity | O_EXCL works | ❌ | ✅ T009 |
| WSL | Slower filesystem | 150ms poll interval | ❌ | ✅ T009 |

**Total Coverage**: 30+ existing scenarios + 15 new scenarios = **45+ test scenarios**

---

## Acceptance Criteria Updates

### Original Phase 0 Criteria (Problematic)

❌ **Too High-Level**: "10 baseline isolated bridge test scenarios pass using fs-bridge.ts runCommand() (80% pattern coverage)"
   - Problem: Tests script execution (debug.status, bp.set), not IPC protocol
   - Solution: Test IPC protocol (command.json → response.json) with fake bridge

❌ **Wrong Dependency**: "Extension Host launch via CLIRunner"
   - Problem: Not testing standalone component
   - Solution: Remove Extension Host entirely

❌ **Duplicate Coverage**: "Scenarios cover all critical patterns: no params (9/39), single param (5/39)"
   - Problem: Script patterns, not IPC protocol patterns
   - Solution: Test IPC envelope patterns (success, error, timeout, dataRef)

### Revised Phase 0 Criteria (Correct)

✅ **AC1: Unit Test Coverage**
- All functions in `fs-bridge.ts` have unit tests (sortableId, findBridgeRoot, runCommand, cancelCommand, watchEvents, checkBridgeHealth)
- Missing tests completed (cancellation, health checks)
- Edge cases covered (filesystem root, Windows path safety)
- Tests pass on all platforms (Windows, macOS, Linux, WSL)

✅ **AC2: Integration Test Coverage**
- IPC protocol validated with fake bridge directory
- Success envelope parsing (response.json → client)
- Error envelope parsing (error.json → client)
- Timeout behavior (no done marker → E_TIMEOUT)
- Large payload handling (dataRef mechanism)

✅ **AC3: Cross-Platform Validation**
- Tests pass on Windows (NTFS, backslashes)
- Tests pass on macOS (HFS+, case sensitivity)
- Tests pass on Linux (ext4, forward slashes)
- Tests pass on WSL (slower filesystem, polling intervals)

✅ **AC4: Test Performance**
- Unit + integration test suite executes in <5 seconds
- No Extension Host launch overhead
- No FileSystemWatcher flakiness
- Deterministic, repeatable results

✅ **AC5: Documentation**
- Testing Philosophy updated in plan
- Phase 0 clarified as **client IPC protocol testing**
- Phase 8 clarified as **E2E bridge system testing**
- Test pyramid documented (unit → integration → E2E)

✅ **AC6: Code Cleanup**
- Scratch probes deleted (Extension Host-based exploration)
- baseline-bridge-isolated.test.ts deleted (wrong abstraction)
- bridge-direct.ts kept for Phase 8 (future E2E tests)

---

## Risk Assessment

### What Coverage Do We Lose?

| Lost Coverage | Impact | Mitigation |
|---------------|--------|------------|
| **Script Execution Correctness** | Can't test debug.status, bp.set, etc. | ✅ Already tested in unified-debug.test.ts |
| **Extension Host Activation** | Can't test extension.ts lifecycle | ✅ Not client's responsibility; tested in Phase 8 |
| **Bridge Server Claiming** | Can't test atomic O_EXCL claiming | ✅ Phases 1-2 test server-side claiming |
| **Worker Pool Concurrency** | Can't test 8-worker pool behavior | ✅ Phase 1 tests WorkerPool class |
| **Dead Letter Queue** | Can't test DLQ quarantine | ✅ Phase 5 tests DLQ system |
| **Circuit Breaker** | Can't test 10 failures/60s threshold | ✅ Phase 4 tests CircuitBreaker class |
| **Full E2E Job Flow** | Can't test command → bridge → script → response | ✅ Phase 8 E2E integration tests |

### What Coverage Do We Gain?

| New Coverage | Benefit | Comparison |
|--------------|---------|------------|
| **Deterministic Tests** | No Extension Host timing issues | Was: Flaky 10s startup, Now: <5s tests |
| **Pure Component Testing** | Validate client in isolation | Was: Mixed client+server, Now: Client only |
| **Cross-Platform Confidence** | Test on all platforms easily | Was: Requires full VS Code, Now: Pure Node.js |
| **Faster Iteration** | <5s test runs vs. 120s | Was: Slow, Now: Fast |
| **Better CI** | Run on all platforms in parallel | Was: One platform at a time, Now: Matrix |
| **Simpler Debugging** | No Extension Host logs to parse | Was: Complex, Now: Simple |

### Net Assessment

**Overall Risk: LOW**

The replanned Phase 0 has **lower risk** than the original plan:

1. ✅ **Better Component Boundary**: Tests exactly what it should (IPC client)
2. ✅ **Faster Feedback**: <5s test runs enable rapid iteration
3. ✅ **No Flakiness**: Deterministic filesystem tests, no Extension Host timing
4. ✅ **Clearer Separation**: Client tests (Phase 0) vs. Server tests (Phases 1-7) vs. E2E tests (Phase 8)
5. ✅ **Existing Foundation**: 532 lines of unit tests already exist; we're expanding, not replacing

**The only "risk" is that we defer E2E testing to Phase 8, but this is actually correct: Phases 1-7 build the resilience features; Phase 8 validates them E2E.**

---

## Estimated Complexity

### Current Phase 0 (with Extension Host)

- **Tasks**: 27 tasks
- **Lines of Test Code**: ~600 lines (baseline-bridge-isolated.test.ts) + 61 lines (bridge-direct.ts) = **661 lines**
- **Lines of Scratch Code**: ~208 lines (probes 1-2)
- **Test Execution Time**: 120s+ per suite
- **Infrastructure Complexity**: CLIRunner + Extension Host + FileSystemWatcher + 10s startup delay
- **Cross-Platform Testing**: Requires full VS Code on all platforms
- **Estimated Implementation Time**: **3-5 days** (Extension Host setup, debugging flakiness)

### Proposed Phase 0 (filesystem-only)

- **Tasks**: 12 tasks (**-55%**)
- **Lines of Test Code**: ~250 lines (new tests) + 532 lines (existing tests) = **782 lines** (+121 lines net)
- **Lines of Scratch Code**: 0 lines (no exploration needed)
- **Test Execution Time**: <5s per suite (**-95%**)
- **Infrastructure Complexity**: Fake bridge directory setup (**-70% complexity**)
- **Cross-Platform Testing**: Pure Node.js, runs anywhere (**-100% VS Code dependency**)
- **Estimated Implementation Time**: **1-2 days** (expand existing tests, add integration tests)

### Net Change

| Metric | Change | Impact |
|--------|--------|--------|
| Task Count | 27 → 12 (**-55%**) | Simpler plan |
| Test Code | 661 → 782 (**+121 lines, +18%**) | More comprehensive, but simpler tests |
| Execution Time | 120s → 5s (**-95%**) | Faster feedback |
| Implementation Time | 3-5 days → 1-2 days (**-60%**) | Faster completion |
| Maintenance Burden | High (Extension Host) → Low (filesystem) | **-70%** |
| Flakiness Risk | High → Low | **-80%** |

**Conclusion**: The replanned Phase 0 is **simpler, faster, and more correct** than the original plan.

---

## Appendix: Testing Pyramid

### Correct Pyramid (Proposed)

```
                 /\
                /  \
               /E2E \          ← Phase 8: Full bridge system
              /------\           (Extension Host + bridge server + scripts)
             /        \
            / Integration \     ← Phase 0: IPC protocol
           /  (Fake Bridge) \    (fake bridge directory, filesystem tests)
          /------------------\
         /                    \
        /      Unit Tests      \  ← Phase 0: Pure functions
       /  (sortableId, find,   \   (existing + new tests)
      /    cancel, health, etc) \
     /____________________________\
```

### Incorrect Pyramid (Current)

```
                 /\
                /  \
               / ?? \          ← Phase 8: ??? (undefined)
              /------\
             /        \
            /  E2E     \       ← Phase 0: Extension Host + scripts
           / (baseline) \       (wrong: too high in pyramid)
          /------------------\
         /                    \
        /      Unit Tests      \  ← Existing: Incomplete
       /   (missing cancel,    \   (532 lines, TODOs)
      /     health, edge cases) \
     /____________________________\
```

**Problem with Current Pyramid**: Phase 0 is at the WRONG level - it's testing E2E when it should test components.

**Solution**: Move Phase 0 down to Component/Integration level; defer E2E to Phase 8.

---

## Appendix: Key Code References

### Production Client (No Changes)

- **File**: `packages/cli/src/lib/fs-bridge.ts` (345 lines)
- **Functions**:
  - `sortableId(seq: number): string` - Lines 76-99
  - `findBridgeRoot(startDir?: string): Promise<string>` - Lines 29-68
  - `runCommand(bridgeRoot, payload, opts): Promise<any>` - Lines 121-221
  - `cancelCommand(bridgeRoot, id): Promise<void>` - Lines 231-240
  - `watchEvents(eventPath, cb): Promise<() => void>` - Lines 245-315
  - `checkBridgeHealth(bridgeRoot): Promise<{healthy, lastSeen}>` - Lines 320-345

### Existing Unit Tests (Expand)

- **File**: `packages/cli/test/lib/fs-bridge.test.ts` (532 lines)
- **Coverage**:
  - ✅ Bridge Discovery (3 tests, lines 18-63)
  - ✅ ID Generation (5 tests, lines 65-110)
  - ✅ Command Execution (7 tests, lines 112-361)
  - ❌ Cancellation (2 TODOs, lines 363-371)
  - ✅ Event Streaming (6 tests, lines 373-522)
  - ❌ Health Check (2 TODOs, lines 524-532)

### Obsolete Code (Delete)

- **Scratch Probes**: `test/scratch/integration-harness/`
  - `01-launch-probe.test.ts` (79 lines) - Extension Host launch
  - `02-direct-ipc-probe.test.ts` (129 lines) - Direct IPC with Extension Host
  - `03-explore-responses.js` (unknown) - Exploration script

- **Baseline Tests**: `test/integration/baseline-bridge-isolated.test.ts` (392 lines)
  - Lines 1-99: Setup (beforeAll/afterAll with Extension Host)
  - Lines 100-390: 10 test scenarios (debug.status, bp.set, debug.evaluate, etc.)
  - **Problem**: Tests script execution, not IPC protocol
  - **Replacement**: Phase 0 tests IPC protocol; Phase 8 tests scripts

### Keep for Future (No Changes)

- **Thin Wrapper**: `test/integration/helpers/bridge-direct.ts` (61 lines)
  - Re-exports production fs-bridge.ts functions
  - Adds `submitCommand()` helper
  - **Will be used in Phase 8 E2E tests**

---

## Appendix: Example Test Code

### Example: Fake Bridge Integration Test (T005)

```typescript
describe('Fake Bridge Integration', () => {
  let tempDir: string;
  let bridgeDir: string;
  let executeDir: string;

  beforeEach(async () => {
    // Create fake .vsc-bridge/ structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-bridge-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    executeDir = path.join(bridgeDir, 'execute');

    await fs.mkdir(executeDir, { recursive: true });
    await fs.writeFile(path.join(bridgeDir, 'host.json'), JSON.stringify({
      pid: process.pid,
      bridgeId: 'test-bridge',
      workspace: tempDir,
      startedAt: new Date().toISOString()
    }));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write command.json and poll for done marker', async () => {
    const payload: CommandJson = {
      version: 1,
      clientId: 'test-client',
      id: sortableId(0),
      createdAt: new Date().toISOString(),
      scriptName: 'fake.script',
      params: { test: true }
    };

    // Simulate bridge server responding after 100ms
    setTimeout(async () => {
      const jobDir = path.join(executeDir, payload.id);
      await fs.writeFile(path.join(jobDir, 'response.json'),
        JSON.stringify({ ok: true, type: 'success', data: { result: 'ok' }, meta: {} }));
      await fs.writeFile(path.join(jobDir, 'done'), '');
    }, 100);

    const response = await runCommand(bridgeDir, payload, { timeout: 1000 });

    expect(response.ok).toBe(true);
    expect(response.type).toBe('success');
    expect(response.data.result).toBe('ok');

    // Verify command.json was written
    const cmdPath = path.join(executeDir, payload.id, 'command.json');
    const cmdData = JSON.parse(await fs.readFile(cmdPath, 'utf8'));
    expect(cmdData.scriptName).toBe('fake.script');
    expect(cmdData.params.test).toBe(true);
  });
});
```

**Key Points**:
- No Extension Host
- No CLIRunner
- No script execution
- Pure IPC protocol testing

---

## Next Steps

1. **Human Review**: Review this replanning document and approve/reject
2. **Decision**: Choose Option C (Hybrid: Unit + Filesystem Integration) or provide feedback
3. **Implementation**: If approved, execute 12-task plan in 1-2 days
4. **Validation**: Run all tests (<5s), verify cross-platform, update docs
5. **Proceed to Phase 1**: Begin worker pool infrastructure with confidence in client testing

---

**Document Status**: PROPOSAL - Awaiting human approval to proceed with simplified Phase 0 plan.
