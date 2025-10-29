import * as vscode from 'vscode';
import {
    IBridgeContext,
    ILogger,
    IBridgeContextOptions,
    IPythonEnvironment,
    ITestEnvironment,
    IDebugService,
    IWorkspaceService,
    IPathService
} from './types';
import { PythonEnvDetectorSimple } from './services/PythonEnvDetectorSimple';
import { EnhancedLogger } from './services/EnhancedLogger';
import { DebugService } from './services/DebugService';
import { WorkspaceService } from './services/WorkspaceService';
import { PathService } from './services/PathService';
import { TestEnvironmentService } from '../test-environments/TestEnvironmentService';
import { TestDetectorFactory } from '../test-environments/TestDetectorFactory';

/**
 * Logger implementation using VS Code's OutputChannel
 * @deprecated Use EnhancedLogger for new scripts
 */
class Logger implements ILogger {
    private outputChannel: vscode.OutputChannel;
    private logLevel: string;
    private includeTimestamp: boolean;
    private requestMetadata?: { requestId?: string; mode?: string; alias?: string };

    constructor(channelName: string, options: IBridgeContextOptions = {}) {
        this.outputChannel = vscode.window.createOutputChannel(channelName);
        this.logLevel = options.logLevel || 'info';
        this.includeTimestamp = options.includeTimestamp || false;
    }

    /**
     * Set request metadata for all log messages
     */
    setRequestMetadata(metadata: { requestId?: string; mode?: string; alias?: string }): void {
        this.requestMetadata = metadata;
    }

    private formatMessage(level: string, message: string): string {
        const timestamp = this.includeTimestamp
            ? `[${new Date().toLocaleTimeString()}] `
            : '';

        // Include request metadata if available
        const metadata = this.requestMetadata
            ? ` [${this.requestMetadata.requestId || 'no-id'}${this.requestMetadata.alias ? ':' + this.requestMetadata.alias : ''}${this.requestMetadata.mode ? ':' + this.requestMetadata.mode : ''}]`
            : '';

        return `${timestamp}[${level}]${metadata} ${message || '(empty message)'}`;
    }

    info(message: string, ...args: any[]): void {
        const formatted = this.formatMessage('INFO', message);
        this.outputChannel.appendLine(formatted);

        if (args.length > 0) {
            this.outputChannel.appendLine(`  Details: ${JSON.stringify(args)}`);
        }
    }

    error(message: string, error?: Error): void {
        const formatted = this.formatMessage('ERROR', message);
        this.outputChannel.appendLine(formatted);

        if (error) {
            this.outputChannel.appendLine(`  Error: ${error.message}`);
            if (error.stack) {
                this.outputChannel.appendLine(`  Stack: ${error.stack}`);
            }
        }

        // Show channel on error for visibility
        this.outputChannel.show(true);
    }

    debug(message: string, data?: any): void {
        if (this.logLevel === 'debug') {
            const formatted = this.formatMessage('DEBUG', message);
            this.outputChannel.appendLine(formatted);

            if (data !== undefined) {
                this.outputChannel.appendLine(`  Data: ${JSON.stringify(data, null, 2)}`);
            }
        }
    }

    warn(message: string): void {
        const formatted = this.formatMessage('WARN', message);
        this.outputChannel.appendLine(formatted);
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}

/**
 * BridgeContext implementation
 * Provides dependency injection for scripts with VS Code API wrappers
 */
export class BridgeContext implements IBridgeContext {
    private _version: string = '1.0.0';
    private _logger: ILogger;
    private extensionContext: vscode.ExtensionContext;
    private disposed: boolean = false;
    private _pythonDetector?: PythonEnvDetectorSimple;
    private _debugService?: IDebugService;
    private _workspaceService?: IWorkspaceService;
    private _pathService?: IPathService;
    private _scriptName?: string;
    private _outputChannel?: vscode.OutputChannel;
    private _signal?: AbortSignal;
    private _mode?: string;
    private _testEnvironmentService?: TestEnvironmentService;

    constructor(extensionContext: vscode.ExtensionContext, options: IBridgeContextOptions = {}) {
        if (!extensionContext) {
            throw new Error('Extension context is required');
        }

        this.extensionContext = extensionContext;
        this._signal = options.signal;
        this._mode = options.mode;

        // Initialize enhanced logger with script name if provided
        // Use provided outputChannel (DI) or create new one
        const outputChannel = options.outputChannel ||
            vscode.window.createOutputChannel(options.outputChannelName || 'VSC-Bridge');
        this._outputChannel = outputChannel;
        this._scriptName = (options as any).scriptName;

        // Use EnhancedLogger for better formatting
        this._logger = new EnhancedLogger(
            outputChannel,
            this._scriptName || 'BridgeContext',
            {
                includeTimestamp: options.includeTimestamp,
                minLevel: options.logLevel
            }
        );

        // Make version readonly
        Object.defineProperty(this, 'version', {
            get: () => this._version,
            set: () => {
                throw new Error('Version is readonly');
            },
            enumerable: true,
            configurable: false
        });
    }

    /**
     * Get the version string
     */
    get version(): string {
        return this._version;
    }

    /**
     * Direct access to VS Code API namespace
     */
    get vscode(): typeof vscode {
        return vscode;
    }

    /**
     * Abort signal for cancellation
     */
    get signal(): AbortSignal | undefined {
        return this._signal;
    }

    /**
     * Request mode
     */
    get mode(): string | undefined {
        return this._mode;
    }

    /**
     * Output channel for direct access
     */
    get outputChannel(): vscode.OutputChannel | undefined {
        return this._outputChannel;
    }

    /**
     * Get the logger service
     */
    get logger(): ILogger {
        return this._logger;
    }

    /**
     * Get the debug service (lazy initialization)
     */
    get debug(): IDebugService {
        if (!this._debugService) {
            this._debugService = new DebugService();
        }
        return this._debugService;
    }

    /**
     * Get the workspace service (lazy initialization)
     */
    get workspace(): IWorkspaceService {
        if (!this._workspaceService) {
            this._workspaceService = new WorkspaceService();
        }
        return this._workspaceService;
    }

    /**
     * Get the path service (lazy initialization)
     */
    get paths(): IPathService {
        if (!this._pathService) {
            this._pathService = new PathService(this.extensionContext.extensionPath);
        }
        return this._pathService;
    }

    /**
     * Get the first workspace folder using VS Code API
     * Direct wrapper around vscode.workspace.workspaceFolders?.[0]
     */
    getWorkspace(): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.workspaceFolders?.[0];
    }

    /**
     * Get the active text editor using VS Code API
     * Direct wrapper around vscode.window.activeTextEditor
     */
    getActiveEditor(): vscode.TextEditor | undefined {
        return vscode.window.activeTextEditor;
    }

    /**
     * Get configuration using VS Code API
     * Direct wrapper around vscode.workspace.getConfiguration()
     */
    getConfiguration(section: string): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(section);
    }

    /**
     * Set request metadata for logger correlation
     * This metadata will be included in all log messages
     */
    setRequestMetadata(metadata: { requestId?: string; mode?: string; alias?: string }): void {
        // Note: EnhancedLogger doesn't have setRequestMetadata
        // This could be added if needed for request correlation
        this._logger.debug('Request metadata updated', metadata);
    }

    /**
     * Detect Python test environment and generate debug configuration
     * @param filePath Path to the Python file to analyze
     * @returns Python environment with test framework detection and debug config
     */
    async getPythonEnv(filePath: string): Promise<IPythonEnvironment> {
        // Try to get workspace folder from file path first
        let folder: vscode.WorkspaceFolder | undefined;

        // If we have a file path, find the workspace folder it belongs to
        if (filePath) {
            const fileUri = vscode.Uri.file(filePath);
            folder = vscode.workspace.getWorkspaceFolder(fileUri);
        }

        // Fall back to first workspace folder if no match found
        if (!folder) {
            folder = this.getWorkspace();
        }

        // If no workspace folder, try to find project root from file path
        // Use VS Code Uri and workspace.fs for remote-safe operations
        let projectRoot: vscode.Uri | undefined;
        if (!folder && filePath) {
            const fileUri = vscode.Uri.file(filePath);
            let currentUri = vscode.Uri.joinPath(fileUri, '..');

            // Walk up to find project root (bounded search, max 5 levels)
            for (let i = 0; i < 5; i++) {
                // Check for Python project markers using VS Code FS
                const markers = ['pytest.ini', 'setup.py', 'pyproject.toml', 'tox.ini'];
                for (const marker of markers) {
                    const markerUri = vscode.Uri.joinPath(currentUri, marker);
                    try {
                        // Use workspace.fs.stat for remote-safe file checking
                        await vscode.workspace.fs.stat(markerUri);
                        // Found a marker, this is the project root
                        projectRoot = currentUri;
                        break;
                    } catch {
                        // File doesn't exist, continue searching
                    }
                }

                if (projectRoot) break;

                // Move up one directory
                const parentUri = vscode.Uri.joinPath(currentUri, '..');
                // Check if we've reached the root
                if (parentUri.path === currentUri.path) break;
                currentUri = parentUri;
            }
        }
        if (!folder && !projectRoot) {
            // No workspace and no project root found
            return {
                language: 'python',
                framework: 'none',
                confidence: 0,
                cwd: '',
                reasons: ['No workspace folder'],
                debugConfig: {
                    name: 'Python: Debug Test',
                    type: 'debugpy',
                    request: 'launch',
                    module: 'pytest',
                    args: ['-q'],
                    console: 'integratedTerminal',
                    justMyCode: false
                }
            };
        }

        // If we found a project root but no workspace, create a temporary folder object
        // This is only used for detection, not as a real workspace folder
        if (!folder && projectRoot) {
            // Extract folder name from Uri path (remote-safe)
            const segments = projectRoot.path.split('/');
            const folderName = segments[segments.length - 1] || 'project';
            folder = {
                uri: projectRoot,
                name: folderName,
                index: 0
            } as vscode.WorkspaceFolder;
        }

        // Lazy instantiation of detector
        if (!this._pythonDetector) {
            this._pythonDetector = new PythonEnvDetectorSimple();
        }

        const uri = vscode.Uri.file(filePath);

        // Log with request correlation
        this._logger.debug(`Detecting Python environment for ${filePath}`);

        // folder is guaranteed to be defined here due to earlier checks
        const result = await this._pythonDetector.detect(folder!, uri);

        // Log detection result
        this._logger.info(`Detected ${result.framework} with confidence ${result.confidence}`);
        if (result.reasons.length > 0) {
            this._logger.debug(`Detection reasons: ${result.reasons.join(', ')}`);
        }

        // Check test discovery status (optional, non-blocking)
        try {
            const { isTestConfigurationRequired } = await import('../testing/waitForDiscovery');

            if (folder && !isTestConfigurationRequired(folder)) {
                // Tests are configured, check discovery status
                // This is a quick check, not a wait
                let observer: any;
                try {
                    observer = (vscode as any).tests?.createTestObserver?.();
                } catch {
                    // Fall back if method doesn't exist
                }

                if (observer && folder) {
                    const folderPrefix = folder.uri.toString() + '/';
                    const items = [...observer.tests].filter((item: any) =>
                        item.uri?.toString().startsWith(folderPrefix)
                    );

                    result.testDiscovery = {
                        ready: items.length > 0,
                        itemCount: items.length,
                        details: items.length > 0 ? 'Tests discovered' : 'No tests found yet'
                    };

                    observer.dispose();
                } else {
                    // Test observer API not available
                    result.testDiscovery = {
                        ready: false,
                        details: 'Test observer API not available'
                    };
                }
            } else {
                result.testDiscovery = {
                    ready: false,
                    details: 'Python tests not configured'
                };
            }
        } catch (error) {
            // If discovery check fails, don't block the main function
            result.testDiscovery = {
                ready: false,
                details: 'Discovery check not available'
            };
        }

        return result;
    }

    /**
     * Get test environment using the unified service layer
     * @param file Optional file URI for context (remote-safe)
     * @returns Test environment with framework detection
     */
    async getTestEnvironment(file?: vscode.Uri): Promise<ITestEnvironment | null> {
        // Initialize service if needed
        if (!this._testEnvironmentService) {
            this._testEnvironmentService = new TestEnvironmentService(this._logger, this.workspace);

            // Register all detectors from factory
            const factory = TestDetectorFactory.getInstance();
            const detectors = factory.createAllDetectors();
            for (const detector of detectors) {
                this._testEnvironmentService.registerDetector(detector);
            }
        }

        // Get workspace folder
        let folder: vscode.WorkspaceFolder | undefined;
        const fileUri = file;

        if (fileUri) {
            folder = vscode.workspace.getWorkspaceFolder(fileUri);
        }

        if (!folder) {
            folder = this.getWorkspace();
        }

        if (!folder) {
            this._logger.warn('No workspace folder available for test environment detection');
            return null;
        }

        // Detect environment
        const result = await this._testEnvironmentService.detect(folder, fileUri);

        if (result) {
            this._logger.info(`Detected ${result.language} test environment: ${result.framework}`);
        } else {
            this._logger.debug('No test environment detected');
        }

        return result;
    }

    /**
     * Get JavaScript test environment using the unified service layer
     * Convenience method that delegates to getTestEnvironment
     * @param file File URI for context (remote-safe)
     * @returns JavaScript test environment or null
     */
    async getJavaScriptEnv(file: vscode.Uri): Promise<ITestEnvironment | null> {
        const env = await this.getTestEnvironment(file);
        return env && env.language === 'javascript' ? env : null;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        if (this.disposed) {
            return; // Already disposed
        }

        // Dispose test environment service
        if (this._testEnvironmentService) {
            this._testEnvironmentService.dispose();
        }

        // EnhancedLogger doesn't have dispose, but outputChannel does
        // Cast to any to access the internal outputChannel if needed
        if ('dispose' in this._logger && typeof (this._logger as any).dispose === 'function') {
            (this._logger as any).dispose();
        }
        this.disposed = true;
    }
}

/**
 * Export for testing - allows tests to verify implementation details
 */
export const _testExports = {
    Logger
};