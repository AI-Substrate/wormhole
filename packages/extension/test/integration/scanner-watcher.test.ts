/**
 * @file scanner-watcher.test.ts
 * @brief Extension Host integration tests for scanner-watcher cooperation
 *
 * These tests require VS Code Extension Host runtime to test FileSystemWatcher behavior.
 * They verify that the scanner acts as a safety net for missed watcher events.
 *
 * Run with: vscb script run tests.debug-single --param path=<path-to-this-file> --param line=<test-line>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import { scanForUnclaimedJobs } from '../../src/core/fs-bridge/scanner';
import { VsCodeFilesystem } from '../../src/core/fs-bridge/fs-abstraction';

/**
 * Test Doc: Scanner as Safety Net for Missed Watcher Events
 *
 * Critical: FileSystemWatcher can miss events due to:
 * - High filesystem activity
 * - VS Code extension host lag
 * - WSL filesystem bridging delays
 * - Network filesystem latency (remote workspaces)
 *
 * The scanner MUST detect jobs that watcher missed.
 */
describe('Scanner-Watcher Integration', () => {
  let testWorkspaceDir: string;
  let executeDir: string;
  let fs: VsCodeFilesystem;

  beforeEach(async () => {
    // Use actual workspace folder for Extension Host tests
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open - Extension Host tests require workspace');
    }

    testWorkspaceDir = workspaceFolders[0].uri.fsPath;
    executeDir = path.join(testWorkspaceDir, '.vsc-bridge-test', 'execute');
    fs = new VsCodeFilesystem();

    // Create test execute directory
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(executeDir));
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await vscode.workspace.fs.delete(
        vscode.Uri.file(path.join(testWorkspaceDir, '.vsc-bridge-test')),
        { recursive: true }
      );
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * T012: Scanner detects jobs when watcher misses events
   *
   * This simulates the scenario where FileSystemWatcher fails to fire
   * the onCreate event due to high load or filesystem lag.
   */
  it('T012: scanner should detect unclaimed job when watcher event is missed', async () => {
    // Arrange: Create job directory structure rapidly (simulating batch create)
    const jobId = 'missed-watcher-job';
    const jobDir = path.join(executeDir, jobId);

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(jobDir));

    // Write command.json (this might not trigger watcher if written too fast)
    const commandJson = {
      id: jobId,
      scriptName: 'test.script',
      params: {}
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(jobDir, 'command.json')),
      Buffer.from(JSON.stringify(commandJson, null, 2))
    );

    // Act: Scanner should detect this job even if watcher missed it
    const result = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(jobDir);
  });

  /**
   * T013: Scanner and watcher don't conflict (idempotent claim)
   *
   * This tests the race condition where both watcher and scanner try to
   * process the same job. The atomic claim mechanism should prevent double-processing.
   */
  it('T013: scanner and watcher should cooperate via atomic claim (no double-processing)', async () => {
    // Arrange: Create unclaimed job
    const jobId = 'race-condition-job';
    const jobDir = path.join(executeDir, jobId);

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(jobDir));
    const commandJson = {
      id: jobId,
      scriptName: 'test.script',
      params: {}
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(jobDir, 'command.json')),
      Buffer.from(JSON.stringify(commandJson, null, 2))
    );

    // Act: Scanner detects the job
    const scanResult1 = await scanForUnclaimedJobs(executeDir, 0, 10, fs);
    expect(scanResult1).toHaveLength(1);

    // Simulate watcher or another scanner claiming the job
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(jobDir, 'claimed.json')),
      Buffer.from(JSON.stringify({ bridgeId: 'test-bridge', timestamp: Date.now() }))
    );

    // Scanner should NOT detect the job anymore (claimed filter works)
    const scanResult2 = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(scanResult2).toHaveLength(0);
  });

  /**
   * Additional test: Remote workspace compatibility
   *
   * Verifies that scanner works with VsCodeFilesystem on remote workspaces
   * (this is why we use vscode.workspace.fs instead of Node fs)
   */
  it('should work with VsCodeFilesystem (remote workspace support)', async () => {
    // Arrange: Create job using VS Code API (works on remote workspaces)
    const jobId = 'remote-workspace-job';
    const jobDir = path.join(executeDir, jobId);

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(jobDir));
    const commandJson = {
      id: jobId,
      scriptName: 'remote.test',
      params: {}
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(jobDir, 'command.json')),
      Buffer.from(JSON.stringify(commandJson, null, 2))
    );

    // Act: Scanner should work with VsCodeFilesystem
    const result = await scanForUnclaimedJobs(executeDir, 0, 10, fs);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(jobDir);
  });
});
