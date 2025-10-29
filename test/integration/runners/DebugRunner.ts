/**
 * DebugRunner Interface - Runner Abstraction Layer
 *
 * This interface defines a transport-agnostic abstraction for debug operations.
 * It enables writing tests once and executing them against multiple transports
 * (CLI, MCP) without code duplication.
 *
 * Design Decisions:
 * - PathResolver: Handles cross-platform path resolution (Windows/Mac/Linux, relative/absolute)
 * - RunnerResponse: Normalized response format with optional rawError for debugging
 * - Minimal interface: Start with core operations, expand as needed
 *
 * @see https://github.com/anthropics/vsc-bridge/blob/main/docs/plans/13-mcp-server-implementation/tasks/phase-7-integration-testing/004-subtask-implement-unified-test-architecture-with-runner-abstraction-layer.md
 */

import { DebugConfig, SessionInfo, StatusResponse } from './types';

/**
 * Path resolution interface for cross-platform compatibility
 *
 * Each runner implementation handles path resolution according to its
 * transport's requirements:
 * - CLI: Resolves from test/ workspace directory
 * - MCP: Resolves from workspace root passed to --workspace flag
 */
export interface PathResolver {
    /**
     * Resolve a relative or absolute path for this runner's transport
     *
     * @param relativePath - Path to resolve (may be relative or absolute)
     * @returns Absolute path suitable for this transport
     *
     * @example
     * // CLI runner (working from test/ directory)
     * runner.resolvePath('python/test_example.py')
     * // => '/Users/jak/github/vsc-bridge/test/python/test_example.py'
     *
     * @example
     * // MCP runner (working from project root)
     * runner.resolvePath('test/python/test_example.py')
     * // => '/Users/jak/github/vsc-bridge/test/python/test_example.py'
     */
    resolvePath(relativePath: string): string;
}

/**
 * Normalized response format for all debug operations
 *
 * This wrapper provides consistent error handling across transports while
 * preserving transport-specific error details for debugging.
 *
 * @template T - Type of data returned on success
 */
export interface RunnerResponse<T = unknown> {
    /** Whether the operation succeeded */
    success: boolean;

    /** Data returned on success */
    data?: T;

    /** Human-readable error message on failure */
    error?: string;

    /**
     * Raw error object from the transport (for debugging)
     *
     * This field preserves transport-specific error details that may be
     * useful for diagnosing failures:
     * - CLI: stderr, exit code, command output
     * - MCP: MCP protocol error codes, request/response details
     *
     * Use this field in debugger or when test assertions fail to understand
     * the root cause of failures without losing information through normalization.
     */
    rawError?: unknown;
}

/**
 * Breakpoint information returned by debug operations
 */
export interface Breakpoint {
    id?: number;
    verified: boolean;
    line: number;
    source?: {
        path: string;
    };
}

/**
 * Stack frame information from debug session
 */
export interface StackFrame {
    id: number;
    name: string;
    line: number;
    column?: number;
    source: {
        path: string;
    };
}

/**
 * Variable information from debug session
 */
export interface Variable {
    name: string;
    value: string;
    type?: string;
    variablesReference?: number;
    children?: Variable[];
}

/**
 * Step result returned by stepping operations
 */
export interface StepResult {
    event: 'stopped' | 'continued' | 'terminated';
    line?: number;
    reason?: string;
    /** Editor context at the time of the step */
    editorContext?: {
        file: {
            path: string;
            languageId: string;
            lineCount: number;
            isDirty: boolean;
        };
        cursor: {
            line: number;
            character: number;
        };
        selection: {
            isEmpty: boolean;
        };
        symbols?: {
            totalInDocument: number;
            containingScopes?: any[];
            immediateScope?: string;
        };
    };
}

/**
 * Evaluation result from evaluating expressions
 */
export interface EvaluateResult {
    result: string;
    type?: string;
    variablesReference?: number;
    /** Editor context at the time of the evaluation */
    editorContext?: {
        file: {
            path: string;
            languageId: string;
            lineCount: number;
            isDirty: boolean;
        };
        cursor: {
            line: number;
            character: number;
        };
        selection: {
            isEmpty: boolean;
        };
        symbols?: {
            totalInDocument: number;
            containingScopes?: any[];
            immediateScope?: string;
        };
    };
}

/**
 * Debug runner interface - complete operations for debug session management
 *
 * This interface defines all debug operations needed for comprehensive integration testing.
 * It abstracts transport differences (CLI vs MCP) to enable shared test logic.
 *
 * All operations return RunnerResponse for consistent error handling.
 */
export interface DebugRunner extends PathResolver {
    // ========== Lifecycle Operations ==========

    /**
     * Start a debug session
     *
     * Launches the Extension Host (if not already running) and initializes
     * a debug session with the specified configuration.
     *
     * @param config - Debug session configuration
     * @returns Session information on success, error details on failure
     */
    startDebug(config: DebugConfig): Promise<RunnerResponse<SessionInfo>>;

    /**
     * Get current status of the debug bridge/server
     *
     * Checks whether the bridge is healthy and ready to accept debug commands.
     * This is primarily used for health checks and readiness polling.
     *
     * @returns Status information including healthy flag
     */
    getStatus(): Promise<RunnerResponse<StatusResponse>>;

    /**
     * Stop the current debug session
     *
     * Terminates any active debug session. This does NOT stop the Extension Host,
     * only the debug session itself.
     *
     * @returns Success/error indication
     */
    stopDebug(): Promise<RunnerResponse<void>>;

    // ========== Breakpoint Operations ==========

    /**
     * Set a breakpoint at a specific file and line
     *
     * @param path - Absolute file path (will be resolved via resolvePath)
     * @param line - Line number (1-indexed)
     * @returns Breakpoint information on success
     */
    setBreakpoint(path: string, line: number): Promise<RunnerResponse<Breakpoint>>;

    /**
     * Clear all breakpoints in the project
     *
     * @returns Success/error indication
     */
    clearProjectBreakpoints(): Promise<RunnerResponse<void>>;

    /**
     * List all current breakpoints
     *
     * @returns Array of breakpoints
     */
    listBreakpoints(): Promise<RunnerResponse<Breakpoint[]>>;

    /**
     * Navigate editor to a specific file and line
     *
     * Opens the file in VS Code and positions the cursor at the specified line.
     * Useful for setting up editor state before debugging.
     *
     * @param path - Absolute file path
     * @param line - Line number (1-indexed)
     * @returns Success/error indication
     */
    gotoLine(path: string, line: number): Promise<RunnerResponse<void>>;

    // ========== Debug Session Operations ==========

    /**
     * Start debugging at a specific test location
     *
     * This is a convenience method that combines multiple operations:
     * - Launches the test at the specified location
     * - Waits for breakpoint hit
     * - Returns execution context
     *
     * @param path - Absolute path to test file
     * @param line - Line number where test/breakpoint is
     * @returns Step result with stopped event
     */
    debugSingle(path: string, line: number): Promise<RunnerResponse<StepResult>>;

    // ========== Stepping Operations ==========

    /**
     * Step into function calls
     *
     * @returns Step result with new location
     */
    stepInto(): Promise<RunnerResponse<StepResult>>;

    /**
     * Step over function calls
     *
     * @returns Step result with new location
     */
    stepOver(): Promise<RunnerResponse<StepResult>>;

    /**
     * Step out of current function
     *
     * @returns Step result with new location
     */
    stepOut(): Promise<RunnerResponse<StepResult>>;

    /**
     * Continue execution until next breakpoint
     *
     * @returns Step result (stopped at breakpoint or terminated)
     */
    continue(): Promise<RunnerResponse<StepResult>>;

    // ========== Inspection Operations ==========

    /**
     * Get current stack trace
     *
     * @returns Array of stack frames
     */
    getStackTrace(): Promise<RunnerResponse<StackFrame[]>>;

    /**
     * List variables in a specific scope
     *
     * @param scope - Scope to inspect (e.g., 'local', 'global')
     * @returns Array of variables
     */
    listVariables(scope: string): Promise<RunnerResponse<Variable[]>>;

    /**
     * Evaluate an expression in the current debug context
     *
     * @param expression - Expression to evaluate
     * @returns Evaluation result with value and type
     */
    evaluate(expression: string): Promise<RunnerResponse<EvaluateResult>>;
}
