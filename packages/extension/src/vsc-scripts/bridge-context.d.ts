/// <reference types="vscode" />

/**
 * BridgeContext Type Definitions for JavaScript Scripts
 *
 * This file provides TypeScript definitions for the BridgeContext API
 * available to VSC Bridge scripts. It enables IntelliSense and type checking
 * for JavaScript scripts using JSDoc comments.
 *
 * @example
 * // In your JavaScript script:
 * /// <reference path="./bridge-context.d.ts" />
 *
 * class MyScript extends WaitableScript {
 *   async wait(bridgeContext, params) {
 *     // IntelliSense now works!
 *     const workspace = bridgeContext.getWorkspace();
 *   }
 * }
 */

import * as vscode from 'vscode';

/**
 * Main BridgeContext interface provided to all scripts
 * Provides dependency injection for VS Code APIs and services
 */
export interface IBridgeContext {
    /**
     * Version for compatibility checks
     * Current version: "1.0.0"
     */
    readonly version: string;

    /**
     * Direct access to VS Code API namespace
     * Use this for any VS Code APIs not wrapped by BridgeContext
     */
    readonly vscode: typeof vscode;

    /**
     * Abort signal for cancellation support
     * Scripts should check this periodically for long-running operations
     */
    readonly signal?: AbortSignal;

    /**
     * Request execution mode
     * "normal" - Standard execution with safety checks
     * "danger" - Bypass certain safety checks for advanced operations
     */
    readonly mode?: string;

    /**
     * Output channel for script logging
     * Prefer using the logger service instead for structured output
     */
    readonly outputChannel?: vscode.OutputChannel;

    /**
     * Get the first workspace folder
     * @returns The default workspace folder or undefined if no workspace is open
     */
    getWorkspace(): vscode.WorkspaceFolder | undefined;

    /**
     * Get the currently active text editor
     * @returns The active editor or undefined if none is active
     */
    getActiveEditor(): vscode.TextEditor | undefined;

    /**
     * Get VS Code configuration section
     * @param section - Configuration section name (e.g., 'python.testing')
     * @returns Configuration object for the specified section
     */
    getConfiguration(section: string): vscode.WorkspaceConfiguration;

    /**
     * Structured logger service
     * Provides consistent logging with request correlation
     */
    logger: ILogger;

    /**
     * Python test environment detection service
     * @param filePath - Path to the Python file to analyze
     * @returns Promise resolving to test environment details
     */
    getPythonEnv?: (filePath: string) => Promise<IPythonEnvironment>;

    /**
     * Universal test environment detection (future capability)
     * @param filePath - Path to the test file
     * @param language - Optional language hint
     * @returns Promise resolving to test environment details
     */
    getTestEnv?: (filePath: string, language?: string) => Promise<ITestEnvironment>;

    /**
     * Debug service for managing debug sessions
     */
    debug?: IDebugService;

    /**
     * Workspace utilities for path and folder operations
     */
    workspace?: IWorkspaceService;

    /**
     * Path manipulation utilities
     */
    paths?: IPathService;

    /**
     * Set request metadata for logging correlation
     * @param metadata - Request metadata including ID, mode, and alias
     */
    setRequestMetadata?(metadata: RequestMetadata): void;

    /**
     * Dispose of resources held by this context
     * Called automatically at the end of script execution
     */
    dispose(): void;
}

/**
 * Logger interface for structured output
 */
export interface ILogger {
    /**
     * Log an informational message
     * @param message - The message to log
     * @param args - Additional arguments to log
     */
    info(message: string, ...args: any[]): void;

    /**
     * Log an error message
     * Automatically shows the output channel
     * @param message - The error message
     * @param error - Optional Error object with stack trace
     */
    error(message: string, error?: Error): void;

    /**
     * Log a debug message
     * Only shown when log level is set to 'debug'
     * @param message - The debug message
     * @param data - Optional data to log
     */
    debug(message: string, data?: any): void;

    /**
     * Log a warning message
     * @param message - The warning message
     */
    warn(message: string): void;
}

/**
 * Test environment information
 */
export interface ITestEnvironment {
    /**
     * Programming language of the test file
     */
    language: 'python' | 'javascript' | 'typescript' | 'go' | 'java' | 'csharp' | 'rust' | string;

    /**
     * Test framework detected (e.g., 'pytest', 'jest', 'mocha')
     */
    framework: string;

    /**
     * Confidence score (0.0 to 1.0) in the detection
     */
    confidence: number;

    /**
     * VS Code debug configuration for running tests
     */
    debugConfig: vscode.DebugConfiguration;

    /**
     * Working directory for test execution
     */
    cwd: string;

    /**
     * Reasons why this framework was detected
     * Useful for debugging detection issues
     */
    reasons: string[];

    /**
     * Test discovery status from VS Code's test API
     */
    testDiscovery?: {
        ready: boolean;
        itemCount?: number;
        details?: string;
    };
}

/**
 * Python-specific test environment
 */
export interface IPythonEnvironment extends ITestEnvironment {
    language: 'python';
    framework: 'pytest' | 'unittest' | 'nose2' | 'none';
}

/**
 * Debug service for managing debug sessions
 */
export interface IDebugService {
    /**
     * Get a debug session by ID or the active session
     * @param sessionId - Optional session ID
     * @returns The debug session or undefined
     */
    getSession(sessionId?: string): vscode.DebugSession | undefined;

    /**
     * Check if any debug session is currently active
     * @returns true if a debug session is active
     */
    isActive(): boolean;

    /**
     * Start a new debug session
     * @param folder - Workspace folder context
     * @param config - Debug configuration
     * @returns Promise resolving to the started debug session
     */
    startDebugging?(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): Promise<boolean>;

    /**
     * Stop a debug session
     * @param session - Session to stop
     * @returns Promise resolving when stopped
     */
    stopDebugging?(session: vscode.DebugSession): Promise<void>;
}

/**
 * Workspace service for folder and path operations
 */
export interface IWorkspaceService {
    /**
     * Get the default (first) workspace folder
     * @returns The default workspace folder or undefined
     */
    getDefault(): vscode.WorkspaceFolder | undefined;

    /**
     * Find the workspace folder containing a path
     * @param path - Path to search for
     * @returns The containing workspace folder or undefined
     */
    findByPath(path: string): vscode.WorkspaceFolder | undefined;

    /**
     * Resolve a path to a VS Code URI
     * @param path - Path to resolve
     * @returns VS Code URI object
     */
    resolveUri(path: string): vscode.Uri;

    /**
     * Get all workspace folders
     * @returns Array of workspace folders or undefined
     */
    getAll?(): readonly vscode.WorkspaceFolder[] | undefined;
}

/**
 * Path manipulation service
 */
export interface IPathService {
    /**
     * Extension root directory absolute path
     */
    readonly extensionRoot: string;

    /**
     * Resolve a relative path to absolute
     * @param relativePath - Path relative to workspace root
     * @returns Absolute path
     */
    resolve(relativePath: string): string;

    /**
     * Check if a path is absolute
     * @param path - Path to check
     * @returns true if the path is absolute
     */
    isAbsolute(path: string): boolean;

    /**
     * Convert absolute path to workspace-relative
     * @param absolutePath - Absolute path to convert
     * @returns Workspace-relative path or undefined if outside workspace
     */
    toWorkspaceRelative(absolutePath: string): string | undefined;

    /**
     * Join path segments
     * @param segments - Path segments to join
     * @returns Joined path
     */
    join?(...segments: string[]): string;

    /**
     * Get the directory name of a path
     * @param path - Path to process
     * @returns Directory portion of the path
     */
    dirname?(path: string): string;

    /**
     * Get the base name of a path
     * @param path - Path to process
     * @returns Base name (file name) portion
     */
    basename?(path: string): string;
}

/**
 * Request metadata for logging correlation
 */
export interface RequestMetadata {
    /**
     * Unique request identifier
     */
    requestId?: string;

    /**
     * Execution mode (normal/danger)
     */
    mode?: string;

    /**
     * Script alias being executed
     */
    alias?: string;
}

/**
 * Options for creating a BridgeContext instance
 */
export interface IBridgeContextOptions {
    /**
     * Name for the output channel
     * @default 'VSC Bridge'
     */
    outputChannelName?: string;

    /**
     * Minimum log level to display
     * @default 'info'
     */
    logLevel?: 'debug' | 'info' | 'warn' | 'error';

    /**
     * Include timestamps in log messages
     * @default false
     */
    includeTimestamp?: boolean;

    /**
     * Abort signal for cancellation
     */
    signal?: AbortSignal;

    /**
     * Request execution mode
     */
    mode?: string;
}

// Export the main type that scripts will use
export default IBridgeContext;