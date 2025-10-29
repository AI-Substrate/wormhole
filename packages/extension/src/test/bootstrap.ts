/**
 * Bootstrap file for tests - ensures extension is activated before tests execute
 * and provides shared utilities for single Extension Host testing.
 * This file is loaded via mocha.require in .vscode-test.mjs
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Shared output channel for all tests
export const testOutput = vscode.window.createOutputChannel('VSC-Bridge Tests');

// Wait for extension activation.
async function ensureExtensionReady() {
  // Find extension by packageJSON name to avoid hard-coding publisher in tests
  const ext = vscode.extensions.all.find(e => e.packageJSON?.name === 'vsc-bridge-extension');
  if (!ext) {
    throw new Error('vsc-bridge-extension not found in extension host');
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  console.log('Extension activated and ready');
}

/**
 * Reset the VS Code workbench to a clean state between tests.
 * Closes all editors and stops all debug sessions.
 */
export async function resetWorkbench(): Promise<void> {
    // Close all editors
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    // Stop any running debug sessions
    for (const session of vscode.debug.activeDebugSession ? [vscode.debug.activeDebugSession] : []) {
        try {
            await vscode.debug.stopDebugging(session);
        } catch (err) {
            testOutput.appendLine(`Warning: Failed to stop debug session: ${err}`);
        }
    }

    // Wait for all debug sessions to terminate
    await waitAllDebugStopped();
}

/**
 * Wait for all debug sessions to stop.
 */
export async function waitAllDebugStopped(): Promise<void> {
    let attempts = 0;
    while (vscode.debug.activeDebugSession && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
    }
}

/**
 * Create a temporary workspace from a fixture.
 * Copies the fixture to a temp directory to avoid conflicts.
 */
export function withTempWorkspace(fixtureRelPath: string): {
    uri: vscode.Uri;
    path: string;
    dispose: () => Promise<void>;
} {
    const fixturePath = path.join(__dirname, '..', '..', 'src', 'test', 'fixtures', fixtureRelPath);
    if (!fs.existsSync(fixturePath)) {
        throw new Error(`Fixture not found: ${fixturePath}`);
    }

    // Create temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsc-bridge-test-'));

    // Copy fixture to temp
    copyDirSync(fixturePath, tempDir);

    return {
        uri: vscode.Uri.file(tempDir),
        path: tempDir,
        dispose: async () => {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (err) {
                testOutput.appendLine(`Warning: Failed to clean temp dir: ${err}`);
            }
        }
    };
}

/**
 * Recursively copy a directory.
 */
function copyDirSync(from: string, to: string): void {
    fs.mkdirSync(to, { recursive: true });

    for (const entry of fs.readdirSync(from)) {
        const srcPath = path.join(from, entry);
        const destPath = path.join(to, entry);
        const stat = fs.lstatSync(srcPath);

        if (stat.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * DEPRECATED: These functions cause Extension Host restarts!
 * DO NOT USE in tests - they will cause multiple PIDs and test failures.
 *
 * Instead:
 * 1. Use the multi-root workspace configuration (test-all-fixtures.code-workspace)
 * 2. Create temp subdirectories within existing workspace folders
 * 3. Pass explicit URIs to code under test
 */

// Removed: addWorkspaceRoot - causes EH restart
// Removed: removeAllWorkspaceRoots - causes EH restart
// Removed: setWorkspaceRoot - causes EH restart

/**
 * Get a workspace folder by name from the multi-root workspace.
 * Safe to use - does not cause Extension Host restarts.
 */
export function getWorkspaceFolderByName(name: string): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.find(f => f.name === name);
}

/**
 * Create a temp subdirectory within an existing workspace folder.
 * Safe to use - does not cause Extension Host restarts.
 */
export async function createTempSubdir(workspaceFolder: vscode.WorkspaceFolder, prefix: string = 'test-'): Promise<vscode.Uri> {
    const tempName = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempUri = vscode.Uri.joinPath(workspaceFolder.uri, '.test-temp', tempName);

    // Create directory using VS Code FS API
    await vscode.workspace.fs.createDirectory(tempUri);

    return tempUri;
}

/**
 * Disposable tracker for test cleanup.
 */
export class DisposableTracker {
    private disposables: vscode.Disposable[] = [];

    add<T extends vscode.Disposable>(disposable: T): T {
        this.disposables.push(disposable);
        return disposable;
    }

    async dispose(): Promise<void> {
        while (this.disposables.length > 0) {
            const disposable = this.disposables.pop();
            try {
                disposable?.dispose();
            } catch (err) {
                testOutput.appendLine(`Warning: Failed to dispose resource: ${err}`);
            }
        }
    }
}

/**
 * Wait for a condition with timeout.
 */
export async function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 5000,
    message: string = 'Condition'
): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        if (await condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error(`${message} timed out after ${timeoutMs}ms`);
}

// Extension Host restart detection
const EH_PID_KEY = '__EH_PID__';
const EH_SESSION_KEY = '__EH_SESSION__';
const TEST_RUNNING_KEY = '__TEST_RUNNING__';

// Detect Extension Host restarts
const lastPid = (globalThis as any)[EH_PID_KEY];
const lastSession = (globalThis as any)[EH_SESSION_KEY];

if (lastPid && lastPid !== process.pid) {
    console.error(`[EH-RESTART-DETECTED] Extension Host restarted! Was PID ${lastPid}, now ${process.pid}`);
    testOutput.appendLine(`[EH-RESTART-DETECTED] Extension Host restarted! Was PID ${lastPid}, now ${process.pid}`);
}

if (lastSession && lastSession !== vscode.env.sessionId) {
    console.error(`[SESSION-CHANGE] VS Code session changed! Was ${lastSession}, now ${vscode.env.sessionId}`);
    testOutput.appendLine(`[SESSION-CHANGE] VS Code session changed! Was ${lastSession}, now ${vscode.env.sessionId}`);
}

// Store current PID and session
(globalThis as any)[EH_PID_KEY] = process.pid;
(globalThis as any)[EH_SESSION_KEY] = vscode.env.sessionId;

// Prevent parallel test execution
if ((globalThis as any)[TEST_RUNNING_KEY]) {
    throw new Error('Another test run is already active in this Extension Host. This indicates parallel execution!');
}
(globalThis as any)[TEST_RUNNING_KEY] = true;
process.on('exit', () => {
    (globalThis as any)[TEST_RUNNING_KEY] = false;
});

console.log(`[EH-INFO] Extension Host PID: ${process.pid}, Session: ${vscode.env.sessionId}`);
testOutput.appendLine(`[EH-INFO] Extension Host PID: ${process.pid}, Session: ${vscode.env.sessionId}`);

// Log unhandled errors to help debug test failures
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection in test:', reason);
    testOutput.appendLine(`Unhandled rejection: ${reason}`);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in test:', error);
    testOutput.appendLine(`Uncaught exception: ${error}`);
});

// Mocha Root Hook Plugin: loaded once per run (and per-file in parallel mode).
// This guarantees it runs for single-file "Run Test" as well as "Run All".
export const mochaHooks = {
  beforeAll: async function (this: Mocha.Context) {
    this.timeout?.(20_000);
    await ensureExtensionReady();
    testOutput.appendLine('Extension activated and ready for testing');
  },
  afterAll: async function() {
    // Final cleanup
    await resetWorkbench();
    testOutput.appendLine('Tests completed');
    console.log('Tests completed');
  }
};