# Phase 2 Review Fix Tasks

Testing Approach: Lightweight — prioritize real CLI workflows and documented validation of critical paths.

## Critical

1. **Restore Phase 2 provenance graph**  
   - Files: `docs/plans/16-npx-github-installation/tasks/phase-2/tasks.md`, `docs/plans/16-npx-github-installation/tasks/phase-2/execution.log.md`, `docs/plans/16-npx-github-installation/npx-github-installation-plan.md` (§8, §12)
   - Issue: Tasks table still `[ ]`, Notes lack `log#...` anchors, and no Phase 2 footnotes exist; plan ledger stops at [^9].  
   - Fix: Update task statuses to `[x]/[~]`, add `log#t00x-...` anchors in Notes, insert `[📋]` links in the plan, populate the Phase 2 footnote table, and extend the ledger with FlowSpace node IDs referencing each modified file (e.g. `function:src/index.ts:main`).  
   - Validation: Re-run plan-graph validators or manually verify task ↔ log ↔ footnote navigation; ensure every ledger entry points to a file touched in this diff.

## High

2. **Repair justfile manifest recipe**  
   - File: `justfile` (lines ~20-23)  
   - Issue: `just build-manifest` still executes `scripts/build-manifest.ts`, which no longer exists, causing `just build` to fail.  
   - Fix: Point the recipe at `scripts/build-manifest.cts` (and adjust any related references such as `npx tsx scripts/build-manifest.cts`).  
   - Validation: Run `just build` and attach the successful output in `execution.log.md`.

3. **Update CLI workflow recipes after workspace removal**  
   - File: `justfile` (recipes around lines 79-331, plus dynamic helpers later in the file)  
   - Issue: Commands still `cd packages/cli`, but Phase 1 removed that directory; the recipes now crash.  
   - Fix: Execute CLI tasks from the repo root using the new package layout (e.g. `npm run test:integration:cli`, `node dist/index.js ...`, `npm link`). Ensure each helper produces the behavior promised in documentation.  
   - Validation: Re-run key lightweight checks (`just build-cli`, `just cli-link`, relevant sample scripts) and capture the outputs under the corresponding tasks in `execution.log.md`.

4. **Remove out-of-scope Plan 17 artefacts**  
   - Files: `docs/plans/17-automated-vsix-releases-plan.md`, related spec/tasks created in this diff  
   - Issue: New Plan 17 documents were added without Phase 2 authorization.  
   - Fix: Drop these files from the Phase 2 branch or move them to a new branch/phase tied to the appropriate plan step.  
   - Validation: Confirm `git status` shows only Phase 2 files; document the clean scope in the execution log.

## Medium

5. **Record dist content verification**  
   - Files: `docs/plans/16-npx-github-installation/tasks/phase-2/execution.log.md` (T033/T034 entries)  
   - Issue: No evidence that `dist/` contains the compiled JS and manifest; dossier acceptance criteria expect it.  
   - Fix: After rebuilding, run `ls -la dist/` and document the output (include manifest + index).  
   - Validation: Add the command/output to the execution log and link it from the relevant task row.

## Lightweight Testing Guidance
- Re-run the lightweight validation checklist once fixes land: `npm run prepare`, `just build`, `just build-cli`, `just cli-link`, `node dist/index.js --help`.  
- Capture outputs under the corresponding tasks in the execution log and update the checklist status in the dossier.
