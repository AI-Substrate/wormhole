import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  initializeFileSystemBridge,
  BridgeManager,
  EventWriter,
  CommandJson
} from '../../../src/core/fs-bridge';
import { newJobId } from '../../../src/core/fs-bridge/ids';
import { writeJsonAtomicAsync } from '../../../src/core/fs-bridge/io';

/**
 * Tests for startup catch-up functionality
 *
 * These tests verify that the bridge correctly processes pre-existing
 * unclaimed jobs when it starts up, preventing orphaned commands.
 */
suite('FileSystem Bridge - Startup Catch-up', () => {
  let tempDir: string;
  let bridgeDir: string;
  let executeDir: string;
  let bridgeManager: BridgeManager | undefined;

  setup(async () => {
    // Create real temp directories
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'catchup-test-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    executeDir = path.join(bridgeDir, 'execute');

    await fsPromises.mkdir(executeDir, { recursive: true });
  });

  teardown(async () => {
    // Dispose bridge manager
    if (bridgeManager) {
      bridgeManager.dispose();
      bridgeManager = undefined;
    }

    // Clean up temp directory
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Failed to clean up temp dir:', err);
    }
  });

  test('Processes pre-existing unclaimed jobs on startup', async function() {
    this.timeout(5000);

    const processedJobs: string[] = [];

    // Create some jobs BEFORE starting the bridge
    const preExistingJobs = [newJobId(), newJobId(), newJobId()];

    for (const jobId of preExistingJobs) {
      const jobDir = path.join(executeDir, jobId);
      await fsPromises.mkdir(jobDir, { recursive: true });

      const command: CommandJson = {
        id: jobId,
        scriptName: 'startup.test',
        params: { preExisting: true },
        timestamp: new Date().toISOString()
      };

      // Write command atomically
      await writeJsonAtomicAsync(
        path.join(jobDir, 'command.json'),
        command
      );
    }

    // Now start the bridge - it should catch up on these jobs
    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      processedJobs.push(command.id);
      eventWriter.writeLog('info', `Catch-up processed: ${command.id}`);
      return { result: 'catch-up-success' };
    };

    // Create mock context
    const mockContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file(tempDir),
      extensionPath: tempDir,
      globalState: {} as any,
      workspaceState: {} as any,
      storagePath: tempDir,
      globalStoragePath: tempDir,
      logPath: tempDir,
      extensionMode: vscode.ExtensionMode.Test,
      asAbsolutePath: (p: string) => path.join(tempDir, p)
    } as vscode.ExtensionContext;

    // Mock workspace
    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    (vscode.workspace as any).workspaceFolders = [{
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    }];

    try {
      // Initialize bridge - should trigger catch-up
      bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

      // Wait for catch-up to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify all pre-existing jobs were processed
      assert.strictEqual(
        processedJobs.length,
        preExistingJobs.length,
        `Should process all ${preExistingJobs.length} pre-existing jobs`
      );

      // Verify the specific job IDs
      for (const jobId of preExistingJobs) {
        assert.ok(
          processedJobs.includes(jobId),
          `Job ${jobId} should have been processed`
        );
      }

      // Verify response files were created
      for (const jobId of preExistingJobs) {
        const responsePath = path.join(executeDir, jobId, 'response.json');
        const responseExists = await fsPromises.access(responsePath)
          .then(() => true)
          .catch(() => false);
        assert.ok(responseExists, `Response should exist for ${jobId}`);

        // Verify claimed file exists
        const claimedPath = path.join(executeDir, jobId, 'claimed.json');
        const claimedExists = await fsPromises.access(claimedPath)
          .then(() => true)
          .catch(() => false);
        assert.ok(claimedExists, `Claimed file should exist for ${jobId}`);

        // Verify done marker exists
        const donePath = path.join(executeDir, jobId, 'done');
        const doneExists = await fsPromises.access(donePath)
          .then(() => true)
          .catch(() => false);
        assert.ok(doneExists, `Done marker should exist for ${jobId}`);
      }
    } finally {
      // Restore workspace
      (vscode.workspace as any).workspaceFolders = originalWorkspaceFolders;
    }
  });

  test('Ignores already claimed jobs on startup', async function() {
    this.timeout(5000);

    const processedJobs: string[] = [];

    // Create one unclaimed and one claimed job
    const unclaimedId = newJobId();
    const claimedId = newJobId();

    // Create unclaimed job
    const unclaimedDir = path.join(executeDir, unclaimedId);
    await fsPromises.mkdir(unclaimedDir, { recursive: true });
    await writeJsonAtomicAsync(
      path.join(unclaimedDir, 'command.json'),
      {
        id: unclaimedId,
        scriptName: 'test',
        params: {},
        timestamp: new Date().toISOString()
      }
    );

    // Create claimed job
    const claimedDir = path.join(executeDir, claimedId);
    await fsPromises.mkdir(claimedDir, { recursive: true });
    await writeJsonAtomicAsync(
      path.join(claimedDir, 'command.json'),
      {
        id: claimedId,
        scriptName: 'test',
        params: {},
        timestamp: new Date().toISOString()
      }
    );
    // Mark as claimed
    await writeJsonAtomicAsync(
      path.join(claimedDir, 'claimed.json'),
      {
        bridgeId: 'other-instance',
        claimedAt: new Date().toISOString(),
        pid: 12345,
        leaseExpiresAt: new Date(Date.now() + 60000).toISOString()
      }
    );

    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      processedJobs.push(command.id);
      return { result: 'success' };
    };

    const mockContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file(tempDir),
      extensionPath: tempDir,
      globalState: {} as any,
      workspaceState: {} as any,
      storagePath: tempDir,
      globalStoragePath: tempDir,
      logPath: tempDir,
      extensionMode: vscode.ExtensionMode.Test,
      asAbsolutePath: (p: string) => path.join(tempDir, p)
    } as vscode.ExtensionContext;

    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    (vscode.workspace as any).workspaceFolders = [{
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    }];

    try {
      bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

      // Wait for catch-up
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should only process the unclaimed job
      assert.strictEqual(processedJobs.length, 1, 'Should process only unclaimed job');
      assert.strictEqual(processedJobs[0], unclaimedId, 'Should process correct job');
      assert.ok(!processedJobs.includes(claimedId), 'Should not process claimed job');
    } finally {
      (vscode.workspace as any).workspaceFolders = originalWorkspaceFolders;
    }
  });

  test('Ignores jobs marked as done on startup', async function() {
    this.timeout(5000);

    const processedJobs: string[] = [];

    // Create a job that's already done
    const doneJobId = newJobId();
    const doneDir = path.join(executeDir, doneJobId);
    await fsPromises.mkdir(doneDir, { recursive: true });

    await writeJsonAtomicAsync(
      path.join(doneDir, 'command.json'),
      {
        id: doneJobId,
        scriptName: 'test',
        params: {},
        timestamp: new Date().toISOString()
      }
    );

    // Mark as done
    await fsPromises.writeFile(path.join(doneDir, 'done'), '');

    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      processedJobs.push(command.id);
      return { result: 'success' };
    };

    const mockContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file(tempDir),
      extensionPath: tempDir,
      globalState: {} as any,
      workspaceState: {} as any,
      storagePath: tempDir,
      globalStoragePath: tempDir,
      logPath: tempDir,
      extensionMode: vscode.ExtensionMode.Test,
      asAbsolutePath: (p: string) => path.join(tempDir, p)
    } as vscode.ExtensionContext;

    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    (vscode.workspace as any).workspaceFolders = [{
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    }];

    try {
      bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

      // Wait for catch-up
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should not process the done job
      assert.strictEqual(processedJobs.length, 0, 'Should not process done jobs');
    } finally {
      (vscode.workspace as any).workspaceFolders = originalWorkspaceFolders;
    }
  });

  test('Periodic safety scan finds missed jobs', async function() {
    this.timeout(10000);

    const processedJobs: string[] = [];

    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      processedJobs.push(command.id);
      return { result: 'safety-scan-success' };
    };

    const mockContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file(tempDir),
      extensionPath: tempDir,
      globalState: {} as any,
      workspaceState: {} as any,
      storagePath: tempDir,
      globalStoragePath: tempDir,
      logPath: tempDir,
      extensionMode: vscode.ExtensionMode.Test,
      asAbsolutePath: (p: string) => path.join(tempDir, p)
    } as vscode.ExtensionContext;

    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    (vscode.workspace as any).workspaceFolders = [{
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    }];

    try {
      // Start bridge first
      bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

      // Wait for initial setup
      await new Promise(resolve => setTimeout(resolve, 500));

      // Now create a job AFTER startup (simulating a missed watcher event)
      const missedJobId = newJobId();
      const missedDir = path.join(executeDir, missedJobId);
      await fsPromises.mkdir(missedDir, { recursive: true });

      await writeJsonAtomicAsync(
        path.join(missedDir, 'command.json'),
        {
          id: missedJobId,
          scriptName: 'missed.test',
          params: { missedByWatcher: true },
          timestamp: new Date().toISOString()
        }
      );

      // Wait for safety scan to pick it up (scan runs every 2 seconds)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Should have been processed by safety scan
      assert.ok(
        processedJobs.includes(missedJobId),
        'Safety scan should process missed job'
      );

      // Verify it was fully processed
      const responsePath = path.join(missedDir, 'response.json');
      const responseExists = await fsPromises.access(responsePath)
        .then(() => true)
        .catch(() => false);
      assert.ok(responseExists, 'Response should exist for safety-scanned job');
    } finally {
      (vscode.workspace as any).workspaceFolders = originalWorkspaceFolders;
    }
  });
});