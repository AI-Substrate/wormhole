import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { RuntimeInspectionService } from '@core/runtime-inspection/RuntimeInspectionService';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

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
@RegisterScript('debug.get-variable')
export class GetVariableScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            variablesReference: z.coerce.number().int().positive(),
            start: z.coerce.number().int().min(0).optional().default(0),
            count: z.coerce.number().int().positive().optional().default(100),
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

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        const vscode = bridgeContext.vscode;
        const session = vscode.debug.activeDebugSession;
        const { variablesReference, start, count, filter } = params;

        // Check if there's an active debug session
        if (!session) {
            return ScriptResult.failure(
                'No active debug session',
                ErrorCode.E_NO_SESSION
            );
        }

        // Validate variablesReference
        if (!variablesReference || variablesReference === 0) {
            return ScriptResult.failure(
                'Invalid variablesReference (must be > 0)',
                ErrorCode.E_INVALID_PARAMS
            );
        }

        // Get the runtime inspection service
        const service = RuntimeInspectionService.getInstance();

        try {
            // Get adapter for the current session (no parameter = uses active session)
            const adapter = service.getAdapter();

            // Check if this is an error response (unsupported language)
            if ('code' in adapter) {
                return ScriptResult.fromError(adapter, ErrorCode.E_INTERNAL);
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
                return ScriptResult.fromError(result, ErrorCode.E_INTERNAL);
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

            return ScriptResult.success({
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
            });

        } catch (error: any) {
            // Unexpected error
            return ScriptResult.fromError(error, ErrorCode.E_INTERNAL);
        }
    }
}
