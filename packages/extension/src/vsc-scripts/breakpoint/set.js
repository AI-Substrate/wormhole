const fs = require('fs');
const { z } = require('zod');
const { ActionScript } = require('@script-base');
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Set breakpoint action script
 * Supports conditions, hit conditions, and log messages
 */
class SetBreakpointScript extends ActionScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            path: z.string().min(1),
            line: z.number().int().min(1),
            condition: z.string().optional(),
            hitCondition: z.string().optional(),
            logMessage: z.string().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{path: string, line: number, condition?: string, hitCondition?: string, logMessage?: string}} params
     * @returns {Promise<{success: boolean, reason?: string, details?: any}>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        // Validate file exists
        if (!fs.existsSync(params.path)) {
            return ScriptResult.failure(
                `File not found: ${params.path}`,
                ErrorCode.E_FILE_NOT_FOUND,
                { path: params.path }
            );
        }

        // Validate line number is reasonable (must be positive)
        if (!params.line || params.line < 1) {
            return ScriptResult.failure(
                `Line number must be a positive integer (1 or greater), got ${params.line}`,
                ErrorCode.E_INVALID_LINE,
                { line: params.line }
            );
        }

        // Check if line number is within file bounds (optional but helpful)
        try {
            const fileContent = fs.readFileSync(params.path, 'utf-8');
            const lineCount = fileContent.split('\n').length;

            if (params.line > lineCount) {
                // VS Code allows setting breakpoints beyond EOF, but warn the user
                console.log(`[bp.set] Warning: Line ${params.line} is beyond end of file (${lineCount} lines)`);
                // Still allow it as VS Code handles this gracefully
            }
        } catch (err) {
            // If we can't read the file, just proceed - VS Code will handle it
            console.error(`[bp.set] Could not verify line bounds: ${err.message}`);
        }

        // Create source breakpoint
        const uri = vscode.Uri.file(params.path);
        const position = new vscode.Position(params.line - 1, 0); // VS Code uses 0-indexed lines
        const location = new vscode.Location(uri, position);

        // Create the breakpoint with all optional properties
        const sourceBreakpoint = new vscode.SourceBreakpoint(
            location,
            true, // enabled
            params.condition, // condition (optional)
            params.hitCondition, // hit condition (optional)
            params.logMessage // log message (optional)
        );

        // Add the breakpoint
        vscode.debug.addBreakpoints([sourceBreakpoint]);

        // Log to output channel
        if (bridgeContext.outputChannel) {
            let message = `[bp.set] Added breakpoint at ${params.path}:${params.line}`;
            if (params.condition) message += ` with condition: ${params.condition}`;
            if (params.hitCondition) message += ` with hit condition: ${params.hitCondition}`;
            if (params.logMessage) message += ` with log message: ${params.logMessage}`;
            bridgeContext.outputChannel.appendLine(message);
        }

        // Return success with breakpoint details
        return ScriptResult.success({
            breakpoint: {
                path: params.path,
                line: params.line,
                condition: params.condition,
                hitCondition: params.hitCondition,
                logMessage: params.logMessage,
                enabled: true,
                verified: true
            }
        });
    }
}

module.exports = { SetBreakpointScript };