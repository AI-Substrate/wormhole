import * as assert from 'assert';
import * as sinon from 'sinon';
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
 * Mock FileSystemWatcher for unit testing
 */
class MockFileSystemWatcher implements vscode.FileSystemWatcher {
  private createHandlers: Set<(uri: vscode.Uri) => void> = new Set();
  private deleteHandlers: Set<(uri: vscode.Uri) => void> = new Set();
  private changeHandlers: Set<(uri: vscode.Uri) => void> = new Set();

  ignoreCreateEvents = false;
  ignoreChangeEvents = true;
  ignoreDeleteEvents = false;

  onDidCreate(handler: (uri: vscode.Uri) => void): vscode.Disposable {
    this.createHandlers.add(handler);
    return { dispose: () => this.createHandlers.delete(handler) };
  }

  onDidDelete(handler: (uri: vscode.Uri) => void): vscode.Disposable {
    this.deleteHandlers.add(handler);
    return { dispose: () => this.deleteHandlers.delete(handler) };
  }

  onDidChange(handler: (uri: vscode.Uri) => void): vscode.Disposable {
    this.changeHandlers.add(handler);
    return { dispose: () => this.changeHandlers.delete(handler) };
  }

  // Test helper: trigger create event
  triggerCreate(filePath: string): void {
    if (!this.ignoreCreateEvents) {
      const uri = vscode.Uri.file(filePath);
      this.createHandlers.forEach(h => h(uri));
    }
  }

  // Test helper: trigger delete event
  triggerDelete(filePath: string): void {
    if (!this.ignoreDeleteEvents) {
      const uri = vscode.Uri.file(filePath);
      this.deleteHandlers.forEach(h => h(uri));
    }
  }

  dispose(): void {
    this.createHandlers.clear();
    this.deleteHandlers.clear();
    this.changeHandlers.clear();
  }
}

suite('FileSystem Bridge - Watcher Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let tempDir: string;
  let bridgeDir: string;
  let executeDir: string;
  let mockWatcher: MockFileSystemWatcher;
  let originalCreateFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher;

  setup(async () => {
    sandbox = sinon.createSandbox();

    // Create real temp directories
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vsc-bridge-watcher-test-'));
    bridgeDir = path.join(tempDir, '.vsc-bridge');
    executeDir = path.join(bridgeDir, 'execute');

    await fsPromises.mkdir(executeDir, { recursive: true });

    // Mock VS Code's createFileSystemWatcher
    mockWatcher = new MockFileSystemWatcher();
    originalCreateFileSystemWatcher = vscode.workspace.createFileSystemWatcher;
    (vscode.workspace as any).createFileSystemWatcher = () => mockWatcher;
  });

  teardown(async () => {
    sandbox.restore();

    // Restore original function
    (vscode.workspace as any).createFileSystemWatcher = originalCreateFileSystemWatcher;

    // Clean up temp directory
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Failed to clean up temp dir:', err);
    }
  });

  test('Watcher detects new command.json files', async () => {
    // Create a job directory
    const jobId = newJobId();
    const jobDir = path.join(executeDir, jobId);
    await fsPromises.mkdir(jobDir, { recursive: true });

    // Track if command was processed
    let commandProcessed = false;
    let processedCommand: CommandJson | undefined;

    // Create mock script executor
    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      commandProcessed = true;
      processedCommand = command;
      return { result: 'success' };
    };

    // Mock workspace folder
    const mockWorkspace: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    };

    sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockWorkspace]);

    // Initialize bridge with our executor
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

    const bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

    // Write command.json
    const command: CommandJson = {
      id: 'req-123',
      scriptName: 'test.script',
      params: { foo: 'bar' },
      timestamp: new Date().toISOString()
    };
    const commandPath = path.join(jobDir, 'command.json');
    await fsPromises.writeFile(commandPath, JSON.stringify(command, null, 2));

    // Trigger watcher
    mockWatcher.triggerCreate(commandPath);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify command was processed
    assert.strictEqual(commandProcessed, true, 'Command should have been processed');
    assert.deepStrictEqual(processedCommand?.params, { foo: 'bar' }, 'Command params should match');

    // Verify response was written
    const responsePath = path.join(jobDir, 'response.json');
    const responseExists = fs.existsSync(responsePath);
    assert.strictEqual(responseExists, true, 'Response file should exist');

    // Clean up
    bridgeManager.dispose();
  });

  test('Atomic claiming prevents double processing', async () => {
    const jobId = newJobId();
    const jobDir = path.join(executeDir, jobId);
    await fsPromises.mkdir(jobDir, { recursive: true });

    let processCount = 0;
    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      processCount++;
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 50));
      return { result: 'success' };
    };

    const mockWorkspace: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    };

    sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockWorkspace]);

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

    // Initialize TWO bridge managers (simulating race condition)
    const bridge1 = await initializeFileSystemBridge(mockContext, scriptExecutor);
    const bridge2 = await initializeFileSystemBridge(mockContext, scriptExecutor);

    // Write command
    const command: CommandJson = {
      id: 'req-456',
      scriptName: 'test.script',
      params: {},
      timestamp: new Date().toISOString()
    };
    const commandPath = path.join(jobDir, 'command.json');
    await fsPromises.writeFile(commandPath, JSON.stringify(command, null, 2));

    // Both watchers see the file
    mockWatcher.triggerCreate(commandPath);
    mockWatcher.triggerCreate(commandPath);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 200));

    // Only one should have processed
    assert.strictEqual(processCount, 1, 'Command should only be processed once');

    // Verify claimed file exists
    const claimedPath = path.join(jobDir, 'claimed.json');
    assert.strictEqual(fs.existsSync(claimedPath), true, 'Claimed file should exist');

    // Clean up
    bridge1.dispose();
    bridge2.dispose();
  });

  test('Watcher handles deleted command files gracefully', async () => {
    const jobId = newJobId();
    const jobDir = path.join(executeDir, jobId);
    await fsPromises.mkdir(jobDir, { recursive: true });

    let deleteLogged = false;
    const originalLog = console.log;
    console.log = (msg: string) => {
      if (msg.includes('Command deleted')) {
        deleteLogged = true;
      }
      originalLog(msg);
    };

    const mockWorkspace: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    };

    sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockWorkspace]);

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

    const bridgeManager = await initializeFileSystemBridge(mockContext);

    // Trigger delete event
    const commandPath = path.join(jobDir, 'command.json');
    mockWatcher.triggerDelete(commandPath);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 50));

    // Currently we don't log deletes in the watcher, but we could
    // The watcher ignores them silently which is fine

    // Restore console.log
    console.log = originalLog;

    // Clean up
    bridgeManager.dispose();
  });

  test('Watcher processes multiple jobs sequentially', async () => {
    const processedJobs: string[] = [];

    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      processedJobs.push(command.id);
      await new Promise(resolve => setTimeout(resolve, 10));
      return { result: 'success' };
    };

    const mockWorkspace: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    };

    sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockWorkspace]);

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

    const bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

    // Create multiple jobs
    const jobIds = [newJobId(), newJobId(), newJobId()];

    for (const jobId of jobIds) {
      const jobDir = path.join(executeDir, jobId);
      await fsPromises.mkdir(jobDir, { recursive: true });

      const command: CommandJson = {
        id: jobId,
        scriptName: 'test.script',
        params: {},
        timestamp: new Date().toISOString()
      };

      const commandPath = path.join(jobDir, 'command.json');
      await fsPromises.writeFile(commandPath, JSON.stringify(command, null, 2));

      // Trigger watcher for each
      mockWatcher.triggerCreate(commandPath);
    }

    // Wait for all to process
    await new Promise(resolve => setTimeout(resolve, 200));

    // All should be processed
    assert.strictEqual(processedJobs.length, 3, 'All jobs should be processed');
    assert.deepStrictEqual(processedJobs.sort(), jobIds.sort(), 'All job IDs should match');

    // Clean up
    bridgeManager.dispose();
  });

  test('Watcher ignores non-command.json files', async () => {
    let processCount = 0;

    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      processCount++;
      return { result: 'success' };
    };

    const mockWorkspace: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    };

    sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockWorkspace]);

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

    const bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

    // Create job directory
    const jobDir = path.join(executeDir, 'test-job');
    await fsPromises.mkdir(jobDir, { recursive: true });

    // Trigger events for non-command files
    mockWatcher.triggerCreate(path.join(jobDir, 'response.json'));
    mockWatcher.triggerCreate(path.join(jobDir, 'events.ndjson'));
    mockWatcher.triggerCreate(path.join(jobDir, 'claimed.json'));

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));

    // Nothing should be processed
    assert.strictEqual(processCount, 0, 'No commands should be processed for non-command files');

    // Clean up
    bridgeManager.dispose();
  });

  test('Watcher handles errors in script executor', async () => {
    const jobId = newJobId();
    const jobDir = path.join(executeDir, jobId);
    await fsPromises.mkdir(jobDir, { recursive: true });

    const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter) => {
      throw new Error('Test error in script executor');
    };

    const mockWorkspace: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    };

    sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockWorkspace]);

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

    const bridgeManager = await initializeFileSystemBridge(mockContext, scriptExecutor);

    // Write command
    const command: CommandJson = {
      id: 'req-error',
      scriptName: 'test.script',
      params: {},
      timestamp: new Date().toISOString()
    };
    const commandPath = path.join(jobDir, 'command.json');
    await fsPromises.writeFile(commandPath, JSON.stringify(command, null, 2));

    // Trigger watcher
    mockWatcher.triggerCreate(commandPath);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Error response should be written
    const errorPath = path.join(jobDir, 'error.json');
    assert.strictEqual(fs.existsSync(errorPath), true, 'Error file should exist');

    const errorData = JSON.parse(await fsPromises.readFile(errorPath, 'utf8'));
    assert.strictEqual(errorData.message, 'Test error in script executor');

    // Clean up
    bridgeManager.dispose();
  });
});