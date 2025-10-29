A) Verdict  
REQUEST_CHANGES (TAD documentation gate + integration acceptance remain open)

B) Summary  
Crash detection logic and startup ordering look solid, but the promoted tests skip the mandatory TAD Test Doc blocks and the phase never delivered the restart integration test promised in the brief. Supporting evidence artifacts the plan calls for are also missing, so the phase cannot pass the review checklist yet.

C) Checklist  
Testing Approach: Test-Assisted Development (TAD); Mock usage preference: Targeted  
[ ] Promoted tests have complete Test Doc blocks (Why/Contract/Usage/Quality/Example)  
[ ] Test names follow Given-When-Then format  
[x] Promotion heuristic applied (tests add durable value)  
[x] tests/scratch/ excluded from CI (no scratch tests committed)  
[x] Promoted tests are reliable (no network/sleep/flakes; performance OK)  
[x] Mock usage matches spec in promoted tests: Targeted  
[ ] Scratch exploration documented in execution log  
[ ] Test Doc blocks read like high-fidelity documentation  

Universal:  
[x] BridgeContext patterns followed (uses established fs-bridge Node filesystem patterns)  
[x] Only in-scope files changed (phase footnotes map to all touched paths)  
[ ] Linters/type checks are clean (no build/test logs archived in Evidence section)  
[x] Absolute paths used (no hidden context)

D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F1 | CRITICAL | packages/extension/test/core/fs-bridge/crash-recovery.test.ts:160 | Promoted tests lack the required TAD Test Doc blocks (many have none; T014a omits Usage Notes & Worked Example) despite the plan’s “all tests follow” directive. | Before touching code, add the full Test Doc comment (Why/Contract/Usage Notes/Quality Contribution/Worked Example) inside every promoted `it(...)`; mirror the template shown in tasks.md §Test Doc Block Format. |
| F2 | HIGH | docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md:253 | The phase brief requires an E2E restart integration test (T020), but no `test/integration/crash-recovery.test.ts` landed; behavior checklist not satisfied. | Write the restart integration test with a TAD Test Doc block, exercising crash recovery across an Extension Host restart, then keep or adjust implementation as needed. |
| F3 | MEDIUM | docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md:572 | Evidence ledger lists `vitest-crash-recovery.log` and `just-build.log`, yet the phase directory only holds `tasks.md` and `execution.log.md`. | Re-run the documented commands and store the logs under the named files (or update Evidence Artifacts to reflect reality). |
| F4 | LOW | packages/extension/test/core/fs-bridge/crash-recovery.test.ts:160 | Test names keep the “FS-BRIDGE-…” phrasing instead of the Given-When-Then style mandated by the TAD template. | Rename tests to `given_<context>_when_<action>_then_<outcome>` (keep the identifier in the Test Doc block if needed). |

E) Inline Comments
- packages/extension/test/core/fs-bridge/crash-recovery.test.ts:160 — Please add the full Test Doc block (Why/Contract/Usage Notes/Quality Contribution/Worked Example) inside each promoted test before the assertions.  
  ```ts
  it('FS-BRIDGE-CRASH-RECOVERY-004: should return zero crashes on clean startup', async () => {
  ```
- packages/extension/test/core/fs-bridge/crash-recovery.test.ts:446 — The T014a Test Doc still lacks Usage Notes and a Worked Example; flesh those out so it meets the TAD template.  
  ```ts
  /**
   * Test ID: CRASH-RECOVERY-T014a
  ```
- docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md:253 — Plan still expects the restart integration test (T020), but no such test shipped; deliver the test or revise the plan with approval.  
  ```md
  **E2E Integration Test** (T020): Full restart simulation with Extension Host
  ```
- docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md:572 — Evidence list names `vitest-crash-recovery.log` / `just-build.log`, yet the directory lacks them; please add the artifacts or update the ledger.  
  ```md
  - Test output logs: `vitest-crash-recovery.log`
  ```

F) Coverage Map

| Acceptance Criterion | Evidence |
|----------------------|----------|
| Scan execute directory for crashed jobs | T003/T007/T008 (`packages/extension/test/core/fs-bridge/crash-recovery.test.ts`:128,188,208). |
| Move crashed jobs to DLQ with reason `E_CRASH_RECOVERY` | T005/T014 (`packages/extension/test/core/fs-bridge/crash-recovery.test.ts`:328,405) verify marker contents. |
| Log recovery actions to VS Code OutputChannel | T006 (`packages/extension/test/core/fs-bridge/crash-recovery.test.ts`:328) asserts OutputChannel logging. |
| Handle edge cases gracefully (malformed JSON, permissions, ENOENT) | Malformed JSON covered via T009 (`packages/extension/test/core/fs-bridge/crash-recovery.test.ts`:357); permissions/ENOENT remain untested (T012/T013 deferred). |
| No reprocessing attempts | Behaviour enforced by `detectCrashedJobs` implementation (`packages/extension/src/core/fs-bridge/recovery.ts`:62-151); no dedicated regression test. |
| Integration test simulates process restart | Not covered — T020 deferred; no integration test file present. |

G) Commands Executed  
`ls docs/plans/14-bridge-resilience`; `sed -n '1,200p' docs/plans/14-bridge-resilience/bridge-resilience-plan.md`; `rg -n "Testing" docs/plans/14-bridge-resilience/bridge-resilience-plan.md`; `sed -n '279,380p' docs/plans/14-bridge-resilience/bridge-resilience-plan.md`; `ls docs/plans/14-bridge-resilience/tasks`; `ls docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery`; `sed -n '1,200p' docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md`; `rg -n "\[\^" docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md`; `sed -n '1,200p' docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/execution.log.md`; `PAGER=cat git status --short`; `PAGER=cat git diff --unified=3 -- packages/extension/src/core/fs-bridge/recovery.ts`; `sed -n '1,200p' packages/extension/test/core/fs-bridge/crash-recovery.test.ts`; `sed -n '200,400p' packages/extension/test/core/fs-bridge/crash-recovery.test.ts`; `sed -n '400,600p' packages/extension/test/core/fs-bridge/crash-recovery.test.ts`; `PAGER=cat git diff --unified=3 -- packages/extension/src/core/fs-bridge/index.ts`; `sed -n '1,200p' packages/extension/src/core/fs-bridge/index.ts`; `sed -n '1,200p' packages/extension/src/core/fs-bridge/dlq.ts`; `rg -n "fileExists" packages/extension/src/core/fs-bridge/recovery.ts`; `sed -n '360,460p' packages/extension/src/core/fs-bridge/recovery.ts`; `rg -n "Acceptance" docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md`; `rg -n "Alignment" docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md`; `sed -n '42,120p' docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md`; `ls docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery`; `rg -n "Evidence" docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md`; `sed -n '560,620p' docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md`; `rg -n "scratch" docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/execution.log.md`; `sed -n '200,400p' docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/execution.log.md`; `rg -n "output" packages/extension/src/core/fs-bridge/index.ts`; `rg -n "output" packages/extension/src/core/fs-bridge/types.ts`; `nl -ba packages/extension/test/core/fs-bridge/crash-recovery.test.ts | sed -n '70,220p'`; `nl -ba packages/extension/test/core/fs-bridge/crash-recovery.test.ts | sed -n '320,460p'`; `nl -ba docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md | sed -n '10,120p'`; `nl -ba docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md | sed -n '120,200p'`; `nl -ba docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/tasks.md | sed -n '540,600p'`.

H) Decision & Next Steps (TAD-oriented fix tasks)  
1. For each promoted test in `packages/extension/test/core/fs-bridge/crash-recovery.test.ts`, author the full Test Doc block (Why/Contract/Usage Notes/Quality Contribution/Worked Example) before touching assertions, then keep the test green.  
2. Add the restart integration test promised in T020 (`packages/extension/test/integration/crash-recovery.test.ts`) with a TAD Test Doc block, exercising Extension Host restart and verifying DLQ quarantine; adjust implementation only if the test exposes gaps.  
3. Re-run `npx vitest run test/core/fs-bridge/crash-recovery.test.ts` and `just build`, archiving the outputs to `vitest-crash-recovery.log` and `just-build.log` under the phase directory (or update Evidence Artifacts accordingly).  
4. Optionally rename the promoted tests to the Given-When-Then format to satisfy the plan’s naming convention.

I) Footnotes Audit

| Path | Footnote Tags |
|------|---------------|
| packages/extension/test/core/fs-bridge/crash-recovery.test.ts | [^1], [^2] |
| packages/extension/src/core/fs-bridge/recovery.ts | [^3], [^4] |
| packages/extension/src/core/fs-bridge/index.ts | [^4] |

Footnote numbering is sequential (1–7) with unique mappings; no stray or missing references detected.
