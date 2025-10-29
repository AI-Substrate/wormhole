/**
 * Runtime Inspection Interfaces
 *
 * Core interfaces for the debug adapter pattern and variable inspection.
 * These interfaces abstract language-specific debugging capabilities.
 */

import * as vscode from 'vscode';
import { IDebugError } from '../errors/debug-errors';

/**
 * Streaming suggestion for large data operations
 * Per Subtask 001 ST009: Machine-actionable suggestions in both error and success paths
 */
export interface IStreamingSuggestion {
    /** Suggestion mode - currently only stream-to-file is supported */
    mode: 'stream-to-file';

    /** Command to execute for streaming */
    command: 'debug.stream-variables';

    /** Reason for the suggestion */
    reason: 'budget-exceeded' | 'budget-warning';

    /** Recommended page size for streaming */
    recommendedPageSize: number;

    /** Expected size of data in megabytes */
    expectedSizeMB: number;

    /** Optional output file path */
    outputPath?: string;

    /** Parameters for the streaming operation */
    params: {
        /** Maximum depth to traverse */
        maxDepth?: number;
        /** Output format */
        format?: 'json' | 'jsonl';
    };
}

/**
 * Debug adapter capabilities based on DAP specification
 * Allows feature detection for language-specific functionality
 */
export interface IDebugCapabilities {
    /** Supports setVariable request */
    supportsSetVariable: boolean;

    /** Supports variable paging (filter/start parameters) */
    supportsVariablePaging: boolean;

    /** Provides type information for variables */
    supportsVariableType: boolean;

    /** Provides memory references for variables */
    supportsMemoryReferences: boolean;

    /** Supports progress reporting for long operations */
    supportsProgressReporting: boolean;

    /** Sends invalidated events when references become stale */
    supportsInvalidatedEvent: boolean;

    /** Sends memory events for memory changes */
    supportsMemoryEvent: boolean;

    /** Supports evaluate requests for hovers */
    supportsEvaluateForHovers: boolean;

    /** Supports setExpression request */
    supportsSetExpression: boolean;

    /** Supports data breakpoints */
    supportsDataBreakpoints: boolean;
}

/**
 * Variable presentation hint (from DAP spec)
 */
export interface IVariablePresentationHint {
    /** Kind of variable (property, method, class, data, event, etc.) */
    kind?: 'property' | 'method' | 'class' | 'data' | 'event' | 'baseClass' | 'innerClass' | 'interface' | 'mostDerivedClass' | 'virtual' | 'dataBreakpoint' | string;

    /** Set of attributes (static, constant, readOnly, rawString, etc.) */
    attributes?: ('static' | 'constant' | 'readOnly' | 'rawString' | 'hasObjectId' | 'canHaveObjectId' | 'hasSideEffects' | 'hasDataBreakpoint' | string)[];

    /** Visibility (public, private, protected, internal, final) */
    visibility?: 'public' | 'private' | 'protected' | 'internal' | 'final' | string;

    /** If true, clients should present in a lazy fashion */
    lazy?: boolean;
}

/**
 * Variable data structure matching DAP Variable type
 */
export interface IVariableData {
    /** Variable name */
    name: string;

    /** Variable value as string */
    value: string;

    /** Variable type (if available) */
    type?: string;

    /** Reference to child variables (0 if no children) */
    variablesReference: number;

    /** Number of named child variables */
    namedVariables?: number;

    /** Number of indexed child variables */
    indexedVariables?: number;

    /** Expression to access this variable */
    evaluateName?: string;

    /** Memory reference for this variable */
    memoryReference?: string;

    /** Presentation hint for UI */
    presentationHint?: IVariablePresentationHint;
}

/**
 * Parameters for listVariables operation
 */
export interface IListVariablesParams {
    /** Maximum depth to traverse (default: 2) */
    maxDepth?: number;

    /** Maximum children per node (default: 50) */
    maxChildren?: number;

    /** Include expensive scopes (default: false) */
    includeExpensive?: boolean;

    /** Scope filter: 'all' | 'local' | 'closure' | 'global' */
    scopeFilter?: 'all' | 'local' | 'closure' | 'global';

    /** Thread ID (if not provided, uses active thread) */
    threadId?: number;

    /** Frame ID (if not provided, uses top frame) */
    frameId?: number;
}

/**
 * Parameters for setVariable operation
 */
export interface ISetVariableParams {
    /** Variable name or path */
    name: string;

    /** New value (as string expression) */
    value: string;

    /** Variables reference containing the variable (0 for scope variables) */
    variablesReference?: number;

    /** Frame ID (if not provided, uses top frame) */
    frameId?: number;
}

/**
 * Result from setVariable operation
 */
export interface ISetVariableResult {
    /** Success flag */
    success: boolean;

    /** New value after modification */
    value?: string;

    /** New type after modification */
    type?: string;

    /** New variables reference if value is structured */
    variablesReference?: number;

    /** Number of named variables */
    namedVariables?: number;

    /** Number of indexed variables */
    indexedVariables?: number;

    /** Error if operation failed */
    error?: IDebugError;
}

/**
 * Parameters for getVariableChildren operation (pagination)
 */
export interface IVariableChildrenParams {
    /** Variables reference to expand */
    variablesReference: number;

    /** Start index for pagination */
    start?: number;

    /** Number of items to retrieve */
    count?: number;

    /** Filter ('indexed' | 'named') */
    filter?: 'indexed' | 'named';
}

/**
 * Parameters for streamVariables operation
 */
export interface IStreamVariablesParams {
    /** Output file path */
    outputPath: string;

    /** Maximum depth to traverse */
    maxDepth?: number;

    /** Include expensive scopes */
    includeExpensive?: boolean;

    /** Scope filter */
    scopeFilter?: 'all' | 'local' | 'closure' | 'global';

    /** Format: 'json' | 'text' */
    format?: 'json' | 'text';
}

/**
 * Result from streamVariables operation
 */
export interface IStreamResult {
    /** Success flag */
    success: boolean;

    /** Output file path */
    outputPath?: string;

    /** Number of variables written */
    variableCount?: number;

    /** Number of bytes written */
    byteCount?: number;

    /** Error if operation failed */
    error?: IDebugError;
}

/**
 * Main debug adapter interface
 * All language-specific adapters must implement this interface
 */
export interface IDebugAdapter {
    /** Associated debug session */
    readonly session: vscode.DebugSession;

    /** Adapter capabilities */
    readonly capabilities: IDebugCapabilities;

    /**
     * List all variables in current scope with depth limiting
     */
    listVariables(params: IListVariablesParams): Promise<IVariableData[] | IDebugError>;

    /**
     * Set a variable value
     */
    setVariable(params: ISetVariableParams): Promise<ISetVariableResult>;

    /**
     * Get children of a variable (with pagination support)
     */
    getVariableChildren(params: IVariableChildrenParams): Promise<IVariableData[] | IDebugError>;

    /**
     * Stream variables to a file (for large data structures)
     */
    streamVariables(params: IStreamVariablesParams): Promise<IStreamResult>;

    /**
     * Evaluate an expression in the current debug context
     */
    evaluateExpression(expression: string, frameId?: number): Promise<any | IDebugError>;

    /**
     * Dispose adapter and clean up resources
     */
    dispose(): void;
}
