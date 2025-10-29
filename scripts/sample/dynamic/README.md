# Dynamic Script Samples

This directory contains hot-reloadable JavaScript scripts for VSC-Bridge that demonstrate debugging capabilities and serve as user samples.

## What are Dynamic Scripts?

Dynamic scripts are JavaScript files that can be executed by VSC-Bridge **without compilation**. They run in a secure VM context with access to VS Code APIs through dependency injection.

### Key Benefits

- **Hot Reload**: Edit → Save → Run (no compilation step!)
- **Rapid Iteration**: Perfect for prototyping debugging workflows
- **User Samples**: Show users how to interact with VS Code's debugging APIs
- **Development → Bake-in**: Proven scripts can be converted to permanent extension features

## How to Use

### Prerequisites

1. **Extension Host Running**: Press F5 in VS Code to launch the Extension Development Host
2. **Test Workspace Open**: Open a test workspace in the Extension Host window
3. **CLI Configured**: Run `just cli-setup` (or manually configure auth token)

### Running Dynamic Scripts

**From test workspace terminal:**

```bash
# Using justfile shortcuts (recommended)
just sample-bp-list                    # List all breakpoints

# Using vscb CLI directly
vscb script run -f ./samples/dynamic/list-breakpoints.js

# Generic dynamic runner
just dynamic ./samples/dynamic/list-breakpoints.js
```

### Hot-Reload Workflow

```bash
# 1. Compile extension (one-time)
just dev-compile

# 2. Launch Extension Host (F5 in VS Code)

# 3. In Extension Host: Open test workspace

# 4. Set some breakpoints in test-program.js

# 5. Run script
just sample-bp-list

# 6. Edit list-breakpoints.js (add a console.log)

# 7. Save and immediately re-run
just sample-bp-list  # <- Change visible instantly!
```

## Script Structure

All dynamic scripts follow this pattern:

```javascript
/**
 * Script description
 */

module.exports = async function(bridgeContext, params) {
    // Access VS Code API through injected bridgeContext
    const vscode = bridgeContext.vscode;

    // IMPORTANT: Do NOT use require('vscode')
    // The script runs in a VM context - dependencies are injected

    // Your logic here...

    // Optional: Log to output channel
    bridgeContext.logger.info('Message');

    // Optional: Console.log for immediate feedback
    console.log('Debug output');

    // Return structured data
    return {
        result: 'your data'
    };
};
```

## BridgeContext API

The `bridgeContext` parameter provides:

- **`vscode`**: Full VS Code API
  - `vscode.debug.breakpoints` - Access breakpoints
  - `vscode.debug.activeDebugSession` - Current debug session
  - `vscode.workspace` - Workspace APIs
  - `vscode.window` - Window/UI APIs

- **`logger`**: Output channel logging
  - `logger.info(message)` - Info level
  - `logger.warn(message)` - Warning level
  - `logger.error(message)` - Error level

- **`params`**: Command-line parameters
  - Pass with `--param key=value`
  - Access via `params.key`

## Available Samples

### `list-breakpoints.js`

Lists all source breakpoints in the current VS Code workspace.

**Usage:**
```bash
just sample-bp-list
```

**Returns:**
```json
{
  "breakpoints": [
    {
      "path": "/path/to/file.js",
      "line": 17,
      "enabled": true,
      "condition": "x > 10"
    }
  ],
  "total": 1
}
```

### `test-program.js`

A simple Node.js program to use as a debugging target.

**Usage:**
1. Open `test-program.js` in VS Code
2. Set breakpoint on line 17 (debugger statement)
3. Press F5 to start debugging
4. While paused, run: `just sample-bp-list`

### `echo-message.js`

Interactive script demonstrating both hot-reload and parameter passing.

**Features:**
- Accepts multiple parameters with defaults
- Hot-reload without compilation
- Type handling (strings, booleans)

**Usage Examples:**
```bash
# Default message
just sample-echo

# Custom greeting
just sample-echo --param greeting="Howdy"

# Multiple parameters
just sample-echo --param greeting="Hi" --param name="Friend" --param shout=true

# Run all parameter tests
just sample-echo-test

# Test hot-reload workflow
# 1. Run once
just sample-echo --param greeting="Version 1"
# 2. Edit scriptVersion in the file (change "1.0" to "2.0")
# 3. Save and run again - changes appear immediately!
just sample-echo --param greeting="Version 2"
```

**Available Parameters:**
- `greeting` (string): The greeting word (default: "Hello")
- `name` (string): Who to greet (default: "World")
- `shout` (boolean): Convert to uppercase (default: false)

**Returns:**
```json
{
  "message": "Hello, World!",
  "version": "1.0",
  "parameters": {
    "greeting": "Hello",
    "name": "World",
    "shout": false,
    "raw": {}
  },
  "timestamp": "2025-10-02T..."
}
```

## Development Workflow

### Phase 1-5: Rapid Iteration

1. Create script in `samples/dynamic/`
2. Test with hot-reload workflow
3. Iterate until perfected
4. Keep script as permanent sample

### Phase 6: Bake-in (Future)

Once scripts are proven through rapid iteration:

1. Convert to TypeScript
2. Move to `extension/src/vsc-scripts/`
3. Add to script registry
4. Keep original in `samples/dynamic/` as documentation

## Troubleshooting

### "vscode is not defined"

**Problem:** Using `require('vscode')` instead of `bridgeContext.vscode`

**Solution:**
```javascript
// ❌ Wrong - won't work in VM context
const vscode = require('vscode');

// ✅ Correct - use injected dependency
const vscode = bridgeContext.vscode;
```

### "Extension Host not running"

**Problem:** Scripts require active extension instance

**Solution:**
1. Press F5 in VS Code
2. Open test workspace in Extension Host
3. Run script from test workspace terminal

### "Command 'vscb' not found"

**Problem:** CLI not configured or PATH issue

**Solution:**
```bash
# Option 1: Use direct node execution
node cli/dist/index.js script run -f ./samples/dynamic/list-breakpoints.js

# Option 2: Link CLI globally (from project root)
cd cli && npm link
```

## Next Steps

- Explore existing samples in this directory
- Create your own dynamic scripts
- Share useful scripts with the community
- Propose scripts for baking into the extension

## Resources

- [How Scripts Work](../../docs/how/how-scripts-work.md)
- [Dynamic Module Loading](../../extension/src/core/dynamic/loadDynamicModule.ts)
- [Script Registry](../../extension/src/core/registry/ScriptRegistry.ts)
