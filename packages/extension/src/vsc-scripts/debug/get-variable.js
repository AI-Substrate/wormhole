const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { RuntimeInspectionService } = require('@core/runtime-inspection/RuntimeInspectionService');
const { createDebugError, DebugErrorCode } = require('@core/errors/debug-errors');

/**
 * Get Variable Query Script
 *
 * Retrieves a paginated subset of children from a single variable (array or object)
 * using the RuntimeInspectionService and language-specific debug adapters.
 *
 * Features:
 * - Pagination support (start/count)
 * - Filter support (indexed/named)
 * - Memory-efficient for large arrays
 *
 * Usage:
 *   vscb script run debug.get-variable --variablesReference=123 --start=0 --count=100
 */
class GetVariableScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            variablesReference: z.number().int().positive(),
            start: z.number().int().min(0).optional().default(0),
            count: z.number().int().positive().optional().default(100),
            filter: z.enum(['indexed', 'named', 'all']).optional().default('all')
        });

        this.resultSchema = z.object({
            success: z.boolean(),
            children: z.array(z.any()).optional(),
            pagination: z.object({
                start: z.number(),
                count: z.number(),
                shown: z.number(),
                hasMore: z.boolean()
            }).optional(),
            error: z.any().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{variablesReference: number, start?: number, count?: number, filter?: string}} params
     * @returns {Promise<object>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;
        const session = vscode.debug.activeDebugSession;
        const { variablesReference, start, count, filter } = params;

        // Check if there's an active debug session
        if (!session) {
            const error = createDebugError(
                DebugErrorCode.E_NO_SESSION,
                'No active debug session'
            );
            return {
                success: false,
                error: error
            };
        }

        // Validate variablesReference
        if (!variablesReference || variablesReference === 0) {
            const error = createDebugError(
                DebugErrorCode.E_INVALID_PARAMS,
                'Invalid variablesReference (must be > 0)'
            );
            return {
                success: false,
                error: error
            };
        }

        // Get the runtime inspection service
        const service = RuntimeInspectionService.getInstance();

        try {
            // Get adapter for the current session (no parameter = uses active session)
            const adapter = service.getAdapter();

            // Check if this is an error response (unsupported language)
            if ('code' in adapter) {
                return {
                    success: false,
                    error: adapter
                };
            }

            // Call getVariableChildren on the adapter
            const result = await adapter.getVariableChildren({
                variablesReference: variablesReference,
                start: start || 0,
                count: count || 100,
                filter: filter || 'all'
            });

            // Check if the result is an error
            if ('code' in result) {
                return {
                    success: false,
                    error: result
                };
            }

            // Success - result is the children array directly (not result.children)
            let allChildren = result;
            const requestedStart = start || 0;
            const requestedCount = count || 100;
            const receivedCount = allChildren.length;

            // CRITICAL: Some adapters (like pwa-node) ignore start/count and return everything!
            // We need to slice client-side if we got more than requested
            let children = allChildren;
            if (receivedCount > requestedCount) {
                // Adapter returned more than requested, slice to what was asked for
                children = allChildren.slice(requestedStart, requestedStart + requestedCount);
            }

            return {
                success: true,
                children: children,
                pagination: {
                    start: requestedStart,
                    count: requestedCount,
                    shown: children.length,
                    hasMore: receivedCount > (requestedStart + requestedCount)
                },
                metadata: {
                    sessionId: session.id,
                    sessionType: session.type,
                    variablesReference: variablesReference,
                    filter: filter || 'all'
                }
            };

        } catch (error) {
            // Unexpected error
            const debugError = createDebugError(
                DebugErrorCode.E_UNKNOWN,
                error.message || 'Unknown error occurred'
            );
            return {
                success: false,
                error: debugError
            };
        }
    }
}

module.exports = { GetVariableScript };
