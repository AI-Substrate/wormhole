# Timeout Guidelines

**Purpose**: Document recommended timeout values for VSC-Bridge tools by operation type to address Critical Discovery 04.

**Version**: 1.0 (2025-10-12)

---

## Overview

The `mcp.timeout` field allows per-tool timeout overrides to handle operations with vastly different execution times. This is critical because:
- Default 30s timeout is too short for test discovery and debug session startup
- Default 30s timeout is unnecessarily long for quick breakpoint operations
- Agents need accurate timeout expectations to avoid false negatives

**Critical Discovery 04**: Per-tool timeout metadata enables proper handling of long-running operations like `test.debug-single` (60s+) and `debug.wait-for-hit` (90s+).

---

## Field Structure

```yaml
mcp:
  timeout: 5000  # Milliseconds
```

**When to set**:
- Omit field if default 30000ms (30 seconds) is appropriate
- Set explicit value for operations significantly faster or slower than 30s

**Units**: Milliseconds (1000 = 1 second)

---

## Timeout Categories

### Category 1: Quick Operations (5-10 seconds)

**Typical operations**:
- Breakpoint management (set, remove, list, clear)
- Simple queries (stack, scopes, threads, status)
- Simple variable reads

**Recommended timeout**: 5000-10000ms

**Rationale**: These operations are nearly instantaneous (< 500ms) but we add buffer for IPC overhead and potential VS Code lag.

**Tools**:
- `breakpoint.set` - 5000ms
- `breakpoint.remove` - 5000ms
- `breakpoint.clear-file` - 5000ms
- `breakpoint.clear-project` - 5000ms
- `breakpoint.list` - 5000ms
- `debug.stack` - 5000ms
- `debug.scopes` - 5000ms
- `debug.status` - 5000ms
- `debug.threads` - 5000ms

---

### Category 2: Medium Operations (10-30 seconds)

**Typical operations**:
- Expression evaluation (complex expressions)
- Variable listing (many variables)
- DAP log queries (large datasets)
- Control flow operations (step, continue)

**Recommended timeout**: 10000-30000ms (or use default 30000ms)

**Rationale**: These operations involve runtime evaluation or data processing but complete within normal timeframes.

**Tools**:
- `debug.evaluate` - 10000ms (expressions can be complex)
- `debug.get-variable` - 10000ms (might traverse large objects)
- `debug.list-variables` - 10000ms (many variables to serialize)
- `debug.set-variable` - 10000ms (runtime modification)
- `debug.step-over` - 10000ms (next statement might take time)
- `debug.step-into` - 10000ms
- `debug.step-out` - 10000ms
- `debug.continue` - 10000ms (until next breakpoint)
- `dap.timeline` - 20000ms (process many events)
- `diagnostic.collect` - 30000ms (collect from all sources)

---

### Category 3: Long Operations (30-60 seconds)

**Typical operations**:
- Debug session startup (launching runtime, loading symbols)
- Test discovery and execution
- Session restart (stop + start)

**Recommended timeout**: 30000-60000ms

**Rationale**: These operations involve spawning processes, loading symbols, and initializing runtimes.

**Tools**:
- `debug.start` - 60000ms (launch configuration might be slow)
- `debug.restart` - 60000ms (stop + start cycle)
- `debug.stop` - 15000ms (cleanup can take time)
- `test.debug-single` - 60000ms (test discovery + session startup)
- `dap.search` - 30000ms (search large log files)
- `dap.summary` - 30000ms (process entire session)
- `dap.compare` - 30000ms (compare two sessions)

---

### Category 4: Very Long Operations (60-90+ seconds)

**Typical operations**:
- Waiting for breakpoint hits (user interaction dependent)
- Long-running tests
- UI interactions

**Recommended timeout**: 60000-90000ms

**Rationale**: These operations depend on user actions or test execution time and might legitimately take minutes.

**Tools**:
- `debug.wait-for-hit` - 90000ms (waiting for execution to hit breakpoint)
- `test.show-testing-ui` - 60000ms (UI might load slowly)

---

## Timeout Decision Tree

```
How long does this operation typically take?

├─ < 1 second → timeout: 5000ms (5s)
│   Example: breakpoint.set, debug.stack
│
├─ 1-5 seconds → timeout: 10000ms (10s)
│   Example: debug.evaluate, debug.list-variables
│
├─ 5-15 seconds → timeout: 30000ms (30s) [DEFAULT - can omit]
│   Example: dap.logs, debug.save-variable
│
├─ 15-45 seconds → timeout: 60000ms (60s)
│   Example: debug.start, test.debug-single
│
└─ > 45 seconds → timeout: 90000ms (90s)
    Example: debug.wait-for-hit
```

---

## Complete Tool Timeout Reference

### Breakpoint Tools (5s - All Quick)

| Tool | Timeout | Rationale |
|------|---------|-----------|
| `breakpoint.set` | 5000ms | Quick IPC command |
| `breakpoint.remove` | 5000ms | Quick IPC command |
| `breakpoint.clear-file` | 5000ms | Clear single file |
| `breakpoint.clear-project` | 5000ms | Clear all (still fast) |
| `breakpoint.list` | 5000ms | Query operation |

---

### Debug Control Tools (Mixed)

| Tool | Timeout | Rationale |
|------|---------|-----------|
| `debug.start` | 60000ms | Launch runtime, load symbols |
| `debug.stop` | 15000ms | Cleanup can take time |
| `debug.restart` | 60000ms | Stop + start cycle |
| `debug.continue` | 10000ms | Resume until next breakpoint |
| `debug.step-over` | 10000ms | Execute next statement |
| `debug.step-into` | 10000ms | Step into function |
| `debug.step-out` | 10000ms | Step out of function |
| `debug.wait-for-hit` | 90000ms | **Very long** - waiting for execution |

---

### Debug Query Tools (5-10s - Mostly Quick)

| Tool | Timeout | Rationale |
|------|---------|-----------|
| `debug.evaluate` | 10000ms | Expression might be complex |
| `debug.stack` | 5000ms | Query call stack |
| `debug.scopes` | 5000ms | Query scopes |
| `debug.status` | 5000ms | Query session status |
| `debug.threads` | 5000ms | Query threads |
| `debug.get-variable` | 10000ms | Might traverse large objects |
| `debug.list-variables` | 10000ms | Serialize many variables |
| `debug.set-variable` | 10000ms | Runtime modification |
| `debug.save-variable` | 30000ms | Serialize to file |
| `debug.tracker` | 30000ms | Track variable changes |

---

### DAP Tools (10-30s - Data Processing)

| Tool | Timeout | Rationale |
|------|---------|-----------|
| `dap.logs` | 30000ms | Retrieve log buffer |
| `dap.search` | 30000ms | Search large logs |
| `dap.summary` | 30000ms | Process entire session |
| `dap.timeline` | 20000ms | Process events |
| `dap.compare` | 30000ms | Compare two sessions |
| `dap.exceptions` | 30000ms | Query exception events |
| `dap.filter` | 30000ms | Filter logs |
| `dap.stats` | 30000ms | Calculate statistics |

---

### Test Tools (60s - Long Operations)

| Tool | Timeout | Rationale |
|------|---------|-----------|
| `test.debug-single` | 60000ms | Test discovery + session startup |
| `test.show-testing-ui` | 60000ms | UI might load slowly |

---

### Utility Tools (Mixed)

| Tool | Timeout | Rationale |
|------|---------|-----------|
| `util.restart-vscode` | 15000ms | VS Code shutdown/startup |
| `diagnostic.collect` | 30000ms | Collect from all sources |

---

## Default Timeout Behavior

**In MCP Server**:
```typescript
const timeout = tool.timeout ?? options.timeout ?? 30000;
```

Timeout precedence:
1. Tool-specific `mcp.timeout` field (highest priority)
2. CLI `--timeout` flag
3. Hard-coded default: 30000ms

**When to omit timeout field**:
- Operation typically completes in 5-30 seconds
- No strong reason to deviate from default
- Example: `dap.logs` (usually fast, but might take 30s if large)

**When to set explicit timeout**:
- Operation consistently faster than 10s → set lower timeout (fail fast)
- Operation consistently slower than 30s → set higher timeout (avoid false failures)

---

## Timeout and Retryability

Timeout errors should be retryable in most cases:

```yaml
mcp:
  timeout: 60000  # Tool-specific timeout

  error_contract:
    errors:
      - code: E_TIMEOUT
        summary: "Operation timed out"
        is_retryable: true
        user_fix_hint: "Increase timeout parameter or simplify operation"
```

**Pattern**: Tools with high timeouts (60s+) should document E_TIMEOUT in error_contract.

---

## Testing Timeout Values

**Validation approach**:
1. Manual testing with mock responses
2. Measure actual operation times in development
3. Add 2-3x buffer for slow machines / CI environments
4. Monitor timeout errors in production usage

**Adjustment strategy**:
- If timeout errors > 5% of calls → increase timeout
- If operations complete in < 20% of timeout → consider lowering

---

## Common Mistakes

❌ **Wrong: Using same timeout for all tools**
```yaml
# Every tool
timeout: 30000  # Not optimal!
```

✅ **Right: Tailored timeouts by operation**
```yaml
# breakpoint.set
timeout: 5000   # Quick

# debug.start
timeout: 60000  # Slow

# debug.wait-for-hit
timeout: 90000  # Very slow
```

---

❌ **Wrong: Too aggressive timeouts**
```yaml
# debug.start
timeout: 5000  # Will fail on slower machines!
```

✅ **Right: Conservative with buffer**
```yaml
# debug.start
timeout: 60000  # Generous buffer for slow launches
```

---

❌ **Wrong: Setting timeout for default-range operations**
```yaml
# dap.logs
timeout: 30000  # Unnecessary - this is the default
```

✅ **Right: Omit when default is appropriate**
```yaml
# dap.logs
# timeout: (omitted - uses default 30000)
```

---

## Integration with Error Contract

Tools with non-default timeouts should document E_TIMEOUT:

```yaml
mcp:
  timeout: 90000  # Very long operation

  error_contract:
    errors:
      - code: E_TIMEOUT
        summary: "Operation timed out waiting for breakpoint hit"
        is_retryable: true
        user_fix_hint: "Increase timeout parameter to 120000ms or ensure execution reaches breakpoint"
```

---

## Future Adjustments

**Monitor these metrics post-launch**:
- Timeout error rates per tool
- Average execution times per tool
- 95th percentile execution times

**Adjustment triggers**:
- Timeout errors > 5% → increase timeout
- Average time < 20% of timeout → consider lowering
- User feedback about slow operations

---

## Summary Table (Quick Reference)

| Category | Timeout Range | Example Operations | Token Cost |
|----------|---------------|-------------------|------------|
| Quick | 5-10s | Breakpoint ops, simple queries | ~5 tokens |
| Medium | 10-30s | Evaluation, variable ops | Omit (default) |
| Long | 30-60s | Session start, test execution | ~5 tokens |
| Very Long | 60-90s | Wait for hit, UI operations | ~5 tokens |

**Token budget impact**: Adding timeout field costs ~5 tokens per tool.

---

**References**:
- Critical Discovery 04 in main plan
- Bridge adapter timeout handling: [cli/src/lib/mcp/bridge-adapter.ts](../../../../cli/src/lib/mcp/bridge-adapter.ts)
- Server timeout extraction: [cli/src/lib/mcp/server.ts](../../../../cli/src/lib/mcp/server.ts)
