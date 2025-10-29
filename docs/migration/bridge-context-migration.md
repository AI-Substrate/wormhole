# ScriptContext to BridgeContext Migration Guide

## Overview

This guide helps you migrate scripts from the legacy `ScriptContext` to the new `BridgeContext` architecture. The migration is straightforward as BridgeContext maintains backward compatibility while providing a cleaner, service-oriented API.

## Key Changes

### 1. First Parameter Changed

**Before (ScriptContext):**
```javascript
async execute(ctx, params) {
    // ctx was ScriptContext
    const vscode = ctx.vscode;
}
```

**After (BridgeContext):**
```javascript
async execute(bridgeContext, params) {
    // bridgeContext is BridgeContext
    const vscode = bridgeContext.vscode;
}
```

### 2. Direct VS Code API Access

**Before:**
```javascript
// ScriptContext mixed concerns
ctx.workspace.workspaceFolders[0]
ctx.window.activeTextEditor
ctx.debug.activeDebugSession
```

**After:**
```javascript
// BridgeContext provides clean services
bridgeContext.getWorkspace()
bridgeContext.getActiveEditor()
bridgeContext.debug?.getSession()
```

## Migration Steps

### Step 1: Update Script Signature

Change your script's execute method signature:

```javascript
// Old
class MyScript extends ActionScript {
    async execute(ctx, params) {
        // ...
    }
}

// New
class MyScript extends ActionScript {
    async execute(bridgeContext, params) {
        // ...
    }
}
```

### Step 2: Use Service Methods

Replace direct property access with service methods:

| Old (ScriptContext) | New (BridgeContext) |
|-------------------|-------------------|
| `ctx.workspace.workspaceFolders?.[0]` | `bridgeContext.getWorkspace()` |
| `ctx.window.activeTextEditor` | `bridgeContext.getActiveEditor()` |
| `ctx.workspace.getConfiguration()` | `bridgeContext.getConfiguration()` |
| `ctx.outputChannel` | `bridgeContext.logger` |
| `ctx.vscode` | `bridgeContext.vscode` |

### Step 3: Use Enhanced Logger

**Before:**
```javascript
ctx.outputChannel.appendLine(`[INFO] ${message}`);
ctx.outputChannel.show();
```

**After:**
```javascript
bridgeContext.logger.info(message);
bridgeContext.logger.error('Error occurred', error);
```

### Step 4: Use Optional Services

New services are available for common tasks:

```javascript
// Debug service
if (bridgeContext.debug) {
    const session = bridgeContext.debug.getSession();
    const isActive = bridgeContext.debug.isActive();
}

// Workspace service
if (bridgeContext.workspace) {
    const folder = bridgeContext.workspace.getDefault();
    const uri = bridgeContext.workspace.resolveUri(path);
}

// Path service
if (bridgeContext.paths) {
    const absolute = bridgeContext.paths.resolve(relativePath);
    const relative = bridgeContext.paths.toWorkspaceRelative(absolute);
}
```

## Real Example Migration

Here's a complete example from the `tests.debug-wait` script:

### Before (ScriptContext)
```javascript
class DebugTestWaitScript extends WaitableScript {
    async wait(ctx, params) {
        const vscode = ctx.vscode;
        const workspace = ctx.workspace.workspaceFolders?.[0];

        // Manual logging
        ctx.outputChannel.appendLine(`[tests.debug-wait] Starting debug: ${params.path}`);

        // Direct API usage
        const absolutePath = workspace
            ? vscode.Uri.joinPath(workspace.uri, params.path).fsPath
            : params.path;

        // Manual error handling
        if (!workspace) {
            ctx.outputChannel.appendLine('[ERROR] No workspace folder');
            ctx.outputChannel.show();
            return { success: false, error: 'No workspace' };
        }
    }
}
```

### After (BridgeContext)
```javascript
class DebugTestWaitScript extends WaitableScript {
    async wait(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        // Use logger service
        const logger = bridgeContext.logger;
        logger.info(`Starting debug: ${params.path}`);

        // Use workspace service
        const workspace = bridgeContext.workspace?.getDefault();

        // Use path service
        const absolutePath = bridgeContext.paths
            ? bridgeContext.paths.resolve(params.path)
            : params.path;

        // Better error handling with logger
        if (!workspace) {
            logger.error('No workspace folder found');
            return {
                event: 'error',
                reason: 'No workspace folder'
            };
        }
    }
}
```

## TypeScript Support

Add TypeScript definitions for better IntelliSense:

```javascript
/// <reference path="../vsc-scripts/bridge-context.d.ts" />

/**
 * @param {import('../vsc-scripts/bridge-context').IBridgeContext} bridgeContext
 * @param {Object} params
 */
async execute(bridgeContext, params) {
    // Full IntelliSense support!
    bridgeContext.logger.info('Hello');
}
```

## Breaking Changes

### Removed Properties
- `ctx.workspace` - Use `bridgeContext.getWorkspace()` or `bridgeContext.workspace` service
- `ctx.window` - Use `bridgeContext.vscode.window` directly
- `ctx.debug` - Use `bridgeContext.debug` service
- `ctx.commands` - Use `bridgeContext.vscode.commands`
- `ctx.env` - Use `bridgeContext.vscode.env`

### Changed Behavior
- Logger now has structured methods (`info`, `error`, `debug`, `warn`)
- Services are optional and may be undefined
- Request metadata is set via `setRequestMetadata()` method

## Troubleshooting

### Issue: "Cannot read property 'vscode' of undefined"
**Solution:** Ensure you're using `bridgeContext` as the parameter name, not `ctx`.

### Issue: "workspace is not a property"
**Solution:** Use `bridgeContext.getWorkspace()` method or `bridgeContext.workspace` service.

### Issue: "outputChannel.appendLine is not a function"
**Solution:** Use `bridgeContext.logger.info()` instead.

### Issue: TypeScript errors in JavaScript files
**Solution:** Add the reference path at the top of your file:
```javascript
/// <reference path="../vsc-scripts/bridge-context.d.ts" />
```

## Benefits After Migration

1. **Better IntelliSense** - Full TypeScript support in JavaScript
2. **Cleaner API** - Service-oriented architecture
3. **Consistent Logging** - Structured logger with request correlation
4. **Less Boilerplate** - Services handle common patterns
5. **Future-Proof** - Ready for new VS Code APIs and features

## Need Help?

- Check the [API Reference](../api/bridge-context-api.md)
- See [Example Scripts](../examples/bridge-context-examples.md)
- Review the [Implementation Plan](../plans/4-bridge-context/1-bridge-context-implementation.md)