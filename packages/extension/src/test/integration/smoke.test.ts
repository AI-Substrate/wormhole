/**
 * INTEGRATION SMOKE TEST
 *
 * DO NOT:
 * ❌ Call updateWorkspaceFolders() - it restarts Extension Host and kills tests
 * ❌ Create multiple test configurations - launches multiple windows
 * ❌ Mock VS Code APIs - use pure functions for unit tests instead
 * ❌ Test workspace mutation - it fundamentally doesn't work
 * ❌ Add complex test infrastructure - keep it simple
 *
 * DO:
 * ✅ Keep integration tests minimal (1-2 smoke tests max)
 * ✅ Use pure functions for unit testing
 * ✅ Skip tests defensively if no workspace
 * ✅ Test the critical path only
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { suite, test } from 'mocha';

suite('Extension Smoke Test', () => {
    test('extension should be present and activatable', async function() {
        this.timeout(20000);

        // Check the extension exists
        const ext = vscode.extensions.getExtension('AI-Substrate.vsc-bridge-extension');
        assert.ok(ext, 'Extension should be present');

        // Activate if not already active
        if (!ext.isActive) {
            await ext.activate();
        }
        assert.strictEqual(ext.isActive, true, 'Extension should be active');
    });

    test('BridgeContext should be available', async function() {
        this.timeout(10000);

        const ext = vscode.extensions.getExtension('AI-Substrate.vsc-bridge-extension');
        if (!ext) {
            this.skip();
            return;
        }

        // Always activate to get exports - it's idempotent if already active
        const exports = await ext.activate();

        // Check that extension exports expected functions
        assert.ok(exports, 'Extension should have exports');
        assert.ok(exports.getContext, 'Should export getContext');
        assert.ok(exports.getScriptRegistry, 'Should export getScriptRegistry');
    });

    test('getPythonEnv should exist on BridgeContext', async function() {
        this.timeout(10000);

        const ext = vscode.extensions.getExtension('AI-Substrate.vsc-bridge-extension');
        if (!ext) {
            this.skip();
            return;
        }

        // Always activate to get exports - it's idempotent if already active
        const exports = await ext.activate();

        const context = exports?.getContext?.();
        if (!context) {
            this.skip();
            return;
        }

        // Import and create BridgeContext
        const { BridgeContext } = await import('../../core/bridge-context/BridgeContext');
        const bridgeContext = new BridgeContext(context);

        // Check getPythonEnv exists
        assert.ok(typeof bridgeContext.getPythonEnv === 'function', 'getPythonEnv should be a function');

        // If there's a workspace, try to detect
        const workspace = bridgeContext.getWorkspace();
        if (workspace) {
            const result = await bridgeContext.getPythonEnv('/dummy/test.py');

            // Basic sanity checks
            assert.strictEqual(result.language, 'python');
            assert.ok(['pytest', 'unittest', 'nose2', 'none'].includes(result.framework));
            assert.ok(result.debugConfig);
            assert.strictEqual(result.debugConfig.type, 'debugpy');

            // The critical fix: must use module, not program
            assert.ok(result.debugConfig.module, 'Debug config must have module');
            assert.ok(!result.debugConfig.program, 'Debug config should NOT have program');
        }
    });

    test('workspace detection should be defensive', async function() {
        // This test should pass whether or not a workspace is open
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            // No workspace - that's fine, skip
            this.skip();
            return;
        }

        // We have a workspace, do a basic check
        const folder = workspaceFolders[0];
        assert.ok(folder.uri, 'Workspace folder should have URI');
        assert.ok(folder.name, 'Workspace folder should have name');
    });
});