/**
 * Filesystem Bridge for VSC-Bridge
 *
 * This module provides filesystem-based IPC between VS Code extension
 * and external tools (CLI, MCP server), replacing HTTP communication.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  initBridge,
  initBridgeForWorkspace,
  startHealthHeartbeat,
  checkBridgeHealth
} from './bridge';
import {
  claimJobAtomic,
  processCommand,
  launchJob,
  EventWriter,
  inFlight,
  MAX_CONCURRENT
} from './processor';
import {
  startRecoveryTimer,
  recoverStaleJobs,
  cleanOrphanedJobs,
  cleanAllPendingJobs,
  detectCrashedJobs
} from './recovery';
import {
  startGarbageCollection,
  getJobStats
} from './cleaner';
import {
  BridgeInfo,
  CommandJson,
  ResponseJson,
  ErrorJson
} from './types';
import { exists } from './io';
import { isDlqJob } from './dlq';
import { VsCodeFilesystem } from './fs-abstraction';
import { scanForUnclaimedJobs } from './scanner';
import { ITelemetry } from '../telemetry';

// Export all types
export * from './types';
export { EventWriter } from './processor';
export { checkBridgeHealth } from './bridge';

/**
 * Global bridge manager
 */
class BridgeManager {
  private bridges: Map<string, BridgeInfo> = new Map();
  private scriptExecutor?: (command: CommandJson, eventWriter: EventWriter) => Promise<any>;
  private safetyScanTimers: Map<string, NodeJS.Timeout> = new Map();
  private telemetry?: ITelemetry;

  /**
   * Initialize filesystem bridge for all workspace folders
   */
  async initialize(
    context: vscode.ExtensionContext,
    scriptExecutor?: (command: CommandJson, eventWriter: EventWriter) => Promise<any>,
    telemetry?: ITelemetry
  ): Promise<void> {
    this.scriptExecutor = scriptExecutor;
    this.telemetry = telemetry;

    const bridges = await initBridge(context);

    for (const bridge of bridges) {
      this.bridges.set(bridge.bridgeDir, bridge);

      if (bridge.isOwner) {
        await this.setupBridgeServices(bridge, context);
      }
    }

    console.log(`[BridgeManager] ✅ Initialized ${bridges.length} bridge(s) at ${new Date().toISOString()}`);
  }

  /**
   * Set up all services for an owned bridge
   */
  private async setupBridgeServices(
    bridge: BridgeInfo,
    context: vscode.ExtensionContext
  ): Promise<void> {
    const executeDir = path.join(bridge.bridgeDir, 'execute');

    // 1. Start health heartbeat
    bridge.healthTimer = startHealthHeartbeat(bridge.hostJsonPath);
    console.log(`[BridgeManager] Started health heartbeat for ${bridge.bridgeDir}`);

    // 2. Detect crashed jobs from previous session (BEFORE cleanup to preserve evidence)
    console.log(`[BridgeManager] 🔍 Detecting crashed jobs from previous session...`);
    const crashStats = await detectCrashedJobs(executeDir, bridge.bridgeId, undefined);
    if (crashStats.quarantined > 0) {
      console.log(`[BridgeManager] ⚠️  Quarantined ${crashStats.quarantined} crashed jobs to DLQ`);
    } else {
      console.log(`[BridgeManager] ✅ No crashed jobs detected`);
    }

    // 3. Clean ALL pending jobs from previous sessions (clean slate, preserves DLQ)
    console.log(`[BridgeManager] 🧹 Cleaning pending jobs from: ${executeDir}`);
    const cleanStartTime = Date.now();
    const pendingCleaned = await cleanAllPendingJobs(executeDir);
    const cleanDuration = Date.now() - cleanStartTime;
    if (pendingCleaned > 0) {
      console.log(`[BridgeManager] ✅ Cleaned ${pendingCleaned} pending jobs from previous session in ${cleanDuration}ms`);
    } else {
      console.log(`[BridgeManager] ✅ No pending jobs to clean (took ${cleanDuration}ms)`);
    }

    // 4. Clean orphaned jobs (directories without command.json)
    console.log(`[BridgeManager] 🧹 Checking for orphaned jobs...`);
    const orphansCleaned = await cleanOrphanedJobs(executeDir);
    if (orphansCleaned > 0) {
      console.log(`[BridgeManager] Cleaned ${orphansCleaned} orphaned jobs`);
    }

    // 5. Clean slate: Delete unclaimed jobs from previous session
    const deletedCount = await this.catchUpOnStartup(executeDir, bridge.bridgeId);
    if (deletedCount > 0) {
      console.log(`[BridgeManager] 🧹 Deleted ${deletedCount} unclaimed jobs (clean slate policy)`);
    }

    // 6. Recover stale jobs
    const recoveryStats = await recoverStaleJobs(
      executeDir,
      bridge.bridgeId,
      60000, // 60 second lease
      this.scriptExecutor
    );
    if (recoveryStats.recovered > 0) {
      console.log(`[BridgeManager] Recovered ${recoveryStats.recovered} stale jobs`);
    }

    // 7. Start recovery timer
    bridge.recoveryTimer = startRecoveryTimer(
      executeDir,
      bridge.bridgeId,
      30000,  // Check every 30 seconds
      60000,  // 60 second lease
      this.scriptExecutor
    );

    // 8. Set up file watcher
    const workspace = vscode.workspace.workspaceFolders?.find(
      ws => bridge.bridgeDir.startsWith(ws.uri.fsPath)
    );

    if (workspace) {
      bridge.watcher = this.setupWatcherWithProcessor(workspace, bridge);
      console.log(`[BridgeManager] Started file watcher for ${bridge.bridgeDir}`);
    }

    // 9. Start garbage collection
    bridge.gcTimer = startGarbageCollection(
      bridge.bridgeDir,
      24 * 60 * 60 * 1000,  // 24 hour max age
      30 * 60 * 1000        // Clean every 30 minutes
    );
    console.log(`[BridgeManager] Started garbage collection for ${bridge.bridgeDir}`);

    // 10. Start periodic safety scan (fallback for missed watcher events)
    const safetyScanTimer = this.startPeriodicSafetyScan(executeDir, bridge.bridgeId);
    this.safetyScanTimers.set(bridge.bridgeDir, safetyScanTimer);
    console.log(`[BridgeManager] Started periodic safety scan for ${bridge.bridgeDir}`);
  }

  /**
   * Clean up unclaimed jobs on startup (clean slate policy)
   *
   * Per Phase 1 decision: Delete all pre-existing unclaimed jobs rather than
   * processing them. LLM clients can retry if needed. This prevents:
   * - Capacity violations (launching 50+ jobs at once)
   * - Stale job accumulation
   * - Complex recovery logic
   */
  private async catchUpOnStartup(
    executeDir: string,
    bridgeId: string
  ): Promise<number> {
    let deleted = 0;

    try {
      // Read all job directories
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(executeDir));

      for (const [name, type] of entries) {
        if (type !== vscode.FileType.Directory) continue;

        const jobDir = path.join(executeDir, name);

        // Check if this job is unclaimed
        const hasCommand = await exists(path.join(jobDir, 'command.json'));
        const hasClaimed = await exists(path.join(jobDir, 'claimed.json'));
        const isDone = await exists(path.join(jobDir, 'done'));

        if (hasCommand && !hasClaimed && !isDone) {
          console.log(`[BridgeManager] Deleting unclaimed job on startup (clean slate): ${name}`);

          // Delete the entire job directory
          try {
            await vscode.workspace.fs.delete(vscode.Uri.file(jobDir), { recursive: true });
            deleted++;
          } catch (err) {
            console.error(`[BridgeManager] Failed to delete unclaimed job ${name}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`[BridgeManager] Error during startup cleanup:`, err);
    }

    return deleted;
  }

  /**
   * Start periodic safety scan for unclaimed jobs
   *
   * This is a fallback mechanism in case file watcher events are missed.
   * Runs every 2 seconds to check for unclaimed jobs.
   *
   * Uses scanForUnclaimedJobs() for testable, optimized job detection.
   */
  private startPeriodicSafetyScan(
    executeDir: string,
    bridgeId: string
  ): NodeJS.Timeout {
    const fs = new VsCodeFilesystem();

    return setInterval(async () => {
      try {
        // Only scan if we have an executor
        if (!this.scriptExecutor) return;

        // Use scanner module (T018: Integration)
        // inFlight is imported from processor.ts and reflects actual concurrent job count
        const unclaimedJobs = await scanForUnclaimedJobs(
          executeDir,
          inFlight,
          MAX_CONCURRENT,
          fs
        );

        // Process each unclaimed job
        for (const jobDir of unclaimedJobs) {
          const jobId = path.basename(jobDir);
          console.log(`[BridgeManager] Safety scan found unclaimed job: ${jobId}`);

          if (claimJobAtomic(jobDir, bridgeId)) {
            // Launch concurrently (don't await)
            launchJob(jobDir, bridgeId, this.scriptExecutor, this.telemetry);
          }
        }
      } catch (err) {
        // Scanner already logs warnings, no need to spam logs here
        // This is just a safety net, not critical path
      }
    }, 2000); // Check every 2 seconds
  }

  /**
   * Set up file watcher with command processor
   */
  private setupWatcherWithProcessor(
    workspace: vscode.WorkspaceFolder,
    bridge: BridgeInfo
  ): vscode.FileSystemWatcher {
    const pattern = new vscode.RelativePattern(
      workspace,
      '.vsc-bridge/execute/*/command.json'
    );

    console.log(`[BridgeManager] Setting up watcher for: ${workspace.uri.fsPath}/.vsc-bridge/execute/*/command.json`);

    const watcher = vscode.workspace.createFileSystemWatcher(
      pattern,
      false,  // create
      false,  // change (NOW HANDLING THESE)
      false   // delete
    );

    // Handler for both create and change events (idempotent due to atomic claim)
    const handleCommand = async (uri: vscode.Uri) => {
      const jobDir = path.dirname(uri.fsPath);
      const jobId = path.basename(jobDir);

      console.log(`[BridgeManager] Command detected (create/change): ${jobId}`);

      // Try to claim the job (idempotent - safe to call multiple times)
      if (!claimJobAtomic(jobDir, bridge.bridgeId)) {
        console.log(`[BridgeManager] Job already claimed: ${jobId}`);
        return;
      }

      // Process the command
      if (this.scriptExecutor) {
        // Launch concurrently (don't await)
        launchJob(jobDir, bridge.bridgeId, this.scriptExecutor, this.telemetry);
      } else {
        console.warn(`[BridgeManager] No script executor configured`);
      }
    };

    // Listen to both create AND change events
    watcher.onDidCreate(handleCommand);
    watcher.onDidChange(handleCommand);

    return watcher;
  }

  /**
   * Get statistics for all bridges
   */
  async getStatistics(): Promise<{
    bridges: Array<{
      path: string;
      isOwner: boolean;
      healthy: boolean;
      jobs: any;
    }>;
  }> {
    const stats = {
      bridges: [] as any[]
    };

    for (const [bridgeDir, bridge] of this.bridges) {
      const health = await checkBridgeHealth(bridgeDir);
      const jobStats = await getJobStats(path.join(bridgeDir, 'execute'));

      stats.bridges.push({
        path: bridgeDir,
        isOwner: bridge.isOwner,
        healthy: health.healthy,
        jobs: jobStats
      });
    }

    return stats;
  }

  /**
   * Get bridge for a specific workspace
   */
  getBridgeForWorkspace(workspacePath: string): BridgeInfo | undefined {
    for (const [_, bridge] of this.bridges) {
      if (workspacePath.startsWith(bridge.bridgeDir)) {
        return bridge;
      }
    }
    return undefined;
  }

  /**
   * Dispose all bridges
   */
  dispose(): void {
    // Clean up safety scan timers
    for (const timer of this.safetyScanTimers.values()) {
      clearInterval(timer);
    }
    this.safetyScanTimers.clear();

    // Clean up bridge resources
    for (const bridge of this.bridges.values()) {
      if (bridge.healthTimer) {
        clearInterval(bridge.healthTimer);
      }
      if (bridge.gcTimer) {
        clearInterval(bridge.gcTimer);
      }
      if (bridge.recoveryTimer) {
        clearInterval(bridge.recoveryTimer);
      }
      if (bridge.watcher) {
        bridge.watcher.dispose();
      }
    }
    this.bridges.clear();
  }
}

// Singleton instance
let bridgeManager: BridgeManager | undefined;

/**
 * Initialize the filesystem bridge system
 */
export async function initializeFileSystemBridge(
  context: vscode.ExtensionContext,
  scriptExecutor?: (command: CommandJson, eventWriter: EventWriter) => Promise<any>,
  telemetry?: ITelemetry
): Promise<BridgeManager> {
  if (!bridgeManager) {
    bridgeManager = new BridgeManager();
    await bridgeManager.initialize(context, scriptExecutor, telemetry);

    // Dispose on deactivation
    context.subscriptions.push({
      dispose: () => {
        if (bridgeManager) {
          bridgeManager.dispose();
          bridgeManager = undefined;
        }
      }
    });
  }
  return bridgeManager;
}

/**
 * Get the current bridge manager instance
 */
export function getBridgeManager(): BridgeManager | undefined {
  return bridgeManager;
}

/**
 * Convenience function to connect to script registry
 */
export async function connectToScriptRegistry(
  context: vscode.ExtensionContext,
  scriptRegistry: any
): Promise<BridgeManager> {
  // Create executor that uses the script registry
  const executor = async (command: CommandJson, eventWriter: EventWriter) => {
    // Create a script context (this would come from your existing code)
    const scriptContext = {
      requestId: command.id,
      mode: 'normal' as const,
      vscode,
      // Add other context fields as needed
    };

    // Log the execution
    eventWriter.writeLog('info', `Executing script: ${command.scriptName}`);

    // Execute via registry (adapt to your actual registry interface)
    const envelope = await scriptRegistry.execute(
      command.scriptName,
      command.params,
      scriptContext
    );

    // Return the data portion (processor handles envelope wrapping)
    if (envelope.ok) {
      return envelope.data;
    } else {
      throw new Error(envelope.error.message);
    }
  };

  return initializeFileSystemBridge(context, executor);
}