import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Get editor context script
 * Returns human-friendly summary of current editor state
 * Full context is automatically enriched by ScriptRegistry in envelope
 */
@RegisterScript('editor.get-context')
export class GetContextScript extends QueryScript<any> {
    constructor() {
        super();
        // No parameters needed - captures current editor state
        this.paramsSchema = z.object({});
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
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
        } catch (error: any) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}
