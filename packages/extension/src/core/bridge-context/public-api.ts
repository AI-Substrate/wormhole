/**
 * PUBLIC API for Script Authors
 *
 * This is the ONLY interface that scripts should use.
 * Everything else is internal implementation detail.
 */

import * as vscode from 'vscode';
import { IPythonEnvironment } from './types';

/**
 * Minimal logger interface for scripts
 */
export interface IScriptLogger {
    info(message: string): void;
    error(message: string): void;
    debug(message: string): void;
    warn(message: string): void;
}

/**
 * The public BridgeContext API for scripts
 *
 * Only TWO methods exposed:
 * 1. getPythonEnv() - Get Python test framework info
 * 2. logger - Log messages
 *
 * That's it. No complexity.
 */
export interface IScriptBridgeContext {
    /**
     * Detect Python test framework and get debug configuration
     * @param filePath Path to the Python file
     * @returns Environment with framework detection and debug config
     */
    getPythonEnv(filePath: string): Promise<IPythonEnvironment>;

    /**
     * Logger for script output
     */
    readonly logger: IScriptLogger;
}

/**
 * Type guard to check if object is a BridgeContext
 */
export function isBridgeContext(obj: any): obj is IScriptBridgeContext {
    return obj &&
        typeof obj.getPythonEnv === 'function' &&
        obj.logger &&
        typeof obj.logger.info === 'function';
}

/**
 * INTERNAL: Full BridgeContext interface
 * DO NOT expose to scripts!
 */
export interface IBridgeContextInternal extends IScriptBridgeContext {
    // Internal methods not for script consumption
    setRequestMetadata?(metadata: any): void;
    dispose?(): void;
    getWorkspace?(): vscode.WorkspaceFolder | undefined;
    getActiveEditor?(): vscode.TextEditor | undefined;
    getConfiguration?(section: string): vscode.WorkspaceConfiguration;
}