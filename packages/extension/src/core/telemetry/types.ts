import * as vscode from 'vscode';

/**
 * Telemetry service interface providing privacy-safe event tracking.
 *
 * All methods are fire-and-forget (no return values) and should never throw.
 * Telemetry failures must not affect extension functionality.
 */
export interface ITelemetry {
	/**
	 * Send a telemetry event with optional properties and measurements.
	 *
	 * @param eventName - Event name (e.g., "ScriptExecutionCompleted")
	 * @param properties - String key-value pairs (e.g., { scriptName: "bp.set", errorCode: "E_TIMEOUT" })
	 * @param measurements - Numeric key-value pairs (e.g., { durationMs: 123, retryCount: 2 })
	 *
	 * WARNING: All file paths MUST be sanitized using sanitizePath() before passing to this method.
	 * WARNING: All error messages MUST be scrubbed using scrubPII() before passing to this method.
	 */
	sendEvent(eventName: string, properties?: Record<string, string>, measurements?: Record<string, number>): void;

	/**
	 * Send an error event (operational error with known ErrorCode).
	 *
	 * @param eventName - Error event name (e.g., "ScriptExecutionFailed")
	 * @param properties - String key-value pairs including errorCode
	 * @param measurements - Numeric key-value pairs (e.g., { durationMs: 123 })
	 */
	sendErrorEvent(eventName: string, properties?: Record<string, string>, measurements?: Record<string, number>): void;

	/**
	 * Send an exception event (unexpected error with stack trace).
	 *
	 * @param exception - Error object (stack trace will be scrubbed automatically)
	 * @param properties - String key-value pairs for additional context
	 * @param measurements - Numeric key-value pairs
	 *
	 * WARNING: Stack traces are automatically scrubbed for PII, but properties are NOT.
	 * Ensure all properties are sanitized before passing.
	 */
	sendException(exception: Error, properties?: Record<string, string>, measurements?: Record<string, number>): void;

	/**
	 * Check if telemetry is currently enabled.
	 *
	 * Returns false if:
	 * - VS Code global telemetry is disabled (vscode.env.isTelemetryEnabled)
	 * - Extension-specific telemetry is disabled (vscBridge.telemetry.enabled)
	 * - Development mode without VSCBRIDGE_TELEMETRY_IN_DEV=1
	 * - Initialization failed (invalid connection string, reporter creation failed)
	 *
	 * @returns true if telemetry events will be sent, false otherwise
	 */
	isEnabled(): boolean;

	/**
	 * Get the current session ID for event correlation.
	 *
	 * Session ID is generated during initialize() and remains constant for the
	 * extension's lifetime. All telemetry events should include this sessionId
	 * in their properties to enable correlation across events in Application Insights.
	 *
	 * @returns Session ID (UUID v4) or empty string if not initialized
	 */
	getSessionId(): string;

	/**
	 * Dispose the telemetry reporter and flush buffered events.
	 *
	 * CRITICAL: This method races with a 3-second timeout to prevent deactivation deadlock.
	 * If dispose takes longer than 3 seconds, the timeout wins and some events may be lost.
	 *
	 * @returns Promise that resolves when disposal completes OR timeout occurs
	 */
	dispose(): Promise<void>;
}

/**
 * Initialization options for TelemetryService.
 *
 * Uses options object pattern for extensibility - future phases can add optional
 * properties (e.g., samplingRate, customProperties) without breaking existing call sites.
 */
export interface TelemetryInitializeOptions {
	/**
	 * VS Code extension context (required for lifecycle management and version metadata).
	 */
	context: vscode.ExtensionContext;

	/**
	 * Output channel for local logging (required for user-visible diagnostic messages).
	 *
	 * Telemetry service logs all state transitions to this channel with [Telemetry] prefix:
	 * - Initialization success/failure
	 * - Event send operations (event names + property keys only, never values)
	 * - Disposal completion
	 */
	outputChannel: vscode.OutputChannel;

	/**
	 * Application Insights connection string (optional, fallback precedence chain).
	 *
	 * Precedence (highest to lowest):
	 * 1. process.env.APPLICATIONINSIGHTS_CONNECTION_STRING (environment variable override)
	 * 2. options.connectionString (explicit parameter)
	 * 3. DEFAULT_CONNECTION_STRING constant (hardcoded default in TelemetryService)
	 *
	 * If all three are empty/undefined, telemetry will be disabled with warning logged.
	 */
	connectionString?: string;
}
