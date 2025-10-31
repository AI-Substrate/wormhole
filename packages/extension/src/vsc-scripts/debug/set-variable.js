const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { RuntimeInspectionService } = require('@core/runtime-inspection/RuntimeInspectionService');
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * Set Variable Mutation Script
 *
 * Modifies variable values during debugging using the RuntimeInspectionService
 * and language-specific debug adapters.
 *
 * Features:
 * - Dual strategy: DAP setVariable + evaluate fallback
 * - Safe expression building to prevent code injection
 * - Scope-aware modification
 * - Proper thread/frame selection
 *
 * Usage:
 *   vscb script run debug.set-variable --param name=x --param value=42
 *   vscb script run debug.set-variable --param name=obj.prop --param value='"hello"'
 */
class SetVariableScript extends ActionScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            name: z.string().min(1),
            value: z.string(),
            variablesReference: z.number().int().optional()
        });

        this.resultSchema = z.object({
            success: z.boolean(),
            value: z.string().optional(),
            type: z.string().optional(),
            variablesReference: z.number().optional(),
            namedVariables: z.number().optional(),
            indexedVariables: z.number().optional(),
            metadata: z.object({
                sessionId: z.string(),
                sessionType: z.string(),
                name: z.string()
            }).optional(),
            error: z.any().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{name: string, value: string, variablesReference?: number}} params
     * @returns {Promise<object>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;
        const session = vscode.debug.activeDebugSession;
        const { name, value, variablesReference } = params;

        // Check if there's an active debug session
        if (!session) {
            return ScriptResult.failure(
                'No active debug session',
                ErrorCode.E_NO_SESSION
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

            // Call setVariable on the adapter
            // Note: ISetVariableParams expects {name, value, variablesReference?, frameId?}
            // No 'scope' parameter in the interface
            const result = await adapter.setVariable({
                name: name,
                value: value,
                variablesReference: variablesReference
            });

            // Check if the result is an error
            if (!result.success) {
                return ScriptResult.fromError(result.error, ErrorCode.E_INTERNAL);
            }

            // Success - return the modification result
            // Note: ISetVariableResult provides 'value' (new value), not oldValue/newValue
            return ScriptResult.success({
                value: result.value,           // New value after modification
                type: result.type,
                variablesReference: result.variablesReference,
                namedVariables: result.namedVariables,
                indexedVariables: result.indexedVariables,
                metadata: {
                    sessionId: session.id,
                    sessionType: session.type,
                    name: name
                }
            });

        } catch (error) {
            // Unexpected error
            return ScriptResult.fromError(error, ErrorCode.E_INTERNAL);
        }
    }
}

module.exports = { SetVariableScript };
