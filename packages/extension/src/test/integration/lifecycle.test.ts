import * as assert from 'assert';
import * as vscode from 'vscode';
import { suite, test, suiteSetup } from 'mocha';
import { BridgeContext } from '../../core/bridge-context/BridgeContext';
import { BridgeContextFactory } from '../../core/bridge-context/factory';
import {
    withContext,
    currentContext,
    hasContext,
    exitContext,
    requireContext,
    contextOrFallback
} from '../../core/bridge-context/lifecycle';

suite('BridgeContext AsyncLocalStorage Lifecycle', () => {
    let extensionContext: vscode.ExtensionContext;
    let bridgeContext1: BridgeContext;
    let bridgeContext2: BridgeContext;

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

        if (ext.exports && ext.exports.getContext) {
            extensionContext = ext.exports.getContext();
        } else {
            // Create minimal context for testing
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

        // Create two different contexts for testing
        bridgeContext1 = BridgeContextFactory.create(extensionContext);
        BridgeContextFactory.reset(); // Force new instance
        bridgeContext2 = BridgeContextFactory.create(extensionContext);
    });

    suite('basic context operations', () => {
        test('should have no context initially', () => {
            assert.strictEqual(currentContext(), undefined);
            assert.strictEqual(hasContext(), false);
        });

        test('should provide context within withContext', async () => {
            await withContext(bridgeContext1, () => {
                assert.strictEqual(currentContext(), bridgeContext1);
                assert.strictEqual(hasContext(), true);
            });
        });

        test('should clear context after withContext', async () => {
            await withContext(bridgeContext1, () => {
                assert.ok(hasContext());
            });

            // After withContext, should be cleared
            assert.strictEqual(currentContext(), undefined);
            assert.strictEqual(hasContext(), false);
        });

        test('should maintain context across async boundaries', async () => {
            await withContext(bridgeContext1, async () => {
                assert.strictEqual(currentContext(), bridgeContext1);

                // Simulate async operation
                await new Promise(resolve => setTimeout(resolve, 10));
                assert.strictEqual(currentContext(), bridgeContext1);

                // Another async hop
                await Promise.resolve();
                assert.strictEqual(currentContext(), bridgeContext1);
            });
        });
    });

    suite('context isolation', () => {
        test('should isolate contexts in concurrent executions', async () => {
            const results: any[] = [];

            const task1 = withContext(bridgeContext1, async () => {
                results.push({ task: 1, start: currentContext() });
                await new Promise(resolve => setTimeout(resolve, 20));
                results.push({ task: 1, end: currentContext() });
                return 'task1';
            });

            const task2 = withContext(bridgeContext2, async () => {
                results.push({ task: 2, start: currentContext() });
                await new Promise(resolve => setTimeout(resolve, 10));
                results.push({ task: 2, end: currentContext() });
                return 'task2';
            });

            const [result1, result2] = await Promise.all([task1, task2]);

            assert.strictEqual(result1, 'task1');
            assert.strictEqual(result2, 'task2');

            // Check that each task maintained its own context
            const task1Results = results.filter(r => r.task === 1);
            const task2Results = results.filter(r => r.task === 2);

            assert.strictEqual(task1Results[0].start, bridgeContext1);
            assert.strictEqual(task1Results[1].end, bridgeContext1);
            assert.strictEqual(task2Results[0].start, bridgeContext2);
            assert.strictEqual(task2Results[1].end, bridgeContext2);
        });

        test('should not leak context between sequential executions', async () => {
            await withContext(bridgeContext1, () => {
                assert.strictEqual(currentContext(), bridgeContext1);
            });

            // No context here
            assert.strictEqual(currentContext(), undefined);

            await withContext(bridgeContext2, () => {
                assert.strictEqual(currentContext(), bridgeContext2);
            });

            // Still no context
            assert.strictEqual(currentContext(), undefined);
        });

        test('should handle nested contexts', async () => {
            await withContext(bridgeContext1, async () => {
                assert.strictEqual(currentContext(), bridgeContext1);

                // Nested context - should override
                await withContext(bridgeContext2, () => {
                    assert.strictEqual(currentContext(), bridgeContext2);
                });

                // Back to outer context
                assert.strictEqual(currentContext(), bridgeContext1);
            });
        });
    });

    suite('exit context', () => {
        test('should exit context within withContext', async () => {
            await withContext(bridgeContext1, async () => {
                assert.strictEqual(currentContext(), bridgeContext1);

                await exitContext(() => {
                    assert.strictEqual(currentContext(), undefined);
                    assert.strictEqual(hasContext(), false);
                });

                // Context restored after exit
                assert.strictEqual(currentContext(), bridgeContext1);
            });
        });

        test('should handle errors in exit context', async () => {
            await withContext(bridgeContext1, async () => {
                try {
                    await exitContext(() => {
                        assert.strictEqual(currentContext(), undefined);
                        throw new Error('Test error in exit');
                    });
                    assert.fail('Should have thrown');
                } catch (error: any) {
                    assert.strictEqual(error.message, 'Test error in exit');
                }

                // Context still available after error
                assert.strictEqual(currentContext(), bridgeContext1);
            });
        });
    });

    suite('helper functions', () => {
        test('requireContext should throw when no context', () => {
            assert.throws(
                () => requireContext(),
                /BridgeContext is required but not available/
            );
        });

        test('requireContext should return context when available', async () => {
            await withContext(bridgeContext1, () => {
                const ctx = requireContext();
                assert.strictEqual(ctx, bridgeContext1);
            });
        });

        test('contextOrFallback should use current context', async () => {
            await withContext(bridgeContext1, () => {
                const ctx = contextOrFallback(() => bridgeContext2);
                assert.strictEqual(ctx, bridgeContext1);
            });
        });

        test('contextOrFallback should use fallback when no context', () => {
            const ctx = contextOrFallback(() => bridgeContext2);
            assert.strictEqual(ctx, bridgeContext2);
        });
    });

    suite('error handling', () => {
        test('should maintain context through error handling', async () => {
            await withContext(bridgeContext1, async () => {
                try {
                    assert.strictEqual(currentContext(), bridgeContext1);
                    throw new Error('Test error');
                } catch (error) {
                    // Context still available in catch
                    assert.strictEqual(currentContext(), bridgeContext1);
                } finally {
                    // And in finally
                    assert.strictEqual(currentContext(), bridgeContext1);
                }
            });

            // Cleared after
            assert.strictEqual(currentContext(), undefined);
        });

        test('should not leak context on unhandled rejection', async () => {
            try {
                await withContext(bridgeContext1, async () => {
                    throw new Error('Unhandled test error');
                });
            } catch (error) {
                // Expected error
            }

            // Context should be cleared even after error
            assert.strictEqual(currentContext(), undefined);
        });
    });

    suite('performance', () => {
        test('should handle many concurrent contexts efficiently', async () => {
            const startTime = Date.now();
            const iterations = 100;
            const promises = [];

            for (let i = 0; i < iterations; i++) {
                const ctx = i % 2 === 0 ? bridgeContext1 : bridgeContext2;
                promises.push(
                    withContext(ctx, async () => {
                        // Verify correct context
                        assert.strictEqual(currentContext(), ctx);
                        // Simulate some async work
                        await Promise.resolve();
                        return i;
                    })
                );
            }

            const results = await Promise.all(promises);
            const duration = Date.now() - startTime;

            // Verify all completed
            assert.strictEqual(results.length, iterations);
            for (let i = 0; i < iterations; i++) {
                assert.strictEqual(results[i], i);
            }

            // Should complete reasonably quickly (< 1s for 100 iterations)
            assert.ok(duration < 1000, `Took ${duration}ms for ${iterations} iterations`);
        });
    });
});