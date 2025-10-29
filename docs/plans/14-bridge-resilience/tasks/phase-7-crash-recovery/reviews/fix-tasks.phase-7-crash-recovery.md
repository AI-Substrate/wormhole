# Fix Tasks — Phase 7 Crash Recovery (TAD)

1. Tests-first: For each promoted test in `packages/extension/test/core/fs-bridge/crash-recovery.test.ts`, add the full Test Doc block (Why / Contract / Usage Notes / Quality Contribution / Worked Example) before modifying assertions; rerun `npx vitest run test/core/fs-bridge/crash-recovery.test.ts` to confirm green.
2. Tests-first: Implement the restart integration test promised in T020 at `packages/extension/test/integration/crash-recovery.test.ts` with a TAD Test Doc block; use the Extension Host harness to exercise crash recovery across a restart; only adjust implementation if the new test fails.
3. Documentation: Regenerate and store `vitest-crash-recovery.log` and `just-build.log` under `docs/plans/14-bridge-resilience/tasks/phase-7-crash-recovery/` (or update Evidence Artifacts if plans change) after running the commands.
4. Naming polish (optional after GREEN): Rename the promoted tests to the Given-When-Then format for consistency with the TAD template, keeping the existing identifiers inside the Test Doc blocks.
