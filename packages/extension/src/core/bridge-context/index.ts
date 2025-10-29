/**
 * BridgeContext module
 * Provides dependency injection for VSC Bridge scripts
 *
 * All services are thin wrappers around VS Code's built-in APIs
 */

// Export types
export {
    IBridgeContext,
    ILogger,
    ITestEnvironment,
    IPythonEnvironment,
    IDebugService,
    IWorkspaceService,
    IPathService,
    IBridgeContextOptions
} from './types';

// Export implementation
export { BridgeContext } from './BridgeContext';

// Export factory
export { BridgeContextFactory } from './factory';

// Export lifecycle management
export {
    withContext,
    currentContext,
    hasContext,
    exitContext,
    requireContext,
    contextOrFallback
} from './lifecycle';

// Re-export VS Code types that are commonly used
export type {
    WorkspaceFolder,
    TextEditor,
    WorkspaceConfiguration,
    DebugConfiguration,
    DebugSession,
    OutputChannel,
    ExtensionContext,
    Uri
} from 'vscode';