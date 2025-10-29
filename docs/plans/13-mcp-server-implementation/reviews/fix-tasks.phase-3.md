**Fix Tasks — Phase 3: Tool Generator**

1. `cli/test/integration-mcp/tool-generator.test.ts` ⇄ `cli/src/lib/mcp/tool-generator.ts`  
   - *Tests-first*: During the re-run of `/plan-6`, stash or branch off the current implementation, stub out the generator so the suite fails, and execute `npx vitest run cli/test/integration-mcp/tool-generator.test.ts` to capture the RED state in the execution log.  
   - *Implementation*: Reapply the production logic, rerun the same command to show GREEN, and update `docs/plans/13-mcp-server-implementation/tasks/phase-3/execution.log.md` with both outputs plus brief commentary on the fix.

2. `docs/plans/13-mcp-server-implementation/tasks/phase-3/tasks.md`  
   - Mark each completed task `[x]`, append footnote tags beside the relevant rows, and fill the “Phase Footnote Stubs” table with concrete entries (one per changed path) that reference the substrate node IDs required by `AGENTS.md`.  
   - Add the matching footnote definitions at the bottom of the dossier so reviewers can trace every change.
