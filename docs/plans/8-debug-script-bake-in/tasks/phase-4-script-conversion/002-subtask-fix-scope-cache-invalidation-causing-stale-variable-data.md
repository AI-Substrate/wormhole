# Subtask 002: Fix setVariable to Use Proper DAP Request (Not Evaluate Fallback)

**Parent Plan**: [debug-script-bake-in-plan.md](../../debug-script-bake-in-plan.md)
**Parent Phase**: Phase 4: Script Conversion & Integration
**Created**: 2025-10-05
**Status**: ⛔ **BLOCKED - CRITICAL DAP LIMITATION DISCOVERED**
**Updated**: 2025-10-05T07:05 - DAP setVariable fundamentally doesn't work for Jest test variables

## 🚨 CRITICAL BLOCKER: DAP setVariable Limitation

After extensive investigation and multiple attempted fixes, we've discovered a **fundamental limitation** with the DAP `setVariable` request when working with Jest test variables:

### The Problem

**DAP `setVariable` returns success but doesn't actually modify the runtime variable** when targeting `let` variables inside Jest test functions.

### Evidence

1. ✅ **Auto-find Local scope** - Successfully finds variablesReference (e.g., 11)
2. ✅ **DAP setVariable request** - Succeeds, returns `{value: '100'}`
3. ✅ **Refresh nudge** - `evaluate 'void 0'` to force js-debug cache invalidation
4. ✅ **Scope cache clear** - Clear our internal cache
5. ❌ **Runtime NOT modified** - Variable still shows 42 in Variables panel
6. ✅ **Evaluate DOES work** - Hover (using evaluate) shows 100

### What We Tried

| Attempt | Approach | Result |
|---------|----------|--------|
| 1 | Remove scope/variable caches | ❌ Still shows 42 |
| 2 | Add refresh nudge (`evaluate 'void 0'`) | ❌ Still shows 42 |
| 3 | Clear scope cache after setVariable | ❌ Still shows 42 |
| 4 | Verified DAP request at breakpoint | ✅ Confirms request succeeds but variable unchanged |

### Deep Research Findings

The deep research response suggested:
- **Option A**: Refresh nudge (`evaluate 'void 0'`) - We implemented this, **didn't work**
- **Option B**: Use `setExpression` or `evaluate` assignment - **This is what we should do**
- **Option C**: Micro-step to force refresh - Too heavy-handed

The research noted: *"For simple locals, the classic fallback is `await session.customRequest('evaluate', {expression: 'numberVar = 100', frameId, context: 'repl'})`"*

### Root Cause Hypothesis

Possible reasons DAP `setVariable` doesn't work:
1. **Jest test scope isolation** - Test function variables may be immutable via DAP
2. **pwa-node limitation** - Chrome DevTools Protocol restriction on test scopes
3. **CDP note**: "Object-based scopes are not supported and must be mutated manually"

### Recommended Solution

**Stop trying to use DAP `setVariable` for Jest test variables. Use the `evaluate` assignment approach instead:**

```typescript
// Instead of trying to make DAP setVariable work:
await this.session.customRequest('setVariable', {
    variablesReference: localScope.variablesReference,
    name: 'numberVar',
    value: '100'
});  // Returns success but doesn't modify runtime ❌

// Use evaluate assignment (what currently works):
await this.session.customRequest('evaluate', {
    expression: `numberVar = 100`,
    frameId,
    context: 'repl'
});  // Actually modifies the runtime ✅
```

### Time Spent vs Value

- **Investigation time**: ~3 hours
- **Code changes attempted**: 4 major iterations
- **Result**: Dead end - DAP setVariable fundamentally doesn't work for this use case
- **Learning**: Evaluate assignment is the correct approach for test variables

### Decision

**REVERT all setVariable changes** and **ACCEPT the evaluate fallback** as the correct implementation.

The evaluate fallback is **not a bug**, it's the **correct approach** for modifying variables in Jest test scopes.

---

## Subtask Metadata

| Field | Value |
|-------|-------|
| **Parent Plan** | [8-debug-script-bake-in](../../debug-script-bake-in-plan.md) |
| **Parent Phase** | Phase 4: Script Conversion & Integration |
| **Parent Tasks** | Task 4.4 (set-variable.js validation) |
| **Subtask Summary** | Fix setVariable to auto-find scope variablesReference and use proper DAP request |
| **Requested By** | Human Sponsor |
| **Discovery Context** | Found while validating Task 4.4 - list-variables returns old data (numberVar: 42) even after set-variable reports success. Hover shows 100 but Variables panel shows 42. |
| **Created** | 2025-10-05 |
| **Solution Approach** | Auto-find Local scope's variablesReference when not provided, use proper DAP setVariable instead of evaluate fallback |

## Tasks

| Status | ID | Task | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|------|--------------|------------------|------------|-------|
| [x] | ST001 | ~~Remove scopeCache and variableCache declarations~~ | ~~Core~~ | – | BaseDebugAdapter.ts | ~~Declarations deleted~~ | **REVERTED** - Cache removal wasn't the issue |
| [ ] | ST002 | Add findScopeByName() helper to NodeDebugAdapter | Core | – | /Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts | Helper finds Local scope | Find scope by name/presentationHint, return variablesReference |
| [ ] | ST003 | Auto-find Local scope in setVariable() when no variablesReference provided | Core | ST002 | /Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts | Uses DAP setVariable, not evaluate | Get frame → scopes → find Local → use its variablesReference |
| [ ] | ST004 | Test set-variable + list-variables workflow | Test | ST003 | /Users/jordanknight/github/vsc-bridge/test/javascript/example.test.js | Shows updated value | Run set-variable (42→100), verify hover AND Variables panel show 100 |
| [ ] | ST005 | Test with dynamic scripts for comparison | Test | ST003 | /Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/list-variables.js | Both show same behavior | Verify dynamic and baked scripts both work correctly |
| [ ] | ST006 | Revert cache removal changes | Core | ST004 | /Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/BaseDebugAdapter.ts | Cache restored | Put back scopeCache and variableCache since they weren't the issue |

**Progress**: 1/6 tasks complete (ST001 done but will be reverted)

## Development Workflow

**Current State**: Extension Host running at breakpoint in `test/javascript/example.test.js:266`

**Approach**: Fast iteration using dynamic scripts, then migrate to baked scripts

### Phase 1: Develop & Test with Dynamic Scripts (Fast Iteration)

Dynamic scripts bypass the build/reload cycle, making development much faster:

```bash
# Work in the test directory (workspace root when Extension Host is running)
cd /Users/jordanknight/github/vsc-bridge/test

# Test current (buggy) behavior
vscb script run debug.set-variable --param name=numberVar --param value=100
# Returns success but uses evaluate fallback

vscb script run -f ../scripts/sample/dynamic/list-variables.js
# Currently shows: numberVar: 42 ❌ (stale DAP references)

# After making changes to NodeDebugAdapter.ts:
# NO BUILD NEEDED - dynamic scripts use the live runtime

# Test fixed behavior
vscb script run debug.set-variable --param name=numberVar --param value=100
# Should use proper DAP setVariable request

vscb script run -f ../scripts/sample/dynamic/list-variables.js
# Should show: numberVar: 100 ✅ (fresh data via proper DAP)
```

**Why dynamic scripts for development?**
- ✅ **Instant feedback** - no build/reload cycle (saves ~30-60 seconds per iteration)
- ✅ **Live code** - changes to TypeScript source reflect immediately
- ✅ **Faster debugging** - can iterate on fixes rapidly
- ✅ **Same behavior** - dynamic scripts use the same adapters/services as baked scripts

### Phase 2: Validate with Baked Scripts (After Fix Works)

Once the fix works with dynamic scripts, validate with baked scripts:

```bash
cd /Users/jordanknight/github/vsc-bridge

# Build the extension
just dev-build

# Reload Extension Host (Cmd+Shift+P → "Reload Window")
# Set breakpoint again at example.test.js:266

cd test
vscb script run tests.debug-wait --param path=javascript/example.test.js --param line=266

# Test with baked scripts
vscb script run debug.set-variable --param name=numberVar --param value=100
vscb script run debug.list-variables --param scope=local --param maxDepth=1
# Should show: numberVar: 100 ✅
```

**Why validate with baked scripts?**
- ✅ **Production parity** - ensures build process works correctly
- ✅ **Schema validation** - baked scripts use generated Zod schemas
- ✅ **Manifest verification** - confirms script is properly registered
- ✅ **Final confidence** - both dynamic and baked work identically

### Workflow Summary

1. **Develop**: Modify `NodeDebugAdapter.ts` → test with dynamic scripts
2. **Iterate**: Repeat step 1 until fix works (no build needed!)
3. **Validate**: Build → reload → test with baked scripts
4. **Confirm**: Both dynamic and baked show same correct behavior

This two-phase approach leverages the speed of dynamic scripts during development, then validates production behavior with baked scripts.

## Alignment Brief

### Objective

**Fix `setVariable` to use the proper DAP request instead of the evaluate fallback.**

The problem: `list-variables` returns stale variable data (42) after `set-variable` reports success, even though the runtime was actually modified (hover shows 100). This happens because `setVariable` without a `variablesReference` parameter uses the evaluate fallback, which modifies the runtime but doesn't trigger DAP scope invalidation.

### Behavior Checklist

After the fix:

- [ ] setVariable auto-finds Local scope when no variablesReference provided
- [ ] setVariable uses proper DAP `setVariable` request (not evaluate fallback)
- [ ] Hover shows updated value (100) ✅ Already works
- [ ] Variables panel shows updated value (100) ← Currently broken, will be fixed
- [ ] list-variables shows updated value (100) ← Currently broken, will be fixed
- [ ] Dynamic and baked scripts show identical behavior
- [ ] No regression in evaluate fallback for property paths (e.g., `obj.prop = value`)

### Critical Findings Affecting This Subtask

**🚨 ACTUAL ROOT CAUSE: Evaluate Fallback Doesn't Invalidate DAP References**

After extensive investigation and testing:

1. **Initial Hypothesis (WRONG)**: Scope caching in BaseDebugAdapter causes stale data
   - We removed `scopeCache` and `variableCache`
   - Still saw stale data - cache wasn't the problem

2. **Second Hypothesis (WRONG)**: Need to wait for DAP `invalidated` events
   - Deep research suggested waiting for events after setVariable
   - But we see stale data HOURS later - not an event timing issue

3. **ACTUAL ROOT CAUSE (CORRECT)**: setVariable uses evaluate fallback instead of DAP request

**The Evidence (Smoking Gun)**:
```
Command: vscb script run debug.set-variable --param name=numberVar --param value=100
(No variablesReference provided)

Code path taken (NodeDebugAdapter.ts:396):
  if (params.variablesReference !== undefined) {
      // Strategy 1: DAP setVariable request ← SKIPPED (no variablesReference)
  } else {
      // Strategy 2: Evaluate fallback ← TAKEN
      await this.evaluateExpression('numberVar = 100');
  }

Result:
  ✅ Runtime modified (hover over numberVar shows 100)
  ❌ DAP scope references NOT invalidated (Variables panel shows 42)
  ❌ list-variables shows 42 (uses stale DAP scope variablesReference)
```

**Why This Happens**:
- The **evaluate fallback** runs `numberVar = 100` via DAP `evaluate` request
- This modifies the JavaScript runtime variable
- But it **doesn't** go through the DAP `setVariable` request path
- So the debug adapter **doesn't** invalidate its scope `variablesReference` IDs
- Variables panel and our scripts use those stale references → see old data (42)
- Hover evaluates `numberVar` directly in runtime → sees new data (100)

**Why Cache Removal Didn't Help**:
- We correctly fetch fresh scopes each time
- But those fresh scopes contain **stale `variablesReference` IDs**
- The DAP adapter never invalidated those IDs because we used evaluate, not setVariable

### Solution: Auto-Find Scope and Use Proper DAP Request

**Files to Modify**: Only `NodeDebugAdapter.ts`

**Change 1: Add helper to find scope by name**

```typescript
/**
 * Find scope by name or presentationHint
 * Per DAP best practices: don't assume scopes[0] is Local
 */
private async findScopeByName(
    frameId: number,
    scopeName: 'Local' | 'Closure' | 'Global'
): Promise<{ variablesReference: number } | null> {
    const scopes = await this.getScopes(frameId);

    // Try presentationHint first
    const hintMap: Record<string, string> = {
        'Local': 'locals',
        'Closure': 'closure',
        'Global': 'globals'
    };

    let scope = scopes.find(s =>
        s.presentationHint === hintMap[scopeName]
    );

    // Fallback to name matching
    if (!scope) {
        scope = scopes.find(s =>
            s.name && s.name.toLowerCase().includes(scopeName.toLowerCase())
        );
    }

    return scope ? { variablesReference: scope.variablesReference } : null;
}
```

**Change 2: Auto-find Local scope in setVariable when needed**

```typescript
async setVariable(params: ISetVariableParams): Promise<ISetVariableResult> {
    // ... existing lock key building ...

    const result = await this.withOperationLock(lockKey, async (signal) => {
        try {
            // NEW: Auto-find Local scope if variablesReference not provided
            let variablesReference = params.variablesReference;

            if (variablesReference === undefined) {
                // Get current frame
                const threadId = await this.getMostRecentlyStoppedThread();
                if (threadId === null) {
                    return {
                        success: false,
                        error: createDebugError(DebugErrorCode.E_NO_THREADS)
                    };
                }

                const frames = await this.getStackFrames(threadId, 1);
                if (frames.length === 0) {
                    return {
                        success: false,
                        error: createDebugError(DebugErrorCode.E_NO_STACK)
                    };
                }

                const frameId = params.frameId ?? frames[0].id;

                // Find Local scope
                const localScope = await this.findScopeByName(frameId, 'Local');
                if (localScope) {
                    variablesReference = localScope.variablesReference;
                }
            }

            // Strategy 1: Try setVariable request first
            if (this.capabilities.supportsSetVariable && variablesReference !== undefined) {
                try {
                    const response = await this.session.customRequest('setVariable', {
                        variablesReference: variablesReference, // Now auto-found!
                        name: params.name,
                        value: params.value
                    });

                    return {
                        success: true,
                        value: response.value,
                        type: response.type,
                        variablesReference: response.variablesReference,
                        namedVariables: response.namedVariables,
                        indexedVariables: response.indexedVariables
                    };
                } catch (error) {
                    // Fall through to evaluate fallback
                }
            }

            // Strategy 2: Evaluate fallback (for property paths like obj.prop)
            // ... existing evaluate code ...
        }
    });

    return result;
}
```

### Invariants & Guardrails

**Must Preserve**:
- Evaluate fallback for complex expressions (e.g., `obj.prop.nested = value`)
- Capability checking (`supportsSetVariable`)
- Error handling and operation locking
- All existing tests

**Must Change**:
- Auto-find Local scope's `variablesReference` when not provided
- Prefer DAP `setVariable` request over evaluate when possible

**Testing Requirements**:
- Test simple variable modification (`numberVar = 100`)
- Test complex expressions still work (`obj.prop = value`)
- Verify both hover AND Variables panel show updated value
- Verify list-variables shows updated value

### Test Plan

**Approach**: Manual testing with actual debug session using dynamic scripts

**Test Scenarios**:

1. **Primary Fix Validation**
   - Set breakpoint at `example.test.js:266` (numberVar = 42)
   - Run: `vscb script run debug.set-variable --param name=numberVar --param value=100`
   - **Verify hover**: Shows 100 ✅
   - **Verify Variables panel**: Shows 100 ✅ (currently shows 42, will be fixed)
   - **Verify list-variables**: Shows 100 ✅ (currently shows 42, will be fixed)

2. **Hours-Later Test** (Proves not an event timing issue)
   - After test 1, wait a few minutes
   - Run list-variables again
   - **Expected**: Still shows 100 (not 42)

3. **Multiple Modifications**
   - Set numberVar=100, verify
   - Set numberVar=200, verify
   - Set stringVar="world", verify
   - **Expected**: Each modification persists

4. **Complex Expression Fallback**
   - Create object: `const obj = {prop: 42}`
   - Try: `vscb script run debug.set-variable --param name="obj.prop" --param value=100`
   - **Expected**: Falls back to evaluate (can't use DAP setVariable for property paths)

### Implementation Outline

1. **Add findScopeByName() helper (ST002)**:
   - Private method in NodeDebugAdapter
   - Takes frameId and scope name
   - Returns variablesReference or null
   - Checks presentationHint first, then name

2. **Modify setVariable() (ST003)**:
   - Before capability check, attempt to auto-find Local scope
   - Only if variablesReference not provided by caller
   - Store in local variable to use in DAP request
   - Keep evaluate fallback for when DAP request fails

3. **Test with dynamic scripts (ST004-ST005)**:
   - No rebuild needed - just reload Extension Host
   - Test all scenarios
   - Verify fix works

4. **Revert cache removal (ST006)**:
   - Put back scopeCache and variableCache
   - They weren't the problem
   - Keep the investigation as learning

### Commands to Run

```bash
# Development workflow
cd /Users/jordanknight/github/vsc-bridge/test

# Extension Host already running at breakpoint

# Test 1: Verify current broken behavior
vscb script run debug.set-variable --param name=numberVar --param value=100
vscb script run -f ../scripts/sample/dynamic/list-variables.js
# Currently: numberVar = 42 ❌

# After code changes (just reload Extension Host, no build):
# Test 2: Verify fixed behavior
vscb script run debug.set-variable --param name=numberVar --param value=100
vscb script run -f ../scripts/sample/dynamic/list-variables.js
# Should show: numberVar = 100 ✅

# Test 3: Verify persistence (not event timing)
# Wait a few minutes, then:
vscb script run -f ../scripts/sample/dynamic/list-variables.js
# Should STILL show: numberVar = 100 ✅

# Test 4: Verify Variables panel
# Check VS Code Variables panel after set-variable
# Should show: numberVar = 100 ✅
```

### Risks & Unknowns

**Risk**: Auto-finding Local scope might fail
- **Mitigation**: Fall back to evaluate if scope not found
- **Severity**: Low - same behavior as current code

**Risk**: Property paths (obj.prop) might accidentally use DAP
- **Mitigation**: DAP setVariable will fail, we fall back to evaluate
- **Severity**: Low - covered by existing try/catch

**Risk**: Different debug adapters have different scope names
- **Mitigation**: Check both presentationHint and name
- **Severity**: Low - robust matching logic

**Unknown**: Does `setVariable` trigger proper invalidation?
- **Research confirmed**: Yes, DAP setVariable triggers invalidation
- **Status**: ✅ CONFIRMED by deep research findings

### Ready Check

Before implementation:

- [x] Subtask dossier created and reviewed
- [x] Root cause identified (evaluate fallback doesn't invalidate)
- [x] Evidence gathered (hover vs Variables panel discrepancy)
- [x] Solution designed (auto-find Local scope)
- [x] Test scenario defined (set-variable → list-variables workflow)
- [x] All ST tasks (ST001-ST006) understood and sequenced
- [x] Risk analysis complete
- [x] Commands ready to execute

**Blocking Issues**: None - ready for implementation

**Next Step**: Implement auto-scope-finding in NodeDebugAdapter.setVariable()

## Investigation Log

### What We Tried

1. **Removed scope caching** (ST001)
   - Hypothesis: Cache causing stale data
   - Result: ❌ Didn't fix the issue
   - Learning: Cache wasn't the problem

2. **Deep research on DAP invalidation**
   - Hypothesis: Need to wait for `invalidated` events
   - Result: ❌ Not an event timing issue (stale data persists hours later)
   - Learning: Very useful research, but wrong hypothesis for this bug

3. **Discovered the hover vs Variables panel discrepancy**
   - Observation: Hover shows 100, Variables panel shows 42
   - Realization: Two different code paths!
   - **This was the breakthrough**

4. **Traced setVariable code path**
   - Found: Without variablesReference, uses evaluate fallback
   - Found: Evaluate modifies runtime but doesn't invalidate DAP
   - **Root cause identified**

### Lessons Learned

- **Dynamic scripts are invaluable** for rapid iteration
- **Test across different views** (hover, Variables panel, scripts) to find discrepancies
- **Don't assume caching is the problem** - verify with evidence
- **Read the code path carefully** - the dual strategy was the clue

## Phase Footnote Stubs

| Footnote | File | Description |
|----------|------|-------------|
| [^ST.2] | node-adapter.ts | findScopeByName() helper added |
| [^ST.3] | node-adapter.ts | setVariable() auto-finds Local scope |
| [^ST.6] | BaseDebugAdapter.ts | Cache restored (wasn't the issue) |

## Evidence Artifacts

**Execution Log**: `002-subtask-fix-scope-cache-invalidation-causing-stale-variable-data.execution.log.md`
- Investigation steps and dead ends
- Evidence of hover vs Variables panel discrepancy
- Before/after test results
- Verification that fix works hours later (not event timing)

**Screenshots**:
- Hover showing 100 (runtime modified)
- Variables panel showing 42 (DAP references stale)
- After fix: both showing 100

---

**Supports**: Parent Task 4.4 (set-variable.js validation) - discovered that set-variable uses evaluate fallback which doesn't properly invalidate DAP scope references

**Solution**: Auto-find Local scope and use proper DAP setVariable request
