/**
 * Phase 1: TypeScript Infrastructure Test Script
 *
 * Validates that TypeScript scripts compile and bundle correctly.
 * This is a scratch test for Phase 1 validation.
 */

import { QueryScript } from '@script-base';
import { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';

/**
 * Simple test script to verify TypeScript compilation works
 */
export class Phase1TestScript extends QueryScript<void, any> {
    async execute(
        bridgeContext: IBridgeContext
    ): Promise<ScriptResult> {
        bridgeContext.logger.info('Phase 1 TypeScript test script executed');

        // Access IBridgeContext properties to verify types work
        const workspace = bridgeContext.getWorkspace();
        const version = bridgeContext.version;

        return {
            success: true,
            data: {
                status: 'success',
                message: `TypeScript compilation working, version ${version}`,
                workspace: workspace?.uri.fsPath
            }
        };
    }
}

export default Phase1TestScript;