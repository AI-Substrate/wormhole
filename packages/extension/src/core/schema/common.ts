import { z } from 'zod';
import { ResponseEnvelope, ResponseMeta, fail, ok } from '../response/envelope';
import { ErrorCode } from '../response/errorTaxonomy';

/**
 * Common Zod schemas for the application
 */

// Basic types
export const PathSchema = z.string().min(1, 'Path cannot be empty');

export const LineNumberSchema = z.number()
    .int('Line number must be an integer')
    .min(1, 'Line number must be at least 1');

export const ScriptNameSchema = z.string().min(1, 'Script name cannot be empty');

// Generate UUID function
const generateUuid = () => {
    // Simple UUID v4 generation for Node.js environment
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const RequestIdSchema = z.string().optional().default(generateUuid);

// Script execution parameters
export const ScriptParamsSchema = z.object({
    scriptName: ScriptNameSchema,
    params: z.record(z.string(), z.unknown()),
    timeout: z.number()
        .min(100, 'Timeout must be at least 100ms')
        .max(60000, 'Timeout cannot exceed 60000ms')
        .optional()
});

// Breakpoint parameters
export const BreakpointParamsSchema = z.object({
    path: PathSchema,
    line: LineNumberSchema,
    condition: z.string().optional()
});

// Debug session parameters
export const DebugSessionParamsSchema = z.object({
    configuration: z.string().min(1),
    commands: z.array(z.string()).optional(),
    stopOnEntry: z.boolean().optional()
});

// Wait for hit parameters
export const WaitForHitParamsSchema = z.object({
    timeoutMs: z.number()
        .min(100)
        .max(300000)  // 5 minutes max
        .optional()
        .default(30000)  // 30 seconds default
});

// List variables parameters
export const ListVariablesParamsSchema = z.object({
    scope: z.enum(['local', 'global', 'all']).optional().default('all')
});

/**
 * Validate data against a schema and return an envelope
 */
export function validateWithEnvelope<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    meta: ResponseMeta
): ResponseEnvelope<T | undefined> {
    const result = schema.safeParse(data);

    if (result.success) {
        return ok(result.data, meta);
    } else {
        return fail(
            ErrorCode.E_INVALID_PARAMS,
            'Validation failed',
            {
                errors: result.error.issues.map((err: z.ZodIssue) => ({
                    path: err.path.join('.'),
                    message: err.message,
                    code: err.code
                }))
            },
            meta
        );
    }
}

/**
 * Create a Zod validator for use in Express middleware
 * This is a placeholder for Phase 2
 */
export function createValidator<T>(schema: z.ZodSchema<T>) {
    return (data: unknown): T => {
        return schema.parse(data);
    };
}