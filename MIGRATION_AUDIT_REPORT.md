# ScriptResult Migration Audit Report

## Executive Summary

**Audit Date**: 2025-10-31
**Scope**: All 41 built-in scripts in `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/`

**Current Status**: 30/41 scripts correctly migrated (73%)
**Issues Found**: 11/41 scripts (27%) have critical issues

**Build Impact**: HIGH - 8 scripts use undefined import aliases that will cause build failure

---

## Critical Issues Found

### 1. Import Alias Errors - CRITICAL (8 scripts)

**Severity**: CRITICAL - Will cause immediate build failure

**Root Cause**: Scripts are importing from non-existent webpack aliases:
- `@script-result` does not exist (should be `@core/scripts/ScriptResult`)
- `@error-taxonomy` does not exist (should be `@core/response/errorTaxonomy`)

**Affected Scripts** (8 total):
1. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/breakpoint/clear-file.js`
2. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/breakpoint/clear-project.js`
3. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/breakpoint/remove.js`
4. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/breakpoint/set.js`
5. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/debug/restart.js`
6. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/editor/goto-line.js`
7. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/editor/show-testing-ui.js`
8. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/utils/restart-vscode.js`

**Fix**: Replace import statements with correct aliases from webpack.config.js
```javascript
// OLD (WRONG):
const { ScriptResult } = require('@script-result');
const { ErrorCode } = require('@error-taxonomy');

// NEW (CORRECT):
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');
```

---

### 2. Deprecated Method Usage - CRITICAL (2 scripts)

**Severity**: CRITICAL - Will cause runtime errors ("this.success is not a function")

**Root Cause**: Scripts are calling `this.success()` and `this.failure()` methods that no longer exist on ActionScript base class

**Affected Scripts** (2 total):
1. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/code/replace-method.js`
   - Line 108: `return this.success({...})`
   - Line 297: `return this.failure(errorCode, details)`

2. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/symbol/rename.js`
   - Line 107: `return this.success({...})`
   - Lines 119-134: Catch block throws errors instead of returning ScriptResult

**Fix**: Replace with ScriptResult static methods
```javascript
// OLD (WRONG):
return this.success({ data: value });
return this.failure(code, details);

// NEW (CORRECT):
return ScriptResult.success({ data: value });
return ScriptResult.failure('message', ErrorCode.CODE, details);
```

---

### 3. Missing ScriptResult Wrapper - MODERATE (1 script)

**Severity**: MODERATE - Breaks response envelope contract, but won't cause build failure

**Root Cause**: QueryScript returns plain objects instead of wrapping in ScriptResult

**Affected Script** (1 total):
1. `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/debug/status.js`
   - Lines 46-50, 120, 215: Returns plain objects
   - Needs to wrap all returns in `ScriptResult.success()`

**Fix**: Wrap all returns
```javascript
// OLD (WRONG):
return { isActive: false, isPaused: false };
return status;

// NEW (CORRECT):
return ScriptResult.success({ isActive: false, isPaused: false });
return ScriptResult.success(status);
```

---

## Correctly Migrated Scripts (30/41 - 73%)

These scripts have been properly migrated and require no changes:

**DAP Scripts (8):**
- dap/compare.js
- dap/exceptions.js
- dap/filter.js
- dap/logs.js
- dap/search.js
- dap/stats.js
- dap/summary.js
- dap/timeline.js

**Breakpoint Scripts (1):**
- breakpoint/list.js

**Debug Scripts (16):**
- debug/continue.js
- debug/evaluate.js
- debug/get-variable.js
- debug/list-variables.js
- debug/save-variable.js
- debug/scopes.js
- debug/set-variable.js
- debug/stack.js
- debug/start.js
- debug/step-into.js
- debug/step-out.js
- debug/step-over.js
- debug/stop.js
- debug/threads.js
- debug/tracker.js
- debug/wait-for-hit.js

**Other Scripts (5):**
- diag/collect.js
- editor/get-context.js
- search/symbol-search.js
- symbol/navigate.js
- tests/debug-single.js

---

## Reference: Correct Import Patterns

From webpack.config.js (lines 65-82), the valid aliases are:

```javascript
'@script-base': 'src/core/scripts/base.ts'
'@core/scripts/ScriptResult': 'src/core/scripts/ScriptResult.ts'
'@core/response/errorTaxonomy': 'src/core/response/errorTaxonomy.ts'
```

### Valid Import Pattern 1 (imports ScriptResult from @script-base):
```javascript
const { QueryScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');
```

### Valid Import Pattern 2 (imports ScriptResult separately):
```javascript
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');
```

Both patterns are correct. Pattern 1 is used by most correctly-migrated DAP and debug scripts. Pattern 2 is used for scripts that don't import from @script-base directly.

---

## Standard Migration Pattern

All scripts must follow this pattern for consistent error handling:

### Success Returns:
```javascript
return ScriptResult.success({
    data: value,
    status: 'complete'
});
```

### Failure Returns:
```javascript
return ScriptResult.failure(
    'Human-readable error message',
    ErrorCode.E_SOME_ERROR,
    { additionalDetails: 'context' }
);
```

### Error Catching:
```javascript
try {
    // operation that might fail
} catch (error) {
    return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
}
```

### Throw Prevention:
- **WRONG**: Throwing errors directly
  ```javascript
  throw new Error('Something failed');
  ```
- **CORRECT**: Returning ScriptResult
  ```javascript
  return ScriptResult.failure('Something failed', ErrorCode.E_OPERATION_FAILED);
  ```

---

## Statistics

| Category | Count | Status |
|----------|-------|--------|
| **Total Scripts** | 41 | |
| Correctly migrated | 30 | ✅ (73%) |
| Import alias errors | 8 | ⚠️ CRITICAL |
| Deprecated method usage | 2 | ⚠️ CRITICAL |
| Missing ScriptResult wrapper | 1 | ⚠️ MODERATE |
| **Issues to fix** | **11** | **27%** |

---

## Fix Priority and Order

### Priority 1 - MUST FIX IMMEDIATELY (Build will fail)
**Impact**: Build failure with "Cannot find module '@script-result'"

Fix these 8 scripts by updating import aliases:
1. breakpoint/clear-file.js
2. breakpoint/clear-project.js
3. breakpoint/remove.js
4. breakpoint/set.js
5. debug/restart.js
6. editor/goto-line.js
7. editor/show-testing-ui.js
8. utils/restart-vscode.js

**Estimated effort**: 5 minutes (identical fix in all 8 files)

### Priority 2 - MUST FIX (Runtime failures)
**Impact**: Scripts will throw "this.success is not a function" at runtime

Fix these 2 scripts by replacing this.success() and this.failure():
1. code/replace-method.js (also has 9 throw statements to wrap)
2. symbol/rename.js (also has catch block throwing instead of returning)

**Estimated effort**: 15 minutes (more complex refactoring needed)

### Priority 3 - SHOULD FIX (Contract violation)
**Impact**: Response format inconsistency, may break API contract

Fix this 1 script by wrapping all returns in ScriptResult:
1. debug/status.js (add imports and wrap 3 return statements)

**Estimated effort**: 5 minutes

---

## Verification Steps

After fixes, run:

```bash
# Rebuild to catch import/syntax errors
npm run build

# Run any available tests
npm test

# Or manually test scripts:
npm start  # Start extension
# Test each fixed script in VS Code debug console
```

---

## Appendix: Detailed Fix Specifications

### Import Alias Fix Template (for 8 scripts)

**Location**: Lines 2-6 (varies by file)

**Action**: Replace `@script-result` with `@core/scripts/ScriptResult` and `@error-taxonomy` with `@core/response/errorTaxonomy`

Example for breakpoint/clear-file.js:
```javascript
// BEFORE:
const { z } = require('zod');
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { ScriptResult } = require('@script-result');
const { ErrorCode } = require('@error-taxonomy');

// AFTER:
const { z } = require('zod');
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');
```

### Deprecated Method Fix (code/replace-method.js)

**Line 108**: Replace `this.success()` → `ScriptResult.success()`
**Line 297**: Replace `this.failure()` → `ScriptResult.failure()`
**Lines 283-298**: Refactor `_handleError()` method to return ScriptResult

### Deprecated Method Fix (symbol/rename.js)

**Line 107**: Replace `this.success()` → `ScriptResult.success()`
**Lines 119-134**: Replace throw statements with ScriptResult.failure() returns

### ScriptResult Wrapper Fix (debug/status.js)

**Add imports** (after line 4):
```javascript
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');
```

**Line 46-50**: Wrap in ScriptResult.success()
**Line 120**: Wrap in ScriptResult.success()
**Line 215**: Wrap in ScriptResult.success()

---

## Document Metadata

- **Audit Tool**: Custom bash audit scripts
- **All 41 Scripts Checked**: Yes
- **Verification Method**: Import statement analysis, method call detection, pattern matching
- **False Positives Reviewed**: None - all issues are genuine
- **Completion Date**: 2025-10-31
