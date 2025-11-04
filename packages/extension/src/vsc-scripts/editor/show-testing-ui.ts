import { z } from 'zod';
import { ActionScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Show Testing UI Script
 *
 * Shows the Testing view in VS Code, which triggers test discovery.
 * This is particularly useful for enabling Python test discovery which
 * requires the Testing view to be visible ("jiggling").
 *
 * Usage:
 *   vscb script run tests.show-testing-ui
 *
 * Background:
 * VS Code's Python extension sometimes fails to discover tests until the
 * Testing view is shown. This script programmatically shows the view to
 * trigger discovery, enabling automated test workflows.
 */
@RegisterScript('editor.show-testing-ui')
export class ShowTestingUIScript extends ActionScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({});
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        const vscode = bridgeContext.vscode;

        bridgeContext.logger.info('Showing Testing view to trigger test discovery...');

        try {
            // Show the Testing view (triggers test discovery)
            await vscode.commands.executeCommand('workbench.view.testing.focus');

            bridgeContext.logger.info('Testing view shown successfully');

            return ScriptResult.success({
                message: 'Testing view shown - test discovery triggered',
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            bridgeContext.logger.error(`Failed to show Testing view: ${error.message}`);

            return ScriptResult.failure(
                `Failed to show Testing view: ${error.message}`,
                ErrorCode.E_OPERATION_FAILED,
                { originalError: error.message }
            );
        }
    }
}
