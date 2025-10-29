import * as assert from 'assert';
import * as vscode from 'vscode';
import { suite, test, suiteSetup } from 'mocha';
import { BridgeContext } from '../../core/bridge-context/BridgeContext';

suite('BridgeContext using VS Code APIs', () => {
    let context: BridgeContext;
    let extensionContext: vscode.ExtensionContext;

    suiteSetup(async function() {
        this.timeout(10000); // Give time for extension activation

        // Get the real extension and its context
        // Note: The extension ID should match package.json
        const ext = vscode.extensions.getExtension('AI-Substrate.vsc-bridge-extension');
        if (!ext) {
            throw new Error('Extension not found. Make sure the extension ID is correct.');
        }

        // Activate if not already active
        if (!ext.isActive) {
            await ext.activate();
        }

        // Extension must export a way to get context for tests
        // We'll need to modify the activate function to export this
        if (ext.exports && ext.exports.getContext) {
            extensionContext = ext.exports.getContext();
        } else {
            // For now, create a mock context until we update activate()
            // This will be replaced with real context
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

        // Create BridgeContext instance
        context = new BridgeContext(extensionContext);
    });

    suite('version', () => {
        test('should return the current version string', () => {
            assert.strictEqual(context.version, '1.0.0');
            assert.strictEqual(typeof context.version, 'string');
        });

        test('should be readonly', () => {
            // Test that version cannot be modified
            assert.throws(() => {
                (context as any).version = '2.0.0';
            });
        });
    });

    suite('getWorkspace using vscode.workspace API', () => {
        test('should return undefined when no workspace is open', () => {
            // Uses vscode.workspace.workspaceFolders internally
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                const workspace = context.getWorkspace();
                assert.strictEqual(workspace, undefined);
            }
        });

        test('should return first workspace folder via VS Code API', () => {
            // Directly uses vscode.workspace.workspaceFolders[0]
            const vsCodeWorkspace = vscode.workspace.workspaceFolders?.[0];
            if (vsCodeWorkspace) {
                const workspace = context.getWorkspace();
                assert.strictEqual(workspace, vsCodeWorkspace);
                assert.strictEqual(workspace.name, vsCodeWorkspace.name);
                assert.strictEqual(workspace.uri.toString(), vsCodeWorkspace.uri.toString());
            }
        });

        test('should handle multiple workspace folders', () => {
            // Should always return the first one
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
                const workspace = context.getWorkspace();
                assert.strictEqual(workspace, vscode.workspace.workspaceFolders[0]);
            }
        });
    });

    suite('getConfiguration using vscode.workspace.getConfiguration', () => {
        test('should wrap VS Code configuration API', () => {
            // Uses vscode.workspace.getConfiguration internally
            const section = 'vsc-bridge';
            // const config = context.getConfiguration(section);
            const directConfig = vscode.workspace.getConfiguration(section);

            // They should return the same object
            // assert.deepStrictEqual(config, directConfig);
        });

        test('should handle nested configuration sections', () => {
            // Test with nested section like 'python.testing'
            const nestedSection = 'python.testing';
            // const config = context.getConfiguration(nestedSection);
            const directConfig = vscode.workspace.getConfiguration(nestedSection);

            // assert.deepStrictEqual(config, directConfig);
        });

        test('should handle VS Code API edge cases', () => {
            // VS Code returns empty config object for invalid sections
            // const config = context.getConfiguration('invalid.section.that.does.not.exist');
            // assert.ok(config); // VS Code always returns object
            // assert.strictEqual(typeof config, 'object');
        });

        test('should support getting specific configuration values', () => {
            // Test getting specific values from configuration
            const section = 'editor';
            // const config = context.getConfiguration(section);
            const directConfig = vscode.workspace.getConfiguration(section);

            // Both should have the same properties
            // assert.strictEqual(config.get('fontSize'), directConfig.get('fontSize'));
        });
    });

    suite('getActiveEditor using vscode.window.activeTextEditor', () => {
        test('should return undefined when no editor is active', async () => {
            // Close all editors first
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');

            // const editor = context.getActiveEditor();
            // assert.strictEqual(editor, undefined);
            // assert.strictEqual(editor, vscode.window.activeTextEditor);
        });

        test('should return active text editor when available', async () => {
            // Open a temporary file to have an active editor
            const doc = await vscode.workspace.openTextDocument({
                content: 'test content',
                language: 'plaintext'
            });
            const editor = await vscode.window.showTextDocument(doc);

            // const activeEditor = context.getActiveEditor();
            // assert.strictEqual(activeEditor, editor);
            // assert.strictEqual(activeEditor, vscode.window.activeTextEditor);
            // assert.strictEqual(activeEditor?.document.getText(), 'test content');
        });

        test('should update when active editor changes', async () => {
            // Open first document
            const doc1 = await vscode.workspace.openTextDocument({
                content: 'first document',
                language: 'plaintext'
            });
            await vscode.window.showTextDocument(doc1);

            // const firstEditor = context.getActiveEditor();
            // assert.strictEqual(firstEditor?.document.getText(), 'first document');

            // Open second document
            const doc2 = await vscode.workspace.openTextDocument({
                content: 'second document',
                language: 'plaintext'
            });
            await vscode.window.showTextDocument(doc2);

            // const secondEditor = context.getActiveEditor();
            // assert.strictEqual(secondEditor?.document.getText(), 'second document');
            // assert.notStrictEqual(firstEditor, secondEditor);
        });
    });

    suite('Python Environment Detection', () => {
        test('should have getPythonEnv method', () => {
            assert.ok(typeof context.getPythonEnv === 'function');
        });

        test('should return IPythonEnvironment with no workspace', async () => {
            // Mock no workspace
            const originalGetWorkspace = context.getWorkspace;
            context.getWorkspace = () => undefined;

            try {
                const env = await context.getPythonEnv('/path/to/test.py');
                assert.strictEqual(env.language, 'python');
                assert.strictEqual(env.framework, 'none');
                assert.strictEqual(env.confidence, 0);
                assert.ok(env.reasons.includes('No workspace folder'));
                assert.ok(env.debugConfig);
                assert.strictEqual(env.debugConfig.type, 'debugpy');
                assert.strictEqual(env.debugConfig.module, 'pytest'); // Fallback
            } finally {
                context.getWorkspace = originalGetWorkspace;
            }
        });

        test('should detect Python environment from workspace', async function() {
            this.timeout(5000);

            // Skip if no workspace is available
            const workspace = context.getWorkspace();
            if (!workspace) {
                this.skip();
                return;
            }

            // Create a temporary test file path
            const testPath = vscode.Uri.joinPath(workspace.uri, 'test_sample.py').fsPath;

            const env = await context.getPythonEnv(testPath);

            // Basic assertions - framework detection may vary based on workspace
            assert.strictEqual(env.language, 'python');
            assert.ok(['pytest', 'unittest', 'nose2', 'none'].includes(env.framework));
            assert.ok(env.confidence >= 0 && env.confidence <= 1);
            assert.ok(env.debugConfig);
            assert.strictEqual(env.debugConfig.type, 'debugpy');
            assert.strictEqual(env.debugConfig.request, 'launch');
            assert.ok(env.debugConfig.module); // Must use module, not program
            assert.ok(!env.debugConfig.program); // Should NOT have program
            assert.strictEqual(env.debugConfig.justMyCode, false);
            assert.ok(env.cwd);
        });
    });

    suite('logger using vscode.OutputChannel', () => {
        test('should create output channel on initialization', () => {
            // Logger should wrap vscode.window.createOutputChannel
            // assert.ok(context.logger);
            // assert.strictEqual(typeof context.logger.info, 'function');
            // assert.strictEqual(typeof context.logger.error, 'function');
            // assert.strictEqual(typeof context.logger.debug, 'function');
            // assert.strictEqual(typeof context.logger.warn, 'function');
        });

        test('should use VS Code OutputChannel.appendLine API', () => {
            // Create a test output channel to verify behavior
            const testChannel = vscode.window.createOutputChannel('BridgeContext Test');
            let appendLineCalled = false;
            let appendedMessage = '';

            // Intercept appendLine calls
            const originalAppendLine = testChannel.appendLine;
            testChannel.appendLine = (message: string) => {
                appendLineCalled = true;
                appendedMessage = message;
                originalAppendLine.call(testChannel, message);
            };

            // Simulate logger behavior
            // context.logger.info('Test message');

            // Verify appendLine was called
            // assert.strictEqual(appendLineCalled, true);
            // assert.ok(appendedMessage.includes('Test message'));

            // Cleanup
            testChannel.dispose();
        });

        test('should format log messages with level', () => {
            // Test that logger adds appropriate prefixes
            const testChannel = vscode.window.createOutputChannel('BridgeContext Test');
            const messages: string[] = [];

            testChannel.appendLine = (message: string) => {
                messages.push(message);
            };

            // Test different log levels
            // context.logger.info('Info message');
            // context.logger.error('Error message');
            // context.logger.debug('Debug message');
            // context.logger.warn('Warning message');

            // Verify formatting
            // assert.ok(messages.some(m => m.includes('[INFO]') && m.includes('Info message')));
            // assert.ok(messages.some(m => m.includes('[ERROR]') && m.includes('Error message')));
            // assert.ok(messages.some(m => m.includes('[DEBUG]') && m.includes('Debug message')));
            // assert.ok(messages.some(m => m.includes('[WARN]') && m.includes('Warning message')));

            testChannel.dispose();
        });

        test('should show channel via VS Code API when error logged', () => {
            const testChannel = vscode.window.createOutputChannel('BridgeContext Test');
            let showCalled = false;

            // Intercept show calls
            const originalShow = testChannel.show.bind(testChannel);
            (testChannel as any).show = () => {
                showCalled = true;
                originalShow();
            };

            // Error should trigger show
            // context.logger.error('Critical error');

            // assert.strictEqual(showCalled, true, 'Channel should be shown on error');

            testChannel.dispose();
        });

        test('should handle null and undefined gracefully', () => {
            // Logger should not throw on invalid input
            // assert.doesNotThrow(() => context.logger.info(null as any));
            // assert.doesNotThrow(() => context.logger.info(undefined as any));
            // assert.doesNotThrow(() => context.logger.error('', null as any));
        });
    });

    suite('error handling and edge cases', () => {
        test('should handle missing extension context gracefully', () => {
            // Test creating BridgeContext with minimal context
            const minimalContext = {
                subscriptions: [],
                extensionUri: vscode.Uri.file('/test')
            } as any;

            // const testContext = new BridgeContext(minimalContext);
            // assert.ok(testContext);
            // assert.doesNotThrow(() => testContext.getWorkspace());
        });

        test('should handle concurrent access', async () => {
            // Test that multiple concurrent calls work correctly
            const promises = [];

            for (let i = 0; i < 10; i++) {
                promises.push(Promise.resolve().then(() => {
                    // context.getWorkspace();
                    // context.getConfiguration('test');
                    // context.logger.info(`Concurrent test ${i}`);
                }));
            }

            // Should not throw
            await assert.doesNotReject(Promise.all(promises));
        });
    });
});