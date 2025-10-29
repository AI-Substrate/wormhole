# Fix Tasks – Phase 5 Verbose Logging

| # | Status | Task | Success Criteria | Notes |
|---|--------|------|------------------|-------|
| 1 | [ ] | Restore CLI version short flag behaviour (tests first) | A new CLI regression test demonstrates that `vscb script -v` (and `exec -v`) still surfaces the version output; after the fix the test passes. | **Write test first**: add a minimal oclif command harness/unit test or cucumber-style smoke test that asserts the short version flag works. Then drop the verbose flag `char: 'v'` (or choose a non-conflicting alias) in `packages/cli/src/commands/{script,exec}.ts` and rerun the test. |
| 2 | [ ] | Populate Phase 5 footnotes | `docs/plans/15-fast-fail-job-submission/tasks/phase-5-verbose-logging/tasks.md` Notes column references unique footnote tags for every touched path and the footnote table at line 662 lists each tag with substrate links. | Update the plan-5 tasks file with footnotes covering `fs-bridge.ts`, `script.ts`, `exec.ts`, `bridge-adapter.ts`, and `fs-bridge.test.ts`. |
| 3 | [ ] | Update master Change Footnotes Ledger | `docs/plans/15-fast-fail-job-submission/fast-fail-job-submission-plan.md` “Change Footnotes Ledger” contains entries for the Phase 5 footnotes created in Task 2. | Mirror the Phase 5 footnote entries into the main plan ledger so reviewers can trace evidence centrally. |
| 4 | [ ] | Add integration coverage for verbose flag plumbing (tests first) | New automated coverage fails before the fix and passes after: (a) a CLI command test that ensures `flags.verbose` reaches `runCommand`, and (b) an MCP adapter test that asserts `opts.verbose === false` when invoking `executeToolViaBridge`. | Use existing `packages/cli/test/lib/fs-bridge.test.ts` or CLI harness tests to capture the CLI flag, and extend `packages/cli/test/integration-mcp/bridge-adapter.test.ts` (or add a new test) to assert the MCP behaviour. |

## Recommended Order
1. Tasks 1 & 4 (tests-first, then implementation) to restore behaviour and add coverage.
2. Tasks 2 & 3 to update documentation/footnotes once code changes stabilise.
