/**
 * Phase 0: JavaScript Compatibility Test
 *
 * This test validates that JavaScript scripts can still extend
 * typed base classes without errors (structural typing).
 */

const { describe, it, expect, vi } = require('vitest');
const { QueryScript } = require('../../../src/core/scripts/base');

// Mock vscode module
vi.mock('vscode');

// JavaScript script extending TypeScript base class
// This should work due to TypeScript's structural typing
class JavaScriptQueryScript extends QueryScript {
    /**
     * @param {any} bridgeContext - Using 'any' type in JSDoc for JavaScript
     * @param {{ name: string }} params
     * @returns {Promise<{ result: string }>}
     */
    async execute(bridgeContext, params) {
        // JavaScript can use the bridgeContext without type checking
        const workspace = bridgeContext.getWorkspace();

        // Can access logger
        bridgeContext.logger.info(`Processing ${params.name}`);

        // Can check for optional properties
        if (bridgeContext.debug && bridgeContext.debug.isActive()) {
            bridgeContext.logger.debug('Debug is active');
        }

        // Can use optional getJavaScriptEnv if present
        if (bridgeContext.getJavaScriptEnv) {
            const env = await bridgeContext.getJavaScriptEnv({ fsPath: '/test.js' });
            if (env) {
                return { result: `Found ${env.framework}` };
            }
        }

        // Can access paths.extensionRoot
        const extensionRoot = bridgeContext.paths?.extensionRoot;
        if (extensionRoot) {
            bridgeContext.logger.debug(`Extension at ${extensionRoot}`);
        }

        // Use existing debug.getSession() pattern
        const session = bridgeContext.debug?.getSession();
        if (session) {
            bridgeContext.logger.debug(`Session: ${session.id}`);
        }

        return { result: `Hello ${params.name}` };
    }
}

describe('JavaScript Compatibility', () => {
    it('should allow JavaScript to extend typed base classes', () => {
        // This test proves that JavaScript files can still extend
        // the base classes even though they're now using IBridgeContext
        const script = new JavaScriptQueryScript();
        expect(script).toBeDefined();
        expect(script.execute).toBeDefined();
    });

    it('should execute JavaScript script with mock context', async () => {
        const mockContext = {
            version: '1.0.0',
            vscode: {},
            logger: {
                info: vi.fn(),
                debug: vi.fn(),
                error: vi.fn(),
                warn: vi.fn()
            },
            getWorkspace: vi.fn().mockReturnValue(undefined),
            getActiveEditor: vi.fn(),
            getConfiguration: vi.fn(),
            dispose: vi.fn(),
            // Optional properties
            getJavaScriptEnv: vi.fn().mockResolvedValue(null),
            debug: {
                isActive: vi.fn().mockReturnValue(false),
                getSession: vi.fn().mockReturnValue(null)
            },
            paths: {
                extensionRoot: '/mock/extension'
            }
        };

        const script = new JavaScriptQueryScript();
        const result = await script.execute(mockContext, { name: 'test' });

        expect(result).toEqual({ result: 'Hello test' });
        expect(mockContext.logger.info).toHaveBeenCalledWith('Processing test');
        expect(mockContext.logger.debug).toHaveBeenCalledWith('Extension at /mock/extension');
    });

    it('should handle missing optional properties gracefully', async () => {
        const minimalContext = {
            version: '1.0.0',
            vscode: {},
            logger: {
                info: vi.fn(),
                debug: vi.fn(),
                error: vi.fn(),
                warn: vi.fn()
            },
            getWorkspace: vi.fn(),
            getActiveEditor: vi.fn(),
            getConfiguration: vi.fn(),
            dispose: vi.fn()
            // No optional properties provided
        };

        const script = new JavaScriptQueryScript();
        const result = await script.execute(minimalContext, { name: 'minimal' });

        // Should still work without optional properties
        expect(result).toEqual({ result: 'Hello minimal' });
        expect(minimalContext.logger.info).toHaveBeenCalled();
    });
});