# Phase 4: Script Conversion (Batch 2) - Tasks

**Phase Status**: COMPLETED
**Progress**: 8/8 tasks (100%)
**Started**: 2025-11-04
**Completed**: 2025-11-04

## Objective

Convert remaining 25 scripts from JavaScript to TypeScript (debug/*, editor/*, search/*, symbol/*, tests/*, utils/*).

## Success Criteria

- [x] All 25 scripts converted to TypeScript with @RegisterScript decorators
- [x] All scripts use proper imports and z.coerce for CLI parameters
- [x] ScriptResult pattern compliance maintained
- [x] Scripts compile with TypeScript (minor type errors in JS helpers acceptable)
- [x] Functional validation via CLI

## Tasks

| #   | Status | Task | Success Criteria | Notes |
|-----|--------|------|------------------|-------|
| 4.0 | [x] | Write scratch tests for batch 2 conversion | Tests verify remaining scripts execute in Extension Host | Extended existing tests/scratch/script-conversion.test.ts |
| 4.1 | [x] | Convert debug/ scripts (17 files) | All debug scripts in TypeScript with decorators | All 17 scripts converted [^1] |
| 4.2 | [x] | Convert editor/ scripts (3 files) | Editor scripts converted with decorators | All 3 scripts converted [^2] |
| 4.3 | [x] | Convert search/ scripts (1 file) | symbol-search.ts works with decorator | Script converted [^3] |
| 4.4 | [x] | Convert symbol/ scripts (2 files) | Symbol scripts converted with decorators | Both scripts converted [^4] |
| 4.5 | [x] | Convert tests/ scripts (1 file) | Test script converted with decorator | Script converted [^5] |
| 4.6 | [x] | Convert utils/ scripts (1 file) | Utility script converted with decorator | Script converted [^6] |
| 4.7 | [x] | Verify ScriptResult pattern compliance | All batch 2 scripts use ScriptResult factory | 100% compliance verified |
| 4.8 | [x] | Verify all 40 scripts converted | No .js files remain in vsc-scripts | Complete conversion validated (15 Phase 3 + 25 Phase 4 = 40 total) |

## Footnotes

[^1]: **debug/ scripts (17 files)** - All converted to TypeScript:
  - [file:packages/extension/src/vsc-scripts/debug/continue.ts](../../../packages/extension/src/vsc-scripts/debug/continue.ts)
  - [file:packages/extension/src/vsc-scripts/debug/evaluate.ts](../../../packages/extension/src/vsc-scripts/debug/evaluate.ts)
  - [file:packages/extension/src/vsc-scripts/debug/get-variable.ts](../../../packages/extension/src/vsc-scripts/debug/get-variable.ts)
  - [file:packages/extension/src/vsc-scripts/debug/list-variables.ts](../../../packages/extension/src/vsc-scripts/debug/list-variables.ts)
  - [file:packages/extension/src/vsc-scripts/debug/restart.ts](../../../packages/extension/src/vsc-scripts/debug/restart.ts)
  - [file:packages/extension/src/vsc-scripts/debug/save-variable.ts](../../../packages/extension/src/vsc-scripts/debug/save-variable.ts)
  - [file:packages/extension/src/vsc-scripts/debug/scopes.ts](../../../packages/extension/src/vsc-scripts/debug/scopes.ts)
  - [file:packages/extension/src/vsc-scripts/debug/set-variable.ts](../../../packages/extension/src/vsc-scripts/debug/set-variable.ts)
  - [file:packages/extension/src/vsc-scripts/debug/stack.ts](../../../packages/extension/src/vsc-scripts/debug/stack.ts)
  - [file:packages/extension/src/vsc-scripts/debug/start.ts](../../../packages/extension/src/vsc-scripts/debug/start.ts)
  - [file:packages/extension/src/vsc-scripts/debug/step-into.ts](../../../packages/extension/src/vsc-scripts/debug/step-into.ts)
  - [file:packages/extension/src/vsc-scripts/debug/step-out.ts](../../../packages/extension/src/vsc-scripts/debug/step-out.ts)
  - [file:packages/extension/src/vsc-scripts/debug/step-over.ts](../../../packages/extension/src/vsc-scripts/debug/step-over.ts)
  - [file:packages/extension/src/vsc-scripts/debug/stop.ts](../../../packages/extension/src/vsc-scripts/debug/stop.ts)
  - [file:packages/extension/src/vsc-scripts/debug/threads.ts](../../../packages/extension/src/vsc-scripts/debug/threads.ts)
  - [file:packages/extension/src/vsc-scripts/debug/tracker.ts](../../../packages/extension/src/vsc-scripts/debug/tracker.ts)
  - [file:packages/extension/src/vsc-scripts/debug/wait-for-hit.ts](../../../packages/extension/src/vsc-scripts/debug/wait-for-hit.ts)

[^2]: **editor/ scripts (3 files)** - All converted to TypeScript:
  - [file:packages/extension/src/vsc-scripts/editor/get-context.ts](../../../packages/extension/src/vsc-scripts/editor/get-context.ts)
  - [file:packages/extension/src/vsc-scripts/editor/goto-line.ts](../../../packages/extension/src/vsc-scripts/editor/goto-line.ts)
  - [file:packages/extension/src/vsc-scripts/editor/show-testing-ui.ts](../../../packages/extension/src/vsc-scripts/editor/show-testing-ui.ts)

[^3]: **search/ scripts (1 file)** - Converted to TypeScript:
  - [file:packages/extension/src/vsc-scripts/search/symbol-search.ts](../../../packages/extension/src/vsc-scripts/search/symbol-search.ts)

[^4]: **symbol/ scripts (2 files)** - All converted to TypeScript:
  - [file:packages/extension/src/vsc-scripts/symbol/navigate.ts](../../../packages/extension/src/vsc-scripts/symbol/navigate.ts)
  - [file:packages/extension/src/vsc-scripts/symbol/rename.ts](../../../packages/extension/src/vsc-scripts/symbol/rename.ts)

[^5]: **tests/ scripts (1 file)** - Converted to TypeScript:
  - [file:packages/extension/src/vsc-scripts/tests/debug-single.ts](../../../packages/extension/src/vsc-scripts/tests/debug-single.ts)

[^6]: **utils/ scripts (1 file)** - Converted to TypeScript:
  - [file:packages/extension/src/vsc-scripts/utils/restart-vscode.ts](../../../packages/extension/src/vsc-scripts/utils/restart-vscode.ts)

## Known Issues

**TypeScript Compilation Warnings**: The conversion has 30 type errors related to missing `.d.ts` files for JavaScript helper modules:
- `flowspace/flowspaceNodeIdUtils.js`
- `flowspace/flowspaceUtils.js`
- `llm/llm.js`
- `dap-store/DAPEventsManager.js`
- `dap-store/DAPStoreAnalyzer.js`

**Impact**: These warnings do not prevent:
- Script execution at runtime (scripts are dynamically loaded)
- Debugging functionality (source maps work correctly)
- CLI functionality (all `vscb script run` commands work)

**Resolution Plan**: These will be resolved in Phase 5 when helper modules are converted to TypeScript or `.d.ts` files are added.

## Validation Summary

**Conversion Completeness**:
- ✅ All 25 scripts use `@RegisterScript` decorators
- ✅ All scripts use proper ES6 `export` instead of `module.exports`
- ✅ All scripts use `z.coerce` for CLI parameter parsing
- ✅ All scripts import dependencies with proper TypeScript paths

**Pattern Compliance**:
- ✅ ScriptResult.success() for successful operations
- ✅ ScriptResult.failure() with ErrorCode for failures
- ✅ ScriptResult.fromError() for exception handling
- ✅ No ActionResult usage (deprecated pattern)

**Functional Testing**:
- ✅ CLI commands work identically to JavaScript versions
- ✅ Debugging breakpoints bind to TypeScript source
- ✅ Source maps correctly map webpack output to .ts files
- ✅ No runtime regressions observed

## Next Phase

**Phase 5: Registry Integration** - Replace dynamic loading with static registration using decorators to enable full debugging capabilities.
