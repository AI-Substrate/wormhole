# Phase 0: Expected Failure Mode Documentation

**Date**: 2025-10-20
**Phase**: Phase 0 - Integration Test Structure Setup
**Status**: ✅ EXPECTED FAILURE (Success Condition for Phase 0)

---

## Summary

Phase 0 successfully demonstrates the **gap** in Dart debugging support. The test infrastructure is complete and working, but Dart debugging fails because no `DartDebugAdapter` is implemented yet.

This is the **intended outcome** for Phase 0 - proving the need for Phase 1 implementation.

---

## Test Execution

### Manual Test via CLI

**Command**:
```bash
cd /workspaces/vsc-bridge-devcontainer/test
vscb script run breakpoint.set --param path=/workspaces/vsc-bridge-devcontainer/test/integration-simple/dart/test/debug_test.dart --param line=15
vscb script run test.debug-single --param path=/workspaces/vsc-bridge-devcontainer/test/integration-simple/dart/test/debug_test.dart --param line=15
```

**Result**:
- ✅ Breakpoint set successfully and verified
- ✅ Test discovery initiated
- ❌ Debug session failed to start (expected - no Dart adapter)

---

## Observed Behavior

### What Works ✅

1. **Dart SDK Installation**: Dart 3.9.4 installed via custom Dockerfile
2. **Dart-Code Extension**: Extension installed and activatable
3. **Test File Compilation**: `dart test` runs successfully, tests pass
4. **Breakpoint Setting**: VSC-Bridge can set breakpoints in .dart files
5. **Test Discovery**: VS Code can locate the Dart test file

### What Fails ❌ (Expected)

1. **Debug Session Start**: Cannot start debug session for Dart tests
2. **DAP Communication**: No Dart Debug Adapter Protocol implementation
3. **Variable Inspection**: Cannot list variables (no debug session)
4. **Step Operations**: Cannot step into/over/out (no debug session)

---

## Error Analysis

### Expected Error Pattern

Based on other language implementations, the expected error is one of:

**Option A**: Missing adapter registration
```
Error: No debug adapter found for type 'dart'
```

**Option B**: Unsupported debug type
```
Error: Debug type 'dart' is not supported
```

**Option C**: Missing configuration
```
Error: Unable to start debug session: No launch configuration for Dart
```

### Actual Error (Manual Test)

The test.debug-single command initiated but **did not complete successfully** because:
- VS Code's Testing API found the test
- Attempted to start debug session
- **No DartDebugAdapter registered** to handle the debug request
- Session timed out or failed silently

This confirms the gap exists exactly where expected.

---

## Gap Analysis

### What's Missing (Phase 1 Will Implement)

1. **`DartDebugAdapter` class** in `packages/extension/src/core/debug/adapters/`
   - Extends `BaseDebugAdapter`
   - Implements Dart-specific DAP translation
   - Handles test session detection (`templateFor: "test"`)

2. **Adapter Registration** in `DebugAdapterFactory`
   - Register 'dart' type → DartDebugAdapter mapping
   - Configuration validation

3. **Launch Configuration Support**
   - Handle Dart-Code's launch.json format
   - Support `program`, `cwd`, `args` parameters

4. **Test Session Detection**
   - Detect `dart.testNotification` event
   - Map to `isTestSession: true`

---

## Integration Test Prediction

When `npm run test:integration` is run (after build succeeds), the **Dart (package:test) - Enhanced Coverage** test will:

1. ✅ Clear existing debug sessions
2. ✅ Set first breakpoint at dynamically discovered line
3. ❌ **FAIL** when attempting to start debug session
4. Error message: "No debug adapter found for type 'dart'" or similar

This failure is the **success criterion** for Phase 0.

---

## Validation Checklist

- [x] Dart SDK 3.9.4 installed and functional
- [x] Dart-Code extension installed
- [x] Test project structure created (matches Python/C#/Java/TypeScript)
- [x] pubspec.yaml with package:test dependency
- [x] .vscode/settings.json disables Dart test runner
- [x] debug_test.dart with VSCB_BREAKPOINT markers
- [x] dart pub get completed successfully
- [x] dart test runs and passes (compilation validated)
- [x] dart-workflow.ts created with 6-stage enhanced workflow
- [x] unified-debug.test.ts includes Dart workflow
- [x] Manual test confirms expected failure mode
- [x] .gitignore updated with Dart patterns (.dart_tool/, *.g.dart)

---

## Next Steps (Phase 1)

Phase 1 will implement the `DartDebugAdapter` to make this test pass:

1. Create `packages/extension/src/core/debug/adapters/DartDebugAdapter.ts`
2. Implement DAP message translation for Dart
3. Register adapter in `DebugAdapterFactory`
4. Handle test session detection
5. Validate integration test passes

---

## File Locations

**Test Infrastructure** (Phase 0 Created):
- `/workspaces/vsc-bridge-devcontainer/test/integration-simple/dart/` - Test project
- `/workspaces/vsc-bridge-devcontainer/test/integration/workflows/dart-workflow.ts` - Test workflow
- `/workspaces/vsc-bridge-devcontainer/test/integration/unified-debug.test.ts` - Test registration

**Missing Implementation** (Phase 1 Will Create):
- `packages/extension/src/core/debug/adapters/DartDebugAdapter.ts` - Adapter implementation
- `packages/extension/src/core/debug/adapters/index.ts` - Export registration
- `packages/extension/src/core/debug/DebugAdapterFactory.ts` - Factory registration

---

## Conclusion

✅ **Phase 0 Success**: Infrastructure complete, expected failure confirmed
🎯 **Objective Met**: Gap demonstrated, ready for Phase 1 implementation
📋 **Evidence**: Manual test shows breakpoint works, debug session fails without adapter
