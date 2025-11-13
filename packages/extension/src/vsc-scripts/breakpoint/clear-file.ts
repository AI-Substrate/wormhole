import { z } from 'zod';
import { ActionScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';
import * as vscode from 'vscode';

/**
 * Clear file breakpoints action script
 * Clears all breakpoints in a specific file
 */
@RegisterScript('breakpoint.clear.file')
export class ClearFileBreakpointsScript extends ActionScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            path: z.string().min(1)
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        const vscodeApi = bridgeContext.vscode;

        // Clear breakpoints for the specific file
        const toRemove = vscodeApi.debug.breakpoints.filter(
            bp => bp instanceof vscodeApi.SourceBreakpoint &&
                  (bp as vscode.SourceBreakpoint).location.uri.fsPath === params.path
        );

        if (toRemove.length > 0) {
            vscodeApi.debug.removeBreakpoints(toRemove);
        }

        // Log to output channel
        if (bridgeContext.outputChannel) {
            bridgeContext.outputChannel.appendLine(
                `[bp.clear.file] Cleared ${toRemove.length} breakpoint(s) from ${params.path}`
            );
        }

        return ScriptResult.success({
            cleared: toRemove.length,
            path: params.path
        });
    }
}

export default ClearFileBreakpointsScript;
