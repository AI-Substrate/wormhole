import { z } from 'zod';
import { ActionScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';
import * as vscode from 'vscode';

/**
 * Remove specific breakpoint action script
 * Removes a breakpoint at a specific line
 */
@RegisterScript('breakpoint.remove')
export class RemoveBreakpointScript extends ActionScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            path: z.string().min(1),
            line: z.coerce.number().int().min(1) // CLI passes strings, use coerce
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        const vscodeApi = bridgeContext.vscode;

        // Find the breakpoint at the specified location
        const toRemove = vscodeApi.debug.breakpoints.filter(
            bp => bp instanceof vscodeApi.SourceBreakpoint &&
                  (bp as vscode.SourceBreakpoint).location.uri.fsPath === params.path &&
                  (bp as vscode.SourceBreakpoint).location.range.start.line === params.line - 1 // VS Code uses 0-indexed lines
        );

        if (toRemove.length === 0) {
            return ScriptResult.failure(
                `No breakpoint found at ${params.path}:${params.line}`,
                ErrorCode.E_NOT_FOUND,
                {
                    path: params.path,
                    line: params.line
                }
            );
        }

        // Remove the breakpoint(s)
        vscodeApi.debug.removeBreakpoints(toRemove);

        // Log to output channel
        if (bridgeContext.outputChannel) {
            bridgeContext.outputChannel.appendLine(
                `[bp.remove] Removed breakpoint at ${params.path}:${params.line}`
            );
        }

        return ScriptResult.success({
            path: params.path,
            line: params.line,
            removed: toRemove.length
        });
    }
}

export default RemoveBreakpointScript;
