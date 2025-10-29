# JavaScript Test Debugging Support

## Summary

Extend VSC Bridge's test debugging capabilities to support JavaScript test frameworks by leveraging the **vscode-jest extension**, enabling developers to discover, run, and debug JavaScript tests directly from the VS Code Testing UI. This builds upon the existing `test.debug-wait` script infrastructure that currently provides Python test debugging support.

**Strategic Decision**: After research, we determined that building a custom TestController would require 2-3 weeks of complex implementation. Instead, we leverage the mature vscode-jest extension (Orta.vscode-jest) which provides complete Jest test integration, reducing implementation complexity by ~85%.

## Goals

- Enable JavaScript test files to appear in the VS Code Testing UI **via vscode-jest extension**
- Support debugging JavaScript test files with breakpoints via the `test.debug-wait` script
- Provide test discovery for Jest framework through vscode-jest (initial support, extensible to others)
- Maintain feature parity with existing Python test debugging capabilities
- Ensure consistent user experience across different test languages
- Support test execution at multiple levels (file, suite, individual test) via vscode-jest
- Integrate with BridgeContext's environment detection pattern (unified `getTestEnvironment()` API)
- Implement lazy dependency checking - only require vscode-jest when debugging JavaScript tests

## Non-Goals

- Supporting every possible JavaScript test framework initially (focus on Jest via vscode-jest)
- Modifying the underlying breakpoint system architecture
- Changing how Python test debugging currently works
- Supporting TypeScript-specific test features beyond what compiles to JavaScript
- **Building a custom TestController** (leverage vscode-jest extension instead - 85% complexity reduction)
- Supporting non-test JavaScript debugging scenarios
- Forcing all users to install vscode-jest (lazy loading - only required when debugging JS tests)

## Acceptance Criteria

1. When a user opens a workspace containing JavaScript test files (e.g., `*.test.js`, `*.spec.js`) **with vscode-jest installed**, those files appear in the VS Code Testing UI sidebar
2. When a user clicks "Run Test" on a JavaScript test in the Testing UI, the test executes via vscode-jest and displays pass/fail status
3. When a user clicks "Debug Test" on a JavaScript test in the Testing UI, the debugger launches and stops at any set breakpoints
4. When a user sets a breakpoint in a JavaScript test file, the debugger honors it during test execution
5. When a user runs the `test.debug-wait` script on a JavaScript test file, it successfully launches the debugger with proper configuration
6. **When vscode-jest is not installed and user attempts to debug JavaScript test**, a clear error message displays with installation instructions
7. **When vscode-jest is not installed**, Python test debugging continues to work normally (no breaking changes)
8. When debugging a JavaScript test, all standard debugging features work (step over, step into, watch variables, evaluate expressions)

## Technical Approach

### Leveraging vscode-jest Extension + Existing Infrastructure

This feature extends the existing test debugging system by integrating with the vscode-jest extension:

1. **vscode-jest Extension Integration**
   - **Test Discovery**: Handled by vscode-jest (no custom TestController needed)
   - **Test UI Integration**: vscode-jest provides complete VS Code Testing UI integration
   - **Lazy Dependency**: Extension only checked when debugging JavaScript tests
   - **Error Handling**: Clear messages guide users to install if missing

2. **`test.debug-wait` Script** (`extension/src/vsc-scripts/tests/debug-wait.js`)
   - Extended to use unified `bridgeContext.getTestEnvironment()` API
   - Handles both Python (via `getPythonEnv()` fallback) and JavaScript tests
   - Detects `MissingExtensionError` and shows user-friendly install prompt
   - Already supports JavaScript debug adapters (`node`, `pwa-node`)

3. **Unified Test Environment Detection** (`extension/src/core/test-environments/`)
   - **JavaScriptTestDetector**: Auto-detects Jest from `package.json` dependencies
   - **Lazy Extension Check**: Only verifies vscode-jest when `detect()` is called
   - **Activation Attempt**: Tries to activate extension if installed but inactive
   - Returns environment object with framework, confidence score, and debug configuration

4. **BridgeContext Integration**
   - Unified `getTestEnvironment(file: Uri)` API replaces language-specific methods
   - Follows same pattern as Python: environment detection returns debug configuration
   - Configuration includes: `type: 'node'`, `program`, `args`, `cwd`
   - Graceful fallback to legacy `getPythonEnv()` for backward compatibility

## Risks & Assumptions

- **Mitigated Risk**: Building custom TestController was too complex → Solution: Leverage vscode-jest extension
- **Assumption**: vscode-jest extension provides sufficient test discovery and UI integration (validated)
- **Assumption**: VS Code's existing JavaScript debugging infrastructure can be leveraged (validated)
- **Assumption**: Test framework detection can be automated based on package.json dependencies (implemented)
- **Assumption**: Users willing to install vscode-jest for JavaScript test debugging (optional dependency)
- **Assumption**: Users have Node.js installed and configured for JavaScript test execution
- **Risk**: vscode-jest extension API changes → Mitigation: We only check for extension presence/activation

## Implementation Parallel to Python

The JavaScript implementation will mirror the Python test debugging approach:

### Python (Current Working Implementation)
1. **Discovery**: `waitForTestDiscovery()` uses `vscode.tests.createTestObserver()` to track Python test items
2. **Framework Detection**: Checks `python.testing.pytestEnabled` and `python.testing.unittestEnabled` configs
3. **Environment Detection**: `getPythonEnv()` returns `{ framework: 'pytest', confidence: 0.9, debugConfig: {...} }`
4. **Debug Configuration**: Sets `module: 'pytest'` with appropriate args for module-based execution
5. **Execution**: `test.debug-wait` script launches debugger with the detected configuration

### JavaScript (Proposed Parallel Implementation)
1. **Discovery**: `waitForJavaScriptTestDiscovery()` will use same `vscode.tests.createTestObserver()` pattern
2. **Framework Detection**: Check `package.json` for Jest dependencies (extensible for future frameworks)
3. **Environment Detection**: `getJavaScriptEnv()` will return `{ framework: 'jest', confidence: 0.9, debugConfig: {...} }`
4. **Debug Configuration**: Set appropriate runner command (e.g., `node node_modules/.bin/jest`)
5. **Execution**: Same `test.debug-wait` script will handle JavaScript tests with the JS configuration

## Testing Strategy

**Approach**: Full TDD
**Rationale**: Multi-language test debugging is complex with many edge cases requiring comprehensive test coverage.
**Focus Areas**:
- Framework detection logic (Jest/Mocha identification)
- Debug configuration generation for each framework
- Test discovery integration with VS Code Test API
- Environment detection (getJavaScriptEnv) implementation
- Integration between test.debug-wait and JavaScript tests
**Excluded**:
- VS Code Test API itself (platform responsibility)

## Clarifications

### Session 2025-01-29

**Q1: Testing Strategy**
- Selected: Full TDD approach
- Rationale: Multi-language test debugging is complex with many edge cases

**Q2: Framework Prioritization**
- Selected: Jest only for initial implementation
- Rationale: Start with Jest to get it working, add more frameworks later as needed

**Q3: VS Code Test Extension Compatibility**
- Selected: No test extensions - relying on built-in VS Code functionality only
- Rationale: Using native VS Code Test API without third-party extensions ensures clean implementation

**Q4: Test Discovery Trigger**
- Selected: Same as Python - on workspace open with manual refresh available
- Rationale: Consistency with existing Python implementation, provides balance of automation and control

**Q5: Test Organization in UI**
- Selected: Separate roots - Python tests under "Python", JavaScript under "JavaScript"
- Rationale: Clear separation by language, can be refactored later if needed (mostly presentation layer change)

## Open Questions (Resolved)

All critical questions have been clarified during the planning session.