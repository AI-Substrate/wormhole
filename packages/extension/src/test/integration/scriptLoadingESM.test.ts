import { describe, it, beforeEach, after, suiteSetup } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ScriptRegistry } from '../../core/registry/ScriptRegistry';
import { ErrorCode } from '../../core/response/errorTaxonomy';

describe('ScriptRegistry ESM Loading', () => {
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
        tempDir = path.join(__dirname, '..', '..', '..', '..', 'temp-test-esm-scripts');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        manifestPath = path.join(tempDir, 'manifest.json');
    });

    after(() => {
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('ESM Dynamic Import Loading', () => {
        it('should load scripts using ESM dynamic import with webpackIgnore', async () => {
            // Create a test manifest
            const manifest = {
                version: '1.0.0',
                generatedAt: new Date().toISOString(),
                scripts: {
                    'test.esm.action': {
                        metadata: {
                            alias: 'test.esm.action',
                            category: 'test',
                            description: 'Test ESM action script',
                            response: 'action'
                        },
                        scriptRelPath: 'test.esm.action.js'
                    }
                }
            };

            fs.writeFileSync(manifestPath, JSON.stringify(manifest));

            // Create a mock script file that can be loaded via ESM
            const scriptPath = path.join(tempDir, 'test.esm.action.js');
            const baseModulePath = path.join(__dirname, '..', '..', 'core', 'scripts', 'base.js')
                .replace(/\\/g, '/');

            // Write an ESM-compatible script
            const scriptContent = `
                const { ActionScript } = require('${baseModulePath}');
                const { z } = require('zod');

                class TestESMActionScript extends ActionScript {
                    constructor() {
                        super();
                        this.paramsSchema = z.object({
                            message: z.string().optional(),
                            value: z.number().optional()
                        });
                    }

                    async execute(bridgeContext, params) {
                        return this.success({
                            executed: true,
                            message: params.message || 'ESM loaded successfully',
                            value: params.value || 42
                        });
                    }
                }

                module.exports = { TestESMActionScript };
            `;
            fs.writeFileSync(scriptPath, scriptContent);

            // Test discovery and loading
            await registry.discover(manifestPath);

            const scripts = registry.listScripts();
            assert.strictEqual(scripts.length, 1);
            assert.strictEqual(scripts[0], 'test.esm.action');

            // Test execution to ensure the script was properly loaded
            const requestId = 'test-esm-001';
            const mode = 'normal';
            const signal = new AbortController().signal;

            const result = await registry.execute('test.esm.action', { message: 'Hello ESM' }, requestId, mode, signal);

            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.status, 'ok');
            if (result.ok) {
                assert.strictEqual((result.data as any).success, true);
                assert.strictEqual((result.data as any).details.executed, true);
                assert.strictEqual((result.data as any).details.message, 'Hello ESM');
            }
        });

        it('should handle script file not found with ESM loading', async () => {
            // Create a manifest pointing to a non-existent script
            const manifest = {
                version: '1.0.0',
                generatedAt: new Date().toISOString(),
                scripts: {
                    'test.missing': {
                        metadata: {
                            alias: 'test.missing',
                            category: 'test',
                            description: 'Missing script',
                            response: 'action'
                        },
                        scriptRelPath: 'does-not-exist.js'
                    }
                }
            };

            fs.writeFileSync(manifestPath, JSON.stringify(manifest));

            // Discovery should not throw, but script should not be loaded
            await registry.discover(manifestPath);

            const scripts = registry.listScripts();
            assert.strictEqual(scripts.length, 0, 'No scripts should be loaded when file is missing');
        });

        it('should handle multiple scripts loaded via ESM', async () => {
            // Create manifest with multiple scripts
            const manifest = {
                version: '1.0.0',
                generatedAt: new Date().toISOString(),
                scripts: {
                    'test.action1': {
                        metadata: {
                            alias: 'test.action1',
                            category: 'test',
                            description: 'First test action',
                            response: 'action'
                        },
                        scriptRelPath: 'action1.js'
                    },
                    'test.action2': {
                        metadata: {
                            alias: 'test.action2',
                            category: 'test',
                            description: 'Second test action',
                            response: 'query'
                        },
                        scriptRelPath: 'action2.js'
                    }
                }
            };

            fs.writeFileSync(manifestPath, JSON.stringify(manifest));

            // Create script files
            const baseModulePath = path.join(__dirname, '..', '..', 'core', 'scripts', 'base.js')
                .replace(/\\/g, '/');

            const script1Path = path.join(tempDir, 'action1.js');
            fs.writeFileSync(script1Path, `
                const { ActionScript } = require('${baseModulePath}');
                const { z } = require('zod');

                class Action1Script extends ActionScript {
                    constructor() {
                        super();
                        this.paramsSchema = z.object({});
                    }
                    async execute(bridgeContext, params) {
                        return this.success({ script: 'action1' });
                    }
                }
                module.exports = { Action1Script };
            `);

            const script2Path = path.join(tempDir, 'action2.js');
            fs.writeFileSync(script2Path, `
                const { QueryScript } = require('${baseModulePath}');
                const { z } = require('zod');

                class Action2Script extends QueryScript {
                    constructor() {
                        super();
                        this.paramsSchema = z.object({});
                    }
                    async execute(bridgeContext, params) {
                        return { script: 'action2', type: 'query' };
                    }
                }
                module.exports = { Action2Script };
            `);

            await registry.discover(manifestPath);

            const scripts = registry.listScripts();
            assert.strictEqual(scripts.length, 2);
            assert.ok(scripts.includes('test.action1'));
            assert.ok(scripts.includes('test.action2'));

            // Test both scripts execute correctly
            const requestId = 'test-multi-001';
            const mode = 'normal';
            const signal = new AbortController().signal;

            const result1 = await registry.execute('test.action1', {}, requestId, mode, signal);
            assert.strictEqual(result1.ok, true);
            if (result1.ok) {
                assert.strictEqual((result1.data as any).success, true);
                assert.strictEqual((result1.data as any).details.script, 'action1');
            }

            const result2 = await registry.execute('test.action2', {}, requestId, mode, signal);
            assert.strictEqual(result2.ok, true);
            if (result2.ok) {
                // QueryScript returns data directly without success/details wrapper
                assert.strictEqual((result2.data as any).script, 'action2');
                assert.strictEqual((result2.data as any).type, 'query');
            }
        });
    });
});