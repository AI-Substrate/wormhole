# How to Add a New Script to VSC-Bridge

**A comprehensive, step-by-step guide based on actual implementation experience.**

This guide documents the complete workflow for adding new scripts to vsc-bridge, from rapid prototyping with dynamic scripts to production-ready built-in scripts with full MCP integration. Based on the real implementation of the `search.symbol-search` script.

---

## Table of Contents

1. [Overview](#overview)
2. [When to Add a New Script](#when-to-add-a-new-script)
3. [Phase 1: Rapid Prototyping with Dynamic Scripts](#phase-1-rapid-prototyping-with-dynamic-scripts)
4. [Phase 2: Creating a Built-in Script](#phase-2-creating-a-built-in-script)
5. [Build Process](#build-process)
6. [Testing the Built-in Script](#testing-the-built-in-script)
7. [MCP Exposure Verification](#mcp-exposure-verification)
8. [Complete Checklist](#complete-checklist)
9. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
10. [Best Practices](#best-practices)
11. [Reference Examples](#reference-examples)

---

## Overview

### The Two-Phase Approach

VSC-Bridge uses a two-phase development workflow:

1. **Phase 1: Dynamic Script (Prototype)** - Fast iteration without compilation
2. **Phase 2: Built-in Script (Production)** - Full integration with manifest, MCP, and CLI

**Expected Time Investment:**
- Phase 1 (Prototyping): 30-60 minutes
- Phase 2 (Production): 2-3 hours (including tests and documentation)

### Key Principles

- **Iterate Fast**: Use dynamic scripts to experiment with VS Code APIs without waiting for builds
- **Validate Early**: Test your script works before committing to the full build process
- **Follow Patterns**: Use existing scripts as templates for consistency
- **Test Thoroughly**: Validate via Extension Host, CLI, and MCP integration tests

---

## When to Add a New Script

### Add a New Script When:

- ✅ You need to expose a VS Code API capability to AI agents
- ✅ The functionality requires VS Code extension context (workspace, editor, debugger)
- ✅ You want to automate a debugging or development workflow
- ✅ The feature would be useful across multiple projects/languages

### Use Existing Scripts When:

- ❌ The functionality already exists (check `vscb script list`)
- ❌ It can be done with a simple CLI command
- ❌ It doesn't require VS Code's extension APIs

### Examples of Good Script Candidates:

- Symbol search (navigate to classes, functions)
- Find references/definitions (code navigation)
- Workspace-wide search and replace
- Test discovery and execution
- Debug session management
- Code formatting and linting

---

## Phase 1: Rapid Prototyping with Dynamic Scripts

Dynamic scripts run without compilation, enabling **hot-reload development** for rapid iteration.

### Step 1: Create Dynamic Script File

Create your script in the `scratch/` directory (gitignored) or `scripts/sample/dynamic/`:

```bash
# Create in scratch for experiments
touch scratch/my-feature-experiment.js

# Or in samples for permanent examples
touch scripts/sample/dynamic/my-feature.js
```

### Step 2: Write Dynamic Script Code

**Template structure** (`scratch/my-feature-experiment.js`):

```javascript
/**
 * My Feature Experiment
 *
 * Experiments with VS Code API to test [feature description].
 *
 * Usage:
 *   vscb script run --file scratch/my-feature-experiment.js \
 *     --param query="example" --param mode="workspace"
 *
 * Params:
 *   - query (string): Search query
 *   - mode (string): "workspace" or "document"
 *   - limit (number): Max results (default: 100)
 */

module.exports = async function(bridgeContext, params) {
  // 1. Access VS Code API through injected context
  const vscode = bridgeContext.vscode;

  // CRITICAL: Never use require('vscode') - won't work in VM context
  // CRITICAL: Always use bridgeContext.vscode

  // 2. Extract parameters with defaults
  const {
    query = '',
    mode = 'workspace',
    limit = 100
  } = params;

  // 3. Call VS Code APIs
  try {
    let results = [];

    if (mode === 'workspace') {
      // Workspace-wide operation
      results = await vscode.commands.executeCommand(
        'vscode.executeWorkspaceSymbolProvider',
        query
      ) || [];
    } else if (mode === 'document') {
      // Document-specific operation
      const uri = vscode.Uri.file(params.path);
      results = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        uri
      ) || [];
    }

    // 4. Process results
    const limited = results.slice(0, limit);

    // 5. Optional: Log to output channel
    if (bridgeContext.outputChannel) {
      bridgeContext.outputChannel.appendLine(
        `[my-feature] Found ${results.length} results`
      );
    }

    // 6. Return structured data
    return {
      success: true,
      mode,
      query,
      total: results.length,
      returned: limited.length,
      results: limited.map(r => formatResult(r))
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
};

/**
 * Helper function to format results
 */
function formatResult(item) {
  return {
    name: item.name,
    // ... format as needed
  };
}
```

### Step 3: Test with Extension Host

**Launch Extension Host:**

```bash
# From project root
cd /workspaces/vsc-bridge-devcontainer

# Launch Extension Host (opens test/ workspace)
vscb script run debug.start --param launch="Run Extension"

# Wait ~10 seconds for initialization
```

**Run your dynamic script:**

```bash
# From test/ workspace (where .vsc-bridge/ exists)
cd test

# Run dynamic script
vscb script run --file ../scratch/my-feature-experiment.js \
  --param query="example" \
  --param mode="workspace"
```

### Step 4: Iterate Rapidly (Hot Reload)

The power of dynamic scripts is **instant feedback**:

```bash
# 1. Edit scratch/my-feature-experiment.js (add logging, change logic)
# 2. Save file
# 3. Run again immediately (no build needed!)
vscb script run --file ../scratch/my-feature-experiment.js --param query="test"

# See changes instantly!
```

**Example hot-reload iteration:**

```javascript
// Version 1: Basic implementation
console.log('Executing search...');
const results = await vscode.commands.executeCommand(...);
return { results };

// Save and test
// → Output: Works but no details

// Version 2: Add logging
console.log(`Searching for: ${query}`);
const results = await vscode.commands.executeCommand(...);
console.log(`Found ${results.length} results`);
return { results, total: results.length };

// Save and test
// → Output: Now shows count!

// Version 3: Add filtering
console.log(`Searching for: ${query} (limit: ${limit})`);
const results = await vscode.commands.executeCommand(...);
const filtered = results.slice(0, limit);
console.log(`Found ${results.length} results, returning ${filtered.length}`);
return { results: filtered, total: results.length, truncated: results.length > limit };

// Save and test
// → Output: Perfect! Ready to convert to built-in.
```

### Step 5: Document Findings

Create a research document capturing what you learned:

```bash
touch docs/research/my-feature-findings.md
```

**Example structure** (see `/workspaces/vsc-bridge-devcontainer/docs/research/symbol-search-findings.md`):

```markdown
# My Feature - Research Findings

**Date**: 2025-10-20
**Script**: `scratch/my-feature-experiment.js`

## Summary
What the script does and key learnings.

## VS Code APIs Used
- `vscode.commands.executeCommand('...')`
- What it does, parameters, return type

## Test Results
- Performance: ~XXXms
- Languages tested: TypeScript, Python, etc.
- Edge cases discovered

## Next Steps
Ready for built-in implementation.
```

### Step 6: Graduate to Built-in

Once your dynamic script works reliably, proceed to Phase 2.

**Signs you're ready:**
- ✅ Script works consistently across test cases
- ✅ You understand the VS Code APIs needed
- ✅ You know what parameters and validation are needed
- ✅ You've documented findings

---

## Phase 2: Creating a Built-in Script

Built-in scripts are compiled into the extension with full integration: CLI commands, MCP tools, schema validation, and auto-generated documentation.

### Step 1: Choose Category

Scripts are organized by category in `/workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/`:

**Existing categories:**
- `breakpoint/` - Breakpoint management
- `debug/` - Debug session control (step, continue, variables)
- `tests/` - Test execution and debugging
- `editor/` - Editor navigation and UI
- `search/` - Code search and navigation (NEW!)
- `diag/` - Diagnostics and health checks
- `dap/` - Debug Adapter Protocol utilities
- `utils/` - Miscellaneous utilities

**Create new category if needed:**

```bash
mkdir -p packages/extension/src/vsc-scripts/my-category
```

### Step 2: Create Script File

**File naming convention:** `<action>.js` (e.g., `symbol-search.js`, `set.js`, `list.js`)

**Location:** `packages/extension/src/vsc-scripts/<category>/<action>.js`

**Example:** `/workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/search/symbol-search.js`

### Step 3: Choose Base Class

VSC-Bridge provides three base classes:

| Base Class | Use Case | Response Format | Example |
|------------|----------|-----------------|---------|
| `QueryScript` | Read-only queries that return data | `{ ...data }` | `breakpoint.list`, `search.symbol-search` |
| `ActionScript` | Actions that change state | `{ success: boolean, ...details }` | `breakpoint.set`, `debug.stop` |
| `WaitableScript` | Actions that wait for events | `{ success: boolean, event: {...} }` | `debug.start`, `debug.wait-for-hit` |

### Step 4: Implement Script Class

**Template for QueryScript** (most common):

```javascript
const { z } = require('zod');
const { QueryScript } = require('@script-base');

/**
 * My Feature Script
 * Description of what this script does
 */
class MyFeatureScript extends QueryScript {
    constructor() {
        super();

        // Define parameter schema with Zod
        this.paramsSchema = z.object({
            query: z.string().default(''),
            mode: z.enum(['workspace', 'document']).default('workspace'),
            path: z.string().optional(),
            limit: z.number().int().min(1).max(1000).default(100),
            includeDetails: z.boolean().default(true)
        }).refine(data => {
            // Custom validation (optional)
            if (data.mode === 'document' && !data.path) {
                throw new Error('path parameter required for document mode');
            }
            return true;
        });
    }

    /**
     * Execute the script
     *
     * @param {any} bridgeContext - Injected VS Code context
     * @param {{query: string, mode: string, path?: string, limit: number, includeDetails: boolean}} params - Validated parameters
     * @returns {Promise<Object>} - Structured response
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;
        const fs = require('fs');

        try {
            // 1. Call VS Code APIs
            let rawData = [];

            if (params.mode === 'workspace') {
                rawData = await vscode.commands.executeCommand(
                    'vscode.executeWorkspaceSymbolProvider',
                    params.query
                ) || [];
            } else if (params.mode === 'document') {
                // Validate file exists
                if (!fs.existsSync(params.path)) {
                    throw new Error(`E_FILE_NOT_FOUND: ${params.path}`);
                }

                const uri = vscode.Uri.file(params.path);
                rawData = await vscode.commands.executeCommand(
                    'vscode.executeDocumentSymbolProvider',
                    uri
                ) || [];
            }

            // 2. Process results
            const limited = rawData.slice(0, params.limit);
            const formatted = limited.map(item =>
                this._formatItem(item, params.includeDetails)
            );

            // 3. Calculate statistics
            const stats = this._calculateStats(rawData);

            // 4. Return structured response
            return {
                mode: params.mode,
                query: params.query,
                results: {
                    total: rawData.length,
                    returned: formatted.length,
                    truncated: rawData.length > params.limit
                },
                statistics: stats,
                data: formatted
            };

        } catch (error) {
            // Handle known errors
            if (error.message.startsWith('E_FILE_NOT_FOUND')) {
                throw error;
            }

            // Wrap unexpected errors
            throw new Error(`My feature failed: ${error.message}`);
        }
    }

    /**
     * Format individual item
     * @private
     */
    _formatItem(item, includeDetails) {
        const result = {
            name: item.name,
            type: item.kind
        };

        if (includeDetails && item.location) {
            result.location = {
                file: item.location.uri.fsPath,
                line: item.location.range.start.line + 1 // 1-indexed
            };
        }

        return result;
    }

    /**
     * Calculate statistics
     * @private
     */
    _calculateStats(items) {
        // Group by type, count, etc.
        return {
            totalCount: items.length
        };
    }
}

module.exports = { MyFeatureScript };
```

**Template for ActionScript:**

```javascript
const { z } = require('zod');
const { ActionScript } = require('@script-base');
const fs = require('fs');

/**
 * My Action Script
 * Performs an action that modifies state
 */
class MyActionScript extends ActionScript {
    constructor() {
        super();

        this.paramsSchema = z.object({
            path: z.string().min(1),
            line: z.number().int().min(1),
            condition: z.string().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{path: string, line: number, condition?: string}} params
     * @returns {Promise<{success: boolean, reason?: string, details?: any}>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        // Validate preconditions
        if (!fs.existsSync(params.path)) {
            return this.failure('E_FILE_NOT_FOUND', { path: params.path });
        }

        // Perform action
        try {
            const result = await this._performAction(vscode, params);

            // Log success
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[my-action] Completed for ${params.path}:${params.line}`
                );
            }

            // Return success with details
            return this.success({
                applied: result,
                location: {
                    path: params.path,
                    line: params.line
                }
            });

        } catch (error) {
            return this.failure('E_ACTION_FAILED', {
                error: error.message
            });
        }
    }

    async _performAction(vscode, params) {
        // Implementation
        return true;
    }
}

module.exports = { MyActionScript };
```

### Step 5: Create Metadata File

**File naming:** Same name as script but `.meta.yaml` extension

**Location:** `packages/extension/src/vsc-scripts/<category>/<action>.meta.yaml`

**Example:** `/workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/search/symbol-search.meta.yaml`

### Metadata Structure (Complete Template)

```yaml
# ============================================================================
# BASIC INFORMATION
# ============================================================================

alias: my-category.my-action
name: Human Readable Name
category: my-category
description: Short description of what this script does
dangerOnly: false  # Set to true if this modifies state or is potentially dangerous

# ============================================================================
# PARAMETERS
# ============================================================================

params:
  query:
    type: string
    required: false
    default: ""
    description: Search query string for workspace symbols (fuzzy matching, empty returns all)

  mode:
    type: string
    required: false
    default: "workspace"
    description: Search mode - "workspace" for global search or "document" for single file outline

  path:
    type: string
    required: false
    description: File path for document mode (required when mode=document)
    resolve: cwd-relative  # Path resolution: cwd-relative, absolute, or workspace-relative

  limit:
    type: number
    required: false
    default: 100
    min: 1
    max: 1000
    description: Maximum number of items to return

  includeDetails:
    type: boolean
    required: false
    default: true
    description: Include detailed information in results

# ============================================================================
# RESPONSE
# ============================================================================

response: query  # or "action" or "waitable"

result:
  mode:
    type: string
    description: Search mode used
  query:
    type: string
    description: Query string used
  results:
    type: object
    description: Result summary (total, returned, truncated)
  data:
    type: array
    description: Array of matched items

# ============================================================================
# ERROR CODES
# ============================================================================

errors:
  - E_FILE_NOT_FOUND
  - E_INVALID_MODE
  - E_ACTION_FAILED

# ============================================================================
# CLI CONFIGURATION
# ============================================================================

cli:
  command: my-category my-action
  description: Human-readable description for CLI help
  examples:
    - vscb script run my-category.my-action --param query="example"
    - vscb script run my-category.my-action --param mode="document" --param path="src/main.ts"
    - vscb script run my-category.my-action --param query="test" --param limit=50

# ============================================================================
# MCP CONFIGURATION (Model Context Protocol for AI agents)
# ============================================================================

mcp:
  # --------------------------------------------------------------------------
  # P0: Must-Have Fields (REQUIRED)
  # --------------------------------------------------------------------------

  enabled: true
  description: "One-line description for AI agents (workspace-wide symbol search with optional document outline mode)"
  timeout: 10000  # milliseconds

  # --------------------------------------------------------------------------
  # P0: Tool Relationships (REQUIRED - can be empty arrays)
  # --------------------------------------------------------------------------

  relationships:
    requires: []         # Tools that must be called before this one
    recommended: []      # Tools that work well with this one
    provides: []         # What this tool provides for other tools
    conflicts: []        # Tools that shouldn't be used with this one

  # --------------------------------------------------------------------------
  # P0: Structured Error Contract (REQUIRED)
  # --------------------------------------------------------------------------

  error_contract:
    errors:
      - code: E_FILE_NOT_FOUND
        summary: "File not found for document mode"
        is_retryable: false
        user_fix_hint: "Verify file path exists in workspace"

      - code: E_INVALID_MODE
        summary: "Invalid mode parameter"
        is_retryable: false
        user_fix_hint: "Use 'workspace' or 'document'"

  # --------------------------------------------------------------------------
  # P0: Safety Flags (REQUIRED)
  # --------------------------------------------------------------------------

  safety:
    idempotent: true      # Same input always produces same output
    read_only: true       # Does not modify any state
    destructive: false    # Does not delete or overwrite data

  # --------------------------------------------------------------------------
  # P1: LLM Guidance (HIGHLY RECOMMENDED)
  # This is the most important section for AI agents!
  # --------------------------------------------------------------------------

  llm:
    # When to use this tool
    when_to_use: |
      USE FOR:
      - Finding classes, functions, methods by name across workspace
      - Getting file outline/structure (document mode)
      - Discovering available symbols in codebase
      - Navigating to symbol definitions
      - Markdown document outline (headers as symbols)

      DON'T USE FOR:
      - Text/regex search (use workspace text search instead)
      - Finding symbol references (use find-references if available)
      - Searching file contents (symbols are declarations only)

      PREREQUISITES:
      - None for workspace mode (always works)
      - File must exist for document mode

      PATTERNS:
      - Find all classes: query="", kinds="Class"
      - Search by name: query="UserService"
      - File structure: mode="document", path="src/file.ts"
      - Multiple kinds: kinds="Class,Interface,Function"
      - Minimal output: includeLocation=false, includeContainer=false

    # Detailed parameter guidance
    parameter_hints:
      query:
        description: "Fuzzy search string (empty returns all symbols, respects kind filter)"
        required: false
        examples:
          - "UserService"
          - "Auth"
          - ""
        note: "Uses VS Code's built-in fuzzy matching, case-insensitive"

      mode:
        description: "Search scope - workspace (global) or document (single file)"
        required: false
        examples:
          - "workspace"
          - "document"
        note: "Document mode requires path parameter, returns hierarchical structure flattened"

      path:
        description: "Absolute or workspace-relative file path for document mode"
        required: false
        examples:
          - "src/services/UserService.ts"
          - "/absolute/path/to/file.py"
          - "README.md"
        note: "Required when mode=document, works with code and Markdown files"
        pitfalls:
          - "Path must exist or E_FILE_NOT_FOUND will be thrown"
          - "Relative paths are resolved from workspace root"

      limit:
        description: "Maximum items to return (prevents overwhelming output)"
        required: false
        examples:
          - "50"
          - "100"
          - "500"
        note: "Default 100, max 1000. Check results.truncated to see if more exist"

      includeDetails:
        description: "Include detailed information (location, metadata) in output"
        required: false
        examples:
          - "true"
          - "false"
        note: "Set to false for minimal output when only names/types needed"
```

### Key Sections Explained

#### 1. **Parameters Section**

Define each parameter with:
- `type`: string, number, boolean, array, object
- `required`: true/false
- `default`: Default value if not provided
- `description`: Human-readable description
- `min/max`: For numbers (validation)
- `values`: Enum values for string parameters
- `resolve`: For path parameters (cwd-relative, absolute, workspace-relative)

#### 2. **Response Section**

- `response`: Type of script (query, action, waitable)
- `result`: Structure of the return value (for documentation)

#### 3. **Error Codes**

List all error codes your script can throw:
- `E_FILE_NOT_FOUND`
- `E_INVALID_PARAMETER`
- `E_ACTION_FAILED`

#### 4. **CLI Configuration**

- `command`: Short command name (e.g., `bp set`, `search symbol-search`)
- `description`: Help text for CLI
- `examples`: 3-5 usage examples

#### 5. **MCP Configuration** (MOST IMPORTANT FOR AI AGENTS!)

The `llm` section provides guidance to AI agents:

**`when_to_use`:**
- When to use this tool (use cases)
- When NOT to use this tool (common mistakes)
- Prerequisites needed before calling
- Common usage patterns

**`parameter_hints`:**
- Detailed guidance for each parameter
- Examples of valid values
- Common pitfalls to avoid
- Notes about behavior

**Pro Tip:** Spend extra time on `llm.when_to_use` and `llm.parameter_hints`. This directly affects how well AI agents use your tool!

### Step 6: Verify File Structure

Before building, verify your files are in place:

```bash
ls -la packages/extension/src/vsc-scripts/<category>/

# Should see:
# <action>.js          (script implementation)
# <action>.meta.yaml   (metadata)
```

---

## Build Process

The build process transforms your script into a production-ready feature with auto-generated manifest, schemas, and CLI commands.

### Build Architecture

```
                                    ┌─────────────────────────┐
                                    │  Your Script Files      │
                                    │  *.js + *.meta.yaml     │
                                    └───────────┬─────────────┘
                                                │
                      ┌─────────────────────────┼─────────────────────────┐
                      │                         │                         │
                      ▼                         ▼                         ▼
          ┌───────────────────────┐ ┌───────────────────────┐ ┌──────────────────────┐
          │  build-manifest.cts   │ │ generate-zod-schemas  │ │  webpack             │
          │  Discovers scripts    │ │ Creates param schemas │ │  Compiles extension  │
          └───────────┬───────────┘ └───────────┬───────────┘ └──────────┬───────────┘
                      │                         │                         │
                      ▼                         ▼                         ▼
          ┌───────────────────────┐ ┌───────────────────────┐ ┌──────────────────────┐
          │  manifest.json        │ │  generated/schemas.ts │ │  out/extension.js    │
          │  37 scripts           │ │  Zod validation       │ │  Bundled extension   │
          └───────────────────────┘ └───────────────────────┘ └──────────────────────┘
```

### Build Steps

#### Step 1: Build Manifest

```bash
just build-manifest
```

**What it does:**
- Scans `packages/extension/src/vsc-scripts/` recursively
- Finds all `*.meta.yaml` files
- Validates corresponding `*.js` file exists
- Generates `packages/extension/src/vsc-scripts/manifest.json`

**Output:**
```
Building script manifest...

✓ Discovered script: breakpoint.list (breakpoint/list.js)
✓ Discovered script: breakpoint.set (breakpoint/set.js)
✓ Discovered script: search.symbol-search (search/symbol-search.js)  ← Your new script!
...

✅ Manifest generated successfully!
   Output: packages/extension/src/vsc-scripts/manifest.json
   Scripts: 37
   Aliases: breakpoint.list, breakpoint.set, ..., search.symbol-search
```

**Verify your script was discovered:**

```bash
cat packages/extension/src/vsc-scripts/manifest.json | grep "search.symbol-search"
```

#### Step 2: Generate Zod Schemas

```bash
just build-schemas
```

**What it does:**
- Reads `manifest.json`
- Generates TypeScript Zod schemas from parameter definitions
- Outputs to `packages/extension/src/vsc-scripts/generated/schemas.ts`

**Output:**
```
Generating Zod schemas...
✅ Generated schemas for 37 scripts
   Output: packages/extension/src/vsc-scripts/generated/schemas.ts
```

**What gets generated:**

```typescript
// packages/extension/src/vsc-scripts/generated/schemas.ts

export const schemas = {
  'search.symbol-search': z.object({
    query: z.string().default(''),
    mode: z.enum(['workspace', 'document']).default('workspace'),
    path: z.string().optional(),
    limit: z.number().int().min(1).max(1000).default(100),
    includeDetails: z.boolean().default(true)
  }),
  // ... other scripts
};
```

#### Step 3: Compile Base Classes

```bash
just build-base-classes
```

**What it does:**
- Compiles TypeScript base classes (`QueryScript`, `ActionScript`, etc.)
- Required for scripts to load at runtime
- Outputs to `packages/extension/out/core/scripts/`

**Output:**
```
Compiling base classes for script loading...
Base classes compiled to packages/extension/out/core/scripts/
```

#### Step 4: Build Extension (Webpack)

```bash
just build-extension
```

**What it does:**
- Bundles all TypeScript/JavaScript into single extension file
- Includes your script and all dependencies
- Outputs to `packages/extension/out/extension.js`

**Output:**
```
Building extension...
webpack 5.x.x compiled successfully in 15234 ms
```

#### Step 5: Build CLI

```bash
just build-cli
```

**What it does:**
- Compiles CLI commands (oclif framework)
- Generates command structure from manifest
- Outputs to `dist/`

**Output:**
```
Building CLI...
✅ CLI built successfully
   Output: dist/index.js
```

### Complete Build (One Command)

For convenience, build everything at once:

```bash
just build
```

**What it does:**
```
1. build-manifest      → manifest.json (script discovery)
2. build-schemas       → generated/schemas.ts (validation)
3. build-base-classes  → out/core/scripts/ (runtime support)
4. build-extension     → out/extension.js (webpack bundle)
5. build-cli           → dist/index.js (CLI commands)
```

**Duration:** ~20-30 seconds (incremental builds are faster)

### Verify Build Success

```bash
# 1. Check manifest includes your script
cat packages/extension/src/vsc-scripts/manifest.json | grep "my-category.my-action"

# 2. Check schemas were generated
grep "my-category.my-action" packages/extension/src/vsc-scripts/generated/schemas.ts

# 3. Check extension compiled
ls -lh packages/extension/out/extension.js

# 4. List available scripts via CLI
vscb script list | grep "my-category.my-action"
```

### Common Build Errors

#### Error: "Metadata file has no corresponding .js file"

**Cause:** Created `.meta.yaml` but no `.js` file

**Fix:**
```bash
# Ensure both files exist
ls packages/extension/src/vsc-scripts/my-category/my-action.js
ls packages/extension/src/vsc-scripts/my-category/my-action.meta.yaml
```

#### Error: "Failed to parse metadata"

**Cause:** Invalid YAML syntax in `.meta.yaml`

**Fix:**
```bash
# Validate YAML syntax
npx js-yaml packages/extension/src/vsc-scripts/my-category/my-action.meta.yaml
```

#### Error: "Module not found: @script-base"

**Cause:** Base classes not compiled yet

**Fix:**
```bash
just build-base-classes
```

#### Error: "Webpack compilation failed"

**Cause:** Syntax error in script `.js` file

**Fix:**
```bash
# Check for syntax errors
node --check packages/extension/src/vsc-scripts/my-category/my-action.js
```

#### Error: "Cannot find module 'vscode'"

**Cause:** Used `require('vscode')` in script (wrong!)

**Fix:**
```javascript
// ❌ Wrong
const vscode = require('vscode');

// ✅ Correct
const vscode = bridgeContext.vscode;
```

---

## Testing the Built-in Script

Once built, test your script through three methods: Extension Host (fastest), CLI (convenient), and MCP integration tests (comprehensive).

### Method 1: Test via Extension Host (Recommended for Development)

**Fastest feedback loop** - no CLI needed, direct extension communication.

#### Step 1: Launch Extension Host

```bash
# From project root
cd /workspaces/vsc-bridge-devcontainer

vscb script run debug.start --param launch="Run Extension"
```

**What happens:**
- VS Code Extension Development Host window opens
- Opens `test/` workspace automatically
- Extension activates and creates `.vsc-bridge/` in test workspace
- Bridge server starts on localhost:3001

**Wait 10 seconds for initialization** (critical!)

#### Step 2: Run Your Script

```bash
# From test/ workspace (important - where .vsc-bridge/ exists!)
cd test

# Run your script
vscb script run my-category.my-action \
  --param query="example" \
  --param mode="workspace"
```

**Expected output:**
```json
{
  "ok": true,
  "mode": "workspace",
  "query": "example",
  "results": {
    "total": 42,
    "returned": 42,
    "truncated": false
  },
  "data": [...]
}
```

#### Step 3: Test Different Parameters

```bash
# Test with document mode
vscb script run my-category.my-action \
  --param mode="document" \
  --param path="$(pwd)/python/test_example.py"

# Test with limit
vscb script run my-category.my-action \
  --param query="test" \
  --param limit=10

# Test error handling (invalid mode)
vscb script run my-category.my-action \
  --param mode="invalid"
```

#### Step 4: Monitor Extension Output

Check VS Code Output panel:
1. In Extension Host window: `View → Output`
2. Select "VSC-Bridge" from dropdown
3. See script execution logs

#### Common Extension Host Issues

**Issue: "Bridge not found or not healthy"**

**Cause:** `.vsc-bridge/` directory doesn't exist in current directory

**Fix:**
```bash
# Ensure you're in test/ workspace
pwd  # Should be /workspaces/vsc-bridge-devcontainer/test

# Check bridge exists
ls -la .vsc-bridge/

# If missing, relaunch Extension Host
cd ..
vscb script run debug.start --param launch="Run Extension"
```

**Issue: "Script not found: my-category.my-action"**

**Cause:** Extension Host loaded old extension (before your script existed)

**Fix:**
```bash
# Stop Extension Host
vscb script run debug.stop

# Rebuild extension
just build-extension

# Relaunch Extension Host
vscb script run debug.start --param launch="Run Extension"
```

**Issue: "Extension Host crashed"**

**Cause:** Script has runtime error

**Fix:**
1. Check Extension Host window for error messages
2. Fix error in script
3. Rebuild: `just build-extension`
4. Relaunch Extension Host

### Method 2: Test via CLI (Simpler but Less Common)

**When to use:** Quick validation without Extension Host

#### Prerequisites

```bash
# Ensure CLI is built and linked
just build-cli
npm link  # Makes vscb globally available
```

#### Run Script

```bash
# Set environment variables
export NODE_ENV=production
export OCLIF_TS_NODE=0

# Run script (from any directory)
vscb script run my-category.my-action --param query="example"
```

**Limitations:**
- Requires Extension Host running in background
- Bridge must be healthy
- Less convenient than direct Extension Host testing

### Method 3: MCP Integration Tests (Comprehensive)

**When to use:** Final validation before merging, ensures MCP tools work correctly.

#### Create Test File

Create `/workspaces/vsc-bridge-devcontainer/test-cli/integration-mcp/my-feature.test.ts`:

```typescript
/**
 * MCP Integration Test - My Feature
 *
 * Tests the my-category.my-action script via MCP protocol.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { setupStdioTestEnvironment, StdioTestEnvironment } from './helpers/stdio-test-client.js';
import * as path from 'path';

const TEST_TIMEOUT = 30000;
const SETUP_TIMEOUT = 120000;

let env: StdioTestEnvironment | undefined;

describe('MCP Integration - My Feature', () => {
    beforeAll(async () => {
        console.log('⚙️  Starting MCP test environment...');
        env = await setupStdioTestEnvironment();
        console.log('✅ MCP environment ready');
    }, SETUP_TIMEOUT);

    afterAll(async () => {
        if (env) {
            await env.cleanup();
        }
    });

    it('should search workspace symbols', async () => {
        if (!env) throw new Error('Environment not initialized');

        // Call MCP tool
        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'my_category__my_action',  // Note: dots become underscores
                    arguments: {
                        query: 'example',
                        mode: 'workspace'
                    }
                }
            },
            CallToolResultSchema
        );

        // Parse response
        const data = JSON.parse(result.content[0].text);

        // Assertions
        expect(data.mode).toBe('workspace');
        expect(data.query).toBe('example');
        expect(data.results.total).toBeGreaterThan(0);
        expect(data.data).toBeDefined();
        expect(Array.isArray(data.data)).toBe(true);

    }, TEST_TIMEOUT);

    it('should handle document mode', async () => {
        if (!env) throw new Error('Environment not initialized');

        const testFile = path.join(env.testWorkspace, 'python/test_example.py');

        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'my_category__my_action',
                    arguments: {
                        mode: 'document',
                        path: testFile
                    }
                }
            },
            CallToolResultSchema
        );

        const data = JSON.parse(result.content[0].text);

        expect(data.mode).toBe('document');
        expect(data.results.total).toBeGreaterThan(0);

    }, TEST_TIMEOUT);

    it('should enforce limit parameter', async () => {
        if (!env) throw new Error('Environment not initialized');

        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'my_category__my_action',
                    arguments: {
                        query: '',  // Empty query returns all
                        limit: 5
                    }
                }
            },
            CallToolResultSchema
        );

        const data = JSON.parse(result.content[0].text);

        expect(data.results.returned).toBeLessThanOrEqual(5);
        if (data.results.total > 5) {
            expect(data.results.truncated).toBe(true);
        }

    }, TEST_TIMEOUT);

    it('should handle errors gracefully', async () => {
        if (!env) throw new Error('Environment not initialized');

        // Test with non-existent file
        await expect(
            env.client.request(
                {
                    method: 'tools/call',
                    params: {
                        name: 'my_category__my_action',
                        arguments: {
                            mode: 'document',
                            path: '/non/existent/file.py'
                        }
                    }
                },
                CallToolResultSchema
            )
        ).rejects.toThrow(/E_FILE_NOT_FOUND/);

    }, TEST_TIMEOUT);
});
```

#### Run Integration Tests

```bash
# Run single test file
npx vitest run test-cli/integration-mcp/my-feature.test.ts

# Run all MCP integration tests
just test-integration-mcp
```

**Expected output:**
```
 ✓ test-cli/integration-mcp/my-feature.test.ts (4)
   ✓ MCP Integration - My Feature (4)
     ✓ should search workspace symbols
     ✓ should handle document mode
     ✓ should enforce limit parameter
     ✓ should handle errors gracefully

Test Files  1 passed (1)
     Tests  4 passed (4)
  Start at  10:30:00
  Duration  25.43s
```

### Testing Checklist

- [ ] Test via Extension Host (basic functionality)
- [ ] Test all parameter combinations
- [ ] Test error cases (invalid parameters, missing files)
- [ ] Test edge cases (empty results, large results, etc.)
- [ ] Test via MCP integration tests (optional but recommended)
- [ ] Verify output format matches metadata documentation
- [ ] Check performance (should complete in <10 seconds)

---

## MCP Exposure Verification

After building, verify your script is correctly exposed as an MCP tool.

### Step 1: Check Manifest Entry

```bash
# View manifest entry for your script
cat packages/extension/src/vsc-scripts/manifest.json | jq '.scripts["my-category.my-action"]'
```

**Expected output:**
```json
{
  "metadata": {
    "alias": "my-category.my-action",
    "name": "My Action",
    "category": "my-category",
    "description": "Does something useful",
    "mcp": {
      "enabled": true,
      "description": "MCP tool description",
      "timeout": 10000,
      ...
    }
  },
  "scriptRelPath": "my-category/my-action.js"
}
```

### Step 2: Check MCP Tool Generation

```bash
# List all MCP tools (requires manifest)
node -e "
const manifest = require('./packages/extension/src/vsc-scripts/manifest.json');
const tools = Object.entries(manifest.scripts)
  .filter(([_, entry]) => entry.metadata.mcp?.enabled)
  .map(([alias, entry]) => ({
    alias,
    mcpName: alias.replace(/\./g, '_'),
    description: entry.metadata.mcp.description
  }));
console.log(JSON.stringify(tools, null, 2));
" | grep -A 3 "my-category"
```

**Expected output:**
```json
{
  "alias": "my-category.my-action",
  "mcpName": "my_category__my_action",
  "description": "MCP tool description"
}
```

**Note:** MCP tool names replace dots with underscores (`my-category.my-action` → `my_category__my_action`)

### Step 3: Test via MCP Server

```bash
# Start MCP server in stdio mode
vscb mcp
```

In another terminal:

```bash
# List tools (should include yours)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | vscb mcp | jq '.result.tools[] | select(.name | contains("my_category"))'
```

### Step 4: Add to Claude Code Allowlist (Optional)

If using Claude Code, add your tool to the allowlist:

Edit `.claude/settings.local.json` (create if doesn't exist):

```json
{
  "mcpServers": {
    "vsc-bridge": {
      "allowedTools": [
        "mcp__vsc-bridge__my_category__my_action"
      ]
    }
  }
}
```

**Note:** MCP tools exposed to Claude Code are prefixed with `mcp__vsc-bridge__`

### Verification Checklist

- [ ] Manifest includes your script with `mcp.enabled: true`
- [ ] MCP tool name generated correctly (dots → underscores)
- [ ] Tool appears in `vscb mcp` tool list
- [ ] Tool callable via MCP protocol
- [ ] Added to Claude Code allowlist (if using Claude Code)

---

## Complete Checklist

### Phase 1: Prototype

- [ ] Create dynamic script in `scratch/`
- [ ] Test with Extension Host
- [ ] Iterate until functionality works
- [ ] Document findings in `docs/research/`
- [ ] Confirm script works reliably

### Phase 2: Built-in

- [ ] Choose appropriate category (or create new one)
- [ ] Create script file (`.js`) with proper base class
- [ ] Create metadata file (`.meta.yaml`) with all fields
- [ ] Define Zod schema in constructor
- [ ] Implement `execute()` method
- [ ] Add error handling
- [ ] Run `just build` successfully
- [ ] Verify manifest generation
- [ ] Verify schema generation

### Phase 3: Testing

- [ ] Test via Extension Host (primary method)
- [ ] Test all parameter combinations
- [ ] Test error cases
- [ ] Test edge cases (empty results, large datasets)
- [ ] Create MCP integration test (optional but recommended)
- [ ] Run integration tests successfully
- [ ] Verify performance (<10 seconds)

### Phase 4: MCP Integration

- [ ] Verify tool appears in manifest
- [ ] Check MCP tool name generation
- [ ] Test via MCP server
- [ ] Add to Claude Code allowlist (if applicable)
- [ ] Test via actual AI agent (Claude, Cursor, etc.)

### Phase 5: Documentation

- [ ] Update relevant docs (if significant feature)
- [ ] Add examples to metadata
- [ ] Document common use cases
- [ ] Update CHANGELOG (if applicable)
- [ ] Consider adding to README

---

## Common Pitfalls & Solutions

### 1. "vscode is not defined"

**Problem:** Using `require('vscode')` in script

**Solution:**
```javascript
// ❌ Wrong - won't work in VM context
const vscode = require('vscode');

// ✅ Correct - use injected dependency
const vscode = bridgeContext.vscode;
```

### 2. "Bridge not found or not healthy"

**Problem:** Running from wrong directory (no `.vsc-bridge/`)

**Solution:**
```bash
# Always run from test/ workspace when using Extension Host
cd /workspaces/vsc-bridge-devcontainer/test

# Verify bridge exists
ls -la .vsc-bridge/
```

### 3. "Script not found" after adding new script

**Problem:** Extension Host loaded old extension

**Solution:**
```bash
# Stop Extension Host
vscb script run debug.stop

# Rebuild
just build-extension

# Relaunch
vscb script run debug.start --param launch="Run Extension"
```

### 4. "Metadata file has no corresponding .js file"

**Problem:** Only created `.meta.yaml`

**Solution:**
```bash
# Both files must exist with same name
touch packages/extension/src/vsc-scripts/my-category/my-action.js
touch packages/extension/src/vsc-scripts/my-category/my-action.meta.yaml
```

### 5. "Failed to parse metadata"

**Problem:** Invalid YAML syntax

**Solution:**
```bash
# Validate YAML
npx js-yaml packages/extension/src/vsc-scripts/my-category/my-action.meta.yaml

# Common issues:
# - Missing quotes around strings with special characters
# - Incorrect indentation (use 2 spaces)
# - Mixing tabs and spaces
```

### 6. Schema validation errors

**Problem:** Parameter type mismatch

**Solution:**
```yaml
# In .meta.yaml, ensure types match Zod schema

# ❌ Wrong
params:
  limit:
    type: string  # But Zod schema expects number!

# ✅ Correct
params:
  limit:
    type: number
```

### 7. Tool not appearing in MCP

**Problem:** `mcp.enabled: false` or missing

**Solution:**
```yaml
# In .meta.yaml, ensure MCP is enabled
mcp:
  enabled: true  # Must be explicitly true
  description: "Tool description"
```

### 8. Extension Host memory issues

**Problem:** Webpack fails with "JavaScript heap out of memory"

**Solution:**
```bash
# Increase Node memory
export NODE_OPTIONS="--max-old-space-size=4096"
just build-extension
```

### 9. Path resolution issues

**Problem:** File not found even though path is correct

**Solution:**
```yaml
# In .meta.yaml, specify path resolution
params:
  path:
    type: string
    resolve: cwd-relative  # or absolute, workspace-relative
```

```javascript
// In script, use appropriate path resolution
const vscode = bridgeContext.vscode;
const fs = require('fs');

// For absolute paths
if (!fs.existsSync(params.path)) {
  throw new Error(`E_FILE_NOT_FOUND: ${params.path}`);
}

// For workspace-relative paths
const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
const absolutePath = path.join(workspaceRoot, params.path);
```

### 10. Performance issues

**Problem:** Script takes >30 seconds to run

**Solution:**
```yaml
# Increase timeout in .meta.yaml
mcp:
  timeout: 60000  # 60 seconds

# Add limit parameter
params:
  limit:
    type: number
    default: 100
    max: 1000
```

```javascript
// In script, enforce limits
const limited = results.slice(0, params.limit);
return {
  results: {
    total: results.length,
    returned: limited.length,
    truncated: results.length > params.limit
  },
  data: limited
};
```

---

## Best Practices

### 1. Script Design

**Choose the right base class:**
- `QueryScript` for read-only operations (most common)
- `ActionScript` for state-changing operations
- `WaitableScript` for operations that wait for events

**Keep scripts focused:**
- Each script should do ONE thing well
- Create separate scripts instead of adding modes
- Example: `symbol-search` (workspace + document mode) is OK, but `symbol-search-and-replace` would be too much

### 2. Parameter Design

**Use sensible defaults:**
```javascript
this.paramsSchema = z.object({
  query: z.string().default(''),        // Empty = all
  limit: z.number().default(100),       // Reasonable default
  includeDetails: z.boolean().default(true)  // Most useful default
});
```

**Validate parameters:**
```javascript
this.paramsSchema = z.object({
  line: z.number().int().min(1),  // Must be positive integer
  path: z.string().min(1),        // Can't be empty
  mode: z.enum(['a', 'b'])        // Only specific values
}).refine(data => {
  // Custom validation
  if (data.mode === 'document' && !data.path) {
    throw new Error('path required for document mode');
  }
  return true;
});
```

**Use descriptive names:**
- ✅ `includeLocation`, `includeDetails`
- ❌ `flag1`, `opt2`

### 3. Error Handling

**Define error codes:**
```javascript
// In script
if (!fs.existsSync(params.path)) {
  throw new Error(`E_FILE_NOT_FOUND: ${params.path}`);
}
```

```yaml
# In .meta.yaml
errors:
  - E_FILE_NOT_FOUND
  - E_INVALID_PARAMETER

mcp:
  error_contract:
    errors:
      - code: E_FILE_NOT_FOUND
        summary: "File not found"
        is_retryable: false
        user_fix_hint: "Verify file path exists"
```

**Handle edge cases:**
```javascript
// Empty results
const results = await vscode.commands.executeCommand(...) || [];

// Null/undefined checks
if (!vscode.workspace.workspaceFolders) {
  throw new Error('E_NO_WORKSPACE: No workspace folder open');
}

// Type safety
if (typeof params.query !== 'string') {
  throw new Error('E_INVALID_TYPE: query must be string');
}
```

### 4. MCP Guidance

**Write excellent `llm.when_to_use`:**
```yaml
llm:
  when_to_use: |
    USE FOR:
    - Specific use case 1
    - Specific use case 2
    - Specific use case 3

    DON'T USE FOR:
    - Common mistake 1 (use X instead)
    - Common mistake 2 (use Y instead)

    PREREQUISITES:
    - What must be true before calling

    PATTERNS:
    - Common pattern 1: param1="value" param2="value"
    - Common pattern 2: param1="value" param2="value"
```

**Provide detailed parameter hints:**
```yaml
llm:
  parameter_hints:
    query:
      description: "Clear explanation of what this does"
      required: false
      examples:
        - "UserService"
        - "Auth*"
        - ""
      note: "Important behavior notes"
      pitfalls:
        - "Common mistake to avoid"
        - "Another common mistake"
```

### 5. Response Structure

**Use consistent formats:**
```javascript
// QueryScript response
return {
  mode: params.mode,
  query: params.query,
  results: {
    total: allResults.length,
    returned: limitedResults.length,
    truncated: allResults.length > params.limit
  },
  statistics: calculateStats(allResults),
  data: limitedResults
};

// ActionScript response
return this.success({
  applied: true,
  location: {
    path: params.path,
    line: params.line
  },
  details: {...}
});
```

**Include statistics:**
```javascript
_calculateStats(items) {
  const byType = {};
  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1;
  }
  return {
    total: items.length,
    byType
  };
}
```

### 6. Performance

**Set reasonable limits:**
```yaml
params:
  limit:
    type: number
    default: 100
    max: 1000  # Prevent overwhelming output
```

**Implement pagination for large datasets:**
```javascript
// Return truncation indicator
return {
  results: {
    total: allResults.length,
    returned: limitedResults.length,
    truncated: allResults.length > params.limit
  },
  data: limitedResults
};
```

**Use appropriate timeouts:**
```yaml
mcp:
  timeout: 10000  # 10 seconds for most operations
  # timeout: 30000  # 30 seconds for slow operations
```

### 7. Testing

**Test all parameter combinations:**
```javascript
// Default parameters
vscb script run my-action

// With optional parameters
vscb script run my-action --param query="test"

// With all parameters
vscb script run my-action --param query="test" --param limit=50 --param includeDetails=false
```

**Test error cases:**
```javascript
// Invalid parameters
vscb script run my-action --param mode="invalid"

// Missing required parameters
vscb script run my-action --param mode="document"  # Missing path

// Non-existent files
vscb script run my-action --param path="/non/existent/file.py"
```

**Test edge cases:**
```javascript
// Empty results
vscb script run my-action --param query="zzzzzznonexistent"

// Large datasets
vscb script run my-action --param query="" --param limit=1000

// Special characters
vscb script run my-action --param query="User*Service"
```

### 8. Code Organization

**Use private helper methods:**
```javascript
class MyScript extends QueryScript {
  async execute(bridgeContext, params) {
    const data = await this._fetchData(bridgeContext.vscode, params);
    const formatted = this._formatData(data, params);
    const stats = this._calculateStats(data);
    return { data: formatted, statistics: stats };
  }

  _fetchData(vscode, params) { /* ... */ }
  _formatData(data, params) { /* ... */ }
  _calculateStats(data) { /* ... */ }
}
```

**Add JSDoc comments:**
```javascript
/**
 * Execute symbol search
 *
 * @param {any} bridgeContext - Injected VS Code context
 * @param {{query: string, mode: string, limit: number}} params - Validated parameters
 * @returns {Promise<Object>} - Structured response with results and statistics
 */
async execute(bridgeContext, params) {
  // ...
}
```

---

## Reference Examples

### Simple Script: `breakpoint.list`

**Location:** `/workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/breakpoint/list.js`

**Features:**
- No parameters (empty schema)
- QueryScript base class
- Simple data transformation
- ~56 lines of code

**Good for:** Learning basic script structure

### Medium Script: `breakpoint.set`

**Location:** `/workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/breakpoint/set.js`

**Features:**
- Multiple parameters with validation
- ActionScript base class
- File existence check
- Optional parameters (condition, hitCondition, logMessage)
- ~102 lines of code

**Good for:** Learning parameter validation and action patterns

### Complex Script: `search.symbol-search`

**Location:** `/workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/search/symbol-search.js`

**Features:**
- Two modes (workspace/document)
- Complex parameter schema with refinement
- Filtering and pagination
- Statistics calculation
- Hierarchical data flattening
- Configurable output (includeLocation, includeContainer)
- ~253 lines of code

**Good for:** Learning advanced patterns

### Dynamic Prototype: `scratch/symbol-search-experiment.js`

**Location:** `/workspaces/vsc-bridge-devcontainer/scratch/symbol-search-experiment.js`

**Features:**
- Simple module.exports function
- No base class needed
- Rapid iteration
- ~224 lines of code

**Good for:** Understanding dynamic script pattern and prototyping workflow

### MCP Integration Test: `search-symbol-search.test.ts`

**Location:** `/workspaces/vsc-bridge-devcontainer/test-cli/integration-mcp/search-symbol-search.test.ts`

**Features:**
- MCP protocol testing
- Multiple test cases
- Error handling validation
- Timeout configuration

**Good for:** Learning integration test patterns

---

## Additional Resources

### Documentation

- **How Scripts Work:** `/workspaces/vsc-bridge-devcontainer/docs/how/how-scripts-work.md`
- **Dynamic Script README:** `/workspaces/vsc-bridge-devcontainer/scripts/sample/dynamic/README.md`
- **Symbol Search Findings:** `/workspaces/vsc-bridge-devcontainer/docs/research/symbol-search-findings.md`
- **Symbol Search Implementation:** `/workspaces/vsc-bridge-devcontainer/docs/research/symbol-search-implementation.md`

### Source Code

- **Script Registry:** `/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/registry/ScriptRegistry.ts`
- **Base Classes:** `/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/scripts/`
- **Manifest Builder:** `/workspaces/vsc-bridge-devcontainer/scripts/build-manifest.cts`
- **Schema Generator:** `/workspaces/vsc-bridge-devcontainer/packages/extension/scripts/generate-zod-schemas.ts`

### VS Code API References

- **Built-in Commands:** https://code.visualstudio.com/api/references/commands
- **VS Code API:** https://code.visualstudio.com/api/references/vscode-api
- **Extension Guides:** https://code.visualstudio.com/api/extension-guides/overview

---

## Summary

Adding a new script to vsc-bridge follows a proven two-phase workflow:

1. **Phase 1: Prototype** with dynamic scripts for fast iteration
2. **Phase 2: Built-in** with full integration for production use

**Key Success Factors:**
- Start with dynamic scripts to validate VS Code APIs work
- Use existing scripts as templates for consistency
- Write excellent MCP guidance for AI agents
- Test thoroughly via Extension Host before integration tests
- Document your learnings for future developers

**Expected Timeline:**
- Prototyping: 30-60 minutes
- Production implementation: 2-3 hours
- Testing and documentation: 1-2 hours
- **Total: ~4-6 hours for a complete, well-tested script**

This guide reflects actual implementation experience and should serve as the definitive reference for adding new scripts to vsc-bridge.
