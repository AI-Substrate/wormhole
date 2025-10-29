# Phase 3: Node.js Adapter - Manual Test Checklist

**Phase**: Phase 3: Node.js Adapter Implementation
**Date**: 2025-10-04
**Test Program**: `/Users/jak/github/vsc-bridge/scripts/test/test-node-adapter.js`

## Prerequisites

Before running tests:

- [ ] Phase 3 implementation complete (NodeDebugAdapter class created)
- [ ] AdapterFactory registered NodeDebugAdapter for 'pwa-node'
- [ ] Extension compiled successfully (`npm run build:extension`)
- [ ] VS Code Extension Development Host ready (F5)
- [ ] Test program available at scripts/test/test-node-adapter.js

## Test Setup

1. Open the test program in VS Code:
   ```bash
   code /Users/jak/github/vsc-bridge/scripts/test/test-node-adapter.js
   ```

2. Set breakpoint on line 116 (marked with `// BREAKPOINT HERE`)

3. Start Extension Development Host (F5)

4. In the Extension Development Host:
   - Open the test-node-adapter.js file
   - Run the debugger (F5)
   - Wait for breakpoint to be hit

## Manual Test Scenarios

### T-NJS-001: List variables with default depth (2)

**Test**: Verify depth limiting stops at specified depth

```bash
# In Extension Development Host debug console or via CLI:
vscb script run -f ../extension/src/vsc-scripts/debug/list-variables.js
```

**Expected Result**:
- [ ] Returns variable tree with scopes (local, closure, global)
- [ ] Variables expanded to depth 2
- [ ] Variables at depth 2 marked with `truncated: true, truncatedReason: 'maxDepth'`
- [ ] `deepNested.level1.level2` is visible
- [ ] `deepNested.level1.level2.level3` is NOT visible (truncated)

---

### T-NJS-002: List variables with maxDepth=5

**Test**: Verify deep traversal works correctly

```bash
vscb script run -f ../extension/src/vsc-scripts/debug/list-variables.js --param maxDepth=5
```

**Expected Result**:
- [ ] Variables expanded to depth 5
- [ ] `deepNested.level1.level2.level3.level4.level5` is visible
- [ ] Variables at depth 5 marked as truncated

---

### T-NJS-003: Circular reference detection

**Test**: Verify Object.is() detects cycles in JavaScript objects

**Expected Result**:
- [ ] `circular.self` detected as circular reference
- [ ] Marked with `cycle: true, cycleVia: 'Object.is'`
- [ ] Value changed to `[Circular Reference]`
- [ ] `originalValue` preserved
- [ ] No infinite loop or crash

**Verification**:
```javascript
// Look for:
{
  name: "circular",
  children: [
    { name: "self", cycle: true, cycleVia: "Object.is", value: "[Circular Reference]" },
    { name: "nested", children: [
      { name: "parent", cycle: true, cycleVia: "Object.is", value: "[Circular Reference]" }
    ]}
  ]
}
```

---

### T-NJS-004: Large array pagination

**Test**: Verify 100k array doesn't crash and uses pagination

```bash
vscb script run -f ../extension/src/vsc-scripts/debug/var-children.js --param variablesReference=<largeArray_ref> --param start=0 --param count=100
```

**Expected Result**:
- [ ] Returns first 100 items (0-99)
- [ ] No crash or timeout
- [ ] `childrenShown: 100`
- [ ] `totalChildren: 100000`
- [ ] Can request next page with `start=100, count=100`

---

### T-NJS-005: Memory budget enforcement

**Test**: Verify stops at 5MB/20k nodes

```bash
vscb script run -f ../extension/src/vsc-scripts/debug/list-variables.js --param maxDepth=10
```

**Expected Result**:
- [ ] Stops traversing when budget exceeded
- [ ] Returns partial data with truncation marker
- [ ] Includes suggestion: "Data exceeds limit. Consider using debug.save-variable"
- [ ] `truncatedReason: 'budget'`
- [ ] No crash or out-of-memory error

---

### T-NJS-006: Set simple variable

**Test**: Verify modification works via setVariable

```bash
vscb script run -f ../extension/src/vsc-scripts/debug/set-variable.js --param variablesReference=<modifiable_ref> --param name=counter --param value=999
```

**Expected Result**:
- [ ] Variable modified successfully
- [ ] Returns `success: true`
- [ ] New value: 999
- [ ] Verification shows updated value

**Verification**:
```bash
# List variables again to see updated value
vscb script run -f ../extension/src/vsc-scripts/debug/list-variables.js --param scopeFilter=local
```

---

### T-NJS-007: Set object property via evaluate

**Test**: Verify obj.prop = value works via evaluate fallback

```bash
vscb script run -f ../extension/src/vsc-scripts/debug/set-variable.js --param expression="modifiable.name = 'MODIFIED'" --param frameId=0
```

**Expected Result**:
- [ ] Property modified via evaluate
- [ ] Returns `success: true`
- [ ] New value: "MODIFIED"
- [ ] Works even if setVariable not supported for that path

---

### T-NJS-008: Get variable children with pagination

**Test**: Verify start/count params work correctly

```bash
# Get first 50 properties of manyProps
vscb script run -f ../extension/src/vsc-scripts/debug/var-children.js --param variablesReference=<manyProps_ref> --param start=0 --param count=50

# Get next 50 properties
vscb script run -f ../extension/src/vsc-scripts/debug/var-children.js --param variablesReference=<manyProps_ref> --param start=50 --param count=50
```

**Expected Result**:
- [ ] First request returns properties 0-49
- [ ] Second request returns properties 50-99
- [ ] No overlap between results
- [ ] Can paginate through all 200 properties

---

### T-NJS-009: Stream suggestion at threshold

**Test**: Verify helpful message returned when budget exceeded

**Expected Result**:
- [ ] When listing variables on large data, returns suggestion
- [ ] Suggestion includes: `mode: 'stream-to-file'`
- [ ] Suggestion includes: `command: 'debug.save-variable'`
- [ ] Reason: 'budget-exceeded' or 'budget-warning'
- [ ] Includes recommended page size
- [ ] Provides helpful instructions

---

## Comparison with Dynamic Scripts

### T-NJS-010: Feature parity validation

**Test**: Compare behavior with original dynamic scripts

```bash
# Dynamic script (original)
vscb script run -f ../scripts/sample/dynamic/list-variables.js --param maxDepth=3

# NodeDebugAdapter (new)
vscb script run -f ../extension/src/vsc-scripts/debug/list-variables.js --param maxDepth=3
```

**Expected Result**:
- [ ] Variable tree structure matches
- [ ] Cycle detection works identically
- [ ] Depth limiting behaves the same
- [ ] Memory budget triggers at same thresholds
- [ ] Error messages consistent

---

## Error Handling Tests

### E-001: No active session

**Test**: Call adapter when no debug session active

**Expected Result**:
- [ ] Returns `E_NO_SESSION` error
- [ ] Message: "No active debug session"
- [ ] Hint: "Start debugging with F5"

---

### E-002: Debugger not paused

**Test**: Call adapter when running (not paused)

**Expected Result**:
- [ ] Returns `E_NOT_PAUSED` error
- [ ] Message: "Debugger not paused at breakpoint"
- [ ] Hint: "Set a breakpoint and wait for execution to stop"

---

### E-003: Invalid reference

**Test**: Request children for reference 0

**Expected Result**:
- [ ] Returns `E_INVALID_REFERENCE` error
- [ ] Appropriate error message

---

## Performance Tests

### P-001: Large array doesn't freeze

**Test**: List variables with 100k array

**Expected Result**:
- [ ] Completes within 5 seconds
- [ ] Extension host remains responsive
- [ ] No timeout errors

---

### P-002: Deep nesting doesn't cause stack overflow

**Test**: Create object nested 100 levels deep

**Expected Result**:
- [ ] Depth limiting prevents stack overflow
- [ ] Traversal stops at maxDepth
- [ ] No crash

---

### Code Review Test Cases

### CR-001: Safe expression builder tests

**Test**: Set variables to special values

```bash
# Set variable to NaN
vscb script run -f ../extension/src/vsc-scripts/debug/set-variable.js --param name=modifiable.counter --param value=NaN

# Set variable to Infinity
vscb script run -f ../extension/src/vsc-scripts/debug/set-variable.js --param name=modifiable.counter --param value=Infinity

# Set variable to BigInt
vscb script run -f ../extension/src/vsc-scripts/debug/set-variable.js --param name=bigIntValues.small --param value=999n

# Set variable to quoted string
vscb script run -f ../extension/src/vsc-scripts/debug/set-variable.js --param name=modifiable.name --param value='"injected"'
```

**Expected Result**:
- [ ] NaN sets correctly (not string "NaN")
- [ ] Infinity sets correctly
- [ ] BigInt sets correctly with 'n' suffix
- [ ] Strings are properly quoted and escaped
- [ ] No code injection possible

---

### CR-002: Throwing getters and side effects

**Test**: List variables with objects containing throwing getters

```bash
vscb script run -f ../extension/src/vsc-scripts/debug/list-variables.js --param maxDepth=3
```

**Expected Result**:
- [ ] throwingGetters.normalProp is visible
- [ ] throwingGetters.dangerousGetter doesn't crash traversal
- [ ] Object.is() evaluate failures are throttled after 2 attempts
- [ ] Fallback to variablesReference tracking works
- [ ] No observable side effects from sideEffectGetter

---

### CR-003: Large Map/Set handling

**Test**: List variables and get children for large Map and Set

```bash
# List variables
vscb script run -f ../extension/src/vsc-scripts/debug/list-variables.js --param maxDepth=2

# Paginate through Map entries
vscb script run -f ../extension/src/vsc-scripts/debug/var-children.js --param variablesReference=<largeMap_ref> --param start=0 --param count=100 --param filter=named

# Paginate through Set entries
vscb script run -f ../extension/src/vsc-scripts/debug/var-children.js --param variablesReference=<largeSet_ref> --param start=0 --param count=100
```

**Expected Result**:
- [ ] Map shows 1000 entries
- [ ] Set shows 1000 items
- [ ] Pagination works with 'named' filter for Map
- [ ] Memory estimation accounts for Map/Set overhead
- [ ] No performance degradation

---

### CR-004: TypedArray and Buffer handling

**Test**: List variables with TypedArrays and Buffers

```bash
vscb script run -f ../extension/src/vsc-scripts/debug/list-variables.js --param maxDepth=2
```

**Expected Result**:
- [ ] Uint8Array shows correct length (100)
- [ ] Int32Array shows correct length (50)
- [ ] Float64Array shows correct length (25)
- [ ] Buffer shows correct byte length (256)
- [ ] Memory estimation uses actual byte sizes
- [ ] Indexed pagination works for TypedArrays

---

## Test Summary

| Test ID | Description | Status | Notes |
|---------|-------------|--------|-------|
| T-NJS-001 | Default depth (2) | [ ] | |
| T-NJS-002 | Deep traversal (5) | [ ] | |
| T-NJS-003 | Cycle detection | [ ] | |
| T-NJS-004 | Large array pagination | [ ] | |
| T-NJS-005 | Memory budget | [ ] | |
| T-NJS-006 | Set simple variable | [ ] | |
| T-NJS-007 | Set via evaluate | [ ] | |
| T-NJS-008 | Pagination | [ ] | |
| T-NJS-009 | Stream suggestion | [ ] | |
| T-NJS-010 | Feature parity | [ ] | |
| E-001 | No session error | [ ] | |
| E-002 | Not paused error | [ ] | |
| E-003 | Invalid ref error | [ ] | |
| P-001 | Large array perf | [ ] | |
| P-002 | Deep nesting perf | [ ] | |
| **CR-001** | **Safe expression builder** | [ ] | **Code review fix** |
| **CR-002** | **Throwing getters** | [ ] | **Code review fix** |
| **CR-003** | **Large Map/Set** | [ ] | **Code review fix** |
| **CR-004** | **TypedArray/Buffer** | [ ] | **Code review fix** |

---

## Test Execution Log

**Date**: _______________
**Tester**: _______________
**Extension Version**: _______________

### Issues Found

1. _______________________________________________________________
   - Severity: [ ] Critical [ ] Major [ ] Minor
   - Resolution: __________________________________________________

2. _______________________________________________________________
   - Severity: [ ] Critical [ ] Major [ ] Minor
   - Resolution: __________________________________________________

### Sign-off

- [ ] All critical tests passed
- [ ] All error handling tests passed
- [ ] Performance acceptable
- [ ] Feature parity confirmed
- [ ] Ready for Phase 4

**Approved by**: _______________ **Date**: _______________
