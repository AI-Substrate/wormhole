const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Clear file breakpoints action script
 * Clears all breakpoints in a specific file
 */
class ClearFileBreakpointsScript extends ActionScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            path: z.string().min(1)
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{path: string}} params
     * @returns {Promise<{success: boolean, reason?: string, details?: any}>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        // Clear breakpoints for the specific file
        const toRemove = vscode.debug.breakpoints.filter(
            bp => bp instanceof vscode.SourceBreakpoint &&
                  bp.location.uri.fsPath === params.path
        );

        if (toRemove.length > 0) {
            vscode.debug.removeBreakpoints(toRemove);
        }

        // Log to output channel
        if (bridgeContext.outputChannel) {
            bridgeContext.outputChannel.appendLine(
                `[bp.clear.file] Cleared ${toRemove.length} breakpoint(s) from ${params.path}`
            );
        }

        return this.success({
            cleared: toRemove.length,
            path: params.path
        });
    }
}

module.exports = { ClearFileBreakpointsScript };