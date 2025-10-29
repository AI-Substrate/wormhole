import { describe, it, beforeEach, suiteSetup } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { ScriptRegistry } from '../../core/registry/ScriptRegistry';
import { ScriptBase } from '../../core/scripts/base';
import * as schemas from '../../vsc-scripts/generated/schemas';
import * as vscode from 'vscode';

describe('Three-Tier Validation System', () => {
    let registry: ScriptRegistry;
    let requestId: string;
    let mode: 'normal' | 'danger';
    let signal: AbortSignal;
    let extensionContext: vscode.ExtensionContext;

    suiteSetup(async function() {
        this.timeout(10000);
        // Get the real extension context
        const ext = vscode.extensions.getExtension('AI-Substrate.vsc-bridge-extension');
        if (ext && !ext.isActive) {
            await ext.activate();
        }
        if (ext?.exports?.getContext) {
            extensionContext = ext.exports.getContext();
        } else {
            // Create minimal context for testing
            extensionContext = {
                extensionPath: ext?.extensionPath || '',
                subscriptions: [],
                extensionUri: vscode.Uri.file(ext?.extensionPath || '')
            } as any;
        }
    });

    beforeEach(async () => {
        const mockOutputChannel = {
            appendLine: () => {},
            append: () => {},
            clear: () => {},
            show: () => {},
            hide: () => {},
            dispose: () => {},
            name: 'Test Output',
            replace: () => {}
        } as any;
        registry = new ScriptRegistry(extensionContext, mockOutputChannel);

        // Skip manifest discovery for now - tests will register scripts manually
        // const manifestPath = path.join(__dirname, '..', '..', '..', 'vsc-scripts', 'manifest.json');
        // await registry.discover(manifestPath);

        requestId = 'test-123';
        mode = 'normal';
        signal = new AbortController().signal;
    });

    describe.skip('Tier 1: Baked-in scripts with generated schemas', () => {
        // Skipping these tests as they require a manifest with real scripts
        // TODO: Re-enable when manifest.json is available

        it('should strictly validate params using generated Zod schema', async () => {
            // breakpoint.set is a real script with generated schema
            // Use the current test file as a valid path
            const result = await registry.execute('breakpoint.set', {
                path: __filename,
                line: 10
            }, requestId, mode, signal);
            assert.strictEqual(result.status, 'ok');
        });

        it('should fail validation for invalid params with generated schema', async () => {
            // breakpoint.set requires line to be a number >= 1
            const result = await registry.execute('breakpoint.set', {
                path: __filename,
                line: 0  // Invalid: must be >= 1
            }, requestId, mode, signal);

            assert.strictEqual(result.status, 'error');
            // Check the error details contain validation info
            assert.ok(result.error);
            assert.ok(result.error.message || (result.error.details && JSON.stringify(result.error.details).includes('greater than or equal to 1')));
        });

        it('should coerce params when schema has coercion enabled', async () => {
            // breakpoint.set has coercion enabled for line number
            const result = await registry.execute('breakpoint.set', {
                path: __filename,
                line: '10' as any // String will be coerced to number
            }, requestId, mode, signal);
            assert.strictEqual(result.status, 'ok');
        });
    });

    describe('Tier 2: Dynamic scripts with own validation', () => {
        class DynamicScriptWithValidation extends ScriptBase {
            get name() { return 'dynamic-with-validation'; }
            get description() { return 'Test dynamic script with validation'; }

            validateParams(params: any) {
                if (!params || !params.customField) {
                    return {
                        success: false,
                        error: { message: 'customField is required' }
                    } as any;
                }
                return { success: true, data: params };
            }

            async execute(bridgeContext: any, params: any) {
                return {
                    success: true,
                    data: { validated: true, customField: params.customField }
                };
            }
        }

        it('should use script\'s own validation when no generated schema exists', async () => {
            const script = new DynamicScriptWithValidation();
            registry.register('dynamic-with-validation', script);

            const result = await registry.execute('dynamic-with-validation', {
                customField: 'test-value'
            }, requestId, mode, signal);

            assert.strictEqual(result.status, 'ok');
            const data = result.data as any;
            // ActionScript wraps result in { success: true, data: {...} }
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.data.validated, true);
            assert.strictEqual(data.data.customField, 'test-value');
        });

        it('should fail validation using script\'s own validator', async () => {
            const script = new DynamicScriptWithValidation();
            registry.register('dynamic-with-validation', script);

            const result = await registry.execute('dynamic-with-validation', {
                wrongField: 'test-value'
            }, requestId, mode, signal);

            assert.strictEqual(result.status, 'error');
            assert.ok(result.error);
            // Check if error message is in the error or its details
            const errorStr = JSON.stringify(result.error);
            assert.ok(errorStr.includes('customField is required'));
        });
    });

    describe('Tier 3: Test/mock scripts without validation', () => {
        class MockScriptNoValidation extends ScriptBase {
            get name() { return 'mock-no-validation'; }
            get description() { return 'Test mock script without validation'; }

            validateParams(params: any) {
                return { success: true as const, data: params };
            }

            async execute(bridgeContext: any, params: any) {
                return {
                    success: true,
                    data: { passedThrough: true, params }
                };
            }
        }

        it('should pass through params without validation when no schema exists', async () => {
            const script = new MockScriptNoValidation();
            registry.register('mock-no-validation', script);

            const arbitraryParams = {
                anyField: 'any-value',
                nested: { data: [1, 2, 3] },
                number: 42
            };

            const result = await registry.execute('mock-no-validation', arbitraryParams, requestId, mode, signal);
            assert.strictEqual(result.status, 'ok');

            const data = result.data as any;
            assert.deepStrictEqual(data, {
                success: true,
                data: {
                    passedThrough: true,
                    params: arbitraryParams
                }
            });
        });

        it('should handle undefined params in pass-through mode', async () => {
            const script = new MockScriptNoValidation();
            registry.register('mock-no-validation', script);

            const result = await registry.execute('mock-no-validation', undefined, requestId, mode, signal);
            assert.strictEqual(result.status, 'ok');

            const data = result.data as any;
            assert.deepStrictEqual(data, {
                success: true,
                data: {
                    passedThrough: true,
                    params: undefined
                }
            });
        });

        it('should handle null params in pass-through mode', async () => {
            const script = new MockScriptNoValidation();
            registry.register('mock-no-validation', script);

            const result = await registry.execute('mock-no-validation', null, requestId, mode, signal);
            assert.strictEqual(result.status, 'ok');

            const data = result.data as any;
            assert.deepStrictEqual(data, {
                success: true,
                data: {
                    passedThrough: true,
                    params: null
                }
            });
        });
    });

    describe.skip('Validation tier precedence', () => {
        // Skipping as this requires real scripts with generated schemas
        // TODO: Re-enable when manifest.json is available

        it('should prefer generated schema over script\'s own validation', async () => {
            // If we somehow have both (shouldn't happen in practice),
            // generated schema takes precedence

            // Use bp.set which has a generated schema
            // Even if we tried to add a paramsSchema, it would be ignored
            const result = await registry.execute('breakpoint.set', {
                path: __filename,
                line: 5
            }, requestId, mode, signal);

            assert.strictEqual(result.status, 'ok');
        });
    });

    describe('safeValidateScriptParams safety', () => {
        it('should return success for unknown scripts (no schema)', () => {
            // This tests the updated safeValidateScriptParams behavior
            const result = schemas.safeValidateScriptParams('unknown-script' as any, {
                anyParam: 'anyValue'
            });

            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.deepStrictEqual(result.data, { anyParam: 'anyValue' });
            }
        });

        it('should validate known scripts with schemas', () => {
            const result = schemas.safeValidateScriptParams('breakpoint.set', {
                path: '/test/file.js',
                line: 10
            });

            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.deepStrictEqual(result.data, {
                    path: '/test/file.js',
                    line: 10
                });
            }
        });

        it('should fail validation for known scripts with invalid params', () => {
            const result = schemas.safeValidateScriptParams('breakpoint.set', {
                path: '/test/file.js'
                // Missing required 'line' parameter
            } as any);

            assert.strictEqual(result.success, false);
            if (!result.success) {
                assert.ok(result.error);
            }
        });
    });
});