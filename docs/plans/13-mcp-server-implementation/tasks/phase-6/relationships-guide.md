# Tool Relationships Guide

**Purpose**: Document patterns for tool orchestration using the `relationships` metadata field.

**Version**: 1.0 (2025-10-12)

---

## Overview

The `relationships` field helps AI agents understand tool dependencies and orchestration patterns without hard-coding sequences. It enables agents to:
- Discover required prerequisites automatically
- Make intelligent suggestions about helpful preparatory tools
- Understand what outputs can be reused across tools
- Avoid conflicting operations

---

## Field Structure

```yaml
mcp:
  relationships:
    requires: []       # Hard dependencies (must run first)
    recommended: []    # Soft suggestions (should run first)
    provides: []       # Outputs this tool produces
    conflicts: []      # Incompatible tools
```

**Key Difference**:
- `requires`: Hard dependency. Tool **will fail** or behave incorrectly without this prerequisite.
- `recommended`: Soft suggestion. Tool **works without it**, but agents should consider running it first for better results.

---

## Common Patterns for VSC-Bridge Tools

### Pattern 1: Debug Session Dependency (Hard)

Most debug operations require an active session:

```yaml
# debug.evaluate
relationships:
  requires: ["debug.start"]
  recommended: []
  provides: []
  conflicts: []
```

**Apply to**: All `debug.*` tools except `debug.start` and `debug.status`

**Rationale**: These tools will fail with `E_NO_SESSION` if no session exists.

---

### Pattern 2: Breakpoint + Debug Workflow (Soft)

Tools that benefit from pausing first, but don't strictly require it:

```yaml
# debug.evaluate
relationships:
  requires: ["debug.start"]           # Must have session
  recommended: ["breakpoint.set"]     # Better with pause
  provides: ["evaluationResult"]
  conflicts: []
```

**Apply to**: `debug.evaluate`, `debug.get-variable`, `debug.list-variables`

**Rationale**: Agents can join mid-workflow if human already set breakpoints and started debugger.

---

### Pattern 3: Session Lifecycle Conflicts

Tools that can't coexist:

```yaml
# debug.start
relationships:
  requires: []
  recommended: []
  provides: ["debugSessionId"]
  conflicts: ["debug.start"]  # Don't start multiple sessions
```

**Apply to**: `debug.start` (conflicts with itself)

**Rationale**: VSC-Bridge only supports one active session at a time.

---

### Pattern 4: Independent Read-Only Tools

Tools with no prerequisites:

```yaml
# breakpoint.list
relationships:
  requires: []
  recommended: []
  provides: []
  conflicts: []
```

**Apply to**: `breakpoint.list`, `dap.logs`, `diagnostic.collect`

**Rationale**: These query tools work independently of session state.

---

### Pattern 5: Breakpoints Before Session

Setting breakpoints before starting session (recommended pattern):

```yaml
# debug.start
relationships:
  requires: []
  recommended: ["breakpoint.set"]  # Suggest setting BPs first
  provides: ["debugSessionId"]
  conflicts: ["debug.start"]
```

**Apply to**: `debug.start`

**Rationale**: Agents often want to set breakpoints before launching, but it's not required (can set during session too).

---

### Pattern 6: Stepping Operations (No Relationships)

Step operations don't reference each other:

```yaml
# debug.step-over
relationships:
  requires: ["debug.start"]  # Need session
  recommended: []            # No workflow hints
  provides: []               # Don't produce reusable output
  conflicts: []
```

**Apply to**: `debug.step-over`, `debug.step-into`, `debug.step-out`, `debug.continue`

**Rationale**: These are terminal actions that advance execution - no outputs to chain.

---

### Pattern 7: Variable Modification Chain

Reading before writing pattern:

```yaml
# debug.set-variable
relationships:
  requires: ["debug.start"]
  recommended: ["debug.get-variable"]  # Read before write
  provides: []
  conflicts: []
```

**Apply to**: `debug.set-variable`

**Rationale**: Agents might want to inspect current value before modifying.

---

## Decision Tree

```
Does the tool FAIL without prerequisite?
├─ YES → Add to `requires`
│         Example: debug.evaluate requires debug.start
│
└─ NO → Does prerequisite make tool MORE USEFUL?
    ├─ YES → Add to `recommended`
    │         Example: debug.start recommends breakpoint.set
    │
    └─ NO → Leave empty []
```

---

## Validation Rules

1. **Use tool aliases**: Reference tools by their script aliases (e.g., `debug.start`, not `debug_start`)
2. **Empty arrays, not null**: Use `[]` if no relationships, never omit the field
3. **No circular dependencies**: Tool A requires B, B requires A → validation error
4. **Conflicts must be mutual**: If A conflicts with B, B should conflict with A
5. **Self-conflicts allowed**: `debug.start` can conflict with `debug.start` (singleton pattern)

---

## Examples by Tool Category

### Breakpoint Tools

```yaml
# breakpoint.set
relationships:
  requires: []                    # Can set before or during session
  recommended: []
  provides: []
  conflicts: []

# breakpoint.clear-project
relationships:
  requires: []
  recommended: []
  provides: []
  conflicts: []
```

**Key**: Breakpoint operations are independent of session state.

---

### Debug Control Tools

```yaml
# debug.start
relationships:
  requires: []
  recommended: ["breakpoint.set"]
  provides: ["debugSessionId"]
  conflicts: ["debug.start"]

# debug.stop
relationships:
  requires: ["debug.start"]
  recommended: []
  provides: []
  conflicts: []

# debug.restart
relationships:
  requires: ["debug.start"]
  recommended: []
  provides: ["debugSessionId"]  # New session after restart
  conflicts: []
```

**Key**: Session lifecycle tools manage the `debugSessionId` identifier.

---

### Debug Query Tools

```yaml
# debug.evaluate
relationships:
  requires: ["debug.start"]
  recommended: ["breakpoint.set"]
  provides: ["evaluationResult"]
  conflicts: []

# debug.list-variables
relationships:
  requires: ["debug.start"]
  recommended: ["breakpoint.set"]  # Better with paused session
  provides: []
  conflicts: []

# debug.stack
relationships:
  requires: ["debug.start"]
  recommended: ["breakpoint.set"]  # Need paused state for meaningful stack
  provides: []
  conflicts: []
```

**Key**: Query tools benefit from paused sessions but might work in running sessions too.

---

### DAP Tools (Diagnostics)

```yaml
# dap.logs
relationships:
  requires: []                    # DAP logger is always available
  recommended: []
  provides: []
  conflicts: []

# dap.timeline
relationships:
  requires: ["debug.start"]       # Needs session events
  recommended: []
  provides: []
  conflicts: []
```

**Key**: DAP tools query protocol state, not user code state.

---

### Test Tools

```yaml
# test.debug-single
relationships:
  requires: []                    # Starts its own session
  recommended: []
  provides: ["debugSessionId"]
  conflicts: ["debug.start"]      # Manages its own session

# test.show-testing-ui
relationships:
  requires: []
  recommended: []
  provides: []
  conflicts: []
```

**Key**: Test tools are mostly independent workflows.

---

## Token Budget

**Typical cost**: 20-40 tokens per tool

Example breakdown:
```yaml
relationships:
  requires: ["debug.start"]           # ~5 tokens
  recommended: ["breakpoint.set"]     # ~5 tokens
  provides: ["evaluationResult"]      # ~5 tokens
  conflicts: []                       # ~2 tokens
# Total: ~17 tokens
```

Most VSC-Bridge tools will be on the lower end (10-20 tokens) since many have empty arrays.

---

## Common Mistakes

❌ **Wrong: Using MCP tool names instead of script aliases**
```yaml
requires: ["debug_start"]  # Wrong!
```

✅ **Right: Use script alias**
```yaml
requires: ["debug.start"]  # Correct
```

---

❌ **Wrong: Omitting fields**
```yaml
relationships:
  requires: ["debug.start"]
  # Missing recommended, provides, conflicts
```

✅ **Right: Include all fields with empty arrays**
```yaml
relationships:
  requires: ["debug.start"]
  recommended: []
  provides: []
  conflicts: []
```

---

❌ **Wrong: Overusing `requires` when `recommended` fits better**
```yaml
# debug.evaluate
requires: ["debug.start", "breakpoint.set"]  # Wrong! breakpoint.set is optional
```

✅ **Right: Hard vs soft dependencies**
```yaml
# debug.evaluate
requires: ["debug.start"]           # Must have session
recommended: ["breakpoint.set"]     # Better with pause
```

---

## Integration with Error Contract

Relationships and error contracts work together:

```yaml
relationships:
  requires: ["debug.start"]
  # ... other fields ...

error_contract:
  errors:
    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start first"  # Matches requires field!
```

The `user_fix_hint` should reference the tool listed in `requires`.

---

## Questions for Each Tool

When filling out relationships:

1. **Requires**: Will this tool fail or give meaningless results without X?
2. **Recommended**: Would an agent typically run Y before this tool for better results?
3. **Provides**: Does this tool produce an identifier/value that other tools can reference?
4. **Conflicts**: Can this tool run simultaneously with Z, or does it invalidate Z's state?

---

## Next Steps

After completing relationships for all 35 tools:
- Run validation script to check for circular dependencies
- Review for consistency (similar tools should have similar relationships)
- Test with agent workflows to validate assumptions

---

**References**:
- Main plan: [mcp-server-implementation-plan.md](../../mcp-server-implementation-plan.md)
- Prompting guide: [docs/rules/mcp-tool-prompting.md](../../../../rules/mcp-tool-prompting.md)
- Template: [metadata-template.yaml](./metadata-template.yaml)
