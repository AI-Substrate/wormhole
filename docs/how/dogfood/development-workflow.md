# VSC-Bridge Extension Development Workflow

> A complete guide to finding, fixing, building, and testing changes in the VSC-Bridge extension using the extension itself (dogfooding).

## Overview

This guide shows the complete development cycle for working on the VSC-Bridge extension. The powerful part: you can use the extension itself to debug and test your changes!

**The Cycle**:
1. Find problem in code
2. Understand the issue
3. Make the fix
4. Build the extension
5. Install and reload VS Code
6. Test the changes
7. Verify everything works

## 1. Finding Problems in Extension Code

### Search Tools

```bash
# Find files by pattern
Glob --pattern "**/*.ts" --path "extension/src"

# Search file contents with context
Grep --pattern "searchTerm" \
  --path "extension/src" \
  --output_mode "content" \
  -n -C 3

# Read specific files
Read --file_path "/absolute/path/to/file.ts"
```

## 2. Understanding the Problem

### Investigation Strategies

**Compare with working implementations**:
```bash
# Read the problematic file
Read --file_path "$(pwd)/extension/src/vsc-scripts/debug/start.js"

# Read a similar working implementation
Read --file_path "$(pwd)/extension/src/vsc-scripts/tests/debug-single.js"

# Compare the differences
```

**Use subagents for complex analysis**:
```bash
Task --subagent_type "general-purpose" \
  --description "Investigate why X happens" \
  --prompt "Analyze why debug.start returns 'terminated' instead of 'stopped'..."
```

**Trace through the call chain**:
1. Find the entry point (script file)
2. Follow calls to helper functions
3. Check parameter passing
4. Look for similar patterns in working code

## 3. Making the Fix

### Code Editing

**Edit specific code sections**:
```bash
Edit --file_path "/path/to/file.ts" \
  --old_string "exact old code" \
  --new_string "fixed code"
```

### Metadata Updates

If you add or change script parameters, update the `.meta.yaml` file:

```yaml
# extension/src/vsc-scripts/debug/start.meta.yaml
params:
  wait:
    type: boolean
    required: false
    default: false
    description: Wait for breakpoint/error/exit after launch
```

**Important**: The build process auto-generates:
- `manifest.json` from `.meta.yaml` files
- `schemas.ts` from manifest metadata

## 4. Building the Extension

### Full Build Command

```bash
just build
```

**What this does**:
1. **Manifest generation** - Discovers all scripts and creates `manifest.json`
2. **Schema generation** - Creates Zod validation schemas in `schemas.ts`
3. **TypeScript compilation** - Compiles `.ts` to `.js`
4. **Webpack bundling** - Bundles extension and vsc-scripts
5. **CLI build** - Builds the CLI tool
6. **MCP server build** - Builds the MCP server

### Build Artifacts

```
extension/
├── out/
│   ├── extension.js         # Main extension bundle
│   ├── vsc-scripts/*.js     # Script bundles
│   └── core/                # Core modules
├── src/vsc-scripts/
│   ├── manifest.json        # Auto-generated from .meta.yaml
│   └── generated/
│       └── schemas.ts       # Auto-generated Zod schemas
cli/
└── dist/                    # CLI tool
```

## 5. Installing the Extension

### Install Command

```bash
just install-extension
```

**What this does**:
1. Runs full build
2. Packages extension as `.vsix`
3. Uninstalls old version from VS Code
4. Installs new `.vsix` in VS Code

**Critical**: You must reload VS Code after install for changes to take effect!

## 6. Reloading VS Code

### Using the Extension to Reload Itself

```bash
vscb script run utils.restart-vscode
```

**Expected behavior**:
- ✅ The command will show an error message
- ✅ This is **NORMAL** - VS Code kills the extension during reload
- ✅ If you see the error, the reload **worked**!
- ✅ VS Code will automatically restart

**Why the error?**:
VS Code's reload command (`workbench.action.reloadWindow`) terminates the extension before it can send a success response. The error means the reload was triggered successfully.

## 7. Testing the Changes

### A. Set Up Test Conditions

**Working directory matters**:
```bash
# Check current directory
pwd

# Should be at project root for debug.start
# Example: cd /path/to/vsc-bridge

# Should be at test/ for test commands
# Example: cd /path/to/vsc-bridge/test
```

**Set breakpoints** (for testing debugging features):
```bash
vscb script run bp.set \
  --param path="$(pwd)/extension/src/core/registry/ScriptRegistry.ts" \
  --param line=97
```

**Clear breakpoints** (if needed):
```bash
# Clear specific file
vscb script run bp.clear.file --param path="/path/to/file"

# Clear all breakpoints
vscb script run bp.clear.project
```

### B. Test Your Changes

**Example: Testing a new flag**:
```bash
# Test new behavior with flag
vscb script run debug.start \
  --param launch="Run Extension" \
  --param timeoutMs=60000 \
  --param wait=true

# Test legacy behavior without flag
vscb script run debug.start \
  --param launch="Run Extension" \
  --param timeoutMs=60000
```

**Check command documentation**:
```bash
# List all available scripts
vscb script list

# Get detailed info on a specific script
vscb script info debug.start
```

### C. Inspect Results

**Check debug state**:
```bash
# Get current debug status
vscb script run debug.status

# Get call stack
vscb script run debug.stack

# List variables
vscb script run debug.list-variables --param scope=local

# Evaluate expressions
vscb script run debug.evaluate --param expression="variableName"
```

**Control execution**:
```bash
# Continue execution
vscb script run debug.continue

# Step commands
vscb script run debug.step-over
vscb script run debug.step-into
vscb script run debug.step-out

# Stop debugging
vscb script run debug.stop
```

## 8. Verification Checklist

After testing, verify:

### ✅ Functionality
- Does the fix work as expected?
- Test with various parameters
- Test edge cases (errors, timeouts, invalid input)

### ✅ Backward Compatibility
- Does legacy behavior still work?
- Test without new parameters
- Ensure existing integrations aren't broken

### ✅ Error Handling
- Do errors produce clear messages?
- Test invalid inputs
- Test timeout scenarios

### ✅ Documentation
- Are changes reflected in `.meta.yaml`?
- Does CLI help show new parameters?
- Are response formats documented?

## 9. Real-World Example: Adding `--wait` to `debug.start`

This example shows the complete workflow from problem discovery to verified fix.

### Problem Discovery

**User request**: "debug.start should have a `--wait` flag like tests.debug-single"

Currently:
- `debug.start` returns immediately after launching
- `tests.debug-single` waits for breakpoint/error/exit
- Need consistent behavior across both commands

### Investigation (Step 1-2)

**Compare implementations**:
```bash
# Read the current implementation
Read --file_path "$(pwd)/extension/src/vsc-scripts/debug/start.js"

# Read the working example
Read --file_path "$(pwd)/extension/src/vsc-scripts/tests/debug-single.js"
```

**Key findings**:
- `debug.start` only waits for session to initialize (500ms)
- `tests.debug-single` calls `waitUntilPausedAndGetLocation()` after session starts
- Need to add optional waiting behavior to `debug.start`

### Making the Fix (Step 3)

**1. Update the script code**:
```javascript
// extension/src/vsc-scripts/debug/start.js

// Add wait parameter to schema
this.paramsSchema = z.object({
    launch: z.string().min(1),
    folder: z.string().optional(),
    timeoutMs: z.number().int().min(1).max(300000).default(30000),
    wait: z.boolean().default(false)  // NEW
});

// Add conditional waiting logic
if (!params.wait) {
    return baseResponse;  // Legacy behavior
}

// Wait for outcome (breakpoint/error/exit)
const outcome = await waitUntilPausedAndGetLocation(
    session,
    params.timeoutMs,
    vscode,
    true  // useActiveSession=true (important!)
);

// Merge and return
return {
    ...baseResponse,
    ...outcome
};
```

**2. Update metadata**:
```yaml
# extension/src/vsc-scripts/debug/start.meta.yaml
params:
  wait:
    type: boolean
    required: false
    default: false
    description: Wait for breakpoint/error/exit after launch (like tests.debug-single)
```

**3. Update generated schema**:
```typescript
// extension/src/vsc-scripts/generated/schemas.ts
"debug.start": z.object({
  launch: z.string(),
  folder: z.string().optional(),
  timeoutMs: z.coerce.number().default(30000).optional(),
  wait: z.coerce.boolean().default(false).optional(),  // NEW
}).strict(),
```

### Building and Installing (Step 4-5)

```bash
# Full build and install
just build && just install-extension
```

**Output verification**:
```
✅ Manifest generated successfully!
✅ Generated Zod schemas for 35 scripts
✅ Extension installed! Restart VS Code to use the updated version.
```

### Reloading VS Code (Step 6)

```bash
vscb script run utils.restart-vscode
```

**Expected**: Error message (this means it worked!)

### First Test - Bug Discovery (Step 7)

```bash
# Set breakpoint
vscb script run bp.set \
  --param path="$(pwd)/extension/src/core/registry/ScriptRegistry.ts" \
  --param line=97

# Test with --wait
vscb script run debug.start \
  --param launch="Run Extension" \
  --param timeoutMs=60000 \
  --param wait=true
```

**Result**: ❌ Shows `"event": "terminated"` instead of `"event": "stopped"`

**Problem**: The debugger IS paused at the breakpoint, but the response is wrong!

### Investigation Round 2

**Use subagent to analyze**:
```bash
Task --subagent_type "general-purpose" \
  --prompt "Investigate why waitUntilPausedAndGetLocation returns 'terminated'
           instead of 'stopped' when the debugger is paused at a breakpoint..."
```

**Findings**:
- `debug.start` uses `useActiveSession=false` (4th parameter)
- This validates a specific session ID
- The session object becomes stale after `startDebugging()`
- Session ID validation fails, returns "terminated"
- **Solution**: Use `useActiveSession=true` like `tests.debug-single` does

### Second Fix

```javascript
// Change from:
const outcome = await waitUntilPausedAndGetLocation(session, params.timeoutMs, vscode, false);

// To:
const outcome = await waitUntilPausedAndGetLocation(session, params.timeoutMs, vscode, true);
```

**Rebuild and test**:
```bash
just build && just install-extension
vscb script run utils.restart-vscode
```

### Final Test - Success! (Step 8)

```bash
# Set breakpoint
vscb script run bp.set \
  --param path="$(pwd)/extension/src/core/registry/ScriptRegistry.ts" \
  --param line=97

# Test with --wait
vscb script run debug.start \
  --param launch="Run Extension" \
  --param wait=true
```

**Result**: ✅
```json
{
  "ok": true,
  "data": {
    "sessionId": "...",
    "event": "stopped",
    "file": "/Users/.../ScriptRegistry.ts",
    "line": 97,
    "column": 9,
    "functionName": "ScriptRegistry.discover"
  }
}
```

**Test without --wait** (verify backward compatibility):
```bash
vscb script run debug.stop
vscb script run debug.start --param launch="Run Extension"
```

**Result**: ✅ Returns immediately with session info only (no event/file/line)

### Verification Complete

- ✅ New flag works correctly
- ✅ Legacy behavior preserved
- ✅ Both modes tested and working
- ✅ Ready to commit!

## 10. Key Insights

### Working Directory Matters

**Rule of thumb**:
- **Extension Host lifecycle** (`debug.start`, `debug.stop`): Run from project root
- **Test/debug commands** (`tests.debug-single`, `bp.set`): Run from `test/` workspace
- **Always check**: Use `pwd` before running commands

**Why?**: The CLI looks for `.vsc-bridge/` directory to communicate with the extension. This directory is created where the Extension Host opens its workspace.

### Session Management

**Important constraints**:
- Only ONE debug session can be active at a time
- Always stop current session before starting a new test
- Use `debug.status` to check current state

**Common workflow**:
```bash
# Stop any existing session
vscb script run debug.stop

# Start new session
vscb script run debug.start ...
```

### Debugging the Extension Itself (Dogfooding)

You can use the extension to debug its own source code!

**Setup**:
```bash
# Set breakpoint in extension source
vscb script run bp.set \
  --param path="$(pwd)/extension/src/core/registry/ScriptRegistry.ts" \
  --param line=97

# Launch Extension Host (opens test/ workspace)
vscb script run debug.start --param launch="Run Extension" --param wait=true

# Any CLI command will trigger extension code → hit your breakpoint!
```

**When paused, inspect extension internals**:
```bash
vscb script run debug.stack
vscb script run debug.list-variables --param scope=local
vscb script run debug.evaluate --param expression="scriptName"
```

This is incredibly powerful for understanding how the extension works!

### Build Artifacts and Caching

**What gets generated**:
- `manifest.json` - From `.meta.yaml` files
- `schemas.ts` - From manifest metadata
- `out/*.js` - From TypeScript compilation + webpack bundling

**When to rebuild**:
- ✅ After code changes
- ✅ After `.meta.yaml` changes
- ✅ After adding/removing scripts
- ❌ Not needed for test data changes
- ❌ Not needed for documentation changes

**Clean rebuild** (if things get weird):
```bash
# Clean and rebuild
rm -rf extension/out cli/dist mcp-server/dist
just build
```

### Common Gotchas

**1. Forgot to reload after install**
- Symptom: Changes don't take effect
- Fix: Run `vscb script run utils.restart-vscode`

**2. Wrong working directory**
- Symptom: `E_NO_BRIDGE` or `.vsc-bridge/ not found`
- Fix: Check `pwd`, use correct directory for the command

**3. Stale session**
- Symptom: Commands fail with `E_NO_SESSION`
- Fix: Stop old session, start new one

**4. Metadata out of sync**
- Symptom: CLI shows old parameters
- Fix: Run `just build` to regenerate manifest

**5. Extension Host zombie**
- Symptom: Multiple debug sessions showing up
- Fix: Close all Extension Host windows, restart from VS Code

## Quick Reference

### Essential Commands

```bash
# Build and install
just build && just install-extension

# Reload VS Code
vscb script run utils.restart-vscode

# Breakpoint management
vscb script run bp.set --param path="..." --param line=N
vscb script run bp.clear.project

# Debug session control
vscb script run debug.start --param launch="Run Extension"
vscb script run debug.stop
vscb script run debug.status

# Inspection
vscb script run debug.stack
vscb script run debug.list-variables --param scope=local

# Help
vscb script list
vscb script info <command-name>
```

### Workflow Shortcuts

```bash
# Full rebuild and test cycle
just build && \
just install-extension && \
vscb script run utils.restart-vscode

# After VS Code reloads:
vscb script run debug.start --param launch="Run Extension" --param wait=true
```

## Conclusion

This workflow enables true dogfooding - using the extension to develop itself. The cycle becomes:

1. **Find** → Use grep and glob to search code
2. **Fix** → Edit code and metadata
3. **Build** → `just build && just install-extension`
4. **Reload** → `vscb script run utils.restart-vscode`
5. **Test** → Use CLI commands to verify
6. **Debug** → Set breakpoints in extension source, use extension to debug itself
7. **Iterate** → Repeat until working

The power of this approach is that you're constantly testing the extension in real-world scenarios - because you're using it to build itself!

Happy dogfooding! 🐕
