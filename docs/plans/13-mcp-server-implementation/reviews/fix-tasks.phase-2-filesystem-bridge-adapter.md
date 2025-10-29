## Fix Tasks – Phase 2 Filesystem Bridge Adapter

1. **Restore TDD Evidence (CRITICAL)**  
   - Tests-first: capture a RED run for the Phase 2 test suite (e.g., add the new cancellation assertion first, run `npm test -- bridge-adapter.test.ts` to show failure).  
   - Then adjust implementation/logs so that the GREEN run succeeds and update `execution.log.md` with the RED→GREEN sequence.  
   - Files: `docs/plans/13-mcp-server-implementation/tasks/phase-2/execution.log.md`, `cli/test/integration-mcp/bridge-adapter.test.ts`, `cli/src/lib/mcp/bridge-adapter.ts` (if code adjustments needed).

2. **Remove Out-of-Scope File (HIGH)**  
   - Drop `AGENTS.md` from this phase or document scope expansion inside `tasks.md` with the required footnote entry.  
   - Ensure the phase’s file list matches the diff before resubmitting.

3. **Correct Footnote Anchors (MEDIUM)**  
   - Update `tasks.md` footnote [^9] links to the actual lines (`executeToolViaBridge` at `cli/src/lib/mcp/bridge-adapter.ts:123`, `wrapSuccessResponse` at `:182`, `wrapErrorResponse` at `:220`).  
   - Verify the ledger in `mcp-server-implementation-plan.md` mirrors the corrected anchors.

4. **Strengthen Cancellation Test (MEDIUM)**  
   - Tests-first: extend `bridge-adapter.test.ts` to assert a concrete cancellation outcome (e.g., expect the cancel sentinel file to appear at `jobDir/cancel` soon after abort, or assert the result’s `structuredContent.error.code` is `E_TIMEOUT` within a bounded window).  
   - Run `npm test -- bridge-adapter.test.ts` and record RED→GREEN in the execution log.  
   - Update code only if needed to satisfy the stronger assertion.
