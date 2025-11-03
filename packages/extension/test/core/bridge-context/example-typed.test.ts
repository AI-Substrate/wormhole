/**
 * Phase 0: TypeScript Example Test with Type Enforcement
 *
 * This test validates that TypeScript type checking works correctly
 * with the IBridgeContext interface when used in script base classes.
 *
 * NOTE: This is primarily a compile-time test. The fact that this file
 * compiles without errors proves that the IBridgeContext interface is
 * properly typed and that base classes are using it correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { QueryScript, ActionScript, WaitableScript } from '../../../src/core/scripts/base';
import type { IBridgeContext, ITestEnvironment } from '../../../src/core/bridge-context/types';

// Mock vscode to allow imports
vi.mock('vscode');

// Example TypeScript script that benefits from type safety
class ExampleTypedScript extends QueryScript<{ path: string }, { exists: boolean; type?: string }> {
    async execute(
        bridgeContext: IBridgeContext,
        params: { path: string }
    ): Promise<{ exists: boolean; type?: string }> {
        // Type safety: bridgeContext is properly typed
        const workspace = bridgeContext.getWorkspace();

        // Optional properties are handled safely with ?. operator
        if (bridgeContext.debug?.isActive()) {
            bridgeContext.logger.info('Debug session is active');
        }

        // Can use optional getJavaScriptEnv - TypeScript enforces the signature
        if (bridgeContext.getJavaScriptEnv) {
            // The parameter type is enforced as vscode.Uri
            const jsEnv = await bridgeContext.getJavaScriptEnv({ fsPath: params.path } as any);
            if (jsEnv) {
                // TypeScript knows jsEnv is ITestEnvironment | null
                return { exists: true, type: jsEnv.framework };
            }
        }

        // Can access paths service if available
        const extensionRoot = bridgeContext.paths?.extensionRoot;
        if (extensionRoot) {
            bridgeContext.logger.debug(`Extension root: ${extensionRoot}`);
        }

        // Use existing debug.getSession() pattern (no redundant helper needed)
        const session = bridgeContext.debug?.getSession();
        if (session) {
            bridgeContext.logger.debug(`Debug session: ${session.id}`);
        }

        return { exists: false };
    }
}

// Example ActionScript using IBridgeContext
class ExampleActionScript extends ActionScript<{ target: string }> {
    async execute(
        bridgeContext: IBridgeContext,
        params: { target: string }
    ): Promise<{ success: boolean; reason?: string }> {
        // Type checking works for ActionScript too
        const config = bridgeContext.getConfiguration('example');
        return this.success({ configured: config !== undefined });
    }
}

// Example WaitableScript using IBridgeContext
class ExampleWaitableScript extends WaitableScript<void, string> {
    protected async wait(bridgeContext: IBridgeContext): Promise<string> {
        // Can use waitForDebugEvent helper with proper typing
        const event = await this.waitForDebugEvent(bridgeContext, 'stopped');
        return event ? 'stopped' : 'timeout';
    }
}

describe('TypeScript Example with IBridgeContext', () => {
    it('should compile with proper TypeScript types', () => {
        // This test validates compilation - if TypeScript compiles this file,
        // then our IBridgeContext typing is working correctly

        const queryScript = new ExampleTypedScript();
        const actionScript = new ExampleActionScript();
        const waitableScript = new ExampleWaitableScript();

        expect(queryScript).toBeDefined();
        expect(actionScript).toBeDefined();
        expect(waitableScript).toBeDefined();
    });

    it('should enforce IBridgeContext parameter type at compile time', () => {
        // This would fail TypeScript compilation if the parameter wasn't IBridgeContext
        class TestScript extends QueryScript<void, void> {
            async execute(bridgeContext: IBridgeContext): Promise<void> {
                // IntelliSense should work here for all IBridgeContext properties
                bridgeContext.logger.info('test');
                bridgeContext.getWorkspace();
                bridgeContext.debug?.getSession(); // Using existing pattern
            }
        }

        expect(TestScript).toBeDefined();
    });

    it('should handle optional properties correctly', () => {
        // Create a minimal mock that satisfies the interface
        const mockContext: IBridgeContext = {
            version: '1.0.0',
            vscode: {} as any,
            logger: {
                info: vi.fn(),
                error: vi.fn(),
                debug: vi.fn(),
                warn: vi.fn()
            },
            getWorkspace: vi.fn(),
            getActiveEditor: vi.fn(),
            getConfiguration: vi.fn(),
            dispose: vi.fn(),
            // Optional properties can be undefined
            getJavaScriptEnv: undefined,
            debug: undefined,
            paths: undefined,
            workspace: undefined
        };

        // TypeScript is happy with this assignment
        expect(mockContext.version).toBe('1.0.0');
    });

    it('should provide type safety for getJavaScriptEnv return type', async () => {
        const mockContext: IBridgeContext = {
            version: '1.0.0',
            vscode: {} as any,
            logger: {
                info: vi.fn(),
                error: vi.fn(),
                debug: vi.fn(),
                warn: vi.fn()
            },
            getWorkspace: vi.fn(),
            getActiveEditor: vi.fn(),
            getConfiguration: vi.fn(),
            dispose: vi.fn(),
            // getJavaScriptEnv returns ITestEnvironment | null
            getJavaScriptEnv: vi.fn().mockResolvedValue({
                language: 'javascript',
                framework: 'jest',
                confidence: 0.9,
                debugConfig: {} as any,
                cwd: '/test',
                reasons: ['package.json has jest']
            } as ITestEnvironment)
        };

        if (mockContext.getJavaScriptEnv) {
            const result = await mockContext.getJavaScriptEnv({} as any);
            // TypeScript knows result is ITestEnvironment | null
            if (result) {
                expect(result.language).toBeDefined();
                expect(result.framework).toBeDefined();
            }
        }
    });
});