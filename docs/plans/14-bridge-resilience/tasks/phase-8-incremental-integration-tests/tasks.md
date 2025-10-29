# ~~Phase 8: Integration Test Validation~~ [ARCHIVED - Phase Removed]

**Phase**: ~~Phase 8: Integration Test Validation~~
**Status**: ❌ REMOVED - Merged into Phase 7
**Decision Date**: 2025-10-17
**Plan**: [bridge-resilience-plan.md](../../bridge-resilience-plan.md)

---

## Archive Notice

**This phase has been removed from the Bridge Resilience project plan.**

### Rationale

Phase 8 was originally planned as a comprehensive integration test validation phase that would run after all other phases were complete. However, this approach was found to be:

1. **Redundant**: All resilience features already have comprehensive test coverage (unit + integration) implemented throughout Phases 1-7
2. **Suboptimal feedback loop**: Incremental validation during each phase provides faster feedback than delayed validation
3. **Unnecessary overhead**: CI automation and cross-platform validation are deferred to future work

### What Replaced It

**Phase 7, Task T024**: Final Project Validation
- Validates all unit tests pass (11 component tests in Phase 7 alone)
- Validates all integration tests pass (3 crash-recovery, 3 scanner-watcher)
- Confirms bridge resilience project is complete

### Test Coverage Summary (achieved without Phase 8)

**Unit Tests** (all passing):
- flood-protection.test.ts - Circuit breaker behavior
- event-writer.test.ts - Backpressure and queue management
- dlq.test.ts - DLQ marker creation
- scanner.test.ts - Scanner logic
- crash-recovery.test.ts - Crash detection (11 tests)
- cleaner-dlq.test.ts - Cleanup + DLQ interaction

**Integration Tests** (all passing):
- crash-recovery.test.ts - 3 Extension Host tests
- scanner-watcher.test.ts - 3 Extension Host tests

**Total**: 30+ tests covering all critical paths

### Original Phase 8 Objective (Now Obsolete)

Phase 8 **validates existing resilience features** (Phases 1-7) have complete test coverage by verifying all existing tests pass locally.

**Critical Discovery**: Script failure → DLQ is already covered by flood-protection.test.ts (unit tests). Executor exceptions (including script lookup failures) follow the same code path: `executor throws → processor catches → E_INTERNAL → DLQ quarantine`. No new tests needed.

**Behavior Checklist** (maps to plan acceptance criteria):

- [x] **Crash recovery** - Already tested in `crash-recovery.test.ts` (3 tests)
- [x] **Scanner safety net** - Already tested in `scanner-watcher.test.ts` (3 tests)
- [x] **Circuit breaker** - Already tested in `flood-protection.test.ts` (unit tests)
- [x] **Backpressure** - Already tested in `event-writer.test.ts` (unit tests)
- [x] **Atomic claiming** - Already tested in unit tests
- [x] **DLQ script failure** - Already tested in `flood-protection.test.ts` (executor exception → E_INTERNAL → DLQ)

### Non-Goals (Scope Boundaries)

❌ **NOT doing in this phase:**

- **Writing new tests** - All resilience features already have sufficient test coverage
- **Building new test infrastructure** - Comprehensive test utilities already exist in `test/integration/` and `test/__mocks__/`
- **Rewriting existing tests** - Existing tests are sufficient
- **CI automation** - Deferred to future work; this phase validates tests work locally
- **Cross-platform validation** - Focus on correctness first, platform-specific testing later
- **Performance benchmarking** - We validate correctness, not latency/throughput optimization
- **Load testing** - Existing unit tests validate queue capping
- **DLQ script failure integration test** - Flood protection unit tests already cover executor failures → DLQ (same code path)

### Critical Findings Affecting This Phase

This phase validates that all Critical Discoveries from plan § 3 are correctly implemented:

#### 🚨 **Critical Discovery 01: O_EXCL Atomic Claim Pattern**
- **Current coverage**: Unit tests validate atomic claim behavior
- **Integration coverage**: `scanner-watcher.test.ts` validates claim prevents double-processing
- **No additional testing needed**: Mechanism validated by existing tests

#### 🚨 **Critical Discovery 02: EventWriter Stream Backpressure**
- **Current coverage**: `event-writer.test.ts` validates backpressure handling (comprehensive unit tests)
- **No additional testing needed**: Unit tests sufficient for stream behavior validation

#### 🚨 **Critical Discovery 03: Platform-Specific Filesystem Timing**
- **Current coverage**: Existing tests validated on Linux (devcontainer environment)
- **No additional testing needed**: Tests use `vscode.workspace.fs` API (platform-agnostic)
- **Note**: Cross-platform CI validation deferred to future work

#### 🚨 **Critical Discovery 04: No Lease Renewal Needed**
- **Current coverage**: All existing tests validate simple claim-once model
- **No additional testing needed**: Tests already verify only claimed.json exists (no lease files)

#### 🚨 **Critical Discovery 05: FileSystemWatcher Can Miss Events**
- **Current coverage**: `scanner-watcher.test.ts` validates scanner catches missed events (T012-T013)
- **No additional testing needed**: Integration test validates safety net behavior

### Invariants & Guardrails

**Performance Budgets**:
- Integration test suite runtime: Currently ~20s locally (acceptable)
- Individual test timeout: 60s (allows for Extension Host startup + execution)

**Security Constraints**:
- Test fixtures MUST NOT contain real credentials or sensitive data
- All test directories created in `.vsc-bridge-test/` or `.vsc-bridge-crash-test/` (gitignored, ephemeral)

**Cross-Platform Requirements**:
- All tests MUST use `vscode.workspace.fs` API (not Node.js `fs`) for remote workspace compatibility
- Path handling MUST use `path.join()` for Windows backslash compatibility
- Test cleanup MUST be platform-agnostic (no `rm -rf`, use `vscode.workspace.fs.delete`)

### Inputs to Read

**Existing Integration Tests** (patterns to follow):
- `/workspaces/vsc-bridge-devcontainer/packages/extension/test/integration/crash-recovery.test.ts` - 3 tests (T020, T020b, T020c)
- `/workspaces/vsc-bridge-devcontainer/packages/extension/test/integration/scanner-watcher.test.ts` - 3 tests (T012, T013, remote workspace)

**Existing Unit Tests** (features already validated):
- `/workspaces/vsc-bridge-devcontainer/packages/extension/test/core/fs-bridge/flood-protection.test.ts` - Circuit breaker tests
- `/workspaces/vsc-bridge-devcontainer/packages/extension/test/core/fs-bridge/event-writer.test.ts` - Backpressure tests
- `/workspaces/vsc-bridge-devcontainer/packages/extension/test/core/fs-bridge/dlq.test.ts` - DLQ marker creation tests
- `/workspaces/vsc-bridge-devcontainer/packages/extension/test/core/fs-bridge/scanner.test.ts` - Scanner unit tests
- `/workspaces/vsc-bridge-devcontainer/packages/extension/test/core/fs-bridge/crash-recovery.test.ts` - Crash detection unit tests

**Core Bridge Components** (integration targets):
- `/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/fs-bridge/index.ts` (BridgeManager orchestration)
- `/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/fs-bridge/processor.ts` (job execution, script launching)
- `/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/fs-bridge/dlq.ts` (DLQ marker creation)

### Test Plan (Validation Approach)

**Testing Philosophy**: Validate that existing comprehensive test coverage remains green after Phase 7 completion.

**Test Categories**:
- **Unit tests**: Fast, isolated validation of individual components
- **Integration tests**: Full Extension Host runtime with real VS Code APIs

**Validation Workflow for This Phase**:
1. Run all unit tests → verify green
2. Run all integration tests → verify green
3. If failures discovered → fix regressions
4. Phase 8 complete (all tests passing)

**Existing Test Inventory** (DO NOT rebuild):

| Test File | Tests | Coverage | Notes |
|-----------|-------|----------|-------|
| `crash-recovery.test.ts` | 3 | Crash detection, DLQ quarantine on restart, batch quarantine | Comprehensive Phase 7 validation |
| `scanner-watcher.test.ts` | 3 | Scanner detects missed events, atomic claim cooperation, remote workspace | Comprehensive Phase 6 validation |
| `flood-protection.test.ts` | 2 | Circuit breaker trigger, auto-recovery after window | Unit tests (sufficient coverage) |
| `event-writer.test.ts` | 8 | Backpressure, queue depth, memory management | Unit tests (sufficient coverage) |
| `dlq.test.ts` | 5 | DLQ marker creation, metadata fields, idempotency | Unit tests (marker creation only) |

**NEW Test Inventory** (Phase 8 additions):

**NONE** - All resilience features already have sufficient test coverage. Phase 8 is validation-only.

### Step-by-Step Implementation Outline

**Phase: Verify All Tests Pass** (T001)
1. Run all unit tests locally:
   - `npm test` (runs unit tests via Vitest)
   - Verify all pass: flood-protection, event-writer, dlq, scanner, crash-recovery (unit), cleaner-dlq
2. Run all integration tests locally:
   - crash-recovery.test.ts (3 tests)
   - scanner-watcher.test.ts (3 tests)
   - Verify all pass
3. If any failures → fix regressions → iterate to GREEN
4. Phase 8 complete (validation-only phase)

### Commands to Run

**Environment Setup**:
```bash
# Verify workspace is in a clean state
git status

# Ensure dependencies are installed
npm install

# Build extension
just build
```

**Test Execution** (local validation):
```bash
# Run all unit tests (Vitest)
npm test

# Run all integration tests (Extension Host)
cd /workspaces/vsc-bridge-devcontainer/packages/extension
npm test

# Run specific integration test file (if debugging)
npm test -- test/integration/crash-recovery.test.ts
npm test -- test/integration/scanner-watcher.test.ts
```

### Risks & Unknowns

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Test regressions since Phase 7** | Low | Low | Run all tests, fix any failures before marking Phase 8 complete |
| **Integration test flakiness** | Low | Medium | Re-run failing tests to identify non-deterministic failures |

**Resolved Unknowns**:
- ✅ **DLQ Script Failure Coverage**: Confirmed covered by flood-protection.test.ts (executor exception → E_INTERNAL → DLQ)
- ✅ **No new tests needed**: All resilience features have sufficient unit + integration test coverage

### Ready Check

**Prerequisites before starting implementation:**

- [x] Phase 7 (Crash Recovery) is complete and all tests passing
- [x] Extension builds successfully (`just build` passes)
- [x] Confirmed all resilience features have sufficient test coverage (no new tests needed)

**Alignment verification:**

- [x] Reviewed existing test coverage (unit + integration)
- [x] Confirmed DLQ script failure covered by flood-protection.test.ts
- [x] Understand this is validation-only phase (no new code)
- [x] CI automation deferred to future work

**GO/NO-GO Decision Point:**

- [ ] **GO**: All prerequisites met, ready to run validation tests
- [ ] **NO-GO**: Missing prerequisites or test failures → resolve blockers first

---

## Phase Footnote Stubs

**Note**: Footnotes will be added during `/plan-6-implement-phase` execution. This section is a placeholder for the implementation log to reference specific code changes via substrate node IDs.

Footnotes will follow this format:
```markdown
[^P8-1]: Phase 8 T001 - Description
  - `file:path/to/file` - What changed
  - Details about implementation
```

---

## Evidence Artifacts

**Execution Log**: `/workspaces/vsc-bridge-devcontainer/docs/plans/14-bridge-resilience/tasks/phase-8-incremental-integration-tests/execution.log.md`

This log will capture:
- Unit test validation results (all tests green)
- Integration test validation results (crash-recovery, scanner-watcher all green)
- Any test failures discovered and fixed
- Final validation: All tests pass locally

---

## Directory Layout

```
docs/plans/14-bridge-resilience/
├── bridge-resilience-plan.md
└── tasks/
    └── phase-8-incremental-integration-tests/
        ├── tasks.md                    # This file
        └── execution.log.md            # Created by /plan-6
```

**Integration Test Files** (validation targets):
```
packages/extension/test/integration/
├── crash-recovery.test.ts              # Existing (Phase 7) - 3 tests
└── scanner-watcher.test.ts             # Existing (Phase 6) - 3 tests
```

**Unit Test Files** (validation targets):
```
packages/extension/test/core/fs-bridge/
├── flood-protection.test.ts            # Circuit breaker, DLQ on executor failure
├── event-writer.test.ts                # Backpressure, queue depth
├── dlq.test.ts                         # DLQ marker creation
├── scanner.test.ts                     # Scanner unit tests
├── crash-recovery.test.ts              # Crash detection logic
└── cleaner-dlq.test.ts                 # Cleaner + DLQ interaction
```

---

**STOP**: Do **not** implement code. This dossier defines the Phase 8 tasks and alignment contract. Wait for explicit **GO** from the human sponsor before proceeding to `/plan-6-implement-phase`.
