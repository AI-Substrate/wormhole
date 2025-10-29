# Extraction Candidates for CDPCommonAdapter

**Document**: Shared CDP/V8 Logic Extraction Plan
**Source File**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/runtime-inspection/adapters/node-adapter.ts`
**Created**: 2025-10-10 (Phase 0 Analysis)
**Purpose**: Identify all methods and logic to extract from NodeDebugAdapter into CDPCommonAdapter base class

---

## Executive Summary

This document identifies **all shared CDP/V8 logic** that should move from NodeDebugAdapter to the new CDPCommonAdapter base class. The extraction enables code reuse between pwa-node and pwa-chrome adapters, both of which use the V8 JavaScript engine and Chrome DevTools Protocol (CDP).

**Total Lines to Extract**: ~640 lines (89% of NodeDebugAdapter implementation)
**Remaining in NodeDebugAdapter**: ~80 lines (11% - Node-specific logic)

---

## Extraction Candidate Categories

### 1. Variable Retrieval and Listing Logic

#### 1.1 listVariables Method (PRIMARY EXTRACTION)

**Lines**: 108-375 (268 lines)
**Method**: `async listVariables(params: IListVariablesParams): Promise<IVariableData[] | IDebugError>`

**What it does**:
- Main entry point for variable inspection
- Gets thread and frame context
- Retrieves scopes from DAP
- Filters scopes based on expensive flag and scope filter
- Recursively expands variables with depth control
- Implements dual-strategy cycle detection
- Enforces memory budget limits
- Returns structured variable tree or error

**Dependencies**:
- `getMostRecentlyStoppedThread()` (lines 554-578) - thread detection
- `getStackFrames()` - from BaseDebugAdapter (lines 293-307)
- `getScopes()` - from BaseDebugAdapter (lines 312-331)
- `estimateVariableSize()` (lines 584-623) - memory estimation
- `memoryBudget.addNode()` - from BaseDebugAdapter
- DAP `customRequest('variables', ...)` - from BaseDebugAdapter

**Shared CDP/V8 Logic**:
- ✅ DAP scopes request pattern (lines 130)
- ✅ Scope filtering by expensive flag (lines 133-154)
- ✅ DAP variables request with pagination (lines 259-262)
- ✅ Recursive variable expansion (lines 163-306)
- ✅ Variable assembly and tree building (lines 292-342)

**Critical Discovery References**:
- **Discovery 05**: Dual-strategy cycle detection (variablesReference + Object.is()) - lines 188-255
- **Discovery 03**: Memory budget enforcement - lines 273-286
- **Discovery 02**: Scope type filtering (needs SCOPE_TYPE_MAP for Chrome compatibility)

**Complexity**: HIGH (recursive expansion, cycle detection, memory management)

**Extraction Strategy**:
- Extract entire method to CDPCommonAdapter
- Keep cycle detection strategies intact (variablesReference Set + Object.is())
- Preserve memory budget tracking
- Make scope filtering extensible via SCOPE_TYPE_MAP lookup

---

### 2. Cycle Detection Logic (DUAL STRATEGY)

#### 2.1 variablesReference Tracking (Strategy 1)

**Lines**: 159-160, 188-198, 254-255
**Implementation**: Set-based tracking within listVariables

**What it does**:
- Maintains Set of visited variablesReference IDs
- Checks if current variable already visited
- Marks cycles with `cycle: true` and `cycleVia: 'variablesReference'`

**Why Shared**:
- Language-agnostic approach works for all CDP-based adapters
- Fast performance (O(1) lookup)
- Reliable for detecting reference-based cycles

**Critical Discovery References**:
- **Discovery 05**: Part 1 of dual-strategy cycle detection (fast, universal)

**Extraction Strategy**:
- Extract as-is into CDPCommonAdapter
- No adapter-specific customization needed

---

#### 2.2 Object.is() Evaluation (Strategy 2)

**Lines**: 200-252
**Implementation**: JavaScript identity evaluation within listVariables

**What it does**:
- For variables with `evaluateName`, evaluates `Object.is(current, ancestor)`
- Compares against recent ancestors (last 4 for performance)
- Uses DAP evaluate with `context: 'hover'` (side-effect free)
- Implements throttling to avoid repeated failed evaluates (MAX_EVALUATE_FAILURES = 2)
- Tracks evaluation failures per evaluateName path

**Why Shared**:
- Both pwa-node and pwa-chrome debug JavaScript (V8 engine)
- Object.is() is standard JavaScript identity check
- Extension Host (pwa-chrome) benefits from accurate cycle detection

**Critical Discovery References**:
- **Discovery 05**: Part 2 of dual-strategy cycle detection (accurate for JavaScript)

**Dependencies**:
- DAP evaluate request with frameId
- `evaluateFailures` Map (lines 77-78)
- `MAX_EVALUATE_FAILURES` constant (line 78)

**Complexity**: MEDIUM (throttling logic, ancestor tracking)

**Extraction Strategy**:
- Extract entire Object.is() logic to CDPCommonAdapter
- Move `evaluateFailures` Map and `MAX_EVALUATE_FAILURES` to CDPCommonAdapter
- Keep throttling mechanism intact

---

### 3. Scope Filtering and Mapping Logic

#### 3.1 Scope Iteration and Filtering

**Lines**: 130-154 (within listVariables)
**Logic**: Filtering scopes based on expensive flag and scope name

**What it does**:
- Iterates over scopes returned by DAP
- Filters out expensive scopes unless `includeExpensive: true`
- Applies scopeFilter: 'all' | 'local' | 'closure' | 'global'
- Uses case-insensitive scope name matching

**Current Implementation** (Node-specific):
```typescript
// Lines 133-154
const scopesToProcess = scopes.filter(scope => {
    // Check expensive flag
    if (scope.expensive && !includeExpensive) {
        return false;
    }

    // Apply scope filter
    if (scopeFilter !== 'all') {
        const scopeName = scope.name.toLowerCase();
        if (scopeFilter === 'local' && !scopeName.includes('local')) {
            return false;
        }
        if (scopeFilter === 'closure' && !scopeName.includes('closure')) {
            return false;
        }
        if (scopeFilter === 'global' && !scopeName.includes('global')) {
            return false;
        }
    }

    return true;
});
```

**Why Needs Refactoring for Chrome**:
- Current logic uses string matching on scope names
- Chrome has different scope types: Block, With (not in Node)
- Node has Script/Module scopes (may not appear in Chrome Extension Host)

**Critical Discovery References**:
- **Discovery 02**: Scope type differences (Node: Script/Global, Chrome: Block/With)

**Extraction Strategy**:
- Extract scope filtering logic to CDPCommonAdapter
- Replace hardcoded scope name matching with SCOPE_TYPE_MAP lookup
- Make scope filtering use CDP scope type, not scope name
- Example refactored logic:
  ```typescript
  const scopeInfo = this.mapScopeType(scope.type || scope.name.toLowerCase());
  if (scopeInfo.expensive && !includeExpensive) {
      return false;
  }
  ```

---

#### 3.2 Scope Type Mapping (NEW - to be added)

**Current State**: Not implemented in NodeDebugAdapter
**Needed For**: Chrome compatibility

**What it should do**:
- Map CDP scope types to DAP-friendly names
- Track expensive flag per scope type
- Track writable flag per scope type (for setVariable)
- Handle unknown scope types gracefully

**Proposed Implementation** (to add in CDPCommonAdapter):
```typescript
protected mapScopeType(cdpScopeType: string): { name: string; expensive: boolean; writable: boolean } {
    const scopeInfo = SCOPE_TYPE_MAP[cdpScopeType];
    if (!scopeInfo) {
        // Unknown scope type - log for future improvement
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
- **Discovery 02**: Scope type mapping required for Chrome (Block/With/Eval)
- **Discovery 03**: Writable flag required for setVariable restrictions

**Extraction Strategy**:
- Add SCOPE_TYPE_MAP constant to CDPCommonAdapter
- Add mapScopeType() helper method
- Use in scope filtering logic

---

### 4. Pagination Logic

#### 4.1 DAP Variables Request with Pagination

**Lines**: 259-262, 317-320 (within listVariables), 490-530 (getVariableChildren)
**Methods**: Inline logic in listVariables, dedicated getVariableChildren method

**What it does**:
- Requests variables from DAP with optional start/count parameters
- Slices children arrays to respect maxChildren parameter
- Returns partial variable lists with truncation indicators

**Implementation Locations**:

**In listVariables** (lines 259-262):
```typescript
const childrenResponse = await this.session.customRequest('variables', {
    variablesReference: variable.variablesReference,
    count: maxChildren
});
```

**In listVariables scope processing** (lines 317-320):
```typescript
const varsResponse = await this.session.customRequest('variables', {
    variablesReference: scope.variablesReference,
    count: 200 // Conservative default
});
```

**In getVariableChildren** (lines 490-530):
```typescript
async getVariableChildren(params: IVariableChildrenParams): Promise<IVariableData[] | IDebugError> {
    if (params.variablesReference === 0) {
        return createDebugError(DebugErrorCode.E_INVALID_REFERENCE);
    }

    const lockKey = `get-children-${this.session.id}-${params.variablesReference}`;

    return await this.withOperationLock(
        lockKey,
        async (signal) => {
            try {
                const requestParams: any = {
                    variablesReference: params.variablesReference
                };

                // Add pagination parameters if provided
                if (params.filter) {
                    requestParams.filter = params.filter;
                }
                if (params.start !== undefined) {
                    requestParams.start = params.start;
                }
                if (params.count !== undefined) {
                    requestParams.count = params.count;
                }

                const response = await this.session.customRequest('variables', requestParams);
                return response.variables || [];
            } catch (error) {
                if (signal.aborted) {
                    return createDebugError(DebugErrorCode.E_BUSY, 'Operation was aborted');
                }
                return createDebugError(
                    DebugErrorCode.E_INVALID_REFERENCE,
                    error instanceof Error ? error.message : String(error)
                );
            }
        }
    ) as Promise<IVariableData[] | IDebugError>;
}
```

**Why Shared**:
- DAP pagination is standard across all adapters
- Both pwa-node and pwa-chrome support same DAP variables request format

**Extraction Strategy**:
- Extract getVariableChildren method to CDPCommonAdapter (entire method)
- Keep pagination logic unchanged
- Reuse in both Node and Chrome adapters

---

### 5. setVariable Dual Strategy

#### 5.1 Main setVariable Method

**Lines**: 382-483 (102 lines)
**Method**: `async setVariable(params: ISetVariableParams): Promise<ISetVariableResult>`

**What it does**:
1. **Strategy 1**: Try DAP setVariable request first (lines 397-415)
2. **Strategy 2**: Fallback to evaluate-based assignment (lines 418-455)
3. Error handling for read-only scopes (should be added based on Discovery 03)

**Current Implementation**:
```typescript
async setVariable(params: ISetVariableParams): Promise<ISetVariableResult> {
    // Build collision-resistant lock key
    const threads = await this.getThreads();
    const threadId = threads.length > 0 ? threads[0].id : 0;
    const frames = await this.getStackFrames(threadId, 1);
    const frameId = params.frameId ?? (frames.length > 0 ? frames[0].id : 0);

    const lockKey = `set-var-${this.session.id}-${threadId}-${frameId}-${params.variablesReference}-${params.name}`;

    const result = await this.withOperationLock(
        lockKey,
        async (signal) => {
            try {
                // Strategy 1: Try setVariable request first
                if (this.capabilities.supportsSetVariable && params.variablesReference !== undefined) {
                    try {
                        const response = await this.session.customRequest('setVariable', {
                            variablesReference: params.variablesReference,
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
                        } as ISetVariableResult;
                    } catch (error) {
                        // setVariable failed, try evaluate fallback
                    }
                }

                // Strategy 2: Evaluate fallback for property paths
                const threadId = await this.getMostRecentlyStoppedThread();
                if (threadId === null) {
                    return {
                        success: false,
                        error: createDebugError(DebugErrorCode.E_NO_THREADS)
                    } as ISetVariableResult;
                }

                const frames = await this.getStackFrames(threadId, 1);
                const frameId = params.frameId ?? frames[0].id;

                // Build safe assignment expression
                const safeAssignment = this.buildSafeAssignment(params.name, params.value);
                if (safeAssignment.error) {
                    return {
                        success: false,
                        error: safeAssignment.error
                    } as ISetVariableResult;
                }

                const evalResponse = await this.evaluateExpression(safeAssignment.expr!, frameId);

                if ('code' in evalResponse) {
                    // Evaluation returned an error
                    return {
                        success: false,
                        error: evalResponse
                    } as ISetVariableResult;
                }

                return {
                    success: true,
                    value: evalResponse.result,
                    type: evalResponse.type,
                    variablesReference: evalResponse.variablesReference
                } as ISetVariableResult;
            } catch (error) {
                if (signal.aborted) {
                    return {
                        success: false,
                        error: createDebugError(DebugErrorCode.E_BUSY, 'Operation was aborted')
                    } as ISetVariableResult;
                }
                return {
                    success: false,
                    error: createDebugError(
                        DebugErrorCode.E_MODIFICATION_FAILED,
                        error instanceof Error ? error.message : String(error)
                    )
                } as ISetVariableResult;
            }
        }
    );

    // withOperationLock might return IDebugError for busy/timeout
    if ('code' in result) {
        return {
            success: false,
            error: result
        };
    }

    return result as ISetVariableResult;
}
```

**Why Shared**:
- Both pwa-node and pwa-chrome use same DAP setVariable request format
- Evaluate fallback works identically for V8-based debuggers

**Critical Discovery References**:
- **Discovery 03**: setVariable only works on local/closure/catch scopes
- Needs writable scope check before attempting modification

**Enhancement Needed**:
- Add scope writability check (use SCOPE_TYPE_MAP)
- Return clear error for read-only scopes

**Dependencies**:
- `buildSafeAssignment()` (lines 633-654)
- `evaluateExpression()` - from BaseDebugAdapter (lines 395-410)
- `getMostRecentlyStoppedThread()` (lines 554-578)

**Extraction Strategy**:
- Extract entire setVariable method to CDPCommonAdapter
- Add scope writability check using SCOPE_TYPE_MAP
- Extract helper methods: buildSafeAssignment, encodeValueForEvaluate

---

#### 5.2 buildSafeAssignment Helper

**Lines**: 633-654 (22 lines)
**Method**: `private buildSafeAssignment(targetPath: string, value: string)`

**What it does**:
- Validates variable path to prevent injection
- Allows: simple identifiers, dot notation, bracket notation
- Pattern: `/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*|\[[^\]]+\])*$/`
- Encodes value safely for evaluate expression

**Why Shared**:
- Injection prevention is universal concern
- JavaScript path validation works for both Node and Chrome

**Dependencies**:
- `encodeValueForEvaluate()` (lines 663-718)

**Extraction Strategy**:
- Extract to CDPCommonAdapter as protected method
- No changes needed

---

#### 5.3 encodeValueForEvaluate Helper

**Lines**: 663-718 (56 lines)
**Method**: `private encodeValueForEvaluate(valueStr: string)`

**What it does**:
- Safely encodes value for use in evaluate expression
- Handles special number literals (NaN, Infinity, -Infinity)
- Handles boolean literals (true, false)
- Handles null, undefined
- Handles BigInt (ends with 'n')
- Handles numbers (integer, decimal, scientific notation)
- Handles string literals (quoted and unquoted)
- Uses JSON.stringify for safe escaping

**Why Shared**:
- JavaScript value encoding is same for Node and Chrome
- Both use V8 engine with same type system

**Extraction Strategy**:
- Extract to CDPCommonAdapter as protected method
- No changes needed

---

### 6. Memory Budget Tracking

#### 6.1 estimateVariableSize Helper

**Lines**: 584-623 (40 lines)
**Method**: `private estimateVariableSize(variable: IVariableData): number`

**What it does**:
- Estimates memory footprint of a variable in bytes
- Base size: 100 bytes for metadata
- Adds string length * 2 (UTF-16 chars) for name, value, type
- Type-specific estimation:
  - Arrays: `indexedVariables * 50` bytes
  - Maps/Sets: `namedVariables * 75` bytes
  - Buffers/TypedArrays: extracts size from value string (e.g., "Uint8Array(1024)")

**Why Shared**:
- Memory estimation is universal for all adapters
- Both Node and Chrome benefit from preventing crashes

**Critical Discovery References**:
- **Discovery 03**: Memory budget tracking (5MB max, 20k nodes max)

**Extraction Strategy**:
- Extract to CDPCommonAdapter as protected method
- No changes needed

---

#### 6.2 Memory Budget Enforcement

**Lines**: 273-286 (within listVariables)
**Logic**: Check budget before expanding children

**What it does**:
- Before expanding each child variable:
  - Estimates size with `estimateVariableSize()`
  - Calls `memoryBudget.addNode(estimatedBytes)`
  - If budget exceeded, returns truncated result

**Why Shared**:
- Memory protection needed for both Node and Chrome
- Extension Host can have large variable graphs

**Extraction Strategy**:
- Keep budget enforcement in listVariables (already extracted)
- Relies on estimateVariableSize() helper

---

### 7. Expression Evaluation Logic

#### 7.1 DAP Evaluate with Context Handling

**Lines**: 216-221, 440 (within listVariables and setVariable)
**Logic**: Inline DAP evaluate requests

**What it does**:
- Sends DAP evaluate request with expression and frameId
- Uses context parameter for side-effect control:
  - `'hover'` - side-effect free (for Object.is() cycle detection)
  - `'watch'` - allows side effects (for setVariable evaluate fallback)

**Current Usage in NodeDebugAdapter**:

**In listVariables (Object.is() cycle detection)** - lines 216-221:
```typescript
const evalResponse = await this.session.customRequest('evaluate', {
    expression: expr,
    frameId: frameId,
    context: 'hover' // Side-effect free (throwOnSideEffect)
});
```

**In setVariable (evaluate fallback)** - line 440:
```typescript
const evalResponse = await this.evaluateExpression(safeAssignment.expr!, frameId);
```

**Why Shared**:
- DAP evaluate is standard across CDP-based adapters
- Context handling is same for Node and Chrome

**Note**: BaseDebugAdapter already provides `evaluateExpression()` method (lines 395-410)
- Uses `context: 'watch'` by default
- For cycle detection, need inline evaluate with `context: 'hover'`

**Extraction Strategy**:
- Keep inline evaluate requests in listVariables (for hover context)
- Reuse BaseDebugAdapter.evaluateExpression() for setVariable
- No additional extraction needed (already using base class method)

---

### 8. streamVariables Placeholder

**Lines**: 536-546 (11 lines)
**Method**: `async streamVariables(params: IStreamVariablesParams): Promise<IStreamResult>`

**What it does**:
- Returns "not implemented" error
- Suggests using debug.stream-variables script instead

**Why Shared**:
- Placeholder implementation is same for all adapters
- Future streaming feature would be shared

**Extraction Strategy**:
- Extract to CDPCommonAdapter as-is
- No changes needed

---

## Summary of Extraction Candidates

### Methods to Extract (Complete List)

| Method | Lines | Complexity | Dependencies | Critical Discoveries |
|--------|-------|------------|--------------|---------------------|
| `listVariables` | 108-375 | HIGH | getMostRecentlyStoppedThread, estimateVariableSize, memoryBudget | 02, 03, 05 |
| `setVariable` | 382-483 | MEDIUM | buildSafeAssignment, encodeValueForEvaluate, getMostRecentlyStoppedThread | 03 |
| `getVariableChildren` | 490-530 | LOW | withOperationLock | – |
| `streamVariables` | 536-546 | LOW | – | – |
| `estimateVariableSize` | 584-623 | LOW | – | 03 |
| `buildSafeAssignment` | 633-654 | LOW | encodeValueForEvaluate | – |
| `encodeValueForEvaluate` | 663-718 | LOW | – | – |

### Shared State to Extract

| Property | Lines | Purpose |
|----------|-------|---------|
| `evaluateFailures: Map<string, number>` | 77 | Throttle Object.is() cycle detection |
| `MAX_EVALUATE_FAILURES` | 78 | Constant: max failures before throttling |

### New Logic to Add in CDPCommonAdapter

| Logic | Purpose | Critical Discoveries |
|-------|---------|---------------------|
| SCOPE_TYPE_MAP constant | Map CDP scope types to { name, expensive, writable } | 02, 03 |
| mapScopeType() method | Lookup scope info, handle unknown types | 02 |

---

## Dependency Graph

```
listVariables
├─→ getMostRecentlyStoppedThread (Node-specific? - see node-specific-logic.md)
├─→ getStackFrames (BaseDebugAdapter)
├─→ getScopes (BaseDebugAdapter)
├─→ estimateVariableSize (extract to CDPCommon)
├─→ memoryBudget.addNode (BaseDebugAdapter)
├─→ session.customRequest('evaluate', ...) (BaseDebugAdapter)
└─→ session.customRequest('variables', ...) (BaseDebugAdapter)

setVariable
├─→ getMostRecentlyStoppedThread (Node-specific? - see node-specific-logic.md)
├─→ getStackFrames (BaseDebugAdapter)
├─→ buildSafeAssignment (extract to CDPCommon)
│   └─→ encodeValueForEvaluate (extract to CDPCommon)
├─→ evaluateExpression (BaseDebugAdapter)
└─→ session.customRequest('setVariable', ...) (BaseDebugAdapter)

getVariableChildren
├─→ withOperationLock (BaseDebugAdapter)
└─→ session.customRequest('variables', ...) (BaseDebugAdapter)

streamVariables
└─→ (no dependencies)

estimateVariableSize
└─→ (no dependencies - pure function)

buildSafeAssignment
└─→ encodeValueForEvaluate (extract to CDPCommon)

encodeValueForEvaluate
└─→ (no dependencies - pure function)
```

---

## Extraction Complexity Assessment

### LOW Complexity (Straightforward Copy)
- `getVariableChildren` - self-contained, no customization needed
- `streamVariables` - placeholder, no logic
- `estimateVariableSize` - pure function, no dependencies
- `encodeValueForEvaluate` - pure function, no dependencies
- `buildSafeAssignment` - simple validation, no state

### MEDIUM Complexity (Minor Refactoring)
- `setVariable` - needs scope writability check added
- Scope filtering logic - needs SCOPE_TYPE_MAP integration

### HIGH Complexity (Careful Extraction)
- `listVariables` - complex recursive logic, dual cycle detection, memory budgets
- Must preserve all logic exactly
- Critical for Phase 3 validation (no regressions)

---

## Critical Discovery Cross-Reference

### Discovery 02: Scope Type Differences
**Impact on Extraction**:
- Scope filtering must use SCOPE_TYPE_MAP instead of hardcoded scope names
- mapScopeType() method needed to handle unknown types gracefully
- Chrome has Block/With scopes, Node has Script/Module scopes

**Affected Extractions**:
- listVariables (scope filtering logic)
- SCOPE_TYPE_MAP constant (new)
- mapScopeType() method (new)

---

### Discovery 03: setVariable Restrictions
**Impact on Extraction**:
- setVariable must check scope writability before attempting modification
- SCOPE_TYPE_MAP must include writable flag
- Clear error message for read-only scopes

**Affected Extractions**:
- setVariable (add writability check)
- SCOPE_TYPE_MAP (add writable field)

---

### Discovery 04: Capabilities Identical
**Impact on Extraction**:
- Capabilities object can be shared constant in CDPCommonAdapter
- Both Node and Chrome use same capabilities

**Affected Extractions**:
- Capabilities object might move to CDPCommonAdapter (see node-specific-logic.md)

---

### Discovery 05: Dual Cycle Detection
**Impact on Extraction**:
- Must preserve both strategies in CDPCommonAdapter
- variablesReference Set tracking (fast, universal)
- Object.is() evaluation (accurate for JavaScript)
- Throttling mechanism must be preserved

**Affected Extractions**:
- listVariables (cycle detection logic)
- evaluateFailures Map
- MAX_EVALUATE_FAILURES constant

---

## Next Steps (Phase 1)

1. Create CDPCommonAdapter.ts skeleton extending BaseDebugAdapter
2. Extract methods in order of dependency (bottom-up):
   - encodeValueForEvaluate (no deps)
   - buildSafeAssignment (depends on encodeValueForEvaluate)
   - estimateVariableSize (no deps)
   - getVariableChildren (minimal deps)
   - streamVariables (no deps)
   - setVariable (depends on buildSafeAssignment)
   - listVariables (depends on estimateVariableSize)
3. Add new logic:
   - SCOPE_TYPE_MAP constant
   - mapScopeType() method
4. Add state:
   - evaluateFailures Map
   - MAX_EVALUATE_FAILURES constant
5. Verify TypeScript compilation after each method extraction

---

**Document Complete**: All extraction candidates identified with line ranges, dependencies, and complexity assessment.

**Ready for Phase 1**: Yes - extraction plan is comprehensive and actionable.
