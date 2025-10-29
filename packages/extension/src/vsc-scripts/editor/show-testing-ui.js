const { ActionScript } = require('@script-base');

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
class ShowTestingUIScript extends ActionScript {
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        bridgeContext.logger.info('Showing Testing view to trigger test discovery...');

        try {
            // Show the Testing view (triggers test discovery)
            await vscode.commands.executeCommand('workbench.view.testing.focus');

            bridgeContext.logger.info('Testing view shown successfully');

            return this.success({
                message: 'Testing view shown - test discovery triggered',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            bridgeContext.logger.error(`Failed to show Testing view: ${error.message}`);

            return this.failure(
                'COMMAND_FAILED',
                `Failed to show Testing view: ${error.message}`
            );
        }
    }
}

module.exports = { ShowTestingUIScript };
