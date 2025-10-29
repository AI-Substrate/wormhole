import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { ITelemetry, TelemetryInitializeOptions } from './types';
import { scrubPII } from './privacy';

/**
 * Default Application Insights connection string.
 *
 * NOTE: Connection strings are NOT considered secrets per Microsoft guidance.
 * They can be safely hardcoded in client-side code (browser, mobile apps, VS Code extensions).
 *
 * Precedence chain for connection string resolution:
 * 1. process.env.APPLICATIONINSIGHTS_CONNECTION_STRING (highest priority)
 * 2. options.connectionString parameter (explicit override)
 * 3. DEFAULT_CONNECTION_STRING constant (fallback)
 *
 * TODO: Consider configuration file or remote config for rotation without code release
 */
const DEFAULT_CONNECTION_STRING =
	'InstrumentationKey=64d866ab-b513-4527-b9e3-5ad505d5fe61;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/;ApplicationId=80548c1f-e94b-4ef8-b9cf-3b1c999f05d9';

/**
 * Privacy-first telemetry service singleton for Application Insights integration.
 *
 * Design Principles:
 * - Singleton pattern (static get instance()) matching codebase patterns
 * - Fire-and-forget event sending (never blocks extension operations)
 * - Graceful degradation (extension works even if telemetry fails)
 * - Privacy-safe (no PII, sanitized paths, scrubbed error messages)
 * - Respects VS Code telemetry settings (vscode.env.isTelemetryEnabled)
 * - Development mode gating (requires VSCBRIDGE_TELEMETRY_IN_DEV=1)
 *
 * Critical Discoveries Implemented:
 * - Discovery 01: dispose() races with 3-second timeout (prevents deactivation deadlock)
 * - Discovery 02: Uses vscode.env.isTelemetryEnabled API (NOT configuration setting)
 * - Discovery 03: Singleton pattern with instance getter and nullish coalescing
 *
 * @example
 * ```typescript
 * // In extension.ts activate()
 * TelemetryService.instance.initialize({
 *   context,
 *   outputChannel,
 *   connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
 * });
 *
 * // In deactivate()
 * await TelemetryService.instance.dispose();
 * ```
 */
export class TelemetryService implements ITelemetry {
	private static _instance: TelemetryService | null = null;

	/**
	 * Get the singleton instance of TelemetryService.
	 *
	 * Uses nullish coalescing to create instance on first access.
	 * Pattern matches existing services (DebugSessionCaptureService, EditorContextProvider).
	 */
	static get instance(): TelemetryService {
		return (this._instance ??= new TelemetryService());
	}

	// Service state
	private sessionId: string = '';
	private reporter?: TelemetryReporter;
	private enabled: boolean = false;
	private outputChannel?: vscode.OutputChannel;
	private context?: vscode.ExtensionContext;

	/**
	 * Private constructor enforces singleton pattern.
	 * Use TelemetryService.instance to access.
	 */
	private constructor() {
		// Singleton - no initialization here, happens in initialize()
	}

	/**
	 * Initialize telemetry service with VS Code context and configuration.
	 *
	 * CRITICAL: Must be called early in extension activate() after OutputChannel creation,
	 * before any failures that might need telemetry tracking.
	 *
	 * Respects precedence chain (highest to lowest):
	 * 1. VS Code global telemetry setting (vscode.env.isTelemetryEnabled)
	 * 2. Extension-specific setting (vscBridge.telemetry.enabled) - Phase 4
	 * 3. Development mode gating (extensionMode === Development requires env var)
	 * 4. Environment variable override (APPLICATIONINSIGHTS_CONNECTION_STRING)
	 *
	 * @param options - Initialization options (context, outputChannel, optional connectionString)
	 * @throws Error if required parameters (context, outputChannel) are missing
	 */
	initialize(options: TelemetryInitializeOptions): void {
		// Validate required parameters
		if (!options.context) {
			throw new Error('TelemetryService.initialize: options.context is required');
		}
		if (!options.outputChannel) {
			throw new Error('TelemetryService.initialize: options.outputChannel is required');
		}

		// Store references for later use
		this.outputChannel = options.outputChannel;
		this.context = options.context;

		// Idempotency check - prevent double initialization
		if (this.reporter) {
			this.outputChannel.appendLine('[Telemetry] ⚠️  Already initialized');
			return;
		}

		// Check VS Code global telemetry setting (Discovery 02: use API not configuration)
		if (!vscode.env.isTelemetryEnabled) {
			this.enabled = false;
			this.outputChannel.appendLine('[Telemetry] ⚠️  Disabled (VS Code telemetry off)');
			return;
		}

		// Development mode gating (Discovery 09: explicit opt-in required)
		if (options.context.extensionMode === vscode.ExtensionMode.Development) {
			if (process.env.VSCBRIDGE_TELEMETRY_IN_DEV !== '1') {
				this.enabled = false;
				this.outputChannel.appendLine('[Telemetry] ⚠️  Disabled (development mode, set VSCBRIDGE_TELEMETRY_IN_DEV=1 to enable)');
				return;
			}
		}

		// Resolve connection string with precedence chain
		const connectionString =
			process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || options.connectionString || DEFAULT_CONNECTION_STRING;

		if (!connectionString || connectionString.trim() === '') {
			this.enabled = false;
			this.outputChannel.appendLine('[Telemetry] ⚠️  Disabled (no connection string available)');
			return;
		}

		// Create TelemetryReporter (graceful degradation on failure)
		try {
			this.reporter = new TelemetryReporter(connectionString);
			this.enabled = true;

			// Generate session ID for event correlation (Discovery/Insight 04)
			this.sessionId = crypto.randomUUID();

			// Register listener for dynamic telemetry setting changes
			vscode.env.onDidChangeTelemetryEnabled(
				enabled => {
					this.enabled = enabled;
					const status = enabled ? 'enabled' : 'disabled';
					this.outputChannel?.appendLine(`[Telemetry] ℹ️  Telemetry ${status} (VS Code setting changed)`);
				},
				null,
				options.context.subscriptions
			);

			this.outputChannel.appendLine('[Telemetry] ✅ Initialized');

			// Send smoke test event to verify telemetry path works (Insight #1)
			this.sendEvent('TelemetryInitialized', {
				sessionId: this.sessionId,
				extensionVersion: this.context.extension.packageJSON.version,
				platform: process.platform,
			});
		} catch (error) {
			this.enabled = false;
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.outputChannel.appendLine(`[Telemetry] ⚠️  Failed to create reporter: ${errorMessage}`);
		}
	}

	/**
	 * Send a telemetry event.
	 *
	 * WARNING: NEVER log property values to OutputChannel (PII risk for VS Code issue reports).
	 * Only log event names and property keys.
	 *
	 * @param eventName - Event name (e.g., "ScriptExecutionCompleted")
	 * @param properties - String key-value pairs (must be pre-sanitized)
	 * @param measurements - Numeric key-value pairs
	 */
	sendEvent(eventName: string, properties?: Record<string, string>, measurements?: Record<string, number>): void {
		if (!this.isEnabled()) {
			return;
		}

		try {
			this.reporter?.sendTelemetryEvent(eventName, properties, measurements);

			// Log to OutputChannel: event name + property keys only (Insight #2)
			const propKeys = properties ? Object.keys(properties).join(', ') : 'none';
			this.outputChannel?.appendLine(`[Telemetry] 📤 Event: ${eventName} [props: ${propKeys}]`);
		} catch (error) {
			// Graceful degradation - never crash extension due to telemetry
			this.outputChannel?.appendLine(`[Telemetry] ⚠️  Failed to send event ${eventName}`);
		}
	}

	/**
	 * Send an error event (operational error with known ErrorCode).
	 *
	 * WARNING: NEVER log property values to OutputChannel (PII risk for VS Code issue reports).
	 * Only log event names and property keys.
	 *
	 * @param eventName - Error event name (e.g., "ScriptExecutionFailed")
	 * @param properties - String key-value pairs including errorCode
	 * @param measurements - Numeric key-value pairs
	 */
	sendErrorEvent(eventName: string, properties?: Record<string, string>, measurements?: Record<string, number>): void {
		if (!this.isEnabled()) {
			return;
		}

		try {
			this.reporter?.sendTelemetryErrorEvent(eventName, properties, measurements);

			// Log to OutputChannel: event name + property keys only (Insight #2)
			const propKeys = properties ? Object.keys(properties).join(', ') : 'none';
			this.outputChannel?.appendLine(`[Telemetry] 📤 Error Event: ${eventName} [props: ${propKeys}]`);
		} catch (error) {
			// Graceful degradation - never crash extension due to telemetry
			this.outputChannel?.appendLine(`[Telemetry] ⚠️  Failed to send error event ${eventName}`);
		}
	}

	/**
	 * Send an exception event (unexpected error with stack trace).
	 *
	 * Stack trace is automatically scrubbed for PII before sending.
	 * Sent as error event with exception metadata in properties.
	 *
	 * WARNING: NEVER log property values to OutputChannel (PII risk for VS Code issue reports).
	 * Only log event names and property keys.
	 *
	 * @param exception - Error object (stack trace will be scrubbed)
	 * @param properties - String key-value pairs (must be pre-sanitized)
	 * @param measurements - Numeric key-value pairs
	 */
	sendException(exception: Error, properties?: Record<string, string>, measurements?: Record<string, number>): void {
		if (!this.isEnabled()) {
			return;
		}

		try {
			// Scrub PII from error message and stack trace
			const scrubbedMessage = scrubPII(exception.message);
			const scrubbedStack = exception.stack ? scrubPII(exception.stack) : '';

			// Send as error event with exception metadata
			const exceptionProperties = {
				...properties,
				exceptionType: exception.name,
				exceptionMessage: scrubbedMessage,
				exceptionStack: scrubbedStack,
			};

			this.reporter?.sendTelemetryErrorEvent('UnhandledException', exceptionProperties, measurements);

			// Log to OutputChannel: exception name + property keys only (Insight #2)
			const propKeys = properties ? Object.keys(properties).join(', ') : 'none';
			this.outputChannel?.appendLine(`[Telemetry] 📤 Exception: ${exception.name} [props: ${propKeys}]`);
		} catch (error) {
			// Graceful degradation - never crash extension due to telemetry
			this.outputChannel?.appendLine(`[Telemetry] ⚠️  Failed to send exception ${exception.name}`);
		}
	}

	/**
	 * Check if telemetry is currently enabled.
	 *
	 * @returns true if telemetry events will be sent, false otherwise
	 */
	isEnabled(): boolean {
		return this.enabled && !!this.reporter;
	}

	/**
	 * Get the current session ID for event correlation.
	 *
	 * Session ID is generated during initialize() and remains constant for the
	 * extension's lifetime. All telemetry events should include this sessionId
	 * to enable correlation in Application Insights queries.
	 *
	 * @returns Session ID (UUID v4) or empty string if not initialized
	 */
	getSessionId(): string {
		return this.sessionId;
	}

	/**
	 * Register configuration listener for dynamic telemetry enable/disable.
	 *
	 * CRITICAL: Call this at the END of activate() after initialize() completes
	 * to prevent race condition where listener fires before service is ready.
	 * (Per Insight #3 from /didyouknow session)
	 *
	 * Configuration Precedence (highest to lowest):
	 * 1. VS Code global: vscode.env.isTelemetryEnabled === false → force disable
	 * 2. Extension setting: vscBridge.telemetry.enabled === false → disable
	 * 3. If both true → telemetry enabled
	 *
	 * Implements dispose/recreate pattern (Insight #4): When disabled, dispose reporter
	 * and set to null to free memory. When re-enabled, create new reporter instance.
	 *
	 * @param context - Extension context for subscription cleanup
	 */
	registerConfigurationListener(context: vscode.ExtensionContext): void {
		const listener = vscode.workspace.onDidChangeConfiguration(async e => {
			if (!e.affectsConfiguration('vscBridge.telemetry')) {
				return; // Not our setting, ignore
			}

			try {
				// Check precedence: VS Code global takes priority (Discovery 02)
				const vsCodeEnabled = vscode.env.isTelemetryEnabled;
				const extEnabled = vscode.workspace
					.getConfiguration('vscBridge')
					.get<boolean>('telemetry.enabled', true);

				const shouldEnable = vsCodeEnabled && extEnabled;

				if (!shouldEnable && this.reporter) {
					// Disable: Dispose reporter and free memory (Insight #4 - dispose/recreate pattern)
					this.outputChannel?.appendLine('[Telemetry] ⚠️  Disabled per user setting');
					await this.reporter.dispose(); // Flush pending events (3s timeout in TelemetryReporter)
					this.reporter = undefined; // Explicit memory release
					this.enabled = false;
				} else if (shouldEnable && !this.reporter) {
					// Re-enable: Create new reporter (Insight #4 - dispose/recreate pattern)
					const connectionString =
						process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || DEFAULT_CONNECTION_STRING;
					this.reporter = new TelemetryReporter(connectionString);
					this.enabled = true;
					this.outputChannel?.appendLine('[Telemetry] ✅ Enabled per user setting');
				}
				// Else: No state change (already in desired state)
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				this.outputChannel?.appendLine(`[Telemetry] ⚠️  Configuration change failed: ${errorMessage}`);
				// Continue - don't crash extension due to telemetry config issue
			}
		});

		context.subscriptions.push(listener);
	}

	/**
	 * Dispose the telemetry reporter and flush buffered events.
	 *
	 * CRITICAL (Discovery 01): Races with 3-second timeout to prevent deactivation deadlock.
	 * The Application Insights SDK attempts to resolve proxy settings during dispose(),
	 * which can hang indefinitely if the Electron renderer process has already terminated.
	 *
	 * @returns Promise that resolves when disposal completes OR timeout occurs (whichever is first)
	 */
	async dispose(): Promise<void> {
		if (!this.reporter) {
			return;
		}

		try {
			// Create 3-second timeout promise
			const timeout = new Promise<void>(resolve => setTimeout(resolve, 3000));

			// Race dispose against timeout (Discovery 01 - critical deadlock mitigation)
			await Promise.race([this.reporter.dispose(), timeout]);

			this.outputChannel?.appendLine('[Telemetry] Disposed');
		} catch (error) {
			// Graceful degradation - log but don't throw
			this.outputChannel?.appendLine('[Telemetry] ⚠️  Dispose failed');
		} finally {
			this.reporter = undefined;
			this.enabled = false;
		}
	}
}
