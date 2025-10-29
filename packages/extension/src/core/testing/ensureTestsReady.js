/**
 * JavaScript wrapper for test discovery utilities
 * Used by scripts that need to ensure tests are discovered before proceeding
 */

const path = require('path');

/**
 * Ensure Python tests are ready before operations
 * @param {any} vscode - VS Code API
 * @param {string} targetFile - Path to the test file
 * @param {any} outputChannel - Optional output channel for logging
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{ready: boolean, framework?: string, itemCount?: number, reason?: string}>}
 */
async function ensurePythonTestsReady(vscode, targetFile, outputChannel, timeoutMs = 30000) {
    try {
        // Dynamic import of the TypeScript module (compiled to JS)
        const extensionRoot = path.resolve(__dirname, '../../..');
        const { ensurePythonTestsReady: tsEnsure } = require(path.join(extensionRoot, 'out', 'core', 'testing', 'waitForDiscovery'));

        if (outputChannel) {
            outputChannel.appendLine('[test.debug-wait] Waiting for Python test discovery...');
        }

        const outcome = await tsEnsure(targetFile, timeoutMs);

        if (outputChannel) {
            if (outcome.kind === 'ready') {
                outputChannel.appendLine(`[test.debug-wait] Test discovery complete: ${outcome.itemCount} items found, framework: ${outcome.framework || 'unknown'}`);
            } else {
                outputChannel.appendLine(`[test.debug-wait] Test discovery failed: ${outcome.kind} - ${outcome.details || 'No details'}`);
            }
        }

        // Convert to simpler format for JS consumption
        return {
            ready: outcome.kind === 'ready',
            framework: outcome.framework,
            itemCount: outcome.itemCount,
            reason: outcome.details || outcome.kind
        };
    } catch (error) {
        // Fallback if the TypeScript module isn't available or fails
        if (outputChannel) {
            outputChannel.appendLine(`[test.debug-wait] Test discovery check failed: ${error.message}`);
            outputChannel.appendLine('[test.debug-wait] Proceeding without discovery wait (backward compatibility)');
        }

        // Return ready=true for backward compatibility
        return {
            ready: true,
            framework: 'unknown',
            reason: 'Discovery check not available'
        };
    }
}

module.exports = { ensurePythonTestsReady };