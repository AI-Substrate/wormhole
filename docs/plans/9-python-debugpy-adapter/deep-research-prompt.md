# Deep Research Prompt: Python debugpy Debug Adapter Implementation

## 1. Clear Problem Definition

**Challenge**: Implement a Python debug adapter (debugpy) for VSC-Bridge's runtime inspection system to achieve feature parity with existing JavaScript (pwa-node) and C# (coreclr) adapters.

**Current State**:
- ✅ JavaScript adapter (NodeDebugAdapter) - 720 lines, fully functional
- ✅ C# adapter (CoreClrDebugAdapter) - 538 lines, fully functional
- ❌ Python adapter (DebugpyAdapter) - Not implemented, returns "Debug adapter 'debugpy' is not currently supported"

**Required Capabilities** (must match JS/C# parity):
1. Variable listing with depth control and scope filtering (local/global/closure)
2. Variable modification (both DAP setVariable and evaluate fallback)
3. Paginated access to large collections (start/count parameters)
4. Circular reference detection preventing infinite loops
5. Memory budget enforcement (5MB / 20,000 nodes)
6. Clear error messages with actionable guidance

**Problematic Behavior When Missing**:
```bash
$ vscb script run debug.list-variables --param scope=local
Error: Debug adapter 'debugpy' is not currently supported
```

**Expected Behavior**:
```bash
$ vscb script run debug.list-variables --param scope=local
{
  "success": true,
  "variables": [
    {"name": "result", "value": "2", "type": "int", "variablesReference": 0},
    {"name": "a", "value": "5", "type": "int", "variablesReference": 0},
    {"name": "b", "value": "3", "type": "int", "variablesReference": 0}
  ]
}
```

## 2. Contextual Information

### Technology Stack

**Core Framework**:
- VS Code Extension API (`vscode` module, latest stable)
- Debug Adapter Protocol (DAP) via `vscode.debug` namespace
- TypeScript 5.x (strict mode enabled)
- Node.js runtime within VS Code Extension Host

**Python Debugger**:
- debugpy (Microsoft's official Python debug adapter)
- Typically bundled with Python VS Code extension
- DAP-compliant implementation
- Session type identifier: `'debugpy'`

**Existing Architecture**:
```
RuntimeInspectionService
  ↓
AdapterFactory
  ↓ createAdapter(session: vscode.DebugSession)
  ↓
IDebugAdapter (interface)
  ↓ extends
BaseDebugAdapter (abstract class)
  ↓ concrete implementations
[NodeDebugAdapter, CoreClrDebugAdapter, DebugpyAdapter (TBD)]
```

**Key Dependencies**:
```json
{
  "@types/vscode": "^1.85.0",
  "typescript": "^5.3.0"
}
```

### Recent Codebase Context

**Just Completed** (Last session, 2025-10-06):
- ✅ CoreClrDebugAdapter implementation and validation
- ✅ Manual test suite updated for all 3 languages
- ✅ Discovered C#-specific patterns:
  - Thread detection: Must iterate all threads to find active one (not threads[0])
  - NO Object.is() support (C# doesn't have it)
  - Conservative property evaluation due to side effects
  - Preserves vsdbg-specific features (presentationHint, memoryReference)

**Existing Adapters** (Templates to Learn From):

1. **NodeDebugAdapter** (`extension/src/core/runtime-inspection/adapters/node-adapter.ts`):
   - Uses Object.is() for JavaScript cycle detection (via evaluate)
   - Simple thread detection (first stopped thread)
   - Dual setVariable strategy (DAP + evaluate fallback)
   - Pagination support for arrays/objects
   - Memory budget tracking

2. **CoreClrDebugAdapter** (`extension/src/core/runtime-inspection/adapters/coreclr-adapter.ts`):
   - NO Object.is() (simpler variablesReference-only cycle detection)
   - Complex thread detection (iterates all threads)
   - Conservative property evaluation (respects expensive flag)
   - Preserves debug-specific metadata without parsing
   - Same dual setVariable strategy

3. **BaseDebugAdapter** (`extension/src/core/runtime-inspection/adapters/BaseDebugAdapter.ts`):
   - Provides common DAP operations
   - Memory budget management (MemoryBudget class)
   - Operation locking (prevents concurrent access)
   - Cache invalidation on debug state changes
   - Lifecycle management (disposables, abort signals)

### File Locations
```
/Users/jordanknight/github/vsc-bridge/
├── extension/src/core/runtime-inspection/
│   ├── adapters/
│   │   ├── BaseDebugAdapter.ts         (base class)
│   │   ├── node-adapter.ts             (720 lines, JS template)
│   │   ├── coreclr-adapter.ts          (538 lines, C# template)
│   │   └── debugpy-adapter.ts          (TO BE CREATED)
│   ├── interfaces.ts                   (IDebugAdapter interface)
│   ├── AdapterFactory.ts               (registration point)
│   └── RuntimeInspectionService.ts     (service layer)
├── test/python/test_example.py         (pytest test file)
└── docs/manual-test/debug-single.md    (manual test procedure)
```

## 3. Key Research Questions

### Architecture & Design Patterns

**Q1: Thread Management in debugpy**
- How does debugpy handle thread pausing when a breakpoint is hit?
- Does it pause all threads (like C# coreclr) or just the thread that hit the breakpoint (like Node)?
- What is the idiomatic VS Code SDK approach for finding the correct thread to inspect?
- Should we use `vscode.debug.activeStackItem` or manually query threads?

**Q2: Cycle Detection Strategy for Python**
- Can we use Python's `id()` function via DAP evaluate for identity checking (analogous to JavaScript's Object.is())?
- Example: `id(obj1) == id(obj2)` to detect if two variable references point to same object
- Is evaluate with `context: 'hover'` side-effect free in debugpy like it is in pwa-node?
- Alternative: Should we use simpler variablesReference-only detection like C# adapter?
- What are the trade-offs between accuracy and simplicity?

**Q3: Property/Descriptor Evaluation Safety**
- Do Python properties (via `@property` decorator) have evaluation side effects?
- Do descriptors, `__getattr__`, `__getattribute__` pose risks during inspection?
- Does debugpy mark "expensive" scopes like vsdbg (C# debugger)?
- Should we implement conservative evaluation like C# adapter or aggressive like Node adapter?

**Q4: debugpy-Specific Features**
- What Python-specific fields does debugpy include in variable responses?
- Are there equivalents to vsdbg's `presentationHint` or `memoryReference`?
- Should we preserve unknown/Python-specific fields for forward compatibility?
- How does debugpy represent Python types (e.g., `<class 'int'>` vs `int` vs `<type 'int'>`)?

### DAP Protocol Interactions

**Q5: Variable References and Scopes**
- How does debugpy structure scope responses (local, global, builtins)?
- Are there Python-specific scopes we should filter/handle specially?
- How are function closures represented in debugpy's scope hierarchy?

**Q6: Collection Pagination**
- Does debugpy support DAP's `start` and `count` parameters for paginating large lists/dicts/sets?
- How are dictionary keys vs values represented in variables responses?
- Are there limits on collection size before debugpy auto-truncates?

**Q7: Variable Modification Strategies**
- Does debugpy's setVariable DAP request work reliably for all variable types?
- When should we fall back to evaluate-based assignment (dual strategy)?
- What expression syntax is safe for evaluate in Python context?
- Example: Should we use `name = value` or more defensive approaches?

### Edge Cases & Python-Specific Concerns

**Q8: Python Type System Edge Cases**
- How should we handle `None` vs empty collections vs undefined?
- Should we expand special attributes like `__dict__`, `__class__`, `__bases__`?
- How to represent generators, coroutines, async objects that can't be inspected without consuming?
- Should we filter dunder methods (`__*__`) from variable listings?

**Q9: Memory Budget Considerations**
- How should we estimate memory size of Python objects?
- Are there Python-specific memory concerns (e.g., large NumPy arrays, pandas DataFrames)?
- Should we detect and warn about memory-intensive types?

**Q10: Error Message Patterns**
- What error types does debugpy return for common failures?
- Should we use Python terminology (list, dict, set) vs generic terms (array, map)?
- Are there debugpy-specific error codes we should handle?

## 4. Recommended Tools and Resources

### VS Code SDK Resources

**Primary Documentation**:
- VS Code Debug API: https://code.visualstudio.com/api/extension-guides/debugger-extension
- DAP Specification: https://microsoft.github.io/debug-adapter-protocol/
- Python Debugging in VS Code: https://code.visualstudio.com/docs/python/debugging

**Specific SDK Methods to Research**:
```typescript
// Thread management
vscode.debug.activeStackItem
session.customRequest('threads')
session.customRequest('stackTrace', {threadId, startFrame, levels})

// Variable inspection
session.customRequest('scopes', {frameId})
session.customRequest('variables', {variablesReference, start?, count?})

// Variable modification
session.customRequest('setVariable', {variablesReference, name, value})
session.customRequest('evaluate', {expression, frameId, context})

// State tracking
vscode.debug.onDidChangeActiveStackItem
vscode.debug.onDidTerminateDebugSession
```

### debugpy-Specific Research

**debugpy GitHub Repository**:
- Source: https://github.com/microsoft/debugpy
- Focus on: DAP message handling, variable representation, Python type mapping

**Key Questions for debugpy Behavior**:
1. How does debugpy implement `variables` request response structure?
2. Does debugpy support all optional DAP features (indexed/named variable filtering)?
3. What are debugpy's performance characteristics with large data structures?

### Comparative Analysis Targets

**Request Comparative Research**:
- Compare DAP response format across pwa-node, coreclr/vsdbg, and debugpy
- Identify common patterns and language-specific deviations
- Document any debugpy quirks or non-standard behaviors

## 5. Practical Examples

### Example 1: Adapter Class Structure
**Request**: Show idiomatic TypeScript structure for DebugpyAdapter class extending BaseDebugAdapter

**Should Include**:
```typescript
export class DebugpyAdapter extends BaseDebugAdapter {
    constructor(session: vscode.DebugSession) {
        const capabilities: IDebugCapabilities = {
            supportsSetVariable: ???,  // Does debugpy support this?
            supportsVariablePaging: ???, // start/count params?
            // ... other capabilities
        };
        super(session, capabilities);
    }

    async listVariables(params: IListVariablesParams): Promise<IVariableData[] | IDebugError> {
        // PYTHON-SPECIFIC: How to get correct thread?
        // PYTHON-SPECIFIC: How to detect cycles?
        // PYTHON-SPECIFIC: How to handle expensive properties?
    }

    // ... other methods
}
```

### Example 2: Thread Detection Pattern
**Request**: Show VS Code SDK best practice for getting active thread in Python debug session

**Compare**:
- Node's simple approach (first stopped thread)
- C#'s complex approach (iterate all, find one with source code)
- What's appropriate for Python/debugpy?

### Example 3: Cycle Detection Implementation
**Request**: Show working example of Python identity checking via evaluate

**Desired Pattern** (if viable):
```typescript
// Can we do this in Python like we do in JavaScript?
const expr = `id(${variable.evaluateName}) == id(${ancestor.evaluateName})`;
const evalResponse = await this.session.customRequest('evaluate', {
    expression: expr,
    frameId: frameId,
    context: 'hover'  // Side-effect free?
});

if (evalResponse.result === 'True') {  // Note: Python's 'True' not 'true'
    // Circular reference detected
}
```

**Alternative** (if evaluate unsafe):
```typescript
// Simpler C#-style approach
if (visited.has(variable.variablesReference)) {
    // Circular reference detected
}
```

### Example 4: Type Information Handling
**Request**: Show how to parse/normalize debugpy's type representation

**Examples of debugpy type strings** (need to verify):
- `<class 'int'>` ?
- `int` ?
- `<type 'list'>` ?
- `list[int]` ?

**Should we normalize these?**

### Example 5: Large Collection Pagination
**Request**: Show working DAP variables request with pagination for Python list

```typescript
const response = await this.session.customRequest('variables', {
    variablesReference: listRef,
    start: 0,
    count: 50,
    filter: 'indexed'  // Does debugpy support this filter?
});
```

### Example 6: Variable Modification with Evaluate Fallback
**Request**: Show safe expression building for Python evaluate

```typescript
// Given: name='result', value='42'
// Build safe assignment expression for Python

// Is this safe in Python?
const expression = `${name} = ${value}`;

// Or do we need defensive quoting/escaping?
const safeExpression = this.buildPythonAssignment(name, value);
```

## 6. Pitfalls and Mitigation

### Common Mistakes to Avoid

**Pitfall 1: Assuming JavaScript Patterns Work in Python**
- JavaScript's Object.is() doesn't exist in Python
- Python has different truthiness rules (empty list is falsy, etc.)
- Ask: What JavaScript idioms break when translated to Python debugging?

**Pitfall 2: Ignoring Python's Dynamic Features**
- Properties can have side effects (`@property` decorator)
- `__getattr__` can execute arbitrary code
- Descriptors can mask actual values
- Ask: How to safely inspect without triggering side effects?

**Pitfall 3: Thread State Assumptions**
- Different debuggers handle threading differently
- May have GIL-related considerations in Python
- Ask: What thread state management patterns are safe across all debuggers?

**Pitfall 4: Type System Mismatches**
- Python's type hints vs runtime types
- None vs empty vs undefined semantics
- Ask: How to consistently represent Python types in our IVariableData interface?

**Pitfall 5: Memory Budget Miscalculations**
- Python objects have different memory overhead than JS/C#
- Large libraries (NumPy, pandas) have special memory considerations
- Ask: How to accurately estimate Python object sizes?

**Pitfall 6: Evaluate Context Misuse**
- Using wrong context (repl vs watch vs hover)
- Side effects in evaluate expressions
- Ask: What evaluate contexts are safe for each operation?

### Best Practices to Follow

**BP1: Progressive Enhancement**
- Start with simplest implementation (like C# adapter: no Object.is())
- Add sophisticated features only if needed
- Ask: What's the minimal viable implementation for Python?

**BP2: Conservative Property Inspection**
- Default to NOT evaluating expensive properties
- Provide explicit flag to enable
- Ask: How does debugpy signal expensive operations?

**BP3: Preserve Unknown Metadata**
- Don't parse/modify fields we don't understand
- Forward compatibility with debugpy updates
- Ask: What fields should we pass through unchanged?

**BP4: Fail Fast with Clear Errors**
- Detect unsupported operations early
- Provide actionable error messages
- Ask: What are common debugpy failure modes?

**BP5: Test with Diverse Python Code**
- Test with standard library types
- Test with popular libraries (pytest, numpy, pandas)
- Test with async/await, generators, decorators
- Ask: What Python code patterns stress-test the adapter?

## 7. Integration Considerations

### Existing System Constraints

**Must Maintain**:
1. Interface compatibility: Implement IDebugAdapter exactly
2. Error taxonomy: Use existing DebugErrorCode enum
3. Memory budget: Enforce 5MB / 20k node limits
4. Response time: Complete operations within 5 seconds
5. BaseDebugAdapter usage: Extend base class, use its utilities

### Testing Requirements

**Manual Test Suite Integration**:
- File: `docs/manual-test/debug-single.md`
- Currently has Python section that fails (line 29, test_simple_subtraction)
- Must validate: Session starts, pauses, list-variables works, get-variable works

**Test Environment**:
- Python 3.x with pytest installed
- Python VS Code extension active
- Test file: `test/python/test_example.py`
- Launch config: `.vscode/launch.json` (needs Python debug config)

### Registration and Discovery

**AdapterFactory Registration**:
```typescript
// In AdapterFactory.ts constructor
this.registerAdapter('debugpy', DebugpyAdapter);
```

**Error Message Updates**:
```typescript
// In debug-errors.ts
const SUPPORTED_DEBUGGERS = [
    'pwa-node',    // JavaScript/TypeScript
    'coreclr',     // C# .NET
    'debugpy',     // Python (NEW)
    // ...
];
```

### Build and Deployment

**Build Process**:
```bash
just build  # Compiles TypeScript, runs type checks
```

**No Breaking Changes**:
- Adding DebugpyAdapter should not affect existing adapters
- Factory pattern ensures isolation
- Test: JavaScript and C# debugging still works after adding Python support

### Performance Considerations

**Expected Performance** (based on manual testing):
- Python debug session startup: ~1-2 seconds (faster than C#'s 2-4 seconds)
- Variable listing: < 100ms for typical scopes
- Large collections: Should use pagination, not load all at once

**Ask**: Are there Python-specific performance gotchas in DAP interactions?

## 8. Success Criteria

### Definition of Done

✅ DebugpyAdapter class created and registered
✅ All IDebugAdapter methods implemented
✅ Manual test suite passes for Python section
✅ No regressions in JavaScript or C# debugging
✅ TypeScript compilation succeeds with no errors
✅ Memory budget enforcement works for Python data
✅ Circular reference detection prevents hangs
✅ Error messages are clear and Python-specific

### Validation Commands

```bash
# Build succeeds
just build

# Manual test (in Extension Host)
vscb script run tests.debug-single --param path=<PROJECT_ROOT>/test/python/test_example.py --param line=29

# Variable listing works
vscb script run debug.list-variables --param scope=local

# Get variable works (after obtaining variablesReference)
vscb script run debug.get-variable --param variablesReference=1001

# Set variable works
vscb script run debug.set-variable --param name=result --param value=42
```

## 9. Specific Deep Research Requests

### Request 1: debugpy Behavioral Analysis
**Task**: Analyze debugpy's actual DAP behavior through documentation and source code review

**Deliverables**:
1. Thread management: Single vs multiple thread pausing
2. Scope structure: What scopes does debugpy expose?
3. Type formatting: How are Python types represented?
4. Pagination support: Does debugpy support start/count?
5. Feature matrix: Compare debugpy vs pwa-node vs coreclr capabilities

### Request 2: VS Code Debug API Patterns
**Task**: Identify idiomatic VS Code SDK patterns for multi-language debug adapters

**Deliverables**:
1. Best practices for adapter factory pattern
2. Thread detection strategies (with examples)
3. Cache invalidation patterns (when to clear variable references)
4. Error handling patterns (how to surface debugger errors to users)

### Request 3: Python-Specific Debugging Concerns
**Task**: Research Python debugging edge cases and safe inspection strategies

**Deliverables**:
1. Property evaluation safety (side effects, performance)
2. Identity checking mechanisms (id() function viability)
3. Special attribute handling (__dict__, __class__, etc.)
4. Type system considerations (None, dynamic typing, type hints)
5. Memory estimation strategies for Python objects

### Request 4: Implementation Roadmap
**Task**: Propose step-by-step implementation plan based on findings

**Deliverables**:
1. Recommended template (Node vs CoreCLR vs hybrid)
2. Critical decisions with rationale (thread detection, cycle detection)
3. Implementation phases (manual testing → dynamic script → bake-in)
4. Test scenarios covering Python edge cases
5. Potential gotchas and mitigation strategies

---

## Additional Context

**Time Constraint**: This is part of a larger plan to achieve 3-language debugging parity. JavaScript and C# are done; Python is the final piece.

**Quality Bar**: Must match existing adapter quality (comprehensive error handling, memory safety, clear documentation).

**User Impact**: Python developers currently see "not supported" error - this blocks AI-assisted debugging for Python code.

**Success Pattern**: Follow same workflow that succeeded for C# adapter:
1. Manual testing → 2. Dynamic script prototyping → 3. Bake into extension → 4. Validate with test suite
