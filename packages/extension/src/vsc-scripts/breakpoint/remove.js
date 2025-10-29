const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Remove specific breakpoint action script
 * Removes a breakpoint at a specific line
 */
class RemoveBreakpointScript extends ActionScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            path: z.string().min(1),
            line: z.number().int().min(1)
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{path: string, line: number}} params
     * @returns {Promise<{success: boolean, reason?: string, details?: any}>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        // Find the breakpoint at the specified location
        const toRemove = vscode.debug.breakpoints.filter(
            bp => bp instanceof vscode.SourceBreakpoint &&
                  bp.location.uri.fsPath === params.path &&
                  bp.location.range.start.line === params.line - 1 // VS Code uses 0-indexed lines
        );

        if (toRemove.length === 0) {
            return this.failure('E_NOT_FOUND', {
                path: params.path,
                line: params.line,
                message: 'No breakpoint found at the specified location'
            });
        }

        // Remove the breakpoint(s)
        vscode.debug.removeBreakpoints(toRemove);

        // Log to output channel
        if (bridgeContext.outputChannel) {
            bridgeContext.outputChannel.appendLine(
                `[bp.remove] Removed breakpoint at ${params.path}:${params.line}`
            );
        }

        return this.success({
            path: params.path,
            line: params.line,
            removed: toRemove.length
        });
    }
}

module.exports = { RemoveBreakpointScript };