import { ErrorCode, getErrorMessage } from '../response/errorTaxonomy';

/**
 * Script result envelope - uniform structure for all script results
 * Replaces the dual ActionResult/throw pattern
 */
export interface ScriptEnvelope {
    ok: boolean;
    type: 'success' | 'error';
    data?: any;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
}

/**
 * Factory for creating standardized script results
 *
 * This is the SINGLE SOURCE OF TRUTH for script error handling.
 * All scripts MUST use this factory instead of:
 * - this.success() / this.failure() (deprecated)
 * - Throwing errors directly
 * - Returning custom error objects
 *
 * Usage:
 * ```typescript
 * // Success
 * return ScriptResult.success({ applied: true, changes: 5 });
 *
 * // Failure with known error code
 * return ScriptResult.failure(
 *   'Symbol "foo" not found in file.ts',
 *   ErrorCode.E_SYMBOL_NOT_FOUND
 * );
 *
 * // Failure from caught error (preserves VS Code error properties)
 * catch (error) {
 *   return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
 * }
 * ```
 */
export class ScriptResult {
    /**
     * Create a success result
     *
     * @param data - The successful result data (can be any type)
     * @returns ScriptEnvelope with ok=true
     *
     * @example
     * return ScriptResult.success({ applied: true, files: ['a.ts', 'b.ts'] });
     */
    static success(data: any): ScriptEnvelope {
        return {
            ok: true,
            type: 'success',
            data
        };
    }

    /**
     * Create a failure result with explicit message and error code
     *
     * @param message - Human-readable error message (NOT the error code!)
     * @param code - Error code from ErrorCode enum
     * @param details - Optional additional error context
     * @returns ScriptEnvelope with ok=false
     *
     * @example
     * return ScriptResult.failure(
     *   'Cannot rename symbol "oldName" to "newName" - file is read-only',
     *   ErrorCode.E_FILE_READ_ONLY,
     *   { file: '/path/to/file.ts', oldName, newName }
     * );
     */
    static failure(
        message: string,
        code: ErrorCode | string,
        details?: any
    ): ScriptEnvelope {
        return {
            ok: false,
            type: 'error',
            error: {
                code,
                message,
                details
            }
        };
    }

    /**
     * Create a failure from a caught error
     * Preserves all VS Code error properties wholesale
     *
     * This method should be used in catch blocks to ensure:
     * 1. VS Code error messages are preserved
     * 2. All error properties (stack, name, etc.) are captured
     * 3. Error codes are extracted if present
     *
     * @param error - The caught error object
     * @param fallbackCode - Error code to use if error doesn't have one
     * @returns ScriptEnvelope with ok=false
     *
     * @example
     * try {
     *   const result = await vscode.executeCommand('...');
     * } catch (error) {
     *   // Preserves VS Code error message and all properties
     *   return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
     * }
     */
    static fromError(error: any, fallbackCode: ErrorCode = ErrorCode.E_INTERNAL): ScriptEnvelope {
        // Extract error code (from error.code or use fallback)
        const code = error.code || fallbackCode;

        // Preserve original message, or use registry message if none
        const message = error.message || getErrorMessage(fallbackCode);

        return {
            ok: false,
            type: 'error',
            error: {
                code,
                message,
                details: {
                    ...error,  // Spread all VS Code error properties
                    stack: error.stack,
                    name: error.name
                }
            }
        };
    }

    /**
     * Check if a result is a success
     * Type guard for ScriptEnvelope
     */
    static isSuccess(result: ScriptEnvelope): result is ScriptEnvelope & { ok: true; data: any } {
        return result.ok === true;
    }

    /**
     * Check if a result is a failure
     * Type guard for ScriptEnvelope
     */
    static isFailure(result: ScriptEnvelope): result is ScriptEnvelope & { ok: false; error: NonNullable<ScriptEnvelope['error']> } {
        return result.ok === false;
    }
}
