import { describe, it, beforeEach, after, suiteSetup } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ScriptRegistry } from '../../core/registry/ScriptRegistry';
import { ErrorCode } from '../../core/response/errorTaxonomy';

describe('ScriptRegistry', () => {
    let registry: ScriptRegistry;
    let tempDir: string;
    let manifestPath: string;
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

    beforeEach(() => {
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

        // Create a temporary directory for test files
        tempDir = path.join(__dirname, '..', '..', '..', '..', 'temp-test-scripts');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        manifestPath = path.join(tempDir, 'manifest.json');
    });

    describe('discover()', () => {
        it('should load scripts from manifest', async () => {
            // Create a test manifest
            const manifest = {
                version: '1.0.0',
                generatedAt: new Date().toISOString(),
                scripts: {
                    'test.action': {
                        metadata: {
                            alias: 'test.action',
                            category: 'test',
                            description: 'Test action script',
                            response: 'action'
                        },
                        scriptRelPath: 'test.action.js'
                    }
                }
            };

            fs.writeFileSync(manifestPath, JSON.stringify(manifest));

            // Create a mock script file
            const scriptPath = path.join(tempDir, 'test.action.js');
            // Path to the compiled base module (out/core/scripts/base.js)
            const baseModulePath = path.join(__dirname, '..', '..', 'core', 'scripts', 'base.js')
                .replace(/\\/g, '/');
            const scriptContent = `
                const { ActionScript } = require('${baseModulePath}');
                const { z } = require('zod');

                class TestActionScript extends ActionScript {
                    constructor() {
                        super();
                        this.paramsSchema = z.object({ message: z.string() });
                    }

                    async execute(bridgeContext, params) {
                        return this.success();
                    }
                }

                module.exports = { TestActionScript };
            `;
            fs.writeFileSync(scriptPath, scriptContent);

            await registry.discover(manifestPath);

            const scripts = registry.listScripts();
            assert.strictEqual(scripts.length, 1);
            assert.strictEqual(scripts[0], 'test.action');
        });

        it('should handle missing manifest file', async () => {
            const nonExistentPath = path.join(tempDir, 'non-existent.json');

            try {
                await registry.discover(nonExistentPath);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Manifest not found'));
            }
        });
    });

    describe('execute()', () => {
        it('should execute a registered script', async () => {
            // Mock registry with a test script
            const requestId = 'test-400';
            const mode = 'normal';
            const signal = new AbortController().signal;

            // Manually register a mock script for testing
            (registry as any).scripts = new Map([
                ['test.mock', {
                    validateParams: (params: any) => ({ success: true, data: params }),
                    execute: async (bridgeContext: any, params: any) => ({ result: 'success' })
                }]
            ]);

            const result = await registry.execute('test.mock', {}, requestId, mode, signal);

            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.status, 'ok');
            assert.deepStrictEqual(result.data, { result: 'success' });
        });

        it('should return error for non-existent script', async () => {
            const requestId = 'test-401';
            const mode = 'normal';
            const signal = new AbortController().signal;

            const result = await registry.execute('non.existent', {}, requestId, mode, signal);

            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.status, 'error');
            assert.strictEqual(result.error?.code, ErrorCode.E_SCRIPT_NOT_FOUND);
        });

        it('should handle parameter validation errors', async () => {
            const requestId = 'test-402';
            const mode = 'normal';
            const signal = new AbortController().signal;

            // Mock script with failing validation
            (registry as any).scripts = new Map([
                ['test.validate', {
                    validateParams: (params: any) => ({
                        success: false,
                        error: { issues: [{ path: ['field'], message: 'Required', code: 'required' }] }
                    }),
                    execute: async (bridgeContext: any, params: any) => ({ result: 'should not reach' })
                }]
            ]);

            const result = await registry.execute('test.validate', {}, requestId, mode, signal);

            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.status, 'error');
            assert.strictEqual(result.error?.code, ErrorCode.E_INVALID_PARAMS);
        });

        it('should include timing metadata', async () => {
            const requestId = 'test-403';
            const mode = 'danger';
            const signal = new AbortController().signal;

            (registry as any).scripts = new Map([
                ['test.timing', {
                    validateParams: (params: any) => ({ success: true, data: params }),
                    execute: async (bridgeContext: any, params: any) => {
                        // Simulate some work
                        await new Promise(resolve => setTimeout(resolve, 10));
                        return { result: 'done' };
                    }
                }]
            ]);

            const result = await registry.execute('test.timing', {}, requestId, mode, signal);

            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.meta.requestId, 'test-403');
            assert.strictEqual(result.meta.mode, 'danger');
            assert.strictEqual(result.meta.scriptName, 'test.timing');
            assert.ok(typeof result.meta.durationMs === 'number' && result.meta.durationMs >= 0);
        });
    });

    describe('listScripts()', () => {
        it('should return list of registered script aliases', () => {
            (registry as any).scripts = new Map([
                ['script.one', {}],
                ['script.two', {}],
                ['script.three', {}]
            ]);

            const scripts = registry.listScripts();

            assert.strictEqual(scripts.length, 3);
            assert.ok(scripts.includes('script.one'));
            assert.ok(scripts.includes('script.two'));
            assert.ok(scripts.includes('script.three'));
        });

        it('should return empty array when no scripts registered', () => {
            const scripts = registry.listScripts();
            assert.strictEqual(scripts.length, 0);
        });
    });

    describe('getMetadata()', () => {
        it('should return metadata for a script', () => {
            const metadata = {
                alias: 'test.meta',
                category: 'testing',
                description: 'Test metadata'
            };

            (registry as any).scripts = new Map([
                ['test.meta', { metadata }]
            ]);
            (registry as any).manifests = new Map([
                ['test.meta', { metadata }]
            ]);

            const result = registry.getMetadata('test.meta');

            assert.deepStrictEqual(result, metadata);
        });

        it('should return undefined for non-existent script', () => {
            const result = registry.getMetadata('non.existent');
            assert.strictEqual(result, undefined);
        });
    });

    after(() => {
        // Clean up temp files
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});