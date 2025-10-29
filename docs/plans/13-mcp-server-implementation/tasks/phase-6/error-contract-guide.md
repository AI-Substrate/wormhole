# Error Contract Guide

**Purpose**: Document patterns for structured error definitions with retryability guidance and actionable fix hints.

**Version**: 1.0 (2025-10-12)

---

## Overview

The `error_contract` field teaches AI agents:
- Which errors are retryable (transient failures vs permanent)
- How to fix user-correctable errors (specific actions)
- When to give up vs try again

This reduces wasted retry attempts and improves agent recovery from errors.

---

## Field Structure

```yaml
mcp:
  error_contract:
    errors:
      - code: E_ERROR_CODE
        summary: "Human-readable error description"
        is_retryable: true|false
        user_fix_hint: "Specific action to resolve"
```

**Requirements**:
- Document top 2-3 most common errors (not all possible errors)
- Error codes must match top-level `errors` field in meta.yaml
- `user_fix_hint` must be actionable (specific tool call or check)
- Token budget: 40-80 tokens for 2-3 errors

---

## Retryability Guidelines

### Retryable (`is_retryable: true`)

Use for:
- **Transient failures**: Timeouts, network errors, temporary resource unavailability
- **Fixable user input**: Wrong path/line that can be corrected with better info
- **State race conditions**: Not ready yet, but will be soon (retry with delay)

Examples:
```yaml
- code: E_TIMEOUT
  is_retryable: true
  user_fix_hint: "Increase timeout or simplify expression"

- code: E_FILE_NOT_FOUND
  is_retryable: true
  user_fix_hint: "Check file path and ensure it exists in workspace"

- code: E_NOT_READY
  is_retryable: true
  user_fix_hint: "Wait for debug session to initialize, then retry"
```

### Not Retryable (`is_retryable: false`)

Use for:
- **Missing prerequisites**: No session, missing config, etc. (must fix first)
- **Permanent failures**: Unsupported language, feature not available
- **Invalid configurations**: Bad parameters that won't work no matter how many retries

Examples:
```yaml
- code: E_NO_SESSION
  is_retryable: false
  user_fix_hint: "Call debug.start first"

- code: E_UNSUPPORTED_LANGUAGE
  is_retryable: false
  user_fix_hint: "This operation only works with Python/JavaScript/C# debuggers"

- code: E_BAD_CONFIG
  is_retryable: false
  user_fix_hint: "Check launch.json configuration and fix syntax errors"
```

---

## Writing Actionable Fix Hints

### Bad Fix Hints (Vague)

❌ **Wrong**: Too generic, not actionable
```yaml
user_fix_hint: "Debug session required"
user_fix_hint: "Invalid input"
user_fix_hint: "Check your configuration"
user_fix_hint: "Fix the error"
```

### Good Fix Hints (Actionable)

✅ **Right**: Specific action to take
```yaml
user_fix_hint: "Call debug.start or debug.get_active_session first"
user_fix_hint: "Verify line number exists and contains executable code"
user_fix_hint: "Ensure file path is relative to workspace root"
user_fix_hint: "Use Python syntax for expressions in Python sessions"
```

**Pattern**: Tell the agent exactly what to do (call specific tool, check specific condition, fix specific parameter).

---

## Common Patterns by Tool Category

### Pattern 1: Session-Dependent Tools

Tools that require active debug session:

```yaml
error_contract:
  errors:
    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start first"
```

**Apply to**: Most `debug.*` tools except `debug.start` and `debug.status`

---

### Pattern 2: File Path Tools

Tools that accept file paths:

```yaml
error_contract:
  errors:
    - code: E_FILE_NOT_FOUND
      summary: "File path not found or not accessible"
      is_retryable: true
      user_fix_hint: "Check file path and ensure it exists in workspace"

    - code: E_INVALID_PATH
      summary: "Path is not a valid file path"
      is_retryable: true
      user_fix_hint: "Use absolute path or workspace-relative path"
```

**Apply to**: `breakpoint.set`, `test.debug-single`, etc.

---

### Pattern 3: Line Number Tools

Tools that accept line numbers:

```yaml
error_contract:
  errors:
    - code: E_INVALID_LINE
      summary: "Line number not executable or out of range"
      is_retryable: true
      user_fix_hint: "Verify line number exists and contains executable code"

    - code: E_FILE_NOT_FOUND
      summary: "File path not found or not accessible"
      is_retryable: true
      user_fix_hint: "Check file path and ensure it exists in workspace"
```

**Apply to**: `breakpoint.set`, `test.debug-single`

---

### Pattern 4: Expression Evaluation Tools

Tools that evaluate expressions:

```yaml
error_contract:
  errors:
    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start first"

    - code: E_INVALID_EXPRESSION
      summary: "Expression failed to parse"
      is_retryable: true
      user_fix_hint: "Match the runtime language syntax; keep it a single expression"
```

**Apply to**: `debug.evaluate`

---

### Pattern 5: Variable Access Tools

Tools that read/write variables:

```yaml
error_contract:
  errors:
    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start first"

    - code: E_VARIABLE_NOT_FOUND
      summary: "Variable not found in current scope"
      is_retryable: true
      user_fix_hint: "Check variable name and ensure it exists in current frame"
```

**Apply to**: `debug.get-variable`, `debug.set-variable`, `debug.list-variables`

---

### Pattern 6: Timeout-Prone Operations

Tools that commonly timeout:

```yaml
error_contract:
  errors:
    - code: E_TIMEOUT
      summary: "Operation timed out waiting for response"
      is_retryable: true
      user_fix_hint: "Increase timeout or simplify operation"

    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start first"
```

**Apply to**: `debug.start`, `debug.wait-for-hit`, `test.debug-single`

---

### Pattern 7: Read-Only Query Tools

Tools that don't modify state (minimal errors):

```yaml
error_contract:
  errors:
    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start first"
```

**Apply to**: `debug.stack`, `debug.scopes`, `debug.status`, `dap.*` tools

---

## Error Priority (Which to Document)

When a tool has 5+ possible errors, prioritize:

1. **Most common**: Errors agents will hit frequently (E_NO_SESSION, E_FILE_NOT_FOUND)
2. **User-fixable**: Errors where agent can take action (not internal failures)
3. **Workflow-critical**: Errors that block common workflows

**Skip documenting**:
- Internal errors agents can't fix (E_INTERNAL_ERROR)
- Extremely rare edge cases
- Errors already covered by prerequisites in `relationships` field

---

## Integration with Relationships

Error contracts and relationships should align:

```yaml
relationships:
  requires: ["debug.start"]

error_contract:
  errors:
    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start first"  # Matches requires!
```

If tool requires X, include E_NO_X error with fix hint pointing to X.

---

## Examples by Tool

### breakpoint.set

```yaml
error_contract:
  errors:
    - code: E_FILE_NOT_FOUND
      summary: "File path not found or not accessible"
      is_retryable: true
      user_fix_hint: "Check file path and ensure it exists in workspace"

    - code: E_INVALID_LINE
      summary: "Line number not executable or out of range"
      is_retryable: true
      user_fix_hint: "Verify line number exists and contains executable code"
```

**Tokens**: ~60 (2 errors)

---

### debug.evaluate

```yaml
error_contract:
  errors:
    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start or debug.get_active_session first"

    - code: E_INVALID_EXPRESSION
      summary: "Expression failed to parse"
      is_retryable: true
      user_fix_hint: "Match the runtime language syntax; keep it a single expression"
```

**Tokens**: ~55 (2 errors)

---

### debug.start

```yaml
error_contract:
  errors:
    - code: E_LAUNCH_CONFIG_NOT_FOUND
      summary: "No launch configuration found for specified name"
      is_retryable: true
      user_fix_hint: "Check launch.json or provide valid configuration name"

    - code: E_TIMEOUT
      summary: "Debug session failed to start within timeout period"
      is_retryable: true
      user_fix_hint: "Increase timeout parameter or check for hanging process"
```

**Tokens**: ~65 (2 errors)

---

### dap.logs

```yaml
error_contract:
  errors:
    - code: E_NO_LOGS
      summary: "No DAP logs available"
      is_retryable: false
      user_fix_hint: "Start a debug session to generate DAP protocol logs"
```

**Tokens**: ~30 (1 error)

---

### util.restart-vscode

```yaml
error_contract:
  errors:
    - code: E_RESTART_FAILED
      summary: "Failed to restart VS Code"
      is_retryable: false
      user_fix_hint: "Manually restart VS Code and check for system errors"
```

**Tokens**: ~25 (1 error)

---

## Decision Tree

```
Is this error common (happens >5% of the time)?
├─ NO → Skip documenting
└─ YES
    └─ Can user/agent fix it?
        ├─ NO → Skip documenting (unless workflow-critical)
        └─ YES
            └─ Is it transient or fixable input?
                ├─ Transient → is_retryable: true
                └─ Permanent → is_retryable: false
```

---

## Token Budget

**Target**: 40-80 tokens for 2-3 errors

Breakdown per error:
- `code`: ~3 tokens
- `summary`: ~10-15 tokens
- `is_retryable`: ~2 tokens
- `user_fix_hint`: ~10-20 tokens
- **Total per error**: ~25-40 tokens

For 2 errors: ~50-80 tokens
For 3 errors: ~75-120 tokens (might exceed budget - prioritize top 2)

---

## Validation Checklist

Before committing error contract:

- [ ] All error codes exist in top-level `errors` field
- [ ] Each error has all 4 required fields
- [ ] `is_retryable` follows guidelines (transient/fixable = true)
- [ ] `user_fix_hint` is actionable (specific tool call or check)
- [ ] Covers top 2-3 errors (not all possible errors)
- [ ] Total tokens: 40-80 range
- [ ] Fix hints align with `requires` field if applicable

---

## Common Mistakes

❌ **Wrong: Documenting every possible error**
```yaml
error_contract:
  errors:
    - code: E_NO_SESSION
    - code: E_FILE_NOT_FOUND
    - code: E_INVALID_LINE
    - code: E_TIMEOUT
    - code: E_INTERNAL_ERROR
    - code: E_NETWORK_ERROR
    - code: E_PERMISSION_DENIED
    # ... 10 more errors
```

✅ **Right: Top 2-3 most common**
```yaml
error_contract:
  errors:
    - code: E_FILE_NOT_FOUND
      # ... full definition
    - code: E_INVALID_LINE
      # ... full definition
```

---

❌ **Wrong: Vague fix hints**
```yaml
user_fix_hint: "Fix the error"
user_fix_hint: "Check configuration"
user_fix_hint: "Try again"
```

✅ **Right: Specific actions**
```yaml
user_fix_hint: "Call debug.start first"
user_fix_hint: "Ensure file exists in workspace root"
user_fix_hint: "Increase timeout parameter to 60000ms"
```

---

❌ **Wrong: Missing error codes from top-level field**
```yaml
# Top-level errors field:
errors:
  - E_FILE_NOT_FOUND
  - E_INVALID_LINE

# Error contract:
error_contract:
  errors:
    - code: E_NO_SESSION  # Not in top-level errors!
```

✅ **Right: Use existing error codes**
```yaml
# Top-level errors field:
errors:
  - E_FILE_NOT_FOUND
  - E_INVALID_LINE

# Error contract:
error_contract:
  errors:
    - code: E_FILE_NOT_FOUND
    - code: E_INVALID_LINE
```

---

## Next Steps

After completing error contracts for all 35 tools:
- Run validation script to check error code references
- Review for consistency (similar tools should have similar errors)
- Test error scenarios with mock responses to validate assumptions

---

**References**:
- Main plan: [mcp-server-implementation-plan.md](../../mcp-server-implementation-plan.md)
- Prompting guide: [docs/rules/mcp-tool-prompting.md](../../../../rules/mcp-tool-prompting.md)
- Template: [metadata-template.yaml](./metadata-template.yaml)
- Relationships guide: [relationships-guide.md](./relationships-guide.md)
