# MCP Tool Metadata Prompting Guide

**Purpose**: Comprehensive guide for creating optimal MCP tool metadata that enables AI agents to reliably select tools, fill parameters correctly, respect prerequisites, and recover from errors.

**Audience**: Developers adding or enhancing VSC-Bridge tools for MCP exposure

**Status**: v1.0 - Based on deep research findings (2025-10-12)

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Complete Metadata Structure Reference](#2-complete-metadata-structure-reference)
3. [Four-Part When-To-Use Pattern](#3-four-part-when-to-use-pattern)
4. [Parameter Hints Best Practices](#4-parameter-hints-best-practices)
5. [Tool Relationships & Sequencing](#5-tool-relationships--sequencing)
6. [Error Contracts](#6-error-contracts)
7. [Safety Flags](#7-safety-flags)
8. [Validation Checklist](#8-validation-checklist)
9. [Anti-Patterns](#9-anti-patterns)
10. [Reference Examples](#10-reference-examples)

---

## 1. Introduction

### Why This Guide Exists

AI agents struggle with tool selection and parameter filling when metadata is incomplete, vague, or inconsistent. This guide provides evidence-based patterns from research on optimal MCP server design, specifically tailored for VSC-Bridge's debugging and development tools.

### Token Budget Philosophy

**Target**: 250-450 tokens per tool total (design guideline, not hard limit)

Why this range?
- Below 250 tokens: Insufficient guidance → agents guess → errors
- 250-450 tokens: Optimal balance → fast scanning + good decisions
- Above 450 tokens: Context bloat → slower selection + fatigue

**Important**: This is a design constraint to guide metadata authoring, not a strict validation requirement. Tools exceeding this range will generate warnings but won't fail the build. Use discretion for complex tools that require additional guidance.

**Breakdown by Section**:
- Description: 30-50 tokens (~15-25 words)
- when_to_use: 80-120 tokens (4-part structure)
- parameter_hints: 100-200 tokens (2-3 examples per param)
- relationships: 20-40 tokens
- error_contract: 40-80 tokens (top 2-3 errors)
- safety: 10-20 tokens

### Key Principles

1. **Contrastive over descriptive**: Focus on when to use vs. siblings, not just what it does
2. **Structure over prose**: Use predictable patterns agents can scan quickly
3. **Examples over descriptions**: Show don't tell (2-3 concrete examples)
4. **Prerequisites explicit**: Never assume agents infer state requirements
5. **Errors actionable**: Every error has a "how to fix" hint

---

## 2. Complete Metadata Structure Reference

### Full Template with All Fields

```yaml
# Example: tool.meta.yaml
alias: category.operation
name: Human Readable Name
category: category
description: Brief description for CLI
dangerOnly: false

params:
  param_name:
    type: string|number|boolean|enum|object
    required: true|false
    description: Parameter description
    # Additional constraints: min, max, values, resolve, etc.

response: action|query|waitable
result:
  field_name:
    type: string
    description: Result field description

errors:
  - E_ERROR_CODE_1
  - E_ERROR_CODE_2

cli:
  command: cli command
  description: CLI description
  examples:
    - Example CLI usage

# Enhanced P0+P1 MCP Metadata (Research-Based)
mcp:
  # P0: Must-Have Fields
  enabled: true
  tool: tool_name_override  # Optional: defaults to alias with dots→underscores
  description: "One-line contrastive summary"  # NOT same as top-level description
  timeout: 5000  # Milliseconds (override 30s default if needed)

  # P0: Tool Relationships (NEW - orchestration hints)
  relationships:
    requires: ["prerequisite.tool"]    # Tools that must run first (hard dependencies)
    recommended: ["helpful.tool"]      # Tools that should run first (soft suggestions)
    provides: ["outputIdentifier"]     # What this tool produces
    conflicts: ["incompatible.tool"]   # Tools that can't coexist

  # P0: Structured Error Contract (NEW - retryability guidance)
  error_contract:
    errors:
      - code: E_ERROR_CODE
        summary: "Human-readable error description"
        is_retryable: true|false
        user_fix_hint: "Specific action to resolve"

  # P0: Safety Flags (NEW - MCP spec annotations)
  safety:
    idempotent: true|false      # Same inputs → same result (safe to retry)
    read_only: true|false       # Doesn't modify program state
    destructive: false|true     # Dangerous operation (rare)

  # P1: LLM Guidance (Enhanced Structure)
  llm:
    # 4-Part When-To-Use Pattern (Use/Don't/Prereqs/Safety)
    when_to_use: |
      USE FOR:
      - Specific trigger condition 1
      - Specific trigger condition 2

      DON'T USE FOR:
      - Anti-trigger 1 (use sibling.tool instead)
      - Anti-trigger 2 (use alternative.tool instead)

      PREREQUISITES:
      - State requirement 1
      - State requirement 2

      SAFETY:
      - Safety note from flags (e.g., "Read-only, idempotent")

    # Enhanced Parameter Hints (with pitfalls)
    parameter_hints:
      param_name:
        description: "Brief, clear description"
        required: true|false
        examples:
          - "example1"
          - "example2"
          - "example3"  # 2-3 examples (not more)
        note: "Additional context or tip"
        language_specific:  # Only for language-dependent params
          python: "Python-specific guidance"
          javascript: "JavaScript-specific guidance"
        pitfalls:  # NEW - Common mistakes
          - "Don't do X"
          - "Avoid Y"
```

---

## 3. Four-Part When-To-Use Pattern

### Structure

```yaml
when_to_use: |
  USE FOR:
  - [3-5 specific triggers]

  DON'T USE FOR:
  - [2-4 anti-triggers pointing to siblings]

  PREREQUISITES:
  - [state or environment requirements]

  SAFETY:
  - [idempotent/read-only/destructive notes]
```

> **⚠️ IMPORTANT**: Use exact label text: `USE FOR:`, `DON'T USE FOR:`, `PREREQUISITES:`, `SAFETY:` (including colons and capitalization). The validation script checks for exact matches. Do not use variations like "Use for:", "Use For:", "USAGE:", etc.

### Examples by Complexity

#### Minimal (Simple, Unambiguous Tools)

```yaml
when_to_use: |
  USE FOR:
  - Pausing execution at a specific line

  DON'T USE FOR:
  - Watch expressions (use debug.watch_add)

  PREREQUISITES:
  - Active debug session

  SAFETY:
  - Read-only, idempotent
```

#### Moderate (Recommended Default)

```yaml
when_to_use: |
  USE FOR:
  - Pausing on a specific line
  - Setting conditional breakpoints (pause only when expression true)

  DON'T USE FOR:
  - Logging without pausing (use breakpoint.log instead)
  - Watch expressions (use debug.watch_add)

  PREREQUISITES:
  - Active debug session or planned session startup
  - Valid file path in workspace
  - Line must be executable code (not comments/blank)

  SAFETY:
  - Read-only to program state
  - Idempotent (setting same breakpoint twice is safe)
```

#### Detailed (Complex Tools with Foot-Guns)

```yaml
when_to_use: |
  USE FOR:
  - Precise pauses during Node/JS or Python debugging
  - Inspecting local state at race conditions
  - Conditional pauses based on runtime values

  DON'T USE FOR:
  - Log-only tracing (use breakpoint.log)
  - General code navigation (use editor.open)
  - Persistent debugging config (use launch.json)

  PREREQUISITES:
  - Active debug session
  - Source loaded by runtime
  - For conditionals: expression must parse in target language

  SAFETY:
  - Non-destructive
  - State-changing only in debugger, not user code
  - Idempotent (safe to set multiple times)

  ANTI-PATTERNS:
  - Setting breakpoints on comments/blank lines
  - Using Python syntax in JS session
```

### Token Budget by Level

- Minimal: ~60 tokens
- Moderate: ~100 tokens ✅ (recommended)
- Detailed: ~140 tokens (reserve for complex tools)

---

## 4. Parameter Hints Best Practices

### General Rules

1. **2-3 examples per parameter** (not more, not less)
2. **Show, don't tell**: Concrete examples > abstract descriptions
3. **Pitfalls for complex params**: Common mistakes agents make
4. **Language-specific only when needed**: Don't add noise

### Examples by Parameter Type

#### 1. Simple String (File Path)

```yaml
path:
  description: "Absolute or workspace-relative file path"
  required: true
  examples:
    - "src/main.js"
    - "/absolute/path/to/file.py"
  note: "Prefer workspace-relative paths for portability"
```

**Token cost**: ~30 tokens

#### 2. Number with Constraints

```yaml
line:
  description: "1-indexed line number where breakpoint should be set"
  required: true
  examples: ["10", "42", "100"]
  note: "First line is 1, not 0"
```

**Token cost**: ~20 tokens

#### 3. Complex Expression (Language-Dependent)

```yaml
condition:
  description: "Language-specific boolean expression evaluated at breakpoint"
  required: false
  examples:
    - "x > 10"              # Python/JS/C#
    - "user === null"       # JavaScript
    - "len(items) > 0"      # Python
  language_specific:
    python: "Use Python syntax (e.g., 'len(items) > 0')"
    javascript: "Use JavaScript syntax (e.g., 'items.length > 0')"
    csharp: "Use C# syntax (e.g., 'items.Count > 0')"
  pitfalls:
    - "Don't mix Python syntax in JS sessions or vice-versa"
    - "Keep expressions side-effect free (no assignments)"
```

**Token cost**: ~80 tokens

#### 4. Enum Parameter

```yaml
context:
  description: "Where to evaluate the expression"
  required: false
  examples: ["repl", "watch", "hover"]
  note: "Defaults to 'repl' if not specified"
```

**Token cost**: ~25 tokens

#### 5. Parameter with Prerequisites

```yaml
debugSessionId:
  description: "Active debug session identifier"
  required: false
  examples: ["3f1a2c1e-..."]
  prerequisites: ["A session must be started via debug.start"]
  note: "If omitted, agent should call debug.get_active_session"
```

**Token cost**: ~35 tokens

---

## 5. Tool Relationships & Sequencing

### Purpose

Help agents understand tool dependencies and orchestration patterns without hard-coding sequences.

### Structure

```yaml
relationships:
  requires: ["prerequisite.tool"]    # Must run before this tool (hard dependency)
  recommended: ["helpful.tool"]      # Should run before this tool (soft suggestion)
  provides: ["outputIdentifier"]     # What this tool produces
  conflicts: ["incompatible.tool"]   # Tools that can't coexist
```

**Difference between requires and recommended**:
- `requires`: Hard dependency. Tool will fail or behave incorrectly without this prerequisite.
- `recommended`: Soft suggestion. Tool works without it, but agents should consider running it first for better results.

### Examples

#### Simple Dependency

```yaml
# breakpoint.set
relationships:
  requires: ["debug.start"]  # Need a debug session first
  recommended: []            # No soft suggestions
  provides: []               # Doesn't produce reusable output
  conflicts: []              # Compatible with everything
```

#### Complex Orchestration

```yaml
# debug.evaluate
relationships:
  requires: ["debug.start"]           # Session must exist
  recommended: ["breakpoint.set"]     # Often useful to pause first
  provides: ["evaluationResult"]      # Can be used by other tools
  conflicts: ["debug.stop"]           # Can't evaluate after session ends
```

#### Multi-Tool Workflow Pattern

```yaml
# debug.start
relationships:
  requires: []                        # No prerequisites
  recommended: []                     # No soft suggestions
  provides: ["debugSessionId"]        # Produces session identifier
  conflicts: ["debug.start"]          # Don't start multiple sessions
```

### Token Budget

- Typical: 20-40 tokens per tool
- Leave arrays empty (not null) if no relationships

---

## 6. Error Contracts

### Purpose

Teach agents which errors are retryable and how to fix them, reducing wasted retry attempts and improving recovery.

### Structure

```yaml
error_contract:
  errors:
    - code: E_ERROR_CODE
      summary: "Human-readable error description"
      is_retryable: true|false
      user_fix_hint: "Specific action to resolve"
```

### Retryability Guidelines

**Retryable (true)**:
- Transient failures (E_TIMEOUT, E_NETWORK)
- Fixable user input (E_FILE_NOT_FOUND with correct path)
- State race conditions (E_NOT_READY → wait and retry)

**Not Retryable (false)**:
- Missing prerequisites (E_NO_SESSION → must create session first)
- Permanent failures (E_UNSUPPORTED_LANGUAGE)
- Invalid configurations (E_BAD_CONFIG → user must fix)

### Examples

#### Typical Error Set

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

    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start or debug.get_active_session first"
```

**Token cost**: ~70 tokens (3 errors)

#### Minimal Error Set

```yaml
error_contract:
  errors:
    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start first"
```

**Token cost**: ~25 tokens (1 error)

### Best Practices

1. **Cover top 2-3 errors** (don't enumerate everything)
2. **Prioritize user-fixable errors** over internal errors
3. **User_fix_hint must be actionable** (specific tool call or check)
4. **Map to existing error codes** from meta.yaml `errors` field

---

## 7. Safety Flags

### Purpose

Enable agents to understand operation safety characteristics without reading code or testing.

### Structure

```yaml
safety:
  idempotent: true|false      # Same inputs → same result
  read_only: true|false       # Doesn't modify program state
  destructive: false|true     # Dangerous operation
```

### Flag Definitions

#### idempotent

**True** if:
- Calling with same inputs multiple times produces same result
- No side effects accumulate
- Safe to retry on timeout

**Examples**:
- ✅ breakpoint.set (setting same BP twice = same result)
- ✅ debug.evaluate (reading variable = same value)
- ❌ debug.step_over (stepping twice ≠ stepping once)

#### read_only

**True** if:
- Tool only reads state, never modifies
- No user code changes
- Debugger state may change (e.g., scopes loaded)

**Examples**:
- ✅ debug.list_variables (query only)
- ✅ dap.logs (read protocol log)
- ❌ debug.set_variable (modifies runtime state)

#### destructive

**True** if:
- Operation is dangerous or irreversible
- Requires user confirmation in normal workflows
- Rare for debugging tools

**Examples**:
- ❌ Most debug tools (not destructive)
- ✅ util.restart_vscode (kills editor)
- ✅ debug.force_terminate (kills debug process)

### Common Patterns

```yaml
# Read-only query tool
safety:
  idempotent: true
  read_only: true
  destructive: false

# State-changing debug control
safety:
  idempotent: false  # Stepping twice ≠ stepping once
  read_only: false   # Changes debugger state
  destructive: false

# Dangerous utility
safety:
  idempotent: false
  read_only: false
  destructive: true
```

### Token Budget

- 10-20 tokens (minimal structure)

---

## 8. Validation Checklist

### Pre-Commit Checks

Before committing metadata changes, verify:

#### Structure
- [ ] `mcp.enabled` present (default true if omitted)
- [ ] `mcp.description` is one-line and contrastive
- [ ] `mcp.timeout` set for non-default timeouts
- [ ] `mcp.relationships` present (empty arrays if none)
- [ ] `mcp.error_contract` covers top 2-3 errors
- [ ] `mcp.safety` flags all set

#### when_to_use
- [ ] Follows 4-part structure (USE/DON'T/PREREQS/SAFETY)
- [ ] USE FOR has 2-5 specific triggers
- [ ] DON'T USE FOR points to sibling tools
- [ ] PREREQUISITES explicitly listed
- [ ] SAFETY reflects safety flags

#### parameter_hints
- [ ] Every parameter has description
- [ ] Every parameter has 2-3 examples
- [ ] Complex params have pitfalls array
- [ ] Language-specific hints where needed
- [ ] Required vs optional clearly marked

#### Token Budget
- [ ] Total metadata: 250-450 tokens
- [ ] Description: 30-50 tokens
- [ ] when_to_use: 80-120 tokens
- [ ] parameter_hints: 100-200 tokens
- [ ] relationships: 20-40 tokens
- [ ] error_contract: 40-80 tokens
- [ ] safety: 10-20 tokens

### Automated Validation

Run validation script:
```bash
node docs/plans/13-mcp-server-implementation/tasks/phase-6/validate-metadata.js
```

Checks:
- All required fields present
- Token counts within budget
- Example counts (2-3 per param)
- Structure compliance (4-part when_to_use)

---

## 9. Anti-Patterns

### DON'T: Vague Descriptions

❌ **Wrong**:
```yaml
description: "Manages breakpoints"
```

✅ **Right**:
```yaml
description: "Set or update a breakpoint at a line or condition"
```

### DON'T: Parameter Example Walls

❌ **Wrong**:
```yaml
path:
  examples:
    - "src/main.js"
    - "src/index.ts"
    - "src/app.py"
    - "src/server.go"
    - "src/Main.java"
    - "src/Program.cs"
    - "src/main.rs"
    - "src/app.rb"
    - "src/main.swift"
    - "src/index.php"
```

✅ **Right**:
```yaml
path:
  examples:
    - "src/main.js"
    - "/absolute/path/to/file.py"
```

### DON'T: Missing Anti-Triggers

❌ **Wrong**:
```yaml
when_to_use: |
  USE FOR:
  - Setting breakpoints
```

✅ **Right**:
```yaml
when_to_use: |
  USE FOR:
  - Setting breakpoints

  DON'T USE FOR:
  - Logging without pausing (use breakpoint.log)
  - Watch expressions (use debug.watch_add)
```

### DON'T: Language Confusion

❌ **Wrong**:
```yaml
condition:
  description: "Write a Python condition"
  examples: ["x > 10"]
```

✅ **Right**:
```yaml
condition:
  description: "Language-specific boolean expression"
  examples:
    - "x > 10"              # Python/JS/C#
    - "user === null"       # JavaScript
    - "len(items) > 0"      # Python
  language_specific:
    python: "Use Python syntax (e.g., 'len(items) > 0')"
    javascript: "Use JavaScript syntax (e.g., 'items.length > 0')"
```

### DON'T: Non-Actionable Errors

❌ **Wrong**:
```yaml
error_contract:
  errors:
    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Debug session required"
```

✅ **Right**:
```yaml
error_contract:
  errors:
    - code: E_NO_SESSION
      summary: "No active debug session"
      is_retryable: false
      user_fix_hint: "Call debug.start or debug.get_active_session first"
```

---

## 10. Reference Examples

### Complete Example: breakpoint.set

```yaml
alias: breakpoint.set
name: Set Breakpoint
category: breakpoint
description: Set a breakpoint with optional conditions
params:
  path:
    type: string
    required: true
    description: File path
  line:
    type: number
    required: true
    description: Line number
    min: 1
  condition:
    type: string
    required: false
    description: Conditional expression

response: action
errors:
  - E_FILE_NOT_FOUND
  - E_INVALID_LINE

mcp:
  enabled: true
  tool: add_breakpoint
  description: "Set a line or conditional breakpoint in active debug session"
  timeout: 5000

  relationships:
    requires: ["debug.start"]
    recommended: []
    provides: []
    conflicts: []

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

  safety:
    idempotent: true
    read_only: true
    destructive: false

  llm:
    when_to_use: |
      USE FOR:
      - Pausing execution at a specific line
      - Setting conditional breakpoints (only pause when expression true)

      DON'T USE FOR:
      - Logging without pausing (use breakpoint.log instead)
      - Watch expressions (use debug.watch_add)

      PREREQUISITES:
      - Active debug session or planned session startup
      - Valid file path in workspace
      - Line must be executable code (not comments/blank)

      SAFETY:
      - Read-only to program state
      - Idempotent (setting same breakpoint twice is safe)

    parameter_hints:
      path:
        description: "Absolute or workspace-relative file path"
        required: true
        examples:
          - "src/main.js"
          - "/absolute/path/to/file.py"
        note: "Prefer workspace-relative paths for portability"

      line:
        description: "1-indexed line number where breakpoint should be set"
        required: true
        examples: ["10", "42", "100"]
        note: "First line is 1, not 0"

      condition:
        description: "Language-specific boolean expression evaluated at breakpoint"
        required: false
        examples:
          - "x > 10"
          - "user === null"
          - "len(items) > 0"
        language_specific:
          python: "Use Python syntax (e.g., 'len(items) > 0')"
          javascript: "Use JavaScript syntax (e.g., 'items.length > 0')"
        pitfalls:
          - "Don't mix Python syntax in JS sessions or vice-versa"
          - "Keep expressions side-effect free (no assignments)"
```

**Token Budget Breakdown**:
- Description: ~15 tokens
- when_to_use: ~100 tokens
- parameter_hints: ~150 tokens
- relationships: ~10 tokens
- error_contract: ~60 tokens
- safety: ~10 tokens
- **Total: ~345 tokens** ✅

### Complete Example: debug.evaluate

```yaml
alias: debug.evaluate
name: Evaluate Expression
category: debug
description: Evaluate an expression in debug context
params:
  expression:
    type: string
    required: true
    description: Expression to evaluate
  context:
    type: enum
    required: false
    values: ["repl", "watch", "hover"]
    default: "repl"

response: query
errors:
  - E_NO_SESSION
  - E_INVALID_EXPRESSION

mcp:
  enabled: true
  description: "Evaluates an expression in the current debug session"
  timeout: 10000

  relationships:
    requires: ["debug.start"]
    recommended: []
    provides: ["evaluationResult"]
    conflicts: []

  error_contract:
    errors:
      - code: E_NO_SESSION
        summary: "No active debug session"
        is_retryable: false
        user_fix_hint: "Call debug.start or debug.get_active_session first"
      - code: E_INVALID_EXPRESSION
        summary: "Expression failed to parse"
        is_retryable: true
        user_fix_hint: "Match the runtime language; keep it a single expression"

  safety:
    idempotent: true
    read_only: true
    destructive: false

  llm:
    when_to_use: |
      USE FOR:
      - Reading variable values during debug session
      - Computing derived info from runtime state

      DON'T USE FOR:
      - Side-effecting code (use repl.evaluate if supported)
      - Multi-line statements (single expressions only)

      PREREQUISITES:
      - Active debug session
      - Execution paused at a frame
      - Expression must parse in target language

      SAFETY:
      - Read-only evaluation
      - Idempotent (safe to retry)

    parameter_hints:
      expression:
        description: "Language-specific expression in the paused frame's scope"
        required: true
        examples:
          - "user?.email"       # JS/TS
          - "sum(prices)"       # Python
        language_specific:
          javascript: "Avoid async; single expression only"
          python: "No imports; side effects discouraged"
        pitfalls:
          - "Don't use statements (if, for, etc.)"
          - "Keep expressions pure (no assignments)"

      context:
        description: "Where to evaluate the expression"
        required: false
        examples: ["repl", "watch", "hover"]
        note: "Defaults to 'repl' if not specified"
```

**Token Budget Breakdown**:
- Description: ~10 tokens
- when_to_use: ~90 tokens
- parameter_hints: ~120 tokens
- relationships: ~15 tokens
- error_contract: ~55 tokens
- safety: ~10 tokens
- **Total: ~300 tokens** ✅

---

## Appendix: Research Sources

This guide is based on:

1. **MCP Specification** (modelcontextprotocol.io) - Tools, annotations, pagination
2. **Anthropic Best Practices** - Writing tools for agents, clarity, strict data models
3. **Official MCP Servers** (filesystem, fetch, memory) - Real-world patterns
4. **Deep Research Session** (2025-10-12) - State-of-the-art MCP tool prompting

Key findings from research:
- Token budgets matter (250-450 optimal)
- 4-part when_to_use structure improves selection
- Relationships enable orchestration
- Error contracts reduce wasted retries
- Safety flags prevent dangerous operations

---

## Document History

- **v1.0** (2025-10-12): Initial version based on deep research findings
- Future updates: Track changes here

---

**Questions or feedback?** Update this guide based on real-world agent behavior and evolving MCP best practices.
