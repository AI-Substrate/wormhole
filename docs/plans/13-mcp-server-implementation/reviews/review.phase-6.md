# Phase 6 Code Review: Metadata Enhancement

## A) Verdict

REQUEST_CHANGES

## B) Summary
- DAP metadata adds error_contract entries without restoring the top-level `errors` arrays, so agents cannot resolve the referenced codes.[^F1]
- `debug.wait-for-hit` lists `breakpoint.set` as a hard dependency, which contradicts the documented relationships pattern and blocks valid workflows.[^F2]
- `debug.scopes` still ships a parameter hint with only one example, missing the P1 completeness bar.[^F3]
- Phase task ledger was left empty, so there is no footnote coverage for the modified files.[^F4]

## C) Checklist

**Testing Approach**: Hybrid (Integration tests for MCP server, documentation for metadata)

**Phase 6 Specific Checks**:
- [x] All 35 metadata files enhanced
- [ ] All P0 fields complete (enabled, description, timeout, relationships, error_contract, safety)
- [ ] All P1 fields complete (when_to_use, parameter_hints)
- [x] Exact label text enforced ("USE FOR:", "DON'T USE FOR:", "PREREQUISITES:", "SAFETY:")
- [ ] Metadata patterns correct (relationships, safety, timeouts)
- [ ] Error contracts valid (codes match, retryability set, fix hints actionable)
- [x] Token budgets validated (0 errors, warnings acceptable)
- [x] Documentation complete (5 guides + template + validation script)
- [x] Build succeeded with enhanced manifest
- [x] All integration tests pass (33/33)

**Universal Checks**:
- [x] Only in-scope files changed
- [x] No unexpected code modifications
- [ ] Documentation is clear and comprehensive

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F1 | CRITICAL | extension/src/vsc-scripts/dap/logs.meta.yaml:60 | DAP tools define `mcp.error_contract.errors`, but the files no longer expose the matching top-level `errors` array, violating the P0 requirement ("Error codes must exist in top-level errors field") and breaking acceptance criteria. | Restore an `errors:` list for each DAP metadata file (logs, compare, exceptions, filter, search, stats, summary, timeline) that enumerates the codes used in the error_contract. |
| F2 | HIGH | extension/src/vsc-scripts/debug/wait-for-hit.meta.yaml:29 | `requires` includes `breakpoint.set`, making it a hard prerequisite contrary to the relationships guide; waiting for a breakpoint should only require `debug.start` and optionally recommend breakpoint setup. | Move `breakpoint.set` from `requires` to `recommended` (or drop it), leaving `requires: ["debug.start"]` to match documented patterns. |
| F3 | HIGH | extension/src/vsc-scripts/debug/scopes.meta.yaml:105 | Parameter hint for `sessionId` has only one example, failing the Phase 6 P1 rule of providing 2-3 concrete examples per parameter. | Add at least one more realistic example (e.g. `"session-xyz"`, `"latest"`) so the hint offers 2-3 examples. |
| F4 | LOW | docs/plans/13-mcp-server-implementation/tasks/phase-6/tasks.md:307 | Footnote ledger remains empty despite 35 metadata edits, so plan instructions about documenting changes with footnotes were not followed. | Populate the ledger with footnotes referencing each modified metadata file (or at least each task group) before closing the phase. |

## E) Inline Comments

### extension/src/vsc-scripts/dap/logs.meta.yaml

**Lines 49-70**: The error contract lists `E_NO_LOGS` / `E_INVALID_PARAM`, but the top-level `errors` array was removed. Validation rules and acceptance criteria require those codes to exist in both locations.
```yaml
# Add before the CLI section
errors:
  - E_NO_LOGS
  - E_INVALID_PARAM
```

### extension/src/vsc-scripts/debug/wait-for-hit.meta.yaml

**Lines 28-35**: `breakpoint.set` is marked as a hard `requires`, which blocks workflows where breakpoints come from manual setup or earlier automation. The relationships guide flags breakpoint tools as soft suggestions.
```yaml
  relationships:
    requires: ["debug.start"]
    recommended: ["breakpoint.set"]
```

### extension/src/vsc-scripts/debug/scopes.meta.yaml

**Lines 105-110**: Parameter hints promise 2-3 examples per parameter; `sessionId` still has only one.
```yaml
      sessionId:
        examples:
          - "abc-123-def"
          - "latest"
          - "session-xyz"
```

## F) Coverage Map

| Acceptance Criterion | Evidence | Status |
|----------------------|----------|--------|
| All 35 tools enhanced | docs/plans/13-mcp-server-implementation/tasks/phase-6/execution.log.md:218 | ✅ PASS |
| P0 fields complete | extension/src/vsc-scripts/dap/logs.meta.yaml:60 (missing top-level errors) | ❌ FAIL |
| Clear, contrastive descriptions | extension/src/vsc-scripts/debug/start.meta.yaml:24 | ✅ PASS |
| 4-part when_to_use labels present | extension/src/vsc-scripts/debug/continue.meta.yaml:64 | ✅ PASS |
| Parameter hints with 2-3 examples each | extension/src/vsc-scripts/debug/scopes.meta.yaml:105 | ❌ FAIL |
| Relationships complete and accurate | extension/src/vsc-scripts/debug/wait-for-hit.meta.yaml:29 | ❌ FAIL |
| Error contracts reference top-level codes | extension/src/vsc-scripts/dap/compare.meta.yaml:40 | ❌ FAIL |
| Safety flags provided | extension/src/vsc-scripts/utils/restart-vscode.meta.yaml:30 | ✅ PASS |
| Timeout overrides for long operations | extension/src/vsc-scripts/tests/debug-single.meta.yaml:112 | ✅ PASS |
| Token budget validated (0 errors) | docs/plans/13-mcp-server-implementation/tasks/phase-6/execution.log.md:180 | ✅ PASS |
| manifest.json regenerated | docs/plans/13-mcp-server-implementation/tasks/phase-6/execution.log.md:145 | ✅ PASS |

## G) Commands Executed

```bash
node docs/plans/13-mcp-server-implementation/tasks/phase-6/validate-metadata.js
# Output: 0 errors, 28 warnings (matching phase log)
```

## H) Decision & Next Steps

Verdict: REQUEST_CHANGES
- Address the findings above (F1–F4), re-run the validator, and refresh the footnote ledger.
- After fixes land, re-run `just build`, manifest generation, and MCP integration tests to ensure nothing regressed.

## I) Footnotes Audit

| File Path | Footnote Tag | Node-ID Link | Status |
|-----------|--------------|--------------|--------|
| extension/src/vsc-scripts/debug/wait-for-hit.meta.yaml | — | — | ❌ Missing |
| extension/src/vsc-scripts/dap/logs.meta.yaml | — | — | ❌ Missing |
| docs/plans/13-mcp-server-implementation/tasks/phase-6/tasks.md | — | — | ❌ Missing (ledger empty) |

[^F1]: [`error_contract`:extension/src/vsc-scripts/dap/logs.meta.yaml](extension/src/vsc-scripts/dap/logs.meta.yaml#L60) – Error codes listed without matching top-level `errors` array.
[^F2]: [`relationships`:extension/src/vsc-scripts/debug/wait-for-hit.meta.yaml](extension/src/vsc-scripts/debug/wait-for-hit.meta.yaml#L28) – Hard dependency on `breakpoint.set` contradicts documented patterns.
[^F3]: [`sessionId parameter hints`:extension/src/vsc-scripts/debug/scopes.meta.yaml](extension/src/vsc-scripts/debug/scopes.meta.yaml#L105) – Only one example provided.
[^F4]: [`Footnote ledger`:docs/plans/13-mcp-server-implementation/tasks/phase-6/tasks.md](docs/plans/13-mcp-server-implementation/tasks/phase-6/tasks.md#L303) – Change tracking table never populated.
