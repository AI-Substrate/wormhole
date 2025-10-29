# Java Debug Adapter Support for VSC-Bridge

## Summary

Add Java debugging support to VSC-Bridge's runtime inspection system, enabling developers to debug Java tests at cursor position and inspect variables during execution. This brings Java to feature parity with existing JavaScript (pwa-node), C# (coreclr), and Python (debugpy) debugging capabilities.

**What**: A Java debug adapter that integrates with VS Code's Java debugging infrastructure to provide variable inspection, modification, and test-at-cursor debugging.

**Why**: Java developers using VSC-Bridge need the same debugging capabilities available to JavaScript, Python, and C# developers. Without Java support, they cannot use `tests.debug-single` or `debug.list-variables` commands when working with JUnit or TestNG tests.

## Goals

- **Enable test debugging via `tests.debug-single`**: Java developers can debug tests at cursor position just like other languages
- **Variable inspection**: Support `debug.list-variables`, `debug.get-variable`, and `debug.set-variable` for Java debug sessions
- **Framework compatibility**: Work with JUnit 4, JUnit 5, and TestNG test frameworks
- **Thread-aware debugging**: Correctly handle multi-threaded Java applications and identify active threads with source code
- **Collection pagination**: Handle large Java collections (ArrayList, HashMap, etc.) without crashing the extension
- **Type information**: Display Java type information (int, String, List<T>, etc.) in variable listings
- **Feature parity**: Match capabilities available for JavaScript, C#, and Python debugging
- **Manual testing validation**: Provide a manual test suite demonstrating all capabilities work correctly

## Non-Goals

- **Hot swap/hot reload**: Advanced JVM hot code replacement features (rely on VS Code Java extension's existing support)
- **Remote debugging beyond VS Code defaults**: Custom remote debugging protocols or configurations (use what VS Code Java debugger already provides)
- **Performance profiling**: CPU/memory profiling or performance analysis (out of scope for variable inspection)
- **Advanced Java features**: Reflection inspection, annotation processing, bytecode analysis, or other JVM internals
- **Build system integration**: Maven/Gradle build orchestration (assume projects are already buildable)
- **Automated test suite**: Focus on manual testing following established patterns (automated tests are future work)
- **Java version compatibility testing**: Supporting all Java versions (assume LTS versions: Java 11, 17, 21)

## Known Limitations and Constraints

### VS Code Java Extension Variable Expansion Limitation

**Discovery**: Phase 3 validation (2025-10-08) via `investigate-variable-expansion.js`

**Limitation**: VS Code's Java debugging infrastructure only allows expanding **array and collection types** through the `variables` DAP request. Regular Java objects, Strings, lambdas, and Stream pipelines cannot be expanded programmatically.

**What Works** ✅:
- Arrays: `int[]`, `String[]`, `Object[]`
- Collections: `ArrayList`, `HashMap`, `HashSet`, etc.
- Special references: `this` reference expansion

**What Fails** ❌ with `CodeExpectedError: Only Array type is supported.`:
- Regular objects: `Person`, custom classes
- Strings: `String` object internals
- Lambdas: Functional interface instances
- Streams: `Stream`, `ReferencePipeline`, lazy evaluation objects

**Impact on VSC-Bridge**:
- `debug.get-variable` script returns error for non-collection types
- `debug.list-variables` with `maxDepth > 0` only expands collections
- Users cannot programmatically inspect custom object fields via CLI

**Why This Happens**:
The VS Code Java extension (`vscode-java-debug`) validates variable types before forwarding DAP `variables` requests to the java-debug server. The error occurs in VS Code's TypeScript code (`workbench.desktop.main.js`), not in our JavaDebugAdapter or the java-debug DAP server.

**This is NOT a bug in VSC-Bridge** - our JavaDebugAdapter correctly implements the DAP protocol. The limitation exists at the VS Code extension level.

**Workarounds**:
1. **Use VS Code UI**: The Variables panel in VS Code's Debug sidebar can expand all types (it uses different internal APIs)
2. **Use evaluate request**: The DAP `evaluate` request can access object fields (e.g., `evaluate("person.name")`)
3. **Accept limitation**: For CLI automation, only collections are programmatically expandable

**Investigation Tool**: `scripts/sample/dynamic/investigate-variable-expansion.js` (run via `just investigate-var-expansion`)

**Documentation**:
- Full investigation: `docs/plans/10-java-debug-adapter/tasks/phase-3-validation-and-testing/execution.log.md` → Critical Discovery 06
- User guidance: `test/java/README.md` → Variable Presentation section

**Decision**: We accept this limitation as it's inherent to VS Code's Java debugging infrastructure. No code changes needed in VSC-Bridge.

---

## Acceptance Criteria

### AC1: Test Debugging Works
**Given** a Java project with JUnit 5 tests in `test/java/`
**When** user runs `vscb script run tests.debug-single --param path=<test-file> --param line=<line>`
**Then**:
- Debug session starts successfully with session type `java`
- Debugger pauses at the specified test line (not at external framework code)
- Response shows `ok: true`, `event: stopped`, correct file and line number
- Duration is reasonable (~3-8 seconds including JVM startup)

### AC2: Local Variable Inspection Works
**Given** a paused Java debug session at a test breakpoint
**When** user runs `vscb script run debug.list-variables --param scope=local`
**Then**:
- All local variables in scope are listed with correct names
- Values are displayed accurately (e.g., `result = 42`)
- Types are shown with Java syntax (e.g., `int`, `String`, `ArrayList<Integer>`)
- Primitive types show `variablesReference: 0`
- Object types show `variablesReference > 0` (indicating expandable)

### AC3: Collection Expansion Works
**Given** a local variable with `variablesReference > 0` **and type is array/collection**
**When** user runs `vscb script run debug.get-variable --param variablesReference=<ref> --param count=10`
**Then**:
- **For collections (ArrayList, HashMap, arrays)**: Children are returned with correct name, value, type
- Each child has correct `variablesReference` if expandable
- Indexed/named elements are accessible
- Nested collections can be expanded further (respects maxDepth limits)
- **For non-collections (Person, String, lambdas, Streams)**: Error `"Only Array type is supported."` is returned (VS Code limitation, see Known Limitations section)

### AC4: Variable Modification Works
**Given** a paused debug session with modifiable variable (e.g., local primitive)
**When** user runs `vscb script run debug.set-variable --param name=<var> --param value=<new-value>`
**Then**:
- Variable value changes in the debug session
- Response confirms success with new value
- Subsequent variable listing shows updated value
- If setVariable fails, fallback to evaluate strategy is attempted

### AC5: Multi-Threaded Session Handling
**Given** a Java application paused with multiple threads
**When** adapter attempts to list variables
**Then**:
- Adapter correctly identifies the active thread (thread with source code location)
- Variables are retrieved from the correct thread's stack frame
- No errors from attempting to access threads without stack frames
- Behavior matches C# multi-threaded handling (not Python's simple GIL-aware approach)

### AC6: Large Collection Handling
**Given** a debug session with a large ArrayList (100,000+ elements)
**When** user lists variables or expands the collection
**Then**:
- Memory budget prevents extension crash (20,000 node / 5MB limit)
- Partial data is returned with a streaming suggestion
- Error code is `E_LARGE_DATA` with helpful hint
- Response includes `IStreamingSuggestion` with alternative approach

### AC7: Session Type Detection
**Given** any active Java debug session (JUnit test, main class, etc.)
**When** RuntimeInspectionService.getAdapter() is called
**Then**:
- AdapterFactory correctly detects session type as `java`
- JavaDebugAdapter instance is created (not error or fallback)
- No `E_UNSUPPORTED_LANGUAGE` error occurs

### AC8: Manual Test Suite Passes
**Given** the manual test procedure in `docs/manual-test/debug-single.md`
**When** tester follows Java test section step-by-step
**Then**:
- All verification checklists pass (session start, variable listing, object expansion, session stop)
- Test results match expected outputs (correct types, values, structure)
- No unexpected errors or timeouts occur
- Java tests demonstrate same quality as Python, JavaScript, and C# tests

### AC9: Documentation Complete
**Given** the implementation is complete
**When** reviewing documentation
**Then**:
- Main README lists Java as supported language with key features
- Runtime inspection README includes Java in capability matrix
- Manual test procedure has Java section with complete test steps
- CHANGELOG documents Java adapter feature
- All Java-specific behaviors are documented (thread detection, collection types)

## Risks & Assumptions

### Risks

**R1: Multi-Threading Complexity**
- **Risk**: Java applications are often multi-threaded, and finding the "active" thread (the one paused at source code) may be complex
- **Mitigation**: Follow CoreClrAdapter's `findActiveThread()` pattern; test with multi-threaded scenarios
- **Likelihood**: Medium | **Impact**: High (broken variable inspection if wrong thread selected)

**R2: JVM Startup Latency**
- **Risk**: Java debug sessions may be slow to start (4-8+ seconds) due to JVM initialization
- **Mitigation**: Set realistic timeout expectations in tests; document expected duration
- **Likelihood**: High | **Impact**: Low (user experience issue, not correctness)

**R3: Test Framework Compatibility**
- **Risk**: JUnit 4, JUnit 5, and TestNG may have different debug session characteristics
- **Mitigation**: Test with all three frameworks; adjust session name detection in debug-events.ts if needed
- **Likelihood**: Medium | **Impact**: Medium (tests.debug-single may fail for some frameworks)

**R4: Java Collection Types**
- **Risk**: Java has many collection types (ArrayList, LinkedList, HashMap, TreeMap, etc.) with different internal structures
- **Mitigation**: Rely on DAP's generic handling; test with common collections (ArrayList, HashMap)
- **Likelihood**: Low | **Impact**: Medium (some collections may not paginate correctly)

**R5: Lambda and Stream Variables**
- **Risk**: Lambda expressions and Stream pipelines may have unusual variable representations
- **Mitigation**: Document known limitations; mark streams as non-expandable if needed
- **Likelihood**: Medium | **Impact**: Low (advanced feature, acceptable limitation)

**R6: Extension Dependencies**
- **Risk**: Requires specific VS Code extensions (Language Support for Java, Debugger for Java, Test Runner for Java)
- **Mitigation**: Document prerequisites clearly; provide troubleshooting for missing extensions
- **Likelihood**: Low | **Impact**: High (complete failure if extensions missing)

### Assumptions

**A1**: VS Code Java extensions (Red Hat Language Support, Microsoft Debugger for Java) are installed and functioning correctly
**A2**: Java debug adapter uses session type `java` (verified via research)
**A3**: Java Debug Adapter Protocol implementation matches DAP specification (threads, scopes, variables requests work as documented)
**A4**: Test projects use standard Maven or Gradle structure with `src/test/java/` convention
**A5**: JVM versions 11, 17, and 21 (LTS releases) are the primary targets
**A6**: Multi-threaded detection follows similar patterns to C# CoreCLR (not Python's simpler GIL-aware approach)
**A7**: Cycle detection can rely on variablesReference tracking only (like C#/Python), no need for language-specific cycle detection
**A8**: Manual testing is sufficient for validation (following established Python/C#/JavaScript pattern)

## Open Questions

_All open questions have been resolved via comprehensive deep research. See Clarifications section below._

## Testing Strategy

**Approach**: Manual Only (following Python/C#/JavaScript adapter precedent)

**Rationale**: We will add Java functionality and validate via `docs/manual-test/debug-single.md`. If problems prove difficult to solve during implementation, we will move to dynamic scripts for rapid debugging until functionality works, then bake those scripts into the adapter and validate all functionality via debug-single manual tests.

**Focus Areas**:
- Manual test suite completeness in `docs/manual-test/debug-single.md`
- Comprehensive verification checklists for all acceptance criteria
- Test coverage for edge cases: multi-threading, large collections, static fields, lambdas, streams

**Excluded**:
- Automated unit/integration tests (future work)
- CI/CD test automation
- Performance benchmarking

**Mock Usage**: Avoid mocks - Use real Java debug sessions, actual DAP traffic, and live test projects for validation

## Success Metrics

- ✅ Java debug sessions start successfully via `tests.debug-single`
- ✅ Variable inspection works for primitives, objects, and collections
- ✅ All manual test procedures pass (matching quality of Python/C#/JavaScript tests)
- ✅ No `E_UNSUPPORTED_LANGUAGE` errors for Java sessions
- ✅ Multi-threaded applications handled correctly (variables from correct thread)
- ✅ Large collections handled without extension crashes (memory budget enforced)
- ✅ Documentation complete and consistent with other languages

## Clarifications

### Session 2025-10-08

#### Q1: Testing Strategy
**Question**: What testing approach best fits this feature's complexity and risk profile?

**Answer**: Option A - Manual Only

**Rationale**: We will add Java functionality and validate via debug-single.md. If problems prove difficult to solve, we will move to dynamic scripts for rapid debugging until functionality works, then bake scripts into the adapter and re-validate via manual tests.

**Spec Updates**:
- Added "Testing Strategy" section with Manual Only approach
- Documented dynamic script fallback strategy for difficult problems
- Confirmed no automated tests required (following Python/C#/JS precedent)

---

#### Q2: Session Type & Thread Detection (Resolved via Deep Research)
**Question**: What is the exact session type for Java debugging, and how does thread detection work?

**Answer**: Definitive answers obtained from deep research of Microsoft's official repositories:

**Session Type (Resolves Open Question Q1)**:
- Session type is **always `"java"`** for all Java debug sessions
- No variants for launch vs attach configurations
- No differences between JUnit 4, JUnit 5, and TestNG (all use `"java"`)
- No legacy aliases or community fork types

**Thread Detection (Resolves Open Question Q2)**:
- Use `threadId` from the latest `stopped` DAP event as the active thread
- `allThreadsStopped: true` is typical behavior (multiple threads paused, only one has source)
- Verify active thread with `stackTrace` request (returns frames with source paths)
- Fallback: Scan all threads if cached threadId has no frames (rare edge case)
- **Pattern**: Identical to C# CoreCLR multi-threaded detection (not Python's simple GIL-aware approach)

**Sources**: Microsoft vscode-java-debug repository, DAP specification v1.70.0, VS Code Java debugging documentation

**Spec Updates**:
- Removed Q1 (Session Type Confirmation) from Open Questions - definitively answered
- Removed Q2 (Thread Detection Specifics) from Open Questions - definitively answered
- Updated Assumption A2 to confirmed fact: "Java debug adapter uses session type `java` (verified via deep research)"
- Confirmed Assumption A6: Multi-threaded detection identical to C# CoreCLR pattern

---

#### Q3: Comprehensive Open Questions Resolution (Q3-Q8)
**Reference**: See `docs/plans/10-java-debug-adapter/deep-research-results-java.md` for complete deep research findings with sources.

**Q3: Test Framework Session Names** ✅ RESOLVED
- **Finding**: Session names are **opaque and unstable** (e.g., "Debug (JUnit) MyTest#method")
- **Critical Discovery**: NO `purpose: ["debug-test"]` flag exists (unlike Python/JavaScript)
- **Detection Strategy**: Use `mainClass` field (contains test launcher like `RemoteTestRunner`) OR check `classPaths` (contains `junit`/`testng` artifacts)
- **Implementation Impact**: Update `debug-events.ts` with robust test session detection using configuration fields, not name heuristics

**Q4: Collection Pagination Support** ✅ RESOLVED
- **Finding**: Full DAP pagination support confirmed
- Java adapter honors `start` and `count` parameters in `variables` request
- Large collections return `indexedVariables` count (arrays/lists) or `namedVariables` count (maps with logical entries)
- JDWP side chunking configurable via `jdwp.limitOfVariablesPerJdwpRequest` setting
- **Implementation**: Pass through `start`/`count` to DAP, respect memory budget (20k nodes / 5MB)

**Q5: Java-Specific Variable Attributes** ✅ RESOLVED
- **Finding**: No custom DAP extensions or Java-specific attributes
- Uses standard DAP fields: `presentationHint`, `evaluateName`, `variablesReference`, `namedVariables`, `indexedVariables`
- Behaviors controlled via settings (e.g., `showToString`, `showQualifiedNames`, `jdwp.*`)
- **Implementation**: No special attribute preservation needed - standard DAP handling sufficient

**Q6: Static Field Handling** ✅ RESOLVED
- **Finding**: Static fields appear in separate **"Static"** scope
- Controlled by `java.debug.settings.showStaticVariables` setting (default: true)
- **Implementation**: Treat "Static" as distinct scope node alongside "Local" and "This" scopes
- Filter based on `scopeFilter` parameter (exclude Static when `scopeFilter=local`)

**Q7: Build Configuration Requirements** ✅ RESOLVED
- **Prerequisite**: JDK 17+ required for Test Runner extension (can still target Java 11/17/21 for code)
- **Maven**: Add `junit-jupiter` dependency (no special surefire plugins needed for VS Code)
- **Gradle**: Apply `java` plugin + `useJUnitPlatform()` in test block
- **Implementation Impact**: Document JDK 17+ requirement in README prerequisites

**Q8: Lambda Variable Inspection** ✅ RESOLVED
- **Lambdas**: Captured variables appear in **Local** scope with source names
- Synthetic artifacts (`this$0`, `val$...`) are hidden/deemphasized by adapter
- **Streams**: Lazy pipelines (e.g., `java.util.stream.ReferencePipeline`) - NOT expanded as element lists
- Show as opaque objects with internal fields only (not materialized)
- **Implementation**: No special handling needed for lambdas; document Stream limitation

**Sources**:
- Microsoft vscode-java-debug GitHub repository
- Microsoft vscode-java-test GitHub repository
- VS Code Java debugging documentation
- DAP specification v1.70.0
- Complete findings in `docs/plans/10-java-debug-adapter/deep-research-results-java.md`

**Spec Updates**:
- Removed Q3-Q8 from Open Questions - all definitively answered
- All 8 original open questions now resolved with source-backed evidence
- Implementation guidance provided for each area (test detection, pagination, scopes, lambdas/streams)
- Added reference to deep research results document for future consultation

---

#### Q4: Template Adapter Selection
**Question**: Which existing adapter should serve as the primary template for JavaDebugAdapter implementation?

**Answer**: Option A - CoreClrAdapter (~537 lines)

**Rationale**:
- ✅ **Identical multi-threading pattern**: Java uses `allThreadsStopped: true` with thread scanning (same as C#)
- ✅ **variablesReference-only cycle detection**: Java doesn't support JavaScript's Object.is()
- ✅ **Proven thread detection**: `findActiveThread()` logic applies directly to Java
- ✅ **Collection pagination**: Same DAP pattern for large arrays/lists
- ❌ **Skip vsdbg-specific features**: Java doesn't have C#'s presentationHint/memoryReference extensions
- **Estimated Java adapter size**: ~550 lines (slightly more than CoreCLR due to Static scope handling)

**Adaptations Needed**:
1. Change session type check from `coreclr` → `java`
2. Keep thread detection logic (already perfect match)
3. Keep cycle detection (variablesReference only)
4. Add Static scope handling (C# doesn't expose it the same way)
5. Document Stream/lambda behaviors (add code comments)

**Rejected Alternatives**:
- **DebugpyAdapter**: GIL-aware threading too simple for Java multi-threading; property detection not needed
- **NodeDebugAdapter**: Object.is() cycle detection not applicable; single-threaded model mismatch
- **Hybrid approach**: Unnecessary complexity when CoreCLR is direct match

**Spec Updates**:
- Confirmed CoreClrAdapter as implementation template
- Documented minimal adaptations required
- Estimated ~550 lines for JavaDebugAdapter implementation

---

#### Q5: Implementation Phase Structure
**Question**: Should we follow Python's 7-phase approach or adopt a streamlined structure?

**Answer**: Option B - Streamlined 5-phase approach

**Phase Structure**:
- **Phase 0**: Preparation & Setup (Extensions, test project creation)
- **Phase 3**: JavaDebugAdapter Implementation (~550 lines based on CoreClrAdapter)
- **Phase 4**: Integration & Registration (AdapterFactory, error messages, debug-events.ts)
- **Phase 5**: Validation & Testing (Manual test suite execution)
- **Phase 6**: Documentation (README, capability matrix, manual test procedure, CHANGELOG)

**Rationale**: Deep research has definitively answered all questions that Discovery (Phase 1) and Dynamic Prototyping (Phase 2) would address. Skipping these phases eliminates redundant work while maintaining clear implementation progression.

**Comparison to Python Adapter**:
- Python used 7-phase structure but **skipped Phases 0-2 during execution**
- Java starts with 5-phase structure, reflecting completed discovery work upfront
- Both approaches result in same implementation phases (Prep → Implement → Integrate → Test → Document)

**Spec Updates**:
- Confirmed 5-phase streamlined structure
- Phases 1 & 2 eliminated (replaced by comprehensive deep research)
- Documented rationale: Deep research completed all discovery work upfront

---

## Clarification Summary

**Session**: 2025-10-08
**Questions Asked**: 5 of 5 (cap reached)
**Resolution Status**: ✅ **All Critical Ambiguities Resolved**

### Coverage Summary

| Category | Status | Details |
|----------|--------|---------|
| **Testing Strategy** | ✅ Resolved | Manual Only approach with dynamic script fallback |
| **Technical Questions** | ✅ Resolved | All 8 open questions answered via deep research |
| **Template Selection** | ✅ Resolved | CoreClrAdapter confirmed as primary template |
| **Phase Structure** | ✅ Resolved | Streamlined 5-phase approach (skip Discovery/Prototyping) |
| **Implementation Guidance** | ✅ Complete | Test detection, pagination, scopes, lambdas/streams documented |

### Key Decisions Made

1. **Testing**: Manual test suite in `debug-single.md`, dynamic scripts for difficult problems
2. **Session Type**: Always `"java"` (no variants)
3. **Thread Detection**: Use `stopped.threadId`, identical to C# CoreCLR pattern
4. **Test Detection**: Use `mainClass`/`classPaths` (not session name or purpose flag)
5. **Collections**: Full pagination support via `start`/`count` parameters
6. **Static Fields**: Separate "Static" scope, filter based on `scopeFilter` parameter
7. **Lambdas/Streams**: Lambdas show in Local scope; Streams are opaque objects
8. **Template**: CoreClrAdapter (~537 lines) → JavaDebugAdapter (~550 lines)
9. **Phases**: 5-phase streamlined structure (0, 3, 4, 5, 6)

### Deferred Items

_None - All critical questions resolved via deep research_

### Outstanding Questions

_None - Spec is implementation-ready_

### Next Steps

1. Run `/plan-3-architect` to generate the 5-phase implementation plan
2. Phase 0: Create test project structure (Maven pom.xml, DebugTest.java)
3. Phase 3: Implement JavaDebugAdapter using CoreClrAdapter as template
4. Phase 4: Register adapter and update test detection logic
5. Phase 5: Execute manual test suite
6. Phase 6: Update all documentation

---

**Spec Version**: 1.2 (Final - Ready for Architecture)
**Created**: 2025-10-07
**Last Updated**: 2025-10-08
**Status**: ✅ Clarified - Ready for Architecture Phase
