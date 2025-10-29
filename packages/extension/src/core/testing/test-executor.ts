import * as vscode from 'vscode';
import { CursorTestMapper } from './cursor-mapper';
import { TestingApiChecker } from './availability';
// NOTE: polling-executor has been deleted - now using waitUntilPausedAndGetLocation directly in scripts
import {
    ensureTestsDiscovered,
    DebugResult
} from './debug-events';

/**
 * Error codes for test execution
 */
export enum TestExecutorError {
    API_UNAVAILABLE = 'E_API_UNAVAILABLE',
    NO_TEST_AT_CURSOR = 'E_NO_TEST_AT_CURSOR',
    TIMEOUT = 'E_TIMEOUT',
    DISCOVERY_FAILED = 'E_DISCOVERY_FAILED',
    FILE_NOT_FOUND = 'E_FILE_NOT_FOUND',
    EXECUTION_FAILED = 'E_EXECUTION_FAILED'
}

/**
 * Result from test execution
 */
export interface TestExecutionResult {
    sessionId: string;
    sessionName: string;
    testName?: string;
    framework?: string;
    workspaceFolder?: string;
    debugResult?: DebugResult;
}

/**
 * Orchestrates test debugging using VS Code Testing API
 */
export class TestExecutor {
    private disposables: vscode.Disposable[] = [];

    /**
     * Debug test at cursor position using pure polling approach
     * @param filePath Path to test file
     * @param line Line number (1-indexed)
     * @param column Column number (1-indexed)
     * @param timeoutMs Timeout for debug session start
     */
    async debugTestAtCursor(
        filePath: string,
        line: number,
        column: number = 1,
        timeoutMs: number = 30000
    ): Promise<TestExecutionResult> {
        console.log('[TestExecutor.debugTestAtCursor] Starting with pure polling:', {
            filePath,
            line,
            column,
            timeoutMs
        });

        try {
            // Check if Testing API is available
            if (!TestingApiChecker.isAvailable()) {
                console.error('[TestExecutor] Testing API not available');
                throw new Error(TestExecutorError.API_UNAVAILABLE);
            }

            // NOTE: This method is deprecated - debug-single.js now uses waitUntilPausedAndGetLocation directly
            // Keeping this stub for backwards compatibility with any external consumers
            throw new Error(
                'TestExecutor.debugTestAtCursor is deprecated. ' +
                'Use debug-single.js script instead, which uses waitUntilPausedAndGetLocation directly.'
            );

        } finally {
            this.cleanup();
        }
    }


    /**
     * Clean up resources
     */
    cleanup(): void {
        for (const disposable of this.disposables) {
            try {
                disposable.dispose();
            } catch (error) {
                console.error('Error disposing resource:', error);
            }
        }
        this.disposables = [];
    }

    /**
     * Check if command is available
     */
    static async isDebugAtCursorAvailable(): Promise<boolean> {
        const commands = await vscode.commands.getCommands();
        return commands.includes('testing.debugAtCursor');
    }

    /**
     * Get active debug session
     */
    static getActiveDebugSession(): vscode.DebugSession | undefined {
        return vscode.debug.activeDebugSession;
    }

    /**
     * Stop debug session
     */
    static async stopDebugSession(sessionId?: string): Promise<void> {
        const session = sessionId
            ? vscode.debug.activeDebugSession?.id === sessionId
                ? vscode.debug.activeDebugSession
                : undefined
            : vscode.debug.activeDebugSession;

        if (session) {
            await vscode.commands.executeCommand('workbench.action.debug.stop');
        }
    }
}