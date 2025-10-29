import * as vscode from 'vscode';

/**
 * Main interface for BridgeContext - provides dependency injection for scripts
 * All methods are thin wrappers around VS Code's built-in APIs
 */
export interface IBridgeContext {
    /**
     * Version for compatibility checks
     */
    readonly version: string;

    /**
     * Direct access to VS Code API namespace
     */
    readonly vscode: typeof vscode;

    /**
     * Abort signal for cancellation (optional)
     */
    readonly signal?: AbortSignal;

    /**
     * Request mode (normal/danger)
     */
    readonly mode?: string;

    /**
     * Output channel for logging
     */
    readonly outputChannel?: vscode.OutputChannel;

    /**
     * Get the first workspace folder using VS Code API
     * Wraps: vscode.workspace.workspaceFolders?.[0]
     */
    getWorkspace(): vscode.WorkspaceFolder | undefined;

    /**
     * Get the active text editor using VS Code API
     * Wraps: vscode.window.activeTextEditor
     */
    getActiveEditor(): vscode.TextEditor | undefined;

    /**
     * Get configuration using VS Code API
     * Wraps: vscode.workspace.getConfiguration()
     * @param section Configuration section (e.g., 'python.testing')
     */
    getConfiguration(section: string): vscode.WorkspaceConfiguration;

    /**
     * Logger service for structured output
     * Wraps: vscode.OutputChannel
     */
    logger: ILogger;

    /**
     * Python test environment detection (Phase 2+)
     * @param filePath Path to the Python file
     * @deprecated Use getTestEnvironment() for unified detection
     */
    getPythonEnv?: (filePath: string) => Promise<ITestEnvironment>;

    /**
     * Universal test environment detection (Future phases)
     * @param filePath Path to the test file
     * @param language Optional language hint
     * @deprecated Use getTestEnvironment() for unified detection
     */
    getTestEnv?: (filePath: string, language?: string) => Promise<ITestEnvironment>;

    /**
     * Unified test environment detection using service layer
     * @param file Optional file URI for context (remote-safe)
     * @returns Test environment or null if not detected
     */
    getTestEnvironment?: (file?: vscode.Uri) => Promise<ITestEnvironment | null>;

    /**
     * Debug service helpers (Phase 5)
     */
    debug?: IDebugService;

    /**
     * Workspace utilities (Phase 5)
     */
    workspace?: IWorkspaceService;

    /**
     * Path utilities (Phase 5)
     */
    paths?: IPathService;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Logger interface for structured logging
 * Wraps VS Code's OutputChannel with formatting
 */
export interface ILogger {
    /**
     * Log info message
     */
    info(message: string, ...args: any[]): void;

    /**
     * Log error message
     * Shows output channel automatically
     */
    error(message: string, error?: Error): void;

    /**
     * Log debug message
     */
    debug(message: string, data?: any): void;

    /**
     * Log warning message
     */
    warn(message: string): void;
}

/**
 * Language-agnostic test environment interface
 * Supports any test framework VS Code can debug
 */
export interface ITestEnvironment {
    /**
     * Programming language
     */
    language: 'python' | 'javascript' | 'typescript' | 'go' | 'java' | 'csharp' | 'rust' | string;

    /**
     * Test framework (e.g., 'pytest', 'jest', 'junit', 'go test')
     */
    framework: string;

    /**
     * Confidence score (0.0 to 1.0) in the detection
     */
    confidence: number;

    /**
     * VS Code debug configuration for this test environment
     */
    debugConfig: vscode.DebugConfiguration;

    /**
     * Working directory for test execution
     */
    cwd: string;

    /**
     * Reasons why this framework was detected
     * Used for debugging and user feedback
     */
    reasons: string[];

    /**
     * Test discovery status (optional)
     * Indicates if tests have been discovered by VS Code
     */
    testDiscovery?: {
        ready: boolean;
        itemCount?: number;
        details?: string;
    };
}

/**
 * Python-specific test environment (extends base for backward compatibility)
 */
export interface IPythonEnvironment extends ITestEnvironment {
    language: 'python';
    framework: 'pytest' | 'unittest' | 'nose2' | 'none';
}

/**
 * Debug service interface (Phase 5)
 * Wraps VS Code debug API
 */
export interface IDebugService {
    /**
     * Get debug session by ID or active session
     * Wraps: vscode.debug.activeDebugSession
     */
    getSession(sessionId?: string): vscode.DebugSession | undefined;

    /**
     * Check if any debug session is active
     * Wraps: vscode.debug.activeDebugSession !== undefined
     */
    isActive(): boolean;
}

/**
 * Workspace service interface (Phase 5)
 * Wraps VS Code workspace API
 */
export interface IWorkspaceService {
    /**
     * Get default (first) workspace folder
     * Wraps: vscode.workspace.workspaceFolders?.[0]
     */
    getDefault(): vscode.WorkspaceFolder | undefined;

    /**
     * Find workspace folder containing path
     * Wraps: vscode.workspace.getWorkspaceFolder()
     */
    findByPath(path: string): vscode.WorkspaceFolder | undefined;

    /**
     * Resolve path to URI
     * Wraps: vscode.Uri.file() or vscode.Uri.parse()
     */
    resolveUri(path: string): vscode.Uri;
}

/**
 * Path service interface (Phase 5)
 * Wraps VS Code path/URI utilities
 */
export interface IPathService {
    /**
     * Extension root directory
     * From: extensionContext.extensionPath
     */
    readonly extensionRoot: string;

    /**
     * Resolve relative path to absolute
     * Uses: vscode.Uri.joinPath()
     */
    resolve(relativePath: string): string;

    /**
     * Check if path is absolute
     */
    isAbsolute(path: string): boolean;

    /**
     * Convert absolute path to workspace-relative
     * Uses: vscode.workspace.asRelativePath()
     */
    toWorkspaceRelative(absolutePath: string): string | undefined;
}

/**
 * Factory options for creating BridgeContext
 */
export interface IBridgeContextOptions {
    /**
     * Pre-created output channel to use (for dependency injection)
     * If provided, outputChannelName is ignored
     */
    outputChannel?: vscode.OutputChannel;

    /**
     * Name for the output channel
     * Default: 'VSC-Bridge'
     * Ignored if outputChannel is provided
     */
    outputChannelName?: string;

    /**
     * Log level for filtering messages
     * Default: 'info'
     */
    logLevel?: 'debug' | 'info' | 'warn' | 'error';

    /**
     * Include timestamps in log messages
     * Default: false
     */
    includeTimestamp?: boolean;

    /**
     * Abort signal for cancellation
     */
    signal?: AbortSignal;

    /**
     * Request mode (normal/danger)
     */
    mode?: string;
}