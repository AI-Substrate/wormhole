# CDPCommonAdapter Extraction Plan

**Document**: Comprehensive Extraction and Refactoring Plan
**Created**: 2025-10-10 (Phase 0 Analysis)
**Purpose**: Guide Phase 1-2 implementation with complete extraction strategy

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [What Moves to CDPCommonAdapter](#what-moves-to-cdpcommonadapter)
3. [What Stays in NodeDebugAdapter](#what-stays-in-nodedebugadapter)
4. [What ChromeDebugAdapter Will Override](#what-chromedebugadapter-will-override)
5. [Risks and Mitigations](#risks-and-mitigations)
6. [Implementation Order](#implementation-order)
7. [Validation Strategy](#validation-strategy)

---

## Executive Summary

### What Phase 0 Discovered

**Key Finding**: NodeDebugAdapter is **97% shared logic**, only **3% Node-specific**.

After thorough analysis of `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` (720 lines), we identified:

- **640 lines** (89%) of CDP/V8 logic to extract to CDPCommonAdapter
- **80 lines** (11%) remain in NodeDebugAdapter (mostly boilerplate)
- **~20 lines** (3%) of actual Node-specific logic (thread detection - may not even be specific)

**Surprising Discoveries**:
1. **Thread detection likely universal**: Extension Host (pwa-chrome) has same simple thread model as Node
2. **Capabilities identical**: Both adapters use exact same DAP capabilities (Discovery 04)
3. **Scope handling universal**: SCOPE_TYPE_MAP covers all Node and Chrome scope types
4. **No Node-specific overrides needed**: Everything works through shared implementation

**Impact**: ChromeDebugAdapter implementation will be trivial (~20 lines, just constructor).

---

### Extraction Strategy Overview

```
┌─────────────────────────────────────────────────────────────┐
│ BaseDebugAdapter (466 lines)                                 │
│ - Memory budgets, caching, lifecycle, DAP helpers            │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ extends
                            │
┌─────────────────────────────────────────────────────────────┐
│ CDPCommonAdapter (NEW - ~640 lines)                          │
│ - Variable retrieval, cycle detection, scope filtering       │
│ - Pagination, memory estimation, expression evaluation       │
│ - setVariable dual strategy, SCOPE_TYPE_MAP                  │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ extends
                 ┌──────────┴──────────┐
                 │                     │
┌────────────────────────┐  ┌────────────────────────┐
│ NodeDebugAdapter       │  │ ChromeDebugAdapter     │
│ (~20 lines)            │  │ (~20 lines)            │
│ - Constructor only     │  │ - Constructor only     │
│ - No overrides         │  │ - No overrides         │
└────────────────────────┘  └────────────────────────┘
```

**Code Reuse**: 97% of logic shared between pwa-node and pwa-chrome.

---

## What Moves to CDPCommonAdapter

### 1. Core Methods (Complete Extraction)

All methods listed below move from NodeDebugAdapter to CDPCommonAdapter with **no modifications** except scope filtering refactoring.

#### 1.1 listVariables (PRIMARY METHOD)

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` lines 108-375 (268 lines)

**Signature**: `async listVariables(params: IListVariablesParams): Promise<IVariableData[] | IDebugError>`

**Extraction Strategy**: **COPY ENTIRE METHOD with scope filtering refactoring**

**Changes Required**:
1. Replace hardcoded scope name matching (lines 133-154) with mapScopeType() calls
2. Keep all other logic unchanged:
   - Thread detection via getMostRecentlyStoppedThread()
   - Stack frame retrieval
   - Scope retrieval and filtering
   - Recursive variable expansion (expandVariable closure)
   - Dual-strategy cycle detection (variablesReference Set + Object.is())
   - Memory budget enforcement
   - Error handling

**Critical Discovery References**:
- **Discovery 05**: Dual-strategy cycle detection preserved
- **Discovery 03**: Memory budget enforcement preserved
- **Discovery 02**: Scope filtering uses SCOPE_TYPE_MAP

**Dependencies**:
- getMostRecentlyStoppedThread() - extract to CDPCommon
- estimateVariableSize() - extract to CDPCommon
- evaluateFailures Map - extract to CDPCommon
- MAX_EVALUATE_FAILURES constant - extract to CDPCommon

---

#### 1.2 setVariable (DUAL STRATEGY METHOD)

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` lines 382-483 (102 lines)

**Signature**: `async setVariable(params: ISetVariableParams): Promise<ISetVariableResult>`

**Extraction Strategy**: **COPY ENTIRE METHOD with writability check addition**

**Changes Required**:
1. **ADD** scope writability check before attempting setVariable:
   ```typescript
   // NEW: Check scope writability
   if (params.scopeType) {
       const scopeInfo = this.mapScopeType(params.scopeType);
       if (!scopeInfo.writable) {
           return {
               success: false,
               error: {
                   code: 'E_READ_ONLY_SCOPE',
                   message: `Cannot modify variable in ${scopeInfo.name} scope (read-only)`
               }
           };
       }
   }
   ```
2. Keep dual strategy unchanged:
   - Try DAP setVariable first
   - Fallback to evaluate-based assignment
   - Error handling

**Critical Discovery References**:
- **Discovery 03**: setVariable restrictions enforced via writable flag

**Dependencies**:
- buildSafeAssignment() - extract to CDPCommon
- encodeValueForEvaluate() - extract to CDPCommon
- getMostRecentlyStoppedThread() - extract to CDPCommon

**Note**: May need to extend ISetVariableParams interface to include scopeType parameter, or determine scope type from variablesReference context.

---

#### 1.3 getVariableChildren (PAGINATION METHOD)

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` lines 490-530 (41 lines)

**Signature**: `async getVariableChildren(params: IVariableChildrenParams): Promise<IVariableData[] | IDebugError>`

**Extraction Strategy**: **COPY ENTIRE METHOD unchanged**

**Changes Required**: NONE - extract as-is

**Dependencies**: withOperationLock (from BaseDebugAdapter)

---

#### 1.4 streamVariables (PLACEHOLDER METHOD)

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` lines 536-546 (11 lines)

**Signature**: `async streamVariables(params: IStreamVariablesParams): Promise<IStreamResult>`

**Extraction Strategy**: **COPY ENTIRE METHOD unchanged**

**Changes Required**: NONE - placeholder implementation

**Dependencies**: NONE

---

### 2. Helper Methods (Complete Extraction)

#### 2.1 getMostRecentlyStoppedThread (THREAD DETECTION)

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` lines 554-578 (25 lines)

**Signature**: `protected async getMostRecentlyStoppedThread(): Promise<number | null>`

**Extraction Strategy**: **COPY ENTIRE METHOD unchanged**

**Rationale**:
- Initially thought Node-specific (simple thread model)
- **Analysis shows**: Extension Host (pwa-chrome) has same simple model
- Both typically 1 thread (main)
- Thread detection logic identical for both adapters
- **Decision**: Extract to CDPCommon as default, allow override if needed

**Changes Required**: NONE - extract as-is

**Dependencies**: getThreads(), getStackFrames() (from BaseDebugAdapter)

---

#### 2.2 estimateVariableSize (MEMORY ESTIMATION)

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` lines 584-623 (40 lines)

**Signature**: `protected estimateVariableSize(variable: IVariableData): number`

**Extraction Strategy**: **COPY ENTIRE METHOD unchanged**

**Changes Required**: NONE - pure function, no dependencies

**Critical Discovery References**:
- **Discovery 03**: Memory budget tracking

---

#### 2.3 buildSafeAssignment (INJECTION PREVENTION)

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` lines 633-654 (22 lines)

**Signature**: `protected buildSafeAssignment(targetPath: string, value: string): { expr?: string; error?: IDebugError }`

**Extraction Strategy**: **COPY ENTIRE METHOD unchanged**

**Changes Required**: NONE - extract as-is

**Dependencies**: encodeValueForEvaluate()

---

#### 2.4 encodeValueForEvaluate (VALUE ENCODING)

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` lines 663-718 (56 lines)

**Signature**: `protected encodeValueForEvaluate(valueStr: string): { encoded?: string; error?: IDebugError }`

**Extraction Strategy**: **COPY ENTIRE METHOD unchanged**

**Changes Required**: NONE - pure function, no dependencies

---

### 3. State and Constants (Complete Extraction)

#### 3.1 evaluateFailures Map

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` line 77

**Declaration**: `private evaluateFailures: Map<string, number> = new Map();`

**Extraction Strategy**: Move to CDPCommonAdapter as protected

**Usage**: Object.is() cycle detection throttling

**Critical Discovery References**:
- **Discovery 05**: Part of dual-strategy cycle detection

---

#### 3.2 MAX_EVALUATE_FAILURES Constant

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` line 78

**Declaration**: `private readonly MAX_EVALUATE_FAILURES = 2;`

**Extraction Strategy**: Move to CDPCommonAdapter as protected readonly

**Usage**: Throttling threshold for Object.is() failures

**Critical Discovery References**:
- **Discovery 05**: Part of dual-strategy cycle detection

---

### 4. Type Definitions (Complete Extraction)

#### 4.1 IEnhancedVariableData Interface

**Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts` lines 36-61 (26 lines)

**Extraction Strategy**: Move to CDPCommonAdapter.ts file

**Rationale**: Type definition used for cycle detection, depth tracking, truncation - universal concerns

**Changes Required**: NONE - move as-is

---

### 5. NEW Logic to Add (CDPCommonAdapter Only)

#### 5.1 SCOPE_TYPE_MAP Constant

**Location**: NEW in CDPCommonAdapter.ts
**Reference**: See `scope-type-mapping-design.md`

**Implementation**:
```typescript
const SCOPE_TYPE_MAP: Record<string, { name: string; expensive: boolean; writable: boolean }> = {
    'local':   { name: 'Local',   expensive: false, writable: true },
    'closure': { name: 'Closure', expensive: false, writable: true },
    'catch':   { name: 'Catch',   expensive: false, writable: true },
    'block':   { name: 'Block',   expensive: false, writable: false },
    'with':    { name: 'With',    expensive: false, writable: false },
    'script':  { name: 'Script',  expensive: true,  writable: false },
    'module':  { name: 'Module',  expensive: true,  writable: false },
    'global':  { name: 'Global',  expensive: true,  writable: false },
    'eval':    { name: 'Eval',    expensive: false, writable: false }
};
```

**Critical Discovery References**:
- **Discovery 02**: Scope type differences
- **Discovery 03**: Writable flag for setVariable restrictions

---

#### 5.2 mapScopeType() Method

**Location**: NEW in CDPCommonAdapter.ts
**Reference**: See `scope-type-mapping-design.md`

**Implementation**:
```typescript
protected mapScopeType(cdpScopeType: string): { name: string; expensive: boolean; writable: boolean } {
    const scopeInfo = SCOPE_TYPE_MAP[cdpScopeType];
    if (!scopeInfo) {
        this.logger?.warn(`Unknown CDP scope type encountered: "${cdpScopeType}". Treating as read-only.`);
        return {
            name: cdpScopeType,
            expensive: false,
            writable: false
        };
    }
    return scopeInfo;
}
```

**Critical Discovery References**:
- **Discovery 02**: Unknown scope type handling

---

#### 5.3 CDP_COMMON_CAPABILITIES Constant

**Location**: NEW in CDPCommonAdapter.ts

**Implementation**:
```typescript
protected static readonly CDP_COMMON_CAPABILITIES: IDebugCapabilities = {
    supportsSetVariable: true,
    supportsVariablePaging: true,
    supportsVariableType: true,
    supportsMemoryReferences: false,
    supportsProgressReporting: true,
    supportsInvalidatedEvent: true,
    supportsMemoryEvent: false,
    supportsEvaluateForHovers: true,
    supportsSetExpression: true,
    supportsDataBreakpoints: false
};
```

**Rationale**: Per Critical Discovery 04, capabilities are identical for pwa-node and pwa-chrome

**Critical Discovery References**:
- **Discovery 04**: DAP capabilities identical

---

## What Stays in NodeDebugAdapter

### Minimal Node Implementation (Post-Refactor)

**File**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts`

**Total Lines**: ~20 lines (97% reduction from 720 lines)

**Implementation**:
```typescript
import * as vscode from 'vscode';
import { CDPCommonAdapter } from './CDPCommonAdapter';

/**
 * Debug adapter for Node.js debugging (pwa-node).
 *
 * Extends CDPCommonAdapter for shared V8/CDP functionality.
 *
 * Node-specific behaviors:
 * - (Currently none - all logic shared with Chrome)
 * - Future: Node-specific thread handling for worker_threads if needed
 * - Future: Node-specific scope customization if discovered during testing
 */
export class NodeDebugAdapter extends CDPCommonAdapter {
    constructor(session: vscode.DebugSession) {
        super(session, CDPCommonAdapter.CDP_COMMON_CAPABILITIES);
    }

    // All methods inherited from CDPCommonAdapter:
    // - listVariables (lines 108-375 extracted)
    // - setVariable (lines 382-483 extracted)
    // - getVariableChildren (lines 490-530 extracted)
    // - streamVariables (lines 536-546 extracted)
    // - getMostRecentlyStoppedThread (lines 554-578 extracted)
    // - estimateVariableSize (lines 584-623 extracted)
    // - buildSafeAssignment (lines 633-654 extracted)
    // - encodeValueForEvaluate (lines 663-718 extracted)
    // - mapScopeType (NEW in CDPCommon)

    // Node-specific overrides would go here if needed
    // (currently none identified - all logic shared)
}
```

**Rationale**: See `node-specific-logic.md` for detailed analysis

**Summary**:
- No Node-specific methods identified
- All logic works for both Node and Chrome
- Constructor only passes capabilities to CDPCommon
- Future overrides can be added if discovered during testing

---

## What ChromeDebugAdapter Will Override

### Chrome Implementation (New File)

**File**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/chrome-adapter.ts` (NEW)

**Total Lines**: ~50 lines (constructor + comments)

**Implementation**:
```typescript
import * as vscode from 'vscode';
import { CDPCommonAdapter } from './CDPCommonAdapter';

/**
 * Debug adapter for Chrome/Chromium debugging (pwa-chrome).
 *
 * Used for:
 * - Extension Host debugging (dogfooding VSC Bridge extension itself)
 * - Future: General browser debugging (Chrome, Edge)
 *
 * Extends CDPCommonAdapter for shared V8/CDP functionality.
 *
 * Current implementation focuses on Extension Host (single-target model).
 *
 * NOTE: Browser support would add:
 * - Multi-target handling (pages, iframes, workers, service workers)
 *   See: js-debug's target discovery and attachment logic
 * - Browser-only features (event listener breakpoints, network view)
 * - Dynamic target creation/destruction events
 *   Listen to: targetCreated, targetDestroyed CDP events
 * - Per-target variable reference management
 */
export class ChromeDebugAdapter extends CDPCommonAdapter {
    constructor(session: vscode.DebugSession) {
        super(session, CDPCommonAdapter.CDP_COMMON_CAPABILITIES);
        // NOTE: Browser-only capabilities (instrumentation breakpoints, network view)
        // would be added here when general browser debugging support is implemented
    }

    // All methods inherited from CDPCommonAdapter (identical to NodeDebugAdapter):
    // - listVariables
    // - setVariable
    // - getVariableChildren
    // - streamVariables
    // - getMostRecentlyStoppedThread
    // - estimateVariableSize
    // - buildSafeAssignment
    // - encodeValueForEvaluate
    // - mapScopeType

    // Chrome-specific overrides:
    // (currently none needed for Extension Host)

    // Future browser support would override:
    /**
     * Get most recently stopped thread for multi-target browser debugging.
     *
     * Extension Host: simple single-thread model (inherited implementation works)
     *
     * Browser support would need to:
     * - Track multiple threads (main page, iframes, workers)
     * - Refresh thread list on targetCreated/targetDestroyed
     * - Return appropriate thread based on which target stopped
     */
    // protected async getMostRecentlyStoppedThread(): Promise<number | null> {
    //     // Multi-target implementation
    //     // ...
    // }
}
```

**Rationale**:
- Extension Host has same simple thread model as Node
- No Chrome-specific overrides needed for Extension Host debugging
- Extensibility comments mark where browser support would be added
- Identical implementation to NodeDebugAdapter (both use CDPCommon)

**Future Browser Support Overrides** (if implementing multi-target):
1. `getMostRecentlyStoppedThread()` - Multi-target thread tracking
2. Target management methods - Create/destroy target handling
3. Capabilities - Add browser-only features

---

## Risks and Mitigations

### Risk 1: Missing Shared Logic During Extraction

**Severity**: HIGH
**Likelihood**: MEDIUM (mitigated by thorough analysis)

**Impact**: If we miss extraction candidates, Phase 1 will have incomplete CDPCommonAdapter, requiring rework

**Mitigation**:
- ✅ Read entire NodeDebugAdapter file (all 720 lines)
- ✅ Cross-referenced helper methods and dependencies
- ✅ Created dependency graph (see extraction-candidates.md)
- ✅ All Critical Discoveries addressed
- ✅ Compared against BaseDebugAdapter abstract contract
- **Phase 1**: Extract methods in dependency order (bottom-up)
- **Phase 3**: Manual validation catches missed logic

**Status**: LOW RISK (after Phase 0 analysis)

---

### Risk 2: Incorrect Node-Specific Classification

**Severity**: MEDIUM
**Likelihood**: LOW (analysis complete)

**Impact**: If we incorrectly classify logic as Node-specific, ChromeDebugAdapter won't work

**Mitigation**:
- ✅ Referenced Critical Discovery 04 (capabilities identical)
- ✅ Analyzed thread detection (likely universal)
- ✅ Analyzed scope handling (universal via SCOPE_TYPE_MAP)
- ✅ Documented rationale for all "stays in Node" decisions
- **Phase 6**: Manual testing reveals if Chrome needs overrides

**Status**: LOW RISK (default to "shared" strategy)

---

### Risk 3: Scope Filtering Refactoring Breaks Existing Behavior

**Severity**: HIGH
**Likelihood**: LOW (simple refactoring)

**Impact**: If scope filtering logic breaks, variable inspection fails

**Mitigation**:
- Keep refactoring minimal (replace hardcoded names with mapScopeType())
- Preserve all filtering logic (expensive flag, scope filter parameter)
- **Phase 3**: Manual validation with pwa-node sessions catches regressions
- Test multiple scope types (Local, Closure, Global, Script)

**Status**: LOW RISK (straightforward replacement)

---

### Risk 4: setVariable Writability Check Breaks Existing Functionality

**Severity**: MEDIUM
**Likelihood**: LOW (enhancement, not change)

**Impact**: If writability check is too strict, legitimate modifications fail

**Mitigation**:
- Only add check if scopeType parameter provided (optional check)
- Existing fallback to evaluate still works
- **Phase 3**: Validate setVariable still works for Node
- **Phase 6**: Validate read-only scope error messages clear

**Status**: LOW RISK (additive enhancement)

---

### Risk 5: TypeScript Compilation Errors During Extraction

**Severity**: LOW
**Likelihood**: MEDIUM (expected during extraction)

**Impact**: Build failures during Phase 1

**Mitigation**:
- Extract methods in dependency order (helpers first, main methods last)
- Run `just build` after each method extraction
- Fix compilation errors incrementally
- Use TypeScript compiler errors as checklist

**Status**: EXPECTED (normal part of Phase 1)

---

### Risk 6: Cycle Detection Throttling Logic Breaks

**Severity**: MEDIUM
**Likelihood**: LOW (exact copy)

**Impact**: Object.is() failures not throttled, performance degradation

**Mitigation**:
- Extract evaluateFailures Map and MAX_EVALUATE_FAILURES unchanged
- Preserve entire Object.is() logic block exactly
- **Phase 3**: Test with circular references (objects with cycles)

**Status**: LOW RISK (copy without modification)

---

## Implementation Order

### Phase 1: Extract CDPCommonAdapter (Bottom-Up)

**Goal**: Create CDPCommonAdapter with all shared logic

**Order** (dependency-driven):

1. **Create file skeleton**:
   - `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/CDPCommonAdapter.ts`
   - Extend BaseDebugAdapter
   - Add imports
   - Build successfully (abstract methods as stubs)

2. **Add constants and state** (no dependencies):
   - SCOPE_TYPE_MAP constant
   - CDP_COMMON_CAPABILITIES constant
   - evaluateFailures Map
   - MAX_EVALUATE_FAILURES constant
   - IEnhancedVariableData interface

3. **Add helper methods** (bottom-up by dependency):
   - encodeValueForEvaluate() - no deps
   - buildSafeAssignment() - depends on encodeValueForEvaluate
   - estimateVariableSize() - no deps
   - mapScopeType() - depends on SCOPE_TYPE_MAP
   - getMostRecentlyStoppedThread() - depends on BaseDebugAdapter methods

4. **Add main methods** (depend on helpers):
   - streamVariables() - no deps (placeholder)
   - getVariableChildren() - no deps (simple)
   - setVariable() - depends on buildSafeAssignment, getMostRecentlyStoppedThread
   - listVariables() - depends on estimateVariableSize, getMostRecentlyStoppedThread

5. **Add extensibility comments**:
   - Mark locations where browser support would extend
   - Document multi-target considerations

6. **Verify compilation**:
   - `just build` succeeds
   - No errors or warnings

---

### Phase 2: Refactor NodeDebugAdapter (Top-Down)

**Goal**: Replace NodeDebugAdapter implementation with CDPCommon inheritance

**Order**:

1. **Change class declaration**:
   - `extends CDPCommonAdapter` (not BaseDebugAdapter)
   - Import CDPCommonAdapter

2. **Update constructor**:
   - Call `super(session, CDPCommonAdapter.CDP_COMMON_CAPABILITIES)`
   - Remove capabilities object definition

3. **Remove extracted methods** (verify each removal):
   - Remove listVariables (now in CDPCommon)
   - Remove setVariable (now in CDPCommon)
   - Remove getVariableChildren (now in CDPCommon)
   - Remove streamVariables (now in CDPCommon)
   - Remove getMostRecentlyStoppedThread (now in CDPCommon)
   - Remove estimateVariableSize (now in CDPCommon)
   - Remove buildSafeAssignment (now in CDPCommon)
   - Remove encodeValueForEvaluate (now in CDPCommon)

4. **Remove extracted state**:
   - Remove evaluateFailures Map (now in CDPCommon)
   - Remove MAX_EVALUATE_FAILURES constant (now in CDPCommon)
   - Remove IEnhancedVariableData interface (now in CDPCommon)

5. **Verify compilation**:
   - `just build` succeeds
   - NodeDebugAdapter ~20 lines
   - No errors or warnings

---

### Phase 3: Validate NodeDebugAdapter (Manual Testing)

**Goal**: Confirm no regressions from refactoring

**Test Strategy**: See main plan Phase 3 section

**Acceptance Criteria**:
- [ ] listVariables works for pwa-node sessions
- [ ] setVariable works for local/closure scopes
- [ ] Expression evaluation works
- [ ] Cycle detection works (test circular objects)
- [ ] Error handling works (invalid expressions)
- [ ] Behavior identical to pre-refactor

---

## Validation Strategy

### Compile-Time Validation (Phases 1-2)

**Phase 1**: After each method extraction to CDPCommonAdapter:
- Run `just build`
- Fix TypeScript errors
- Verify imports/exports correct

**Phase 2**: After NodeDebugAdapter refactoring:
- Run `just build`
- Verify no compilation errors
- Verify NodeDebugAdapter reduced to ~20 lines

---

### Runtime Validation (Phase 3)

**Manual Testing** (pwa-node sessions):

**Setup**:
```bash
just build
cd test/
vscb script run bp.clear.project
```

**Test Cases**:
1. **Simple Variables**: Breakpoint in test/javascript/simple.js, list variables
2. **Closures**: Breakpoint in nested function, verify closure scope
3. **Circular References**: Create circular object, verify cycle detection
4. **setVariable**: Modify local variable, verify change
5. **Error Handling**: Invalid expression, verify clear error

**Expected**: All tests pass, identical behavior to pre-refactor

---

### Regression Detection

**How to Catch Regressions**:
1. Compare output before/after refactor
2. Check for missing variables
3. Verify cycle markers present
4. Ensure error messages clear
5. Performance acceptable (no slowdown)

**If Regression Found**:
1. Document specific failure
2. Compare CDPCommon implementation to original NodeDebugAdapter
3. Check for missed logic in extraction
4. Fix in CDPCommonAdapter (not NodeDebugAdapter)

---

## Summary

### Extraction Plan Overview

| Component | Lines | Action | Phase |
|-----------|-------|--------|-------|
| **CDPCommonAdapter** | ~640 | CREATE | Phase 1 |
| - listVariables | 268 | Extract + refactor scope filtering | Phase 1 |
| - setVariable | 102 | Extract + add writability check | Phase 1 |
| - getVariableChildren | 41 | Extract unchanged | Phase 1 |
| - streamVariables | 11 | Extract unchanged | Phase 1 |
| - getMostRecentlyStoppedThread | 25 | Extract unchanged | Phase 1 |
| - estimateVariableSize | 40 | Extract unchanged | Phase 1 |
| - buildSafeAssignment | 22 | Extract unchanged | Phase 1 |
| - encodeValueForEvaluate | 56 | Extract unchanged | Phase 1 |
| - mapScopeType | ~20 | NEW method | Phase 1 |
| - SCOPE_TYPE_MAP | ~30 | NEW constant | Phase 1 |
| - CDP_COMMON_CAPABILITIES | ~15 | NEW constant | Phase 1 |
| - IEnhancedVariableData | 26 | Move interface | Phase 1 |
| **NodeDebugAdapter** | ~20 | REFACTOR | Phase 2 |
| - Constructor | ~5 | Keep, call super | Phase 2 |
| - All methods | 0 | Remove (inherited) | Phase 2 |
| **ChromeDebugAdapter** | ~50 | CREATE | Phase 4 |
| - Constructor | ~5 | Same as Node | Phase 4 |
| - Extensibility comments | ~30 | Document browser support | Phase 4 |

---

### Critical Discovery Compliance

- ✅ **Discovery 01**: pwa-chrome adapter (not pwa-extensionHost) - confirmed by plan
- ✅ **Discovery 02**: SCOPE_TYPE_MAP handles Node (Script) and Chrome (Block) scopes
- ✅ **Discovery 03**: Writable flag enforces setVariable restrictions
- ✅ **Discovery 04**: Capabilities shared via CDP_COMMON_CAPABILITIES constant
- ✅ **Discovery 05**: Dual-strategy cycle detection preserved exactly in listVariables

---

### Ready for Phase 1

**GO Criteria**:
- ✅ All extraction candidates identified with line ranges
- ✅ All dependencies mapped
- ✅ All Critical Discoveries addressed
- ✅ Implementation order defined
- ✅ Risks identified with mitigations
- ✅ Validation strategy defined

**Phase 0 Complete**: Extraction plan is comprehensive, actionable, and ready for implementation.

**Next Step**: Proceed to Phase 1 - Extract CDPCommonAdapter

---

**Document Complete**: Full extraction plan with implementation order, validation strategy, and risk mitigation.

**Phase 0 Deliverables**:
1. ✅ extraction-candidates.md - What moves to CDPCommon
2. ✅ node-specific-logic.md - What stays in Node
3. ✅ scope-type-mapping-design.md - SCOPE_TYPE_MAP design
4. ✅ extraction-plan.md - Comprehensive refactoring plan (this file)

**Ready for Phase 1**: YES
