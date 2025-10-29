import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { TestExecutor, TestExecutorError } from '../../../src/core/testing/test-executor';
import { CursorTestMapper } from '../../../src/core/testing/cursor-mapper';
import { TestingApiChecker } from '../../../src/core/testing/availability';

describe('TestExecutor', () => {
    let sandbox: sinon.SinonSandbox;
    let executor: TestExecutor;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        executor = new TestExecutor();
    });

    afterEach(() => {
        executor.cleanup();
        sandbox.restore();
    });

    describe('debugTestAtCursor', () => {
        it('should debug test at specified position', async () => {
            // Mock document
            const mockDocument = {
                uri: vscode.Uri.file('/path/to/test.py'),
                fileName: '/path/to/test.py'
            } as vscode.TextDocument;

            // Mock test item
            const mockTestItem = {
                id: 'test_example',
                label: 'test_example',
                uri: mockDocument.uri,
                range: new vscode.Range(10, 0, 15, 0)
            } as vscode.TestItem;

            // Mock debug session
            const mockSession = {
                id: 'session-123',
                name: 'Python Test Debug',
                type: 'python',
                configuration: {}
            } as vscode.DebugSession;

            // Mock workspace folder
            const mockWorkspaceFolder = {
                uri: vscode.Uri.file('/path/to'),
                name: 'workspace',
                index: 0
            } as vscode.WorkspaceFolder;

            // Stub methods
            sandbox.stub(TestingApiChecker, 'isAvailable').returns(true);
            sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockDocument);
            sandbox.stub(vscode.window, 'showTextDocument').resolves({
                revealRange: sandbox.stub()
            } as any);
            sandbox.stub(CursorTestMapper, 'findTestAtCursor').resolves(mockTestItem);
            sandbox.stub(CursorTestMapper, 'getTestFramework').resolves('pytest');
            sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockWorkspaceFolder);
            sandbox.stub(vscode.commands, 'executeCommand').resolves();

            // Stub waitForDebugSession
            sandbox.stub(executor, 'waitForDebugSession').resolves(mockSession);

            // Execute
            const result = await executor.debugTestAtCursor(
                '/path/to/test.py',
                11,  // line (1-indexed)
                5,   // column
                5000 // timeout
            );

            // Verify result
            assert.strictEqual(result.sessionId, 'session-123');
            assert.strictEqual(result.sessionName, 'Python Test Debug');
            assert.strictEqual(result.testName, 'test_example');
            assert.strictEqual(result.framework, 'pytest');
            assert.strictEqual(result.workspaceFolder, '/path/to');
        });

        it('should throw API_UNAVAILABLE when Testing API not available', async () => {
            sandbox.stub(TestingApiChecker, 'isAvailable').returns(false);

            try {
                await executor.debugTestAtCursor('/path/to/test.py', 10, 1, 5000);
                assert.fail('Should have thrown');
            } catch (error) {
                assert.strictEqual((error as Error).message, TestExecutorError.API_UNAVAILABLE);
            }
        });

        it('should throw FILE_NOT_FOUND when document cannot be opened', async () => {
            sandbox.stub(TestingApiChecker, 'isAvailable').returns(true);
            sandbox.stub(vscode.workspace, 'openTextDocument').rejects(new Error('File not found'));

            try {
                await executor.debugTestAtCursor('/nonexistent/file.py', 10, 1, 5000);
                assert.fail('Should have thrown');
            } catch (error) {
                assert.strictEqual((error as Error).message, TestExecutorError.FILE_NOT_FOUND);
            }
        });

        it('should throw NO_TEST_AT_CURSOR when not in test file', async () => {
            const mockDocument = {
                uri: vscode.Uri.file('/path/to/main.py'),
                fileName: '/path/to/main.py'
            } as vscode.TextDocument;

            sandbox.stub(TestingApiChecker, 'isAvailable').returns(true);
            sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockDocument);
            sandbox.stub(vscode.window, 'showTextDocument').resolves({
                revealRange: sandbox.stub()
            } as any);
            sandbox.stub(CursorTestMapper, 'findTestAtCursor').resolves(null);
            sandbox.stub(CursorTestMapper, 'isInTestFile').returns(false);

            try {
                await executor.debugTestAtCursor('/path/to/main.py', 10, 1, 5000);
                assert.fail('Should have thrown');
            } catch (error) {
                assert.strictEqual((error as Error).message, TestExecutorError.NO_TEST_AT_CURSOR);
            }
        });

        it('should use testing.debugAtCursor command when no test item found but in test file', async () => {
            const mockDocument = {
                uri: vscode.Uri.file('/path/to/test.py'),
                fileName: '/path/to/test.py'
            } as vscode.TextDocument;

            const mockSession = {
                id: 'session-456',
                name: 'Test Debug',
                type: 'node'
            } as vscode.DebugSession;

            sandbox.stub(TestingApiChecker, 'isAvailable').returns(true);
            sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockDocument);
            sandbox.stub(vscode.window, 'showTextDocument').resolves({
                revealRange: sandbox.stub()
            } as any);
            sandbox.stub(CursorTestMapper, 'findTestAtCursor').resolves(null);
            sandbox.stub(CursorTestMapper, 'isInTestFile').returns(true);
            sandbox.stub(CursorTestMapper, 'getTestFramework').resolves('jest');
            sandbox.stub(CursorTestMapper, 'getTestNameFromPosition').resolves('test example');

            const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();
            sandbox.stub(executor, 'waitForDebugSession').resolves(mockSession);

            const result = await executor.debugTestAtCursor(
                '/path/to/test.py',
                10,
                1,
                5000
            );

            // Verify command was called
            assert.isTrue(executeCommandStub.calledWith('testing.debugAtCursor'));

            // Verify result
            assert.strictEqual(result.sessionId, 'session-456');
            assert.strictEqual(result.testName, 'test example');
            assert.strictEqual(result.framework, 'jest');
        });
    });

    describe('waitForDebugSession', () => {
        it('should resolve when debug session starts', async () => {
            const mockSession = {
                id: 'session-789',
                name: 'Debug Session'
            } as vscode.DebugSession;

            // Create a mock event emitter
            const eventEmitter = new vscode.EventEmitter<vscode.DebugSession>();
            sandbox.stub(vscode.debug, 'onDidStartDebugSession').returns(eventEmitter.event);

            // Start waiting for session
            const sessionPromise = executor.waitForDebugSession(5000);

            // Emit session start event after a delay
            setTimeout(() => {
                eventEmitter.fire(mockSession);
            }, 100);

            // Wait and verify
            const result = await sessionPromise;
            assert.strictEqual(result.id, 'session-789');
        });

        it('should reject with TIMEOUT error when session does not start', async () => {
            // Create a mock event emitter that never fires
            const eventEmitter = new vscode.EventEmitter<vscode.DebugSession>();
            sandbox.stub(vscode.debug, 'onDidStartDebugSession').returns(eventEmitter.event);

            try {
                await executor.waitForDebugSession(100); // Short timeout
                assert.fail('Should have thrown timeout error');
            } catch (error) {
                assert.strictEqual((error as Error).message, TestExecutorError.TIMEOUT);
            }
        });
    });

    describe('isDebugAtCursorAvailable', () => {
        it('should return true when command is available', async () => {
            sandbox.stub(vscode.commands, 'getCommands').resolves([
                'testing.debugAtCursor',
                'testing.runAtCursor'
            ]);

            const result = await TestExecutor.isDebugAtCursorAvailable();
            assert.isTrue(result);
        });

        it('should return false when command is not available', async () => {
            sandbox.stub(vscode.commands, 'getCommands').resolves([
                'editor.action.formatDocument',
                'workbench.action.files.save'
            ]);

            const result = await TestExecutor.isDebugAtCursorAvailable();
            assert.isFalse(result);
        });
    });

    describe('getActiveDebugSession', () => {
        it('should return active debug session', () => {
            const mockSession = {
                id: 'active-session',
                name: 'Active Debug'
            } as vscode.DebugSession;

            sandbox.stub(vscode.debug, 'activeDebugSession').value(mockSession);

            const result = TestExecutor.getActiveDebugSession();
            assert.strictEqual(result?.id, 'active-session');
        });

        it('should return undefined when no active session', () => {
            sandbox.stub(vscode.debug, 'activeDebugSession').value(undefined);

            const result = TestExecutor.getActiveDebugSession();
            assert.isUndefined(result);
        });
    });

    describe('stopDebugSession', () => {
        it('should stop active debug session', async () => {
            const mockSession = {
                id: 'session-to-stop',
                name: 'Debug Session'
            } as vscode.DebugSession;

            sandbox.stub(vscode.debug, 'activeDebugSession').value(mockSession);
            const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();

            await TestExecutor.stopDebugSession();

            assert.isTrue(executeCommandStub.calledWith('workbench.action.debug.stop'));
        });

        it('should stop specific session by ID', async () => {
            const mockSession = {
                id: 'session-123',
                name: 'Debug Session'
            } as vscode.DebugSession;

            sandbox.stub(vscode.debug, 'activeDebugSession').value(mockSession);
            const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();

            await TestExecutor.stopDebugSession('session-123');

            assert.isTrue(executeCommandStub.calledWith('workbench.action.debug.stop'));
        });

        it('should not stop if session ID does not match', async () => {
            const mockSession = {
                id: 'session-123',
                name: 'Debug Session'
            } as vscode.DebugSession;

            sandbox.stub(vscode.debug, 'activeDebugSession').value(mockSession);
            const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();

            await TestExecutor.stopDebugSession('different-session');

            assert.isFalse(executeCommandStub.called);
        });
    });

    describe('cleanup', () => {
        it('should dispose all resources', () => {
            // Create mock disposables
            const disposable1 = { dispose: sandbox.stub() };
            const disposable2 = { dispose: sandbox.stub() };

            // Add disposables to executor
            (executor as any).disposables = [disposable1, disposable2];

            // Call cleanup
            executor.cleanup();

            // Verify disposables were called
            assert.isTrue(disposable1.dispose.calledOnce);
            assert.isTrue(disposable2.dispose.calledOnce);
            assert.strictEqual((executor as any).disposables.length, 0);
        });

        it('should handle disposal errors gracefully', () => {
            // Create mock disposable that throws
            const errorDisposable = {
                dispose: sandbox.stub().throws(new Error('Disposal error'))
            };
            const normalDisposable = { dispose: sandbox.stub() };

            // Add disposables to executor
            (executor as any).disposables = [errorDisposable, normalDisposable];

            // Call cleanup - should not throw
            assert.doesNotThrow(() => executor.cleanup());

            // Verify both were attempted
            assert.isTrue(errorDisposable.dispose.calledOnce);
            assert.isTrue(normalDisposable.dispose.calledOnce);
        });
    });
});