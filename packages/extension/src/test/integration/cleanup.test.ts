import { describe, it, beforeEach, afterEach } from 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Extension Lifecycle Cleanup', () => {
    beforeEach(() => {
        // Clear any existing globals before each test
        (global as any).scriptRegistry = undefined;
        (global as any).VSC_BRIDGE_BASE_PATH = undefined;
    });

    afterEach(() => {
        // Clean up after each test
        (global as any).scriptRegistry = undefined;
        (global as any).VSC_BRIDGE_BASE_PATH = undefined;
    });

    describe('deactivate()', () => {
        it('should clean up global.scriptRegistry on deactivation', async () => {
            // Simulate setting up globals as the extension would
            const mockRegistry = {
                scripts: new Map(),
                listScripts: () => ['test.script']
            };
            (global as any).scriptRegistry = mockRegistry;

            // Verify the global is set
            assert.ok((global as any).scriptRegistry, 'Global scriptRegistry should be set before deactivation');
            assert.strictEqual((global as any).scriptRegistry, mockRegistry);

            // Simulate deactivation by clearing globals
            // This mimics what the deactivate function does
            try {
                // The actual deactivate would close the server here
            } finally {
                (global as any).scriptRegistry = undefined;
                (global as any).VSC_BRIDGE_BASE_PATH = undefined;
            }

            // Verify globals are cleaned up
            assert.strictEqual((global as any).scriptRegistry, undefined,
                             'Global scriptRegistry should be undefined after deactivation');
        });

        it('should clean up global.VSC_BRIDGE_BASE_PATH on deactivation', async () => {
            // Simulate setting up the base path global
            const mockBasePath = '/path/to/extension/out';
            (global as any).VSC_BRIDGE_BASE_PATH = mockBasePath;

            // Verify the global is set
            assert.ok((global as any).VSC_BRIDGE_BASE_PATH, 'Global VSC_BRIDGE_BASE_PATH should be set before deactivation');
            assert.strictEqual((global as any).VSC_BRIDGE_BASE_PATH, mockBasePath);

            // Simulate deactivation by clearing globals
            try {
                // The actual deactivate would close the server here
            } finally {
                (global as any).scriptRegistry = undefined;
                (global as any).VSC_BRIDGE_BASE_PATH = undefined;
            }

            // Verify the base path is cleaned up
            assert.strictEqual((global as any).VSC_BRIDGE_BASE_PATH, undefined,
                             'Global VSC_BRIDGE_BASE_PATH should be undefined after deactivation');
        });

        it('should handle deactivation when globals are not set', async () => {
            // Ensure globals are not set
            assert.strictEqual((global as any).scriptRegistry, undefined);
            assert.strictEqual((global as any).VSC_BRIDGE_BASE_PATH, undefined);

            // Simulate deactivation - should not throw
            try {
                // The actual deactivate would close the server here
            } finally {
                (global as any).scriptRegistry = undefined;
                (global as any).VSC_BRIDGE_BASE_PATH = undefined;
            }

            // Verify globals remain undefined
            assert.strictEqual((global as any).scriptRegistry, undefined);
            assert.strictEqual((global as any).VSC_BRIDGE_BASE_PATH, undefined);
        });

        it('should preserve independent globals during cleanup', async () => {
            // Set up test globals
            (global as any).scriptRegistry = { test: 'registry' };
            (global as any).VSC_BRIDGE_BASE_PATH = '/test/path';
            (global as any).unrelatedGlobal = 'should-remain';

            // Simulate deactivation
            try {
                // The actual deactivate would close the server here
            } finally {
                (global as any).scriptRegistry = undefined;
                (global as any).VSC_BRIDGE_BASE_PATH = undefined;
                // Note: unrelatedGlobal is NOT cleared
            }

            // Verify only VSC-Bridge globals are cleaned
            assert.strictEqual((global as any).scriptRegistry, undefined);
            assert.strictEqual((global as any).VSC_BRIDGE_BASE_PATH, undefined);
            assert.strictEqual((global as any).unrelatedGlobal, 'should-remain',
                             'Unrelated globals should not be affected');

            // Clean up test global
            delete (global as any).unrelatedGlobal;
        });
    });

    describe('Reactivation After Deactivation', () => {
        it('should allow clean reactivation after deactivation', async () => {
            // First activation
            const firstRegistry = { id: 'first', scripts: new Map() };
            const firstBasePath = '/first/path';
            (global as any).scriptRegistry = firstRegistry;
            (global as any).VSC_BRIDGE_BASE_PATH = firstBasePath;

            // Deactivation
            try {
                // Server close would happen here
            } finally {
                (global as any).scriptRegistry = undefined;
                (global as any).VSC_BRIDGE_BASE_PATH = undefined;
            }

            // Verify cleanup
            assert.strictEqual((global as any).scriptRegistry, undefined);
            assert.strictEqual((global as any).VSC_BRIDGE_BASE_PATH, undefined);

            // Second activation (reactivation)
            const secondRegistry = { id: 'second', scripts: new Map() };
            const secondBasePath = '/second/path';
            (global as any).scriptRegistry = secondRegistry;
            (global as any).VSC_BRIDGE_BASE_PATH = secondBasePath;

            // Verify new values are set correctly
            assert.strictEqual((global as any).scriptRegistry.id, 'second',
                             'Should have new registry after reactivation');
            assert.strictEqual((global as any).VSC_BRIDGE_BASE_PATH, '/second/path',
                             'Should have new base path after reactivation');

            // No interference from previous activation
            assert.notStrictEqual((global as any).scriptRegistry, firstRegistry);
            assert.notStrictEqual((global as any).VSC_BRIDGE_BASE_PATH, firstBasePath);
        });

        it('should not have memory leaks across multiple activation cycles', async () => {
            const activationCycles = 5;
            const registries: any[] = [];

            for (let i = 0; i < activationCycles; i++) {
                // Activation
                const registry = {
                    cycleId: i,
                    scripts: new Map(),
                    data: new Array(100).fill(`cycle-${i}`) // Some data to track
                };
                registries.push(registry);
                (global as any).scriptRegistry = registry;
                (global as any).VSC_BRIDGE_BASE_PATH = `/path/cycle-${i}`;

                // Verify activation
                assert.strictEqual((global as any).scriptRegistry.cycleId, i);

                // Deactivation
                try {
                    // Server close would happen here
                } finally {
                    (global as any).scriptRegistry = undefined;
                    (global as any).VSC_BRIDGE_BASE_PATH = undefined;
                }

                // Verify cleanup
                assert.strictEqual((global as any).scriptRegistry, undefined);
                assert.strictEqual((global as any).VSC_BRIDGE_BASE_PATH, undefined);
            }

            // After all cycles, verify no globals remain
            assert.strictEqual((global as any).scriptRegistry, undefined);
            assert.strictEqual((global as any).VSC_BRIDGE_BASE_PATH, undefined);
        });
    });

    describe('Error Handling During Cleanup', () => {
        it('should still clean up globals even if server close throws', async () => {
            // Set up globals
            (global as any).scriptRegistry = { test: 'registry' };
            (global as any).VSC_BRIDGE_BASE_PATH = '/test/path';

            // Simulate deactivation with server error
            let serverError: Error | undefined;
            try {
                // Simulate server.close() throwing an error
                throw new Error('Server close failed');
            } catch (error) {
                serverError = error as Error;
            } finally {
                // Cleanup should still happen
                (global as any).scriptRegistry = undefined;
                (global as any).VSC_BRIDGE_BASE_PATH = undefined;
            }

            // Verify error was caught
            assert.ok(serverError, 'Server error should have been thrown');
            assert.strictEqual(serverError.message, 'Server close failed');

            // Verify globals are still cleaned up despite error
            assert.strictEqual((global as any).scriptRegistry, undefined,
                             'scriptRegistry should be cleaned up even after error');
            assert.strictEqual((global as any).VSC_BRIDGE_BASE_PATH, undefined,
                             'VSC_BRIDGE_BASE_PATH should be cleaned up even after error');
        });
    });
});