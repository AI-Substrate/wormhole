# Fix Tasks – Phase 1 (Manual Approach)

| # | Severity | File | Task | Guidance |
|---|----------|------|------|----------|
| 1 | HIGH | docs/plans/17-automated-vsix-releases/automated-vsix-releases-plan.md | Update every `[📋]` link in the Phase 1 task table to the exact execution-log anchors (e.g. `tasks/phase-1/execution.log.md#t009-t013-implement-semrel-preparemjs`). Run `plan-6a` afterwards to confirm link integrity. | Re-run the documented manual verification checklist to ensure the links navigate correctly. |
| 2 | HIGH | docs/plans/17-automated-vsix-releases/tasks/phase-1/tasks.md | Add `log#…` anchors to the Notes column for each completed task so dossier ↔ execution log navigation is bidirectional. | After editing, manually open the generated Markdown to confirm each link resolves. |
| 3 | MEDIUM | package-lock.json | Add a new Phase 1 ledger entry (e.g. [^18]) covering this file in both `plan.md` § Change Footnotes Ledger and the dossier footnote stubs, or remove the file from the phase diff. | Once resolved, document the verification step in the execution log’s completion summary. |

**Execution Reminder (Manual Approach)**  
After applying fixes, repeat the relevant manual verification steps (log link checks, footnote ledger review) and capture the results in `tasks/phase-1/execution.log.md`.
