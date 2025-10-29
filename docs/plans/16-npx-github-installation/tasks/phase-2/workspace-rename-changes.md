# Test Workspace Rename: Detailed Change Reference

**Purpose**: Complete reference for renaming `test/` → `test-workspace/` (83+ changes across 23 files)

**Analysis Source**: Subagent comprehensive search (2025-10-19)

**Change Pattern**: Replace all `test/` workspace references with `test-workspace/`

**CRITICAL**: Do NOT change references to test CODE (test/integration/*.test.ts, test-cli/, package.json test scripts)

---

## T002a: .vscode/launch.json - Extension Host Workspace (CRITICAL)

**File**: `/workspaces/vsc-bridge-devcontainer/.vscode/launch.json`

| Line | Current | Change To | Impact |
|------|---------|-----------|--------|
| 14 | `"--folder-uri=${workspaceFolder}/test"` | `"--folder-uri=${workspaceFolder}/test-workspace"` | CRITICAL - F5 launch |

---

## T002b: .vscode/launch.json - Jest Debug Configuration (CRITICAL)

**File**: `/workspaces/vsc-bridge-devcontainer/.vscode/launch.json`

| Line | Current | Change To | Impact |
|------|---------|-----------|--------|
| 35 | `"program": "${workspaceFolder}/test/javascript/node_modules/.bin/jest"` | `"program": "${workspaceFolder}/test-workspace/javascript/node_modules/.bin/jest"` | CRITICAL |
| 44 | `"cwd": "${workspaceFolder}/test/javascript"` | `"cwd": "${workspaceFolder}/test-workspace/javascript"` | CRITICAL |
| 49 | `"program": "${workspaceFolder}/test/javascript/node_modules/jest/bin/jest"` | `"program": "${workspaceFolder}/test-workspace/javascript/node_modules/jest/bin/jest"` | CRITICAL |

---

## T002c: justfile - Test Breakpoint Setup (CRITICAL)

**File**: `/workspaces/vsc-bridge-devcontainer/justfile`

| Line | Current | Change To | Impact |
|------|---------|-----------|--------|
| 502 | `just bp-set path="$(pwd)/test/python/sample.py" line=7` | `just bp-set path="$(pwd)/test-workspace/python/sample.py" line=7` | CRITICAL |
| 503 | `just bp-set path="$(pwd)/test/python/sample.py" line=18 condition='"Bob" in dummy'` | `just bp-set path="$(pwd)/test-workspace/python/sample.py" line=18 condition='"Bob" in dummy'` | CRITICAL |

---

## T002d: justfile - Dynamic Script Commands (CRITICAL - 13 commands)

**File**: `/workspaces/vsc-bridge-devcontainer/justfile`

**Pattern**: Replace all `cd test &&` with `cd test-workspace &&`

| Line | Current | Change To | Command |
|------|---------|-----------|---------|
| 541 | `cd test && vscb script run -f ../{{FILE}} {{ARGS}}` | `cd test-workspace && vscb script run -f ../{{FILE}} {{ARGS}}` | dynamic |
| 545 | `cd test && vscb script run -f ../scripts/sample/dynamic/dap-capture.js {{ARGS}}` | `cd test-workspace && vscb script run -f ../scripts/sample/dynamic/dap-capture.js {{ARGS}}` | sample-dap-capture |
| 549 | `cd test && vscb script run -f ../scripts/sample/dynamic/query-capture.js {{ARGS}}` | `cd test-workspace && vscb script run -f ../scripts/sample/dynamic/query-capture.js {{ARGS}}` | query-capture |
| 553 | `cd test && vscb script run -f ../scripts/sample/dynamic/list-breakpoints.js` | `cd test-workspace && vscb script run -f ../scripts/sample/dynamic/list-breakpoints.js` | sample-bp-list |
| 557 | `cd test && vscb script run -f ../scripts/sample/dynamic/list-variables.js {{ARGS}}` | `cd test-workspace && vscb script run -f ../scripts/sample/dynamic/list-variables.js {{ARGS}}` | sample-vars |
| 561 | `cd test && vscb script run -f ../scripts/sample/dynamic/stream-variables.js {{ARGS}}` | `cd test-workspace && vscb script run -f ../scripts/sample/dynamic/stream-variables.js {{ARGS}}` | sample-stream |
| 565 | `cd test && vscb script run -f ../scripts/sample/dynamic/var-children.js {{ARGS}}` | `cd test-workspace && vscb script run -f ../scripts/sample/dynamic/var-children.js {{ARGS}}` | sample-var-children |
| 571 | `cd test && vscb script run -f ../scripts/sample/dynamic/investigate-variable-expansion.js {{ARGS}}` | `cd test-workspace && vscb script run -f ../scripts/sample/dynamic/investigate-variable-expansion.js {{ARGS}}` | investigate-var-expansion |
| 576 | `cd test && vscb script run -f ../scripts/sample/dynamic/echo-message.js {{ARGS}}` | `cd test-workspace && vscb script run -f ../scripts/sample/dynamic/echo-message.js {{ARGS}}` | sample-echo |
| 602 | `cd test && vscb script run -f ../scripts/sample/dynamic/debug-status.js` | `cd test-workspace && vscb script run -f ../scripts/sample/dynamic/debug-status.js` | sample-debug-status |
| 605 | `cd test && vscb script run -f ../scripts/sample/dynamic/debug-tracker.js` | `cd test-workspace && vscb script run -f ../scripts/sample/dynamic/debug-tracker.js` | sample-debug-tracker |

**Total**: 11 `cd test` → `cd test-workspace` replacements in this file

---

## T002e: CLAUDE.md - AI Assistant Instructions (CRITICAL - 12+ locations)

**File**: `/workspaces/vsc-bridge-devcontainer/CLAUDE.md`

**Pattern**: Replace test/ workspace references with test-workspace/

| Line | Current | Change To | Context |
|------|---------|-----------|---------|
| 186 | `Files in \`test/\` (Python, JS, C#, Java)` | `Files in \`test-workspace/\` (Python, JS, C#, Java)` | Dev mode table |
| 191 | `opens the \`test/\` workspace` | `opens the \`test-workspace/\` workspace` | Extension Host description |
| 199 | `--param path="$(pwd)/test/python/test_example.py"` | `--param path="$(pwd)/test-workspace/python/test_example.py"` | Breakpoint example |
| 204 | `\`/Users/jak/github/vsc-bridge/test\`` | `\`/Users/jak/github/vsc-bridge/test-workspace\`` | Working directory note |
| 209 | `cd /Users/jak/github/vsc-bridge/test` | `cd /Users/jak/github/vsc-bridge/test-workspace` | Command example |
| 255 | `await runCLI('script run tests.debug-single ...', fromRoot: false);` | (context reference - check if test/ or test-workspace/) | Integration test note |
| 269 | Reference to test workspace | Update if workspace-related | CLI command context |
| 272 | Reference to test workspace | Update if workspace-related | Test command context |
| 278 | Reference to test workspace | Update if workspace-related | Debug workflow |
| 282 | Reference to test workspace | Update if workspace-related | CLI usage |
| 289 | Reference to test workspace | Update if workspace-related | Examples |
| 296 | Reference to test workspace | Update if workspace-related | Documentation |

**Note**: Manually verify each line - some may be test code references (keep as-is) vs workspace references (update)

---

## T002f: Integration Test Workflow Files (CRITICAL - 4 files)

**Pattern**: Replace `test/integration-simple/` with `test-workspace/integration-simple/`

### File 1: Python Workflow
**File**: `/workspaces/vsc-bridge-devcontainer/test/integration/workflows/python-workflow.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 30 | `path.join(PROJECT_ROOT, 'test/integration-simple/python/test_debug.py')` | `path.join(PROJECT_ROOT, 'test-workspace/integration-simple/python/test_debug.py')` |

### File 2: TypeScript Workflow
**File**: `/workspaces/vsc-bridge-devcontainer/test/integration/workflows/typescript-workflow.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 23 | `path.join(PROJECT_ROOT, 'test/integration-simple/typescript/debug.test.ts')` | `path.join(PROJECT_ROOT, 'test-workspace/integration-simple/typescript/debug.test.ts')` |

### File 3: C# Workflow
**File**: `/workspaces/vsc-bridge-devcontainer/test/integration/workflows/csharp-workflow.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 21 | `path.join(PROJECT_ROOT, 'test/integration-simple/csharp/DebugTest.cs')` | `path.join(PROJECT_ROOT, 'test-workspace/integration-simple/csharp/DebugTest.cs')` |

### File 4: Java Workflow
**File**: `/workspaces/vsc-bridge-devcontainer/test/integration/workflows/java-workflow.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 23 | `'test/integration-simple/java/src/test/java/com/example/DebugTest.java'` | `'test-workspace/integration-simple/java/src/test/java/com/example/DebugTest.java'` |

---

## T002g: Cross-Language Integration Test (CRITICAL)

**File**: `/workspaces/vsc-bridge-devcontainer/test/integration/cross-language-debug.test.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 60 | `typescript: path.join(PROJECT_ROOT, 'test/integration-simple/typescript/debug.test.ts')` | `typescript: path.join(PROJECT_ROOT, 'test-workspace/integration-simple/typescript/debug.test.ts')` |
| 61 | `python: path.join(PROJECT_ROOT, 'test/integration-simple/python/test_debug.py')` | `python: path.join(PROJECT_ROOT, 'test-workspace/integration-simple/python/test_debug.py')` |
| 62 | `csharp: path.join(PROJECT_ROOT, 'test/integration-simple/csharp/DebugTest.cs')` | `csharp: path.join(PROJECT_ROOT, 'test-workspace/integration-simple/csharp/DebugTest.cs')` |
| 63 | `java: path.join(PROJECT_ROOT, 'test/integration-simple/java/src/test/java/com/example/DebugTest.java')` | `java: path.join(PROJECT_ROOT, 'test-workspace/integration-simple/java/src/test/java/com/example/DebugTest.java')` |

---

## T002h: CLI MCP Integration Test (CRITICAL)

**File**: `/workspaces/vsc-bridge-devcontainer/test-cli/integration-mcp/stdio-e2e.test.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 319 | `const TEST_FILE = path.join(PROJECT_ROOT, 'test/python/test_example.py');` | `const TEST_FILE = path.join(PROJECT_ROOT, 'test-workspace/python/test_example.py');` |

---

## T002i: Test Utility JSDoc Examples (LOW - documentation only)

### File 1: Breakpoint Finder
**File**: `/workspaces/vsc-bridge-devcontainer/test/test-utils/breakpoint-finder.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 15 | `* const testFile = path.join(PROJECT_ROOT, 'test/integration-simple/python/debug_test.py');` | `* const testFile = path.join(PROJECT_ROOT, 'test-workspace/integration-simple/python/debug_test.py');` |
| 51 | `* const testFile = path.join(PROJECT_ROOT, 'test/integration-simple/typescript/debug.test.ts');` | `* const testFile = path.join(PROJECT_ROOT, 'test-workspace/integration-simple/typescript/debug.test.ts');` |

### File 2: Debug Runner
**File**: `/workspaces/vsc-bridge-devcontainer/test/integration/runners/DebugRunner.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 40 | `* runner.resolvePath('test/python/test_example.py')` | `* runner.resolvePath('test-workspace/python/test_example.py')` |

---

## T002j: Manual Test Documentation (HIGH - 13 locations)

**File**: `/workspaces/vsc-bridge-devcontainer/docs/manual-test/debug-single.md`

**Pattern**: Replace `test/` with `test-workspace/` in all file paths

| Line(s) | Pattern to Find | Replace With |
|---------|----------------|--------------|
| 169, 179, 192, 268, 276 | `<PROJECT_ROOT>/test/python/test_example.py` | `<PROJECT_ROOT>/test-workspace/python/test_example.py` |
| 393, 401, 443, 459 | `<PROJECT_ROOT>/test/javascript/example.test.js` | `<PROJECT_ROOT>/test-workspace/javascript/example.test.js` |
| 535, 543, 556 | `<PROJECT_ROOT>/test/csharp/SampleTests/CalculatorTests.cs` | `<PROJECT_ROOT>/test-workspace/csharp/SampleTests/CalculatorTests.cs` |
| 760 | `<PROJECT_ROOT>/test/java/src/test/java/com/example/DebugTest.java` | `<PROJECT_ROOT>/test-workspace/java/src/test/java/com/example/DebugTest.java` |

**Total**: 13 replacements

---

## T002k: Simple Debug Flow Tutorial (HIGH - 40+ locations)

**File**: `/workspaces/vsc-bridge-devcontainer/docs/how/simple-debug-flow.md`

**Pattern**: Global find/replace `test/` → `test-workspace/` for all workspace file paths

| Line(s) | Examples (not exhaustive) |
|---------|---------------------------|
| 22, 24 | `test/javascript/auth.test.js` → `test-workspace/javascript/auth.test.js` |
| Multiple | `vscb script run bp.set --param path=test/javascript/...` → `path=test-workspace/javascript/...` |
| Multiple | `cd test/javascript` → `cd test-workspace/javascript` |
| Multiple | File path examples throughout tutorial |

**Recommendation**: Use find/replace with regex: `\btest/(python|javascript|csharp|java)/` → `test-workspace/$1/`

**Total**: 40+ replacements

---

## T002l: Dogfooding Documentation (HIGH - 12 locations)

### File 1: Dogfooding Guide
**File**: `/workspaces/vsc-bridge-devcontainer/docs/how/dogfood/dogfooding-vsc-bridge.md`

| Line(s) | Pattern | Replace With |
|---------|---------|--------------|
| 84, 86, 89 | `test/` workspace references | `test-workspace/` |
| 97, 102, 105, 109 | `test/python/test_example.py` | `test-workspace/python/test_example.py` |
| 145, 153 | Workspace path examples | Update to test-workspace |

**Total**: 9 replacements

### File 2: Development Workflow
**File**: `/workspaces/vsc-bridge-devcontainer/docs/how/dogfood/development-workflow.md`

| Line(s) | Pattern | Replace With |
|---------|---------|--------------|
| 81, 84, 90 | `test/` workspace references | `test-workspace/` |

**Total**: 3 replacements

---

## T002m: How-To Guides (HIGH - 6 locations)

### File 1: Debugging with Dynamic Scripts
**File**: `/workspaces/vsc-bridge-devcontainer/docs/how/debugging-with-dynamic-scripts.md`

| Line | Pattern | Replace With |
|------|---------|--------------|
| 154 | `cd test` | `cd test-workspace` |
| 158, 163, 168 | `test/python/test_example.py` | `test-workspace/python/test_example.py` |

### File 2: Simple Debug How-To
**File**: `/workspaces/vsc-bridge-devcontainer/docs/how/howto-simple-debug.md`

| Line | Pattern | Replace With |
|------|---------|--------------|
| 31 | Workspace reference | test-workspace |

### File 3: Simple Debug JavaScript How-To
**File**: `/workspaces/vsc-bridge-devcontainer/docs/how/howto-simple-debug-javascript.md`

| Line | Pattern | Replace With |
|------|---------|--------------|
| 35 | Workspace reference | test-workspace |

---

## T002n: Workspace README Files (HIGH - 105+ locations)

### File 1: Python README
**File**: `/workspaces/vsc-bridge-devcontainer/test/python/README.md`

| Line | Pattern | Replace With |
|------|---------|--------------|
| 7 | `test/python/test_example.py` | `test-workspace/python/test_example.py` |

### File 2: Java README
**File**: `/workspaces/vsc-bridge-devcontainer/test/java/README.md`

| Line(s) | Pattern | Replace With |
|---------|---------|--------------|
| 7, 11, 15 | `test/java/` | `test-workspace/java/` |

### File 3: JavaScript Auth Tutorial README
**File**: `/workspaces/vsc-bridge-devcontainer/test/javascript/AUTH_TUTORIAL_README.md`

**Pattern**: Extensive find/replace needed (100+ references)

| Pattern | Replace With |
|---------|--------------|
| `cd test/javascript` | `cd test-workspace/javascript` |
| `test/` directory references | `test-workspace/` |
| Working directory examples | Update to test-workspace |

**Recommendation**: Use global find/replace for this file

---

## T002o: MCP Server Examples & Documentation (MEDIUM - 17 locations)

### File 1: MCP Examples
**File**: `/workspaces/vsc-bridge-devcontainer/mcp-server/EXAMPLES.md`

| Line(s) | Pattern | Replace With |
|---------|---------|--------------|
| 15, 57, 73, 91, 118, 147 | `"/workspaces/vsc-bridge/test/python/sample.py"` | `"/workspaces/vsc-bridge/test-workspace/python/sample.py"` |

### File 2: MCP README
**File**: `/workspaces/vsc-bridge-devcontainer/mcp-server/README.md`

| Line(s) | Pattern | Replace With |
|---------|---------|--------------|
| 171, 186, 214, 247 | `/workspaces/vsc-bridge/test/` | `/workspaces/vsc-bridge/test-workspace/` |

### File 3: MCP Test Endpoints Script
**File**: `/workspaces/vsc-bridge-devcontainer/mcp-server/test-endpoints.js`

| Line | Pattern | Replace With |
|------|---------|--------------|
| 27 | `path: '/workspaces/vsc-bridge/test/python/sample.py'` | `path: '/workspaces/vsc-bridge/test-workspace/python/sample.py'` |

### File 4: MCP Example Launch Config
**File**: `/workspaces/vsc-bridge-devcontainer/mcp-server/example-launch.json`

| Line(s) | Pattern | Replace With |
|---------|---------|--------------|
| 8, 11 | `"program": "${workspaceFolder}/test/python/sample.py"` | `"program": "${workspaceFolder}/test-workspace/python/sample.py"` |
| 8, 11 | `"cwd": "${workspaceFolder}/test/python"` | `"cwd": "${workspaceFolder}/test-workspace/python"` |
| 17, 19 | `"program": "${workspaceFolder}/test/c#/..."` | `"program": "${workspaceFolder}/test-workspace/c#/..."` |
| 27, 29 | `"program": "${workspaceFolder}/test/node/app.js"` | `"program": "${workspaceFolder}/test-workspace/node/app.js"` |

---

## T002p: AI Context Memory Files (LOW - 2 locations)

**File**: `/workspaces/vsc-bridge-devcontainer/.serena/memories/project_overview.md`

| Line(s) | Pattern | Replace With |
|---------|---------|--------------|
| 94, 110 | `cd test/` | `cd test-workspace/` |

**Note**: Line 76-77 references `packages/cli/test/` which will become `test-cli/` then `test/` - do NOT change these

---

## Summary Statistics

| Category | Files | Locations | Criticality |
|----------|-------|-----------|-------------|
| VS Code Config | 1 | 4 | CRITICAL |
| Justfile | 1 | 13 | CRITICAL |
| CLAUDE.md | 1 | 12+ | CRITICAL |
| Integration Tests | 6 | 9 | CRITICAL |
| Manual Test Docs | 1 | 13 | HIGH |
| User Tutorials | 1 | 40+ | HIGH |
| Dogfooding Docs | 2 | 12 | HIGH |
| How-To Guides | 3 | 6 | HIGH |
| Workspace READMEs | 3 | 105+ | HIGH |
| MCP Examples | 4 | 17 | MEDIUM |
| AI Context | 1 | 2 | LOW |
| **TOTAL** | **24** | **233+** | - |

**Note**: Line counts are approximate due to extensive tutorial content. Actual total may be higher.

---

## Files to EXCLUDE (Test Code, Not Workspace)

**DO NOT CHANGE** these files - they reference test CODE, not the test workspace:

- ✅ `/workspaces/vsc-bridge-devcontainer/package.json` line 31: `"test:integration": "vitest run test/integration/unified-debug.test.ts"` - CORRECT
- ✅ `/workspaces/vsc-bridge-devcontainer/vitest.config.ts` line 10: `'**/test/integration/old/**'` - CORRECT
- ✅ Any `test-cli/` references - These are test files that will move in T002r
- ✅ `test/integration/*.test.ts` file paths - These are test files (stay in place)
- ✅ `test/unit/` references - Unit test files (stay in place)

---

## Validation Checklist (T002s)

After completing T002q-T002r, verify:

1. **[ ] F5 Extension Host Launch** - Opens test-workspace/ correctly
2. **[ ] `just test-bp-setup`** - Sets breakpoints in test-workspace files
3. **[ ] `just sample-bp-list`** - Executes from test-workspace
4. **[ ] `just sample-echo`** - Dynamic scripts work
5. **[ ] `npm run test:integration`** - Integration tests pass (find files in test-workspace)
6. **[ ] Documentation examples** - Tutorial commands work
7. **[ ] No orphaned references** - Grep for remaining `test/` workspace refs (excluding test code)

**Validation Command**:
```bash
# Find any remaining workspace references (exclude test code paths)
grep -r "test/" --include="*.md" --include="*.ts" --include="*.js" --include="*.json" . \
  | grep -v "test/integration" \
  | grep -v "test-workspace" \
  | grep -v "test-cli" \
  | grep -v "node_modules"
```

Expected: Only test CODE references remain (test/integration/*.test.ts, package.json test scripts, etc.)

---

## Notes for Implementation

1. **Order Matters**: Complete T002a-T002p BEFORE T002q (git mv)
2. **Use Find/Replace**: For files with many changes (simple-debug-flow.md, AUTH_TUTORIAL_README.md)
3. **Manual Verification**: For CLAUDE.md (some lines may be test code vs workspace)
4. **Test After Each Critical File**: Especially .vscode/launch.json, justfile, integration tests
5. **Git Status Check**: After T002q, ensure `git status` shows rename, not delete+add

---

**Last Updated**: 2025-10-19
**Analysis Source**: Subagent comprehensive search
**Total Changes**: 233+ locations across 24 files
