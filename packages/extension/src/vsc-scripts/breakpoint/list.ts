import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';
import * as vscode from 'vscode';

/**
 * List all breakpoints query script
 * Returns all active breakpoints in the workspace
 */
@RegisterScript('breakpoint.list')
export class ListBreakpointsScript extends QueryScript<any> {
    constructor() {
        super();
        // No params needed for listing all breakpoints
        this.paramsSchema = z.object({}).strict();
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        try {
            const vscodeApi = bridgeContext.vscode;

            // Get all breakpoints
            const allBreakpoints = vscodeApi.debug.breakpoints;

            // Transform breakpoints into a structured format
            const breakpoints = allBreakpoints
                .filter(bp => bp instanceof vscodeApi.SourceBreakpoint)
                .map(bp => {
                    const sourceBp = bp as vscode.SourceBreakpoint;
                    return {
                        path: sourceBp.location.uri.fsPath,
                        line: sourceBp.location.range.start.line + 1, // Convert to 1-indexed
                        enabled: sourceBp.enabled,
                        condition: sourceBp.condition || undefined,
                        hitCondition: sourceBp.hitCondition || undefined,
                        logMessage: sourceBp.logMessage || undefined
                    };
                });

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

export default ListBreakpointsScript;
