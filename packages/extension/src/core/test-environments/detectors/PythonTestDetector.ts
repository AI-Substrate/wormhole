import * as vscode from 'vscode';
import { ITestEnvironmentDetector, IPythonEnvironment } from '../interfaces';
import {
    detectFrameworkOnDisk,
    buildDebugConfig,
    getConfidence,
    findMarkers
} from '../../python/detect';
import { VSCodeFSAdapter } from '../../python/fs-adapter';

/**
 * Python test environment detector implementing the new interface
 * Refactored from PythonEnvDetectorSimple to maintain backward compatibility
 */
export class PythonTestDetector implements ITestEnvironmentDetector<IPythonEnvironment> {
    readonly supportedLanguages = ['python'];

    /**
     * Check if this detector can handle the given context
     */
    async canHandle(folder: vscode.WorkspaceFolder, file?: vscode.Uri): Promise<boolean> {
        // If a file is provided, check if it's a Python file
        if (file) {
            const ext = file.path.split('.').pop()?.toLowerCase();
            if (ext !== 'py') {
                return false;
            }
        }

        // Check for Python project markers
        const adapter = new VSCodeFSAdapter(vscode);
        const markers = await findMarkers(folder.uri.fsPath, adapter);

        // Can handle if we find any Python test markers
        return markers.length > 0;
    }

    /**
     * Detect Python test environment
     */
    async detect(folder: vscode.WorkspaceFolder, file?: vscode.Uri): Promise<IPythonEnvironment> {
        const adapter = new VSCodeFSAdapter(vscode);

        try {
            // Use the pure function to detect framework
            const framework = await detectFrameworkOnDisk(folder.uri.fsPath, adapter);

            // Find markers for confidence and reasons
            const markers = await findMarkers(folder.uri.fsPath, adapter);
            const confidence = getConfidence(framework, markers);

            // Build reasons from markers
            const reasons: string[] = [];
            const configFiles: string[] = [];

            if (markers.includes('pytest.ini')) {
                reasons.push('Found pytest.ini');
                configFiles.push('pytest.ini');
            }
            if (markers.includes('conftest.py')) {
                reasons.push('Found conftest.py');
                configFiles.push('conftest.py');
            }
            if (markers.includes('setup.cfg')) {
                reasons.push('Found setup.cfg');
                configFiles.push('setup.cfg');
            }
            if (markers.includes('pyproject.toml')) {
                reasons.push('Found pyproject.toml');
                configFiles.push('pyproject.toml');
            }
            if (markers.includes('tests')) {
                reasons.push('Found tests directory');
            }

            // Get relative path if file provided
            let testPath: string | undefined;
            if (file) {
                testPath = vscode.workspace.asRelativePath(file, false);
            }

            // Build debug configuration
            const debugConfig = buildDebugConfig(framework, folder.uri.fsPath, testPath);

            // Try to get Python interpreter path from Python extension
            let interpreterPath: string | undefined;
            try {
                const pythonExt = vscode.extensions.getExtension('ms-python.python');
                if (pythonExt?.exports?.environments?.getActiveEnvironmentPath) {
                    const envPath = pythonExt.exports.environments.getActiveEnvironmentPath(folder.uri);
                    if (envPath?.path) {
                        interpreterPath = envPath.path;
                    }
                }
            } catch {
                // Python extension not available or API changed
            }

            // Determine test file patterns based on framework
            const testFilePatterns = this.getTestFilePatterns(framework);

            return {
                language: 'python',
                framework: framework as IPythonEnvironment['framework'],
                confidence,
                reasons,
                projectRoot: folder.uri.fsPath,
                cwd: folder.uri.fsPath,  // Set cwd for compatibility
                testFilePatterns,
                debugConfig,
                interpreterPath,
                configFiles
            };
        } catch (error) {
            // Handle detection errors gracefully
            return {
                language: 'python',
                framework: 'none',
                confidence: 0.1,
                reasons: [],
                projectRoot: folder.uri.fsPath,
                cwd: folder.uri.fsPath,  // Set cwd for compatibility
                testFilePatterns: this.getTestFilePatterns('none'),
                debugConfig: {
                    type: 'python',
                    name: 'Debug Python Test',
                    request: 'launch'
                },
                configFiles: []
            };
        }
    }

    /**
     * Get file patterns to watch for cache invalidation
     */
    watchGlobs(): string[] {
        return [
            '**/pytest.ini',
            '**/pyproject.toml',
            '**/setup.cfg',
            '**/conftest.py',
            '**/tox.ini',
            '**/.coveragerc'
        ];
    }

    /**
     * Quick scoring for monorepo routing
     */
    quickScore(filePath: string): number {
        const lower = filePath.toLowerCase();

        // High score for Python files
        if (lower.endsWith('.py')) return 0.9;

        // Medium score for Python-related paths
        if (lower.includes('/python/') || lower.includes('/backend/')) return 0.7;
        if (lower.includes('pytest') || lower.includes('unittest')) return 0.8;

        // Low score for non-Python files
        if (lower.endsWith('.js') || lower.endsWith('.ts')) return 0.1;

        return 0.5; // Neutral score
    }

    /**
     * Get test file patterns based on framework
     */
    private getTestFilePatterns(framework: string): string[] {
        switch (framework) {
            case 'pytest':
                return [
                    '**/test_*.py',
                    '**/*_test.py',
                    '**/tests/**/*.py'
                ];
            case 'unittest':
                return [
                    '**/test_*.py',
                    '**/tests/**/*.py'
                ];
            case 'nose2':
                return [
                    '**/test_*.py',
                    '**/*_test.py',
                    '**/tests/**/*.py'
                ];
            default:
                return [
                    '**/test_*.py',
                    '**/*_test.py',
                    '**/tests/**/*.py'
                ];
        }
    }
}