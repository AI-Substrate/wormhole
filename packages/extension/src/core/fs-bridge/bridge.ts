import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import * as crypto from 'crypto';
import { BridgeInfo, HostJson } from './types';
import { writeJsonAtomicAsync } from './io';

/**
 * Initialize filesystem bridge for a workspace
 *
 * This establishes ownership via exclusive lock and sets up
 * the bridge directory structure.
 */
export async function initBridge(context: vscode.ExtensionContext): Promise<BridgeInfo[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('No workspace folder open');
  }

  const bridges: BridgeInfo[] = [];

  for (const folder of workspaceFolders) {
    const bridge = await initBridgeForWorkspace(folder, context);
    bridges.push(bridge);
  }

  return bridges;
}

/**
 * Initialize bridge for a single workspace folder
 */
export async function initBridgeForWorkspace(
  workspace: vscode.WorkspaceFolder,
  context: vscode.ExtensionContext
): Promise<BridgeInfo> {
  const bridgeDir = path.join(workspace.uri.fsPath, '.vsc-bridge');
  const executeDir = path.join(bridgeDir, 'execute');
  const lockPath = path.join(bridgeDir, 'host.lock');
  const hostJsonPath = path.join(bridgeDir, 'host.json');
  const gitignorePath = path.join(bridgeDir, '.gitignore');
  const bridgeId = generateBridgeId();

  // Create directory structure
  await fsPromises.mkdir(executeDir, { recursive: true });

  // Create .gitignore file to ensure all contents are ignored
  try {
    await fsPromises.writeFile(gitignorePath, '*\n', { flag: 'wx' }); // 'wx' flag creates file only if it doesn't exist
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      console.error(`[Bridge] Failed to create .gitignore: ${err.message}`);
    }
  }

  // Try to acquire exclusive lock
  let isOwner = false;
  try {
    // 'wx' flag: write exclusive - fails if file exists
    const fd = fs.openSync(lockPath, 'wx');
    fs.closeSync(fd);
    isOwner = true;

    // Write host metadata
    await writeHostMetadata(hostJsonPath, {
      bridgeId,
      version: 1,
      platform: process.platform,
      workspace: workspace.uri.fsPath,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      wslAware: true
    });

    console.log(`[Bridge] Acquired lock for workspace: ${workspace.name}`);
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      // Another instance owns the lock
      console.log(`[Bridge] Another instance owns lock for workspace: ${workspace.name}`);

      // Try to read existing host info
      try {
        const hostData = await fsPromises.readFile(hostJsonPath, 'utf8');
        const host = JSON.parse(hostData) as HostJson;

        // Check if owner is still alive (basic check via file freshness)
        const stats = await fsPromises.stat(hostJsonPath);
        const age = Date.now() - stats.mtime.getTime();

        if (age > 15000) { // More than 15 seconds old (reduced for faster recovery)
          console.log(`[Bridge] Previous owner appears dead, attempting takeover`);
          // Attempt takeover (simplified for now, full implementation would use two-phase)
          await attemptTakeover(lockPath, hostJsonPath, bridgeId, workspace);
          isOwner = true;
        }
      } catch (readErr) {
        console.error(`[Bridge] Failed to read host info: ${readErr}`);
      }
    } else {
      throw err;
    }
  }

  const bridgeInfo: BridgeInfo = {
    bridgeId,
    bridgeDir,
    hostJsonPath,
    isOwner
  };

  // Register cleanup on deactivation
  context.subscriptions.push({
    dispose: () => {
      if (bridgeInfo.healthTimer) {
        clearInterval(bridgeInfo.healthTimer);
      }
      if (bridgeInfo.gcTimer) {
        clearInterval(bridgeInfo.gcTimer);
      }
      if (bridgeInfo.watcher) {
        bridgeInfo.watcher.dispose();
      }
      // Clean up lock if we own it
      if (isOwner) {
        try {
          fs.unlinkSync(lockPath);
          console.log(`[Bridge] Released lock for workspace: ${workspace.name}`);
        } catch (err) {
          // Lock may already be gone
        }
      }
    }
  });

  return bridgeInfo;
}

/**
 * Generate a unique bridge instance ID
 */
function generateBridgeId(): string {
  return `extHost-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Write host metadata file atomically
 */
async function writeHostMetadata(hostJsonPath: string, metadata: HostJson): Promise<void> {
  await writeJsonAtomicAsync(hostJsonPath, metadata);
}

/**
 * Check if a process is alive by PID
 */
function isProcessAlive(pid: number): boolean {
  try {
    // On POSIX, kill(pid, 0) checks if process exists
    // On Windows, this will throw if process doesn't exist
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempt to take over a stale lock with two-phase protocol
 */
async function attemptTakeover(
  lockPath: string,
  hostJsonPath: string,
  bridgeId: string,
  workspace: vscode.WorkspaceFolder
): Promise<void> {
  console.log(`[Bridge] Starting two-phase takeover for workspace: ${workspace.name}`);

  // Phase 1: Check if previous owner is truly dead
  try {
    const hostData = await fsPromises.readFile(hostJsonPath, 'utf8');
    const host = JSON.parse(hostData) as HostJson;

    // Check PID liveness
    if (host.pid && isProcessAlive(host.pid)) {
      console.log(`[Bridge] Previous owner PID ${host.pid} is still alive, aborting takeover`);
      throw new Error(`Previous owner process ${host.pid} is still alive`);
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.log(`[Bridge] PID check during takeover: ${err.message}`);
    }
  }

  // Phase 2: Create takeover attempt file
  const takeoverPath = `${lockPath}.takeover`;
  try {
    await fsPromises.writeFile(takeoverPath, JSON.stringify({
      bridgeId,
      attemptedAt: new Date().toISOString(),
      pid: process.pid
    }));

    // Wait briefly to see if the original owner responds
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check again if the host.json was updated (heartbeat)
    try {
      const stats = await fsPromises.stat(hostJsonPath);
      const age = Date.now() - stats.mtime.getTime();
      if (age < 5000) { // Updated within last 5 seconds
        console.log(`[Bridge] Original owner is still active (heartbeat detected), aborting takeover`);
        await fsPromises.unlink(takeoverPath);
        throw new Error('Original owner is still active');
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.log(`[Bridge] Heartbeat check failed: ${err.message}`);
      }
    }

    // Phase 3: Proceed with takeover
    await fsPromises.unlink(lockPath);
    const fd = fs.openSync(lockPath, 'wx');
    fs.closeSync(fd);

    // Write our metadata
    await writeHostMetadata(hostJsonPath, {
      bridgeId,
      version: 1,
      platform: process.platform,
      workspace: workspace.uri.fsPath,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      wslAware: true
    });

    // Clean up takeover file
    await fsPromises.unlink(takeoverPath).catch(() => {});

    console.log(`[Bridge] Takeover successful for workspace: ${workspace.name}`);
  } catch (err) {
    // Clean up takeover file on failure
    await fsPromises.unlink(takeoverPath).catch(() => {});
    console.error(`[Bridge] Takeover failed: ${err}`);
    throw err;
  }
}

/**
 * Start health heartbeat to indicate liveness
 */
export function startHealthHeartbeat(hostJsonPath: string): NodeJS.Timeout {
  return setInterval(() => {
    try {
      // Touch the file to update mtime
      const now = new Date();
      fs.utimesSync(hostJsonPath, now, now);
    } catch (err) {
      console.error(`[Bridge] Failed to update health heartbeat: ${err}`);
    }
  }, 5000); // Every 5 seconds (faster heartbeat for quicker recovery)
}

// Note: File watching is implemented in index.ts as setupWatcherWithProcessor
// which includes job claiming and command processing

/**
 * Check bridge health status
 */
export async function checkBridgeHealth(bridgeDir: string): Promise<{
  healthy: boolean;
  lastSeen?: Date;
  bridgeId?: string;
  pid?: number;
}> {
  const hostJsonPath = path.join(bridgeDir, 'host.json');

  try {
    const stats = await fsPromises.stat(hostJsonPath);
    const hostData = await fsPromises.readFile(hostJsonPath, 'utf8');
    const host = JSON.parse(hostData) as HostJson;

    const age = Date.now() - stats.mtime.getTime();
    const healthy = age < 30000; // Healthy if updated within 30 seconds

    return {
      healthy,
      lastSeen: stats.mtime,
      bridgeId: host.bridgeId,
      pid: host.pid
    };
  } catch (err) {
    return { healthy: false };
  }
}