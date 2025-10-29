import * as vscode from 'vscode';
import { ITestEnvironment as IBaseTestEnvironment } from '../../bridge-context/types';

/**
 * Core interface returned by TestEnvironmentService
 * Extends the base interface from types.ts for compatibility
 */
export interface ITestEnvironment extends IBaseTestEnvironment {
    /** Resolved absolute path to project root */
    projectRoot: string;

    /** File patterns for test files */
    testFilePatterns: string[];

    /** Optional environment variables */
    envVars?: Record<string, string>;
}

/**
 * Python-specific environment
 */
export interface IPythonEnvironment extends ITestEnvironment {
    language: 'python';
    framework: 'pytest' | 'unittest' | 'nose2' | 'none';

    /** Path to Python interpreter */
    interpreterPath?: string;

    /** Configuration files found */
    configFiles?: string[];
}

/**
 * JavaScript-specific environment
 */
export interface IJavaScriptEnvironment extends ITestEnvironment {
    language: 'javascript';
    framework: 'jest' | 'mocha' | 'vitest' | 'none';

    /** Path to Node.js executable */
    nodePath?: string;

    /** Package manager in use */
    packageManager?: 'npm' | 'yarn' | 'pnpm';

    /** Jest configuration files found */
    jestConfigFiles?: string[];
}

/**
 * Detector contract with monorepo support
 */
export interface ITestEnvironmentDetector<T extends ITestEnvironment> {
    /** Languages this detector supports */
    supportedLanguages: string[];

    /**
     * Check if detector can handle given context
     * @param folder Workspace folder
     * @param file Optional file URI for context
     * @returns True if this detector can handle the context
     */
    canHandle(folder: vscode.WorkspaceFolder, file?: vscode.Uri): Promise<boolean>;

    /**
     * Detect environment with folder context and optional file
     * @param folder Workspace folder
     * @param file Optional file URI for context
     * @returns Detected test environment
     */
    detect(folder: vscode.WorkspaceFolder, file?: vscode.Uri): Promise<T>;

    /**
     * File globs that should trigger cache invalidation
     * @returns Array of glob patterns
     */
    watchGlobs(): string[];

    /**
     * Quick scoring for routing (0-1, optional)
     * Used for monorepo package selection
     * @param filePath File path to score
     * @returns Score between 0 and 1
     */
    quickScore?(filePath: string): number;
}