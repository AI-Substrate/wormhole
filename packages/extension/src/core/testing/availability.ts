import * as vscode from 'vscode';

/**
 * Interface for API capabilities
 */
export interface ApiCapabilities {
    hasApi: boolean;
    canDebug: boolean;
    canRun: boolean;
    canRefresh: boolean;
    hasProviders: boolean;
}

/**
 * Interface for fallback suggestion
 */
export interface FallbackSuggestion {
    useFallback: boolean;
    reason: string | null;
}

/**
 * Interface for test provider information
 */
export interface TestProviderInfo {
    id: string;
    label: string;
    itemCount: number;
}

/**
 * Checker for Testing API availability and capabilities
 */
export class TestingApiChecker {
    /**
     * Check if VS Code Testing API is available
     */
    static isAvailable(): boolean {
        try {
            return typeof vscode !== 'undefined' &&
                   typeof vscode.tests !== 'undefined' &&
                   vscode.tests !== null;
        } catch (error) {
            console.error('Error checking Testing API availability:', error);
            return false;
        }
    }

    /**
     * Check if test providers are registered
     */
    static async hasTestProviders(): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            // Check if any test controllers have items
            // Note: VS Code doesn't directly expose all controllers,
            // so we check indirectly through workspace state
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return false;
            }

            // Try to find test items in the workspace
            // This is a heuristic approach
            const testFiles = await vscode.workspace.findFiles(
                '**/*{test,spec}.{js,ts,py,cs,java,go,rs}',
                '**/node_modules/**',
                10
            );

            return testFiles.length > 0;
        } catch (error) {
            console.error('Error checking test providers:', error);
            return false;
        }
    }

    /**
     * Check if debug test commands are available
     */
    static async canDebugTests(): Promise<boolean> {
        try {
            const commands = await vscode.commands.getCommands();
            return commands.includes('testing.debugAtCursor');
        } catch (error) {
            console.error('Error checking debug capability:', error);
            return false;
        }
    }

    /**
     * Check if run test commands are available
     */
    static async canRunTests(): Promise<boolean> {
        try {
            const commands = await vscode.commands.getCommands();
            return commands.includes('testing.runAtCursor');
        } catch (error) {
            console.error('Error checking run capability:', error);
            return false;
        }
    }

    /**
     * Check if refresh test command is available
     */
    static async canRefreshTests(): Promise<boolean> {
        try {
            const commands = await vscode.commands.getCommands();
            return commands.includes('testing.refreshTests');
        } catch (error) {
            console.error('Error checking refresh capability:', error);
            return false;
        }
    }

    /**
     * Get comprehensive API capabilities
     */
    static async getApiCapabilities(): Promise<ApiCapabilities> {
        const hasApi = this.isAvailable();

        if (!hasApi) {
            return {
                hasApi: false,
                canDebug: false,
                canRun: false,
                canRefresh: false,
                hasProviders: false
            };
        }

        try {
            const [canDebug, canRun, canRefresh, hasProviders] = await Promise.all([
                this.canDebugTests(),
                this.canRunTests(),
                this.canRefreshTests(),
                this.hasTestProviders()
            ]);

            return {
                hasApi,
                canDebug,
                canRun,
                canRefresh,
                hasProviders
            };
        } catch (error) {
            console.error('Error getting API capabilities:', error);
            return {
                hasApi,
                canDebug: false,
                canRun: false,
                canRefresh: false,
                hasProviders: false
            };
        }
    }

    /**
     * Get information about registered test providers
     */
    static async getTestProvidersInfo(): Promise<TestProviderInfo[]> {
        const providers: TestProviderInfo[] = [];

        if (!this.isAvailable()) {
            return providers;
        }

        try {
            // Check Python test provider
            const pythonConfig = vscode.workspace.getConfiguration('python');
            if (pythonConfig.get('testing.pytestEnabled') ||
                pythonConfig.get('testing.unittestEnabled')) {
                providers.push({
                    id: 'python',
                    label: 'Python Tests',
                    itemCount: -1 // Count not directly available
                });
            }

            // Check JavaScript/TypeScript test providers
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                for (const folder of workspaceFolders) {
                    const packageJsonFiles = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(folder, 'package.json'),
                        '**/node_modules/**',
                        1
                    );

                    if (packageJsonFiles.length > 0) {
                        // Likely has JavaScript tests
                        providers.push({
                            id: 'javascript',
                            label: 'JavaScript Tests',
                            itemCount: -1
                        });
                        break;
                    }
                }
            }

            // Check for .NET test providers
            const dotnetProjects = await vscode.workspace.findFiles(
                '**/*.csproj',
                '**/node_modules/**',
                5
            );

            if (dotnetProjects.length > 0) {
                providers.push({
                    id: 'dotnet',
                    label: '.NET Tests',
                    itemCount: -1
                });
            }

            return providers;
        } catch (error) {
            console.error('Error getting test providers info:', error);
            return providers;
        }
    }

    /**
     * Wait for Testing API to become available
     * @param timeoutMs Maximum time to wait
     */
    static async waitForApiAvailability(timeoutMs: number = 5000): Promise<boolean> {
        // If already available, return immediately
        if (this.isAvailable()) {
            return true;
        }

        const startTime = Date.now();
        const checkInterval = 100;

        return new Promise((resolve) => {
            const intervalId = setInterval(() => {
                if (this.isAvailable()) {
                    clearInterval(intervalId);
                    resolve(true);
                } else if (Date.now() - startTime >= timeoutMs) {
                    clearInterval(intervalId);
                    resolve(false);
                }
            }, checkInterval);
        });
    }

    /**
     * Get suggestion for whether to use fallback mechanism
     */
    static async getFallbackSuggestion(): Promise<FallbackSuggestion> {
        const capabilities = await this.getApiCapabilities();

        if (!capabilities.hasApi) {
            return {
                useFallback: true,
                reason: 'Testing API not available'
            };
        }

        if (!capabilities.hasProviders) {
            return {
                useFallback: true,
                reason: 'No test providers registered'
            };
        }

        if (!capabilities.canDebug) {
            return {
                useFallback: true,
                reason: 'Debug test command not available'
            };
        }

        return {
            useFallback: false,
            reason: null
        };
    }

    /**
     * Check if a specific test command is registered
     * @param command The command to check (e.g., 'testing.debugAtCursor')
     */
    static async isCommandAvailable(command: string): Promise<boolean> {
        try {
            const commands = await vscode.commands.getCommands();
            return commands.includes(command);
        } catch (error) {
            console.error(`Error checking command availability for ${command}:`, error);
            return false;
        }
    }

    /**
     * Get VS Code version information for compatibility checks
     */
    static getVscodeVersion(): string {
        return vscode.version;
    }

    /**
     * Check if VS Code version supports Testing API
     * Testing API was introduced in VS Code 1.59.0
     */
    static isVscodeVersionSupported(): boolean {
        const version = this.getVscodeVersion();
        const parts = version.split('.');
        const major = parseInt(parts[0], 10);
        const minor = parseInt(parts[1], 10);

        // Testing API requires VS Code 1.59.0 or later
        return major > 1 || (major === 1 && minor >= 59);
    }

    /**
     * Get detailed diagnostics for troubleshooting
     */
    static async getDiagnostics(): Promise<Record<string, any>> {
        const diagnostics: Record<string, any> = {
            vscodeVersion: this.getVscodeVersion(),
            vscodeVersionSupported: this.isVscodeVersionSupported(),
            testingApiAvailable: this.isAvailable()
        };

        if (this.isAvailable()) {
            const capabilities = await this.getApiCapabilities();
            diagnostics.capabilities = capabilities;
            diagnostics.providers = await this.getTestProvidersInfo();
        }

        // Check for test-related extensions
        const testExtensions = vscode.extensions.all.filter(ext =>
            ext.id.includes('test') ||
            ext.id.includes('pytest') ||
            ext.id.includes('jest') ||
            ext.id.includes('mocha')
        );

        diagnostics.testExtensions = testExtensions.map(ext => ({
            id: ext.id,
            name: ext.packageJSON.displayName || ext.packageJSON.name,
            version: ext.packageJSON.version,
            isActive: ext.isActive
        }));

        return diagnostics;
    }
}