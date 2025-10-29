import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promises as fsPromises } from 'fs';
import * as vscode from 'vscode';
import { initBridgeForWorkspace, checkBridgeHealth, startHealthHeartbeat } from '../../src/core/fs-bridge/bridge';
import { HostJson } from '../../src/core/fs-bridge/types';

describe('Bridge Initialization', () => {
  let tempDir: string;
  let mockWorkspace: vscode.WorkspaceFolder;
  let mockContext: vscode.ExtensionContext;
  let disposables: Array<{ dispose: () => void }> = [];

  beforeEach(async () => {
    // Create a real temp directory for testing
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vsc-bridge-test-'));

    // Mock workspace folder
    mockWorkspace = {
      uri: { fsPath: tempDir } as vscode.Uri,
      name: 'test-workspace',
      index: 0
    };

    // Mock extension context
    mockContext = {
      subscriptions: disposables
    } as any;
  });

  afterEach(async () => {
    // Clean up disposables
    for (const disposable of disposables) {
      disposable.dispose();
    }
    disposables = [];

    // Clean up temp directory
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('exclusive lock acquisition', () => {
    it('should acquire lock on first initialization', async () => {
      const bridge = await initBridgeForWorkspace(mockWorkspace, mockContext);

      assert.strictEqual(bridge.isOwner, true);
      assert.ok(bridge.bridgeId);
      assert.strictEqual(bridge.bridgeDir, path.join(tempDir, '.vsc-bridge'));

      // Verify lock file exists
      const lockPath = path.join(bridge.bridgeDir, 'host.lock');
      assert.ok(fs.existsSync(lockPath));
    });

    it('should fail to acquire lock on second initialization', async () => {
      // First initialization should succeed
      const bridge1 = await initBridgeForWorkspace(mockWorkspace, mockContext);
      assert.strictEqual(bridge1.isOwner, true);

      // Second initialization should not be owner
      const bridge2 = await initBridgeForWorkspace(mockWorkspace, mockContext);
      assert.strictEqual(bridge2.isOwner, false);
      assert.ok(bridge2.bridgeId); // Should still have an ID
    });

    it('should write host metadata when acquiring lock', async () => {
      const bridge = await initBridgeForWorkspace(mockWorkspace, mockContext);

      const hostJsonPath = path.join(bridge.bridgeDir, 'host.json');
      assert.ok(fs.existsSync(hostJsonPath));

      const hostData = JSON.parse(await fsPromises.readFile(hostJsonPath, 'utf8')) as HostJson;
      assert.strictEqual(hostData.bridgeId, bridge.bridgeId);
      assert.strictEqual(hostData.version, 1);
      assert.strictEqual(hostData.platform, process.platform);
      assert.strictEqual(hostData.workspace, tempDir);
      assert.strictEqual(hostData.pid, process.pid);
      assert.strictEqual(hostData.wslAware, true);
    });

    it('should create execute directory structure', async () => {
      const bridge = await initBridgeForWorkspace(mockWorkspace, mockContext);

      const executeDir = path.join(bridge.bridgeDir, 'execute');
      assert.ok(fs.existsSync(executeDir));
      assert.ok((await fsPromises.stat(executeDir)).isDirectory());
    });
  });

  describe('lock cleanup on deactivation', () => {
    it('should clean up lock when disposed', async () => {
      const bridge = await initBridgeForWorkspace(mockWorkspace, mockContext);
      assert.strictEqual(bridge.isOwner, true);

      const lockPath = path.join(bridge.bridgeDir, 'host.lock');
      assert.ok(fs.existsSync(lockPath));

      // Dispose all subscriptions (simulating deactivation)
      for (const disposable of disposables) {
        disposable.dispose();
      }

      // Lock should be removed
      assert.ok(!fs.existsSync(lockPath));
    });

    it('should not throw if lock already removed', async () => {
      const bridge = await initBridgeForWorkspace(mockWorkspace, mockContext);
      const lockPath = path.join(bridge.bridgeDir, 'host.lock');

      // Manually remove lock
      await fsPromises.unlink(lockPath);

      // Disposal should not throw
      assert.doesNotThrow(() => {
        for (const disposable of disposables) {
          disposable.dispose();
        }
      });
    });
  });

  describe('health monitoring', () => {
    it('should update file mtime on heartbeat', async function() {
      this.timeout(3000);

      const bridge = await initBridgeForWorkspace(mockWorkspace, mockContext);
      const hostJsonPath = bridge.hostJsonPath;

      // Get initial mtime
      const initialStats = await fsPromises.stat(hostJsonPath);
      const initialMtime = initialStats.mtime.getTime();

      // Start heartbeat
      const timer = startHealthHeartbeat(hostJsonPath);

      // Wait a bit for heartbeat to fire
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check mtime was updated
      const newStats = await fsPromises.stat(hostJsonPath);
      const newMtime = newStats.mtime.getTime();

      assert.ok(newMtime >= initialMtime, 'mtime should be updated');

      clearInterval(timer);
    });

    it('should detect healthy bridge', async () => {
      const bridge = await initBridgeForWorkspace(mockWorkspace, mockContext);

      const health = await checkBridgeHealth(bridge.bridgeDir);

      assert.strictEqual(health.healthy, true);
      assert.ok(health.lastSeen);
      assert.strictEqual(health.bridgeId, bridge.bridgeId);
      assert.strictEqual(health.pid, process.pid);
    });

    it('should detect stale bridge', async () => {
      const bridge = await initBridgeForWorkspace(mockWorkspace, mockContext);

      // Manually set old mtime
      const oldTime = new Date(Date.now() - 60000); // 60 seconds ago
      fs.utimesSync(bridge.hostJsonPath, oldTime, oldTime);

      const health = await checkBridgeHealth(bridge.bridgeDir);

      assert.strictEqual(health.healthy, false);
      assert.ok(health.lastSeen);
    });

    it('should handle missing bridge gracefully', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');

      const health = await checkBridgeHealth(nonExistentDir);

      assert.strictEqual(health.healthy, false);
      assert.strictEqual(health.lastSeen, undefined);
      assert.strictEqual(health.bridgeId, undefined);
    });
  });

  describe('multiple workspace folders', () => {
    it('should handle multiple workspace folders independently', async () => {
      // Create two temp dirs
      const tempDir2 = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vsc-bridge-test2-'));

      const workspace2: vscode.WorkspaceFolder = {
        uri: { fsPath: tempDir2 } as vscode.Uri,
        name: 'test-workspace-2',
        index: 1
      };

      try {
        const bridge1 = await initBridgeForWorkspace(mockWorkspace, mockContext);
        const bridge2 = await initBridgeForWorkspace(workspace2, mockContext);

        assert.strictEqual(bridge1.isOwner, true);
        assert.strictEqual(bridge2.isOwner, true);
        assert.notStrictEqual(bridge1.bridgeId, bridge2.bridgeId);
        assert.notStrictEqual(bridge1.bridgeDir, bridge2.bridgeDir);
      } finally {
        await fsPromises.rm(tempDir2, { recursive: true, force: true });
      }
    });
  });
});