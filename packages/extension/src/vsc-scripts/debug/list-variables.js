const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
// Lazy-load RuntimeInspectionService to avoid importing vscode at module load time
const { createDebugError, DebugErrorCode } = require('@core/errors/debug-errors');

/**
 * List Variables Query Script
 *
 * Retrieves variables from the current debug session using the RuntimeInspectionService
 * and language-specific debug adapters.
 *
 * Features:
 * - Depth-limited variable tree exploration
 * - Scope filtering (local, closure, global, all)
 * - Cycle detection
 * - Memory budget tracking
 */
class ListVariablesScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            scope: z.enum(['local', 'closure', 'global', 'all']).optional().default('all'),
            maxDepth: z.number().int().min(0).max(10).optional().default(3)
        });

        this.resultSchema = z.object({
            variables: z.array(z.any()),
            metadata: z.object({
                sessionId: z.string(),
                sessionType: z.string(),
                scope: z.string(),
                maxDepth: z.number(),
                variableCount: z.number(),
                budget: z.any().optional()
            }).optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{scope?: 'local' | 'closure' | 'global' | 'all', maxDepth?: number}} params
     * @returns {Promise<object>}
     */
    async execute(bridgeContext, params) {
        // Lazy-load RuntimeInspectionService here to avoid vscode import at module load time
        const { RuntimeInspectionService } = require('@core/runtime-inspection/RuntimeInspectionService');
        
        const vscode = bridgeContext.vscode;
        const session = vscode.debug.activeDebugSession;
        const scope = params.scope || 'all';
        const maxDepth = params.maxDepth !== undefined ? params.maxDepth : 3;

        // Check if there's an active debug session
        if (!session) {
            throw createDebugError(
                DebugErrorCode.E_NO_SESSION,
                'No active debug session'
            );
        }

        // Get the runtime inspection service
        const service = RuntimeInspectionService.getInstance();

        // Get adapter for the current session (no parameter = uses active session)
        const adapter = service.getAdapter();

        // Check if this is an error response (unsupported language)
        if ('code' in adapter) {
            throw adapter;
        }

        // Call listVariables on the adapter
        // Note: adapter expects 'scopeFilter' not 'scope'
        const result = await adapter.listVariables({
            maxDepth: maxDepth,
            scopeFilter: scope
        });

        // Check if the result is an error
        if ('code' in result) {
            throw result;
        }

        // Success - return the variables with metadata
        // Note: result is IVariableData[] (array of scope nodes)
        return {
            variables: result,
            metadata: {
                sessionId: session.id,
                sessionType: session.type,
                scope: scope,
                maxDepth: maxDepth,
                variableCount: result.length
            }
        };
    }
}

module.exports = { ListVariablesScript };