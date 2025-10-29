**Verdict**: REQUEST_CHANGES

**Summary**
- Pickup stage ignores caller-specified total timeout when it is lower than `PICKUP_TIMEOUT_MS`, so `runCommand` waits about five seconds and returns `E_PICKUP_TIMEOUT` instead of respecting the configured deadline (violates spec AC10).
- Regression coverage for this scenario is missing; please add a RED test before adjusting the implementation.

**Checklist**

**Testing Approach: Full TDD**
- [x] Tests precede code (RED-GREEN-REFACTOR evidence provided)
- [x] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec: Targeted
- [ ] Negative/edge cases covered (missing case where total timeout < pickup window)

**Universal**
- [x] BridgeContext patterns followed (Uri, RelativePattern, module: 'pytest')
- [x] Only in-scope files changed
- [ ] Linters/type checks are clean (vitest command blocked by sandbox; please rerun locally)
- [x] Absolute paths used (no hidden context)

**Findings Table**
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F1 | HIGH | packages/cli/src/lib/fs-bridge.ts:194 | Pickup wait ignores total timeout when caller supplies <5s, causing five-second delay and `E_PICKUP_TIMEOUT` instead of honoring the absolute deadline (spec AC10). | Pass `Math.min(totalTimeout, PICKUP_TIMEOUT_MS)` into pickup wait, detect when the total budget is exhausted, return `E_TIMEOUT`, and add a regression test covering `timeout < PICKUP_TIMEOUT_MS`. |

**Inline Comments**
- `packages/cli/src/lib/fs-bridge.ts:194`
  ```ts
  const pickupResult = await waitForPickupAck(jobDir, PICKUP_TIMEOUT_MS);
  if (!pickupResult.claimed) {
    return makeErrorEnvelope(
      'E_PICKUP_TIMEOUT',
      `Bridge did not pick up job within 5 seconds. The extension may be overloaded, at capacity, crashed, or not installed. If extension crashed, try restarting VS Code. Check bridge logs and capacity settings (MAX_CONCURRENT). Check that VS Code is running with vsc-bridge extension installed. Installation instructions: [TBD]`
    );
  }
  ```
  `waitForPickupAck` always waits up to `PICKUP_TIMEOUT_MS` (five seconds). When callers pass `opts.timeout = 300` (existing test uses 300ms) and the bridge never claims the job, `runCommand` now blocks for roughly five seconds and returns `E_PICKUP_TIMEOUT`, violating spec AC10 which requires the total timeout to be an absolute deadline. Please bound the pickup wait by `totalTimeout` (for example, `const pickupLimit = Math.min(totalTimeout, PICKUP_TIMEOUT_MS)`) and, if the elapsed pickup time consumes the total budget, surface `E_TIMEOUT`. Add a regression test exercising this path so the failure reproduces (RED) before the fix.

**Coverage Map**
| AC | Status | Evidence |
|----|--------|----------|
| AC1 | Met | `packages/cli/test/lib/fs-bridge.test.ts:1000` (`should use remaining timeout after fast pickup`) demonstrates remaining-time calculation. |
| AC2 | Met | `packages/cli/test/lib/fs-bridge.test.ts:1154` (`should enforce absolute deadline across both phases`) shows execution uses the adjusted timeout. |
| AC3 | Met | Same test enforces the absolute deadline once pickup succeeds. |
| AC4 | Not Met | Scenario where pickup duration reaches/exceeds the total timeout currently waits five seconds and returns `E_PICKUP_TIMEOUT`. No automated coverage; new regression needed. |
| AC5 | Partially Met | Phase 4 tests cover several timing cases, but the missing AC4 regression leaves a gap in timeout math verification. |
| AC6 | Pending | Execution log claims full suite green; reviewer could not rerun vitest because sandbox denied `npx vitest run packages/cli/test/lib/fs-bridge.test.ts`. |

**Commands Executed**
- `git diff`
- `npx vitest run packages/cli/test/lib/fs-bridge.test.ts` (fails in sandbox: `Sandbox(LandlockRestrict)`)

**Decision & Next Steps**
- Reviewer: Codex
- Status: REQUEST_CHANGES — please complete `docs/plans/15-fast-fail-job-submission/reviews/fix-tasks.phase-4-two-phase-timeout-logic.md` before re-running plan-6.

**Footnotes Audit**
| Path | Footnote Tags | Ledger Reference |
|------|---------------|------------------|
| packages/cli/src/lib/fs-bridge.ts | [^3] | [`function:packages/cli/src/lib/fs-bridge.ts:runCommand`](../../../../packages/cli/src/lib/fs-bridge.ts#L140) |
| packages/cli/test/lib/fs-bridge.test.ts | [^2] | [`describe:packages/cli/test/lib/fs-bridge.test.ts:Two-Phase Timeout Logic (Phase 4)`](../../../../packages/cli/test/lib/fs-bridge.test.ts#L975) |
