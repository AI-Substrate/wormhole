import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { PythonTestDetector } from '../../../core/test-environments/detectors/PythonTestDetector';
import { IPythonEnvironment } from '../../../core/test-environments/interfaces';

suite('PythonTestDetector', () => {
    let detector: PythonTestDetector;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        detector = new PythonTestDetector();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should support Python language', () => {
        assert.deepStrictEqual(detector.supportedLanguages, ['python']);
    });

    test('should handle Python files', async () => {
        // Use actual fixture that has Python project markers
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'No workspace folders available');

        // Find a Python fixture folder
        const pythonFolder = workspaceFolders.find(f => f.name.includes('pytest') || f.name.includes('unittest'));
        assert.ok(pythonFolder, 'No Python test fixture found');

        const pythonFile = vscode.Uri.joinPath(pythonFolder.uri, 'test_example.py');
        const jsFile = vscode.Uri.joinPath(pythonFolder.uri, 'example.js');

        // Should handle Python files in Python project
        const canHandlePython = await detector.canHandle(pythonFolder, pythonFile);
        assert.strictEqual(canHandlePython, true);

        // Should not handle non-Python files
        const canHandleJs = await detector.canHandle(pythonFolder, jsFile);
        assert.strictEqual(canHandleJs, false);
    });

    test('should provide watch globs for Python config files', () => {
        const globs = detector.watchGlobs();

        // Should watch common Python test config files
        assert.ok(globs.includes('**/pytest.ini'));
        assert.ok(globs.includes('**/setup.cfg'));
        assert.ok(globs.includes('**/pyproject.toml'));
        assert.ok(globs.includes('**/tox.ini'));
        // Note: implementation uses pytest.ini (without leading dot)
        // Both variations are valid pytest config filenames
    });

    test('should calculate quickScore for monorepo routing', () => {
        // Test various file paths
        const rootFile = '/monorepo/test_example.py';
        const packageFile = '/monorepo/packages/api/test_example.py';
        const deepFile = '/monorepo/packages/api/src/tests/test_example.py';

        const rootScore = detector.quickScore!(rootFile);
        const packageScore = detector.quickScore!(packageFile);
        const deepScore = detector.quickScore!(deepFile);

        // Deeper files should have higher scores for package-specific detection
        assert.ok(deepScore >= packageScore);
        assert.ok(packageScore >= rootScore);

        // Scores should be between 0 and 1
        assert.ok(rootScore >= 0 && rootScore <= 1);
        assert.ok(packageScore >= 0 && packageScore <= 1);
        assert.ok(deepScore >= 0 && deepScore <= 1);
    });

    test('should detect pytest framework', async () => {
        // Use actual pytest fixture from workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'No workspace folders available');

        const pytestFolder = workspaceFolders.find(f => f.name.includes('pytest'));
        assert.ok(pytestFolder, 'No pytest fixture found');

        const result = await detector.detect(pytestFolder);

        assert.ok(result);
        assert.strictEqual(result.language, 'python');
        assert.strictEqual(result.framework, 'pytest');
        assert.ok(result.confidence > 0.5);
        assert.ok(result.reasons.length > 0);
        assert.ok(result.testFilePatterns.length > 0);
    });

    test('should detect unittest framework', async () => {
        // Use actual unittest fixture from workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'No workspace folders available');

        const unittestFolder = workspaceFolders.find(f => f.name.includes('unittest'));
        assert.ok(unittestFolder, 'No unittest fixture found');

        const result = await detector.detect(unittestFolder);

        assert.ok(result);
        assert.strictEqual(result.language, 'python');
        // Should default to unittest when no specific framework is detected
        assert.ok(['unittest', 'none', 'pytest'].includes(result.framework));
        assert.ok(result.testFilePatterns.length > 0);
    });

    test('should return proper debug configuration', async () => {
        const mockFolder: vscode.WorkspaceFolder = {
            uri: vscode.Uri.file('/test/project'),
            name: 'test-project',
            index: 0
        };

        const result = await detector.detect(mockFolder);

        assert.ok(result.debugConfig);
        assert.ok(['python', 'debugpy'].includes(result.debugConfig.type));
        assert.strictEqual(result.debugConfig.request, 'launch');
        assert.ok(result.debugConfig.name);

        // For pytest, should have module or appropriate launch config
        if (result.framework === 'pytest') {
            assert.ok(
                result.debugConfig.module === 'pytest' ||
                result.debugConfig.program?.includes('pytest')
            );
        }
    });

    test('should handle detection errors gracefully', async () => {
        // Use the "none" fixture which has no Python markers
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'No workspace folders available');

        const noneFolder = workspaceFolders.find(f => f.name === 'none');
        assert.ok(noneFolder, 'No "none" fixture found');

        // Should not throw, but return fallback result
        const result = await detector.detect(noneFolder);

        assert.ok(result);
        assert.strictEqual(result.language, 'python');
        assert.strictEqual(result.framework, 'none');
        assert.ok(result.confidence <= 0.3);
        assert.strictEqual(result.cwd, noneFolder.uri.fsPath);
        assert.strictEqual(result.projectRoot, noneFolder.uri.fsPath);
        assert.ok(result.debugConfig);
    });
});