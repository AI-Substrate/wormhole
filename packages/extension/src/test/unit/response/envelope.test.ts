import { describe, it } from 'mocha';
import * as assert from 'assert';
import { ok, fail, progress, event, pending } from '../../../core/response/envelope';

describe('Response Envelope', () => {
    describe('ok() helper', () => {
        it('should create a successful result envelope', () => {
            const data = { foo: 'bar' };
            const meta = {
                requestId: 'test-123',
                mode: 'normal' as const,
                scriptName: 'test.script',
                startedAt: new Date().toISOString(),
                durationMs: 42
            };

            const result = ok(data, meta);

            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.status, 'ok');
            assert.strictEqual(result.type, 'result');
            assert.deepStrictEqual(result.data, data);
            assert.strictEqual(result.error, undefined);
            assert.deepStrictEqual(result.meta, meta);
        });

        it('should work without data', () => {
            const meta = {
                requestId: 'test-124',
                mode: 'danger' as const,
                startedAt: new Date().toISOString(),
                durationMs: 10
            };

            const result = ok(undefined, meta);

            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.status, 'ok');
            assert.strictEqual(result.type, 'result');
            assert.strictEqual(result.data, undefined);
        });
    });

    describe('fail() helper', () => {
        it('should create an error envelope', () => {
            const meta = {
                requestId: 'test-125',
                mode: 'normal' as const,
                startedAt: new Date().toISOString(),
                durationMs: 100
            };

            const result = fail('E_SCRIPT_NOT_FOUND', 'Script not found', { alias: 'unknown' }, meta);

            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.status, 'error');
            assert.strictEqual(result.type, 'result');
            assert.strictEqual(result.data, undefined);
            assert.deepStrictEqual(result.error, {
                code: 'E_SCRIPT_NOT_FOUND',
                message: 'Script not found',
                details: { alias: 'unknown' }
            });
            assert.deepStrictEqual(result.meta, meta);
        });

        it('should work without details', () => {
            const meta = {
                requestId: 'test-126',
                mode: 'normal' as const,
                startedAt: new Date().toISOString(),
                durationMs: 50
            };

            const result = fail('E_TIMEOUT', 'Operation timed out', undefined, meta);

            assert.strictEqual(result.error?.details, undefined);
        });
    });

    describe('progress() helper', () => {
        it('should create a progress envelope', () => {
            const data = { step: 2, total: 5, message: 'Processing...' };
            const meta = {
                requestId: 'test-127',
                mode: 'normal' as const,
                scriptName: 'long.task',
                startedAt: new Date().toISOString(),
                durationMs: 250
            };

            const result = progress(data, meta);

            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.status, 'ok');
            assert.strictEqual(result.type, 'progress');
            assert.deepStrictEqual(result.data, data);
            assert.strictEqual(result.error, undefined);
        });
    });

    describe('event() helper', () => {
        it('should create an event envelope', () => {
            const data = { event: 'breakpoint-hit', line: 42 };
            const meta = {
                requestId: 'test-128',
                mode: 'normal' as const,
                scriptName: 'dbg.waitForHit',
                startedAt: new Date().toISOString(),
                durationMs: 1500
            };

            const result = event(data, meta);

            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.status, 'ok');
            assert.strictEqual(result.type, 'event');
            assert.deepStrictEqual(result.data, data);
        });
    });

    describe('pending() helper', () => {
        it('should create a pending envelope', () => {
            const data = { message: 'Waiting for debugger to start...' };
            const meta = {
                requestId: 'test-129',
                mode: 'normal' as const,
                startedAt: new Date().toISOString(),
                durationMs: 0
            };

            const result = pending(data, meta);

            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.status, 'ok');
            assert.strictEqual(result.type, 'pending');
            assert.deepStrictEqual(result.data, data);
        });
    });

    describe('meta fields', () => {
        it('should require all necessary meta fields', () => {
            const meta = {
                requestId: 'test-130',
                mode: 'normal' as const,
                startedAt: new Date().toISOString(),
                durationMs: 0
            };

            const result = ok({ test: true }, meta);

            assert.strictEqual(typeof result.meta.requestId, 'string');
            assert.ok(['normal', 'danger'].includes(result.meta.mode));
            assert.strictEqual(typeof result.meta.startedAt, 'string');
            assert.strictEqual(typeof result.meta.durationMs, 'number');
        });

        it('should include optional scriptName when provided', () => {
            const meta = {
                requestId: 'test-131',
                mode: 'normal' as const,
                scriptName: 'test.script',
                startedAt: new Date().toISOString(),
                durationMs: 10
            };

            const result = ok(null, meta);

            assert.strictEqual(result.meta.scriptName, 'test.script');
        });
    });
});