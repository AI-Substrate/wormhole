# Python Debug Adapter Support (debugpy)

## Summary

Enable Python developers to inspect, explore, and modify variables during debug sessions through VSC-Bridge's debug scripts and MCP server, achieving feature parity with existing JavaScript (pwa-node) and C# (coreclr) debugging support.

**Current State**: Python debug sessions fail with "Debug adapter 'debugpy' is not currently supported" when attempting variable inspection operations.

**Desired State**: Python developers can use `debug.list-variables`, `debug.get-variable`, and `debug.set-variable` scripts seamlessly during pytest/unittest debug sessions, with the same capabilities available to JavaScript and C# developers.

**User Value**:
- **Consistency**: All supported languages have equal debugging capabilities
- **AI-Assisted Debugging**: MCP server can provide intelligent debugging assistance for Python code
- **Developer Productivity**: Python developers can inspect complex data structures, modify variables during debugging, and explore nested objects without switching tools

## Goals

- Python debug sessions support variable listing with depth control and scope filtering (local, global, closure)
- Python debug sessions support variable modification (both simple values and complex expressions)
- Python debug sessions support paginated access to large collections (lists, dicts, sets)
- Circular reference detection prevents infinite loops when exploring Python objects with cycles
- Memory budget enforcement (5MB/20k nodes) prevents crashes from large data structures
- Clear, actionable error messages guide users when operations fail
- Manual test suite validates Python debugging end-to-end alongside JavaScript and C#

## Non-Goals

- **Not implementing Python-specific debugging features** beyond standard variable inspection (e.g., no Python-specific breakpoint types, no IPython integration)
- **Not supporting alternative Python debuggers** (e.g., pdb, ipdb) - only debugpy (VS Code's standard Python debugger)
- **Not improving Python test discovery or execution** - this is purely about variable inspection during active debug sessions
- **Not adding new variable inspection capabilities** - goal is parity, not enhancement
- **Not modifying debugpy itself** - work entirely within VSC-Bridge adapter layer
- **Not supporting Python 2.x** - focus on Python 3.x where debugpy is standard
- **Not adding Python enhancements** - No special dunder method browsing, type hint display, or Python-specific features beyond what JS/C# adapters provide; Python-specific handling (property detection, generator/coroutine safety) is only for correctness and safety, not enhancement

## Acceptance Criteria

### AC1: Variable Listing Works in Python Debug Sessions
**Given** a Python debug session paused at a breakpoint in test/python/test_example.py
**When** user runs `vscb script run debug.list-variables --param scope=local`
**Then** system returns all local variables with:
- Variable names, values, and Python types
- Nested structure for objects and collections
- Proper handling of None, primitives, and complex objects
- No "adapter not supported" error

### AC2: Large Collection Pagination Works
**Given** a Python debug session with a variable referencing a large list (100+ elements)
**When** user runs `vscb script run debug.get-variable --param variablesReference=<ref> --param start=0 --param count=50`
**Then** system returns exactly 50 elements from the specified offset
**And** additional requests can retrieve subsequent pages without memory exhaustion

### AC3: Variable Modification Works
**Given** a Python debug session paused with a local variable `result = 2`
**When** user runs `vscb script run debug.set-variable --param name=result --param value=42`
**Then** the variable is modified in the debug session
**And** subsequent evaluation of `result` shows value `42`
**And** system handles both DAP setVariable and evaluate fallback strategies

### AC4: Circular References Are Detected
**Given** a Python debug session with an object containing circular references:
```python
obj = {"self": None}
obj["self"] = obj  # Circular reference
```
**When** user runs `debug.list-variables` with maxDepth=3
**Then** system detects the cycle and marks it as `[Circular Reference]`
**And** system does not hang, timeout, or consume excessive memory
**And** user can still see non-circular parts of the object

### AC5: Memory Budget Is Enforced
**Given** a Python debug session with a very large data structure (e.g., 10MB nested dict)
**When** user runs `debug.list-variables`
**Then** system stops expanding when 5MB or 20,000 nodes is reached
**And** system returns partial data with clear message: "Large data detected. Use debug.save-variable to stream to file"
**And** system does not crash or hang

### AC6: Manual Test Suite Passes for Python
**Given** the manual test procedure in docs/manual-test/debug-single.md
**When** executing the Python test section (currently at line 29, test_simple_subtraction)
**Then** all steps pass:
1. Debug session starts and pauses at specified line
2. list-variables returns local variables (result, a, b)
3. Variables display with correct Python types and values
4. No "adapter not supported" errors occur

### AC7: Error Messages Are Clear and Actionable
**Given** various error conditions (no active session, invalid reference, evaluation failure)
**When** user attempts variable operations
**Then** error messages are specific, not generic
**And** messages suggest corrective action (e.g., "Debug session not active. Start debugging first.")
**And** error codes align with existing E_* error taxonomy

## Testing Strategy

**Approach**: Manual Only

**Rationale**: Following the proven pattern from CoreCLR adapter implementation, this feature will be validated entirely through manual testing using the existing test procedure in `docs/manual-test/debug-single.md`. This approach:
- Leverages the established manual test suite that already covers Python
- Follows the successful workflow used for JavaScript and C# adapters
- Allows rapid iteration and real-time validation with actual debugpy sessions
- Focuses effort on implementation rather than test infrastructure

**Testing Workflow**:
1. **Phase 1 Discovery**: Manual testing with Extension Host to understand debugpy behavior
2. **Phase 2 Prototyping**: Dynamic script testing for rapid iteration without rebuilds
3. **Phase 3 Implementation**: Bake adapter into extension
4. **Phase 4 Validation**: Execute full manual test suite (debug-single.md Python section)

**Manual Test Coverage**:
- Variable listing with scope filtering (AC1, AC6)
- Pagination for large collections (AC2)
- Variable modification (AC3)
- Circular reference detection (AC4)
- Memory budget enforcement (AC5)
- Error message clarity (AC7)
- Python-specific features (properties, special types, edge cases)

**Success Criteria**: All steps in `docs/manual-test/debug-single.md` Python section pass without "adapter not supported" errors.

**Mock Usage**: N/A (manual testing only)

## Risks & Assumptions

### Risks

1. **Unknown debugpy DAP Behavior**
   - **Risk**: debugpy may implement DAP differently than pwa-node or coreclr, requiring significant custom code paths
   - **Mitigation**: Phase 1 manual testing discovers actual behavior before implementation

2. **Python's Dynamic Typing Edge Cases**
   - **Risk**: Python's dynamic nature (e.g., `__getattr__`, descriptors, properties) may expose edge cases not seen in statically-typed languages
   - **Mitigation**: Property detection via `inspect.getattr_static()` to prevent side effects; when detection fails, show normally (prioritize visibility over excessive caution); test with diverse Python code patterns

3. **Cycle Detection Strategy Mismatch**
   - **Risk**: Python doesn't have JavaScript's Object.is(), may need language-specific identity checking
   - **Mitigation**: Research Python's id() function and 'is' operator; fallback to variablesReference-only detection

4. **Thread Management Differences**
   - **Risk**: Unclear if debugpy pauses all threads (like C#) or single thread (like Node)
   - **Mitigation**: Phase 1 testing clarifies thread behavior; adapt from Node or CoreCLR pattern

5. **Python-Specific Feature Preservation**
   - **Risk**: debugpy may provide Python-specific metadata that should be preserved but we don't know about
   - **Mitigation**: Inspect actual debugpy responses; preserve unknown fields like vsdbg's memoryReference

### Assumptions

1. **Standard DAP Compliance**: debugpy implements Debug Adapter Protocol consistently with threads/stackTrace/scopes/variables requests
2. **VS Code Integration**: Python extension and debugpy are properly installed and configured in test environment
3. **Reusable Patterns**: CoreClrDebugAdapter serves as primary implementation template (~538 lines); simpler cycle detection and proven patterns match Python's needs
4. **Test Coverage**: Existing test/python/test_example.py provides adequate test scenarios
5. **Performance**: Python variable inspection completes within 5-second timeout used for other languages

## Open Questions

### High Priority (Affects Architecture)

1. **Q1: Thread Detection Strategy**
   - Does debugpy pause multiple threads or single thread when hitting a breakpoint?
   - Should we use NodeDebugAdapter's simple approach or CoreClrDebugAdapter's iteration?
   - [NEEDS CLARIFICATION: Manual testing Phase 1]

2. **Q2: Cycle Detection Mechanism**
   - Can we use Python's id() function via evaluate for identity checking (similar to Object.is())?
   - Is evaluate context='hover' side-effect free in debugpy?
   - Should we use Node's pattern or CoreCLR's simpler approach?
   - [NEEDS CLARIFICATION: Phase 1 prototyping]

3. **Q3: Property Evaluation Safety**
   - Do Python properties/descriptors have side effects like C# properties?
   - Does debugpy mark expensive scopes like vsdbg?
   - What strategy should we use for property evaluation?
   - [NEEDS CLARIFICATION: Phase 1 testing with property-heavy code]

### Medium Priority (Affects Implementation Details)

4. **Q4: debugpy-Specific Capabilities**
   - What debugpy-specific features exist in variable responses?
   - Should we preserve unknown fields like we do for vsdbg?
   - Are there Python-specific hints or metadata?
   - [NEEDS CLARIFICATION: Inspect actual debugpy DAP responses]

5. **Q5: Type Information Formatting**
   - How does debugpy format type information (e.g., `<class 'int'>` vs `int`)?
   - Should we normalize type strings for consistency with other adapters?
   - [NEEDS CLARIFICATION: Compare actual responses across languages]

6. **Q6: Collection Pagination Support**
   - Does debugpy support start/count parameters for large lists/dicts?
   - How are dict keys vs values represented in variables response?
   - [NEEDS CLARIFICATION: Test with large collections]

### Low Priority (Nice to Have)

7. **Q7: Python-Specific Edge Cases**
   - How should we handle `__dict__`, `__slots__`, metaclasses?
   - Should we expose dunder methods in variable listings?
   - How to handle generators, coroutines, async objects?
   - [NEEDS CLARIFICATION: Test with advanced Python features]

8. **Q8: Error Message Localization**
   - Should error messages use Python terminology (e.g., "list" vs "array")?
   - [NEEDS CLARIFICATION: Review error message consistency]

---

## Clarifications

### Session 2025-10-07

**Q1: Testing Strategy**
- **Question**: What testing approach best fits this feature's complexity and risk profile? (Options: A=Full TDD, B=Lightweight, C=Manual Only, D=Hybrid)
- **Answer**: C (Manual Only)
- **Rationale**: Follow proven pattern from CoreCLR adapter using docs/manual-test/debug-single.md
- **Impact**: Updated Testing Strategy section with manual-only approach and 4-phase workflow

**Q2: Property Detection Failure Handling**
- **Question**: When property detection fails (evaluate error, debugpy issue), what should the adapter do? (Options: A=Assume property/mark lazy, B=Assume not property/show normally, C=Show as error)
- **Answer**: B (Assume not property, show normally)
- **Rationale**: Prioritize visibility over excessive caution; better to show data than hide it due to detection errors
- **Impact**: Updated Risks section to clarify fallback behavior: "when detection fails, show normally (prioritize visibility over excessive caution)"

**Q3: Phase 1 Discovery Approach**
- **Question**: How should Phase 1 manual testing be conducted?
- **Answer**: Guided discovery - user will direct the discovery process interactively
- **Rationale**: No time constraints; focus on exactly what matters through interactive exploration
- **Impact**: Phase 1 will be collaborative and thorough, ensuring all critical debugpy behaviors are understood before implementation

**Q4: Feature Parity vs Enhancement Scope**
- **Question**: Should Python adapter implement strict parity only (A) or include Python-specific enhancements (B)?
- **Answer**: A (Strict parity only)
- **Rationale**: Goal is to unblock Python debugging with same capabilities as JS/C#; Python-specific handling (property detection, special types) is for safety/correctness, not enhancement
- **Impact**: Added to Non-Goals: "Not adding Python enhancements"; keeps scope at ~538 lines target

**Q5: Implementation Template Choice**
- **Question**: Which existing adapter should serve as primary implementation template? (Options: A=CoreClrAdapter/538 lines, B=NodeDebugAdapter/720 lines, C=Hybrid)
- **Answer**: A (CoreClrAdapter)
- **Rationale**: Simpler variablesReference-only cycle detection matches Python's needs; proven at ~538 lines; similar "all threads stop" behavior; aligns with deep research recommendation
- **Impact**: Updated Assumptions section; implementation will copy CoreClrAdapter structure, remove C#-specific code (thread iteration, vsdbg preservation), add Python-specific features (property detection, special type handling)

---

**Spec Version**: 1.2
**Created**: 2025-10-07
**Last Updated**: 2025-10-07
**Status**: Clarification Complete (5/5 questions answered)
**Next Step**: Run /plan-3-architect to generate phase-based implementation plan
