import { z } from 'zod';
import { ActionScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Clear project breakpoints action script
 * Clears all breakpoints across the entire project
 */
@RegisterScript('breakpoint.clear-project')
export class ClearProjectBreakpointsScript extends ActionScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({});
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        const vscodeApi = bridgeContext.vscode;

        // Clear all breakpoints across the project
        const allBreakpoints = vscodeApi.debug.breakpoints.slice();

        if (allBreakpoints.length > 0) {
            vscodeApi.debug.removeBreakpoints(allBreakpoints);
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

export default ClearProjectBreakpointsScript;
