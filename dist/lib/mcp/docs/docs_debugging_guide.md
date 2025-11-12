---
tool_name: docs_debugging_guide
description: "Structured debugging workflow using VSC-Bridge MCP tools"
summary: "Hypothesis-driven debugging with breakpoint ladders and systematic inspection"
category: documentation
tags: ["debugging", "workflows", "best-practices"]
---

# VSC-Bridge Debugging Flow

**Use tests as execution harness. Use breakpoints to map cause and effect.**
Every investigation follows: **Hypothesis → Plan → Observe → Refine → Confirm**.

---

## Critical Setup

```
ALWAYS verify bridge is ready before ANY operation
→ vsc-bridge::bridge_status
If not connected, tell user to open VS Code with project
```

---

## The Investigation Cycle

### 1. Form a Hypothesis

Start with a theory about what's wrong.
Define what would prove/disprove it.
Plan where you'll pause to observe that behavior.

**Example:** *"The cache is reloaded between scans"* → expect line 179 to execute at least once.

### 2. Choose a Harness Test

Pick a single, reliable test that reproduces the issue.
The test drives execution; breakpoints do the inspection.
Start from the **test function definition line** (not the breakpoint line).

### 3. Build a Breakpoint Ladder

Place breakpoints along the logical path:

| Point | Purpose | Example |
|-------|---------|---------|
| **Entry** | Where process begins | Function entry, API call |
| **Decision** | First branch that changes flow | `if`/`switch` statements |
| **Mutation** | Where important variables change | Assignments, updates |
| **Boundary** | I/O, cache, or external hand-off | File read, API call, DB query |
| **Exit** | Where result is returned/stored | Return statement, result save |

**Critical:** Only set breakpoints on executable statements (not comments, empty lines, imports).

### 4. Run and Inspect

```
1. Clear old breakpoints
   → vsc-bridge::breakpoint_clear_project

2. Set breakpoint ladder
   → vsc-bridge::breakpoint_set at ENTRY_LINE
   → vsc-bridge::breakpoint_set at DECISION_LINE
   → vsc-bridge::breakpoint_set at MUTATION_LINE

3. Start from test definition
   → vsc-bridge::test_debug_single at TEST_START_LINE
   Use TEST_START_LINE (test definition), not breakpoint line

4. When paused, inspect variables
   → vsc-bridge::debug_list_variables scope="local"
   → vsc-bridge::debug_evaluate expression="repo.cached_graph"
   → vsc-bridge::debug_evaluate expression="id(graph)"

5. Step over to see post-state
   → vsc-bridge::debug_step_over
   → vsc-bridge::debug_evaluate expression="result"

6. Continue to next breakpoint
   → vsc-bridge::debug_continue
```

### 5. Iterate and Narrow

Like binary search:
- Each run shrinks uncertainty
- Move breakpoints earlier if you missed the change
- Move later if change already happened
- Compare observations until you isolate the cause

### 6. Validate and Conclude

Fix the issue, re-run the same test.
Confirm expected behavior.
Document: hypothesis, key breakpoints, confirming evidence.

---

## Quick Template

```
Hypothesis: <suspected cause>
Evidence to expect: <what should be true at each breakpoint>
Breakpoints: <entry, decision, mutation, boundary, exit>
Inspect: <variables or expressions to watch>
Result: <confirmed / refuted>
Next step: <move breakpoint, refine theory, or fix>
```

---

## Tool Selection

| Need | Tool |
|------|------|
| Start debugging test | vsc-bridge::test_debug_single - use test definition line |
| See all variables | vsc-bridge::debug_list_variables - set scope="local" |
| Inspect specific value | vsc-bridge::debug_evaluate - provide expression |
| Step through code | vsc-bridge::debug_step_over / step_into / step_out |
| Run to next breakpoint | vsc-bridge::debug_continue |
| Find symbols fast | vsc-bridge::search_symbol_search - before reading files |

---

## Language Syntax Reference

Match the language you're debugging:

| Language | Length | Access | Notes |
|----------|--------|--------|-------|
| **Python** | `len(items)` | `user.email` | Use in `debug_evaluate` |
| **JavaScript** | `items.length` | `user?.email` | Optional chaining safe |
| **C#** | `items.Count` | `user?.Email` | May pause at `[External Code]` (OK) |
| **Java** | `items.size()` | `user.getEmail()` | Getter methods |

---

## Critical Rules

### ✅ DO

1. **Clear breakpoints first** - vsc-bridge::breakpoint_clear_project before every session
2. **Check bridge status** - vsc-bridge::bridge_status before operations
3. **Use correct syntax** - Match language being debugged in expressions
4. **Inspect when paused** - Check variables before continuing
5. **Start from test line** - Use test definition line, not breakpoint line
6. **Step to see results** - Step over assignments before evaluating

### ❌ DON'T

1. **Skip clearing breakpoints** - Old breakpoints cause wrong pauses
2. **Continue without inspecting** - You'll learn nothing
3. **Set breakpoints on non-code** - Empty lines, comments, imports won't work
4. **Evaluate before assignment completes** - Set breakpoint AFTER line or step first
5. **Evaluate functions with side effects** - Prefer pure reads

---

## Breakpoint Gotchas

### Reading Variables After Assignment

**Critical:** Breakpoints trigger BEFORE the line executes.

**Option 1: Set breakpoint on NEXT line**
```
Code:
  Line 10: const result = calculate();
  Line 11: const doubled = result * 2;

Workflow:
  → vsc-bridge::breakpoint_set at line 11 (pause AFTER assignment)
  → vsc-bridge::test_debug_single at TEST_START
  → vsc-bridge::debug_evaluate expression="result" ✅ Works
```

**Option 2: Set on assignment line, then step**
```
Workflow:
  → vsc-bridge::breakpoint_set at line 10 (pause BEFORE assignment)
  → vsc-bridge::test_debug_single at TEST_START
  → vsc-bridge::debug_step_over (execute line 10)
  → vsc-bridge::debug_evaluate expression="result" ✅ Works
```

**⚠️ Scope Warning:** Stepping may exit current scope. Prefer Option 1 to stay in scope.

### Valid Breakpoint Locations

**✅ Works:** Variable assignments, function calls, return statements, control flow (`if`/`for`/`while`)
**❌ Fails:** Empty lines, comments, closing braces, imports/using statements

---

## Common Workflows

### Isolate Bug in Failing Test
```
→ vsc-bridge::breakpoint_clear_project
→ vsc-bridge::breakpoint_set at ENTRY_LINE in source file
→ vsc-bridge::breakpoint_set at SUSPICIOUS_LINE in source file
→ vsc-bridge::test_debug_single at TEST_START in test file

At each pause:
→ vsc-bridge::debug_list_variables scope="local"
→ vsc-bridge::debug_evaluate expression="problematic_var"
→ vsc-bridge::debug_step_into to trace into function
```

### Trace Through Unknown Code
```
→ vsc-bridge::breakpoint_clear_project
→ vsc-bridge::breakpoint_set at FUNCTION_START
→ vsc-bridge::test_debug_single at TEST_START

Step through line by line:
→ vsc-bridge::debug_step_over
→ vsc-bridge::debug_list_variables scope="local"
Repeat until you find the issue
```

---

## Advanced: Conditional Breakpoints

```
Only pause when condition true:
→ vsc-bridge::breakpoint_set with condition="user.id > 100"
  (use language-specific syntax)

Pause on Nth hit:
→ vsc-bridge::breakpoint_set with hitCondition="10"
  (pauses on 10th hit)

Log without pausing (logpoint):
→ vsc-bridge::breakpoint_set with logMessage="User: {user.id}"
  (logs and continues)
```

---

## Symbol Search: Fast Navigation

Use vsc-bridge::search_symbol_search to find classes, functions, methods **without reading files**.

```
Find specific symbol:
→ vsc-bridge::search_symbol_search query="UserService"

Get file outline:
→ vsc-bridge::search_symbol_search mode="document" path="src/services/auth.ts"

Find by type:
→ vsc-bridge::search_symbol_search query="test" kinds="Function,Method" limit=50
```

**Symbol Kinds:** `Class`, `Interface`, `Function`, `Method`, `Property`, `Variable`, `Constant`, `Enum`

**When to use:** Before reading files, to locate symbols instantly.

---

## Key Insights

1. **Use tests as harness** - Test drives execution, breakpoints inspect
2. **Start clean** - Clear breakpoints before every investigation
3. **Plan breakpoint ladder** - Entry → Decision → Mutation → Boundary → Exit
4. **Inspect when paused** - Variables reveal the truth
5. **Iterate systematically** - Move breakpoints like binary search
6. **Language matters** - Use correct syntax in `debug_evaluate`
7. **Use symbol search first** - Find code locations without reading files

---

## When to Use VSC-Bridge

**✅ USE FOR:**
- Debugging failing tests with unclear errors
- Understanding why functions return wrong values
- Tracing execution flow step-by-step
- Investigating state changes and mutations

**❌ DON'T USE FOR:**
- Static code analysis (read files instead)
- Simple test runs (use bash pytest/jest)
- Code editing (use file editing tools)
- Performance profiling (not a profiler)

---

**VSC-Bridge provides runtime visibility. Use it to explain WHY code behaves incorrectly, not just to run tests.**
