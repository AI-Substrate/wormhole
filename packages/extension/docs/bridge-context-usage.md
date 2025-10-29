# Using BridgeContext in Scripts

BridgeContext provides dependency injection for VSC-Bridge scripts, giving them access to VS Code APIs and services through a clean, testable interface.

## Overview

BridgeContext is a thin wrapper around VS Code's built-in APIs that provides:
- Type-safe access to VS Code functionality
- Structured logging with OutputChannel
- Future support for Python environment detection, debugging services, etc.
- Request isolation through AsyncLocalStorage

## Opting Into BridgeContext

Scripts can opt into receiving BridgeContext as their first parameter by setting a Symbol flag:

### Modern Script (with BridgeContext)

```javascript
import { ActionScript } from '../core/scripts/base';

export class MyModernScript extends ActionScript {
    constructor() {
        super();
        // Opt into BridgeContext injection
        this[Symbol.for('bridge.acceptsContext')] = true;
    }

    async execute(bridgeContext, ctx, params) {
        // BridgeContext is the first parameter
        const workspace = bridgeContext.getWorkspace();
        const config = bridgeContext.getConfiguration('python.testing');

        bridgeContext.logger.info('Executing modern script', {
            workspace: workspace?.name,
            requestId: ctx.requestId
        });

        // Future: Use Python environment detection
        // const pythonEnv = await bridgeContext.getPythonEnv(params.file);

        return {
            success: true,
            details: { workspace: workspace?.uri.toString() }
        };
    }

    validateParams(params) {
        // Validation still works the same way
        return { success: true, data: params };
    }
}
```

### Legacy Script (without BridgeContext)

```javascript
import { ActionScript } from '../core/scripts/base';

export class LegacyScript extends ActionScript {
    // No Symbol flag = no BridgeContext

    async execute(ctx, params) {
        // Only receives ctx and params (backward compatible)
        const workspace = ctx.vscode.workspace.workspaceFolders?.[0];

        return {
            success: true,
            details: { workspace: workspace?.uri.toString() }
        };
    }
}
```

## WaitableScript with BridgeContext

WaitableScripts can also opt into BridgeContext:

```javascript
import { WaitableScript } from '../core/scripts/WaitableScript';

export class DebugWaitScript extends WaitableScript {
    constructor() {
        super();
        this[Symbol.for('bridge.acceptsContext')] = true;
    }

    async wait(bridgeContext, ctx, params) {
        // BridgeContext available in wait method
        bridgeContext.logger.debug('Waiting for debug event', {
            sessionId: params.sessionId,
            timeout: params.timeoutMs
        });

        const result = await this.waitForDebugEvent(params.sessionId, params.timeoutMs);

        bridgeContext.logger.info('Debug event received', result);
        return result;
    }

    async execute(ctx, params) {
        // Regular execute method (rarely called for WaitableScript)
        return { success: false, reason: 'Use wait() method' };
    }
}
```

## BridgeContext API

### Core Methods

```typescript
interface IBridgeContext {
    // Version for compatibility
    readonly version: string;  // "1.0.0"

    // Get first workspace folder
    getWorkspace(): vscode.WorkspaceFolder | undefined;

    // Get VS Code configuration
    getConfiguration(section: string): vscode.WorkspaceConfiguration;

    // Get active text editor
    getActiveEditor(): vscode.TextEditor | undefined;

    // Structured logger
    logger: ILogger;

    // Future: Python environment detection
    getPythonEnv?: (filePath: string) => Promise<IPythonEnvironment>;

    // Clean up resources
    dispose(): void;
}
```

### Logger API

```typescript
interface ILogger {
    info(message: string, ...args: any[]): void;
    error(message: string, error?: Error): void;
    debug(message: string, data?: any): void;
    warn(message: string): void;
}
```

The logger outputs to a VS Code OutputChannel and automatically shows the channel when errors are logged.

## Detection Mechanisms

The ScriptRegistry uses these methods to detect if a script accepts BridgeContext:

1. **Primary**: Check for `Symbol.for('bridge.acceptsContext')` flag
2. **WaitableScript**: Check if `wait()` method accepts 3+ parameters
3. **Explicit property**: Check for `acceptsBridgeContext: true` property

## AsyncLocalStorage Context Isolation

BridgeContext uses Node's AsyncLocalStorage to maintain context isolation across concurrent script executions:

```javascript
// In ScriptRegistry
return withContext(bridgeContext, async () => {
    // All async operations within this scope have access to the context
    return await script.execute(bridgeContext, ctx, params);
});
```

This ensures:
- Each request has its own isolated context
- Contexts don't leak between concurrent executions
- Context is maintained across async boundaries

## Migration Guide

To migrate a legacy script to use BridgeContext:

1. Add the Symbol flag in constructor:
   ```javascript
   this[Symbol.for('bridge.acceptsContext')] = true;
   ```

2. Update execute signature:
   ```javascript
   // Before: execute(ctx, params)
   // After:  execute(bridgeContext, ctx, params)
   ```

3. Replace direct VS Code API usage with BridgeContext methods:
   ```javascript
   // Before: ctx.vscode.workspace.workspaceFolders?.[0]
   // After:  bridgeContext.getWorkspace()

   // Before: console.log('Debug:', data)
   // After:  bridgeContext.logger.debug('Debug', data)
   ```

## Testing Scripts with BridgeContext

In tests, you can create a BridgeContext instance:

```javascript
import { BridgeContext } from '../core/bridge-context/BridgeContext';

const extensionContext = /* get from extension */;
const bridgeContext = new BridgeContext(extensionContext);

const script = new MyModernScript();
const result = await script.execute(bridgeContext, ctx, params);
```

## Best Practices

1. **Use the logger**: Replace console.log with bridgeContext.logger for better debugging
2. **Check for undefined**: Always check if optional values exist (workspace, activeEditor, etc.)
3. **Type safety**: Use TypeScript interfaces for params and return types
4. **Backward compatibility**: Don't break legacy scripts - only opt in when needed
5. **Request metadata**: Include requestId in log messages for correlation

## Future Enhancements

BridgeContext will be extended with additional services in future phases:

- **Phase 2**: Python environment detection (`getPythonEnv`)
- **Phase 3**: Full ScriptRegistry integration
- **Phase 4**: Universal test environment detection (all languages)
- **Phase 5**: Debug service helpers, workspace utilities, path utilities
- **Phase 6**: Caching services and performance optimizations
- **Phase 7**: Multi-language support (JavaScript, Go, Java, C#, Rust, etc.)

## Examples

### Setting Breakpoint with Context

```javascript
export class SetBreakpointScript extends ActionScript {
    constructor() {
        super();
        this[Symbol.for('bridge.acceptsContext')] = true;
    }

    async execute(bridgeContext, ctx, params) {
        const { path, line, condition } = params;

        // Log the action
        bridgeContext.logger.info(`Setting breakpoint at ${path}:${line}`);

        // Get workspace to resolve relative paths
        const workspace = bridgeContext.getWorkspace();
        const absolutePath = workspace
            ? vscode.Uri.joinPath(workspace.uri, path).fsPath
            : path;

        // Set the breakpoint
        const bp = new vscode.SourceBreakpoint(
            new vscode.Location(
                vscode.Uri.file(absolutePath),
                new vscode.Position(line - 1, 0)
            ),
            true,
            condition
        );

        vscode.debug.addBreakpoints([bp]);

        bridgeContext.logger.debug('Breakpoint added', {
            path: absolutePath,
            line,
            condition
        });

        return {
            success: true,
            details: { path: absolutePath, line, condition }
        };
    }
}
```

This documentation provides a complete guide for script authors to understand and use BridgeContext effectively.