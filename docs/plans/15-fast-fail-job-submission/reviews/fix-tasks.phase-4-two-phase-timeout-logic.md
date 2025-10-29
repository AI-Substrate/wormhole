# Fix Tasks – Phase 4: Two-Phase Timeout Logic

1. [ ] Add regression test for respecting total timeout during pickup (tests-first)
   - Path: `packages/cli/test/lib/fs-bridge.test.ts`
   - Approach: extend the "Two-Phase Timeout Logic (Phase 4)" suite with a case such as `should respect total timeout when pickup exceeds budget`.
   - Expectations: use a payload with `opts.timeout = 300`, never write `claimed.json`, and assert that `result.error.code === 'E_TIMEOUT'` with total duration around 300ms (allowing a small margin, e.g., `< totalTimeout + 100`). This should RED today because the code waits ~5s and returns `E_PICKUP_TIMEOUT`.
   - Patch hint:
     ```ts
     it('should respect total timeout when pickup exceeds budget', { timeout: 5000 }, async () => {
       const totalTimeout = 300;
       const startTime = Date.now();
       const result = await runCommand(bridgeDir, payload, { timeout: totalTimeout });
       expect(result.error.code).toBe('E_TIMEOUT');
       expect(Date.now() - startTime).toBeLessThan(totalTimeout + 100);
     });
     ```

2. [ ] Update pickup timeout enforcement to honor the overall deadline
   - Path: `packages/cli/src/lib/fs-bridge.ts`
   - Steps:
     * Compute `pickupLimit = Math.min(totalTimeout, PICKUP_TIMEOUT_MS)` before invoking `waitForPickupAck`.
     * Pass `pickupLimit` into `waitForPickupAck`.
     * When the pickup phase finishes with `claimed === false`, compare `Date.now() - overallStartTime` to `totalTimeout`. Return `E_TIMEOUT` if the total budget is exhausted; otherwise continue returning `E_PICKUP_TIMEOUT` as before.
   - Patch hint:
     ```ts
     const pickupLimit = Math.min(totalTimeout, PICKUP_TIMEOUT_MS);
     const pickupResult = await waitForPickupAck(jobDir, pickupLimit);
     const pickupElapsed = Date.now() - overallStartTime;
     if (!pickupResult.claimed) {
       return pickupElapsed >= totalTimeout
         ? makeErrorEnvelope('E_TIMEOUT', `Command timed out after ${totalTimeout}ms`)
         : makeErrorEnvelope('E_PICKUP_TIMEOUT', pickupTimeoutMessage);
     }
     ```

3. [ ] Re-run `npx vitest run packages/cli/test/lib/fs-bridge.test.ts` (and broader suites if required) and attach the GREEN output to the execution log.
