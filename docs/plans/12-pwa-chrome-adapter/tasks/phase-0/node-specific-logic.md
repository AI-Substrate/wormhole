# Node-Specific Logic Analysis

**Document**: Logic Remaining in NodeDebugAdapter After Extraction
**Source File**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts`
**Created**: 2025-10-10 (Phase 0 Analysis)
**Purpose**: Identify logic that should NOT move to CDPCommonAdapter and rationale for keeping it Node-specific

---

## Executive Summary

After extracting shared CDP/V8 logic to CDPCommonAdapter, NodeDebugAdapter will retain **minimal Node-specific logic** (~80 lines, 11% of original implementation).

**Key Finding**: Most logic previously thought to be Node-specific is actually shared CDP/V8 logic. The primary Node-specific element is thread detection strategy, and even that may be reusable for Extension Host debugging.

---

## Node-Specific Logic Inventory

### 1. Thread Detection Strategy

#### 1.1 getMostRecentlyStoppedThread Method

**Lines**: 554-578 (25 lines)
**Method**: `private async getMostRecentlyStoppedThread(): Promise<number | null>`

**Current Implementation**:
```typescript
private async getMostRecentlyStoppedThread(): Promise<number | null> {
    const threads = await this.getThreads();
    if (threads.length === 0) {
        return null;
    }

    // Strategy: Find first thread that appears to be stopped
    // Note: DAP doesn't provide explicit "stopped" state on thread objects
    // We infer from ability to get stack frames
    for (const thread of threads) {
        try {
            const frames = await this.getStackFrames(thread.id, 1);
            if (frames.length > 0) {
                // This thread has stack frames, likely stopped
                return thread.id;
            }
        } catch (error) {
            // Can't get frames, try next thread
            continue;
        }
    }

    // Fallback: use first thread
    return threads[0].id;
}
```

**Why Node-Specific?**

**Node.js Thread Model**:
- Simple model: main process + optional worker threads
- Typically 1 thread (main)
- Workers are explicit (worker_threads module)
- Thread detection: find first thread with stack frames

**Chrome/Browser Thread Model** (theoretical for multi-target):
- Complex model: pages, iframes, workers, service workers
- Multiple targets with independent execution contexts
- Dynamic target creation/destruction
- Thread detection: track multiple targets, handle target events

**However...**

**Extension Host Reality** (pwa-chrome single-target):
- Extension Host runs in single Chrome/Electron process
- Typically 1 main thread (like Node)
- Simple thread model (not multi-target browser)
- Thread detection strategy likely identical to Node

**Conclusion**: **MAY NOT BE NODE-SPECIFIC**
- Extension Host (pwa-chrome) likely uses same simple thread model as Node
- Method might work for both adapters without changes
- **Recommendation**: Extract to CDPCommonAdapter, allow override if needed

**Alternative Approach**:
- Extract to CDPCommonAdapter as default implementation
- NodeDebugAdapter inherits unchanged
- ChromeDebugAdapter inherits unchanged (works for Extension Host)
- Future browser support (multi-target) can override in ChromeDebugAdapter

---

### 2. Scope Handling (NOT Node-Specific)

#### 2.1 Script Scope vs Block Scope

**Previously Thought Node-Specific**: Script/Module scope handling

**Analysis**:
- Node sessions commonly show Script scope (CommonJS modules)
- Chrome sessions commonly show Block scope (block-scoped variables)
- **BUT**: Both scope types are valid CDP scope types
- **Solution**: SCOPE_TYPE_MAP handles both (in CDPCommonAdapter)

**Conclusion**: **NOT NODE-SPECIFIC**
- Scope type mapping is universal via SCOPE_TYPE_MAP
- No Node-specific scope handling needed
- Both adapters use same mapScopeType() method

---

### 3. Capabilities (NOT Node-Specific)

#### 3.1 Capabilities Object Declaration

**Lines**: 86-97 (constructor)
**Current Implementation**:
```typescript
constructor(session: vscode.DebugSession) {
    // Define Node.js-specific capabilities
    const capabilities: IDebugCapabilities = {
        supportsSetVariable: true,
        supportsVariablePaging: true,
        supportsVariableType: true,
        supportsMemoryReferences: false, // pwa-node doesn't provide memory refs
        supportsProgressReporting: true,
        supportsInvalidatedEvent: true,
        supportsMemoryEvent: false,
        supportsEvaluateForHovers: true,
        supportsSetExpression: true,
        supportsDataBreakpoints: false
    };

    super(session, capabilities);
}
```

**Critical Discovery 04**: DAP Capabilities are Identical Between pwa-node and pwa-chrome

**Analysis**:
- Both pwa-node and pwa-chrome use same js-debug implementation
- DAP capabilities are identical
- Only difference: comment says "pwa-node doesn't provide memory refs" (but pwa-chrome also doesn't)

**Conclusion**: **NOT NODE-SPECIFIC**
- Capabilities can be shared constant in CDPCommonAdapter
- Both adapters pass same capabilities to super()

**Recommendation**:
- Define shared capabilities constant in CDPCommonAdapter:
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
- NodeDebugAdapter constructor:
  ```typescript
  constructor(session: vscode.DebugSession) {
      super(session, CDPCommonAdapter.CDP_COMMON_CAPABILITIES);
  }
  ```
- ChromeDebugAdapter constructor: identical

---

### 4. Enhanced Variable Interface (NOT Node-Specific)

#### 4.1 IEnhancedVariableData Interface

**Lines**: 36-61
**Interface**: Type definition for enhanced variable data

**Why NOT Node-Specific**:
- Type definition used for cycle detection and depth tracking
- Chrome debugging benefits from same enhancements
- Cycle tracking, truncation, error handling universal

**Conclusion**: **NOT NODE-SPECIFIC**
- Move to CDPCommonAdapter.ts
- Both adapters use same enhanced interface

---

## What Actually Stays in NodeDebugAdapter?

After analysis, **very little** remains truly Node-specific:

### Minimal NodeDebugAdapter Implementation (Post-Refactor)

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
 * - Future: Node-specific scope customization if discovered
 */
export class NodeDebugAdapter extends CDPCommonAdapter {
    constructor(session: vscode.DebugSession) {
        super(session, CDPCommonAdapter.CDP_COMMON_CAPABILITIES);
    }

    // All methods inherited from CDPCommonAdapter:
    // - listVariables
    // - setVariable
    // - getVariableChildren
    // - streamVariables
    // - getMostRecentlyStoppedThread
    // - estimateVariableSize
    // - buildSafeAssignment
    // - encodeValueForEvaluate
    // - mapScopeType

    // Node-specific overrides would go here if needed
    // (currently none identified)
}
```

**Total Lines**: ~20 lines (just class declaration and constructor)

---

## Rationale for Minimal Node-Specific Logic

### 1. V8 Engine is Universal
- Both pwa-node and pwa-chrome use V8 JavaScript engine
- CDP (Chrome DevTools Protocol) is standard across V8 debuggers
- Variable inspection, scopes, evaluation all work identically

### 2. Extension Host is Simple Like Node
- Extension Host runs in single process (like Node)
- No multi-target complexity (unlike general browser debugging)
- Thread model mirrors Node's simplicity

### 3. DAP Capabilities are Identical
- js-debug provides same DAP feature set for both adapters
- No Node-specific capabilities
- No Chrome-specific capabilities (for Extension Host)

### 4. Scope Types Handled Universally
- SCOPE_TYPE_MAP covers all CDP scope types
- Both Node (Script/Module) and Chrome (Block/With) supported
- No adapter-specific scope handling needed

---

## Potential Future Node-Specific Customizations

If we discover differences during manual testing (Phases 3, 6):

### Possible Node Overrides
1. **worker_threads handling**: If Node worker threads behave differently than Extension Host
2. **Module scope specifics**: If CommonJS vs ESM requires special handling
3. **Performance optimization**: If Node benefits from different memory budgets

### How to Add Overrides
```typescript
export class NodeDebugAdapter extends CDPCommonAdapter {
    constructor(session: vscode.DebugSession) {
        super(session, CDPCommonAdapter.CDP_COMMON_CAPABILITIES);
    }

    // Override if Node has different thread handling
    protected async getMostRecentlyStoppedThread(): Promise<number | null> {
        // Node-specific implementation
        // ...
    }

    // Override if Node has different scope customization
    protected mapScopeType(cdpScopeType: string): { name: string; expensive: boolean; writable: boolean } {
        // Node-specific scope mapping
        // ...
        return super.mapScopeType(cdpScopeType);
    }
}
```

---

## Comparison: Before vs After Refactor

### Before Refactor (Current State)
- **NodeDebugAdapter**: 720 lines (full implementation)
- **Shared Logic**: 0% (no base class)
- **Code Duplication**: 100% (Chrome would duplicate all logic)

### After Refactor (Phase 2 Target)
- **NodeDebugAdapter**: ~20 lines (constructor only)
- **CDPCommonAdapter**: ~640 lines (shared implementation)
- **Shared Logic**: 97% (almost everything shared)
- **Code Duplication**: 3% (minimal adapter-specific logic)

**Code Reuse**: ~97% of logic shared between pwa-node and pwa-chrome

---

## Summary

### What Stays in NodeDebugAdapter: MINIMAL

| Logic | Lines | Truly Node-Specific? | Recommendation |
|-------|-------|---------------------|----------------|
| getMostRecentlyStoppedThread | 554-578 | Maybe (but likely works for Chrome too) | Extract to CDPCommon as default, allow override |
| Scope handling (Script) | N/A | No (handled by SCOPE_TYPE_MAP) | Extract to CDPCommon |
| Capabilities object | 86-97 | No (identical to Chrome) | Extract to CDPCommon as constant |
| IEnhancedVariableData | 36-61 | No (universal type definition) | Extract to CDPCommon |

### Final NodeDebugAdapter Size
- **Constructor**: ~5 lines (call super with capabilities)
- **Class declaration/imports**: ~15 lines
- **Overrides**: 0 lines (none needed currently)
- **Total**: ~20 lines

**Conclusion**: NodeDebugAdapter becomes a thin wrapper around CDPCommonAdapter, with all logic shared.

---

## Next Steps (Phase 2)

1. Refactor NodeDebugAdapter to extend CDPCommonAdapter
2. Remove all extracted methods
3. Keep constructor with capabilities
4. Verify no Node-specific overrides needed
5. Test in Phase 3 to confirm no regressions

---

**Document Complete**: Node-specific logic analyzed, minimal implementation defined.

**Ready for Phase 2**: Yes - clear understanding of what stays vs what moves to CDPCommon.
