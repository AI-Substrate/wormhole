import { describe, it } from 'mocha';
import * as assert from 'assert';
import { z } from 'zod';
import { BridgeContext } from '../../../core/bridge-context/BridgeContext';
import { ScriptBase, ActionScript, WaitableScript, QueryScript } from '../../../core/scripts/base';
import { createMeta } from '../../../core/response/serialize';

// Mock vscode for unit tests
const mockVscode = {} as any;

// Mock BridgeContext for unit tests
class MockBridgeContext implements Partial<BridgeContext> {
    vscode = mockVscode;
    signal?: AbortSignal;
    mode?: string;
    outputChannel?: any;

    constructor(options: { signal?: AbortSignal; mode?: string } = {}) {
        this.signal = options.signal;
        this.mode = options.mode;
    }
}

// Test implementations
class TestActionScript extends ActionScript<{ message: string }> {
    paramsSchema = z.object({
        message: z.string()
    });

    async execute(bridgeContext: BridgeContext, params: { message: string }) {
        if (params.message === 'fail') {
            return this.failure('Test failure');
        }
        return this.success();
    }
}

class TestWaitableScript extends WaitableScript<{ timeoutMs: number }, { event: string }> {
    paramsSchema = z.object({
        timeoutMs: z.number().min(100).max(5000)
    });

    resultSchema = z.object({
        event: z.string()
    });

    async execute(bridgeContext: BridgeContext, params: { timeoutMs: number }) {
        return this.wait(bridgeContext, params);
    }

    protected async wait(bridgeContext: BridgeContext, params: { timeoutMs: number }) {
        return new Promise<{ event: string }>((resolve, reject) => {
            const timer = setTimeout(() => {
                resolve({ event: 'timeout' });
            }, params.timeoutMs);

            // Cleanup on abort
            if (bridgeContext.signal) {
                bridgeContext.signal.addEventListener('abort', () => {
                    clearTimeout(timer);
                    reject(new Error('Aborted'));
                });
            }
        });
    }
}

class TestQueryScript extends QueryScript<{ key: string }, { value: string }> {
    paramsSchema = z.object({
        key: z.string()
    });

    resultSchema = z.object({
        value: z.string()
    });

    async execute(bridgeContext: BridgeContext, params: { key: string }) {
        return { value: `Value for ${params.key}` };
    }
}

describe('Script Base Classes', () => {
    const mockContext = new MockBridgeContext({ mode: 'normal' }) as any as BridgeContext;

    describe('ScriptBase', () => {
        it('should validate parameters', () => {
            const script = new TestActionScript();
            const validParams = { message: 'test' };
            const invalidParams = { message: 123 };

            const validResult = script.validateParams(validParams);
            assert.strictEqual(validResult.success, true);

            const invalidResult = script.validateParams(invalidParams);
            assert.strictEqual(invalidResult.success, false);
        });

        it('should have abstract execute method', () => {
            // TypeScript ensures this at compile time
            const script = new TestActionScript();
            assert.strictEqual(typeof script.execute, 'function');
        });
    });

    describe('ActionScript', () => {
        it('should return success result', async () => {
            const script = new TestActionScript();
            const params = { message: 'success' };

            const result = await script.execute(mockContext, params);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.reason, undefined);
        });

        it('should return failure result with reason', async () => {
            const script = new TestActionScript();
            const params = { message: 'fail' };

            const result = await script.execute(mockContext, params);

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.reason, 'Test failure');
        });
    });

    describe('WaitableScript', () => {
        it('should execute wait operation', async () => {
            const script = new TestWaitableScript();
            const params = { timeoutMs: 100 };

            const result = await script.execute(mockContext, params);

            assert.strictEqual(result.event, 'timeout');
        });

        it('should validate timeout bounds', () => {
            const script = new TestWaitableScript();

            const tooSmall = script.validateParams({ timeoutMs: 50 });
            assert.strictEqual(tooSmall.success, false);

            const tooBig = script.validateParams({ timeoutMs: 10000 });
            assert.strictEqual(tooBig.success, false);

            const valid = script.validateParams({ timeoutMs: 1000 });
            assert.strictEqual(valid.success, true);
        });

        it('should handle abort signal', async () => {
            const abortController = new AbortController();
            const contextWithSignal = new MockBridgeContext({
                mode: 'normal',
                signal: abortController.signal
            }) as any as BridgeContext;

            const script = new TestWaitableScript();
            const params = { timeoutMs: 5000 };

            const promise = script.execute(contextWithSignal, params);

            // Abort after a short delay
            setTimeout(() => abortController.abort(), 50);

            try {
                await promise;
                assert.fail('Should have thrown');
            } catch (error: any) {
                assert.strictEqual(error.message, 'Aborted');
            }
        });
    });

    describe('QueryScript', () => {
        it('should return query result immediately', async () => {
            const script = new TestQueryScript();
            const params = { key: 'testKey' };

            const result = await script.execute(mockContext, params);

            assert.strictEqual(result.value, 'Value for testKey');
        });

        it('should validate result schema if provided', () => {
            const script = new TestQueryScript();
            assert.ok(script.resultSchema);

            const validResult = script.resultSchema?.safeParse({ value: 'test' });
            assert.strictEqual(validResult?.success, true);

            const invalidResult = script.resultSchema?.safeParse({ value: 123 });
            assert.strictEqual(invalidResult?.success, false);
        });
    });

    describe('Script Metadata', () => {
        it('should support script metadata', () => {
            const script = new TestActionScript();

            // Scripts can have metadata attached
            (script as any).metadata = {
                alias: 'test.action',
                category: 'testing',
                description: 'Test action script'
            };

            assert.strictEqual((script as any).metadata.alias, 'test.action');
        });
    });
});