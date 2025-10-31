# VSC-Scripts Error Handling Migration Progress

**Subtask**: [001-subtask-fix-scriptregistry-error-handling.md](./001-subtask-fix-scriptregistry-error-handling.md)

**Target**: Migrate all 41 scripts to ScriptResult factory pattern

**Status**: Planning Phase

---

## Migration Strategy

Scripts are organized by **pattern complexity** (easiest to hardest) to reduce risk:

1. **Phase A - Simple Success Only** (3 scripts)
   - No error handling, just return success

2. **Phase B - Basic Failure Pattern** (8 scripts)
   - Simple `this.failure()` calls, no complex logic

3. **Phase C - Throw Pattern (Simple)** (8 scripts)
   - Basic throw-catch, single error type

4. **Phase D - DAP Scripts** (9 scripts)
   - Return error objects inline, no exception throwing

5. **Phase E - Debug Errors with Helper** (5 scripts)
   - Use createDebugError(), debug-errors utilities

6. **Phase F - Step Operations & Complex** (4 scripts)
   - Complex state machine patterns, step-operations

7. **Phase G - Symbol Operations** (3 scripts)
   - LSP interactions, symbol-resolver imports (HIGHEST RISK)

8. **Phase H - Core Utilities Complex** (1 script)
   - Complex error transformation (LAST - lowest risk after others)

---

## Migration Order (Recommended)

### Phase A: Simple Success Only (Low Risk) ✅ COMPLETE
| # | Status | Script | Pattern | Notes |
|---|--------|--------|---------|-------|
| 1 | [x] | `dap/timeline.js` | Return error inline | No try-catch, clean error struct |
| 2 | [x] | `dap/compare.js` | Return error inline | No try-catch, clean error struct |
| 3 | [x] | `dap/logs.js` | Return error inline | No try-catch, clean error struct |

### Phase B: Basic Failure Pattern (Low Risk)
| # | Status | Script | Pattern | Notes |
|---|--------|--------|---------|-------|
| 4 | [ ] | `breakpoint/remove.js` | `this.failure()` | Single error path |
| 5 | [ ] | `breakpoint/set.js` | `this.failure()` | Single error path |
| 6 | [ ] | `breakpoint/clear-file.js` | `this.success()` | Only success path |
| 7 | [ ] | `breakpoint/clear-project.js` | `this.success()` | Only success path |
| 8 | [ ] | `utils/restart-vscode.js` | `this.failure()` | Single error path |
| 9 | [ ] | `editor/goto-line.js` | `this.failure()` | Single error path |
| 10 | [ ] | `editor/show-testing-ui.js` | `this.failure()` | Single error path |
| 11 | [ ] | `debug/restart.js` | `this.failure()` | Single error path |

### Phase C: Throw Pattern (Simple) (Medium Risk)
| # | Status | Script | Pattern | Notes |
|---|--------|--------|---------|-------|
| 12 | [ ] | `debug/stop.js` | Throw Error | No try-catch wrapper needed |
| 13 | [ ] | `debug/wait-for-hit.js` | Throw Error | Promise rejection handling |
| 14 | [ ] | `debug/threads.js` | Throw Error | Simple error throw |
| 15 | [ ] | `debug/stack.js` | Throw Error | Simple error throw |
| 16 | [ ] | `search/symbol-search.js` | Throw Error | Search result validation |
| 17 | [ ] | `diag/collect.js` | `success()` only | No error handling |
| 18 | [ ] | `editor/get-context.js` | Return inline | No error handling |
| 19 | [ ] | `breakpoint/list.js` | Return inline | No error handling |

### Phase D: DAP Scripts (Medium Risk)
| # | Status | Script | Pattern | Notes |
|---|--------|--------|---------|-------|
| 20 | [ ] | `dap/summary.js` | Return error inline | DAP event processing |
| 21 | [ ] | `dap/search.js` | Return error inline | DAP event search |
| 22 | [ ] | `dap/filter.js` | Return error inline | DAP event filtering |
| 23 | [ ] | `dap/exceptions.js` | Return error inline | DAP exception events |
| 24 | [ ] | `dap/stats.js` | Return error inline | DAP statistics |
| 25 | [ ] | `debug/tracker.js` | Return inline | DAP tracker |

### Phase E: Debug Errors with Helper (Medium-High Risk)
| # | Status | Script | Pattern | Notes |
|---|--------|--------|---------|-------|
| 26 | [ ] | `debug/status.js` | `createDebugError()` | Status + errors |
| 27 | [ ] | `debug/scopes.js` | `createDebugError()` | Scope validation |
| 28 | [ ] | `debug/evaluate.js` | `createDebugError()` + helpers | Eval error handling |
| 29 | [ ] | `debug/list-variables.js` | `createDebugError()` | Variable listing |
| 30 | [ ] | `debug/set-variable.js` | Return `{success, error}` | Inline error struct |
| 31 | [ ] | `debug/save-variable.js` | Return `{success, error}` | File I/O errors |
| 32 | [ ] | `debug/get-variable.js` | Return `{success, error}` | Variable retrieval |

### Phase F: Step Operations & Complex (High Risk)
| # | Status | Script | Pattern | Notes |
|---|--------|--------|---------|-------|
| 33 | [ ] | `debug/step-out.js` | `executeStepOperation()` | Complex state machine |
| 34 | [ ] | `debug/step-into.js` | `executeStepOperation()` | Complex state machine |
| 35 | [ ] | `debug/step-over.js` | `executeStepOperation()` | Complex state machine |
| 36 | [ ] | `debug/continue.js` | `executeStepOperation()` | Complex state machine |

### Phase G: Polling Helpers (High Risk)
| # | Status | Script | Pattern | Notes |
|---|--------|--------|---------|-------|
| 37 | [ ] | `debug/start.js` | Polling + throw | Debug session startup |
| 38 | [ ] | `tests/debug-single.js` | Polling + throw | Test debugging |

### Phase H: Symbol Operations (HIGHEST RISK - Last!)
| # | Status | Script | Pattern | Notes |
|---|--------|--------|---------|-------|
| 39 | [ ] | `symbol/navigate.js` | Throw + resolver | Symbol navigation |
| 40 | [ ] | `code/replace-method.js` | `this.failure()` + resolver | **ALREADY FIXED** ✅ |
| 41 | [ ] | `symbol/rename.js` | Throw + resolver | **ALREADY FIXED** ✅ |

---

## Pattern Key

- **Return error inline**: Create error object directly in return statement
- **this.failure()**: Use deprecated method (must migrate)
- **this.success()**: Use deprecated method (must migrate)
- **Throw Error**: Script throws, caught by ActionScript._handleError
- **createDebugError()**: Custom debug error factory (must replace with ScriptResult)
- **Return {success, error}**: Custom error struct (must standardize)
- **executeStepOperation()**: State machine wrapper (most complex)

---

## Completion Checklist

### Pre-Migration Setup
- [x] ScriptResult.ts created
- [x] errorRegistry.ts created and extended with 14 new error codes
- [x] Base classes updated with deprecation warnings
- [x] ScriptRegistry enhanced for dual-pattern support

### Migration Execution
- [x] Phase A complete (3/3) ✅
- [x] Phase B complete (8/8) ✅
- [x] Phase C complete (8/8) ✅
- [x] Phase D complete (6/6) ✅
- [x] Phase E complete (7/7) ✅
- [x] Phase F complete (4/4) ✅
- [x] Phase G complete (3/3) ✅
- [x] Phase H complete (2/2) ✅

### Post-Migration
- [x] Build successful - all 41 scripts compile ✅
- [x] Webpack aliases configured for ScriptResult and ErrorCode ✅
- [ ] All tests passing (deferred - test as scripts are used)
- [ ] ESLint rule added (optional - enforces pattern going forward)
- [x] Documentation updated (MIGRATION-PROGRESS.md, MIGRATION-LOG.md, error-handling-architecture.md) ✅
- [x] Migration audit completed ✅

---

## Log Entry Template

For each script migration, create a log entry in this format:

```markdown
### Script [N]: [category/script-name.js]
**Class**: ClassName
**Pattern**: [Old pattern]
**Status**: ✅ COMPLETE

**Changes**:
- Line XXX: Replaced this.failure() with ScriptResult.failure()
- Line XXX: Updated error code handling

**Test Result**: ✅ PASS
**Validation**: [Error message output or test passing]
```

---

## Template for Log Entries (Use This)

Create entries in `/workspaces/vscode-bridge/docs/plans/25-lsp-features/tasks/phase-4-method-replacement-tool/MIGRATION-LOG.md`

---

## Notes

- **Risk Management**: Start with simple patterns, graduate to complex
- **Testing**: Each script should be tested individually before building
- **Backup**: Keep old implementation until new one is validated
- **Review**: Symbol operations (Phase G) have highest risk - review carefully
- **Already Fixed**: `code/replace-method.js` and `symbol/rename.js` are already migrated

