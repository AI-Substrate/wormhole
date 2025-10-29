import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Helper module for test discovery and interaction with VS Code Testing API
 */
export class TestDiscovery {
    /**
     * Refresh test discovery for all or specific workspace
     * @param uri Optional URI to refresh tests for specific file/folder
     */
    static async refreshTests(uri?: vscode.Uri): Promise<boolean> {
        try {
            if (uri) {
                await vscode.commands.executeCommand('testing.refreshTests', uri);
            } else {
                await vscode.commands.executeCommand('testing.refreshTests');
            }
            return true;
        } catch (error) {
            console.error('Failed to refresh tests:', error);
            return false;
        }
    }

    /**
     * Wait for test discovery to complete
     * @param timeoutMs Maximum time to wait for discovery
     */
    static async waitForTestDiscovery(timeoutMs: number = 5000): Promise<boolean> {
        return new Promise((resolve) => {
            let disposable: vscode.Disposable | undefined;
            const timeout = setTimeout(() => {
                if (disposable) {
                    disposable.dispose();
                }
                resolve(false);
            }, timeoutMs);

            // Listen for test changes which indicate discovery activity
            // Note: VS Code doesn't expose onDidChangeTests directly
            // We'll use a different approach - wait a bit after refresh
            setTimeout(() => {
                clearTimeout(timeout);
                resolve(true);
            }, 500); // Give tests time to discover
        });
    }

    /**
     * Get test item at specific position in document
     * @param document The document to search in
     * @param position The cursor position
     */
    static async getTestAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.TestItem | null> {
        if (!vscode.tests) {
            return null;
        }

        // Get all test controllers
        const controllers = this.getAvailableTestControllers();

        for (const controller of controllers) {
            const testItem = this.findTestItemAtPosition(
                controller.items,
                document.uri,
                position
            );

            if (testItem) {
                return testItem;
            }
        }

        return null;
    }

    /**
     * Recursively find test item at position
     */
    private static findTestItemAtPosition(
        collection: vscode.TestItemCollection,
        uri: vscode.Uri,
        position: vscode.Position
    ): vscode.TestItem | null {
        const items: vscode.TestItem[] = [];
        collection.forEach(item => items.push(item));

        for (const item of items) {
            // Check if this item matches the URI and contains the position
            if (item.uri?.fsPath === uri.fsPath && item.range) {
                if (item.range.contains(position)) {
                    // Check children first for more specific match
                    if (item.children.size > 0) {
                        const childMatch = this.findTestItemAtPosition(
                            item.children,
                            uri,
                            position
                        );
                        if (childMatch) {
                            return childMatch;
                        }
                    }
                    // Return this item if no child matches
                    return item;
                }
            }

            // Recursively check children even if parent doesn't match
            if (item.children.size > 0) {
                const childMatch = this.findTestItemAtPosition(
                    item.children,
                    uri,
                    position
                );
                if (childMatch) {
                    return childMatch;
                }
            }
        }

        return null;
    }

    /**
     * Get all available test controllers
     */
    static getAvailableTestControllers(): vscode.TestController[] {
        if (!vscode.tests) {
            return [];
        }

        // Note: VS Code doesn't expose a direct way to get all controllers
        // This is a workaround that may need adjustment based on VS Code API
        // In practice, we might need to track controllers as they're created
        const controllers: vscode.TestController[] = [];

        // Try to access controllers through workspace state or extension API
        // This is a placeholder - actual implementation depends on VS Code API

        return controllers;
    }

    /**
     * Check if a file is a test file based on naming conventions
     * @param filePath The file path to check
     */
    static isTestFile(filePath: string): boolean {
        const basename = path.basename(filePath);
        const testPatterns = [
            // Python patterns
            /^test_.*\.py$/,
            /.*_test\.py$/,
            /^test.*\.py$/,

            // JavaScript/TypeScript patterns
            /.*\.test\.[jt]sx?$/,
            /.*\.spec\.[jt]sx?$/,
            /__tests__\/.*\.[jt]sx?$/,

            // C# patterns
            /.*Tests?\.(cs|vb)$/,
            /.*\.Tests?\.(cs|vb)$/,

            // Java patterns
            /.*Test\.java$/,
            /Test.*\.java$/,

            // Go patterns
            /.*_test\.go$/,

            // Rust patterns
            /.*_test\.rs$/
        ];

        return testPatterns.some(pattern => pattern.test(basename));
    }

    /**
     * Detect test framework from workspace configuration
     * @param workspaceFolder The workspace folder to check
     * @param fileUri Optional file URI to determine relevant framework based on file extension
     */
    static async getTestFramework(workspaceFolder: vscode.WorkspaceFolder, fileUri?: vscode.Uri): Promise<string> {
        const workspacePath = workspaceFolder.uri.fsPath;

        // If file URI provided, check extension first to limit framework search
        if (fileUri) {
            const ext = path.extname(fileUri.fsPath).toLowerCase();

            // JavaScript/TypeScript files - only check JS frameworks
            if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
                return await this.detectJavaScriptFramework(workspacePath, fileUri);
            }

            // Python files - only check Python frameworks
            if (ext === '.py') {
                return await this.detectPythonFramework(workspaceFolder, workspacePath);
            }

            // C# files - only check .NET frameworks
            if (ext === '.cs') {
                return await this.detectDotNetFramework(workspaceFolder);
            }

            // Go files
            if (ext === '.go') {
                const goModPath = path.join(workspacePath, 'go.mod');
                if (fs.existsSync(goModPath)) {
                    return 'go-test';
                }
            }

            // Rust files
            if (ext === '.rs') {
                const cargoTomlPath = path.join(workspacePath, 'Cargo.toml');
                if (fs.existsSync(cargoTomlPath)) {
                    return 'cargo-test';
                }
            }

            // Unknown file extension
            return 'unknown';
        }

        // No file provided - do workspace-wide detection (legacy behavior)
        // Check in order: Python → JavaScript → .NET → Go → Rust

        const pythonFramework = await this.detectPythonFramework(workspaceFolder, workspacePath);
        if (pythonFramework !== 'unknown') return pythonFramework;

        const jsFramework = await this.detectJavaScriptFramework(workspacePath);
        if (jsFramework !== 'unknown') return jsFramework;

        const dotnetFramework = await this.detectDotNetFramework(workspaceFolder);
        if (dotnetFramework !== 'unknown') return dotnetFramework;

        const goModPath = path.join(workspacePath, 'go.mod');
        if (fs.existsSync(goModPath)) {
            return 'go-test';
        }

        const cargoTomlPath = path.join(workspacePath, 'Cargo.toml');
        if (fs.existsSync(cargoTomlPath)) {
            return 'cargo-test';
        }

        return 'unknown';
    }

    /**
     * Detect Python test framework
     */
    private static async detectPythonFramework(workspaceFolder: vscode.WorkspaceFolder, workspacePath: string): Promise<string> {
        const pytestIni = path.join(workspacePath, 'pytest.ini');
        const pyprojectToml = path.join(workspacePath, 'pyproject.toml');
        const toxIni = path.join(workspacePath, 'tox.ini');
        const setupCfg = path.join(workspacePath, 'setup.cfg');

        if (fs.existsSync(pytestIni) || fs.existsSync(pyprojectToml) ||
            fs.existsSync(toxIni) || fs.existsSync(setupCfg)) {
            // Check if pytest is configured
            const pythonConfig = vscode.workspace.getConfiguration('python', workspaceFolder.uri);
            const testFramework = pythonConfig.get<string>('testing.pytestEnabled') ? 'pytest' :
                               pythonConfig.get<string>('testing.unittestEnabled') ? 'unittest' :
                               'pytest'; // Default to pytest
            return testFramework;
        }

        return 'unknown';
    }

    /**
     * Detect JavaScript test framework
     * Searches for nearest package.json starting from file directory
     */
    private static async detectJavaScriptFramework(workspacePath: string, fileUri?: vscode.Uri): Promise<string> {
        let searchPath = workspacePath;

        // If file URI provided, start search from file's directory
        if (fileUri) {
            searchPath = path.dirname(fileUri.fsPath);
        }

        // Search up from file directory to workspace root
        let currentPath = searchPath;
        while (currentPath.startsWith(workspacePath)) {
            const packageJsonPath = path.join(currentPath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

                    if (deps['jest'] || deps['@jest/core']) {
                        return 'jest';
                    }
                    if (deps['vitest']) {
                        return 'vitest';
                    }
                    if (deps['mocha']) {
                        return 'mocha';
                    }
                    if (deps['jasmine']) {
                        return 'jasmine';
                    }
                    if (deps['@playwright/test']) {
                        return 'playwright';
                    }
                    // Found package.json but no test framework - keep searching up
                } catch (error) {
                    console.error('Failed to parse package.json:', error);
                }
            }

            // Move up one directory
            const parentPath = path.dirname(currentPath);
            if (parentPath === currentPath) break; // Reached root
            currentPath = parentPath;
        }

        return 'unknown';
    }

    /**
     * Detect .NET test framework
     */
    private static async detectDotNetFramework(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
        const csprojFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceFolder, '**/*.csproj'),
            '**/node_modules/**',
            10
        );

        if (csprojFiles.length > 0) {
            // Could parse .csproj to detect xUnit, NUnit, MSTest
            return 'dotnet-test';
        }

        return 'unknown';
    }

    /**
     * Get test name from cursor position
     * This is a fallback when Testing API doesn't provide test items
     */
    static async getTestNameAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<string | null> {
        const line = document.lineAt(position.line).text;
        const language = document.languageId;

        // Language-specific test name extraction
        if (language === 'python') {
            // Match def test_name or async def test_name
            const match = line.match(/^\s*(?:async\s+)?def\s+(test_\w+)/);
            if (match) {
                return match[1];
            }
        } else if (language === 'javascript' || language === 'typescript') {
            // Match it('name'), test('name'), or describe('name')
            const match = line.match(/^\s*(?:it|test|describe)\s*\(\s*['"`]([^'"`]+)/);
            if (match) {
                return match[1];
            }
        } else if (language === 'csharp') {
            // Match [Test] or [Fact] attribute followed by method
            let lineNum = position.line;
            while (lineNum > 0) {
                const prevLine = document.lineAt(lineNum - 1).text;
                if (prevLine.match(/\[(?:Test|Fact|TestMethod)\]/)) {
                    const methodMatch = line.match(/^\s*public\s+(?:async\s+)?(?:Task\s+)?void\s+(\w+)/);
                    if (methodMatch) {
                        return methodMatch[1];
                    }
                    break;
                }
                lineNum--;
            }
        }

        return null;
    }

    /**
     * Check if VS Code Testing API is available
     */
    static isTestingApiAvailable(): boolean {
        return typeof vscode.tests !== 'undefined';
    }

    /**
     * Get workspace folder for a document
     */
    static getWorkspaceFolderForDocument(document: vscode.TextDocument): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.getWorkspaceFolder(document.uri);
    }

    /**
     * Execute testing.debugAtCursor command
     */
    static async debugTestAtCursor(): Promise<boolean> {
        try {
            await vscode.commands.executeCommand('testing.debugAtCursor');
            return true;
        } catch (error) {
            console.error('Failed to debug test at cursor:', error);
            return false;
        }
    }

    /**
     * Run test at cursor (without debugging)
     */
    static async runTestAtCursor(): Promise<boolean> {
        try {
            await vscode.commands.executeCommand('testing.runAtCursor');
            return true;
        } catch (error) {
            console.error('Failed to run test at cursor:', error);
            return false;
        }
    }
}