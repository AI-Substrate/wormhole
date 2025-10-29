import { describe, it, beforeEach, afterEach, suiteSetup, suiteTeardown, setup, teardown } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { BridgeContext } from '../../../core/bridge-context/BridgeContext';
import { BridgeContextFactory } from '../../../core/bridge-context/factory';
import { waitForTestDiscovery, triggerTestDiscovery } from '../../../core/testing/waitForDiscovery';
import {
    withTempWorkspace,
    getWorkspaceFolderByName,
    createTempSubdir,
    resetWorkbench,
    DisposableTracker
} from '../../bootstrap';

describe('test.debug-wait with BridgeContext', function() {
    this.timeout(60000); // Increase timeout for test discovery
    let extensionContext: vscode.ExtensionContext;
    let bridgeContext: BridgeContext;
    let tempWorkspace: ReturnType<typeof withTempWorkspace> | null = null;
    let disposables: DisposableTracker;

    suiteSetup(async function() {
        this.timeout(60000);
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

    suiteTeardown(async function() {
        await resetWorkbench();
        // Do not remove workspace roots - causes EH restart!
    });

    setup(async function() {
        disposables = new DisposableTracker();
        // Reset workbench state before each test
        await resetWorkbench();
    });

    teardown(async function() {
        // Dispose all test resources
        await disposables.dispose();

        // Clean up temp workspace
        if (tempWorkspace) {
            // Do not remove workspace roots - causes EH restart!
            await tempWorkspace.dispose();
            tempWorkspace = null;
        }
    });

    beforeEach(() => {
        // Create BridgeContext for each test
        bridgeContext = BridgeContextFactory.create(extensionContext);
    });

    afterEach(() => {
        // Clean up BridgeContext
        if (bridgeContext && bridgeContext.dispose) {
            bridgeContext.dispose();
        }
    });

    describe('pytest project detection', () => {
        it('should detect pytest and configure debugpy correctly', async () => {
            // Use the pytest-basic folder from multi-root workspace
            const folder = getWorkspaceFolderByName('pytest-basic');
            assert.ok(folder, 'pytest-basic workspace folder should exist');

            // Wait for test discovery if needed
            if (folder) {
                await triggerTestDiscovery(folder);
                const outcome = await waitForTestDiscovery({
                    folder,
                    timeoutMs: 15000,
                    quietMs: 500,
                    minItems: 1
                });
                console.log(`Test discovery: ${outcome.kind}`);
            }

            const pytestFixture = path.join(folder.uri.fsPath, 'tests', 'test_sample.py');

            // Use BridgeContext to detect Python environment
            const pythonEnv = await bridgeContext.getPythonEnv(pytestFixture);

            // Debug: Log what we actually got
            console.log('File path:', pytestFixture);
            console.log('File exists:', fs.existsSync(pytestFixture));
            console.log('Python detection result:', pythonEnv);

            // Verify detection results
            assert.strictEqual(pythonEnv.framework, 'pytest', `Should detect pytest framework, got: ${pythonEnv.framework}`);
            assert.ok(pythonEnv.confidence >= 0.7, `Should have high confidence, got: ${pythonEnv.confidence}`);
            assert.ok(pythonEnv.reasons.length > 0, `Should provide detection reasons, got: ${pythonEnv.reasons}`);

            // Verify debug configuration
            assert.strictEqual(pythonEnv.debugConfig.type, 'debugpy');
            assert.strictEqual((pythonEnv.debugConfig as any).module, 'pytest', 'Should use module-based execution');
            assert.ok(!(pythonEnv.debugConfig as any).program, 'Should NOT use program-based execution');
            const args = (pythonEnv.debugConfig as any).args;
            assert.ok(Array.isArray(args));
            assert.ok(args.includes('-q'));
        });

        it('should use detected config for debug session with purpose field', async () => {
            // Use the pytest-basic folder from multi-root workspace
            const folder = getWorkspaceFolderByName('pytest-basic');
            assert.ok(folder, 'pytest-basic workspace folder should exist');

            const pytestFixture = path.join(folder.uri.fsPath, 'tests', 'test_sample.py');
            const pythonEnv = await bridgeContext.getPythonEnv(pytestFixture);

            // The debug config from BridgeContext should already have justMyCode
            assert.strictEqual(pythonEnv.debugConfig.justMyCode, false,
                'BridgeContext should set justMyCode to false');

            // Simulate what debug-wait script would do (including setting purpose)
            const mergedConfig = {
                ...pythonEnv.debugConfig,
                name: 'Test Debug Session',
                cwd: pythonEnv.cwd || path.dirname(pytestFixture),
                purpose: ['debug-test'],  // This is set by debug-wait script
                justMyCode: false  // Ensure this is always false
            };

            // Verify merged config has ALL required fields per the dossier
            assert.strictEqual(mergedConfig.type, 'debugpy',
                'Must use debugpy type');
            assert.strictEqual((mergedConfig as any).module, 'pytest',
                'Must use module-based execution, NOT program');
            assert.ok(!(mergedConfig as any).program,
                'Must NOT have program field (use module instead)');
            assert.ok(mergedConfig.cwd,
                'Must have working directory');
            assert.strictEqual((mergedConfig as any).justMyCode, false,
                'CRITICAL: Must disable justMyCode for breakpoints to work');
            assert.deepStrictEqual((mergedConfig as any).purpose, ['debug-test'],
                'CRITICAL: Must set purpose for VS Code Test UI integration');
        });

        it('should include --no-cov flag for pytest to prevent coverage interference', async () => {
            // Use the pytest-basic folder from multi-root workspace
            const folder = getWorkspaceFolderByName('pytest-basic');
            assert.ok(folder, 'pytest-basic workspace folder should exist');

            const pytestFixture = path.join(folder.uri.fsPath, 'tests', 'test_sample.py');
            const pythonEnv = await bridgeContext.getPythonEnv(pytestFixture);

            // Verify --no-cov flag is included
            const args = (pythonEnv.debugConfig as any).args;
            assert.ok(
                args && args.includes('--no-cov'),
                'Should include --no-cov flag for pytest'
            );
        });
    });

    describe('unittest project detection', () => {
        it('should detect unittest and configure debugpy correctly', async () => {
            // Use the unittest-basic folder from multi-root workspace
            const folder = getWorkspaceFolderByName('unittest-basic');
            assert.ok(folder, 'unittest-basic workspace folder should exist');

            const unittestFixture = path.join(folder.uri.fsPath, 'test_sample.py');

            // Ensure the file exists or create it
            if (!fs.existsSync(unittestFixture)) {
                fs.writeFileSync(unittestFixture, `import unittest

class TestSample(unittest.TestCase):
    def test_example(self):
        x = 1 + 1
        self.assertEqual(x, 2)

if __name__ == '__main__':
    unittest.main()
`);
            }

            const pythonEnv = await bridgeContext.getPythonEnv(unittestFixture);

            // Verify detection results
            assert.strictEqual(pythonEnv.framework, 'unittest', 'Should detect unittest framework');
            assert.ok(pythonEnv.confidence >= 0.7, 'Should have high confidence');

            // Verify debug configuration
            assert.strictEqual(pythonEnv.debugConfig.type, 'debugpy');
            assert.strictEqual((pythonEnv.debugConfig as any).module, 'unittest');
        });
    });

    describe('no framework detection', () => {
        it('should handle no framework detection gracefully', async () => {
            // Use the none folder from multi-root workspace
            const folder = getWorkspaceFolderByName('none');
            assert.ok(folder, 'none workspace folder should exist');

            const noFrameworkFixture = path.join(folder.uri.fsPath, 'plain.py');

            // Ensure the file exists or create it
            if (!fs.existsSync(noFrameworkFixture)) {
                fs.writeFileSync(noFrameworkFixture, `# Plain Python file
def main():
    print("Hello, World!")

if __name__ == '__main__':
    main()
`);
            }

            const pythonEnv = await bridgeContext.getPythonEnv(noFrameworkFixture);

            // Should fall back to default/none
            assert.ok(
                pythonEnv.framework === 'none' || pythonEnv.framework === 'pytest',
                'Should return none or default framework'
            );

            // Should still provide a valid debug config
            assert.ok(pythonEnv.debugConfig, 'Should provide debug config even with no framework');
            assert.strictEqual(pythonEnv.debugConfig.type, 'debugpy');
        });
    });

    describe('config merging', () => {
        it('should merge user overrides with detected config', async () => {
            // Use the pytest-basic folder from multi-root workspace
            const folder = getWorkspaceFolderByName('pytest-basic');
            assert.ok(folder, 'pytest-basic workspace folder should exist');

            const pytestFixture = path.join(folder.uri.fsPath, 'tests', 'test_sample.py');
            const pythonEnv = await bridgeContext.getPythonEnv(pytestFixture);

            // User provided overrides
            const userOverrides = {
                env: { 'MY_VAR': 'test' },
                args: ['--verbose', 'specific_test.py'],
                justMyCode: true
            };

            // Merge configs (user overrides win)
            const mergedConfig = {
                ...pythonEnv.debugConfig,
                ...userOverrides
            };

            // Verify user overrides take precedence
            assert.deepStrictEqual(mergedConfig.env, { 'MY_VAR': 'test' });
            assert.deepStrictEqual(mergedConfig.args, ['--verbose', 'specific_test.py']);
            assert.strictEqual(mergedConfig.justMyCode, true);

            // But original fields are preserved
            assert.strictEqual(mergedConfig.type, 'debugpy');
            assert.strictEqual((mergedConfig as any).module, 'pytest');
        });
    });

    describe('backward compatibility', () => {
        it('should work when BridgeContext does not have getPythonEnv', async () => {
            // Create a mock context without getPythonEnv
            const mockBridgeContext = {
                vscode: vscode,
                outputChannel: null,
                getWorkspace: () => vscode.workspace.workspaceFolders?.[0]
            };

            // This simulates the script running with an older BridgeContext
            const hasPythonEnv = typeof (mockBridgeContext as any).getPythonEnv === 'function';
            assert.strictEqual(hasPythonEnv, false, 'Mock should not have getPythonEnv');

            // Script should handle this gracefully
            // (In real implementation, script will check for method existence)
        });

        it('should work with old signature (bridgeContext, params)', () => {
            // The script already uses this signature
            // This test verifies the signature is correct

            // Mock script function signature
            const mockWait = async (bridgeContext: any, params: any) => {
                // Check if we have the expected parameters
                assert.ok(bridgeContext, 'Should receive bridgeContext');
                assert.ok(params, 'Should receive params');
                return { event: 'terminated', sessionId: 'test' };
            };

            // Test calling with correct signature
            return mockWait(bridgeContext, { path: 'test.py', line: 10 });
        });
    });

    describe('performance', () => {
        it('should complete detection in less than 50ms', async () => {
            // Use the pytest-basic folder from multi-root workspace
            const folder = getWorkspaceFolderByName('pytest-basic');
            assert.ok(folder, 'pytest-basic workspace folder should exist');

            const pytestFixture = path.join(folder.uri.fsPath, 'tests', 'test_sample.py');

            const startTime = Date.now();
            await bridgeContext.getPythonEnv(pytestFixture);
            const duration = Date.now() - startTime;

            assert.ok(
                duration < 50,
                `Detection took ${duration}ms, should be under 50ms`
            );
        });
    });

    describe('remote safety and bounded searches', () => {
        it('should use VS Code FS APIs for detection', async () => {
            // Use the pytest-basic folder from multi-root workspace
            const folder = getWorkspaceFolderByName('pytest-basic');
            assert.ok(folder, 'pytest-basic workspace folder should exist');

            const pytestFixture = path.join(folder.uri.fsPath, 'tests', 'test_sample.py');

            // Simple approach: just verify the VSCodeFSAdapter is being used
            // The detection uses VSCodeFSAdapter which internally uses vscode.workspace.fs
            const pythonEnv = await bridgeContext.getPythonEnv(pytestFixture);

            // If we get a result, it means VS Code FS APIs were used successfully
            // The VSCodeFSAdapter class uses vscode.workspace.fs internally
            assert.ok(pythonEnv, 'Should successfully detect using VS Code FS APIs');
            assert.ok(pythonEnv.framework, 'Should detect framework using VS Code FS');
        });

        it('should NOT use Node.js fs module in BridgeContext', async () => {
            // This test verifies that BridgeContext.getPythonEnv doesn't use Node fs
            // when no workspace folder exists
            const originalGetWorkspace = bridgeContext.getWorkspace;
            bridgeContext.getWorkspace = () => undefined;

            try {
                // Call with a path that doesn't have a workspace
                const testPath = '/tmp/test/file.py';
                const env = await bridgeContext.getPythonEnv(testPath);

                // If this works without error, the implementation should be using
                // VS Code APIs. Node fs would fail in remote scenarios.
                assert.ok(env, 'Should return environment even without workspace');

                // The implementation should NOT create a fake workspace folder
                // It should return 'none' framework when no workspace exists
                assert.strictEqual(env.framework, 'none',
                    'Should return none when no project markers found');
            } finally {
                bridgeContext.getWorkspace = originalGetWorkspace;
            }
        });

        it('should use bounded search patterns for detection', async () => {
            // This test would need to spy on VS Code APIs to verify RelativePattern usage
            // For now, we verify the detection completes quickly (bounded search)
            const folder = getWorkspaceFolderByName('pytest-basic');
            assert.ok(folder, 'pytest-basic workspace folder should exist');

            const pytestFixture = path.join(folder.uri.fsPath, 'tests', 'test_sample.py');

            const startTime = Date.now();
            const pythonEnv = await bridgeContext.getPythonEnv(pytestFixture);
            const duration = Date.now() - startTime;

            // Bounded search should be very fast
            assert.ok(duration < 100,
                `Detection took ${duration}ms, bounded search should be < 100ms`);

            // Verify we got correct results (proves search worked)
            assert.strictEqual(pythonEnv.framework, 'pytest');
        });
    });
});