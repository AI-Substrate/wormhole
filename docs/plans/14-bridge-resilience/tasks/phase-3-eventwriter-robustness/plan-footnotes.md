# Phase 3 Flowspace Footnotes for Main Plan

**Purpose**: These footnotes should be added to the main plan's "Change Footnotes Ledger" section.

**Footnote Range**: [^12] through [^18] (continuing from Phase 2's [^11])

---

## Footnotes to Add to bridge-resilience-plan.md

Copy these footnotes to the "Change Footnotes Ledger" section at the bottom of `/workspaces/vsc-bridge-devcontainer/docs/plans/14-bridge-resilience/bridge-resilience-plan.md`:

```markdown
[^12]: Phase 3 T004 - Modified [`method:packages/extension/src/core/fs-bridge/processor.ts:EventWriter.ensureStream`](../../packages/extension/src/core/fs-bridge/processor.ts#L38-L48) and [`method:packages/extension/src/core/fs-bridge/processor.ts:EventWriter.writeLine`](../../packages/extension/src/core/fs-bridge/processor.ts#L50-L101) – Added per-write error event handlers that set lastError and reject promise on stream errors (centralized KISS error handling).

[^13]: Phase 3 T006 - Modified [`class:packages/extension/src/core/fs-bridge/processor.ts:EventWriter`](../../packages/extension/src/core/fs-bridge/processor.ts#L29-L34) – Added `lastError: Error | null = null` field to track stream error state for fail-fast behavior. Modified [`method:packages/extension/src/core/fs-bridge/processor.ts:EventWriter.writeLine`](../../packages/extension/src/core/fs-bridge/processor.ts#L50-L101) – Rewrote with comprehensive error handling including settled flag pattern and listener cleanup.

[^14]: Phase 3 T007 - Modified [`method:packages/extension/src/core/fs-bridge/processor.ts:EventWriter.writeEvent`](../../packages/extension/src/core/fs-bridge/processor.ts#L103-L129) – Added fail-fast error checks at function entry (lastError and closed state). Fixed critical promise chaining bug discovered by subagent: now correctly awaits the same promise assigned to pendingWrites (not the old promise), preventing writes from resolving out of order.

[^15]: Phase 3 T009-T010 - Modified [`method:packages/extension/src/core/fs-bridge/processor.ts:EventWriter.close`](../../packages/extension/src/core/fs-bridge/processor.ts#L144-L174) – Enhanced to await pendingWrites chain before calling stream.end(). Added 5-second timeout protection that REJECTS promise on timeout (per /didyouknow Insight #2: prevents silent data loss). Added idempotency check for already-closed state.

[^16]: Phase 3 T010a - Modified [`function:packages/extension/src/core/fs-bridge/processor.ts:processCommand`](../../packages/extension/src/core/fs-bridge/processor.ts#L456-L464) – Wrapped eventWriter.close() in try/catch block in finally clause to ensure done marker is always written even if close() fails (KISS approach for client unblocking per /didyouknow Insight #3).

[^17]: Phase 3 T011-T011b - CORE heuristic review completed. Applied criteria (Critical, Opaque, Regression-prone, Essential) to 13 scratch probe tests. Selected 7 tests for promotion (exceeds 3-4 guideline, justified by component criticality). Enhanced close timeout test in scratch probe 03 to actually trigger 5-second timeout. Documented all findings in [`file:scratch-probe-findings.md`](tasks/phase-3-eventwriter-robustness/scratch-probe-findings.md).

[^18]: Phase 3 T012-T020 - **PIVOT FROM PLAN**: Discovered extension uses Vitest (not Mocha as originally assumed). Created [`file:test/core/fs-bridge/event-writer.test.ts`](../../packages/extension/test/core/fs-bridge/event-writer.test.ts) with all 7 promoted tests at once (not one-by-one as planned). Tests: backpressure (2), error handling (3), close (2). All 7/7 passing ✅. TypeScript compilation passing ✅. Scratch probes deleted after successful promotion. Modified [`file:packages/extension/package.json`](../../packages/extension/package.json#L71) test script and [`file:justfile`](../../justfile#L64) to run EventWriter tests.
```

---

## File References Summary

All changes in this phase were concentrated in a single file:

**`/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/fs-bridge/processor.ts`**

Modified sections:
- **Lines 34**: Added lastError field
- **Lines 38-48**: Enhanced ensureStream() documentation
- **Lines 50-101**: Rewrote writeLine() with comprehensive error handling
- **Lines 103-129**: Enhanced writeEvent() with fail-fast checks and promise fix
- **Lines 144-174**: Enhanced close() with timeout and pending writes handling
- **Lines 456-464**: Added try/catch wrapper in processCommand()

---

## Test Files Created (Scratch Probes)

These files were created during TAD cycles:

1. `/workspaces/vsc-bridge-devcontainer/packages/extension/test/scratch/event-writer/01-backpressure-probe.test.ts`
2. `/workspaces/vsc-bridge-devcontainer/packages/extension/test/scratch/event-writer/02-error-probe.test.ts`
3. `/workspaces/vsc-bridge-devcontainer/packages/extension/test/scratch/event-writer/03-close-probe.test.ts`

**Status**: To be deleted in T018 after promotion to permanent tests.

---

## Key Insights Referenced in Footnotes

- **/didyouknow Insight #1**: Fail-fast error handling (no swallowing errors)
- **/didyouknow Insight #2**: Timeout must REJECT promise to prevent data loss
- **/didyouknow Insight #3**: KISS try/catch wrapper for done marker
- **Subagent debugging**: Promise chaining bug discovered in collaborative session

---

## Progress Summary

- **Tasks Complete**: T001-T020 (20/20 tasks = 100%)
- **Scratch Tests**: 13 tests created (validated implementation)
- **Promoted Tests**: 7 tests in Vitest (all passing)
- **Lines Modified**: ~150 lines across 6 methods/functions
- **Critical Bug Fixed**: Promise chaining in writeEvent()
- **Phase Status**: COMPLETE ✅

---

**Document Status**: READY FOR PLAN UPDATE
**Last Updated**: 2025-10-17
