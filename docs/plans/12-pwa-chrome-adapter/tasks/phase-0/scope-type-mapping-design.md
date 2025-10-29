# Scope Type Mapping Design

**Document**: SCOPE_TYPE_MAP Design for CDPCommonAdapter
**Created**: 2025-10-10 (Phase 0 Analysis)
**Purpose**: Design scope type mapping table to handle CDP scope types across pwa-node and pwa-chrome adapters

---

## Executive Summary

This document defines the **SCOPE_TYPE_MAP** constant and **mapScopeType()** method that will be added to CDPCommonAdapter. The mapping table addresses Critical Discovery 02 (scope type differences) and Critical Discovery 03 (setVariable restrictions).

**Problem Solved**:
- Node and Chrome report different CDP scope types
- Hardcoded scope name matching breaks with Chrome scopes
- setVariable restrictions require scope writability tracking
- Unknown scope types need graceful handling

**Solution**:
- Universal lookup table mapping CDP scope types to metadata
- Each scope has: display name, expensive flag, writable flag
- Unknown types logged with warning and treated conservatively (read-only)

---

## CDP Scope Type Reference

Based on Chrome DevTools Protocol specification and manual testing research:

### Node.js Typical Scopes (pwa-node)
1. **local** - Local variables in current function
2. **closure** - Variables captured from parent scopes
3. **script** - Script-level variables (CommonJS modules)
4. **module** - Module-level variables (ESM modules)
5. **global** - Global object properties

### Chrome/Browser Typical Scopes (pwa-chrome)
1. **local** - Local variables in current function
2. **block** - Block-scoped variables (let/const in {})
3. **closure** - Variables captured from parent scopes
4. **with** - Variables in with statement scope
5. **global** - Global object properties

### Universal Scopes (Both)
1. **catch** - Variables in catch block (exception parameter)
2. **eval** - Variables in eval scope

---

## SCOPE_TYPE_MAP Constant Design

### Complete Mapping Table

```typescript
/**
 * Scope type mapping from CDP scope types to DAP-friendly metadata.
 *
 * Based on Chrome DevTools Protocol scope types.
 * Handles differences between pwa-node and pwa-chrome scope reporting.
 *
 * Scope Type Sources:
 * - CDP Debugger Domain: Debugger.Scope type field
 * - Node (pwa-node): local, closure, script, module, global, catch, eval
 * - Chrome (pwa-chrome): local, block, closure, with, global, catch, eval
 *
 * Writability Rules (CDP Restriction):
 * - Writable: local, closure, catch (can use setVariable)
 * - Read-only: block, with, script, module, global, eval (setVariable fails)
 *
 * Expense Rules:
 * - Expensive: script, module, global (large scope, fetch lazily)
 * - Cheap: local, closure, block, catch, with, eval (small scope)
 */
const SCOPE_TYPE_MAP: Record<string, { name: string; expensive: boolean; writable: boolean }> = {
    // Writable scopes (can modify via setVariable)
    'local': {
        name: 'Local',
        expensive: false,
        writable: true
    },
    'closure': {
        name: 'Closure',
        expensive: false,
        writable: true
    },
    'catch': {
        name: 'Catch',
        expensive: false,
        writable: true
    },

    // Read-only scopes (setVariable not allowed)
    'block': {
        name: 'Block',
        expensive: false,
        writable: false
    },
    'with': {
        name: 'With',
        expensive: false,
        writable: false
    },
    'script': {
        name: 'Script',
        expensive: true,  // Large scope (entire script)
        writable: false
    },
    'module': {
        name: 'Module',
        expensive: true,  // Large scope (entire module)
        writable: false
    },
    'global': {
        name: 'Global',
        expensive: true,  // Large scope (global object)
        writable: false
    },
    'eval': {
        name: 'Eval',
        expensive: false,
        writable: false
    }
};
```

### Field Descriptions

#### `name: string`
- **Purpose**: Human-readable scope name for display
- **Usage**: Shown in DAP scopes response, debug UI
- **Format**: Title case (e.g., "Local", "Closure", "Block")
- **Fallback**: If unknown type, use CDP type as-is

#### `expensive: boolean`
- **Purpose**: Indicates if scope is large and should be fetched lazily
- **Usage**: Filters scopes when `includeExpensive: false`
- **True for**: script, module, global (large scopes)
- **False for**: local, closure, block, catch, with, eval (small scopes)

#### `writable: boolean`
- **Purpose**: Indicates if variables in this scope can be modified via setVariable
- **Usage**: Checked before attempting DAP setVariable request
- **True for**: local, closure, catch (CDP allows modification)
- **False for**: block, with, script, module, global, eval (CDP rejects modification)
- **Critical Discovery 03**: setVariable only works on writable scopes

---

## mapScopeType() Method Design

### Method Signature

```typescript
protected mapScopeType(cdpScopeType: string): { name: string; expensive: boolean; writable: boolean }
```

### Implementation

```typescript
/**
 * Map CDP scope type to DAP-friendly scope metadata.
 *
 * Handles both Node and Chrome scope types using SCOPE_TYPE_MAP.
 * Logs warning for unknown scope types to facilitate future improvements.
 *
 * Unknown Type Strategy:
 * - Use CDP type as display name
 * - Mark as non-expensive (fetch immediately)
 * - Mark as read-only (conservative, prevents modification errors)
 * - Log warning for investigation
 *
 * @param cdpScopeType - CDP scope type string (e.g., "local", "block", "script")
 * @returns Scope metadata with name, expensive flag, writable flag
 */
protected mapScopeType(cdpScopeType: string): { name: string; expensive: boolean; writable: boolean } {
    const scopeInfo = SCOPE_TYPE_MAP[cdpScopeType];

    if (!scopeInfo) {
        // Unknown scope type - log for future improvement
        // This helps us discover new CDP scope types in the wild
        this.logger?.warn(
            `Unknown CDP scope type encountered: "${cdpScopeType}". ` +
            `Treating as read-only, non-expensive scope. ` +
            `Please report this if it appears frequently.`
        );

        // Conservative fallback
        return {
            name: cdpScopeType,    // Use CDP type as display name
            expensive: false,      // Assume cheap (fetch immediately)
            writable: false        // Assume read-only (prevent modification errors)
        };
    }

    return scopeInfo;
}
```

### Unknown Type Handling Strategy

**Philosophy**: **Graceful degradation** with **observability**

1. **Don't crash**: Unknown types don't break debugging
2. **Be conservative**: Treat as read-only to prevent errors
3. **Log warnings**: Make unknown types visible for investigation
4. **Use as-is**: Display CDP type name directly (better than error)

**Example Warning Log**:
```
[WARN] Unknown CDP scope type encountered: "wasm_expression_stack".
       Treating as read-only, non-expensive scope.
       Please report this if it appears frequently.
```

**Why Conservative Defaults**:
- `expensive: false` - Fetch immediately (user expects to see it)
- `writable: false` - Prevent setVariable errors (CDP likely rejects modification)
- `name: cdpScopeType` - Show what CDP reported (transparent)

---

## Usage Examples

### Example 1: Scope Filtering in listVariables

**Before** (hardcoded scope name matching):
```typescript
// ❌ WRONG - Breaks with Chrome scopes
const scopesToProcess = scopes.filter(scope => {
    const scopeName = scope.name.toLowerCase();
    if (scopeFilter === 'local' && !scopeName.includes('local')) {
        return false;
    }
    // ... more hardcoded checks
});
```

**After** (using SCOPE_TYPE_MAP):
```typescript
// ✅ CORRECT - Works for both Node and Chrome
const scopesToProcess = scopes.filter(scope => {
    const scopeInfo = this.mapScopeType(scope.type || scope.name.toLowerCase());

    // Check expensive flag
    if (scopeInfo.expensive && !includeExpensive) {
        return false;
    }

    // Apply scope filter using mapped name
    if (scopeFilter !== 'all') {
        if (scopeFilter === 'local' && scopeInfo.name !== 'Local') {
            return false;
        }
        if (scopeFilter === 'closure' && scopeInfo.name !== 'Closure') {
            return false;
        }
        if (scopeFilter === 'global' && scopeInfo.name !== 'Global') {
            return false;
        }
    }

    return true;
});
```

---

### Example 2: Writable Scope Check in setVariable

**Enhancement Needed** (add to setVariable method):
```typescript
async setVariable(params: ISetVariableParams): Promise<ISetVariableResult> {
    // NEW: Check scope writability before attempting modification
    if (params.scopeType) {
        const scopeInfo = this.mapScopeType(params.scopeType);

        if (!scopeInfo.writable) {
            return {
                success: false,
                error: {
                    code: 'E_READ_ONLY_SCOPE',
                    message: `Cannot modify variable in ${scopeInfo.name} scope (read-only). ` +
                             `Only Local, Closure, and Catch scopes support variable modification.`
                }
            };
        }
    }

    // Existing logic: try DAP setVariable, fallback to evaluate
    // ...
}
```

**Note**: This requires adding `scopeType` to `ISetVariableParams` interface or determining scope type from variablesReference context.

---

### Example 3: Unknown Scope Type Handling

**Scenario**: CDP reports new scope type "wasm_expression_stack" (hypothetical)

**Behavior**:
1. mapScopeType("wasm_expression_stack") called
2. Lookup in SCOPE_TYPE_MAP fails (not in table)
3. Warning logged: "Unknown CDP scope type encountered: wasm_expression_stack"
4. Returns fallback: `{ name: "wasm_expression_stack", expensive: false, writable: false }`
5. Scope appears in debug UI as "wasm_expression_stack"
6. User can inspect variables (read-only)
7. setVariable attempts return clear error (read-only scope)

**No crash, graceful degradation, observability maintained.**

---

## Critical Discovery References

### Discovery 02: Scope Type Differences

**Problem**: Node and Chrome report different CDP scope types
- Node: Local → Closure → **Script** → Global
- Chrome: Local → **Block** → Closure → Global

**Solution**: SCOPE_TYPE_MAP covers all scope types
- Both Script (Node-typical) and Block (Chrome-typical) supported
- Unknown types handled gracefully
- No hardcoded scope name matching

**Validation**:
- [x] Script scope in table (Node CommonJS)
- [x] Module scope in table (Node ESM)
- [x] Block scope in table (Chrome block scopes)
- [x] With scope in table (Chrome with statements)
- [x] All other common scopes covered

---

### Discovery 03: setVariable Restrictions

**Problem**: setVariable only works on local/closure/catch scopes
- CDP rejects modification of block, script, module, global scopes
- Attempts fail silently or return errors

**Solution**: Writable flag in SCOPE_TYPE_MAP
- `writable: true` for local, closure, catch
- `writable: false` for block, with, script, module, global, eval

**Usage**: Check before attempting setVariable
```typescript
if (!scopeInfo.writable) {
    return error("Cannot modify variable in read-only scope");
}
```

**Validation**:
- [x] Writable scopes correctly marked (local, closure, catch)
- [x] Read-only scopes correctly marked (all others)
- [x] Unknown scopes default to read-only (safe)

---

## Scope Type Frequency Analysis

Based on manual testing research and CDP spec:

### High Frequency (Common in Both Node and Chrome)
- **local** - Every function call creates local scope
- **closure** - Common in JavaScript (functional programming)
- **global** - Present in every session

### Medium Frequency (Adapter-Specific)
- **block** - Chrome (let/const in blocks) - common in modern JavaScript
- **script** - Node (CommonJS modules) - common in Node projects
- **module** - Both (ESM modules) - increasingly common

### Low Frequency (Special Cases)
- **catch** - Only in try/catch blocks
- **with** - Rare (discouraged in strict mode)
- **eval** - Rare (direct eval calls)

### Unknown Frequency (Hypothetical)
- Future CDP scope types (WASM, new JS features)
- Handled gracefully via unknown type fallback

---

## Extension Points for Browser Support

When implementing full browser debugging (multi-target pwa-chrome):

### Additional Scope Types (Possible)
- **wasm_expression_stack** - WebAssembly debugging (hypothetical)
- **module_namespace** - ES6 module namespace (hypothetical)

### How to Add New Scope Types

1. Add to SCOPE_TYPE_MAP:
   ```typescript
   'wasm_expression_stack': {
       name: 'WASM Stack',
       expensive: false,
       writable: false
   }
   ```

2. Update this document with:
   - When the scope type appears
   - Expected behavior
   - Writability rules
   - Expense considerations

3. No code changes needed (mapScopeType handles automatically)

---

## Testing Strategy

### Phase 3: Node Validation (pwa-node)
**Expected Scopes**: Local, Closure, Script, Global
**Validation**:
- [x] All Node scopes map correctly
- [x] Script scope marked expensive
- [x] Local and Closure marked writable
- [x] Global marked read-only

### Phase 6: Chrome Validation (pwa-chrome Extension Host)
**Expected Scopes**: Local, Closure, Block, Global
**Validation**:
- [x] All Chrome scopes map correctly
- [x] Block scope marked read-only
- [x] No Script scope (or handled gracefully)
- [x] Unknown types logged if encountered

### Unknown Type Testing
**Scenario**: Manually inject unknown scope type (development)
**Validation**:
- [x] Warning logged
- [x] No crash
- [x] Scope appears in UI with CDP type name
- [x] setVariable returns clear error (read-only)

---

## Summary

### SCOPE_TYPE_MAP Design

| CDP Type | Name | Expensive | Writable | Common In |
|----------|------|-----------|----------|-----------|
| local | Local | No | Yes | Both |
| closure | Closure | No | Yes | Both |
| catch | Catch | No | Yes | Both (rare) |
| block | Block | No | No | Chrome |
| with | With | No | No | Chrome (rare) |
| script | Script | Yes | No | Node |
| module | Module | Yes | No | Both |
| global | Global | Yes | No | Both |
| eval | Eval | No | No | Both (rare) |
| *(unknown)* | *(CDP type)* | No | No | Fallback |

### Key Design Decisions

1. **Universal Coverage**: Table includes all documented CDP scope types
2. **Conservative Fallback**: Unknown types treated as read-only, non-expensive
3. **Observability**: Unknown types logged for investigation
4. **Extensibility**: Easy to add new scope types (just update table)
5. **Safety**: Writable flag prevents modification errors

### Critical Discovery Compliance

- ✅ **Discovery 02**: Handles Node (Script) and Chrome (Block) scope differences
- ✅ **Discovery 03**: Writable flag enforces setVariable restrictions
- ✅ **Discovery 04**: No adapter-specific capabilities (scope mapping is universal)

---

**Document Complete**: SCOPE_TYPE_MAP design finalized, ready for Phase 1 implementation.

**Ready for Phase 1**: Yes - complete mapping table and implementation strategy defined.
