import { describe, it } from 'mocha';
import * as assert from 'assert';
import { z } from 'zod';
import {
    PathSchema,
    LineNumberSchema,
    ScriptNameSchema,
    ScriptParamsSchema,
    BreakpointParamsSchema,
    validateWithEnvelope
} from '../../../core/schema/common';

describe('Schema Validation', () => {
    describe('PathSchema', () => {
        it('should accept valid absolute paths', () => {
            const validPaths = [
                '/home/user/file.ts',
                '/Users/test/Documents/code.js',
                'C:\\Windows\\System32\\file.txt',
                '/tmp/test.py'
            ];

            for (const path of validPaths) {
                const result = PathSchema.safeParse(path);
                assert.strictEqual(result.success, true);
            }
        });

        it('should reject empty paths', () => {
            const result = PathSchema.safeParse('');
            assert.strictEqual(result.success, false);
        });

        it('should accept relative paths', () => {
            const result = PathSchema.safeParse('./test.js');
            assert.strictEqual(result.success, true);
        });
    });

    describe('LineNumberSchema', () => {
        it('should accept valid line numbers', () => {
            const validNumbers = [1, 42, 1000, 99999];

            for (const num of validNumbers) {
                const result = LineNumberSchema.safeParse(num);
                assert.strictEqual(result.success, true);
            }
        });

        it('should reject zero and negative numbers', () => {
            const invalidNumbers = [0, -1, -42];

            for (const num of invalidNumbers) {
                const result = LineNumberSchema.safeParse(num);
                assert.strictEqual(result.success, false);
            }
        });

        it('should reject non-integers', () => {
            const result = LineNumberSchema.safeParse(3.14);
            assert.strictEqual(result.success, false);
        });
    });

    describe('ScriptNameSchema', () => {
        it('should accept valid script names', () => {
            const validNames = [
                'breakpoint.set',
                'dbg.waitForHit',
                'test-script',
                'myScript123',
                'a'
            ];

            for (const name of validNames) {
                const result = ScriptNameSchema.safeParse(name);
                assert.strictEqual(result.success, true);
            }
        });

        it('should reject empty script names', () => {
            const result = ScriptNameSchema.safeParse('');
            assert.strictEqual(result.success, false);
        });
    });

    describe('ScriptParamsSchema', () => {
        it('should accept valid script parameters', () => {
            const validParams = {
                scriptName: 'test.script',
                params: { foo: 'bar', count: 42 },
                timeout: 5000
            };

            const result = ScriptParamsSchema.safeParse(validParams);
            assert.strictEqual(result.success, true);
        });

        it('should work without optional timeout', () => {
            const params = {
                scriptName: 'test.script',
                params: {}
            };

            const result = ScriptParamsSchema.safeParse(params);
            assert.strictEqual(result.success, true);
        });

        it('should reject missing scriptName', () => {
            const params = {
                params: {}
            };

            const result = ScriptParamsSchema.safeParse(params);
            assert.strictEqual(result.success, false);
        });

        it('should reject invalid timeout values', () => {
            const tooSmall = {
                scriptName: 'test',
                params: {},
                timeout: 50
            };

            const tooBig = {
                scriptName: 'test',
                params: {},
                timeout: 70000
            };

            assert.strictEqual(ScriptParamsSchema.safeParse(tooSmall).success, false);
            assert.strictEqual(ScriptParamsSchema.safeParse(tooBig).success, false);
        });
    });

    describe('BreakpointParamsSchema', () => {
        it('should accept valid breakpoint parameters', () => {
            const validParams = {
                path: '/home/user/test.js',
                line: 42,
                condition: 'x > 10'
            };

            const result = BreakpointParamsSchema.safeParse(validParams);
            assert.strictEqual(result.success, true);
        });

        it('should work without optional condition', () => {
            const params = {
                path: '/test.js',
                line: 1
            };

            const result = BreakpointParamsSchema.safeParse(params);
            assert.strictEqual(result.success, true);
        });

        it('should reject invalid line numbers', () => {
            const params = {
                path: '/test.js',
                line: 0
            };

            const result = BreakpointParamsSchema.safeParse(params);
            assert.strictEqual(result.success, false);
        });
    });

    describe('validateWithEnvelope', () => {
        it('should return success envelope for valid data', () => {
            const schema = z.object({
                name: z.string(),
                age: z.number()
            });

            const data = { name: 'John', age: 30 };
            const meta = {
                requestId: 'test-200',
                mode: 'normal' as const,
                startedAt: new Date().toISOString(),
                durationMs: 0
            };

            const result = validateWithEnvelope(schema, data, meta);

            assert.strictEqual(result.ok, true);
            assert.deepStrictEqual(result.data, data);
        });

        it('should return error envelope for invalid data', () => {
            const schema = z.object({
                name: z.string(),
                age: z.number()
            });

            const data = { name: 'John', age: 'thirty' };
            const meta = {
                requestId: 'test-201',
                mode: 'normal' as const,
                startedAt: new Date().toISOString(),
                durationMs: 0
            };

            const result = validateWithEnvelope(schema, data, meta);

            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.error?.code, 'E_INVALID_PARAMS');
            assert.ok(result.error?.details);
        });
    });
});