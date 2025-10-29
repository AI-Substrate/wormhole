/**
 * List Breakpoints - Dynamic Script Sample
 *
 * This script demonstrates how to access VS Code's breakpoint API
 * using a dynamic script with the VSC-Bridge system.
 *
 * Usage:
 *   vscb script run -f ./samples/dynamic/list-breakpoints.js
 *   OR
 *   just sample-bp-list
 */

module.exports = async function(bridgeContext, params) {
    // Access VS Code API through injected bridgeContext
    // IMPORTANT: Do NOT use require('vscode') - it won't work in VM context
    const vscode = bridgeContext.vscode;

    // Get all breakpoints from VS Code
    const allBreakpoints = vscode.debug.breakpoints;

    // Filter to source breakpoints only (not function or data breakpoints)
    const sourceBreakpoints = allBreakpoints
        .filter(bp => bp instanceof vscode.SourceBreakpoint)
        .map(bp => ({
            path: bp.location.uri.fsPath,
            line: bp.location.range.start.line + 1,  // Convert 0-indexed to 1-indexed
            enabled: bp.enabled,
            condition: bp.condition || undefined,
            hitCondition: bp.hitCondition || undefined,
            logMessage: bp.logMessage || undefined
        }));

    // Log to output channel for debugging
    bridgeContext.logger.info(`Found ${sourceBreakpoints.length} breakpoints`);

    // Console log for immediate feedback during development
    console.log('=== Breakpoints ===');
    console.log(JSON.stringify(sourceBreakpoints, null, 2));

    // Return structured data
    return {
        breakpoints: sourceBreakpoints,
        total: sourceBreakpoints.length
    };
};
