import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
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

/**
 * Integration tests for FileSystemWatcher
 * These tests use real file system operations and VS Code's actual FileSystemWatcher
 */
suite('FileSystem Bridge - Watcher Integration Tests', () => {
  let tempDir: string;
  let bridgeDir: string;
  let executeDir: string;
  let bridgeManager: BridgeManager | undefined;

  setup(async () => {
    // Create real temp directories
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vsc-bridge-integ-test-'));
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

  test('Real file creation triggers watcher', async function() {
    this.timeout(5000); // Increase timeout for real FS operations

    // Track command processing
    let commandProcessed = false;
    let processedCommand: CommandJson | undefined;
    const processedPromise = new Promise<void>((resolve) => {
      const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
        commandProcessed = true;
        processedCommand = command;
        eventWriter.writeLog('info', 'Processing command in integration test');
        resolve();
        return { result: 'integration-test-success' };
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

      // Mock workspace pointing to our temp directory
      const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
      (vscode.workspace as any).workspaceFolders = [{
        uri: vscode.Uri.file(tempDir),
        name: 'test-workspace',
        index: 0
      }];

      // Initialize bridge
      initializeFileSystemBridge(mockContext, scriptExecutor).then(bm => {
        bridgeManager = bm;
      });

      // Restore after test
      setTimeout(() => {
        (vscode.workspace as any).workspaceFolders = originalWorkspaceFolders;
      }, 4000);
    });

    // Wait for bridge initialization
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create job with real file system
    const jobId = newJobId();
    const jobDir = path.join(executeDir, jobId);
    await fsPromises.mkdir(jobDir, { recursive: true });

    // Write command file
    const command: CommandJson = {
      id: jobId,
      scriptName: 'integration.test',
      params: { testType: 'real-fs' },
      timestamp: new Date().toISOString()
    };

    const commandPath = path.join(jobDir, 'command.json');
    await fsPromises.writeFile(commandPath, JSON.stringify(command, null, 2));

    // Wait for watcher to process
    await Promise.race([
      processedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
    ]);

    // Verify processing
    assert.strictEqual(commandProcessed, true, 'Command should be processed');
    assert.strictEqual(processedCommand?.id, jobId, 'Job ID should match');
    assert.deepStrictEqual(processedCommand?.params, { testType: 'real-fs' });

    // Verify response file was created
    const responsePath = path.join(jobDir, 'response.json');
    const responseExists = await fsPromises.access(responsePath)
      .then(() => true)
      .catch(() => false);
    assert.strictEqual(responseExists, true, 'Response file should exist');

    // Verify claimed file was created
    const claimedPath = path.join(jobDir, 'claimed.json');
    const claimedExists = await fsPromises.access(claimedPath)
      .then(() => true)
      .catch(() => false);
    assert.strictEqual(claimedExists, true, 'Claimed file should exist');
  });

  test('Rapid file creation stress test', async function() {
    this.timeout(10000);

    const processedCommands = new Set<string>();
    const expectedCount = 10;

    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      processedCommands.add(command.id);
      // Simulate varying processing times
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      return { result: 'success', id: command.id };
    };

    // Initialize bridge
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

    bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

    // Create multiple jobs rapidly
    const createPromises: Promise<void>[] = [];

    for (let i = 0; i < expectedCount; i++) {
      const promise = (async () => {
        const jobId = newJobId();
        const jobDir = path.join(executeDir, jobId);
        await fsPromises.mkdir(jobDir, { recursive: true });

        const command: CommandJson = {
          id: jobId,
          scriptName: 'stress.test',
          params: { index: i },
          timestamp: new Date().toISOString()
        };

        const commandPath = path.join(jobDir, 'command.json');
        await fsPromises.writeFile(commandPath, JSON.stringify(command, null, 2));
      })();

      createPromises.push(promise);

      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    await Promise.all(createPromises);

    // Wait for processing with timeout
    const startTime = Date.now();
    while (processedCommands.size < expectedCount && Date.now() - startTime < 8000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Restore workspace
    (vscode.workspace as any).workspaceFolders = originalWorkspaceFolders;

    // Verify all were processed
    assert.strictEqual(
      processedCommands.size,
      expectedCount,
      `All ${expectedCount} commands should be processed`
    );
  });

  test('Cancellation during processing', async function() {
    this.timeout(5000);

    let cancelDetected = false;
    const jobId = newJobId();

    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      const jobDir = path.join(executeDir, jobId);

      // Simulate long running operation with cancellation checks
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check for cancellation
        const cancelPath = path.join(jobDir, 'cancel');
        if (fs.existsSync(cancelPath)) {
          cancelDetected = true;
          throw new Error('Operation cancelled by user');
        }

        eventWriter.writeLog('info', `Progress: ${i + 1}/10`);
      }

      return { result: 'completed' };
    };

    // Initialize bridge
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

    bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

    // Create job
    const jobDir = path.join(executeDir, jobId);
    await fsPromises.mkdir(jobDir, { recursive: true });

    const command: CommandJson = {
      id: jobId,
      scriptName: 'cancel.test',
      params: {},
      timestamp: new Date().toISOString()
    };

    const commandPath = path.join(jobDir, 'command.json');
    await fsPromises.writeFile(commandPath, JSON.stringify(command, null, 2));

    // Wait a bit for processing to start
    await new Promise(resolve => setTimeout(resolve, 300));

    // Create cancel file
    const cancelPath = path.join(jobDir, 'cancel');
    await fsPromises.writeFile(cancelPath, '');

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Restore workspace
    (vscode.workspace as any).workspaceFolders = originalWorkspaceFolders;

    // Verify cancellation was detected
    assert.strictEqual(cancelDetected, true, 'Cancellation should be detected');

    // Verify error file was created
    const errorPath = path.join(jobDir, 'error.json');
    const errorExists = fs.existsSync(errorPath);
    assert.strictEqual(errorExists, true, 'Error file should exist');

    if (errorExists) {
      const errorData = JSON.parse(await fsPromises.readFile(errorPath, 'utf8'));
      assert.strictEqual(errorData.message, 'Operation cancelled by user');
    }
  });

  test('Multi-workspace scenario', async function() {
    this.timeout(5000);

    // Create two workspace directories
    const workspace1 = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vsc-ws1-'));
    const workspace2 = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vsc-ws2-'));

    const bridge1Dir = path.join(workspace1, '.vsc-bridge', 'execute');
    const bridge2Dir = path.join(workspace2, '.vsc-bridge', 'execute');

    await fsPromises.mkdir(bridge1Dir, { recursive: true });
    await fsPromises.mkdir(bridge2Dir, { recursive: true });

    const processedByWorkspace: { [key: string]: string[] } = {
      ws1: [],
      ws2: []
    };

    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      const workspace = command.params.workspace as string;
      processedByWorkspace[workspace].push(command.id);
      return { result: 'success', workspace };
    };

    // Mock multiple workspace folders
    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    (vscode.workspace as any).workspaceFolders = [
      {
        uri: vscode.Uri.file(workspace1),
        name: 'workspace1',
        index: 0
      },
      {
        uri: vscode.Uri.file(workspace2),
        name: 'workspace2',
        index: 1
      }
    ];

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

    bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

    // Create jobs in each workspace
    const job1Id = newJobId();
    const job1Dir = path.join(bridge1Dir, job1Id);
    await fsPromises.mkdir(job1Dir, { recursive: true });

    const command1: CommandJson = {
      id: job1Id,
      scriptName: 'test.script',
      params: { workspace: 'ws1' },
      timestamp: new Date().toISOString()
    };
    await fsPromises.writeFile(
      path.join(job1Dir, 'command.json'),
      JSON.stringify(command1, null, 2)
    );

    const job2Id = newJobId();
    const job2Dir = path.join(bridge2Dir, job2Id);
    await fsPromises.mkdir(job2Dir, { recursive: true });

    const command2: CommandJson = {
      id: job2Id,
      scriptName: 'test.script',
      params: { workspace: 'ws2' },
      timestamp: new Date().toISOString()
    };
    await fsPromises.writeFile(
      path.join(job2Dir, 'command.json'),
      JSON.stringify(command2, null, 2)
    );

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Restore workspace
    (vscode.workspace as any).workspaceFolders = originalWorkspaceFolders;

    // Verify both workspaces processed their jobs
    assert.strictEqual(
      processedByWorkspace.ws1.includes(job1Id),
      true,
      'Workspace 1 should process its job'
    );
    assert.strictEqual(
      processedByWorkspace.ws2.includes(job2Id),
      true,
      'Workspace 2 should process its job'
    );

    // Clean up
    await fsPromises.rm(workspace1, { recursive: true, force: true });
    await fsPromises.rm(workspace2, { recursive: true, force: true });
  });
});