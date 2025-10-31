const { z } = require('zod');
const { QueryScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * Get editor context script
 * Returns human-friendly summary of current editor state
 * Full context is automatically enriched by ScriptRegistry in envelope
 */
class GetContextScript extends QueryScript {
    constructor() {
        super();
        // No parameters needed - captures current editor state
        this.paramsSchema = z.object({});
    }

    /**
     * Execute get context operation
     * @param {any} bridgeContext
     * @param {{}} params
     * @returns {Promise<Object>}
     */
    async execute(bridgeContext, params) {
        try {
            const vscode = bridgeContext.vscode;
            const editor = vscode.window.activeTextEditor;

            // Return human-friendly summary (full context auto-enriched by ScriptRegistry)
            return ScriptResult.success({
                message: "Editor context captured successfully",
                contextAvailable: !!editor,
                file: editor?.document.fileName || null,
                line: editor ? editor.selection.active.line + 1 : null
            });
        } catch (error) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}

module.exports = { GetContextScript };
