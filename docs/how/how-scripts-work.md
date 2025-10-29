# How Scripts Work in VSC-Bridge

This document explains the VSC-Bridge script system, which provides a powerful and flexible way to execute VS Code commands and operations through a unified interface.

## Table of Contents
- [Overview](#overview)
- [Quick Start: Dynamic Scripts](#quick-start-dynamic-scripts)
- [Three-Tier Validation System](#three-tier-validation-system)
- [Script Types](#script-types)
- [Script Discovery](#script-discovery)
- [Writing Custom Scripts](#writing-custom-scripts)
- [Parameter Validation](#parameter-validation)
- [Available VS Code APIs](#available-vs-code-apis)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

VSC-Bridge scripts are JavaScript modules that can interact with VS Code's API to perform various operations. Scripts can be:
- **Built-in**: Pre-compiled scripts shipped with the extension
- **Dynamic**: User-created scripts discovered from standard locations
- **One-off**: Scripts executed directly from a file path

## Quick Start: Dynamic Scripts

Dynamic scripts are the fastest way to get started with VSC-Bridge. They require **no compilation** and support **hot-reload**, meaning you can edit and re-run them immediately to see changes.

### Key Benefits
- **No compilation needed** - Write JavaScript and run it immediately
- **Hot-reload** - Changes take effect on next execution without restart
- **Parameter passing** - Accept and parse command-line parameters
- **Full VS Code API access** - Use BridgeContext to access VS Code APIs
- **Simple structure** - Just export a function, no boilerplate required

### Example 1: List Breakpoints

This script demonstrates accessing VS Code's debug API to retrieve all breakpoints.

**Location**: `scripts/sample/dynamic/list-breakpoints.js`

```javascript
/**
 * List Breakpoints - Dynamic Script Sample
 *
 * This script demonstrates how to access VS Code's breakpoint API
 * using a dynamic script with the VSC-Bridge system.
 */

module.exports = async function(bridgeContext, params) {
    // Access VS Code API through injected bridgeContext
    // IMPORTANT: Do NOT use require('vscode') - it won't work in VM context
    const vscode = bridgeContext.vscode;

    // Get all breakpoints from VS Code
    const allBreakpoints = vscode.debug.breakpoints;

    // Filter to source breakpoints only (not function or data breakpoints)
    const sourceBreakpoints = allBreakpoints
        .filter(bp => bp instanceof vscode.SourceBreakpoint)
        .map(bp => ({
            path: bp.location.uri.fsPath,
            line: bp.location.range.start.line + 1,  // Convert 0-indexed to 1-indexed
            enabled: bp.enabled,
            condition: bp.condition || undefined,
            hitCondition: bp.hitCondition || undefined,
            logMessage: bp.logMessage || undefined
        }));

    // Log to output channel for debugging
    bridgeContext.logger.info(`Found ${sourceBreakpoints.length} breakpoints`);

    // Return structured data
    return {
        breakpoints: sourceBreakpoints,
        total: sourceBreakpoints.length
    };
};
```

**Usage**:
```bash
# Via CLI
vscb script run -f ./scripts/sample/dynamic/list-breakpoints.js

# Via justfile
just sample-bp-list
```

**Key Takeaways**:
- Use `bridgeContext.vscode` to access VS Code APIs (never `require('vscode')`)
- Use `bridgeContext.logger` for output channel logging
- Return structured data for easy consumption
- Simple function export with `module.exports`

### Example 2: Echo Message with Parameters

This script demonstrates parameter parsing, defaults, and hot-reload capability.

**Location**: `scripts/sample/dynamic/echo-message.js`

```javascript
/**
 * Echo Message - Dynamic Script Hot-Reload Test with Parameters
 *
 * This script demonstrates:
 * 1. Hot-reload capability (change without recompilation)
 * 2. Parameter passing and parsing
 */

module.exports = async function(bridgeContext, params) {
    // Default values
    const defaultGreeting = "Hello";
    const scriptVersion = "2.0-HOTRELOAD";  // CHANGE THIS to test hot-reload

    // Parse parameters - params is an object with key-value pairs
    const greeting = params?.greeting || defaultGreeting;
    const name = params?.name || "World";
    const shout = params?.shout === "true" || params?.shout === true;

    // Build the message
    let baseMessage = `${greeting}, ${name}!`;
    const fullMessage = shout ? baseMessage.toUpperCase() : baseMessage;

    // Version indicator - CHANGE THIS to test hot-reload
    const versionMessage = `[Dynamic Script v${scriptVersion}]`;

    // Log to output channel
    bridgeContext.logger.info(`Echo script called with params: ${JSON.stringify(params)}`);
    bridgeContext.logger.info(`Generated message: ${fullMessage}`);

    // Console output for immediate CLI feedback
    console.log(`\n🔊 ECHO MESSAGE ${versionMessage}:`);
    console.log(`${fullMessage}`);
    console.log(`\n📊 Parameters received:`);
    console.log(`  - greeting: "${greeting}" (default: "${defaultGreeting}")`);
    console.log(`  - name: "${name}" (default: "World")`);
    console.log(`  - shout: ${shout} (default: false)`);

    // Return structured data
    return {
        message: fullMessage,
        version: scriptVersion,
        parameters: {
            greeting,
            name,
            shout,
            raw: params
        },
        timestamp: new Date().toISOString()
    };
};
```

**Usage**:
```bash
# Via CLI with default parameters
vscb script run -f ./scripts/sample/dynamic/echo-message.js

# Via CLI with custom parameters
vscb script run -f ./scripts/sample/dynamic/echo-message.js --param greeting="Good morning" --param name="Developer" --param shout=true

# Via justfile
just sample-echo --param greeting="Good morning"
```

**Key Takeaways**:
- Parameters are passed as an object with key-value pairs
- Provide sensible defaults for optional parameters
- Handle type coercion for boolean values (string "true" to boolean)
- Change the `scriptVersion` constant and re-run to see hot-reload in action
- Use both `bridgeContext.logger` for VS Code output and `console.log` for CLI feedback

### Testing Hot-Reload

To see hot-reload in action with the echo-message script:

1. Run the script once: `vscb script run -f ./scripts/sample/dynamic/echo-message.js`
2. Note the version number in the output
3. Edit `scripts/sample/dynamic/echo-message.js` and change `scriptVersion` to a different value
4. Run the script again **without restarting VS Code**
5. See the new version number in the output

No compilation, no restart - just edit and run!

## Three-Tier Validation System

The script system uses a flexible three-tier validation approach:

### Tier 1: Baked-in Scripts (Strict)
- Scripts included in the extension with generated Zod schemas
- Parameters are strictly validated against the generated schema
- Type coercion is automatically applied (e.g., "10" → 10)
- Validation failures prevent script execution

### Tier 2: Dynamic Scripts (Optional)
- Scripts that provide their own validation logic
- Can include a `paramsSchema` property or `validateParams` method
- Validation is applied if present, otherwise parameters pass through
- Useful for enforcing custom validation rules

### Tier 3: Test/Mock Scripts (Pass-through)
- Scripts without any validation schema
- Parameters are passed through as-is
- Useful for testing and rapid prototyping
- Basic type coercion still applied for common cases

## Script Types

Scripts inherit from one of four base classes:

### ActionScript
For operations that succeed or fail:
```javascript
export class MyActionScript extends ActionScript {
    async performAction(context, params) {
        // Perform operation
        return { success: true, message: "Operation completed" };
    }
}
```

### QueryScript
For retrieving data:
```javascript
export class MyQueryScript extends QueryScript {
    async query(context, params) {
        // Retrieve and return data
        return { data: results };
    }
}
```

### WaitableScript
For async operations with progress:
```javascript
export class MyWaitableScript extends WaitableScript {
    async wait(context, params) {
        // Perform async operation with progress updates
        this.reportProgress(50, "Halfway done");
        return { result: "Complete" };
    }
}
```

### StreamScript
For deferred or streaming operations:
```javascript
export class MyStreamScript extends StreamScript {
    async stream(context, params) {
        // Return deferred or streaming result
        return { streamId: "12345" };
    }
}
```

## BridgeContext - First Parameter for All Scripts

Starting with VSC-Bridge v1.0.0, all scripts receive a `BridgeContext` object as their first parameter. This provides dependency injection for VS Code APIs and common services, eliminating boilerplate code.

### What is BridgeContext?

BridgeContext is a service container that provides:
- **Safe workspace access** - No crashes when workspace is closed
- **Enhanced logging** - Automatic formatting and context
- **Path utilities** - Cross-platform path handling
- **Debug helpers** - Simplified debug session management
- **Python test detection** - Automatic pytest/unittest configuration

### Basic Usage

```javascript
// Modern scripts receive BridgeContext as first parameter
async execute(bridgeContext, params) {
    // Use enhanced logger instead of console.log
    bridgeContext.logger.info('Script starting...');

    // Safe workspace access (won't crash if no workspace)
    const workspace = bridgeContext.workspace.getDefault();
    if (!workspace) {
        bridgeContext.logger.error('No workspace open');
        return { error: 'No workspace' };
    }

    // Cross-platform path resolution
    const absolutePath = bridgeContext.paths.resolve(params.path);

    // Access VS Code APIs through bridgeContext.vscode
    const doc = await bridgeContext.vscode.workspace.openTextDocument(absolutePath);
}
```

### Available Services

#### Logger Service
Replaces manual OutputChannel management with automatic formatting:

```javascript
// Before (30+ lines of boilerplate per script)
if (ctx.outputChannel) {
    const timestamp = new Date().toISOString();
    ctx.outputChannel.appendLine(`[${timestamp}] [script-name] Message`);
}

// After (1 line)
bridgeContext.logger.info('Message');
bridgeContext.logger.error('Error occurred', error);
bridgeContext.logger.debug('Debug data', { foo: 'bar' });
bridgeContext.logger.warn('Warning message');
```

#### Workspace Service
Safe workspace operations that handle edge cases:

```javascript
// Get default workspace folder (null-safe)
const workspace = bridgeContext.workspace.getDefault();

// Find workspace containing a file
const folder = bridgeContext.workspace.findByPath('/path/to/file.ts');

// Resolve paths to VS Code URIs
const uri = bridgeContext.workspace.resolveUri('./src/file.ts');

// Get all workspace folders
const folders = bridgeContext.workspace.getAll();
```

#### Path Service
Cross-platform path utilities that work with remote workspaces:

```javascript
// Resolve relative paths (handles ~, ./, absolute paths)
const absolute = bridgeContext.paths.resolve('./src/file.ts');

// Convert to workspace-relative path
const relative = bridgeContext.paths.toWorkspaceRelative('/full/path/file.ts');

// Path manipulation
const dir = bridgeContext.paths.getDirectory(filePath);
const filename = bridgeContext.paths.getFilename(filePath);
const ext = bridgeContext.paths.getExtension(filePath);

// Check if paths are the same (case-insensitive on Windows)
const same = bridgeContext.paths.isSame(path1, path2);
```

#### Debug Service
Simplified debug session management:

```javascript
// Get active debug session
const session = bridgeContext.debug.getSession();

// Check if debugging is active
if (bridgeContext.debug.isActive()) {
    bridgeContext.logger.info('Debug session running');
}

// Stop a session
await bridgeContext.debug.stopSession(session);
```

#### Python Test Detection
Automatic detection of Python test frameworks:

```javascript
// Detect pytest/unittest and generate debug config
const pythonEnv = await bridgeContext.getPythonEnv('/path/to/test.py');

if (pythonEnv.framework === 'pytest') {
    // Use generated debug configuration
    const debugConfig = pythonEnv.debugConfig;
    // debugConfig.module = 'pytest'
    // debugConfig.args = ['-q', 'test.py', '--no-cov']
}
```

### Migration from Old Scripts

Old scripts using ScriptContext still work but should be migrated:

```javascript
// Old style (deprecated)
async execute(ctx, params) {
    const vscode = ctx.vscode;
    const outputChannel = ctx.outputChannel;
    if (outputChannel) {
        outputChannel.appendLine('Message');
    }
}

// New style with BridgeContext
async execute(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    bridgeContext.logger.info('Message');
}
```

### Opting Into BridgeContext

Scripts signal they accept BridgeContext using a Symbol:

```javascript
class MyScript extends ActionScript {
    constructor() {
        super();
        // Signal that this script accepts BridgeContext
        this[Symbol.for('bridge.acceptsContext')] = true;
    }

    async execute(bridgeContext, params) {
        // Use BridgeContext services
        bridgeContext.logger.info('Script executing');
    }
}
```

## Script Discovery

Scripts are discovered from three standard locations, in order of priority:

1. **Workspace Scripts**: `.vsc-bridge/scripts/` in your current workspace
2. **User Scripts**: `~/.vscbridge/scripts/` in your home directory
3. **Built-in Scripts**: Shipped with the extension

### Discovery Rules
- Scripts must be `.js` files
- Nested directories are supported
- `node_modules` and hidden directories (starting with `.`) are ignored
- Duplicate names are resolved by location priority

## Writing Custom Scripts

### Basic Script Format (ESM Style)

```javascript
/**
 * @name my.custom.script
 * @description Does something useful in VS Code
 * @category custom
 * @param {string} path - File path to process
 * @param {number} [line] - Optional line number
 */

export const meta = {
    name: "my.custom.script",
    description: "Does something useful",
    params: {
        path: { type: "string", required: true },
        line: { type: "number", required: false, default: 1 }
    }
};

export default async function(bridgeContext, params) {
    const { path, line = 1 } = params;

    // Use enhanced logger for output
    bridgeContext.logger.info(`Opening ${path} at line ${line}`);

    // Safe path resolution
    const absolutePath = bridgeContext.paths.resolve(path);

    // Use VS Code APIs through bridgeContext.vscode
    const doc = await bridgeContext.vscode.workspace.openTextDocument(absolutePath);
    await bridgeContext.vscode.window.showTextDocument(doc);

    return {
        success: true,
        message: `Opened ${path} at line ${line}`
    };
}
```

### CommonJS Style

```javascript
module.exports.meta = {
    name: "my.script",
    description: "CommonJS style script"
};

module.exports.default = async function(bridgeContext, params) {
    // Use BridgeContext services
    bridgeContext.logger.info('CommonJS script executing');
    const workspace = bridgeContext.workspace.getDefault();

    return { success: true };
};
```

### With Custom Validation

```javascript
export const paramsSchema = {
    parse(params) {
        if (!params.required) {
            throw new Error("Missing required parameter");
        }
        return params;
    },
    safeParse(params) {
        try {
            return { success: true, data: this.parse(params) };
        } catch (error) {
            return { success: false, error };
        }
    }
};

export default async function(params, context) {
    // Params are pre-validated if paramsSchema is provided
    return { success: true };
}
```

## Parameter Validation

### Parameter Definition in Metadata

```javascript
export const meta = {
    params: {
        path: {
            type: "string",
            required: true,
            description: "File path",
            minLength: 1,
            pattern: "^[^<>:|?*]+$",  // No invalid path chars
            resolve: "workspace-relative"  // Auto-resolve to absolute
        },
        line: {
            type: "number",
            required: false,
            default: 1,
            min: 1,
            integer: true
        },
        action: {
            type: "enum",
            values: ["read", "write", "delete"],
            required: true
        },
        options: {
            type: "object",
            required: false
        }
    }
};
```

### Supported Types
- `string` - With optional minLength, maxLength, pattern
- `number` - With optional min, max, integer constraint
- `boolean` - Automatically coerced from "true"/"false"
- `enum` - Must be one of specified values
- `array` - Array of any values
- `object` - Key-value object

### Path Resolution
The `resolve` property supports:
- `"workspace-relative"` - Resolves relative to workspace root
- `"absolute"` - Keeps as absolute path
- `"cwd-relative"` - Resolves relative to current directory

## Available VS Code APIs

Scripts receive a context object with access to VS Code APIs:

```javascript
context = {
    // Core VS Code namespace
    vscode: vscode,

    // Commonly used APIs
    workspace: vscode.workspace,
    window: vscode.window,
    debug: vscode.debug,
    commands: vscode.commands,
    env: vscode.env,

    // Request metadata
    requestId: "unique-id",
    mode: "normal",  // or "danger"
    signal: AbortSignal  // For cancellation
}
```

### Common Operations

```javascript
// Open a file
const doc = await context.workspace.openTextDocument(path);
await context.window.showTextDocument(doc);

// Show notification
context.window.showInformationMessage("Hello!");

// Execute command
await context.commands.executeCommand("workbench.action.files.save");

// Get configuration
const config = context.workspace.getConfiguration("myExtension");
const value = config.get("setting");

// Debug operations
await context.debug.startDebugging(undefined, "My Config");
const session = context.debug.activeDebugSession;
```

## Examples

### Example 1: Toggle Line Comment

```javascript
/**
 * @name toggle.comment
 * @description Toggle line comment at cursor position
 */

export default async function(params, context) {
    const editor = context.window.activeTextEditor;
    if (!editor) {
        return { success: false, error: "No active editor" };
    }

    await context.commands.executeCommand("editor.action.commentLine");

    return {
        success: true,
        line: editor.selection.active.line + 1
    };
}
```

### Example 2: Create Terminal and Run Command

```javascript
/**
 * @name run.in.terminal
 * @description Run a command in a new terminal
 * @param {string} command - Command to run
 * @param {string} [name] - Terminal name
 */

export const meta = {
    params: {
        command: { type: "string", required: true },
        name: { type: "string", default: "Script Terminal" }
    }
};

export default async function(params, context) {
    const terminal = context.window.createTerminal(params.name);
    terminal.show();
    terminal.sendText(params.command);

    return {
        success: true,
        terminal: params.name,
        command: params.command
    };
}
```

### Example 3: Search and Replace in File

```javascript
/**
 * @name search.replace
 * @description Search and replace text in active file
 */

export default async function(params, context) {
    const { search, replace } = params;
    const editor = context.window.activeTextEditor;

    if (!editor) {
        return { success: false, error: "No active editor" };
    }

    const document = editor.document;
    const text = document.getText();
    const newText = text.replace(new RegExp(search, 'g'), replace);

    const fullRange = new context.vscode.Range(
        document.positionAt(0),
        document.positionAt(text.length)
    );

    await editor.edit(editBuilder => {
        editBuilder.replace(fullRange, newText);
    });

    return {
        success: true,
        replacements: (text.match(new RegExp(search, 'g')) || []).length
    };
}
```

## Troubleshooting

### Script Not Found
- Ensure the script is in one of the discovery locations
- Check that the file has a `.js` extension
- Verify the script has a default export

### Validation Errors
- Check parameter types match the expected format
- For numbers, ensure they're within min/max bounds
- For enums, verify the value is in the allowed list
- Use `--no-validate` flag to bypass validation during testing

### Execution Errors
- Check VS Code's output panel for error details
- Ensure required VS Code APIs are available
- Verify the workspace is properly initialized
- Check for typos in API method names

### Dynamic Script Issues
- Scripts are loaded with `Function()` constructor for sandboxing
- Direct `require()` calls are not available
- Use the provided context APIs instead of importing modules
- Export format must be ESM-style or CommonJS-style

## CLI Usage

### List Available Scripts
```bash
vscb script list
```

### Run a Script by Name
```bash
vscb script run my.custom.script --param key=value
```

### Run a Script File Directly
```bash
vscb script run -f ./my-script.js --param key=value
```

### Get Script Information
```bash
vscb script info my.custom.script
```

## Best Practices

1. **Use descriptive names**: Follow the dot notation convention (e.g., `category.action.target`)
2. **Provide metadata**: Always include name, description, and parameter definitions
3. **Handle errors gracefully**: Return structured error responses rather than throwing
4. **Document parameters**: Use JSDoc comments or meta.params for clarity
5. **Test thoroughly**: Use the three-tier validation to your advantage
6. **Keep scripts focused**: Each script should do one thing well
7. **Use appropriate base class**: Choose the right script type for your operation
8. **Leverage VS Code APIs**: Use the rich API surface provided by context

## Security Considerations

- Scripts run with full VS Code API access
- No additional sandboxing beyond JavaScript's Function constructor
- Be cautious with scripts from untrusted sources
- Review script code before execution
- Use workspace-specific scripts for project-specific operations