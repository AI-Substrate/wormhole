/**
 * Nudge Test Discovery - Experimental Script
 *
 * Tests if showing the Testing view triggers test discovery.
 * Based on user's hypothesis that "jiggling" VS Code enables Python test discovery.
 *
 * Usage:
 *   1. Launch Extension Host: vscb script run debug.start --param launch="Run Extension"
 *   2. Wait 5 seconds
 *   3. Run this script: vscb script run -f ./scripts/sample/dynamic/nudge-test-discovery.js
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;

    console.log('🔍 Nudging test discovery by showing Testing view...');

    try {
        // Show the Testing view (the "jiggle")
        await vscode.commands.executeCommand('workbench.view.testing.focus');
        console.log('✅ Testing view focused');

        return {
            success: true,
            message: 'Testing view shown - test discovery may be triggered',
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('❌ Failed to show Testing view:', error.message);

        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
};
