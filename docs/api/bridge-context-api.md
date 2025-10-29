# BridgeContext API Reference

## Overview

BridgeContext provides a dependency injection container for VSC Bridge scripts, offering clean access to VS Code APIs and shared services.

## Core Interface: `IBridgeContext`

The main interface available to all scripts as their first parameter.

### Properties

#### `version: string`
Current version of the BridgeContext API.
- **Current**: "1.0.0"
- **Usage**: Check for compatibility

```javascript
if (bridgeContext.version !== '1.0.0') {
    console.warn('Version mismatch');
}
```

#### `vscode: typeof vscode`
Direct access to the VS Code API namespace.
- **Type**: Complete VS Code API
- **Usage**: Access any VS Code API not wrapped by BridgeContext

```javascript
const terminal = bridgeContext.vscode.window.createTerminal();
```

#### `signal?: AbortSignal`
Abort signal for cancellation support.
- **Type**: `AbortSignal | undefined`
- **Usage**: Check for cancellation in long-running operations

```javascript
if (bridgeContext.signal?.aborted) {
    return { cancelled: true };
}
```

#### `mode?: string`
Request execution mode.
- **Values**: "normal" | "danger"
- **Default**: "normal"
- **Usage**: Check for danger mode permissions

```javascript
if (bridgeContext.mode !== 'danger') {
    throw new Error('This operation requires danger mode');
}
```

#### `outputChannel?: vscode.OutputChannel`
Raw output channel (prefer using logger service).
- **Type**: `vscode.OutputChannel | undefined`
- **Deprecated**: Use `logger` service instead

### Methods

#### `getWorkspace(): vscode.WorkspaceFolder | undefined`
Get the first (default) workspace folder.
- **Returns**: Workspace folder or undefined if no workspace
- **Wraps**: `vscode.workspace.workspaceFolders?.[0]`

```javascript
const workspace = bridgeContext.getWorkspace();
if (!workspace) {
    throw new Error('No workspace open');
}
```

#### `getActiveEditor(): vscode.TextEditor | undefined`
Get the currently active text editor.
- **Returns**: Active editor or undefined
- **Wraps**: `vscode.window.activeTextEditor`

```javascript
const editor = bridgeContext.getActiveEditor();
const selection = editor?.selection;
```

#### `getConfiguration(section: string): vscode.WorkspaceConfiguration`
Get VS Code configuration for a specific section.
- **Parameters**:
  - `section` - Configuration section (e.g., 'python.testing')
- **Returns**: Configuration object
- **Wraps**: `vscode.workspace.getConfiguration()`

```javascript
const config = bridgeContext.getConfiguration('python.testing');
const framework = config.get('pytestEnabled');
```

#### `setRequestMetadata(metadata: RequestMetadata): void`
Set request metadata for logging correlation.
- **Parameters**:
  - `metadata.requestId` - Unique request ID
  - `metadata.mode` - Execution mode
  - `metadata.alias` - Script alias

```javascript
bridgeContext.setRequestMetadata({
    requestId: 'req-123',
    mode: 'normal',
    alias: 'test.script'
});
```

#### `dispose(): void`
Dispose of resources held by this context.
- **Note**: Called automatically at end of script execution

## Services

### Logger Service: `ILogger`

Structured logging with request correlation.

#### Methods

##### `info(message: string, ...args: any[]): void`
Log an informational message.

```javascript
bridgeContext.logger.info('Processing file', fileName);
```

##### `error(message: string, error?: Error): void`
Log an error message (shows output channel).

```javascript
bridgeContext.logger.error('Failed to process', error);
```

##### `debug(message: string, data?: any): void`
Log a debug message (only shown when log level is 'debug').

```javascript
bridgeContext.logger.debug('Debug data', { foo: 'bar' });
```

##### `warn(message: string): void`
Log a warning message.

```javascript
bridgeContext.logger.warn('Deprecated feature used');
```

### Debug Service: `IDebugService`

Manage debug sessions.

#### Methods

##### `getSession(sessionId?: string): vscode.DebugSession | undefined`
Get a debug session by ID or the active session.
- **Wraps**: `vscode.debug.activeDebugSession`

```javascript
const session = bridgeContext.debug?.getSession();
```

##### `isActive(): boolean`
Check if any debug session is active.

```javascript
if (bridgeContext.debug?.isActive()) {
    // Debugging is active
}
```

### Workspace Service: `IWorkspaceService`

Workspace and folder operations.

#### Methods

##### `getDefault(): vscode.WorkspaceFolder | undefined`
Get the default (first) workspace folder.

```javascript
const folder = bridgeContext.workspace?.getDefault();
```

##### `findByPath(path: string): vscode.WorkspaceFolder | undefined`
Find workspace folder containing a path.

```javascript
const folder = bridgeContext.workspace?.findByPath('/path/to/file');
```

##### `resolveUri(path: string): vscode.Uri`
Resolve a path to a VS Code URI.

```javascript
const uri = bridgeContext.workspace?.resolveUri('./src/file.ts');
```

### Path Service: `IPathService`

Path manipulation utilities.

#### Properties

##### `extensionRoot: string`
Extension root directory absolute path.

```javascript
const root = bridgeContext.paths?.extensionRoot;
```

#### Methods

##### `resolve(relativePath: string): string`
Resolve relative path to absolute.

```javascript
const absolute = bridgeContext.paths?.resolve('./src/file.ts');
```

##### `isAbsolute(path: string): boolean`
Check if a path is absolute.

```javascript
if (bridgeContext.paths?.isAbsolute(filePath)) {
    // Path is absolute
}
```

##### `toWorkspaceRelative(absolutePath: string): string | undefined`
Convert absolute path to workspace-relative.

```javascript
const relative = bridgeContext.paths?.toWorkspaceRelative('/full/path');
```

## Test Environment Detection

### `getPythonEnv(filePath: string): Promise<IPythonEnvironment>`

Detect Python test environment for a file.

```javascript
const env = await bridgeContext.getPythonEnv?.(filePath);
if (env.framework === 'pytest') {
    // Use pytest configuration
}
```

### Return Type: `IPythonEnvironment`

```typescript
interface IPythonEnvironment {
    language: 'python';
    framework: 'pytest' | 'unittest' | 'nose2' | 'none';
    confidence: number; // 0.0 to 1.0
    debugConfig: vscode.DebugConfiguration;
    cwd: string;
    reasons: string[];
}
```

## Usage Examples

### Basic Script Structure

```javascript
const { WaitableScript } = require('../out/core/scripts/base');

class MyScript extends WaitableScript {
    async wait(bridgeContext, params) {
        // Access VS Code APIs
        const vscode = bridgeContext.vscode;

        // Use logger
        const logger = bridgeContext.logger;
        logger.info('Starting script');

        // Get workspace
        const workspace = bridgeContext.getWorkspace();
        if (!workspace) {
            logger.error('No workspace open');
            return { success: false };
        }

        // Use services
        const debugActive = bridgeContext.debug?.isActive();
        const absolutePath = bridgeContext.paths?.resolve(params.path);

        return { success: true };
    }
}

module.exports = { MyScript };
```

### Error Handling Pattern

```javascript
async execute(bridgeContext, params) {
    try {
        // Check cancellation
        if (bridgeContext.signal?.aborted) {
            return { cancelled: true };
        }

        // Validate workspace
        const workspace = bridgeContext.getWorkspace();
        if (!workspace) {
            throw new Error('No workspace open');
        }

        // Do work...

        return { success: true };
    } catch (error) {
        bridgeContext.logger.error('Script failed', error);
        return {
            success: false,
            error: error.message
        };
    }
}
```

### Using TypeScript Definitions

```javascript
/// <reference path="../vsc-scripts/bridge-context.d.ts" />

/**
 * @param {import('../vsc-scripts/bridge-context').IBridgeContext} bridgeContext
 * @param {{path: string, line: number}} params
 */
async execute(bridgeContext, params) {
    // Full IntelliSense support!
}
```

## Performance Characteristics

| Operation | Typical Time | Notes |
|-----------|-------------|-------|
| `getWorkspace()` | < 1ms | Cached property access |
| `getActiveEditor()` | < 1ms | Direct API call |
| `getConfiguration()` | < 5ms | May read from disk |
| `getPythonEnv()` | 20-50ms | File system operations |
| Logger methods | < 1ms | Async, non-blocking |

## Security Considerations

1. **Danger Mode**: Some operations require `mode: 'danger'`. Always validate before dangerous operations.

2. **Path Validation**: Use path service to ensure paths are within workspace:
```javascript
const relative = bridgeContext.paths?.toWorkspaceRelative(untrustedPath);
if (!relative) {
    throw new Error('Path outside workspace');
}
```

3. **Signal Handling**: Always check abort signal for long operations:
```javascript
for (const file of files) {
    if (bridgeContext.signal?.aborted) break;
    // Process file
}
```

## Migration from ScriptContext

See the [Migration Guide](../migration/bridge-context-migration.md) for detailed instructions on migrating from ScriptContext.

## See Also

- [Type Definitions](../../extension/src/vsc-scripts/bridge-context.d.ts)
- [Example Scripts](../examples/bridge-context-examples.md)
- [Implementation Details](../plans/4-bridge-context/1-bridge-context-implementation.md)