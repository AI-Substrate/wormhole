# Phase 0: Script Alias Refactoring - Mapping Document

**Date**: 2025-10-10
**Purpose**: Complete mapping of old abbreviated aliases to new hierarchical aliases
**Reference**: Critical Discovery 03 - Auto-Generate Tool Names from Refactored Aliases

---

## Naming Conventions

Per Critical Discovery 03, the `<group>_<action>` pattern for MCP tool auto-generation requires:

1. **Full words, not abbreviations**: `breakpoint` not `bp`, `diagnostic` not `diag`
2. **Singular category names**: `test` not `tests`, `util` not `utils`
3. **Dot notation for hierarchy**: `group.action.subaction`
4. **Underscores in action names**: Replace hyphens in file names (e.g., `debug-single` → `debug_single`)

---

## Complete Alias Mapping (35 Scripts)

| # | Old Alias | New Alias | Category | File Path | Notes |
|---|-----------|-----------|----------|-----------|-------|
| 1 | `bp.set` | `breakpoint.set` | breakpoint | `extension/src/vsc-scripts/breakpoint/set.meta.yaml` | Core refactoring |
| 2 | `bp.clear.file` | `breakpoint.clear.file` | breakpoint | `extension/src/vsc-scripts/breakpoint/clear-file.meta.yaml` | Hierarchical action |
| 3 | `bp.clear.project` | `breakpoint.clear.project` | breakpoint | `extension/src/vsc-scripts/breakpoint/clear-project.meta.yaml` | Hierarchical action |
| 4 | `bp.remove` | `breakpoint.remove` | breakpoint | `extension/src/vsc-scripts/breakpoint/remove.meta.yaml` | Core refactoring |
| 5 | `bp.list` | `breakpoint.list` | breakpoint | `extension/src/vsc-scripts/breakpoint/list.meta.yaml` | Core refactoring |
| 6 | `tests.debug-single` | `test.debug_single` | test | `extension/src/vsc-scripts/tests/debug-single.meta.yaml` | Plural→singular, hyphen→underscore |
| 7 | `tests.show-testing-ui` | `editor.show_testing_ui` | editor | `extension/src/vsc-scripts/editor/show-testing-ui.meta.yaml` | Plural→singular, hyphen→underscore. **Further migrated 2025-10-20**: Moved from test to editor category, alias changed from `test.show_testing_ui` to `editor.show_testing_ui` |
| 8 | `diag.collect` | `diagnostic.collect` | diagnostic | `extension/src/vsc-scripts/diag/collect.meta.yaml` | Abbreviation expansion |
| 9 | `utils.restart-vscode` | `util.restart_vscode` | util | `extension/src/vsc-scripts/utils/restart-vscode.meta.yaml` | Plural→singular, hyphen→underscore |
| 10 | `debug.continue` | `debug.continue` | debug | `extension/src/vsc-scripts/debug/continue.meta.yaml` | No change (already hierarchical) |
| 11 | `debug.step-over` | `debug.step_over` | debug | `extension/src/vsc-scripts/debug/step-over.meta.yaml` | Hyphen→underscore |
| 12 | `debug.step-into` | `debug.step_into` | debug | `extension/src/vsc-scripts/debug/step-into.meta.yaml` | Hyphen→underscore |
| 13 | `debug.step-out` | `debug.step_out` | debug | `extension/src/vsc-scripts/debug/step-out.meta.yaml` | Hyphen→underscore |
| 14 | `debug.stack` | `debug.stack` | debug | `extension/src/vsc-scripts/debug/stack.meta.yaml` | No change |
| 15 | `debug.threads` | `debug.threads` | debug | `extension/src/vsc-scripts/debug/threads.meta.yaml` | No change |
| 16 | `debug.get-variable` | `debug.get_variable` | debug | `extension/src/vsc-scripts/debug/get-variable.meta.yaml` | Hyphen→underscore |
| 17 | `debug.list-variables` | `debug.list_variables` | debug | `extension/src/vsc-scripts/debug/list-variables.meta.yaml` | Hyphen→underscore |
| 18 | `debug.set-variable` | `debug.set_variable` | debug | `extension/src/vsc-scripts/debug/set-variable.meta.yaml` | Hyphen→underscore |
| 19 | `debug.save-variable` | `debug.save_variable` | debug | `extension/src/vsc-scripts/debug/save-variable.meta.yaml` | Hyphen→underscore |
| 20 | `debug.status` | `debug.status` | debug | `extension/src/vsc-scripts/debug/status.meta.yaml` | No change |
| 21 | `debug.tracker` | `debug.tracker` | debug | `extension/src/vsc-scripts/debug/tracker.meta.yaml` | No change |
| 22 | `debug.evaluate` | `debug.evaluate` | debug | `extension/src/vsc-scripts/debug/evaluate.meta.yaml` | No change |
| 23 | `debug.restart` | `debug.restart` | debug | `extension/src/vsc-scripts/debug/restart.meta.yaml` | No change |
| 24 | `debug.scopes` | `debug.scopes` | debug | `extension/src/vsc-scripts/debug/scopes.meta.yaml` | No change |
| 25 | `debug.stop` | `debug.stop` | debug | `extension/src/vsc-scripts/debug/stop.meta.yaml` | No change |
| 26 | `debug.start` | `debug.start` | debug | `extension/src/vsc-scripts/debug/start.meta.yaml` | No change |
| 27 | `debug.wait-for-hit` | `debug.wait_for_hit` | debug | `extension/src/vsc-scripts/debug/wait-for-hit.meta.yaml` | Hyphen→underscore |
| 28 | `dap.summary` | `dap.summary` | dap | `extension/src/vsc-scripts/dap/summary.meta.yaml` | No change (not abbreviated) |
| 29 | `dap.logs` | `dap.logs` | dap | `extension/src/vsc-scripts/dap/logs.meta.yaml` | No change |
| 30 | `dap.exceptions` | `dap.exceptions` | dap | `extension/src/vsc-scripts/dap/exceptions.meta.yaml` | No change |
| 31 | `dap.timeline` | `dap.timeline` | dap | `extension/src/vsc-scripts/dap/timeline.meta.yaml` | No change |
| 32 | `dap.search` | `dap.search` | dap | `extension/src/vsc-scripts/dap/search.meta.yaml` | No change |
| 33 | `dap.stats` | `dap.stats` | dap | `extension/src/vsc-scripts/dap/stats.meta.yaml` | No change |
| 34 | `dap.filter` | `dap.filter` | dap | `extension/src/vsc-scripts/dap/filter.meta.yaml` | No change |
| 35 | `dap.compare` | `dap.compare` | dap | `extension/src/vsc-scripts/dap/compare.meta.yaml` | No change |

---

## Summary Statistics

- **Total scripts**: 35
- **Requires alias change**: 18 (bp.*, tests.*, diag.*, utils.*, debug.*-with-hyphens)
- **No change needed**: 17 (debug.* without hyphens, dap.*)

### Changes by Category

| Category | Old Prefix | New Prefix | Count | Changes Required |
|----------|------------|------------|-------|------------------|
| Breakpoint | `bp.*` | `breakpoint.*` | 5 | Yes - expand abbreviation |
| Test | `tests.*` | `test.*` | 2 | Yes - singular + underscore |
| Diagnostic | `diag.*` | `diagnostic.*` | 1 | Yes - expand abbreviation |
| Util | `utils.*` | `util.*` | 1 | Yes - singular + underscore |
| Debug | `debug.*` | `debug.*` | 13 | Partial - only hyphenated actions (8 files) |
| DAP | `dap.*` | `dap.*` | 7 | No - already correct |

---

## MCP Tool Name Auto-Generation Preview

After refactoring, MCP tool names will follow `<group>_<action>` pattern (dots → underscores):

| New Alias | MCP Tool Name (Auto-Generated) |
|-----------|-------------------------------|
| `breakpoint.set` | `breakpoint_set` |
| `breakpoint.clear.file` | `breakpoint_clear_file` |
| `test.debug_single` | `test_debug_single` |
| `diagnostic.collect` | `diagnostic_collect` |
| `debug.step_over` | `debug_step_over` |
| `dap.summary` | `dap_summary` |

This pattern enables Phase 3 to auto-generate consistent tool names from aliases.

---

## Files Requiring Updates

### Meta.yaml Files (18 requiring alias changes)

**Breakpoint category** (5 files):
1. `extension/src/vsc-scripts/breakpoint/set.meta.yaml`
2. `extension/src/vsc-scripts/breakpoint/clear-file.meta.yaml`
3. `extension/src/vsc-scripts/breakpoint/clear-project.meta.yaml`
4. `extension/src/vsc-scripts/breakpoint/remove.meta.yaml`
5. `extension/src/vsc-scripts/breakpoint/list.meta.yaml`

**Test category** (2 files):
6. `extension/src/vsc-scripts/tests/debug-single.meta.yaml`
7. `extension/src/vsc-scripts/editor/show-testing-ui.meta.yaml` (migrated from tests/ to editor/ on 2025-10-20)

**Diagnostic category** (1 file):
8. `extension/src/vsc-scripts/diag/collect.meta.yaml`

**Util category** (1 file):
9. `extension/src/vsc-scripts/utils/restart-vscode.meta.yaml`

**Debug category with hyphens** (8 files):
10. `extension/src/vsc-scripts/debug/step-over.meta.yaml`
11. `extension/src/vsc-scripts/debug/step-into.meta.yaml`
12. `extension/src/vsc-scripts/debug/step-out.meta.yaml`
13. `extension/src/vsc-scripts/debug/get-variable.meta.yaml`
14. `extension/src/vsc-scripts/debug/list-variables.meta.yaml`
15. `extension/src/vsc-scripts/debug/set-variable.meta.yaml`
16. `extension/src/vsc-scripts/debug/save-variable.meta.yaml`
17. `extension/src/vsc-scripts/debug/wait-for-hit.meta.yaml`

### Generated Files (rebuilt in T012)
- `extension/src/vsc-scripts/manifest.json` - Regenerated by build process
- `extension/out/vsc-scripts/manifest.json` - Build output

### Test Files (identified in T002)
- TBD - to be surveyed for old alias usage

---

## Validation Patterns

### Search patterns for old aliases (T017):
```bash
git grep "bp\."          # Should find nothing after refactoring
git grep "tests\."       # Should find nothing after refactoring
git grep "diag\."        # Should find nothing after refactoring
git grep "utils\."       # Should find nothing after refactoring
```

### Verify new aliases in manifest (T012):
```bash
grep "breakpoint\." extension/src/vsc-scripts/manifest.json
grep "test\." extension/src/vsc-scripts/manifest.json
grep "diagnostic\." extension/src/vsc-scripts/manifest.json
grep "util\." extension/src/vsc-scripts/manifest.json
```

---

**END OF MAPPING DOCUMENT**
