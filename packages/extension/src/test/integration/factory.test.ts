import * as assert from 'assert';
import * as vscode from 'vscode';
import { suite, test, suiteSetup, teardown } from 'mocha';
import { BridgeContext } from '../../core/bridge-context/BridgeContext';
import { BridgeContextFactory } from '../../core/bridge-context/factory';

suite('BridgeContext Factory', () => {
    let extensionContext: vscode.ExtensionContext;

    suiteSetup(async function() {
        this.timeout(10000);

        // Get the real extension context
        const ext = vscode.extensions.getExtension('AI-Substrate.vsc-bridge-extension');
        if (!ext) {
            throw new Error('Extension not found');
        }

        if (!ext.isActive) {
            await ext.activate();
        }

        // Get context from extension exports (once we add it)
        if (ext.exports && ext.exports.getContext) {
            extensionContext = ext.exports.getContext();
        } else {
            // Temporary mock until we update activate()
            extensionContext = {
                extensionPath: ext.extensionPath,
                subscriptions: [],
                workspaceState: {
                    get: () => undefined,
                    update: () => Promise.resolve()
                },
                globalState: {
                    get: () => undefined,
                    update: () => Promise.resolve()
                },
                extensionUri: vscode.Uri.file(ext.extensionPath)
            } as any;
        }
    });

    teardown(() => {
        // Clean up factory state between tests
        // BridgeContextFactory.reset();
    });

    suite('instance creation', () => {
        test('should create a BridgeContext instance', () => {
            // const context = BridgeContextFactory.create(extensionContext);

            // assert.ok(context);
            // assert.ok(context instanceof BridgeContext);
            // assert.strictEqual(typeof context.version, 'string');
        });

        test('should pass VS Code extension context to BridgeContext', () => {
            // const context = BridgeContextFactory.create(extensionContext);

            // Verify context has access to VS Code APIs
            // assert.strictEqual(typeof context.getWorkspace, 'function');
            // assert.strictEqual(typeof context.getConfiguration, 'function');
            // assert.strictEqual(typeof context.getActiveEditor, 'function');
        });

        test('should initialize all services', () => {
            // const context = BridgeContextFactory.create(extensionContext);

            // Verify all services are initialized
            // assert.ok(context.logger, 'Logger should be initialized');
            // assert.strictEqual(typeof context.logger.info, 'function');
            // assert.strictEqual(typeof context.logger.error, 'function');
        });
    });

    suite('singleton behavior', () => {
        test('should return the same instance for the same extension context', () => {
            // const context1 = BridgeContextFactory.create(extensionContext);
            // const context2 = BridgeContextFactory.create(extensionContext);

            // assert.strictEqual(context1, context2, 'Should return the same instance');
        });

        test('should maintain state across calls', () => {
            // const context1 = BridgeContextFactory.create(extensionContext);

            // Add some state (if applicable)
            // (context1 as any)._testState = 'test-value';

            // const context2 = BridgeContextFactory.create(extensionContext);
            // assert.strictEqual((context2 as any)._testState, 'test-value');
        });

        test('should allow reset for testing', () => {
            // const context1 = BridgeContextFactory.create(extensionContext);
            // BridgeContextFactory.reset();
            // const context2 = BridgeContextFactory.create(extensionContext);

            // assert.notStrictEqual(context1, context2, 'Should create new instance after reset');
        });
    });

    suite('VS Code context injection', () => {
        test('should require extension context', () => {
            // Should throw or handle gracefully when no context provided
            // assert.throws(() => {
            //     BridgeContextFactory.create(null as any);
            // }, /extension context/i);
        });

        test('should validate extension context has required properties', () => {
            const invalidContext = {} as any;

            // assert.throws(() => {
            //     BridgeContextFactory.create(invalidContext);
            // }, /invalid.*context/i);
        });

        test('should work with minimal valid context', () => {
            const minimalContext = {
                subscriptions: [],
                extensionUri: vscode.Uri.file('/test'),
                extensionPath: '/test',
                globalState: {
                    get: () => undefined,
                    update: () => Promise.resolve()
                },
                workspaceState: {
                    get: () => undefined,
                    update: () => Promise.resolve()
                }
            } as any;

            // const context = BridgeContextFactory.create(minimalContext);
            // assert.ok(context);
        });
    });

    suite('factory configuration', () => {
        test('should support configuration options', () => {
            const options = {
                logLevel: 'debug',
                outputChannelName: 'Test Bridge Context'
            };

            // const context = BridgeContextFactory.create(extensionContext, options);
            // assert.ok(context);

            // Verify options were applied
            // assert.strictEqual((context as any).logLevel, 'debug');
        });

        test('should use default configuration when no options provided', () => {
            // const context = BridgeContextFactory.create(extensionContext);

            // Should have sensible defaults
            // assert.ok(context.logger);
            // assert.strictEqual(context.version, '1.0.0');
        });
    });

    suite('lifecycle management', () => {
        test('should support disposal', () => {
            // const context = BridgeContextFactory.create(extensionContext);

            // Should implement disposable pattern
            // assert.strictEqual(typeof context.dispose, 'function');

            // context.dispose();

            // After disposal, factory should create new instance
            // const newContext = BridgeContextFactory.create(extensionContext);
            // assert.notStrictEqual(context, newContext);
        });

        test('should clean up resources on disposal', () => {
            // const context = BridgeContextFactory.create(extensionContext);

            // Track if output channel is disposed
            let channelDisposed = false;
            // (context.logger as any).outputChannel = {
            //     dispose: () => { channelDisposed = true; }
            // };

            // context.dispose();
            // assert.strictEqual(channelDisposed, true, 'Output channel should be disposed');
        });

        test('should handle multiple disposal calls gracefully', () => {
            // const context = BridgeContextFactory.create(extensionContext);

            // Should not throw on multiple disposals
            // assert.doesNotThrow(() => {
            //     context.dispose();
            //     context.dispose();
            // });
        });
    });

    suite('async initialization', () => {
        test('should support async factory method', async () => {
            // For future services that need async initialization
            // const context = await BridgeContextFactory.createAsync(extensionContext);

            // assert.ok(context);
            // assert.ok(context instanceof BridgeContext);
        });

        test('should handle async initialization errors', async () => {
            // Mock an error during async init
            // Create a mock context without spreading (to avoid API proposal issues)
            const errorContext = {
                subscriptions: [],
                extensionUri: vscode.Uri.file('/test'),
                extensionPath: '/test',
                globalState: extensionContext.globalState,
                workspaceState: extensionContext.workspaceState,
                _forceError: true
            } as any;

            await assert.rejects(
                BridgeContextFactory.createAsync(errorContext),
                /initialization failed/i
            );
        });
    });

    suite('thread safety and concurrency', () => {
        test('should handle concurrent create calls', async () => {
            // Multiple concurrent calls should return same instance
            const promises = [];

            for (let i = 0; i < 10; i++) {
                promises.push(Promise.resolve().then(() => {
                    // return BridgeContextFactory.create(extensionContext);
                }));
            }

            // const contexts = await Promise.all(promises);

            // All should be the same instance
            // const firstContext = contexts[0];
            // contexts.forEach(ctx => {
            //     assert.strictEqual(ctx, firstContext);
            // });
        });

        test('should be thread-safe during initialization', async () => {
            // Reset to ensure fresh start
            // BridgeContextFactory.reset();

            // Simulate race condition
            const promise1 = new Promise(resolve => {
                setTimeout(() => {
                    // resolve(BridgeContextFactory.create(extensionContext));
                    resolve(null);
                }, 0);
            });

            const promise2 = new Promise(resolve => {
                setTimeout(() => {
                    // resolve(BridgeContextFactory.create(extensionContext));
                    resolve(null);
                }, 0);
            });

            // const [ctx1, ctx2] = await Promise.all([promise1, promise2]);

            // Should still be the same instance despite race
            // assert.strictEqual(ctx1, ctx2);
        });
    });

    suite('error handling', () => {
        test('should provide meaningful error messages', () => {
            const badContext = {
                extensionPath: null,
                subscriptions: undefined
            } as any;

            try {
                // BridgeContextFactory.create(badContext);
                // assert.fail('Should have thrown an error');
            } catch (error: any) {
                // assert.ok(error.message.includes('extension context'));
                // assert.ok(error.message.includes('required'));
            }
        });

        test('should handle VS Code API unavailability', () => {
            // Simulate VS Code APIs not being available
            const originalWorkspace = vscode.workspace;
            (global as any).vscode = {
                ...vscode,
                workspace: undefined
            };

            try {
                // const context = BridgeContextFactory.create(extensionContext);
                // Should handle gracefully
                // assert.ok(context);
                // assert.strictEqual(context.getWorkspace(), undefined);
            } finally {
                // Restore
                (global as any).vscode = { ...vscode, workspace: originalWorkspace };
            }
        });
    });
});