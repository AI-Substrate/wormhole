import * as vscode from 'vscode';
import { ITestEnvironment, ITestEnvironmentDetector } from './interfaces';
import { ILogger, IWorkspaceService } from '../bridge-context/types';

/**
 * Core service with caching and intelligent routing
 */
export class TestEnvironmentService implements vscode.Disposable {
    private readonly detectors = new Set<ITestEnvironmentDetector<any>>();
    private readonly cache = new Map<string, ITestEnvironment>();
    private readonly pendingDetections = new Map<string, Promise<ITestEnvironment | null>>();
    private readonly fileWatchers = new Map<string, vscode.FileSystemWatcher>();
    private readonly disposables: vscode.Disposable[] = [];
    private readonly logger: ILogger;
    private readonly workspaceService: IWorkspaceService;

    constructor(logger: ILogger, workspaceService: IWorkspaceService) {
        this.logger = logger;
        this.workspaceService = workspaceService;
        // Set up workspace trust listener
        this.disposables.push(
            vscode.workspace.onDidGrantWorkspaceTrust(() => {
                this.onWorkspaceTrustChanged();
            })
        );
    }

    /**
     * Register a test environment detector
     */
    registerDetector(detector: ITestEnvironmentDetector<any>): void {
        // Avoid duplicate registration
        if (this.detectors.has(detector)) {
            return;
        }

        this.detectors.add(detector);

        // Set up file watchers for this detector
        const globs = detector.watchGlobs();
        for (const glob of globs) {
            this.setupFileWatcher(glob);
        }
    }

    /**
     * Detect test environment for a workspace folder
     */
    async detect(
        folder: vscode.WorkspaceFolder,
        file?: vscode.Uri
    ): Promise<ITestEnvironment | null> {
        // Generate cache key
        const cacheKey = this.getCacheKey(folder, file);

        // Check cache
        if (this.cache.has(cacheKey)) {
            this.logger.debug(`[TestEnv] Cache hit for ${cacheKey}`);
            return this.cache.get(cacheKey)!;
        }

        // Check if detection is already in progress (request coalescing)
        if (this.pendingDetections.has(cacheKey)) {
            return this.pendingDetections.get(cacheKey)!;
        }

        // Start detection
        const detectionPromise = this.performDetection(folder, file, cacheKey);
        this.pendingDetections.set(cacheKey, detectionPromise);

        try {
            const result = await detectionPromise;
            return result;
        } finally {
            this.pendingDetections.delete(cacheKey);
        }
    }

    /**
     * Perform the actual detection
     */
    private async performDetection(
        folder: vscode.WorkspaceFolder,
        file: vscode.Uri | undefined,
        cacheKey: string
    ): Promise<ITestEnvironment | null> {
        this.logger.debug(`[TestEnv] Cache miss for ${cacheKey}, performing detection`);

        // Collect candidate detectors
        const candidates: Array<{
            detector: ITestEnvironmentDetector<any>;
            score: number;
        }> = [];

        for (const detector of this.detectors) {
            try {
                const canHandle = await detector.canHandle(folder, file);
                if (!canHandle) continue;

                // Calculate quick score if available
                let score = 0.5; // Default score
                if (file && detector.quickScore) {
                    score = detector.quickScore(file.fsPath);
                }

                candidates.push({ detector, score });
            } catch (error) {
                this.logger.error(`[TestEnv] Error checking detector`, error as Error);
            }
        }

        // Sort candidates by score (descending)
        candidates.sort((a, b) => b.score - a.score);

        // Try detectors in priority order
        let bestResult: ITestEnvironment | null = null;
        let bestConfidence = 0;

        for (const { detector } of candidates) {
            try {
                const result = await detector.detect(folder, file);

                // Apply workspace trust reduction if needed
                const adjustedResult = this.applyWorkspaceTrust(result);

                // Keep the best result based on confidence
                if (adjustedResult.confidence > bestConfidence) {
                    bestResult = adjustedResult;
                    bestConfidence = adjustedResult.confidence;
                }
            } catch (error) {
                this.logger.error(`[TestEnv] Error detecting environment`, error as Error);
            }
        }

        // Cache the result
        if (bestResult) {
            this.cache.set(cacheKey, bestResult);
            this.logger.debug(`[TestEnv] Cached result for ${cacheKey}`);
        }

        return bestResult;
    }

    /**
     * Apply workspace trust to detection results
     */
    private applyWorkspaceTrust(environment: ITestEnvironment): ITestEnvironment {
        if (!vscode.workspace.isTrusted) {
            this.logger.info(`[TestEnv] Workspace not trusted, reducing confidence for ${environment.language}`);
            return {
                ...environment,
                confidence: Math.min(environment.confidence * 0.5, 0.5),
                reasons: [...environment.reasons, 'Workspace not trusted - confidence reduced']
            };
        }
        return environment;
    }

    /**
     * Set up file watcher for configuration changes
     */
    private setupFileWatcher(glob: string): void {
        // Check if we already have a watcher for this glob
        if (this.fileWatchers.has(glob)) {
            return;
        }

        // Guard against missing workspace
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }

        const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], glob);
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        // Set up change handlers
        const invalidateHandler = (uri: vscode.Uri) => {
            this.invalidateCacheForUri(uri);
        };

        watcher.onDidChange(invalidateHandler);
        watcher.onDidCreate(invalidateHandler);
        watcher.onDidDelete(invalidateHandler);

        this.fileWatchers.set(glob, watcher);
        this.disposables.push(watcher);
    }

    /**
     * Invalidate cache entries affected by a file change
     */
    private invalidateCacheForUri(uri: vscode.Uri): void {
        const affectedKeys = Array.from(this.cache.keys()).filter(key => {
            // Check if this cache entry is affected by the file change
            const folder = vscode.workspace.getWorkspaceFolder(uri);
            return folder && key.startsWith(`${folder.uri.fsPath}:`);
        });

        for (const key of affectedKeys) {
            this.cache.delete(key);
            this.logger.debug(`[TestEnv] Invalidated cache for ${key} due to file change`);
        }
    }

    /**
     * Invalidate cache for a specific folder or all folders
     */
    invalidateCache(folder?: vscode.WorkspaceFolder): void {
        if (folder) {
            const prefix = `${folder.uri.fsPath}:`;
            const keysToDelete = Array.from(this.cache.keys()).filter(k => k.startsWith(prefix));
            keysToDelete.forEach(k => this.cache.delete(k));
            this.logger.debug(`[TestEnv] Invalidated cache for folder ${folder.name}`);
        } else {
            this.cache.clear();
            this.logger.debug('[TestEnv] Invalidated entire cache');
        }
    }

    /**
     * Handle workspace trust change
     */
    onWorkspaceTrustChanged(): void {
        this.logger.info('[TestEnv] Workspace trust changed, invalidating cache');
        this.invalidateCache();
    }

    /**
     * Get the number of registered detectors
     */
    getDetectorCount(): number {
        return this.detectors.size;
    }

    /**
     * Generate a cache key for a detection context
     */
    private getCacheKey(folder: vscode.WorkspaceFolder, file?: vscode.Uri): string {
        const filePath = file ? file.fsPath : '<no-file>';
        return `${folder.uri.fsPath}:${filePath}`;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.detectors.clear();
        this.cache.clear();
        this.pendingDetections.clear();
        this.fileWatchers.clear();

        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}