import { ErrorCode, ErrorMessages, ErrorHttpStatus, getErrorMessage, getHttpStatus } from '../response/errorTaxonomy';
import { ResponseEnvelope, ResponseMeta, fail } from '../response/envelope';

/**
 * Structured error class for consistent error handling
 */
export class StructuredError extends Error {
    public readonly code: ErrorCode;
    public readonly httpStatus: number;
    public readonly details?: unknown;

    constructor(
        code: ErrorCode,
        message?: string,
        details?: unknown
    ) {
        super(message || getErrorMessage(code));
        this.name = 'StructuredError';
        this.code = code;
        this.httpStatus = getHttpStatus(code);
        this.details = details;

        // Maintains proper stack trace for where our error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, StructuredError);
        }
    }

    /**
     * Convert to JSON representation
     */
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            details: this.details,
            httpStatus: this.httpStatus
        };
    }
}

/**
 * Factory function to create structured errors
 */
export function createError(
    code: ErrorCode,
    message?: string,
    details?: unknown
): StructuredError {
    return new StructuredError(code, message, details);
}

/**
 * Type guard to check if an error is a StructuredError
 */
export function isStructuredError(error: unknown): error is StructuredError {
    return error instanceof StructuredError;
}

/**
 * Convert any error to a response envelope
 */
export function toEnvelope(error: unknown, meta: ResponseMeta): ResponseEnvelope<undefined> {
    if (isStructuredError(error)) {
        return fail(
            error.code,
            error.message,
            error.details,
            meta
        );
    }

    // Handle regular errors
    if (error instanceof Error) {
        return fail(
            ErrorCode.E_INTERNAL,
            error.message,
            { name: error.name, stack: error.stack },
            meta
        );
    }

    // Handle unknown errors
    return fail(
        ErrorCode.E_INTERNAL,
        'An unknown error occurred',
        { error: String(error) },
        meta
    );
}

/**
 * Common error factories
 */
export const errors = {
    // Security & Access
    dangerModeRequired: (details?: unknown) =>
        createError(ErrorCode.E_DANGER_MODE_REQUIRED, undefined, details),

    unauthorized: (details?: unknown) =>
        createError(ErrorCode.E_UNAUTHORIZED, undefined, details),

    forbidden: (details?: unknown) =>
        createError(ErrorCode.E_FORBIDDEN, undefined, details),

    // Script Execution
    scriptNotFound: (alias: string) =>
        createError(ErrorCode.E_SCRIPT_NOT_FOUND, undefined, { alias }),

    invalidParams: (errors: unknown) =>
        createError(ErrorCode.E_INVALID_PARAMS, undefined, { errors }),

    timeout: (timeoutMs?: number) =>
        createError(ErrorCode.E_TIMEOUT, undefined, { timeoutMs }),

    aborted: (reason?: string) =>
        createError(ErrorCode.E_ABORTED, undefined, { reason }),

    // Debug Session
    noSession: () =>
        createError(ErrorCode.E_NO_SESSION),

    programExited: () =>
        createError(ErrorCode.E_PROGRAM_EXITED),

    breakpointInvalid: (details?: unknown) =>
        createError(ErrorCode.E_BREAKPOINT_INVALID, undefined, details),

    // System
    internal: (message?: string, details?: unknown) =>
        createError(ErrorCode.E_INTERNAL, message, details),

    notImplemented: (feature?: string) =>
        createError(ErrorCode.E_NOT_IMPLEMENTED, undefined, { feature }),

    // Validation
    fileNotFound: (path: string) =>
        createError(ErrorCode.E_FILE_NOT_FOUND, undefined, { path }),

    invalidPath: (path: string, reason?: string) =>
        createError(ErrorCode.E_INVALID_PATH, undefined, { path, reason }),

    invalidLine: (line: number, reason?: string) =>
        createError(ErrorCode.E_INVALID_LINE, undefined, { line, reason })
};