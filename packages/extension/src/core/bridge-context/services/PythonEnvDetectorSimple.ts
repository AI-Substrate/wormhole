import * as vscode from 'vscode';
import { IPythonEnvironment } from '../types';
import {
    detectFrameworkOnDisk,
    buildDebugConfig,
    getConfidence,
    findMarkers
} from '../../python/detect';
import { VSCodeFSAdapter } from '../../python/fs-adapter';

/**
 * Simplified Python environment detector.
 * Just a thin wrapper around the pure detection logic.
 */
export class PythonEnvDetectorSimple {
    /**
     * Detect Python test framework for a workspace folder.
     * Simple, fast, no complex abstractions.
     */
    async detect(
        folder: vscode.WorkspaceFolder,
        filePath?: vscode.Uri
    ): Promise<IPythonEnvironment> {
        // Use VSCode adapter for remote compatibility
        const adapter = new VSCodeFSAdapter(vscode);

        // Use the pure function to detect framework
        const framework = await detectFrameworkOnDisk(folder.uri.fsPath, adapter);


        // Find markers for confidence and reasons
        const markers = await findMarkers(folder.uri.fsPath, adapter);
        const confidence = getConfidence(framework, markers);

        // Build reasons from markers
        const reasons: string[] = [];
        if (markers.includes('pytest.ini')) reasons.push('Found pytest.ini');
        if (markers.includes('conftest.py')) reasons.push('Found conftest.py');
        if (markers.includes('setup.cfg')) reasons.push('Found setup.cfg');
        if (markers.includes('pyproject.toml')) reasons.push('Found pyproject.toml');
        if (markers.includes('tests')) reasons.push('Found tests directory');

        // Get relative path if file provided
        let testPath: string | undefined;
        if (filePath) {
            testPath = vscode.workspace.asRelativePath(filePath, false);
        }

        // Build debug configuration
        const debugConfig = buildDebugConfig(framework, folder.uri.fsPath, testPath);

        return {
            language: 'python',
            framework,
            confidence,
            reasons,
            cwd: folder.uri.fsPath,
            debugConfig
        };
    }

    /**
     * Detect with progress indicator (optional).
     */
    async detectWithProgress(folder: vscode.WorkspaceFolder): Promise<IPythonEnvironment> {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: 'Detecting Python test framework',
                cancellable: false
            },
            async () => this.detect(folder)
        );
    }
}