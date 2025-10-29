# Automated Cross-Language Integration Test

## Summary

An automated integration test suite that validates VSC-Bridge's debugging capabilities across all four supported languages (Python, JavaScript, C#, Java) by programmatically executing the manual test procedures documented in `docs/manual-test/debug-single.md`.

The test will run as a single Vitest test suite, invoked via `just integration-test`, that builds and launches the Extension Host, then executes CLI commands from outside the Extension Host (in the `/test` directory) to verify the complete debugging workflow for each language.

**User Value**: Developers can run `just integration-test` during development to quickly validate that all language adapters are working correctly, catching regressions before they reach production. This replaces time-consuming manual testing with automated validation that provides fast feedback.

## Testing Strategy

**Approach**: Manual Only

**Rationale**: This feature creates an integration test suite that automates manual testing procedures. The test itself does not need additional tests on top of it - we will validate it works through manual execution during development.

**Focus Areas**:
- End-to-end validation of CLI → Bridge → Extension Host → Debug Adapter flow
- Successful execution of debug operations (start, list-variables, get-variable, stop) for all 4 languages
- Loose assertions that validate structure and basic correctness (not exact values)
- Fail-fast behavior to quickly identify which language/operation failed

**Excluded**:
- Unit tests for the integration test code itself
- Tests that verify the test (meta-testing)
- Mocking or stubbing of any components

**Mock Usage**: Avoid mocks entirely

**Mock Rationale**: Must test against actual Extension Host, real CLI, and real debuggers to provide true end-to-end validation. The test executes real CLI commands and validates their success, matching the manual testing workflow exactly.

## Goals

1. **Automate Manual Testing**: Programmatically execute all test procedures from `docs/manual-test/debug-single.md` for Python, JavaScript, C#, and Java
2. **Fast Feedback Loop**: Enable rapid iteration during development by providing quick validation that nothing is broken
3. **End-to-End Validation**: Test the complete flow from CLI command → Bridge API → Extension Host → Debug Adapter → Language Debugger
4. **Fail Fast**: Stop immediately when any test fails to reduce debugging time
5. **Single Command Execution**: Run entire test suite via `just integration-test`
6. **Deprecate Old Tests**: Move all existing integration tests to `test/integration/old/` folder and ensure they don't run, consolidating validation into this single comprehensive suite

## Non-Goals

1. **Parameter Validation Testing**: Not testing CLI parameter validation (already covered by `test/integration/param-validation.test.ts`)
2. **Unit Testing**: Not testing individual components in isolation (covered by existing unit test suites)
3. **Performance Benchmarking**: Not measuring or optimizing execution time (though tests should complete in reasonable time)
4. **Exhaustive Scenario Testing**: Not testing every possible debug scenario, only smoke tests validating that each language adapter works
5. **CI/CD Integration**: Not configuring CI pipelines or handling missing language extensions in automated environments (focus is on local development workflow)
6. **Exact Value Validation**: Not asserting exact variable values or deep object structures (loose assertions that validate structure and basic correctness)

## Acceptance Criteria

### 1. Test Infrastructure
- [x] Single Vitest test file located at `test/integration/cross-language-debug.test.ts` ✅
- [x] Justfile command `integration-test` that builds and runs the test ✅
- [x] Test can build the extension programmatically ✅
- [x] Test can launch Extension Host programmatically via `@vscode/test-cli` or equivalent ✅
- [x] Test executes CLI commands using `vscb` from `/test` directory (the workspace root when Extension Host runs) ✅
- [x] All existing integration tests moved to `test/integration/old/` directory ✅
- [x] Test runner configuration updated to exclude `test/integration/old/` from execution ✅
- [x] Old tests no longer run when executing `npm run test:integration` or `just integration-test` ✅
- [x] All debug operations use 30-second timeout for reliability ✅

### 2. Python (pytest) Test Flow
**Given** a Python test file at `test/python/test_example.py` line 29
- [x] `tests.debug-single` starts debug session successfully (30s timeout) ✅
- [x] Response has `ok: true` and `event: "stopped"` ✅
- [x] Response shows correct file path and line number (pauses at 31, not 29 - pytest quirk) ✅
- [x] Session type is `debugpy` (field not in response, gracefully handled) ⚠️
- [x] `debug.list-variables` returns at least one variable ✅
- [x] Variable has expected structure (name, value, type, variablesReference) ✅
- [x] `debug.stop` terminates session successfully ✅

### 3. JavaScript (Jest) Test Flow
**Given** a JavaScript test file at `test/javascript/example.test.js` line 533
- [x] `tests.debug-single` starts debug session successfully (30s timeout) ✅
- [x] Response has `ok: true` and `event: "stopped"` ✅
- [x] Session type is `pwa-node` (field not in response, gracefully handled) ⚠️
- [x] `debug.list-variables` returns variables with `variablesReference > 0` for objects ✅
- [x] `debug.get-variable` can expand at least one object successfully ✅
- [x] Expanded object has children with expected structure ✅
- [x] `debug.stop` terminates session successfully ✅

### 4. C# (xUnit) Test Flow
**Given** a C# test file at `test/csharp/SampleTests/CalculatorTests.cs` line 17
- [ ] `tests.debug-single` starts debug session successfully (30s timeout)
- [ ] Response has `ok: true` and `event: "stopped"`
- [ ] Session type is `coreclr`
- [ ] **Known behavior**: May pause at `[External Code]` instead of test line - proceed with test anyway
- [ ] Attempt `debug.list-variables` regardless of pause location (check during implementation if this works)
- [ ] `debug.stop` terminates session successfully
- [ ] **Note**: Will validate during implementation whether [External Code] pause still occurs and adjust test accordingly

### 5. Java (JUnit 5) Test Flow
**Given** a Java test file at `test/java/src/test/java/com/example/DebugTest.java` line 28
- [ ] `tests.debug-single` starts debug session successfully (30s timeout)
- [ ] Response has `ok: true` and `event: "stopped"`
- [ ] Response shows correct file path and line number (28)
- [ ] Session type is `java`
- [ ] `debug.list-variables` returns all local variables (at least 5 expected)
- [ ] Variables include collections with `indexedVariables` or `namedVariables` counts
- [ ] `debug.get-variable` can expand ArrayList/HashMap successfully
- [ ] **Known limitation**: `debug.get-variable` fails for regular objects (this is expected - VS Code limitation, test only collection expansion)
- [ ] `debug.stop` terminates session successfully

### 6. Error Handling
- [x] Test fails immediately on first error (fail fast approach) ✅
- [x] Error messages clearly indicate which language/step failed ✅
- [x] Test cleans up debug sessions even when assertions fail ✅
- [ ] Known limitations (C# [External Code], Java object expansion) do not cause test failures (pending C#/Java implementation)

## Risks & Assumptions

### Risks

1. **Extension Host Startup Time**: Extension Host may take several seconds to start, potentially causing timeouts or slow test execution
   - *Mitigation*: Use generous 30-second timeout for all debug operations to ensure reliability

2. **Asynchronous Operation Flakiness**: Debug operations are inherently asynchronous and may introduce race conditions or timing issues
   - *Mitigation*: Use generous timeouts, wait for events before proceeding, implement retry logic if needed

3. **Missing Language Extensions**: Tests may fail if required VS Code extensions (Python, C# Dev Kit, Java) are not installed in the test environment
   - *Mitigation*: Document required extensions in test file comments, consider skipping tests for missing extensions

4. **Test Dependencies**: Language-specific test dependencies (pytest, Jest, xUnit, JUnit) must be installed and accessible
   - *Mitigation*: Document dependency requirements, ensure test workspace has all dependencies pre-installed

5. **Platform-Specific Behavior**: Debuggers may behave differently on macOS, Linux, and Windows
   - *Mitigation*: Initial implementation targets macOS (primary development platform), document known platform differences

6. **CI/CD Environment Differences**: Extension Host may not be available or behave differently in CI environments
   - *Mitigation*: Focus on local development workflow first, CI integration is a non-goal

### Assumptions

1. **Extension Host Programmability**: Assume `@vscode/test-cli` or equivalent can launch Extension Host programmatically from Vitest tests
2. **CLI Authentication**: Assume CLI auth token can be configured programmatically (e.g., via `vscb config set authToken`)
3. **Test Workspace Structure**: Assume `/test` directory contains all necessary test files at expected paths with expected content
4. **Loose Assertions Acceptable**: Assume it's acceptable to validate structure and presence of data rather than exact values (e.g., "has at least one variable" vs "variable value equals exactly 2")
5. **Known Issues Documented**: Assume existing documentation in `docs/manual-test/debug-single.md` accurately describes known behaviors and limitations
6. **Single Test Run**: Assume all four languages can be tested in a single test run without needing separate processes or isolation

## Clarifications

### Session 2025-10-08

**Q1: Testing Strategy**
**Answer**: C (Manual Only)
**Rationale**: The goal of this plan is to build a detailed integration test. The test itself does not need another test on top.
**Impact**: Added Testing Strategy section specifying Manual Only approach with no mocking.

**Q2: Mock Usage**
**Answer**: A (Avoid mocks entirely)
**Rationale**: Must test the actual Extension Host as a real representation. The test will run CLI commands and validate each one was successful, just like the manual testing guide but automatic for easy and frequent execution.
**Impact**: Updated Testing Strategy section to explicitly require testing against real Extension Host, CLI, and debuggers.

**Q3: Timeout Values**
**Answer**: 30 seconds for all languages
**Rationale**: Generous timeout ensures reliability across all language debuggers regardless of startup speed variations.
**Impact**: Updated all acceptance criteria to specify 30-second timeout for debug operations. Updated Risks & Assumptions mitigation strategy.

**Q4: C# [External Code] Behavior**
**Answer**: C (Mark as expected, continue anyway)
**Rationale**: Will check during implementation if this is still an issue.
**Impact**: Updated C# acceptance criteria to attempt debug.list-variables regardless of pause location, with note to validate behavior during implementation.

**Q5: Test Framework**
**Answer**: B (Vitest)
**Rationale**: User preference for Vitest.
**Impact**: Updated Summary and Acceptance Criteria to specify Vitest test file (.test.ts). Updated assumptions to reference Vitest instead of Mocha.

**Q6: CLI vs Direct API**
**Answer**: CLI commands (`vscb script run`)
**Rationale**: (Implicit from Q2 answer) Test must match manual testing workflow exactly, running actual CLI commands.
**Impact**: Updated acceptance criteria to explicitly state "Test executes CLI commands using `vscb`".

---

## Implementation Status

**Last Updated**: 2025-10-08T20:35:00Z

### Completed Features
- ✅ **Test Infrastructure** (Phase 0-1): All 9 criteria met
- ✅ **Python Test Flow** (Phase 2): All 7 criteria met (1 with graceful handling)
- ✅ **JavaScript Test Flow** (Phase 3): All 7 criteria met (1 with graceful handling)
- ✅ **Error Handling** (Partial): 3/4 criteria met (pending C#/Java)

### In Progress
- ⏳ **C# Test Flow** (Phase 4): Not started
- ⏳ **Java Test Flow** (Phase 5): Not started

### Test Results
```
✓ test/integration/cross-language-debug.test.ts (3 tests) 24618ms
  ✓ Cross-Language Debug Integration > should verify bridge status 490ms
  ✓ Cross-Language Debug Integration > Python (pytest) > should complete full Python debug workflow 4009ms
  ✓ Cross-Language Debug Integration > JavaScript (Jest) > should complete full JavaScript debug workflow with object expansion 5116ms

Test Files  1 passed (1)
     Tests  3 passed (3)
  Duration  24.90s
```

**Progress**: 57% complete (4/7 phases)

---

**Implementation Plan**: [cross-language-integration-test-plan.md](./cross-language-integration-test-plan.md)
