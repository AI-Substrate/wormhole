import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promises as fsPromises } from 'fs';
import * as vscode from 'vscode';
import { initializeFileSystemBridge } from '../../src/core/fs-bridge';
import { CommandJson, ResponseJson, ErrorJson, EventJson } from '../../src/core/fs-bridge/types';

describe('Filesystem Bridge Integration', () => {
  let tempDir: string;
  let mockContext: vscode.ExtensionContext;
  let disposables: Array<{ dispose: () => void }> = [];

  beforeEach(async () => {
    // Create temp workspace
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vsc-bridge-integration-'));

    // Mock VS Code APIs
    (global as any).vscode = {
      workspace: {
        workspaceFolders: [{
          uri: { fsPath: tempDir },
          name: 'test-workspace',
          index: 0
        }],
        createFileSystemWatcher: (pattern: any) => {
          // Simple mock watcher
          const listeners = {
            onCreate: [] as Array<(uri: any) => void>,
            onDelete: [] as Array<(uri: any) => void>
          };

          return {
            onDidCreate: (callback: (uri: any) => void) => {
              listeners.onCreate.push(callback);
            },
            onDidDelete: (callback: (uri: any) => void) => {
              listeners.onDelete.push(callback);
            },
            dispose: () => {
              listeners.onCreate = [];
              listeners.onDelete = [];
            },
            // Trigger for testing
            _trigger: (eventType: 'create' | 'delete', filePath: string) => {
              const uri = { fsPath: filePath };
              if (eventType === 'create') {
                listeners.onCreate.forEach(cb => cb(uri));
              } else {
                listeners.onDelete.forEach(cb => cb(uri));
              }
            }
          };
        }
      }
    };

    mockContext = {
      subscriptions: disposables
    } as any;
  });

  afterEach(async () => {
    // Clean up
    for (const disposable of disposables) {
      disposable.dispose();
    }
    disposables = [];

    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore
    }
  });

  describe('end-to-end command processing', () => {
    it('should process command from creation to completion', async function() {
      this.timeout(5000);

      let processedCommand: CommandJson | null = null;
      let eventLog: EventJson[] = [];

      // Initialize bridge with test executor
      const bridge = await initializeFileSystemBridge(mockContext, async (cmd, eventWriter) => {
        processedCommand = cmd;

        // Write some events
        eventWriter.writeProgress(25, 'Starting test');
        eventWriter.writeLog('info', 'Processing command');
        eventWriter.writeProgress(50, 'Halfway done');
        eventWriter.writeProgress(100, 'Complete');

        // Return test result
        return {
          success: true,
          input: cmd.params,
          timestamp: new Date().toISOString()
        };
      });

      // Create a command
      const executeDir = path.join(tempDir, '.vsc-bridge', 'execute');
      const jobId = `20250101T120000000Z-0001-test`;
      const jobDir = path.join(executeDir, jobId);
      await fsPromises.mkdir(jobDir, { recursive: true });

      const command: CommandJson = {
        version: 1,
        clientId: 'test-client',
        id: jobId,
        createdAt: new Date().toISOString(),
        scriptName: 'test.script',
        params: { value: 42, text: 'hello' }
      };

      // Write command atomically
      const commandPath = path.join(jobDir, 'command.json');
      const tmpPath = `${commandPath}.tmp`;
      await fsPromises.writeFile(tmpPath, JSON.stringify(command, null, 2));
      await fsPromises.rename(tmpPath, commandPath);

      // Trigger the watcher
      const watcher = (vscode.workspace.createFileSystemWatcher as any)();
      watcher._trigger('create', commandPath);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify command was processed
      assert.ok(processedCommand);
      assert.strictEqual(processedCommand!.scriptName, 'test.script');
      assert.strictEqual(processedCommand!.params.value, 42);

      // Verify response was written
      const responsePath = path.join(jobDir, 'response.json');
      assert.ok(fs.existsSync(responsePath));

      const response = JSON.parse(
        await fsPromises.readFile(responsePath, 'utf8')
      ) as ResponseJson;

      assert.strictEqual(response.ok, true);
      assert.strictEqual(response.type, 'success');
      assert.strictEqual(response.data.success, true);
      assert.strictEqual(response.data.input.value, 42);

      // Verify events were written
      const eventsPath = path.join(jobDir, 'events.ndjson');
      assert.ok(fs.existsSync(eventsPath));

      const eventLines = (await fsPromises.readFile(eventsPath, 'utf8'))
        .trim()
        .split('\n');
      const events = eventLines.map(line => JSON.parse(line) as EventJson);

      assert.ok(events.length >= 4);
      assert.strictEqual(events[0].type, 'log');
      assert.strictEqual(events[1].type, 'progress');
      assert.strictEqual(events[1].pct, 25);

      // Verify done marker
      assert.ok(fs.existsSync(path.join(jobDir, 'done')));

      // Verify claim file
      const claimedPath = path.join(jobDir, 'claimed.json');
      assert.ok(fs.existsSync(claimedPath));
    });

    it('should handle executor errors gracefully', async function() {
      this.timeout(5000);

      // Initialize bridge with failing executor
      const bridge = await initializeFileSystemBridge(mockContext, async (cmd, eventWriter) => {
        eventWriter.writeLog('error', 'About to fail');
        throw new Error('Test failure');
      });

      // Create command
      const executeDir = path.join(tempDir, '.vsc-bridge', 'execute');
      const jobId = `20250101T120000001Z-0001-fail`;
      const jobDir = path.join(executeDir, jobId);
      await fsPromises.mkdir(jobDir, { recursive: true });

      const command: CommandJson = {
        version: 1,
        clientId: 'test-client',
        id: jobId,
        createdAt: new Date().toISOString(),
        scriptName: 'failing.script',
        params: {}
      };

      const commandPath = path.join(jobDir, 'command.json');
      await fsPromises.writeFile(commandPath, JSON.stringify(command));

      // Trigger processing
      const watcher = (vscode.workspace.createFileSystemWatcher as any)();
      watcher._trigger('create', commandPath);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should have error response
      const errorPath = path.join(jobDir, 'error.json');
      assert.ok(fs.existsSync(errorPath));

      const error = JSON.parse(
        await fsPromises.readFile(errorPath, 'utf8')
      ) as ErrorJson;

      assert.strictEqual(error.ok, false);
      assert.strictEqual(error.type, 'error');
      assert.ok(error.error.message.includes('Test failure'));

      // Should still have done marker
      assert.ok(fs.existsSync(path.join(jobDir, 'done')));
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple simultaneous commands', async function() {
      this.timeout(10000);

      const processedCommands: CommandJson[] = [];

      // Initialize bridge
      const bridge = await initializeFileSystemBridge(mockContext, async (cmd, eventWriter) => {
        processedCommands.push(cmd);

        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

        eventWriter.writeProgress(100, 'Done');
        return { id: cmd.id, processed: true };
      });

      const executeDir = path.join(tempDir, '.vsc-bridge', 'execute');
      const watcher = (vscode.workspace.createFileSystemWatcher as any)();

      // Create multiple commands
      const commandCount = 10;
      const commands: CommandJson[] = [];

      for (let i = 0; i < commandCount; i++) {
        const jobId = `20250101T120000000Z-${String(i).padStart(4, '0')}-test`;
        const jobDir = path.join(executeDir, jobId);
        await fsPromises.mkdir(jobDir, { recursive: true });

        const command: CommandJson = {
          version: 1,
          clientId: 'test-client',
          id: jobId,
          createdAt: new Date().toISOString(),
          scriptName: 'concurrent.test',
          params: { index: i }
        };

        commands.push(command);

        const commandPath = path.join(jobDir, 'command.json');
        await fsPromises.writeFile(commandPath, JSON.stringify(command));

        // Trigger watcher
        watcher._trigger('create', commandPath);
      }

      // Wait for all to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // All should be processed
      assert.strictEqual(processedCommands.length, commandCount);

      // Verify all completed
      for (const command of commands) {
        const jobDir = path.join(executeDir, command.id);
        assert.ok(fs.existsSync(path.join(jobDir, 'done')));
        assert.ok(fs.existsSync(path.join(jobDir, 'response.json')));
      }
    });
  });

  describe('statistics', () => {
    it('should provide accurate bridge statistics', async () => {
      const bridge = await initializeFileSystemBridge(mockContext, async (cmd) => {
        return { result: 'ok' };
      });

      // Create some test jobs
      const executeDir = path.join(tempDir, '.vsc-bridge', 'execute');

      // Completed job
      const job1 = path.join(executeDir, 'completed-job');
      await fsPromises.mkdir(job1, { recursive: true });
      await fsPromises.writeFile(path.join(job1, 'done'), '');

      // Incomplete job
      const job2 = path.join(executeDir, 'incomplete-job');
      await fsPromises.mkdir(job2, { recursive: true });
      await fsPromises.writeFile(path.join(job2, 'command.json'), '{}');

      // Get statistics
      const stats = await bridge.getStatistics();

      assert.ok(stats.bridges.length > 0);
      const bridgeStats = stats.bridges[0];

      assert.strictEqual(bridgeStats.isOwner, true);
      assert.strictEqual(bridgeStats.healthy, true);
      assert.strictEqual(bridgeStats.jobs.total, 2);
      assert.strictEqual(bridgeStats.jobs.completed, 1);
      assert.strictEqual(bridgeStats.jobs.incomplete, 1);
    });
  });

  describe('disposal', () => {
    it('should clean up all timers and watchers on dispose', async function() {
      this.timeout(5000);

      // Track active timers
      const originalSetInterval = global.setInterval;
      const activeTimers = new Set<NodeJS.Timeout>();

      global.setInterval = function(...args: any[]): NodeJS.Timeout {
        const timer = originalSetInterval.apply(global, args as any);
        activeTimers.add(timer);
        return timer;
      };

      const originalClearInterval = global.clearInterval;
      global.clearInterval = function(timer: NodeJS.Timeout | undefined) {
        if (timer) {
          activeTimers.delete(timer);
          originalClearInterval(timer);
        }
      };

      // Initialize bridge
      const bridge = await initializeFileSystemBridge(mockContext, async (cmd) => {
        return { result: 'ok' };
      });

      // Verify timers were created
      const initialTimerCount = activeTimers.size;
      assert.ok(initialTimerCount > 0, 'Should have created timers');

      // Dispose the bridge
      bridge.dispose();

      // All timers should be cleared
      assert.strictEqual(activeTimers.size, 0, `Expected 0 active timers after dispose, found ${activeTimers.size}`);

      // Verify watcher was disposed
      const watcher = (vscode.workspace.createFileSystemWatcher as any)();
      assert.ok(watcher.disposed, 'FileSystemWatcher should be disposed');

      // Restore original functions
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    });

    it('should be safe to dispose multiple times', async () => {
      const bridge = await initializeFileSystemBridge(mockContext, async (cmd) => {
        return { result: 'ok' };
      });

      // Should not throw
      bridge.dispose();
      bridge.dispose();
      bridge.dispose();
    });
  });
});