/**
 * Debug Script Error Codes and Utilities
 *
 * Centralized error definitions for all debug scripts.
 * Each error includes a code, message, and actionable recovery hint.
 */

import type { IStreamingSuggestion } from '../runtime-inspection/interfaces';

/**
 * Standardized debug error codes
 * All codes use E_ prefix for consistency
 */
export enum DebugErrorCode {
    // Session errors
    E_NO_SESSION = 'E_NO_SESSION',
    E_NOT_PAUSED = 'E_NOT_PAUSED',
    E_NOT_STOPPED = 'E_NOT_STOPPED',

    // Parameter errors
    E_INVALID_PARAMS = 'E_INVALID_PARAMS',
    E_MISSING_REQUIRED_PARAM = 'E_MISSING_REQUIRED_PARAM',

    // Data size errors
    E_LARGE_DATA = 'E_LARGE_DATA',
    E_MEMORY_BUDGET_EXCEEDED = 'E_MEMORY_BUDGET_EXCEEDED',

    // Language support errors
    E_UNSUPPORTED_LANGUAGE = 'E_UNSUPPORTED_LANGUAGE',
    E_NOT_IMPLEMENTED = 'E_NOT_IMPLEMENTED',

    // DAP operation errors
    E_NO_THREADS = 'E_NO_THREADS',
    E_NO_STACK = 'E_NO_STACK',
    E_NO_FRAMES = 'E_NO_FRAMES',
    E_INVALID_REFERENCE = 'E_INVALID_REFERENCE',
    E_STALE_REFERENCE = 'E_STALE_REFERENCE',

    // Modification errors
    E_MODIFICATION_FAILED = 'E_MODIFICATION_FAILED',
    E_READ_ONLY = 'E_READ_ONLY',
    E_UNSUPPORTED_OPERATION = 'E_UNSUPPORTED_OPERATION',

    // Evaluation errors
    E_EVALUATE_FAILED = 'E_EVALUATE_FAILED',
    E_NOT_EXPANDABLE = 'E_NOT_EXPANDABLE',

    // Concurrency errors
    E_BUSY = 'E_BUSY',

    // Capability errors
    E_UNSUPPORTED_CAPABILITY = 'E_UNSUPPORTED_CAPABILITY',

    // Session lifecycle errors
    E_SESSION_TERMINATED = 'E_SESSION_TERMINATED',

    // Generic errors
    E_UNKNOWN = 'E_UNKNOWN',
    E_INTERNAL = 'E_INTERNAL',
}

/**
 * Structured debug error with code, message, and recovery hint
 * Per Subtask 001 ST010: Extended with optional machine-actionable suggestion
 */
export interface IDebugError {
    code: DebugErrorCode;
    message: string;
    hint?: string;
    detail?: string;
    /** Optional machine-actionable suggestion (e.g., for streaming large data) */
    suggestion?: IStreamingSuggestion;
}

/**
 * Error message templates with recovery hints
 * Each template provides actionable guidance for the user
 */
const ERROR_TEMPLATES: Record<DebugErrorCode, { message: string; hint: string }> = {
    // Session errors - Critical Discovery 02: Variable references only valid while paused
    [DebugErrorCode.E_NO_SESSION]: {
        message: 'No active debug session',
        hint: 'Start debugging with F5 or select a debug configuration and press the play button',
    },
    [DebugErrorCode.E_NOT_PAUSED]: {
        message: 'Debugger is not paused at a breakpoint',
        hint: 'Set a breakpoint and wait for execution to stop, or use the pause button in the debug toolbar',
    },
    [DebugErrorCode.E_NOT_STOPPED]: {
        message: 'Operation requires the debuggee to be in a DAP "stopped" (paused) state',
        hint: 'Pause at a breakpoint (DAP stopped state) before retrying this operation',
    },

    // Parameter errors
    [DebugErrorCode.E_INVALID_PARAMS]: {
        message: 'Invalid parameters provided',
        hint: 'Check the parameter requirements for this script and ensure all required fields are provided',
    },
    [DebugErrorCode.E_MISSING_REQUIRED_PARAM]: {
        message: 'Required parameter is missing',
        hint: 'Review the script documentation for required parameters',
    },

    // Data size errors - Critical Discovery 03: Memory budget required for large structures
    [DebugErrorCode.E_LARGE_DATA]: {
        message: 'Variable data exceeds size threshold (5MB or 20,000 nodes)',
        hint: 'Consider using debug.stream-variables to write large data to a file instead',
    },
    [DebugErrorCode.E_MEMORY_BUDGET_EXCEEDED]: {
        message: 'Memory budget exceeded during variable traversal',
        hint: 'Reduce the depth parameter or use debug.stream-variables for file output',
    },

    // Language support errors - Critical Discovery 04: Language detection via session type
    [DebugErrorCode.E_UNSUPPORTED_LANGUAGE]: {
        message: 'Debug adapter language is not supported',
        hint: 'Supported debuggers: pwa-node (JavaScript/TypeScript), coreclr (C#/.NET), debugpy (Python), java (Java)',
    },
    [DebugErrorCode.E_NOT_IMPLEMENTED]: {
        message: 'This feature is not yet implemented for the current language',
        hint: 'Only Node.js debugging is fully supported in this version. Use base DAP functionality for other languages',
    },

    // DAP operation errors
    [DebugErrorCode.E_NO_THREADS]: {
        message: 'No threads available in the debug session',
        hint: 'Ensure the debugger is paused and has active threads before trying again',
    },
    [DebugErrorCode.E_NO_STACK]: {
        message: 'No stack frames available',
        hint: 'Pause the debugger at a breakpoint to access stack frames',
    },
    [DebugErrorCode.E_NO_FRAMES]: {
        message: 'No stack frames found for the current thread',
        hint: 'Ensure the debugger is paused with an active call stack',
    },
    [DebugErrorCode.E_INVALID_REFERENCE]: {
        message: 'Invalid variablesReference provided',
        hint: 'Use debug.list-variables to get valid variablesReference values for expandable items',
    },
    [DebugErrorCode.E_STALE_REFERENCE]: {
        message: 'Variable reference is no longer valid (execution has resumed)',
        hint: 'Variable references are only valid while execution is paused. Pause again and retrieve fresh references',
    },

    // Modification errors
    [DebugErrorCode.E_MODIFICATION_FAILED]: {
        message: 'Failed to modify variable value',
        hint: 'Check that the variable is not read-only and the value type is compatible',
    },
    [DebugErrorCode.E_READ_ONLY]: {
        message: 'Cannot modify this variable (read-only, const, or frozen)',
        hint: 'This variable cannot be modified. Try modifying a different variable',
    },
    [DebugErrorCode.E_UNSUPPORTED_OPERATION]: {
        message: 'Operation not supported by the debug adapter',
        hint: 'Some debuggers have limited modification capabilities. Consult adapter documentation',
    },

    // Evaluation errors
    [DebugErrorCode.E_EVALUATE_FAILED]: {
        message: 'Failed to evaluate expression in debug context',
        hint: 'Check the expression syntax and ensure it\'s valid for the current language',
    },
    [DebugErrorCode.E_NOT_EXPANDABLE]: {
        message: 'Expression does not produce expandable variables',
        hint: 'The expression result is a primitive value or cannot be expanded further',
    },

    // Concurrency errors
    [DebugErrorCode.E_BUSY]: {
        message: 'Operation is currently locked by another concurrent request',
        hint: 'Wait for the current operation to complete and retry. Operations typically complete within 1-2 seconds',
    },

    // Capability errors
    [DebugErrorCode.E_UNSUPPORTED_CAPABILITY]: {
        message: 'This operation is not supported by the current debug adapter',
        hint: 'Check the adapter capabilities or try an alternative approach suggested in the error details',
    },

    // Session lifecycle errors
    [DebugErrorCode.E_SESSION_TERMINATED]: {
        message: 'Debug session has been terminated',
        hint: 'Start a new debug session to continue debugging',
    },

    // Generic errors
    [DebugErrorCode.E_UNKNOWN]: {
        message: 'An unknown error occurred',
        hint: 'Check the VS Code output panel for more details',
    },
    [DebugErrorCode.E_INTERNAL]: {
        message: 'Internal error in debug script',
        hint: 'This may be a bug. Check the VS Code output panel for details',
    },
};

/**
 * Create a standardized debug error with code, message, and hint
 *
 * @param code - The error code
 * @param detail - Optional additional detail about the specific error
 * @returns Structured error object
 */
export function createDebugError(
    code: DebugErrorCode,
    detail?: string
): IDebugError {
    const template = ERROR_TEMPLATES[code];

    if (!template) {
        // Fallback if error code not found in templates
        return {
            code: DebugErrorCode.E_UNKNOWN,
            message: `Unknown error code: ${code}`,
            hint: 'This error code is not defined. Please check the error code constant',
            detail,
        };
    }

    return {
        code,
        message: template.message,
        hint: template.hint,
        detail,
    };
}

/**
 * Create an error with custom message override
 * Useful for adding specific context while keeping the standard hint
 *
 * @param code - The error code
 * @param customMessage - Custom message to use instead of template
 * @param detail - Optional additional detail
 * @returns Structured error object
 */
export function createCustomDebugError(
    code: DebugErrorCode,
    customMessage: string,
    detail?: string
): IDebugError {
    const template = ERROR_TEMPLATES[code];

    return {
        code,
        message: customMessage,
        hint: template?.hint || 'Check the VS Code output panel for more details',
        detail,
    };
}

/**
 * Format an error for display or logging
 *
 * @param error - The error to format
 * @returns Formatted error string
 */
export function formatDebugError(error: IDebugError): string {
    let result = `[${error.code}] ${error.message}`;

    if (error.hint) {
        result += `\n💡 Hint: ${error.hint}`;
    }

    if (error.detail) {
        result += `\n📋 Detail: ${error.detail}`;
    }

    return result;
}

/**
 * Check if an error indicates the debugger is not in the required state
 *
 * @param error - The error to check
 * @returns true if the error is a state error
 */
export function isDebuggerStateError(error: IDebugError): boolean {
    return [
        DebugErrorCode.E_NO_SESSION,
        DebugErrorCode.E_NOT_PAUSED,
        DebugErrorCode.E_NOT_STOPPED,
        DebugErrorCode.E_NO_THREADS,
        DebugErrorCode.E_NO_STACK,
        DebugErrorCode.E_NO_FRAMES,
    ].includes(error.code);
}

/**
 * Check if an error is related to variable references
 *
 * @param error - The error to check
 * @returns true if the error is a reference error
 */
export function isReferenceError(error: IDebugError): boolean {
    return [
        DebugErrorCode.E_INVALID_REFERENCE,
        DebugErrorCode.E_STALE_REFERENCE,
    ].includes(error.code);
}

/**
 * Get a list of all supported debugger types (for error messages)
 */
export function getSupportedDebuggerTypes(): string[] {
    return [
        'pwa-node',      // Node.js / JavaScript / TypeScript
        'coreclr',       // C# / .NET (vsdbg)
        'debugpy',       // Python
        'java',          // Java
        'dlv-dap',       // Go
        'dart',          // Dart
    ];
}

/**
 * Create an unsupported language error with the current session type
 *
 * @param sessionType - The unsupported session type
 * @returns Structured error with supported types listed
 */
export function createUnsupportedLanguageError(sessionType: string): IDebugError {
    const supported = getSupportedDebuggerTypes().join(', ');
    return createCustomDebugError(
        DebugErrorCode.E_UNSUPPORTED_LANGUAGE,
        `Debug adapter '${sessionType}' is not currently supported`,
        `Supported types: ${supported}`
    );
}

/**
 * Create a large data suggestion error with specific size information
 * Per Subtask 001 ST011: Returns structured machine-actionable suggestion
 *
 * @param nodeCount - Number of nodes in the data structure
 * @param byteCount - Approximate byte size
 * @returns Structured error with machine-actionable streaming suggestion
 */
export function createLargeDataError(nodeCount: number, byteCount: number): IDebugError {
    const mb = byteCount / (1024 * 1024);
    const msgSize = mb >= 1
        ? `~${mb.toFixed(2)}MB`
        : `${Math.round(byteCount / 1024)}KB`;

    // Create structured suggestion for streaming to file
    const suggestion: IStreamingSuggestion = {
        mode: 'stream-to-file',
        command: 'debug.stream-variables',
        reason: 'budget-exceeded',
        recommendedPageSize: 500,
        expectedSizeMB: mb >= 1 ? parseFloat(mb.toFixed(2)) : parseFloat((byteCount / (1024 * 1024)).toFixed(2)),
        params: {
            format: 'jsonl'
        }
    };

    const error = createCustomDebugError(
        DebugErrorCode.E_LARGE_DATA,
        `Variable data is too large: ${nodeCount} nodes, ${msgSize}`,
        'Use debug.stream-variables with an outputPath to write this data to a file'
    );

    // Add structured suggestion
    error.suggestion = suggestion;

    return error;
}
