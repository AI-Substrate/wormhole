# Phase 1 Review

## A) Verdict
REQUEST_CHANGES

## B) Summary
- Promoted Vitest cases ship without the mandated TAD Test Doc blocks.
- Capacity-limit integration test (T006) still missing, so a phase acceptance criterion is unmet.
- Concurrency timing assertion is fragile (<100 ms window) and flakes on slower filesystems cited in the plan.
- Auto-generated `schemas.ts` timestamp drifted without scope justification or footnote coverage.
- Execution log records a Full TDD workflow and omits CORE promotion notes, diverging from the approved TAD doctrine.

## C) Checklist — Testing Approach: TAD (Mock usage: Targeted)
- [ ] Promoted tests have complete Test Doc blocks (Why/Contract/Usage/Quality/Example)
- [x] Test names follow Given-When-Then format
- [ ] Promotion heuristic applied (tests add durable value)
- [x] tests/scratch/ excluded from CI
- [ ] Promoted tests are reliable (no network/sleep/flakes; performance per spec)
- [x] Mock usage matches spec in promoted tests: Targeted
- [ ] Scratch exploration documented in execution log
- [ ] Test Doc blocks read like high-fidelity documentation

### Universal
- [x] BridgeContext patterns followed (Uri, RelativePattern, module: 'pytest')
- [ ] Only in-scope files changed
- [x] Linters/type checks are clean
- [x] Absolute paths used (no hidden context)

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F1 | CRITICAL | packages/extension/test/fs-bridge/concurrent-execution.test.ts:49 | Promoted tests lack the required TAD Test Doc blocks | Add full Test Doc blocks (Why/Contract/Usage Notes/Quality Contribution/Worked Example) before each promoted test per the plan template. |
| F2 | HIGH | docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/execution.log.md:261 | T006 integration test deferred, leaving the phase acceptance criterion unmet | Implement the capacity-limit integration test (real watcher + slow executor) and capture passing evidence. |
| F3 | HIGH | packages/extension/test/fs-bridge/concurrent-execution.test.ts:149 | Concurrency assertion relies on <100 ms spread and will flake on slower disks (e.g., WSL) | Refactor to prove overlap without tight timing thresholds (use promise latches or relaxed instrumentation). |
| F4 | HIGH | packages/extension/src/vsc-scripts/generated/schemas.ts:2 | Auto-generated schema timestamp changed outside Phase 1 scope/footnotes | Revert the timestamp drift (or explicitly scope it via ledger entry), keeping this phase diff focused. |
| F5 | MEDIUM | docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/execution.log.md:5 | Execution log claims Full TDD and omits CORE promotion rationale, conflicting with TAD doctrine | Document scratch exploration and CORE promotion decisions, or update planning artifacts to authorize the deviation. |
| F6 | LOW | docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/tasks.md:356 | Phase footnotes use code spans instead of required clickable links | Reformat footnotes using `[label](path#Lline)` hyperlinks for traceability. |

## E) Inline Comments
- `packages/extension/test/fs-bridge/concurrent-execution.test.ts:49`  
  Needs the full Test Doc block (Why/Contract/Usage Notes/Quality Contribution/Worked Example) before each promoted test to satisfy the TAD template.
- `packages/extension/test/fs-bridge/concurrent-execution.test.ts:149`  
  50 ms wait and <100 ms spread thresholds are brittle on WSL; rewrite the test to demonstrate concurrency without strict timing.
- `docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/execution.log.md:5`  
  Execution log must reflect the approved TAD workflow (scratch → CORE promotion) rather than Full TDD.
- `docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/execution.log.md:261`  
  Phase acceptance criteria still require the integration test; complete T006 instead of deferring.
- `packages/extension/src/vsc-scripts/generated/schemas.ts:2`  
  Timestamp change is out of scope/footnote; revert or explicitly scope it.
- `docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/tasks.md:356`  
  Replace code-span footnote references with clickable links per repository guidance.

## F) Coverage Map

| Acceptance Criterion | Evidence | Status |
|----------------------|----------|--------|
| Up to 10 jobs execute concurrently | `given_10_jobs_when_launched_then_all_start_within_100ms` (packages/extension/test/fs-bridge/concurrent-execution.test.ts:132) | Covered, but flaky (F3) |
| Job 11+ receives E_CAPACITY error | `given_capacity_exceeded_when_launchJob_called_then_E_CAPACITY_written` (packages/extension/test/fs-bridge/concurrent-execution.test.ts:71) | Covered |
| Failed job doesn't block others | `given_job_fails_when_executing_then_inFlight_decrements` (packages/extension/test/fs-bridge/concurrent-execution.test.ts:108) | Covered |
| inFlight counter correctly managed | `given_capacity_available_when_launchJob_called_then_job_starts` & `given_job_fails_when_executing_then_inFlight_decrements` | Covered |
| Integration test validates capacity limit | No implementation; execution log marks T006 deferred | Missing (F2) |
| TypeScript strict mode passes | `just build` evidence in execution.log.md:193 | Documented (rerun after fixes) |
| No mocks for async operations | Tests use targeted executor stubs; filesystem remains real | Covered |

## G) Commands Executed
```
ls
ls
sed -n '1,200p' bridge-resilience-plan.md
rg -n "Testing Philosophy" -n
sed -n '279,360p' bridge-resilience-plan.md
sed -n '1,200p' tasks.md
sed -n '200,400p' tasks.md
rg -n "Change Footnotes Ledger"
sed -n '2379,2440p' bridge-resilience-plan.md
sed -n '1,200p' execution.log.md
sed -n '200,400p' execution.log.md
PAGER=cat git status -sb
PAGER=cat git diff --unified=3 -- packages/extension/src/core/fs-bridge/processor.ts
PAGER=cat git diff --unified=3 -- packages/extension/src/core/fs-bridge/types.ts
PAGER=cat git diff --unified=3 -- packages/extension/src/core/fs-bridge/index.ts
sed -n '1,200p' packages/extension/test/fs-bridge/concurrent-execution.test.ts
PAGER=cat git diff --unified=3 -- packages/extension/src/vsc-scripts/generated/schemas.ts
PAGER=cat git diff --unified=3 -- docs/plans/14-bridge-resilience/bridge-resilience-plan.md
PAGER=cat git diff --unified=3 -- docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/tasks.md
nl -ba packages/extension/src/core/fs-bridge/processor.ts | sed -n '1,220p'
nl -ba packages/extension/src/core/fs-bridge/index.ts | sed -n '1,260p'
nl -ba packages/extension/src/core/fs-bridge/index.ts | sed -n '260,420p'
nl -ba packages/extension/test/fs-bridge/concurrent-execution.test.ts | sed -n '1,200p'
nl -ba docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/execution.log.md | sed -n '1,200p'
sed -n '420,520p' packages/extension/src/core/fs-bridge/processor.ts
rg -n "T006" docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/execution.log.md
nl -ba docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/execution.log.md | sed -n '240,320p'
nl -ba packages/extension/src/vsc-scripts/generated/schemas.ts | sed -n '1,40p'
rg "Test Doc" packages/extension/test/fs-bridge/concurrent-execution.test.ts
rg -n "schemas.ts" docs/plans/14-bridge-resilience
nl -ba docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/tasks.md | sed -n '340,380p'
```

## H) Decision & Next Steps
REQUEST_CHANGES. Recommended follow-up (TAD-aligned order):
1. Draft the Test Doc blocks (Why/Contract/Usage Notes/Quality Contribution/Worked Example) for each promoted test, then update the test file.
2. Document scratch exploration and CORE promotion rationale in the execution log (or adjust planning artifacts to authorize deviation).
3. Implement the capacity-limit integration test (write it first) and capture passing evidence/logs.
4. Refactor the concurrency test to avoid fragile timing thresholds.
5. Revert the unintended `schemas.ts` timestamp change (or explicitly scope it with ledger entries).
6. Update phase footnotes to clickable links for traceability.

## I) Footnotes Audit

| Path | Footnote Tags | Ledger Entry | Notes |
|------|---------------|--------------|-------|
| packages/extension/src/core/fs-bridge/processor.ts | [^1], [^3] | Present in plan & phase doc | Links are non-clickable code spans |
| packages/extension/src/core/fs-bridge/types.ts | [^2] | Present | Non-clickable |
| packages/extension/src/core/fs-bridge/index.ts | [^4], [^5] | Present | Non-clickable |
| packages/extension/test/fs-bridge/concurrent-execution.test.ts | [^6] | Present | Non-clickable |
| docs/plans/14-bridge-resilience/bridge-resilience-plan.md | [^1]–[^6] | Present | Non-clickable |
| docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/tasks.md | [^1]–[^6] | Present | Non-clickable |
| docs/plans/14-bridge-resilience/tasks/phase-1-worker-pool-infrastructure/execution.log.md | — | Not required | — |
| packages/extension/src/vsc-scripts/generated/schemas.ts | — | Missing | Scope violation — revert or footnote |
