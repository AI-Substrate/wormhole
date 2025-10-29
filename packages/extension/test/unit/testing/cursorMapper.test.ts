import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CursorTestMapper } from '../../../src/core/testing/cursor-mapper';
import { TestDiscovery } from '../../../src/core/testing/discovery';

describe('CursorTestMapper', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('findTestAtCursor', () => {
        it('should find test at cursor position', async () => {
            // Create mock document and position
            const mockDocument = {
                uri: vscode.Uri.file('/path/to/test.py'),
                lineAt: (line: number) => ({
                    text: 'def test_example():'
                })
            } as vscode.TextDocument;

            const mockPosition = new vscode.Position(10, 5);

            // Create mock test item
            const mockTestItem = {
                id: 'test_example',
                label: 'test_example',
                uri: mockDocument.uri,
                range: new vscode.Range(10, 0, 15, 0)
            } as vscode.TestItem;

            // Stub TestDiscovery methods
            const getTestStub = sandbox.stub(TestDiscovery, 'getTestAtPosition')
                .resolves(mockTestItem);

            // Call the method
            const result = await CursorTestMapper.findTestAtCursor(
                mockDocument,
                mockPosition,
                false // Don't refresh
            );

            // Verify
            assert.strictEqual(result, mockTestItem);
            assert.isTrue(getTestStub.calledOnce);
            assert.isTrue(getTestStub.calledWith(mockDocument, mockPosition));
        });

        it('should refresh discovery if test not found initially', async () => {
            const mockDocument = {
                uri: vscode.Uri.file('/path/to/test.py')
            } as vscode.TextDocument;
            const mockPosition = new vscode.Position(10, 5);
            const mockTestItem = {
                id: 'test_example',
                label: 'test_example'
            } as vscode.TestItem;

            // Stub methods
            const getTestStub = sandbox.stub(TestDiscovery, 'getTestAtPosition');
            getTestStub.onFirstCall().resolves(null); // First call returns null
            getTestStub.onSecondCall().resolves(mockTestItem); // After refresh returns test

            const refreshStub = sandbox.stub(TestDiscovery, 'refreshTests')
                .resolves(true);
            const waitStub = sandbox.stub(TestDiscovery, 'waitForTestDiscovery')
                .resolves(true);

            // Call with refresh enabled
            const result = await CursorTestMapper.findTestAtCursor(
                mockDocument,
                mockPosition,
                true
            );

            // Verify
            assert.strictEqual(result, mockTestItem);
            assert.isTrue(refreshStub.calledOnce);
            assert.isTrue(waitStub.calledOnce);
            assert.isTrue(getTestStub.calledTwice);
        });

        it('should return null if no test found even after refresh', async () => {
            const mockDocument = {
                uri: vscode.Uri.file('/path/to/file.py')
            } as vscode.TextDocument;
            const mockPosition = new vscode.Position(10, 5);

            // Stub to always return null
            sandbox.stub(TestDiscovery, 'getTestAtPosition').resolves(null);
            sandbox.stub(TestDiscovery, 'refreshTests').resolves(true);
            sandbox.stub(TestDiscovery, 'waitForTestDiscovery').resolves(true);

            const result = await CursorTestMapper.findTestAtCursor(
                mockDocument,
                mockPosition,
                true
            );

            assert.isNull(result);
        });
    });

    describe('waitForTestDiscovery', () => {
        it('should trigger refresh and wait for discovery', async () => {
            const mockUri = vscode.Uri.file('/path/to/test.py');

            const refreshStub = sandbox.stub(TestDiscovery, 'refreshTests')
                .resolves(true);
            const waitStub = sandbox.stub(TestDiscovery, 'waitForTestDiscovery')
                .resolves(true);

            const result = await CursorTestMapper.waitForTestDiscovery(
                mockUri,
                3000
            );

            assert.isTrue(result);
            assert.isTrue(refreshStub.calledWith(mockUri));
            assert.isTrue(waitStub.calledWith(3000));
        });

        it('should return false if refresh fails', async () => {
            const mockUri = vscode.Uri.file('/path/to/test.py');

            sandbox.stub(TestDiscovery, 'refreshTests').resolves(false);

            const result = await CursorTestMapper.waitForTestDiscovery(
                mockUri,
                3000
            );

            assert.isFalse(result);
        });
    });

    describe('getTestNameFromPosition', () => {
        it('should delegate to TestDiscovery', async () => {
            const mockDocument = {} as vscode.TextDocument;
            const mockPosition = new vscode.Position(10, 5);

            const getNameStub = sandbox.stub(TestDiscovery, 'getTestNameAtPosition')
                .resolves('test_example');

            const result = await CursorTestMapper.getTestNameFromPosition(
                mockDocument,
                mockPosition
            );

            assert.strictEqual(result, 'test_example');
            assert.isTrue(getNameStub.calledWith(mockDocument, mockPosition));
        });
    });

    describe('isInTestFile', () => {
        it('should identify test files correctly', () => {
            const mockDocument = {
                uri: vscode.Uri.file('/path/to/test_example.py')
            } as vscode.TextDocument;

            const isTestStub = sandbox.stub(TestDiscovery, 'isTestFile')
                .returns(true);

            const result = CursorTestMapper.isInTestFile(mockDocument);

            assert.isTrue(result);
            assert.isTrue(isTestStub.calledWith('/path/to/test_example.py'));
        });

        it('should identify non-test files', () => {
            const mockDocument = {
                uri: vscode.Uri.file('/path/to/main.py')
            } as vscode.TextDocument;

            sandbox.stub(TestDiscovery, 'isTestFile').returns(false);

            const result = CursorTestMapper.isInTestFile(mockDocument);

            assert.isFalse(result);
        });
    });

    describe('getAllTestsInDocument', () => {
        it('should collect all tests from document', async () => {
            const mockUri = vscode.Uri.file('/path/to/test.py');
            const mockDocument = {
                uri: mockUri
            } as vscode.TextDocument;

            // Create mock test items
            const test1 = {
                id: 'test1',
                uri: mockUri,
                children: {
                    size: 0,
                    forEach: () => {}
                }
            } as any as vscode.TestItem;

            const test2 = {
                id: 'test2',
                uri: mockUri,
                children: {
                    size: 0,
                    forEach: () => {}
                }
            } as any as vscode.TestItem;

            // Create mock controller
            const mockController = {
                items: {
                    forEach: (callback: (item: vscode.TestItem) => void) => {
                        callback(test1);
                        callback(test2);
                    }
                }
            } as any as vscode.TestController;

            // Stub getAvailableTestControllers
            sandbox.stub(TestDiscovery, 'getAvailableTestControllers')
                .returns([mockController]);

            // Mock vscode.tests
            const originalTests = vscode.tests;
            (vscode as any).tests = {};

            const result = await CursorTestMapper.getAllTestsInDocument(mockDocument);

            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].id, 'test1');
            assert.strictEqual(result[1].id, 'test2');

            // Restore
            (vscode as any).tests = originalTests;
        });

        it('should return empty array when no Testing API', async () => {
            const mockDocument = {} as vscode.TextDocument;

            const originalTests = vscode.tests;
            (vscode as any).tests = undefined;

            const result = await CursorTestMapper.getAllTestsInDocument(mockDocument);

            assert.strictEqual(result.length, 0);

            (vscode as any).tests = originalTests;
        });
    });

    describe('findNearestTest', () => {
        it('should find closest test to cursor', async () => {
            const mockUri = vscode.Uri.file('/path/to/test.py');
            const mockDocument = {
                uri: mockUri
            } as vscode.TextDocument;

            const test1 = {
                id: 'test1',
                uri: mockUri,
                range: new vscode.Range(5, 0, 10, 0),
                children: {
                    size: 0,
                    forEach: () => {}
                }
            } as any as vscode.TestItem;

            const test2 = {
                id: 'test2',
                uri: mockUri,
                range: new vscode.Range(15, 0, 20, 0),
                children: {
                    size: 0,
                    forEach: () => {}
                }
            } as any as vscode.TestItem;

            // Stub getAllTestsInDocument
            sandbox.stub(CursorTestMapper, 'getAllTestsInDocument')
                .resolves([test1, test2]);

            // Position closer to test1
            const position1 = new vscode.Position(8, 0);
            const result1 = await CursorTestMapper.findNearestTest(mockDocument, position1);
            assert.strictEqual(result1?.id, 'test1');

            // Position closer to test2
            const position2 = new vscode.Position(17, 0);
            const result2 = await CursorTestMapper.findNearestTest(mockDocument, position2);
            assert.strictEqual(result2?.id, 'test2');
        });

        it('should return null when no tests in document', async () => {
            const mockDocument = {} as vscode.TextDocument;
            const mockPosition = new vscode.Position(10, 0);

            sandbox.stub(CursorTestMapper, 'getAllTestsInDocument')
                .resolves([]);

            const result = await CursorTestMapper.findNearestTest(
                mockDocument,
                mockPosition
            );

            assert.isNull(result);
        });
    });

    describe('createTestRunRequest', () => {
        it('should create debug run request', () => {
            const mockTestItem = {
                id: 'test1'
            } as vscode.TestItem;

            const request = CursorTestMapper.createTestRunRequest(mockTestItem, true);

            assert.instanceOf(request, vscode.TestRunRequest);
            assert.deepEqual(request.include, [mockTestItem]);
            assert.isUndefined(request.exclude);
            assert.isUndefined(request.profile);
        });

        it('should create regular run request', () => {
            const mockTestItem = {
                id: 'test1'
            } as vscode.TestItem;

            const request = CursorTestMapper.createTestRunRequest(mockTestItem, false);

            assert.instanceOf(request, vscode.TestRunRequest);
            assert.deepEqual(request.include, [mockTestItem]);
        });
    });

    describe('getParentTestSuite', () => {
        it('should return parent test item', () => {
            const mockParent = {
                id: 'suite1'
            } as vscode.TestItem;

            const mockTestItem = {
                id: 'test1',
                parent: mockParent
            } as vscode.TestItem;

            const result = CursorTestMapper.getParentTestSuite(mockTestItem);

            assert.strictEqual(result, mockParent);
        });

        it('should return undefined for root test', () => {
            const mockTestItem = {
                id: 'test1',
                parent: undefined
            } as vscode.TestItem;

            const result = CursorTestMapper.getParentTestSuite(mockTestItem);

            assert.isUndefined(result);
        });
    });

    describe('getTestFramework', () => {
        it('should detect test framework from workspace', async () => {
            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.py')
            } as vscode.TextDocument;

            const mockWorkspaceFolder = {
                uri: vscode.Uri.file('/workspace'),
                name: 'workspace',
                index: 0
            } as vscode.WorkspaceFolder;

            sandbox.stub(vscode.workspace, 'getWorkspaceFolder')
                .returns(mockWorkspaceFolder);
            sandbox.stub(TestDiscovery, 'getTestFramework')
                .resolves('pytest');

            const result = await CursorTestMapper.getTestFramework(mockDocument);

            assert.strictEqual(result, 'pytest');
        });

        it('should return unknown when no workspace folder', async () => {
            const mockDocument = {
                uri: vscode.Uri.file('/tmp/test.py')
            } as vscode.TextDocument;

            sandbox.stub(vscode.workspace, 'getWorkspaceFolder')
                .returns(undefined);

            const result = await CursorTestMapper.getTestFramework(mockDocument);

            assert.strictEqual(result, 'unknown');
        });
    });
});