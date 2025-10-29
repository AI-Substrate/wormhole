# Safety Flags Guide

**Purpose**: Document patterns for safety annotations (idempotent, read_only, destructive) that enable agents to understand operation safety characteristics.

**Version**: 1.0 (2025-10-12)

---

## Overview

The `safety` field teaches AI agents about operation safety without requiring them to read code or test behavior. It enables agents to:
- Retry safely on timeout (idempotent operations)
- Know when operations won't modify state (read_only)
- Warn users before dangerous operations (destructive)

This is part of the MCP specification's safety annotations.

---

## Field Structure

```yaml
mcp:
  safety:
    idempotent: true|false      # Same inputs → same result
    read_only: true|false       # Doesn't modify program state
    destructive: false|true     # Dangerous operation (rare)
```

**All three flags are required** for every tool.

---

## Flag Definitions

### idempotent

**Question**: If I call this tool twice with the same inputs, do I get the same result?

**True** if:
- Calling with same inputs multiple times produces same result
- No side effects accumulate across calls
- Safe to retry on timeout without checking if first attempt succeeded

**False** if:
- Repeated calls have different effects (stepping, continuing execution)
- Side effects accumulate (logging to file, incrementing counters)
- Retrying changes state unpredictably

---

### read_only

**Question**: Does this tool modify program state or user code?

**True** if:
- Tool only reads state, never modifies
- No user code changes
- Query operations (list, get, inspect)
- Note: Debugger internal state changes (loading scopes) still count as read_only

**False** if:
- Modifies runtime state (set variable, advance execution)
- Changes debugger state (create/remove breakpoints)
- Writes to files or external systems

---

### destructive

**Question**: Is this operation dangerous, irreversible, or requires user confirmation?

**True** if:
- Operation is dangerous (kills processes, deletes data)
- Irreversible (can't undo)
- Requires user confirmation in normal workflows
- **Very rare for debugging tools**

**False** if:
- Normal operation
- Reversible or low-risk
- **Most VSC-Bridge tools should be false**

---

## Common Patterns for VSC-Bridge Tools

### Pattern 1: Read-Only Query (Most Common)

**Tools**: `debug.list-variables`, `debug.stack`, `debug.status`, `dap.logs`, `breakpoint.list`

```yaml
safety:
  idempotent: true       # Same query = same result
  read_only: true        # Only reads state
  destructive: false     # Normal query operation
```

**Examples**:
- `debug.stack` - Returns call stack (doesn't change execution)
- `debug.list-variables` - Returns variables (doesn't modify values)
- `dap.logs` - Returns protocol logs (read-only)
- `breakpoint.list` - Returns breakpoints (doesn't create/remove)

---

### Pattern 2: Idempotent State Change

**Tools**: `breakpoint.set`, `debug.set-variable`

```yaml
safety:
  idempotent: true       # Setting same BP twice = same result
  read_only: false       # Modifies debugger/runtime state
  destructive: false     # Normal operation
```

**Examples**:
- `breakpoint.set` - Setting same breakpoint twice is idempotent
- `debug.set-variable` - Setting variable to same value is idempotent

**Key**: Even though these modify state, they're idempotent because repeating the operation with same inputs produces the same final state.

---

### Pattern 3: Non-Idempotent Control Flow

**Tools**: `debug.step-over`, `debug.step-into`, `debug.step-out`, `debug.continue`

```yaml
safety:
  idempotent: false      # Stepping twice ≠ stepping once
  read_only: false       # Changes execution state
  destructive: false     # Normal debug operation
```

**Examples**:
- `debug.step-over` - Stepping twice moves twice (not idempotent)
- `debug.continue` - Each call advances to next breakpoint (different result)

**Key**: These operations advance execution, so calling twice has different effects than calling once.

---

### Pattern 4: Session Lifecycle (Non-Idempotent)

**Tools**: `debug.start`, `debug.stop`, `debug.restart`

```yaml
safety:
  idempotent: false      # Starting twice ≠ starting once
  read_only: false       # Creates/destroys sessions
  destructive: false     # Normal operation (though impactful)
```

**Examples**:
- `debug.start` - Creates session (calling twice might error or create second session)
- `debug.stop` - Ends session (calling twice might error - first stops, second fails)

**Key**: These manage session lifecycle, not idempotent because they change global state.

---

### Pattern 5: Destructive Utility (Rare!)

**Tools**: `util.restart-vscode`

```yaml
safety:
  idempotent: false      # Restarting multiple times has side effects
  read_only: false       # Kills editor process
  destructive: true      # ⚠️ Dangerous operation!
```

**Examples**:
- `util.restart-vscode` - Kills editor (loses unsaved work)

**Key**: Only use `destructive: true` for operations that could lose user data or require explicit confirmation.

---

### Pattern 6: Breakpoint Management (Mostly Idempotent)

**Tools**: `breakpoint.set`, `breakpoint.remove`, `breakpoint.clear-file`, `breakpoint.clear-project`

```yaml
# breakpoint.set
safety:
  idempotent: true       # Setting same BP twice = same result
  read_only: false       # Modifies breakpoint state
  destructive: false

# breakpoint.remove
safety:
  idempotent: true       # Removing same BP twice = same result (already gone)
  read_only: false       # Modifies breakpoint state
  destructive: false

# breakpoint.clear-project
safety:
  idempotent: true       # Clearing twice = already clear
  read_only: false       # Modifies breakpoint state
  destructive: false     # Not destructive (can re-add breakpoints)
```

**Key**: Breakpoint operations are generally idempotent (setting/removing same BP multiple times achieves same state).

---

## Decision Tree

### For idempotent

```
Does calling this tool twice with same inputs produce same result?
├─ YES → idempotent: true
│         Examples: breakpoint.set, debug.evaluate, debug.list-variables
│
└─ NO → idempotent: false
          Examples: debug.step-over, debug.continue, debug.start
```

### For read_only

```
Does this tool modify program state or user code?
├─ NO → read_only: true
│         Examples: debug.stack, dap.logs, breakpoint.list
│
└─ YES → read_only: false
          Examples: debug.step-over, breakpoint.set, debug.set-variable
```

### For destructive

```
Is this operation dangerous, irreversible, or does it risk data loss?
├─ YES → destructive: true
│         Examples: util.restart-vscode
│
└─ NO → destructive: false
          Examples: Almost all debug tools
```

---

## Examples by Tool Category

### Breakpoint Tools

| Tool | idempotent | read_only | destructive | Rationale |
|------|------------|-----------|-------------|-----------|
| `breakpoint.set` | true | false | false | Setting same BP twice = idempotent, modifies debugger state |
| `breakpoint.remove` | true | false | false | Removing same BP twice = idempotent |
| `breakpoint.clear-file` | true | false | false | Clearing twice = already clear |
| `breakpoint.clear-project` | true | false | false | Clearing twice = already clear |
| `breakpoint.list` | true | true | false | Query only, no modifications |

---

### Debug Control Tools

| Tool | idempotent | read_only | destructive | Rationale |
|------|------------|-----------|-------------|-----------|
| `debug.start` | false | false | false | Starting twice ≠ starting once (session lifecycle) |
| `debug.stop` | false | false | false | Stopping twice might error (first stops, second fails) |
| `debug.restart` | false | false | false | Restarting multiple times has side effects |
| `debug.continue` | false | false | false | Each call advances to next breakpoint (different result) |
| `debug.step-over` | false | false | false | Stepping twice moves twice |
| `debug.step-into` | false | false | false | Stepping twice moves twice |
| `debug.step-out` | false | false | false | Stepping twice moves twice |

---

### Debug Query Tools

| Tool | idempotent | read_only | destructive | Rationale |
|------|------------|-----------|-------------|-----------|
| `debug.evaluate` | true | true | false | Same expression = same result (assuming paused state), read-only |
| `debug.stack` | true | true | false | Query call stack, no modifications |
| `debug.scopes` | true | true | false | Query scopes, no modifications |
| `debug.status` | true | true | false | Query session status, no modifications |
| `debug.threads` | true | true | false | Query threads, no modifications |
| `debug.get-variable` | true | true | false | Query variable value, no modifications |
| `debug.list-variables` | true | true | false | Query variables list, no modifications |

---

### Debug State Modification Tools

| Tool | idempotent | read_only | destructive | Rationale |
|------|------------|-----------|-------------|-----------|
| `debug.set-variable` | true | false | false | Setting same value = idempotent, modifies runtime state |
| `debug.save-variable` | false | false | false | Saving multiple times might append/overwrite (not idempotent) |

---

### DAP Tools

| Tool | idempotent | read_only | destructive | Rationale |
|------|------------|-----------|-------------|-----------|
| `dap.logs` | true | true | false | Query protocol logs, read-only |
| `dap.search` | true | true | false | Search logs, read-only |
| `dap.summary` | true | true | false | Summarize logs, read-only |
| `dap.timeline` | true | true | false | Query event timeline, read-only |
| `dap.compare` | true | true | false | Compare sessions, read-only |
| `dap.exceptions` | true | true | false | Query exceptions, read-only |
| `dap.filter` | true | true | false | Filter logs, read-only |
| `dap.stats` | true | true | false | Query statistics, read-only |

---

### Test Tools

| Tool | idempotent | read_only | destructive | Rationale |
|------|------------|-----------|-------------|-----------|
| `test.debug-single` | false | false | false | Runs test (not idempotent if test has side effects) |
| `test.show-testing-ui` | false | false | false | Shows UI (not idempotent, creates UI state) |

---

### Utility Tools

| Tool | idempotent | read_only | destructive | Rationale |
|------|------------|-----------|-------------|-----------|
| `util.restart-vscode` | false | false | **true** | ⚠️ Kills editor, loses unsaved work |
| `diagnostic.collect` | true | true | false | Query diagnostics, read-only |

---

## Integration with when_to_use

Safety flags should be reflected in the SAFETY section of when_to_use:

```yaml
safety:
  idempotent: true
  read_only: true
  destructive: false

llm:
  when_to_use: |
    # ... USE FOR, DON'T USE FOR, PREREQUISITES ...

    SAFETY:
    - Read-only operation (no state changes)
    - Idempotent (safe to retry on timeout)
```

**Pattern**: Translate flags into human-readable safety notes.

---

## Common Mistakes

❌ **Wrong: Marking all tools as idempotent**
```yaml
# debug.step-over
safety:
  idempotent: true  # WRONG! Stepping twice ≠ stepping once
```

✅ **Right: Honest assessment**
```yaml
# debug.step-over
safety:
  idempotent: false  # Correct - stepping twice moves twice
```

---

❌ **Wrong: Marking breakpoint.set as read_only**
```yaml
# breakpoint.set
safety:
  read_only: true  # WRONG! Modifies debugger state
```

✅ **Right: Modifies debugger state**
```yaml
# breakpoint.set
safety:
  read_only: false  # Correct - changes breakpoint state
  idempotent: true  # But is idempotent!
```

---

❌ **Wrong: Marking normal tools as destructive**
```yaml
# debug.stop
safety:
  destructive: true  # WRONG! This is a normal operation
```

✅ **Right: Reserve destructive for truly dangerous ops**
```yaml
# debug.stop
safety:
  destructive: false  # Correct - normal session lifecycle

# util.restart-vscode
safety:
  destructive: true  # THIS is destructive (kills editor)
```

---

## Token Budget

**Cost**: 10-20 tokens (minimal structure)

Example:
```yaml
safety:
  idempotent: true      # ~2 tokens
  read_only: true       # ~2 tokens
  destructive: false    # ~2 tokens
# Total: ~6 tokens
```

YAML syntax overhead adds ~4-8 tokens, total ~10-14 tokens per tool.

---

## Validation Checklist

Before committing safety flags:

- [ ] All three flags present (idempotent, read_only, destructive)
- [ ] idempotent reflects true behavior (same inputs = same result?)
- [ ] read_only reflects true behavior (modifies state?)
- [ ] destructive is false for almost all tools (only truly dangerous ops)
- [ ] SAFETY section in when_to_use reflects flags
- [ ] Consistent with similar tools in same category

---

## Quick Reference Table

| Tool Pattern | idempotent | read_only | destructive | Example |
|--------------|------------|-----------|-------------|---------|
| Query tool | true | true | false | `debug.stack` |
| Set idempotent state | true | false | false | `breakpoint.set` |
| Control flow | false | false | false | `debug.step-over` |
| Session lifecycle | false | false | false | `debug.start` |
| Dangerous utility | false | false | **true** | `util.restart-vscode` |

---

## Next Steps

After completing safety flags for all 35 tools:
- Verify consistency within categories (all DAP tools likely read_only)
- Cross-check with when_to_use SAFETY sections
- Review destructive flags (should be very rare - only 1-2 tools max)

---

**References**:
- Main plan: [mcp-server-implementation-plan.md](../../mcp-server-implementation-plan.md)
- Prompting guide: [docs/rules/mcp-tool-prompting.md](../../../../rules/mcp-tool-prompting.md)
- Template: [metadata-template.yaml](./metadata-template.yaml)
- MCP Spec: Safety annotations section
