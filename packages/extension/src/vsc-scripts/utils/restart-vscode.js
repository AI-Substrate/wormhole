const { ActionScript } = require('@script-base');

/**
 * Restart VS Code Script
 *
 * Triggers VS Code window reload to apply extension updates.
 * This is useful after installing extensions via `just install-extension`
 * to ensure updated extensions are loaded without manual restart.
 *
 * Usage:
 *   vscb script run utils.restart-vscode
 *
 * Background:
 * VS Code extension changes require full window reload to take effect.
 * This script programmatically triggers the reload, eliminating the
 * manual restart step in the development workflow.
 *
 * Note:
 * This reloads the current window. For Extension Development Host,
 * this will reload the host window. The workspace will be preserved.
 */
class RestartVSCodeScript extends ActionScript {
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        bridgeContext.logger.info('🔄 Reloading VS Code window...');
        bridgeContext.logger.info('⚠️  NOTE: This command will appear to fail - that means it worked!');
        bridgeContext.logger.info('    VS Code kills the extension during reload, causing a "connection lost" error.');

        try {
            // Reload the window to apply extension updates
            // Note: This command will terminate this script execution as the window reloads
            await vscode.commands.executeCommand('workbench.action.reloadWindow');

            // This line may not execute if reload happens immediately
            bridgeContext.logger.info('Window reload triggered successfully');

            return this.success({
                message: 'VS Code window reload triggered - window will restart momentarily',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            // This is expected! The window reload kills the extension before it can respond
            bridgeContext.logger.error(`⚠️  Connection lost during reload (this is expected): ${error.message}`);

            return this.failure(
                'COMMAND_FAILED',
                `Failed to trigger window reload: ${error.message}`
            );
        }
    }
}

module.exports = { RestartVSCodeScript };
