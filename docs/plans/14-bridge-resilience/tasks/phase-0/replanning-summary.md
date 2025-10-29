# Phase 0 Replanning: Visual Summary

**Quick Reference**: One-page overview of the replanning proposal

---

## The Key Insight

> **We're testing the filesystem IPC protocol client, not the Extension Host product.**

The fs-bridge client (`packages/cli/src/lib/fs-bridge.ts`) is 345 lines of pure Node.js code that reads/writes files. It doesn't need VS Code to be tested.

---

## Before & After Comparison

### Current Approach (Wrong Level)

```
Test Pyramid:                        What Phase 0 Tests:

         /\                          ┌─────────────────────┐
        /E2?\                        │  Extension Host     │
       /----\                        │  +                  │
      /      \                       │  Bridge Server      │
     / Phase0 \  ← TOO HIGH!         │  +                  │
    /  (E2E)   \                     │  Script Execution   │
   /------------\                    │  (debug.status,     │
  /              \                   │   bp.set, etc.)     │
 /   Unit Tests   \                  └─────────────────────┘
/____(incomplete)__\

Problems:
- 27 tasks, 120s test runtime
- Extension Host flakiness
- Tests script execution (not IPC client)
- Mixed concerns (client + server + scripts)
```

### Proposed Approach (Correct Level)

```
Test Pyramid:                        What Phase 0 Tests:

         /\
        /  \                         ┌─────────────────────┐
       /E2E \  ← Phase 8             │  fs-bridge.ts       │
      /------\                       │  IPC Client         │
     /        \                      │                     │
    /Integration\ ← Phase 0          │  Functions:         │
   / (Fake Bridge)\                  │  - sortableId()     │
  /----------------\                 │  - findBridgeRoot() │
 /                  \                │  - runCommand()     │
/     Unit Tests     \               │  - cancelCommand()  │
/  (fs-bridge funcs)  \              │  - watchEvents()    │
/______________________\             │  - checkBridgeHealth│
                                     └─────────────────────┘

Benefits:
- 12 tasks, <5s test runtime
- No Extension Host dependency
- Tests IPC protocol only
- Clean separation of concerns
```

---

## Metrics Comparison

| Metric | Current (Extension Host) | Proposed (Filesystem) | Improvement |
|--------|--------------------------|----------------------|-------------|
| **Tasks** | 27 | 12 | **-55%** |
| **Test Runtime** | 120s+ | <5s | **-95%** |
| **Implementation Time** | 3-5 days | 1-2 days | **-60%** |
| **VS Code Dependency** | Required | None | **-100%** |
| **Flakiness Risk** | High (timing) | Low (deterministic) | **-80%** |
| **Cross-Platform Testing** | Complex (full VS Code) | Easy (pure Node.js) | **Trivial** |
| **Lines of Test Code** | 661 lines | 782 lines | +18% (but simpler) |

---

## What Changes

### DELETE

- ❌ `test/scratch/integration-harness/` (entire directory)
  - Extension Host launch probes
  - Direct IPC probes (with Extension Host)

- ❌ `test/integration/baseline-bridge-isolated.test.ts` (392 lines)
  - Tests script execution (wrong abstraction)
  - Duplicates existing unit test coverage

### KEEP

- ✅ `packages/cli/src/lib/fs-bridge.ts` (345 lines) - Production client
- ✅ `packages/cli/test/lib/fs-bridge.test.ts` (532 lines) - Existing unit tests
- ✅ `test/integration/helpers/bridge-direct.ts` (61 lines) - For Phase 8 E2E

### ADD

- ➕ **~100 lines**: Complete missing unit tests (cancellation, health, edge cases)
- ➕ **~150 lines**: Fake bridge integration tests (IPC protocol validation)
- ➕ **~50 lines**: Cross-platform tests (Windows, macOS, Linux, WSL)

**Net Change**: +300 lines of test code, -870 lines of infrastructure/scratch code

---

## Task Breakdown

### Current: 27 Tasks

```
Discovery (T001-T007): 7 tasks
  ├─ Read existing tests
  ├─ Study Extension Host launch
  ├─ Create scratch probes
  └─ Learn CLIRunner pattern

Implementation (T008-T011): 10 tasks
  ├─ Create baseline test file
  └─ Write 10 E2E scenarios (script execution)

Documentation (T012-T015): 4 tasks
Validation (T016-T019): 4 tasks
Cleanup (T018): 1 task
```

### Proposed: 12 Tasks

```
Audit (T001): 1 task
  └─ Review existing unit test coverage

Complete (T002-T004): 3 tasks
  ├─ Add cancellation tests
  ├─ Add health check tests
  └─ Add edge case tests

Integrate (T005-T009): 5 tasks
  ├─ Fake bridge success test
  ├─ Fake bridge error test
  ├─ Fake bridge timeout test
  └─ Cross-platform tests

Document (T010): 1 task
Validate (T011): 1 task
Cleanup (T012): 1 task
```

**Reduction**: 27 → 12 tasks (**-55%**)

---

## Test Coverage Comparison

### What Current Plan Tests (Wrong)

```
Script Execution Layer:
├─ debug.status → { isActive: false }
├─ bp.set → breakpoint created
├─ debug.evaluate → E_NO_SESSION
├─ dap.logs → log entries
└─ ... (10 script scenarios)

Problem: Tests Extension Host product, not IPC client
```

### What Proposed Plan Tests (Correct)

```
IPC Protocol Layer:
├─ command.json → written atomically
├─ done marker → polling works
├─ response.json → success envelope parsed
├─ error.json → error envelope parsed
├─ timeout → E_TIMEOUT returned
├─ dataRef → large payloads handled
├─ cancelCommand → sentinel written
├─ checkBridgeHealth → mtime checked
└─ watchEvents → partial lines buffered

Coverage: IPC client functions, not script execution
```

---

## Risk Assessment

### What We Lose

| Lost Coverage | Why Acceptable |
|---------------|----------------|
| Script execution | Already tested in `unified-debug.test.ts` |
| Extension Host lifecycle | Not client's responsibility |
| Bridge server claiming | Tested in Phases 1-2 |
| Concurrent execution | Tested in Phase 1 |
| DLQ quarantine | Tested in Phase 5 |
| Circuit breaker | Tested in Phase 4 |
| Full E2E flow | Deferred to Phase 8 |

### What We Gain

| New Coverage | Benefit |
|--------------|---------|
| Deterministic tests | No Extension Host timing issues |
| Pure component tests | Client tested in isolation |
| Fast feedback | <5s vs. 120s |
| Cross-platform confidence | Easy to test all platforms |
| Clearer separation | Client (Phase 0) vs. Server (Phases 1-7) vs. E2E (Phase 8) |

**Net Assessment**: **LOWER RISK** than current plan

---

## Example: Current vs. Proposed Test

### Current Test (Wrong Abstraction)

```typescript
// test/integration/baseline-bridge-isolated.test.ts
it('Scenario 1: No parameters pattern (debug.status)', async () => {
  // Launches Extension Host (10s)
  // Uses CLIRunner
  // Executes debug.status script
  // Validates script output

  const response = await submitCommand(bridgeRoot, seq++, 'debug.status', {});
  expect(response.data.isActive).toBeDefined(); // Script-specific field
});

Problem: Tests script execution, not IPC protocol
```

### Proposed Test (Correct Abstraction)

```typescript
// packages/cli/test/lib/fs-bridge.test.ts
it('should read response.json and return success envelope', async () => {
  // No Extension Host
  // Fake bridge directory
  // Simulate bridge response

  const payload = { /* command */ };

  // Fake bridge server responds
  setTimeout(async () => {
    await fs.writeFile(jobDir + '/response.json',
      JSON.stringify({ ok: true, type: 'success', data: { result: 'ok' } }));
    await fs.writeFile(jobDir + '/done', '');
  }, 100);

  const response = await runCommand(bridgeDir, payload, { timeout: 1000 });
  expect(response.ok).toBe(true); // IPC envelope field
  expect(response.type).toBe('success'); // IPC envelope field
});

Benefit: Tests IPC client, not script execution
```

---

## Testing Pyramid (Correct)

```
                          Coverage Area

           /\            ┌──────────────────┐
          /  \           │  Full System     │
         / E2E \         │  (Extension Host │  ← Phase 8
        /--------\       │   + Bridge       │
       /          \      │   + Scripts)     │
      /            \     └──────────────────┘
     / Integration  \    ┌──────────────────┐
    /   (Fake Bridge) \  │  IPC Protocol    │  ← Phase 0
   /------------------\  │  (command.json → │    (Proposed)
  /                    \ │   response.json) │
 /      Unit Tests      \└──────────────────┘
/   (Pure Functions)     \┌──────────────────┐
/_________________________\│ sortableId,     │ ← Phase 0
                           │ findBridgeRoot, │   (Expand)
                           │ cancelCommand   │
                           └──────────────────┘

Phases:
- Phase 0: Test IPC client (bottom 2 layers)
- Phases 1-7: Test bridge server (concurrent execution, claiming, DLQ, circuit breaker)
- Phase 8: Test full system E2E (top layer)
```

---

## Decision Matrix

| Approach | Tasks | Runtime | Risk | Correctness | Recommendation |
|----------|-------|---------|------|-------------|----------------|
| **A: Pure Unit** | 8 | <1s | Low | Low (no filesystem) | ❌ Insufficient |
| **B: Filesystem Only** | 10 | <5s | Low | Medium (no coverage gaps) | ⚠️ Good but incomplete |
| **C: Hybrid (Unit + Filesystem)** | 12 | <5s | Low | **High** | ✅ **RECOMMENDED** |
| **D: Keep Current (Extension Host)** | 27 | 120s+ | High | Medium (wrong abstraction) | ❌ Over-engineered |

**Recommendation**: **Option C** - Best balance of coverage, speed, and correctness

---

## Implementation Timeline

### Current Plan: 3-5 Days

```
Day 1:     Discovery (T001-T004)
Day 2-3:   Scratch probes + Extension Host debugging (T005-T007)
Day 4:     Baseline tests (T008-T011)
Day 5:     Documentation + cleanup (T012-T019)

Risks: Extension Host flakiness, timing issues, cross-platform problems
```

### Proposed Plan: 1-2 Days

```
Day 1 AM:  Audit existing tests (T001)
Day 1 PM:  Complete missing unit tests (T002-T004)
Day 2 AM:  Add fake bridge integration tests (T005-T008)
Day 2 PM:  Cross-platform tests + docs + cleanup (T009-T012)

Confidence: High (deterministic tests, no Extension Host)
```

---

## Acceptance Criteria Summary

### Current (Too High-Level)

- ❌ "10 baseline scenarios using debug.status, bp.set, etc."
- ❌ "Extension Host launch via CLIRunner"
- ❌ "80% pattern coverage of 39 scripts"

**Problem**: Tests script execution, not IPC client

### Proposed (Component-Level)

- ✅ All fs-bridge.ts functions have unit tests
- ✅ IPC protocol validated with fake bridge directory
- ✅ Success/error/timeout envelopes tested
- ✅ Cross-platform validation (Windows, macOS, Linux, WSL)
- ✅ Tests execute in <5s
- ✅ Documentation updated (client vs. server vs. E2E)

**Benefit**: Tests exactly what it should - the IPC client

---

## Recommendation

**APPROVE Option C**: Hybrid (Unit + Filesystem Integration)

**Rationale**:
1. ✅ Correct abstraction level (tests IPC client, not scripts)
2. ✅ Faster implementation (1-2 days vs. 3-5 days)
3. ✅ Faster feedback (<5s vs. 120s)
4. ✅ Lower risk (deterministic, no Extension Host)
5. ✅ Better separation (client tests now, E2E tests in Phase 8)
6. ✅ Existing foundation (532 lines of tests already exist)

**Next Steps**:
1. Human approval of this replanning
2. Execute 12-task plan
3. Validate tests pass (<5s)
4. Proceed to Phase 1 with confidence

---

**Document Status**: PROPOSAL - See `phase-0-replanning.md` for full details
