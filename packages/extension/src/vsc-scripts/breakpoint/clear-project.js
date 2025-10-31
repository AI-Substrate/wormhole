const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Clear project breakpoints action script
 * Clears all breakpoints across the entire project
 */
class ClearProjectBreakpointsScript extends ActionScript {
    constructor() {
        super();
        this.paramsSchema = z.object({});
    }

    /**
     * @param {any} bridgeContext
     * @param {{}} params
     * @returns {Promise<{success: boolean, reason?: string, details?: any}>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        // Clear all breakpoints across the project
        const allBreakpoints = vscode.debug.breakpoints.slice();

        if (allBreakpoints.length > 0) {
            vscode.debug.removeBreakpoints(allBreakpoints);
        }

        // Log to output channel
        if (bridgeContext.outputChannel) {
            bridgeContext.outputChannel.appendLine(
                `[bp.clear.project] Cleared all ${allBreakpoints.length} breakpoint(s) from project`
            );
        }

        return ScriptResult.success({
            cleared: allBreakpoints.length
        });
    }
}

module.exports = { ClearProjectBreakpointsScript };