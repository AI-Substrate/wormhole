import * as vscode from 'vscode';
import { ITestEnvironmentDetector, IJavaScriptEnvironment } from '../interfaces';

/**
 * Extension ID for vscode-jest
 */
export const JEST_EXT_ID = 'Orta.vscode-jest' as const;

/**
 * Custom error for missing or inactive extensions
 */
export class MissingExtensionError extends Error {
    readonly code = 'EXT_REQUIRED';

    constructor(
        public readonly extensionId: string,
        message?: string,
        options?: { cause?: unknown }
    ) {
        super(message ?? `Extension required: ${extensionId}`, options);
        this.name = 'MissingExtensionError';
    }
}

/**
 * JavaScript/TypeScript test environment detector
 * Requires vscode-jest extension for Jest test discovery
 */
export class JavaScriptTestDetector implements ITestEnvironmentDetector<IJavaScriptEnvironment> {
    readonly supportedLanguages = ['javascript', 'typescript'];

    /**
     * Check if vscode-jest extension is available and active
     * Attempts to activate the extension if it's installed but inactive
     * @throws MissingExtensionError if extension is not installed or activation fails
     */
    private async checkJestExtension(): Promise<void> {
        const jestExt = vscode.extensions.getExtension(JEST_EXT_ID);

        if (!jestExt) {
            throw new MissingExtensionError(
                JEST_EXT_ID,
                'The vscode-jest extension is required for JavaScript test debugging.\n\n' +
                'Please install it from the VS Code marketplace:\n' +
                '1. Open Extensions view (Ctrl+Shift+X / Cmd+Shift+X)\n' +
                '2. Search for "Jest" by Orta\n' +
                '3. Install the extension (ID: Orta.vscode-jest)\n' +
                '4. Reload VS Code and try again\n\n' +
                'In tests/CI: ensure extensionDependencies includes "Orta.vscode-jest" in package.json'
            );
        }

        // Attempt to activate if not already active
        // Extension activation is lazy/event-driven - we need to force it
        if (!jestExt.isActive) {
            console.log(`[JavaScriptTestDetector] Activating ${JEST_EXT_ID}...`);
            try {
                await jestExt.activate();
                console.log(`[JavaScriptTestDetector] ✓ ${JEST_EXT_ID} activated successfully`);
            } catch (activationError) {
                throw new MissingExtensionError(
                    JEST_EXT_ID,
                    'The vscode-jest extension could not be activated.\n\n' +
                    'Please ensure:\n' +
                    '1. The extension is installed and enabled\n' +
                    '2. Your workspace contains a Jest configuration\n' +
                    '3. Try running "Jest: Start All Runners" command',
                    { cause: activationError }
                );
            }
        }
    }

    /**
     * Check if this detector can handle the given context
     */
    async canHandle(folder: vscode.WorkspaceFolder, file?: vscode.Uri): Promise<boolean> {
        // Check file extension if provided
        if (file) {
            const ext = file.path.split('.').pop()?.toLowerCase();
            if (!['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext || '')) {
                return false;
            }
        }

        // Check for vscode-jest extension (required for Jest support)
        // Don't throw error in canHandle - just return false if not available
        const jestExt = vscode.extensions.getExtension(JEST_EXT_ID);
        if (!jestExt) {
            return false; // Can't handle without vscode-jest
        }

        return true;
    }

    /**
     * Detect JavaScript test environment
     */
    async detect(folder: vscode.WorkspaceFolder, file?: vscode.Uri): Promise<IJavaScriptEnvironment> {
        // Check for vscode-jest extension and attempt activation
        await this.checkJestExtension();

        // Try to read package.json to determine framework
        let framework: IJavaScriptEnvironment['framework'] = 'none';
        let confidence = 0.1;
        const reasons: string[] = [];
        const jestConfigFiles: string[] = [];

        try {
            const packageJsonUri = vscode.Uri.joinPath(folder.uri, 'package.json');
            const packageJsonStat = await vscode.workspace.fs.stat(packageJsonUri);

            if (packageJsonStat.type === vscode.FileType.File) {
                const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonUri);
                const packageJson = JSON.parse(packageJsonContent.toString());

                // Check for Jest
                if (packageJson.devDependencies?.jest ||
                    packageJson.dependencies?.jest ||
                    packageJson.scripts?.test?.includes('jest')) {
                    framework = 'jest';
                    confidence = 0.9;
                    reasons.push('Found Jest in package.json');
                    jestConfigFiles.push('package.json');
                }

                // Could add Mocha, Vitest detection here in the future
            }
        } catch (error) {
            // Package.json not found or invalid
            reasons.push('No package.json found');
        }

        // Check for Jest config files
        const jestConfigPatterns = ['jest.config.js', 'jest.config.ts', 'jest.config.mjs'];
        for (const pattern of jestConfigPatterns) {
            try {
                const configUri = vscode.Uri.joinPath(folder.uri, pattern);
                const stat = await vscode.workspace.fs.stat(configUri);
                if (stat.type === vscode.FileType.File) {
                    framework = 'jest';
                    confidence = Math.max(confidence, 0.8);
                    reasons.push(`Found ${pattern}`);
                    jestConfigFiles.push(pattern);
                }
            } catch {
                // Config file doesn't exist, continue
            }
        }

        // Build debug configuration
        const debugConfig: vscode.DebugConfiguration = {
            type: 'node',
            name: 'Debug Jest Tests',
            request: 'launch',
            program: '${workspaceFolder}/node_modules/.bin/jest',
            args: [
                '--runInBand',
                '--watchAll=false'
            ],
            cwd: folder.uri.fsPath,
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen',
            disableOptimisticBPs: true
        };

        // Add test file if provided
        if (file) {
            const testPath = vscode.workspace.asRelativePath(file, false);
            debugConfig.args = [
                ...debugConfig.args as string[],
                '--runTestsByPath',
                testPath
            ];
        }

        return {
            language: 'javascript',
            framework,
            confidence,
            reasons,
            projectRoot: folder.uri.fsPath,
            cwd: folder.uri.fsPath,
            testFilePatterns: [
                '**/*.test.js',
                '**/*.test.ts',
                '**/*.spec.js',
                '**/*.spec.ts',
                '**/__tests__/**/*.js',
                '**/__tests__/**/*.ts'
            ],
            debugConfig,
            nodePath: process.execPath, // Use VS Code's Node.js
            packageManager: 'npm', // Default, could detect from lock files
            jestConfigFiles
        };
    }

    /**
     * Get file patterns to watch for cache invalidation
     */
    watchGlobs(): string[] {
        return [
            '**/package.json',
            '**/jest.config.js',
            '**/jest.config.ts',
            '**/jest.config.mjs',
            '**/.jestrc',
            '**/.jestrc.json'
        ];
    }

    /**
     * Quick scoring for monorepo routing
     */
    quickScore(filePath: string): number {
        const lower = filePath.toLowerCase();

        // High score for JS/TS test files
        if (lower.includes('.test.') || lower.includes('.spec.')) return 0.9;

        // Medium score for JS/TS paths
        if (lower.includes('/javascript/') || lower.includes('/frontend/')) return 0.7;
        if (lower.endsWith('.js') || lower.endsWith('.ts')) return 0.8;

        // Low score for non-JS files
        if (lower.endsWith('.py')) return 0.1;

        return 0.5; // Neutral score
    }
}