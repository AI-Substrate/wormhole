# Script Naming Convention

## Overview

All VSC-Bridge scripts must follow a standardized naming convention to ensure consistency, discoverability, and maintainability across the codebase.

## Standard Pattern: `<area>.<thing>`

### Structure

```
<area>.<thing>
```

Where:
- **`<area>`**: The category or domain of functionality (singular form)
- **`<thing>`**: The action or noun describing what the script does

### Area Naming Rules

1. **Use short, memorable prefixes**: `bp`, `debug`, `dap`, `diag`
2. **Keep areas singular** unless naturally plural (e.g., `tests`)
3. **Align with directory structure**: Area prefix must match the directory name
4. **Use lowercase**: No capitals or special characters

**Valid area prefixes:**
- `bp` - Breakpoint operations (directory: `breakpoint/`)
- `debug` - Debug session operations (directory: `debug/`)
- `dap` - Debug Adapter Protocol queries (directory: `dap/`)
- `diag` - Diagnostics (directory: `diag/`)
- `tests` - Test utilities (directory: `tests/`)

### Thing Naming Rules

1. **Use kebab-case** for multi-word names: `step-into`, `list-variables`, `wait-for-hit`
2. **Single words are OK**: `continue`, `stack`, `status`, `set`, `get`
3. **Use descriptive verbs or nouns**: Actions should use verbs, queries should use nouns
4. **Pluralization**:
   - Plural for collections: `threads`, `logs`, `exceptions`
   - Singular for single items: `stack`, `status`, `summary`
   - Verbs for actions: `set`, `get`, `list`, `clear`

### Case Convention

**ALWAYS use kebab-case for multi-word aliases**

✅ **Correct:**
- `debug.step-into`
- `debug.wait-for-hit`
- `debug.list-variables`
- `bp.clear-file`

❌ **Incorrect:**
- `debug.stepInto` (camelCase)
- `debug.waitForHit` (camelCase)
- `debug.list_variables` (snake_case)
- `bp.clearFile` (camelCase)

## Examples

### Good Names

| Alias | Pattern | Explanation |
|-------|---------|-------------|
| `bp.set` | area.verb | Breakpoint area, set action |
| `bp.clear.file` | area.verb.scope | Hierarchical action (clear breakpoints in file) |
| `debug.step-into` | area.verb-preposition | Debug area, compound action |
| `debug.threads` | area.plural-noun | Debug area, collection query |
| `debug.stack` | area.noun | Debug area, single item query |
| `dap.summary` | area.noun | DAP area, aggregate query |
| `dap.logs` | area.plural-noun | DAP area, collection query |
| `tests.debug-wait` | area.verb-noun | Tests area, test utility |

### Anti-Patterns to Avoid

| Bad Alias | Problem | Correct Version |
|-----------|---------|-----------------|
| `dbg.stop` | Inconsistent prefix | `debug.stop` |
| `debug.waitForHit` | camelCase | `debug.wait-for-hit` |
| `test.debug-wait` | Wrong category prefix | `tests.debug-wait` |
| `breakpoint.set` | Full word instead of abbreviation | `bp.set` |
| `debug.list_variables` | snake_case | `debug.list-variables` |

## File Structure Requirements

### Directory Layout

```
extension/src/vsc-scripts/
├── breakpoint/
│   ├── set.js
│   ├── set.meta.yaml          # alias: bp.set
│   ├── list.js
│   └── list.meta.yaml          # alias: bp.list
├── debug/
│   ├── start.js
│   ├── start.meta.yaml         # alias: debug.start
│   ├── step-into.js
│   └── step-into.meta.yaml     # alias: debug.step-into
└── dap/
    ├── summary.js
    └── summary.meta.yaml        # alias: dap.summary
```

### Required Files

Every script **MUST** have two files:

1. **`<name>.js`** - The script implementation
2. **`<name>.meta.yaml`** - The metadata file containing the alias

**The alias in the meta.yaml file determines the user-facing command name.**

### Meta File Structure

```yaml
alias: <area>.<thing>           # MUST follow naming convention
name: Human Readable Name
category: <area>                # MUST match directory name
description: What this script does
dangerOnly: false
params:
  # parameter definitions
response: query | action | waitable
result:
  # result schema
errors:
  - ERROR_CODE_1
  - ERROR_CODE_2
```

**Critical rules:**
- `alias` field MUST use the `<area>.<thing>` pattern
- `category` field MUST match the directory name
- `category` should be singular (except `tests`)

## Prefix Consistency

### ✅ Correct: Single Prefix Per Area

All scripts in the `debug/` directory use the `debug.*` prefix:
- `debug.start`
- `debug.stop`
- `debug.continue`
- `debug.step-into`
- `debug.step-over`
- `debug.threads`

### ❌ Incorrect: Mixed Prefixes

Do NOT mix prefixes for the same area:
- ❌ `debug.start` + `dbg.stop` (inconsistent)
- ❌ `breakpoint.set` + `bp.list` (inconsistent)

**Rule:** Pick ONE prefix per area and use it consistently for all scripts in that area.

## Validation Checklist

Before creating or renaming a script, verify:

- [ ] Alias follows `<area>.<thing>` pattern
- [ ] Area prefix matches directory name
- [ ] Multi-word names use kebab-case (no camelCase)
- [ ] Area prefix is consistent with other scripts in the same directory
- [ ] Category in meta.yaml matches directory name
- [ ] Both `.js` and `.meta.yaml` files exist
- [ ] Alias is unique (no conflicts)

## Common Patterns

### Hierarchical Actions

For related actions, use dot notation to create hierarchy:

```
bp.clear.file       # Clear breakpoints in a file
bp.clear.project    # Clear breakpoints in entire project
```

### Step Commands

```
debug.step-into     # Step into function
debug.step-over     # Step over line
debug.step-out      # Step out of function
```

### Variable Operations

```
debug.get-variable      # Get a single variable
debug.list-variables    # List all variables
debug.set-variable      # Set a variable value
```

### DAP Queries

```
dap.summary         # High-level summary
dap.logs            # Detailed logs
dap.timeline        # Chronological view
dap.stats           # Statistical analysis
```

## Migration Guide

If you need to rename existing scripts:

1. **Update meta.yaml**: Change the `alias` field
2. **Update documentation**: Search for references in `/docs/`
3. **Rebuild**: Run `just build` to regenerate manifests
4. **Test**: Verify the new alias works with `vscb script run <new-alias>`
5. **Consider backward compatibility**: Old aliases can be deprecated gradually

## Summary

**Golden Rules:**
1. Always use `<area>.<thing>` pattern
2. Always use kebab-case for multi-word names
3. Area prefix must match directory name
4. Be consistent within each area
5. Every script needs both `.js` and `.meta.yaml` files
