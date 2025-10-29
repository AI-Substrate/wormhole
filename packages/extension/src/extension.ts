// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ScriptRegistry } from './core/registry/ScriptRegistry';
import { initializeFileSystemBridge, getBridgeManager } from './core/fs-bridge';
import { CommandJson, EventWriter } from './core/fs-bridge';
import { DebugSessionCaptureService } from './core/debug/debug-session-capture';
import { EditorContextProvider } from './core/context/EditorContextProvider';
import { TelemetryService } from './core/telemetry';

let scriptRegistry: ScriptRegistry | undefined;
let bridgeManager: any;
let globalSessionId: string | undefined;
let globalOutput: vscode.OutputChannel | undefined;
let extensionActivationTime: number;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('VSC-Bridge');

	// Record activation time for session duration tracking (T004)
	extensionActivationTime = Date.now();

	// Wire OutputChannel to EditorContextProvider for logging
	EditorContextProvider.setOutputChannel(output);

	/**
	 * Telemetry Configuration Precedence Chain (Phase 4: T004, Discovery 09)
	 * ═══════════════════════════════════════════════════════════════════════
	 *
	 * Telemetry is enabled ONLY when ALL conditions are met (highest to lowest priority):
	 *
	 * 1. VS Code Global Setting: vscode.env.isTelemetryEnabled === true
	 *    → Always disable if false. Accounts for:
	 *      - Enterprise policies (Group Policy, MDM)
	 *      - CLI flags (--disable-telemetry)
	 *      - Remote contexts (SSH, WSL, Codespaces)
	 *      - User privacy preferences in VS Code settings
	 *    → CRITICAL (Discovery 02): Use API, NOT telemetry.telemetryLevel config
	 *      (config doesn't account for enterprise policies/CLI flags)
	 *
	 * 2. Extension Setting: vscBridge.telemetry.enabled === true (default)
	 *    → User-level control for VSC-Bridge only
	 *    → Respects user preference without affecting other extensions
	 *    → Dynamic changes handled via onDidChangeConfiguration listener (Phase 4: T002-T003)
	 *
	 * 3. Development Mode: extensionMode !== Development OR VSCBRIDGE_TELEMETRY_IN_DEV=1
	 *    → Development mode (debugging in Extension Host) REQUIRES explicit opt-in
	 *    → Prevents accidental telemetry during local debugging/testing
	 *    → Developers: export VSCBRIDGE_TELEMETRY_IN_DEV=1 to enable
	 *
	 * 4. Environment Variable: APPLICATIONINSIGHTS_CONNECTION_STRING (optional override)
	 *    → Overrides hardcoded connection string for testing with alternate Azure resources
	 *    → Default connection string is safe to hardcode (per Microsoft guidance)
	 *
	 * Rationale:
	 * - System-level (enterprise) overrides user-level (compliance)
	 * - User-level overrides developer-level (explicit user choice)
	 * - Developer-level overrides defaults (local debugging safety)
	 *
	 * See also:
	 * - TelemetryService.initialize() - Implements precedence chain (TelemetryService.ts:94-171)
	 * - TelemetryService.registerConfigurationListener() - Handles dynamic setting changes (TelemetryService.ts:308-346)
	 */

	// Initialize TelemetryService (T002)
	try {
		TelemetryService.instance.initialize({
			context,
			outputChannel: output
		});

		// Send ExtensionActivated event (T003, T007)
		TelemetryService.instance.sendEvent('ExtensionActivated', {
			sessionId: TelemetryService.instance.getSessionId(),
			vscodeVersion: vscode.version,
			extensionVersion: context.extension.packageJSON.version,
			platform: process.platform,
			remoteName: vscode.env.remoteName || 'local',
			telemetrySchemaVersion: '2' // Phase 3: Privacy-enhanced schema (Finding DR-05)
		});
	} catch (error) {
		// Graceful degradation - log but don't crash
		output.appendLine(`[Telemetry] ⚠️  Failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
	}

	// Clean up .vsc-bridge directories from all workspace folders on startup (Phase 2, Insight #3)
	// This ensures fresh state and prevents stale claimed.json files from previous sessions
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders) {
		for (const folder of workspaceFolders) {
			const bridgeDir = path.join(folder.uri.fsPath, '.vsc-bridge');
			try {
				if (fs.existsSync(bridgeDir)) {
					await fs.promises.rm(bridgeDir, { recursive: true, force: true });
					await fs.promises.mkdir(bridgeDir, { recursive: true });
					output.appendLine(`[Startup] Cleaned .vsc-bridge directory: ${bridgeDir}`);
				}
			} catch (err: any) {
				output.appendLine(`[Startup] Warning: Failed to clean ${bridgeDir}: ${err.message}`);
			}
		}
	}

	// Generate unique session ID for this activation
	const sessionId = Math.random().toString(36).substring(2, 15);
	globalSessionId = sessionId;
	globalOutput = output;
	const activationTime = new Date().toISOString();

	// DISTINCTIVE STARTUP BANNER
	output.appendLine(`${'='.repeat(60)}`);
	output.appendLine(`🚀 VSC-BRIDGE EXTENSION ACTIVATED 🚀`);
	output.appendLine(`${'='.repeat(60)}`);
	output.appendLine(`📍 Activation Time: ${activationTime}`);
	output.appendLine(`📍 Session ID: ${sessionId}`);
	output.appendLine(`📍 Process PID: ${process.pid}`);
	output.appendLine(`📍 Node Version: ${process.version}`);
	output.appendLine(`📍 Extension Path: ${context.extensionPath}`);
	output.appendLine(`${'='.repeat(60)}`);

	// Log environment details for debugging
	output.appendLine(`VS Code Environment:`);
	output.appendLine(`  Version: ${vscode.version}`);
	output.appendLine(`  Extension Mode: ${vscode.ExtensionMode[context.extensionMode]}`);
	output.appendLine(`  App Name: ${vscode.env.appName}`);
	output.appendLine(`  App Host: ${vscode.env.appHost}`);
	output.appendLine(`  Remote Name: ${vscode.env.remoteName || 'local'}`);
	output.appendLine(``);

	// Install DebugSessionCaptureService to capture rich DAP data
	output.appendLine(`[DebugSessionCapture] Installing session capture service...`);
	DebugSessionCaptureService.instance.install(context);
	output.appendLine(`[DebugSessionCapture] ✅ Session capture service ready`);
	output.appendLine(``);

	// Expose service globally for dynamic scripts
	(global as any).debugSessionCaptureService = DebugSessionCaptureService.instance;

	// Set global base path for script loading
	(global as any).VSC_BRIDGE_BASE_PATH = context.extensionPath + '/out';

	// Settings
	const config = vscode.workspace.getConfiguration('vscBridge');
	const DANGER = config.get<boolean>('dangerMode', false);

	// Initialize ScriptRegistry with dependencies (DI pattern)
	try {
		scriptRegistry = new ScriptRegistry(context, output, TelemetryService.instance);
		// Check if we're running from compiled code (out/) or source (src/)
		const outManifestPath = context.asAbsolutePath(path.join('out', 'vsc-scripts', 'manifest.json'));
		const srcManifestPath = context.asAbsolutePath(path.join('src', 'vsc-scripts', 'manifest.json'));
		const manifestPath = fs.existsSync(outManifestPath) ? outManifestPath : srcManifestPath;

		output.appendLine(`[ScriptRegistry] Loading scripts from: ${manifestPath}`);
		await scriptRegistry.discover(manifestPath);
		output.appendLine(`[ScriptRegistry] ✅ Loaded ${scriptRegistry.listScripts().length} scripts at ${new Date().toISOString()}`);

		// Store registry globally for access (context is sealed/frozen)
		(global as any).scriptRegistry = scriptRegistry;
	} catch (error: any) {
		output.appendLine(`[ScriptRegistry] Failed to load scripts: ${error.message}`);
		// Continue without scripts
	}

	// Initialize Filesystem Bridge
	try {
		// Create script executor that connects to ScriptRegistry
		const scriptExecutor = async (command: CommandJson, eventWriter: EventWriter): Promise<any> => {
			if (!scriptRegistry) {
				throw new Error('ScriptRegistry not initialized');
			}

			// Handle dynamic scripts
			if (command.scriptName === '@dynamic') {
				// No metadata check for dynamic scripts
				const isDangerMode = vscode.workspace.getConfiguration('vscBridge').get<boolean>('dangerMode', false);

				// Execute the dynamic script with content
				const requestId = command.id;
				const mode = isDangerMode ? 'danger' : 'normal';
				const signal = new AbortController().signal;
				const result = await scriptRegistry.execute(command.scriptName, command.params, requestId, mode, signal, command.scriptContent);

				// If the script failed, throw an error to propagate the failure
				if (!result.ok) {
					const error = new Error(result.error?.message || 'Dynamic script execution failed');
					(error as any).code = result.error?.code;
					(error as any).details = result.error?.details;
					throw error;
				}

				// Return the full envelope (including editorContext from Phase 2)
				return result;
			}

			const metadata = scriptRegistry.getMetadata(command.scriptName);
			if (!metadata) {
				throw new Error(`Script '${command.scriptName}' not found`);
			}

			// Check danger mode requirement
			const isDangerMode = vscode.workspace.getConfiguration('vscBridge').get<boolean>('dangerMode', false);
			if ((metadata as any).dangerOnly === true && !isDangerMode) {
				throw new Error(`Script '${command.scriptName}' requires danger mode`);
			}

			// Execute the script through the registry
			const requestId = command.id;
			const mode = isDangerMode ? 'danger' : 'normal';
			const signal = new AbortController().signal;
			const result = await scriptRegistry.execute(command.scriptName, command.params, requestId, mode, signal);

			// If the script failed, throw an error to propagate the failure
			if (!result.ok) {
				const error = new Error(result.error?.message || 'Script execution failed');
				(error as any).code = result.error?.code;
				(error as any).details = result.error?.details;
				throw error;
			}

			// Return the full envelope (including editorContext from Phase 2)
			return result;
		};

		output.appendLine(`[FileSystemBridge] Initializing bridge at ${new Date().toISOString()}...`);
		bridgeManager = await initializeFileSystemBridge(context, scriptExecutor, TelemetryService.instance);
		output.appendLine(`[FileSystemBridge] ✅ Initialized successfully with session ${sessionId}`);

		// Show toast notification with version and workspace info
		const version = context.extension.packageJSON.version;
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			const folderPaths = workspaceFolders.map(f => f.uri.fsPath).join(', ');
			vscode.window.showInformationMessage(
				`VSC-Bridge v${version} is running on: ${folderPaths}`
			);
			output.appendLine(`[Startup] Toast notification shown for v${version} on workspace: ${folderPaths}`);
		} else {
			vscode.window.showInformationMessage(`VSC-Bridge v${version} is running (no workspace folder)`);
			output.appendLine(`[Startup] Toast notification shown for v${version} (no workspace)`);
		}
	} catch (error: any) {
		output.appendLine(`[FileSystemBridge] Failed to initialize: ${error.message}`);
		vscode.window.showErrorMessage(`VSC-Bridge failed to initialize filesystem bridge: ${error.message}`);
	}

	// Set status bar based on initial danger mode
	if (DANGER) {
		vscode.window.setStatusBarMessage('VSC-Bridge: ⚠️ DANGER (Filesystem)', 5000);
	} else {
		vscode.window.setStatusBarMessage('VSC-Bridge: Normal (Filesystem)', 5000);
	}

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('vscBridge.dangerMode')) {
				const newDangerMode = vscode.workspace.getConfiguration('vscBridge').get<boolean>('dangerMode', false);
				if (newDangerMode) {
					vscode.window.setStatusBarMessage('VSC-Bridge: ⚠️ DANGER (Filesystem)', 5000);
				} else {
					vscode.window.setStatusBarMessage('VSC-Bridge: Normal (Filesystem)', 5000);
				}
				output.appendLine(`[Config] Danger mode changed to: ${newDangerMode}`);
			}
		})
	);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('vsc-bridge.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from vsc-bridge (Filesystem Mode)!');
	});

	context.subscriptions.push(disposable);

	// Debug command to show bridge statistics
	context.subscriptions.push(
		vscode.commands.registerCommand('vsc-bridge.debug.stats', async () => {
			if (!bridgeManager) {
				vscode.window.showErrorMessage('Bridge manager not initialized');
				return;
			}

			const stats = await bridgeManager.getStatistics();
			output.appendLine('\n=== VSC-Bridge Statistics ===');
			output.appendLine(JSON.stringify(stats, null, 2));
			output.appendLine('============================\n');
			output.show();

			// Also show summary in status bar
			const bridgeCount = stats.bridges.length;
			const healthyCount = stats.bridges.filter((b: any) => b.healthy).length;
			vscode.window.setStatusBarMessage(
				`VSC-Bridge: ${healthyCount}/${bridgeCount} bridges healthy`,
				5000
			);
		})
	);

	// Debug command to manually trigger safety scan
	context.subscriptions.push(
		vscode.commands.registerCommand('vsc-bridge.debug.safetyScan', async () => {
			if (!bridgeManager) {
				vscode.window.showErrorMessage('Bridge manager not initialized');
				return;
			}

			output.appendLine('[Debug] Manually triggering safety scan...');
			// The safety scan runs automatically every 2 seconds
			// This just logs current state
			const stats = await bridgeManager.getStatistics();
			for (const bridge of stats.bridges) {
				output.appendLine(`[Debug] Bridge at ${bridge.path}:`);
				output.appendLine(`  - Owner: ${bridge.isOwner}`);
				output.appendLine(`  - Healthy: ${bridge.healthy}`);
				output.appendLine(`  - Jobs: ${JSON.stringify(bridge.jobs)}`);
			}
			output.show();
		})
	);

	// Register configuration listener at END to prevent race condition (Phase 4: T003, Insight #3)
	// CRITICAL: Must be after TelemetryService.instance.initialize() to avoid listener firing before service ready
	try {
		TelemetryService.instance.registerConfigurationListener(context);
	} catch (error) {
		output.appendLine(`[Telemetry] ⚠️  Failed to register configuration listener: ${error instanceof Error ? error.message : String(error)}`);
	}

	// Export context and services for testing
	// This allows tests to access the extension context
	return {
		getContext: () => context,
		getScriptRegistry: () => scriptRegistry,
		getOutput: () => output
	};
}

// This method is called when your extension is deactivated
export async function deactivate() {
	const deactivationTime = new Date().toISOString();

	if (globalOutput) {
		globalOutput.appendLine(`${'='.repeat(60)}`);
		globalOutput.appendLine(`🛑 VSC-BRIDGE EXTENSION DEACTIVATING 🛑`);
		globalOutput.appendLine(`${'='.repeat(60)}`);
		globalOutput.appendLine(`📍 Deactivation Time: ${deactivationTime}`);
		globalOutput.appendLine(`📍 Session ID: ${globalSessionId || 'unknown'}`);
		globalOutput.appendLine(`📍 Process PID: ${process.pid}`);
		globalOutput.appendLine(`${'='.repeat(60)}`);
	}

	// Send ExtensionDeactivated event and dispose telemetry (T005, T007)
	try {
		const sessionDuration = Date.now() - extensionActivationTime;
		TelemetryService.instance.sendEvent('ExtensionDeactivated', {
			telemetrySchemaVersion: '2' // Phase 3: Privacy-enhanced schema (Finding DR-05)
		}, {
			sessionDuration
		});

		// Dispose telemetry with 3-second timeout (Discovery 01)
		await TelemetryService.instance.dispose();
	} catch (error) {
		// Graceful degradation - log but don't crash
		if (globalOutput) {
			globalOutput.appendLine(`[Telemetry] ⚠️  Failed to dispose: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	try {
		if (bridgeManager) {
			if (globalOutput) {
				globalOutput.appendLine(`[BridgeManager] Disposing bridge manager...`);
			}
			bridgeManager.dispose();
			if (globalOutput) {
				globalOutput.appendLine(`[BridgeManager] ✅ Disposed successfully`);
			}
		}
	} finally {
		// Clean up globals to avoid ghost state across reloads
		if (globalOutput) {
			globalOutput.appendLine(`[Cleanup] Clearing global state...`);
		}
		(global as any).scriptRegistry = undefined;
		(global as any).VSC_BRIDGE_BASE_PATH = undefined;
		scriptRegistry = undefined;
		bridgeManager = undefined;
		globalSessionId = undefined;
		globalOutput = undefined;
	}
}

// Export script registry for access
export function getScriptRegistry(): ScriptRegistry | undefined {
	return scriptRegistry;
}