# How the VSC-Bridge CLI Works

This document provides comprehensive documentation of the VSC-Bridge CLI (`vscb`), explaining its architecture, features, and usage patterns.

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Core Commands](#core-commands)
- [Script System](#script-system)
- [Path Resolution](#path-resolution)
- [Built-in Scripts](#built-in-scripts)
- [Practical Examples](#practical-examples)
- [Advanced Topics](#advanced-topics)
- [Troubleshooting](#troubleshooting)

## Overview

The VSC-Bridge CLI is a command-line tool that enables interaction with VS Code through a filesystem-based communication bridge. It allows you to:

- Set and manage breakpoints
- Control debugging sessions
- Execute VS Code commands
- Run custom scripts with full VS Code API access
- Automate VS Code operations from the terminal

### Key Evolution

The CLI has evolved from HTTP-based communication to a **filesystem bridge** architecture, eliminating the need for:
- Authentication tokens
- Server URLs
- Network configuration
- Port management

## Architecture

### Filesystem Bridge

The CLI communicates with the VS Code extension through a shared filesystem directory structure:

```
.vsc-bridge/                 # Bridge root (in workspace)
├── host.json               # Extension metadata
├── execute/                # Job execution directory
│   └── <job-id>/          # Individual job directories
│       ├── command.json   # CLI writes command here
│       ├── claimed.json   # Extension claims job
│       ├── response.json  # Extension writes response
│       ├── error.json     # Error responses
│       ├── events.ndjson  # Streaming events
│       ├── data-*.json    # Large payloads
│       ├── cancel         # Cancellation sentinel
│       └── done           # Completion marker
└── scripts/               # Custom workspace scripts
```

### Communication Flow

1. **Discovery**: CLI searches upward from CWD to find `.vsc-bridge/` directory
2. **Command Creation**: CLI creates command file with unique job ID
3. **Job Processing**: Extension monitors and processes new jobs
4. **Response Handling**: CLI polls for completion and reads response
5. **Cleanup**: Old job directories are automatically cleaned up

### Job ID Format

Jobs use sortable, Windows-safe IDs:
```
Format: YYYYMMDDTHHMMSSfffZ-<seq>-<rand>
Example: 20250916T124512083Z-0001-ab12
```

## Getting Started

### Prerequisites

1. **VS Code with VSC-Bridge Extension**: Ensure the extension is installed and active
2. **Open Workspace**: VS Code must have a workspace/folder open
3. **Verify Connection**:
   ```bash
   vscb status
   ```

### Configuration

The CLI stores configuration in `~/.vscbridge/config.json`:

```bash
# Show current configuration
vscb config

# Set output format
vscb config set outputFormat json    # json, pretty, or auto

# Enable danger mode acknowledgment
vscb config set dangerModeAcknowledged true

# Reset to defaults
vscb config reset
```

## Core Commands

### 1. Script Command

The main command for interacting with VSC-Bridge scripts.

#### List Scripts
```bash
# List all available scripts (pretty format)
vscb script list

# JSON output for scripting
vscb script list --json
```

#### Run Scripts
```bash
# Run a built-in script (relative path)
vscb script run bp.set --param path=test.py --param line=10

# Run with multiple parameters
vscb script run bp.set \
  --param path=src/main.py \
  --param line=10 \
  --param condition="x > 5"

# Run a script file directly
vscb script run -f ./my-script.js --param foo=bar

# Skip parameter validation
vscb script run bp.set --no-validate --param path=./test.py
```

#### Get Script Info
```bash
# Show detailed information about a script
vscb script info bp.set

# JSON format
vscb script info bp.set --json
```

### 2. Exec Command (Danger Mode)

Execute arbitrary JavaScript code in the VS Code context.

**⚠️ WARNING**: Requires danger mode to be enabled in VS Code settings.

```bash
# Simple expression
vscb exec "vscode.window.showInformationMessage('Hello!')" --yes

# Multi-line code
vscb exec "
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    return editor.document.fileName;
  }
  return 'No active editor';
" --yes

# Execute from file
vscb exec --file ./custom-operation.js --yes

# Skip confirmation prompt (if already acknowledged)
vscb config set dangerModeAcknowledged true
vscb exec "return 42"
```

### 3. Status Command

Check the health and connection status of the VSC-Bridge.

```bash
# Check status
vscb status

# JSON output
vscb status --json
```

Output shows:
- Connection health
- Last activity timestamp
- Transport type (filesystem bridge)
- Troubleshooting hints if unhealthy

### 4. Config Command

Manage CLI configuration settings.

```bash
# Show all settings
vscb config

# Get specific value
vscb config get outputFormat

# Set values
vscb config set outputFormat json
vscb config set dangerModeAcknowledged true

# Reset to defaults
vscb config reset
```

## Script System

### Three-Tier Validation

The script system uses a flexible validation hierarchy:

#### Tier 1: Built-in Scripts (Strict)
- Pre-compiled with generated Zod schemas
- Parameters strictly validated
- Type coercion automatically applied
- Validation failures prevent execution

#### Tier 2: Dynamic Scripts (Optional)
- User-created scripts with custom validation
- Can include `paramsSchema` or metadata
- Validation applied if present

#### Tier 3: Test/Mock Scripts (Pass-through)
- No validation schema required
- Parameters passed as-is
- Basic type coercion still applied

### Script Discovery

Dynamic scripts are discovered from two locations (in priority order):

1. **Workspace Scripts**: `.vsc-bridge/scripts/` in current workspace
2. **User Scripts**: `~/.vscbridge/scripts/` in home directory

Built-in scripts are accessed through the manifest using their registered aliases (e.g., `bp.set`, `debug.start`) and are not discovered dynamically.

### Parameter System

#### Parameter Syntax
```bash
# Basic parameters
--param key=value

# Multiple parameters
--param path=/file.py --param line=10 --param enabled=true

# Complex values (quoted)
--param condition="x > 5 && y < 10"
--param message="Hello, World!"
```

#### Type Coercion
The CLI automatically converts parameter types:
- `"true"` / `"false"` → boolean
- Numeric strings → numbers
- Everything else → strings

#### Validation
Parameters are validated against script metadata when available:
- Required parameters must be provided
- Types must match (string, number, boolean, enum)
- Values must satisfy constraints (min/max, pattern, enum values)

### Path Resolution

The CLI supports both absolute and relative file paths for all file-based parameters. Relative paths are resolved from your current working directory, making commands more portable and easier to type.

#### How Path Resolution Works

When you provide a relative path, the CLI:
1. Detects that the path is relative (doesn't start with `/` on Unix or drive letter on Windows)
2. Resolves it relative to your current working directory
3. Sends the absolute path to VS Code

#### Examples

```bash
# Simple relative path
vscb script run bp.set --param path=test.py --param line=10
# Resolves to: /current/working/directory/test.py

# Nested relative path
vscb script run bp.set --param path=src/main.py --param line=42
# Resolves to: /current/working/directory/src/main.py

# Current directory notation
vscb script run bp.set --param path=./test.py --param line=10
# Resolves to: /current/working/directory/test.py

# Parent directory
vscb script run bp.clear.file --param path=../lib/utils.py
# Resolves to: /current/working/../lib/utils.py

# Absolute paths still work
vscb script run bp.set --param path=/absolute/path/file.py --param line=10
```

#### Debugging Path Resolution

If you encounter path-related issues, enable debug logging:

```bash
# Enable path resolution debugging
DEBUG=vscb:path vscb script run bp.set --param path=test.py --param line=10

# Output will show:
# [vscb:path] CWD-relative: 'test.py' -> '/home/user/project/test.py' (cwd: /home/user/project)
```

#### Path Resolution in Error Messages

When validation fails, error messages show both the original and resolved paths:

```
✗ path: File not found
  Original path: ./test.py
  Resolved to: /home/user/project/test.py
  Resolution strategy: cwd-relative
```

## Built-in Scripts

### Breakpoint Scripts (`bp.*`)

| Script | Description | Key Parameters |
|--------|-------------|----------------|
| `bp.set` | Set a breakpoint | `path`, `line`, `condition`, `hitCondition`, `logMessage` |
| `bp.remove` | Remove specific breakpoint | `path`, `line` |
| `bp.clear.file` | Clear file breakpoints | `path` |
| `bp.clear.project` | Clear all breakpoints | None |
| `bp.list` | List all breakpoints | None |

### Debug Scripts (`debug.*`, `dbg.*`)

| Script | Description | Key Parameters |
|--------|-------------|----------------|
| `debug.start` | Start debug session | `launch`, `stopOnEntry` |
| `debug.continue` | Continue execution | None |
| `debug.step-over` | Step over line | None |
| `debug.step-into` | Step into function | None |
| `debug.step-out` | Step out of function | None |
| `debug.stack` | Get call stack | `threadId`, `startFrame`, `levels` |
| `debug.threads` | List threads | None |
| `debug.list-variables` | Get variables | `reference`, `filter`, `start`, `count` |
| `debug.evaluate` | Evaluate expression | `expression`, `frameId`, `context` |
| `debug.restart` | Restart session | `sessionId` |
| `debug.stop` | Stop debugging | `sessionId` |
| `debug.wait-for-hit` | Wait for breakpoint | `timeout` |
| `debug.scopes` | Get scopes | `frameId` |

### Diagnostic Scripts (`diag.*`)

| Script | Description | Key Parameters |
|--------|-------------|----------------|
| `diag.collect` | Collect diagnostics | `includeSystem`, `includeExtensions` |

## Practical Examples

### Example 1: Setting and Managing Breakpoints

```bash
# Clear all existing breakpoints
vscb script run bp.clear.project

# Set a simple breakpoint
vscb script run bp.set \
  --param path=main.py \
  --param line=42

# Set a conditional breakpoint
vscb script run bp.set \
  --param path=main.py \
  --param line=42 \
  --param condition="user_id == 123"

# Set a hit count breakpoint (break after 10 hits)
vscb script run bp.set \
  --param path=main.py \
  --param line=42 \
  --param hitCondition=">10"

# Set a logpoint (doesn't break, just logs)
vscb script run bp.set \
  --param path=main.py \
  --param line=42 \
  --param logMessage="User: {user_id}, Action: {action}"

# List all breakpoints
vscb script run bp.list --json

# Remove a specific breakpoint
vscb script run bp.remove \
  --param path=main.py \
  --param line=42

# Clear breakpoints in a specific file
vscb script run bp.clear.file \
  --param path=main.py
```

### Example 2: Complete Debugging Workflow

```bash
#!/bin/bash
# debug-workflow.sh

# 1. Clear existing breakpoints
vscb script run bp.clear.project

# 2. Set strategic breakpoints
vscb script run bp.set --param path=src/main.py --param line=10
vscb script run bp.set --param path=src/main.py --param line=25
vscb script run bp.set --param path=src/utils.py --param line=5

# 3. Start debugging
vscb script run debug.start --param launch="Python: Current File"

# 4. Wait for first breakpoint hit
vscb script run debug.wait-for-hit --param timeout=5000

# 5. Examine variables
vscb script run debug.list-variables

# 6. Step through code
vscb script run debug.step-over
vscb script run debug.step-into

# 7. Continue to next breakpoint
vscb script run debug.continue

# 8. Get call stack
vscb script run debug.stack

# 9. Evaluate expression
vscb script run debug.evaluate --param expression="len(data)"

# 10. Stop debugging
vscb script run debug.stop
```

### Example 3: Running Custom Scripts

Create a custom script file `toggle-comment.js`:

```javascript
/**
 * @name toggle.comment
 * @description Toggle comment on current line
 */
module.exports.default = async function(params, context) {
    const editor = context.window.activeTextEditor;
    if (!editor) {
        return { success: false, error: "No active editor" };
    }

    await context.commands.executeCommand("editor.action.commentLine");

    return {
        success: true,
        line: editor.selection.active.line + 1
    };
};
```

Run it:
```bash
# Run the custom script
vscb script run -f ./toggle-comment.js

# Place it in discovery location for reuse
cp toggle-comment.js ~/.vscbridge/scripts/
vscb script list  # Now shows toggle.comment
vscb script run toggle.comment
```

### Example 4: CI/CD Integration

```yaml
# .github/workflows/debug.yml
name: Debug Analysis

on: [push]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Start VS Code Server
        run: |
          code-server --install-extension vsc-bridge
          code-server . &

      - name: Wait for Bridge
        run: |
          for i in {1..30}; do
            vscb status && break
            sleep 1
          done

      - name: Set Breakpoints
        run: |
          # Read breakpoints from config
          cat .debug/breakpoints.json | jq -r '.[]' | while read bp; do
            path=$(echo $bp | jq -r .path)
            line=$(echo $bp | jq -r .line)
            vscb script run bp.set --param path=$path --param line=$line
          done

      - name: Run Debug Analysis
        run: |
          vscb script run debug.start --param launch="Test Suite"
          vscb script run debug.wait-for-hit --param timeout=30000
          vscb script run debug.list-variables --json > variables.json
          vscb script run debug.stack --json > stack.json
```

## Advanced Topics

### Writing Custom Scripts

#### Basic Structure
```javascript
/**
 * @name my.custom.script
 * @description Custom operation
 * @category custom
 * @param {string} input - Input parameter
 * @param {number} [count=1] - Optional count
 */

module.exports.meta = {
    name: "my.custom.script",
    description: "Custom operation",
    params: {
        input: { type: "string", required: true },
        count: { type: "number", default: 1 }
    }
};

module.exports.default = async function(params, context) {
    const { input, count = 1 } = params;

    // Access VS Code APIs
    const doc = await context.workspace.openTextDocument(input);
    await context.window.showTextDocument(doc);

    return {
        success: true,
        message: `Processed ${input} ${count} time(s)`
    };
};
```

#### With Validation
```javascript
const { z } = require('zod');

module.exports.paramsSchema = z.object({
    path: z.string().min(1),
    line: z.number().int().positive(),
    enabled: z.boolean().default(true)
});

module.exports.default = async function(params, context) {
    // params are pre-validated
    return { success: true };
};
```

### Event Streaming

For long-running operations, scripts can stream events:

```javascript
module.exports.default = async function(params, context) {
    const { eventWriter } = context;

    for (let i = 0; i < 10; i++) {
        eventWriter?.write({
            type: 'progress',
            progress: i * 10,
            message: `Processing step ${i + 1}`
        });

        await new Promise(r => setTimeout(r, 1000));
    }

    return { success: true };
};
```

Monitor events from CLI:
```bash
# Events are automatically displayed during execution
vscb script run -f ./streaming-script.js
```

### Output Formats

The CLI supports intelligent output formatting:

```bash
# Auto-detect (default)
vscb script list              # Pretty in terminal
vscb script list | jq '.'     # JSON when piped

# Force format
vscb script list --json       # Always JSON
vscb script list --output=pretty  # Always pretty

# Set default
vscb config set outputFormat json
```

### Environment Variables

```bash
# Enable debug output
DEBUG=1 vscb script list

# Disable colors
NO_COLOR=1 vscb script list

# Custom bridge location (for testing)
VSC_BRIDGE_ROOT=/custom/path vscb status
```

## Troubleshooting

### Common Issues

#### "VSC Bridge not found"
- **Cause**: No `.vsc-bridge/` directory in workspace hierarchy
- **Solution**:
  - Ensure VS Code is open with a workspace/folder
  - Check the extension is installed and activated
  - Navigate to a directory within the workspace

#### "Command timed out"
- **Cause**: Extension not processing commands
- **Solution**:
  - Check VS Code is running and responsive
  - Verify with `vscb status`
  - Increase timeout: `--timeout 60000`

#### "Script not found"
- **Cause**: Script alias doesn't exist or incorrect name used
- **Solution**:
  - List available scripts: `vscb script list`
  - Use full alias (e.g., `bp.set` not just `set`)
  - For custom scripts, check `.vsc-bridge/scripts/` or `~/.vscbridge/scripts/`
  - Verify script file has `.js` extension

#### "Parameter validation failed"
- **Cause**: Invalid parameter types or values
- **Solution**:
  - Check script info: `vscb script info <name>`
  - Verify parameter types and constraints
  - Use `--no-validate` to bypass (for testing)

#### "Danger mode not enabled"
- **Cause**: Trying to use `exec` without danger mode
- **Solution**:
  1. Open VS Code settings
  2. Search for "vscBridge.dangerMode"
  3. Enable the checkbox
  4. Retry the command

#### "File not found" with Relative Paths
- **Cause**: File doesn't exist at the resolved location
- **Solution**:
  - Check your current directory: `pwd`
  - Verify the file exists: `ls <path>`
  - Use debug logging: `DEBUG=vscb:path vscb script run ...`
  - Review the resolved path in error messages

#### Path Resolution Issues
- **Platform Differences**:
  - Unix/Mac: Use forward slashes (`src/main.py`)
  - Windows: Both forward and backslashes work (`src\main.py` or `src/main.py`)
- **Home Directory**:
  - The `~` notation is NOT automatically expanded
  - Use explicit paths or environment variables instead

### Debugging Tips

1. **Enable Debug Output**:
   ```bash
   DEBUG=1 vscb script run bp.set --param path=/file.py --param line=10
   ```

2. **Check Bridge Health**:
   ```bash
   vscb status --json | jq '.'
   ```

3. **Inspect Job Files**:
   ```bash
   ls -la .vsc-bridge/execute/*/
   cat .vsc-bridge/execute/*/error.json
   ```

4. **Verify Script Discovery**:
   ```bash
   # List all discovery locations
   ls ~/.vscbridge/scripts/
   ls .vsc-bridge/scripts/
   ```

5. **Test Script Validation**:
   ```bash
   # Test parameter validation without execution
   vscb script info bp.set --json | jq '.params'
   ```

### Performance Considerations

- **Polling Interval**: WSL uses 150ms, native uses 50ms
- **Job Cleanup**: Old jobs cleaned after 5 minutes
- **Large Payloads**: Data > 10KB written to separate files
- **Atomic Operations**: All writes use temp file + rename pattern

## Security Notes

- Scripts execute with full VS Code API access
- No additional sandboxing beyond JavaScript runtime
- Custom scripts should be reviewed before execution
- Danger mode requires explicit user acknowledgment
- All operations are confined to local filesystem

## Migration from HTTP

If migrating from the older HTTP-based CLI:

| Old | New |
|-----|-----|
| `vscb config set authToken <token>` | Not needed |
| `vscb config set serverUrl <url>` | Not needed |
| HTTP port 3001 | Filesystem bridge |
| Authentication required | Automatic via filesystem |
| Network configuration | Local filesystem only |

The new filesystem bridge is more reliable, faster, and doesn't require any network configuration or authentication setup.