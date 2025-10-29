/**
 * Shared types for the DebugRunner abstraction layer
 *
 * These types define the data structures used across both CLI and MCP transports.
 */

/**
 * Configuration for starting a debug session
 */
export interface DebugConfig {
    /** Debug adapter type (e.g., 'node', 'python', 'csharp', 'java') */
    type: string;
    /** Program to debug (file path) */
    program: string;
    /** Working directory for the debug session */
    cwd: string;
    /** Additional configuration options (adapter-specific) */
    [key: string]: any;
}

/**
 * Information about an active debug session
 */
export interface SessionInfo {
    /** Session ID or identifier */
    id?: string;
    /** Session status */
    status: 'started' | 'stopped' | 'paused' | 'running';
    /** Editor context at the time of the session */
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
    /** Additional session metadata */
    [key: string]: any;
}

/**
 * Response from the debug status command
 */
export interface StatusResponse {
    /** Whether the bridge/server is healthy and ready */
    healthy: boolean;
    /** Human-readable status message */
    message?: string;
    /** Additional status metadata */
    [key: string]: any;
}
