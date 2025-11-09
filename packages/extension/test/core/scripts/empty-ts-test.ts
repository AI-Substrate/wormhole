/**
 * Phase 1: Empty TypeScript Test Script
 *
 * Validates that TypeScript scripts compile and bundle correctly.
 * This is a scratch test that may be deleted after Phase 1 validation.
 */

import { QueryScript } from '@script-base';
import { IBridgeContext } from '../../../src/core/bridge-context/types';

interface EmptyTestParams {
    testParam?: string;
}

interface EmptyTestResult {
    status: string;
    message: string;
    version?: string;
}

/**
 * Simple test script to verify TypeScript compilation works
 */
export class EmptyTestScript extends QueryScript<EmptyTestParams, EmptyTestResult> {
    async execute(
        bridgeContext: IBridgeContext,
        params: EmptyTestParams = {}
    ): Promise<EmptyTestResult> {
        bridgeContext.logger.info('Empty TypeScript test script executed');

        // Access some IBridgeContext properties to verify types work
        const workspace = bridgeContext.getWorkspace();
        const version = bridgeContext.version;

        // Test optional parameter handling
        const testValue = params.testParam || 'default';

        return {
            status: 'success',
            message: `TypeScript compilation working, version ${version}`,
            version
        };
    }
}