/**
 * Test helpers for direct filesystem bridge IPC
 *
 * This module provides a thin wrapper around the production fs-bridge client
 * (src-cli/lib/fs-bridge.ts) with test-friendly utilities.
 *
 * CRITICAL: This is a ~50 line wrapper that RE-EXPORTS production code.
 * It does NOT duplicate the 345 lines of robust IPC implementation in fs-bridge.ts.
 *
 * Test Doc:
 * Why: Enable isolated bridge component testing without CLI/MCP layers
 * Contract: Re-export production client functions; add test-specific helpers only
 * Usage Notes: Use submitCommand() for simple test scenarios; advanced tests can use runCommand() directly
 * Quality Contribution: Prevents 345 lines of code duplication while enabling comprehensive bridge testing
 * Worked Example: submitCommand('debug.status', {}) → full response envelope
 */

// Re-export production fs-bridge client functions
export {
    findBridgeRoot,
    runCommand,
    sortableId,
    cancelCommand,
    watchEvents,
    checkBridgeHealth,
    type CommandJson,
    type RunOptions
} from '../../../src/lib/fs-bridge';

/**
 * Test-friendly command submission helper
 *
 * Test Doc:
 * Why: Simplify common test pattern of creating job ID + payload + submitting
 * Contract: Creates CommandJson payload with auto-incrementing ID, submits to bridge, returns response
 * Usage Notes: Pass scriptName and params; clientId defaults to 'bridge-isolated-test'
 * Quality Contribution: Reduces boilerplate in test scenarios (3 lines → 1 line)
 * Worked Example: await submitCommand(bridgeRoot, seq++, 'debug.status', {}) → response envelope
 */
export async function submitCommand(
    bridgeRoot: string,
    seq: number,
    scriptName: string,
    params: Record<string, unknown>,
    opts?: { timeout?: number; clientId?: string }
): Promise<any> {
    const { sortableId, runCommand } = await import('../../../src/lib/fs-bridge');

    const payload = {
        version: 1 as const,
        clientId: opts?.clientId || 'bridge-isolated-test',
        id: sortableId(seq),
        createdAt: new Date().toISOString(),
        scriptName,
        params
    };

    return runCommand(bridgeRoot, payload, { timeout: opts?.timeout || 30000 });
}
