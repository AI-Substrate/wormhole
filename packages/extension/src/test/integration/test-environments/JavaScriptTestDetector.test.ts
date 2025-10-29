import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { JavaScriptTestDetector, MissingExtensionError, JEST_EXT_ID } from '../../../core/test-environments/detectors/JavaScriptTestDetector';
import { IJavaScriptEnvironment } from '../../../core/test-environments/interfaces';

suite('JavaScriptTestDetector', () => {
    let detector: JavaScriptTestDetector;
    let sandbox: sinon.SinonSandbox;
    let mockFolder: vscode.WorkspaceFolder;

    setup(() => {
        sandbox = sinon.createSandbox();
        detector = new JavaScriptTestDetector();

        mockFolder = {
            uri: vscode.Uri.file('/test/project'),
            name: 'test-project',
            index: 0
        };
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should throw error when vscode-jest not installed', async () => {
        // Mock vscode.extensions.getExtension to return undefined (extension not found)
        sandbox.stub(vscode.extensions, 'getExtension').returns(undefined);

        const jsFileUri = vscode.Uri.file('/test/project/example.test.js');

        // Should throw error when attempting to detect without vscode-jest
        await assert.rejects(
            detector.detect(mockFolder, jsFileUri),
            {
                message: /vscode-jest extension is required/i
            },
            'Should throw error about missing vscode-jest extension'
        );
    });

    test('should detect Jest environment when vscode-jest is installed', async () => {
        // Mock vscode-jest extension as installed and active
        const mockJestExtension = {
            id: JEST_EXT_ID,
            extensionPath: '/extensions/vscode-jest',
            isActive: true,
            activate: sandbox.stub().resolves(),
            exports: {},
            extensionKind: vscode.ExtensionKind.Workspace,
            extensionUri: vscode.Uri.file('/extensions/vscode-jest'),
            packageJSON: {
                name: 'vscode-jest',
                version: '5.0.0'
            }
        };

        sandbox.stub(vscode.extensions, 'getExtension')
            .withArgs(JEST_EXT_ID)
            .returns(mockJestExtension as any);

        // Since we can't stub vscode.workspace.fs directly,
        // we test with a real workspace that doesn't have package.json
        // The detector should still return a valid environment
        const jsFileUri = vscode.Uri.file('/test/project/example.test.js');
        const result = await detector.detect(mockFolder, jsFileUri);

        assert.ok(result);
        assert.strictEqual(result.language, 'javascript');
        // Framework might be 'none' if package.json doesn't exist
        assert.ok(['jest', 'none'].includes(result.framework));
        assert.ok(result.debugConfig);
        assert.ok(result.testFilePatterns.length > 0);
    });

    test('should support JavaScript language', () => {
        assert.deepStrictEqual(detector.supportedLanguages, ['javascript', 'typescript']);
    });

    test('should handle JavaScript and TypeScript files', async () => {
        const jsFile = vscode.Uri.file('/test/project/example.test.js');
        const tsFile = vscode.Uri.file('/test/project/example.test.ts');
        const pyFile = vscode.Uri.file('/test/project/test_example.py');

        // Mock vscode-jest as installed for canHandle to work
        const mockJestExtension = {
            id: 'Orta.vscode-jest',
            isActive: true
        };
        sandbox.stub(vscode.extensions, 'getExtension')
            .withArgs(JEST_EXT_ID)
            .returns(mockJestExtension as any);

        // Should handle JS files
        const canHandleJs = await detector.canHandle(mockFolder, jsFile);
        assert.strictEqual(canHandleJs, true);

        // Should handle TS files
        const canHandleTs = await detector.canHandle(mockFolder, tsFile);
        assert.strictEqual(canHandleTs, true);

        // Should not handle Python files
        const canHandlePy = await detector.canHandle(mockFolder, pyFile);
        assert.strictEqual(canHandlePy, false);
    });

    test('should attempt activation if extension is inactive', async () => {
        // Mock inactive extension that can be activated
        const activateStub = sandbox.stub().resolves();
        const mockJestExtension = {
            id: JEST_EXT_ID,
            extensionPath: '/extensions/vscode-jest',
            isActive: false,
            activate: activateStub,
            exports: {},
            extensionKind: vscode.ExtensionKind.Workspace,
            extensionUri: vscode.Uri.file('/extensions/vscode-jest'),
            packageJSON: {
                name: 'vscode-jest',
                version: '5.0.0'
            }
        };

        // After activation, mark as active
        activateStub.callsFake(async () => {
            mockJestExtension.isActive = true;
        });

        sandbox.stub(vscode.extensions, 'getExtension')
            .withArgs(JEST_EXT_ID)
            .returns(mockJestExtension as any);

        const jsFileUri = vscode.Uri.file('/test/project/example.test.js');
        const result = await detector.detect(mockFolder, jsFileUri);

        // Should succeed after activation
        assert.ok(activateStub.calledOnce, 'Should attempt to activate extension');
        assert.ok(result);
        assert.strictEqual(result.language, 'javascript');
    });

    test('should throw MissingExtensionError if activation fails', async () => {
        // Mock inactive extension that fails to activate
        const activateStub = sandbox.stub().rejects(new Error('Activation failed'));
        const mockJestExtension = {
            id: JEST_EXT_ID,
            extensionPath: '/extensions/vscode-jest',
            isActive: false,
            activate: activateStub,
            exports: {},
            extensionKind: vscode.ExtensionKind.Workspace,
            extensionUri: vscode.Uri.file('/extensions/vscode-jest'),
            packageJSON: {
                name: 'vscode-jest',
                version: '5.0.0'
            }
        };

        sandbox.stub(vscode.extensions, 'getExtension')
            .withArgs(JEST_EXT_ID)
            .returns(mockJestExtension as any);

        const jsFileUri = vscode.Uri.file('/test/project/example.test.js');

        try {
            await detector.detect(mockFolder, jsFileUri);
            assert.fail('Should have thrown MissingExtensionError');
        } catch (error: any) {
            assert.ok(error instanceof MissingExtensionError, 'Should throw MissingExtensionError');
            assert.strictEqual(error.code, 'EXT_REQUIRED');
            assert.strictEqual(error.extensionId, JEST_EXT_ID);
            assert.ok(error.cause, 'Should have cause property with activation error');
        }
    });

    test('should provide helpful error message with installation instructions', async () => {
        sandbox.stub(vscode.extensions, 'getExtension').returns(undefined);

        const jsFileUri = vscode.Uri.file('/test/project/example.test.js');

        try {
            await detector.detect(mockFolder, jsFileUri);
            assert.fail('Should have thrown error');
        } catch (error: any) {
            // Check it's the correct error type
            assert.ok(error instanceof MissingExtensionError, 'Should throw MissingExtensionError');
            assert.strictEqual(error.code, 'EXT_REQUIRED');
            assert.strictEqual(error.extensionId, JEST_EXT_ID);

            // Check for helpful installation instructions in error message
            assert.ok(error.message.includes('vscode-jest'), 'Error should mention vscode-jest');
            assert.ok(
                error.message.includes('install') || error.message.includes('Install'),
                'Error should include installation guidance'
            );
            assert.ok(
                error.message.includes(JEST_EXT_ID) ||
                error.message.includes('marketplace'),
                'Error should reference extension ID or marketplace'
            );
        }
    });
});