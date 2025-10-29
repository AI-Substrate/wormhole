# Phase 1 Manual Test Checklist

## Error Code Validation

This checklist validates that all error codes produce the correct messages with actionable recovery hints.

### Session Errors

- [ ] **E_NO_SESSION**: Triggers when no debug session is active
  - Expected Message: "No active debug session"
  - Expected Hint: "Start debugging with F5 or select a debug configuration and press the play button"
  - Test Method: Call script without starting debugger

- [ ] **E_NOT_PAUSED**: Triggers when debugger is running
  - Expected Message: "Debugger is not paused at a breakpoint"
  - Expected Hint: "Set a breakpoint and wait for execution to stop, or use the pause button in the debug toolbar"
  - Test Method: Call script while debugger is running

- [ ] **E_NOT_STOPPED**: Triggers for operations requiring stopped state
  - Expected Message: "Debugger must be stopped to perform this operation"
  - Expected Hint: "Set a breakpoint and wait for execution to stop before trying again"
  - Test Method: Attempt operation while debugging is active but not paused

### Parameter Errors

- [ ] **E_INVALID_PARAMS**: Triggers with invalid parameters
  - Expected Message: "Invalid parameters provided"
  - Expected Hint: "Check the parameter requirements for this script and ensure all required fields are provided"
  - Test Method: Call script with wrong parameter types

- [ ] **E_MISSING_REQUIRED_PARAM**: Triggers with missing required parameter
  - Expected Message: "Required parameter is missing"
  - Expected Hint: "Review the script documentation for required parameters"
  - Test Method: Call script without required parameter

### Data Size Errors

- [ ] **E_LARGE_DATA**: Triggers when data exceeds thresholds
  - Expected Message: "Variable data exceeds size threshold (5MB or 20,000 nodes)"
  - Expected Hint: "Consider using debug.save-variable to write large data to a file instead"
  - Test Method: Create scenario with >20,000 nodes or >5MB data

- [ ] **E_MEMORY_BUDGET_EXCEEDED**: Triggers when memory budget exceeded
  - Expected Message: "Memory budget exceeded during variable traversal"
  - Expected Hint: "Reduce the depth parameter or use debug.save-variable for file output"
  - Test Method: Traverse deeply nested structure

### Language Support Errors

- [ ] **E_UNSUPPORTED_LANGUAGE**: Triggers for unsupported debugger
  - Expected Message: "Debug adapter language is not supported"
  - Expected Hint: "Supported debuggers: pwa-node (JavaScript/TypeScript), debugpy (Python), dlv-dap (Go), netcoredbg (C#), dart (Dart)"
  - Test Method: Mock session with unknown type

- [ ] **E_NOT_IMPLEMENTED**: Triggers for unimplemented features
  - Expected Message: "This feature is not yet implemented for the current language"
  - Expected Hint: "Only Node.js debugging is fully supported in this version. Use base DAP functionality for other languages"
  - Test Method: Call language-specific feature on non-Node adapter

### DAP Operation Errors

- [ ] **E_NO_THREADS**: Triggers when no threads available
  - Expected Message: "No threads available in the debug session"
  - Expected Hint: "Ensure the debugger is paused and has active threads before trying again"
  - Test Method: Query threads when session has none

- [ ] **E_NO_STACK**: Triggers when no stack frames
  - Expected Message: "No stack frames available"
  - Expected Hint: "Pause the debugger at a breakpoint to access stack frames"
  - Test Method: Request stack when none available

- [ ] **E_INVALID_REFERENCE**: Triggers with invalid variablesReference
  - Expected Message: "Invalid variablesReference provided"
  - Expected Hint: "Use debug.list-variables to get valid variablesReference values for expandable items"
  - Test Method: Use variablesReference of 0 or -1

- [ ] **E_STALE_REFERENCE**: Triggers after execution resumes
  - Expected Message: "Variable reference is no longer valid (execution has resumed)"
  - Expected Hint: "Variable references are only valid while execution is paused. Pause again and retrieve fresh references"
  - Test Method: Cache reference, continue execution, then use cached reference

### Modification Errors

- [ ] **E_MODIFICATION_FAILED**: Triggers when modification fails
  - Expected Message: "Failed to modify variable value"
  - Expected Hint: "Check that the variable is not read-only and the value type is compatible"
  - Test Method: Attempt to modify incompatible type

- [ ] **E_READ_ONLY**: Triggers for read-only variables
  - Expected Message: "Cannot modify this variable (read-only, const, or frozen)"
  - Expected Hint: "This variable cannot be modified. Try modifying a different variable"
  - Test Method: Attempt to modify const variable

### Evaluation Errors

- [ ] **E_EVALUATE_FAILED**: Triggers when evaluation fails
  - Expected Message: "Failed to evaluate expression in debug context"
  - Expected Hint: "Check the expression syntax and ensure it's valid for the current language"
  - Test Method: Evaluate invalid expression

- [ ] **E_NOT_EXPANDABLE**: Triggers for non-expandable values
  - Expected Message: "Expression does not produce expandable variables"
  - Expected Hint: "The expression result is a primitive value or cannot be expanded further"
  - Test Method: Evaluate primitive value and try to expand

## Test Execution Notes

### Setup
1. Compile extension: `npm run compile`
2. Launch Extension Development Host (F5)
3. Open test workspace with sample programs

### Test Harness
Run: `node /Users/jordanknight/github/vsc-bridge/scripts/test/test-debug-errors.js`

### Validation Criteria
- Each error displays the correct message
- Recovery hints are actionable and specific
- Error codes use consistent E_ prefix
- Formatted output is readable

### Results
- Date Tested: _____________
- Tester: _____________
- Passed: _____ / _____
- Failed: _____ / _____
- Notes:
