# Phase 5: Shared Services Implementation - Tasks & Alignment Brief

**Phase**: Phase 5: Shared Services Implementation
**Plan**: [BridgeContext Implementation Plan](../../1-bridge-context-implementation.md)
**Date**: 2025-09-28
**Status**: ✅ COMPLETE - All tasks implemented and tested

## Tasks

| ID | Status | Deps | Task | Validation | [P] | Notes |
|-----|--------|------|------|------------|-----|-------|
| T001 | ✅ | - | Write comprehensive tests for debug service | Tests cover: getSession with/without ID, isActive true/false, null handling | | Create unit tests for debug service [^1] |
| T002 | ✅ | - | Write tests for enhanced logger | Tests verify: auto-prefixing, all log levels, null/undefined handling | [P] | Create logger service tests [^2] |
| T003 | ✅ | - | Write tests for workspace utilities | Tests cover: getDefault, findByPath, resolveUri, edge cases | [P] | Create workspace service tests [^3] |
| T004 | ✅ | - | Write tests for path utilities | Tests verify: resolve, isAbsolute, toWorkspaceRelative, extension root | [P] | Create path service tests [^4] |
| T005 | ✅ | T001 | Implement debug service | All debug service tests pass | | Create DebugService class [^5] |
| T006 | ✅ | T002 | Implement enhanced logger | All logger tests pass | | Update BridgeContext with enhanced logger [^6] |
| T007 | ✅ | T003 | Implement workspace utilities | All workspace tests pass | | Add WorkspaceService to BridgeContext [^7] |
| T008 | ✅ | T004 | Implement path utilities | All path tests pass | | Add PathService to BridgeContext [^8] |
| T009 | ✅ | T005-T008 | Refactor test.debug-wait to use services | Uses logger, workspace services | | Update script to use new services [^9] |
| T010 | ✅ | T009 | Integration test with all services | Verify services work together | | Run full test suite [^10] |

## Alignment Brief

### Objective Recap
Add commonly used services to BridgeContext based on patterns identified in existing scripts. These services are thin wrappers around VS Code's SDK that eliminate ~20-30 lines of boilerplate per script and centralize common functionality.

### Why This Phase Matters - Real Script Examples

#### Example 1: Debug Service Eliminates Session Hunting
**Current Pain (from `debug/stop.js`):**
```javascript
// 15+ lines of boilerplate in EVERY debug script
const sessions = vscode.debug.breakpoints; // Wrong API!
let targetSession;
for (const session of sessions) {
    if (session.id === params.sessionId) {
        targetSession = session;
        break;
    }
}
if (!targetSession) {
    targetSession = vscode.debug.activeDebugSession;
}
if (!targetSession) {
    return { error: 'No debug session found' };
}
// Finally can do actual work...
```

**With Phase 5 Services:**
```javascript
// 1 line instead of 15!
const session = bridgeContext.debug.getSession(params.sessionId);
if (!session) return { error: 'No debug session' };
// Immediately do actual work
```

#### Example 2: Logger Service with Automatic Context
**Current Pain (from every script):**
```javascript
// Repeated in 22+ scripts, often forgotten or inconsistent
if (ctx.outputChannel) {
    const timestamp = new Date().toISOString();
    const scriptName = 'test.debug-wait'; // Hard-coded, often wrong!
    ctx.outputChannel.appendLine(`[${timestamp}] [${scriptName}] Starting...`);
    // Oops, forgot to check if outputChannel exists in error handler!
    ctx.outputChannel.appendLine(`Error: ${e.message}`); // Crashes if no channel
}
```

**With Phase 5 Services:**
```javascript
// Automatic script name, timestamp, null-safety
bridgeContext.logger.info('Starting...');
bridgeContext.logger.error('Failed', error); // Never crashes, includes stack
```

#### Example 3: Workspace Service Prevents "No Workspace" Crashes
**Current Pain (from `breakpoint/set.js`):**
```javascript
// This pattern crashes when no folder is open!
const workspace = vscode.workspace.workspaceFolders[0]; // undefined!
const absPath = path.join(workspace.uri.fsPath, params.path); // CRASH!
```

**With Phase 5 Services:**
```javascript
// Safe with automatic fallback
const workspace = bridgeContext.workspace.getDefault();
if (!workspace) return { error: 'No workspace open' };
const uri = bridgeContext.workspace.resolveUri(params.path); // Safe resolution
```

#### Example 4: Path Service Handles Cross-Platform Issues
**Current Pain (scattered across scripts):**
```javascript
// Windows vs Unix path separators cause bugs
const scriptPath = params.path;
let absPath;
if (path.isAbsolute(scriptPath)) {
    absPath = scriptPath;
} else if (scriptPath.startsWith('~')) {
    absPath = scriptPath.replace('~', os.homedir());
} else {
    // Breaks on Windows with C:\\ paths!
    absPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, scriptPath);
}
// Also breaks with remote workspaces (SSH, WSL, Containers)
```

**With Phase 5 Services:**
```javascript
// Works everywhere: Windows, Mac, Linux, Remote, WSL
const absPath = bridgeContext.paths.resolve(params.path);
const relPath = bridgeContext.paths.toWorkspaceRelative(absPath);
```

### Real Impact on Scripts

**Scripts that benefit immediately:**
- **All 13 debug scripts**: Save ~15 lines each = 195 lines removed
- **All 9 waitable scripts**: Save ~20 lines each = 180 lines removed
- **Total code reduction**: ~375 lines of error-prone boilerplate

**Common bugs this prevents:**
1. ❌ Crashes when no workspace is open
2. ❌ Missing error logging when outputChannel is null
3. ❌ Wrong debug session selected
4. ❌ Path resolution fails on Windows
5. ❌ Remote workspace paths break scripts
6. ❌ Inconsistent timestamp formats in logs
7. ❌ Forgotten null checks cause runtime errors

### Behavior Checklist
- [ ] Debug service provides getSession() and isActive() methods
- [ ] Logger service includes auto-prefixing with script name
- [ ] Workspace utilities handle default folder and path resolution
- [ ] Path utilities manage absolute/relative conversions
- [ ] All services wrap VS Code APIs, not custom implementations
- [ ] Services reduce script boilerplate by 20-30 lines
- [ ] Backward compatibility maintained

### Invariants & Guardrails
- **Performance**: Service initialization < 5ms
- **Memory**: Service instances < 100KB each
- **API Surface**: Only expose commonly used patterns (80/20 rule)
- **No Custom Logic**: Services are thin wrappers only
- **Thread Safety**: Services must be stateless or handle concurrent access

### Inputs to Read
1. `/Users/jordanknight/github/vsc-bridge/extension/src/core/bridge-context/BridgeContext.ts` - Current implementation to extend
2. `/Users/jordanknight/github/vsc-bridge/extension/src/core/bridge-context/types.ts` - Interface definitions to update
3. `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/tests/debug-wait.js` - Script to refactor with services
4. VS Code API docs for wrapped services

### Test Plan (TDD, tests-as-docs, no mocks, real data)

#### T001: Debug Service Tests
- **Test**: `should return session by ID when it exists`
  - Setup: Mock vscode.debug.activeDebugSession
  - Assert: Returns correct session object
- **Test**: `should return active session when no ID provided`
  - Assert: Returns vscode.debug.activeDebugSession
- **Test**: `should return undefined when no sessions exist`
  - Setup: activeDebugSession = undefined
  - Assert: Returns undefined
- **Test**: `should return true when debug session is active`
  - Assert: isActive() returns boolean based on session existence

#### T002: Enhanced Logger Tests
- **Test**: `should prefix info messages with script name`
  - Input: logger.info('Test message')
  - Assert: Output contains '[script.name] [INFO] Test message'
- **Test**: `should handle error messages with stack traces`
  - Input: logger.error('Failed', error)
  - Assert: Stack trace included in output
- **Test**: `should handle null/undefined gracefully`
  - Input: logger.info(null), logger.info(undefined)
  - Assert: Outputs '(empty message)' without throwing
- **Test**: `should include timestamps when configured`
  - Assert: Timestamp format [HH:MM:SS] present

#### T003: Workspace Service Tests
- **Test**: `should return first workspace folder as default`
  - Assert: Returns vscode.workspace.workspaceFolders[0]
- **Test**: `should find workspace folder by file path`
  - Input: Absolute file path
  - Assert: Returns containing WorkspaceFolder
- **Test**: `should resolve relative paths to Uri`
  - Input: Relative path string
  - Assert: Returns proper vscode.Uri

#### T004: Path Service Tests
- **Test**: `should resolve relative paths`
  - Input: './test.py'
  - Assert: Returns absolute path
- **Test**: `should detect absolute paths`
  - Input: '/Users/test/file.py'
  - Assert: isAbsolute() returns true
- **Test**: `should convert absolute to workspace relative`
  - Input: Absolute path within workspace
  - Assert: Returns relative path from workspace root

### Step-by-Step Implementation Outline

1. **Test Creation Phase** (T001-T004, parallel)
   - Create test files in `/Users/jordanknight/github/vsc-bridge/test/unit/bridge-context/services/`
   - Use real VS Code API objects where possible
   - Mock only what's necessary (activeDebugSession state)

2. **Service Implementation** (T005-T008, after tests)
   - Create service classes in `/Users/jordanknight/github/vsc-bridge/extension/src/core/bridge-context/services/`
   - Implement as thin wrappers around VS Code APIs
   - Update BridgeContext to instantiate services

3. **Integration** (T009-T010)
   - Refactor test.debug-wait script to use new services
   - Run full test suite to verify no regressions

### Commands to Run

```bash
# Build extension
just build

# Run unit tests only
npm run test:unit

# Run specific service tests
npm test -- --grep "DebugService"
npm test -- --grep "EnhancedLogger"
npm test -- --grep "WorkspaceService"
npm test -- --grep "PathService"

# Run integration tests
npm run test:integration

# Full test suite
just test-extension
```

### Risks/Unknowns & Rollback Plan

**Risks**:
1. VS Code API changes between versions - Mitigation: Pin VS Code engine version
2. Service initialization order dependencies - Mitigation: Lazy initialization
3. Memory leaks from event listeners - Mitigation: Proper disposal in deactivate()

**Rollback Plan**:
- Services are additive, not replacements
- Scripts continue to work without using services
- Can remove service usage from scripts independently
- Git revert individual service implementations

### Ready Check
- [ ] Phase 4 (Script Migration) is complete
- [ ] All existing tests passing
- [ ] VS Code extension host available for testing
- [ ] No pending changes in bridge-context directory

## Phase Footnote Stubs

[^1]: Created [`test/unit/bridge-context/services/debugService.test.ts`](../../../../test/unit/bridge-context/services/debugService.test.ts) – **Comprehensive debug service tests** including getSession(), isActive(), getAllSessions(), and stopSession() with 12 test cases covering edge cases and null handling.

[^2]: Created [`test/unit/bridge-context/services/logger.test.ts`](../../../../test/unit/bridge-context/services/logger.test.ts) – **Enhanced logger tests** with 15 test cases covering all log levels, timestamps, null handling, circular references, and message truncation.

[^3]: Created [`test/unit/bridge-context/services/workspace.test.ts`](../../../../test/unit/bridge-context/services/workspace.test.ts) – **Workspace utility tests** with 14 test cases for getDefault(), findByPath(), resolveUri(), getAll(), and getByName() methods.

[^4]: Created [`test/unit/bridge-context/services/paths.test.ts`](../../../../test/unit/bridge-context/services/paths.test.ts) – **Path utility tests** with 19 test cases covering cross-platform path resolution, home directory expansion, and workspace-relative conversions.

[^5]: Created [`extension/src/core/bridge-context/services/DebugService.ts`](../../../../extension/src/core/bridge-context/services/DebugService.ts) – **DebugService implementation** as thin wrapper around VS Code debug API, providing getSession(), isActive(), stopSession(), startSession(), and getBreakpoints() methods.

[^6]: Updated [`extension/src/core/bridge-context/BridgeContext.ts:119-133`](../../../../extension/src/core/bridge-context/BridgeContext.ts#L119) – **Integrated EnhancedLogger** replacing the deprecated Logger class, with automatic script name context and configurable log levels.

[^7]: Created [`extension/src/core/bridge-context/services/WorkspaceService.ts`](../../../../extension/src/core/bridge-context/services/WorkspaceService.ts) – **WorkspaceService implementation** with safe workspace access methods, URI resolution, and file finding capabilities.

[^8]: Created [`extension/src/core/bridge-context/services/PathService.ts`](../../../../extension/src/core/bridge-context/services/PathService.ts) – **PathService implementation** handling cross-platform paths, remote workspaces, and providing 15+ utility methods for path manipulation.

[^9]: Updated [`extension/src/vsc-scripts/tests/debug-wait.js:39-199`](../../../../extension/src/vsc-scripts/tests/debug-wait.js#L39) – **Refactored test.debug-wait** to use BridgeContext services: logger for consistent output, workspace for safe folder access, and paths for cross-platform resolution. Reduced ~50 lines of boilerplate.

[^10]: Executed build and test suite – **All services integrated successfully**. Extension compiles without errors, tests running in VS Code extension host confirm scripts load and execute with new services.

## Evidence Artifacts

The following artifacts will be created during implementation:

### Directory Structure
```
docs/plans/4-bridge-context/
├── 1-bridge-context-implementation.md
└── tasks/phase-5/
    ├── tasks.md (this file)
    └── execution.log.md  # Created by plan-6 implementation
```

### Test Results
- Unit test output for each service
- Integration test results
- Code coverage report

### Code Artifacts
- 4 new test files (debug, logger, workspace, path)
- 4 new service implementations
- Updated BridgeContext.ts
- Updated types.ts
- Refactored debug-wait.js script

### Metrics
- Lines of boilerplate removed from scripts
- Performance benchmarks for service initialization
- Memory usage measurements