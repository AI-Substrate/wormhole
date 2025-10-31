/**
 * Standardized error codes for the entire system
 */
export enum ErrorCode {
    // General
    E_NOT_FOUND = 'E_NOT_FOUND',

    // Security & Access
    E_DANGER_MODE_REQUIRED = 'E_DANGER_MODE_REQUIRED',
    E_UNAUTHORIZED = 'E_UNAUTHORIZED',
    E_FORBIDDEN = 'E_FORBIDDEN',

    // Script Execution
    E_SCRIPT_NOT_FOUND = 'E_SCRIPT_NOT_FOUND',
    E_SCRIPT_FAILED = 'E_SCRIPT_FAILED',
    E_INVALID_PARAMS = 'E_INVALID_PARAMS',
    E_TIMEOUT = 'E_TIMEOUT',
    E_ABORTED = 'E_ABORTED',

    // Debug Session
    E_NO_SESSION = 'E_NO_SESSION',
    E_PROGRAM_EXITED = 'E_PROGRAM_EXITED',
    E_BREAKPOINT_INVALID = 'E_BREAKPOINT_INVALID',
    E_DEBUG_SESSION_TERMINATED = 'E_DEBUG_SESSION_TERMINATED',
    E_BREAKPOINT_FAILED = 'E_BREAKPOINT_FAILED',

    // LSP & Language Server
    E_NO_LANGUAGE_SERVER = 'E_NO_LANGUAGE_SERVER',
    E_LSP_TIMEOUT = 'E_LSP_TIMEOUT',
    E_SYMBOL_NOT_FOUND = 'E_SYMBOL_NOT_FOUND',
    E_AMBIGUOUS_SYMBOL = 'E_AMBIGUOUS_SYMBOL',

    // File System
    E_FILE_READ_ONLY = 'E_FILE_READ_ONLY',
    E_FILE_ACCESS_DENIED = 'E_FILE_ACCESS_DENIED',

    // Operations
    E_OPERATION_FAILED = 'E_OPERATION_FAILED',
    E_OPERATION_CANCELLED = 'E_OPERATION_CANCELLED',

    // Bridge
    E_BRIDGE_UNAVAILABLE = 'E_BRIDGE_UNAVAILABLE',
    E_BRIDGE_TIMEOUT = 'E_BRIDGE_TIMEOUT',

    // System
    E_INTERNAL = 'E_INTERNAL',
    E_NOT_IMPLEMENTED = 'E_NOT_IMPLEMENTED',
    E_INVALID_CONTENT_TYPE = 'E_INVALID_CONTENT_TYPE',
    E_INVALID_ORIGIN = 'E_INVALID_ORIGIN',
    E_INVALID_HOST = 'E_INVALID_HOST',

    // Validation
    E_VALIDATION_FAILED = 'E_VALIDATION_FAILED',
    E_FILE_NOT_FOUND = 'E_FILE_NOT_FOUND',
    E_INVALID_PATH = 'E_INVALID_PATH',
    E_INVALID_LINE = 'E_INVALID_LINE'
}

/**
 * Error messages for each code
 */
export const ErrorMessages: Record<ErrorCode, string> = {
    [ErrorCode.E_NOT_FOUND]: 'Resource not found',
    [ErrorCode.E_DANGER_MODE_REQUIRED]: 'This operation requires danger mode to be enabled',
    [ErrorCode.E_UNAUTHORIZED]: 'Authentication required',
    [ErrorCode.E_FORBIDDEN]: 'Access denied',

    [ErrorCode.E_SCRIPT_NOT_FOUND]: 'Script not found',
    [ErrorCode.E_SCRIPT_FAILED]: 'Script execution failed',
    [ErrorCode.E_INVALID_PARAMS]: 'Invalid parameters provided',
    [ErrorCode.E_TIMEOUT]: 'Operation timed out',
    [ErrorCode.E_ABORTED]: 'Operation was aborted',

    [ErrorCode.E_NO_SESSION]: 'No active debug session',
    [ErrorCode.E_PROGRAM_EXITED]: 'Debug program has exited',
    [ErrorCode.E_BREAKPOINT_INVALID]: 'Invalid breakpoint configuration',
    [ErrorCode.E_DEBUG_SESSION_TERMINATED]: 'Debug session terminated unexpectedly',
    [ErrorCode.E_BREAKPOINT_FAILED]: 'Failed to set breakpoint',

    [ErrorCode.E_NO_LANGUAGE_SERVER]: 'No language server available for this file type',
    [ErrorCode.E_LSP_TIMEOUT]: 'Language server request timed out',
    [ErrorCode.E_SYMBOL_NOT_FOUND]: 'Symbol not found in file',
    [ErrorCode.E_AMBIGUOUS_SYMBOL]: 'Multiple symbols match the query',

    [ErrorCode.E_FILE_READ_ONLY]: 'File is read-only',
    [ErrorCode.E_FILE_ACCESS_DENIED]: 'File access denied',

    [ErrorCode.E_OPERATION_FAILED]: 'Operation failed',
    [ErrorCode.E_OPERATION_CANCELLED]: 'Operation was cancelled',

    [ErrorCode.E_BRIDGE_UNAVAILABLE]: 'VSC-Bridge is not available',
    [ErrorCode.E_BRIDGE_TIMEOUT]: 'Bridge request timed out',

    [ErrorCode.E_INTERNAL]: 'Internal server error',
    [ErrorCode.E_NOT_IMPLEMENTED]: 'Feature not implemented',
    [ErrorCode.E_INVALID_CONTENT_TYPE]: 'Content-Type must be application/json',
    [ErrorCode.E_INVALID_ORIGIN]: 'Invalid Origin header',
    [ErrorCode.E_INVALID_HOST]: 'Invalid Host header',

    [ErrorCode.E_VALIDATION_FAILED]: 'Validation failed',
    [ErrorCode.E_FILE_NOT_FOUND]: 'File not found',
    [ErrorCode.E_INVALID_PATH]: 'Invalid file path',
    [ErrorCode.E_INVALID_LINE]: 'Invalid line number'
};

/**
 * HTTP status codes for error codes
 */
export const ErrorHttpStatus: Record<ErrorCode, number> = {
    [ErrorCode.E_NOT_FOUND]: 404,
    [ErrorCode.E_DANGER_MODE_REQUIRED]: 403,
    [ErrorCode.E_UNAUTHORIZED]: 401,
    [ErrorCode.E_FORBIDDEN]: 403,

    [ErrorCode.E_SCRIPT_NOT_FOUND]: 404,
    [ErrorCode.E_SCRIPT_FAILED]: 500,
    [ErrorCode.E_INVALID_PARAMS]: 400,
    [ErrorCode.E_TIMEOUT]: 408,
    [ErrorCode.E_ABORTED]: 499,

    [ErrorCode.E_NO_SESSION]: 409,
    [ErrorCode.E_PROGRAM_EXITED]: 410,
    [ErrorCode.E_BREAKPOINT_INVALID]: 400,
    [ErrorCode.E_DEBUG_SESSION_TERMINATED]: 410,
    [ErrorCode.E_BREAKPOINT_FAILED]: 500,

    [ErrorCode.E_NO_LANGUAGE_SERVER]: 503,
    [ErrorCode.E_LSP_TIMEOUT]: 408,
    [ErrorCode.E_SYMBOL_NOT_FOUND]: 404,
    [ErrorCode.E_AMBIGUOUS_SYMBOL]: 409,

    [ErrorCode.E_FILE_READ_ONLY]: 403,
    [ErrorCode.E_FILE_ACCESS_DENIED]: 403,

    [ErrorCode.E_OPERATION_FAILED]: 500,
    [ErrorCode.E_OPERATION_CANCELLED]: 499,

    [ErrorCode.E_BRIDGE_UNAVAILABLE]: 503,
    [ErrorCode.E_BRIDGE_TIMEOUT]: 408,

    [ErrorCode.E_INTERNAL]: 500,
    [ErrorCode.E_NOT_IMPLEMENTED]: 501,
    [ErrorCode.E_INVALID_CONTENT_TYPE]: 415,
    [ErrorCode.E_INVALID_ORIGIN]: 403,
    [ErrorCode.E_INVALID_HOST]: 403,

    [ErrorCode.E_VALIDATION_FAILED]: 400,
    [ErrorCode.E_FILE_NOT_FOUND]: 404,
    [ErrorCode.E_INVALID_PATH]: 400,
    [ErrorCode.E_INVALID_LINE]: 400
};

/**
 * Get error message for a code
 */
export function getErrorMessage(code: ErrorCode): string {
    return ErrorMessages[code] || 'Unknown error';
}

/**
 * Get HTTP status for an error code
 */
export function getHttpStatus(code: ErrorCode): number {
    return ErrorHttpStatus[code] || 500;
}