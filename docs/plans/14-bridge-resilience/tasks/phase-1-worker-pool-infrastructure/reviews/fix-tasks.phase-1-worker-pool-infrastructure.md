# Phase 1 Fix Tasks (TAD Ordering)

1. **Reinstate TAD documentation workflow**
   - *Tests-first*: Capture scratch probe notes and CORE promotion decisions in `execution.log.md`; update the log to reflect TAD rather than Full TDD.
   - *Patch hint*: Add a “Scratch Exploration” section summarising probes and promotion rationale before the task summaries.

2. **Augment promoted unit tests with Test Doc blocks**
   - *Tests-first*: Draft the Test Doc narratives (Why/Contract/Usage Notes/Quality Contribution/Worked Example) for each of the four promoted tests.
   - *Patch hint*: Insert the block as a multiline comment immediately inside each `test(...)` in `packages/extension/test/fs-bridge/concurrent-execution.test.ts`.

3. **Stabilise concurrency coverage**
   - *Tests-first*: Redesign the concurrency validation to avoid fragile sub-100 ms timing assumptions; consider using a latch or counting barrier in the test.
   - *Patch hint*: Replace the fixed `setTimeout` waits with controlled promises that record when the executor starts; assert that multiple jobs begin before any finishes without hard timing thresholds.

4. **Implement capacity-limit integration test (T006)**
   - *Tests-first*: Create the Vitest integration test at `packages/extension/test/integration/capacity-limit.test.ts`, using a slow executor and real watcher flow as specified.
   - *Patch hint*: Follow the plan’s scenario: launch Extension Host (fixture), dispatch 11 jobs, expect 10 responses and one `E_CAPACITY` error; record evidence in `execution.log.md`.

5. **Revert out-of-scope schema timestamp change**
   - *Patch hint*: Restore `packages/extension/src/vsc-scripts/generated/schemas.ts` line 2 to the original generated-on date (or regenerate with scope justification and footnote if required).

6. **Upgrade phase footnotes to clickable links**
   - *Patch hint*: Convert each footnote entry in `tasks.md` and `bridge-resilience-plan.md` from code spans to Markdown links, e.g., `[file:packages/.../processor.ts](packages/extension/src/core/fs-bridge/processor.ts#L19)`.
