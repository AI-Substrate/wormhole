# Debug Error Codes

This module provides centralized error handling for all debug scripts in VSC Bridge.

## Overview

All debug errors follow a consistent structure with:
- **Error Code**: Standardized code with `E_` prefix
- **Message**: Clear description of what went wrong
- **Hint**: Actionable recovery steps for the user
- **Detail**: Optional additional context

## Usage

```typescript
import { createDebugError, DebugErrorCode, formatDebugError } from './debug-errors';

// Create a basic error
const error = createDebugError(DebugErrorCode.E_NO_SESSION);

// Create an error with additional detail
const detailedError = createDebugError(
    DebugErrorCode.E_INVALID_PARAMS,
    'Expected "name" to be a string, got number'
);

// Format for display
console.log(formatDebugError(error));
// [E_NO_SESSION] No active debug session
// 💡 Hint: Start debugging with F5 or select a debug configuration...
```

## Error Catalog

### Session Errors

#### E_NO_SESSION
- **When**: No active debug session exists
- **Hint**: Start debugging with F5 or select a debug configuration
- **Recovery**: Start a debug session before calling the script

#### E_NOT_PAUSED
- **When**: Debugger is running (not stopped at breakpoint)
- **Hint**: Set a breakpoint and wait for execution to stop
- **Recovery**: Set breakpoint and pause execution

#### E_NOT_STOPPED
- **When**: Operation requires fully stopped execution
- **Hint**: Set a breakpoint and wait for execution to stop
- **Recovery**: Ensure debugger is completely stopped

### Parameter Errors

#### E_INVALID_PARAMS
- **When**: Script receives invalid parameter values
- **Hint**: Check parameter requirements and types
- **Recovery**: Review script documentation for correct parameters

#### E_MISSING_REQUIRED_PARAM
- **When**: Required parameter is not provided
- **Hint**: Review script documentation for required parameters
- **Recovery**: Provide all required parameters

### Data Size Errors

#### E_LARGE_DATA
- **When**: Variable data exceeds 5MB or 20,000 nodes
- **Hint**: Use debug.stream-variables for file output
- **Recovery**: Switch to streaming mode or reduce data scope
- **Critical Discovery**: Per Discovery 03, prevents extension host crashes

#### E_MEMORY_BUDGET_EXCEEDED
- **When**: Memory budget exceeded during traversal
- **Hint**: Reduce depth or use streaming
- **Recovery**: Lower maxDepth parameter or stream to file

### Language Support Errors

#### E_UNSUPPORTED_LANGUAGE
- **When**: Debug adapter type is not supported
- **Hint**: Lists supported debugger types
- **Recovery**: Use a supported language debugger
- **Supported Types**:
  - `pwa-node` - JavaScript/TypeScript
  - `debugpy` - Python
  - `dlv-dap` - Go
  - `netcoredbg` - C#/.NET
  - `dart` - Dart
- **Critical Discovery**: Per Discovery 04, auto-detects from session.type

#### E_NOT_IMPLEMENTED
- **When**: Feature not implemented for current language
- **Hint**: Only Node.js fully supported in this version
- **Recovery**: Use base DAP functionality or wait for future implementation

### DAP Operation Errors

#### E_NO_THREADS
- **When**: Debug session has no active threads
- **Hint**: Ensure debugger is paused with active threads
- **Recovery**: Check debugger state and pause if needed

#### E_NO_STACK
- **When**: No stack frames available
- **Hint**: Pause at a breakpoint to access stack frames
- **Recovery**: Set breakpoint and pause execution

#### E_NO_FRAMES
- **When**: Current thread has no stack frames
- **Hint**: Ensure debugger is paused with active call stack
- **Recovery**: Verify execution is paused in a function

#### E_INVALID_REFERENCE
- **When**: Invalid variablesReference provided (0 or undefined)
- **Hint**: Use debug.list-variables to get valid references
- **Recovery**: Obtain fresh variablesReference from scopes/variables

#### E_STALE_REFERENCE
- **When**: Variable reference used after execution resumed
- **Hint**: Variable references only valid while paused
- **Recovery**: Pause again and retrieve fresh references
- **Critical Discovery**: Per Discovery 02, references invalidate on resume

### Modification Errors

#### E_MODIFICATION_FAILED
- **When**: Attempt to modify variable fails
- **Hint**: Check variable is not read-only and value is compatible
- **Recovery**: Verify variable can be modified and value type matches

#### E_READ_ONLY
- **When**: Attempt to modify const/frozen/read-only variable
- **Hint**: This variable cannot be modified
- **Recovery**: Choose a different variable to modify

#### E_UNSUPPORTED_OPERATION
- **When**: Debug adapter doesn't support the operation
- **Hint**: Some debuggers have limited capabilities
- **Recovery**: Consult adapter documentation for supported operations

### Evaluation Errors

#### E_EVALUATE_FAILED
- **When**: Expression evaluation fails in debug context
- **Hint**: Check expression syntax is valid for language
- **Recovery**: Fix expression syntax or context

#### E_NOT_EXPANDABLE
- **When**: Expression result has no child variables
- **Hint**: Result is primitive or cannot be expanded
- **Recovery**: Expression evaluates to a simple value

### Generic Errors

#### E_UNKNOWN
- **When**: Unrecognized error condition
- **Hint**: Check VS Code output panel
- **Recovery**: Review output panel for details

#### E_INTERNAL
- **When**: Internal error in script logic
- **Hint**: May be a bug, check output panel
- **Recovery**: Report issue if persistent

## Helper Functions

### createDebugError(code, detail?)
Creates a standardized error with template message and hint.

### createCustomDebugError(code, customMessage, detail?)
Creates error with custom message but standard hint.

### formatDebugError(error)
Formats error for console/log display with code, message, hint, and detail.

### isDebuggerStateError(error)
Returns true if error is related to debugger state (not paused, no session, etc.).

### isReferenceError(error)
Returns true if error is related to variable references.

### createUnsupportedLanguageError(sessionType)
Creates E_UNSUPPORTED_LANGUAGE with current session type and supported list.

### createLargeDataError(nodeCount, byteCount)
Creates E_LARGE_DATA with specific size information.

### getSupportedDebuggerTypes()
Returns array of supported debugger type strings.

## Best Practices

1. **Always use error codes**: Don't throw raw strings
2. **Provide context**: Use detail parameter for specific information
3. **Be actionable**: Every hint should guide user to resolution
4. **Check state first**: Use appropriate error for debugger state issues
5. **Handle references carefully**: Remember they expire on resume (Critical Discovery 02)
6. **Respect memory budgets**: Trigger E_LARGE_DATA before extension crashes (Critical Discovery 03)

## Automated Tests

The debug-errors module has comprehensive test coverage with 33 automated tests ensuring all error codes, messages, hints, and helper functions work correctly.

### Running Tests

```bash
# Run all unit tests including debug-errors
cd extension
npm test

# Run unit tests only
npm run test:unit

# Via justfile from project root
just test
```

### Test Coverage

All 22 error codes and 8 helper functions have automated test coverage:

- **Error Code Enum**: Validates all codes are defined correctly
- **Error Creation**: Tests all error templates and messages
- **Helper Functions**: Validates formatting, classification, and specialized constructors
- **Edge Cases**: Tests byte formatting for KB/MB, reference validation, etc.

### Manual Testing

For visual validation of error output, run the manual test harness:

```bash
npx ts-node scripts/test/test-debug-errors.js
```

This displays all error codes with their formatted output for manual verification.

### TDD Implementation

The tests follow TDD (Test-Driven Development) methodology:
1. **RED**: Tests written first to define expected behavior
2. **GREEN**: Code implemented to make tests pass
3. **REFACTOR**: Tests integrated into Mocha framework

Test file location: `extension/src/test/unit/core/errors/debug-errors.test.ts`

## Related Documentation

- [Debug Script Bake-In Plan](../../../docs/plans/8-debug-script-bake-in/debug-script-bake-in-plan.md)
- [Critical Research Findings](../../../docs/plans/8-debug-script-bake-in/debug-script-bake-in-plan.md#critical-research-findings)
- [Phase 1 Tasks](../../../docs/plans/8-debug-script-bake-in/tasks/phase-1-error-code-infrastructure/tasks.md)
