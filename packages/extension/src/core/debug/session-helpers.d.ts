/**
 * Type definitions for session-helpers.js
 */

export function getDebugSession(vscode: any, sessionId?: string): any;

export function getActiveThreadId(session: any, vscode: any): Promise<number>;

export function findDartIsolateWithSource(session: any, vscode: any, sourcePath: string): Promise<number | null>;

export function findCoreclrThreadWithSource(session: any, vscode: any, sourcePath: string): Promise<number | null>;
