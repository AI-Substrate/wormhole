const { z } = require('zod');
const { QueryScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * @typedef {any} ScriptContext
 */

/**
 * List all breakpoints query script
 * Returns all active breakpoints in the workspace
 */
class ListBreakpointsScript extends QueryScript {
    constructor() {
        super();
        // No params needed for listing all breakpoints
        this.paramsSchema = z.object({}).strict();
    }

    /**
     * @param {any} bridgeContext
     * @param {{}} params
     * @returns {Promise<{breakpoints: Array}>}
     */
    async execute(bridgeContext, params) {
        try {
            const vscode = bridgeContext.vscode;

            // Get all breakpoints
            const allBreakpoints = vscode.debug.breakpoints;

            // Transform breakpoints into a structured format
            const breakpoints = allBreakpoints
                .filter(bp => bp instanceof vscode.SourceBreakpoint)
                .map(bp => ({
                    path: bp.location.uri.fsPath,
                    line: bp.location.range.start.line + 1, // Convert to 1-indexed
                    enabled: bp.enabled,
                    condition: bp.condition || undefined,
                    hitCondition: bp.hitCondition || undefined,
                    logMessage: bp.logMessage || undefined
                }));

            // Log to output channel
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[bp.list] Found ${breakpoints.length} breakpoint(s)`
                );
            }

            return ScriptResult.success({
                breakpoints,
                total: breakpoints.length
            });
        } catch (error) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}

module.exports = { ListBreakpointsScript };