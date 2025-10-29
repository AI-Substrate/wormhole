/**
 * Telemetry module - Privacy-first Application Insights integration
 *
 * Public API:
 * - TelemetryService: Singleton service for sending telemetry events
 * - ITelemetry: Interface for telemetry service (for dependency injection)
 * - TelemetryInitializeOptions: Options object for initialize() method
 * - sanitizePath: Transform file paths to workspace-relative format
 * - scrubPII: Remove emails, tokens from strings
 * - sanitizeParams: Sanitize script parameters for telemetry
 *
 * @example
 * ```typescript
 * import { TelemetryService, sanitizePath } from './core/telemetry';
 *
 * // Initialize in activate()
 * TelemetryService.instance.initialize({
 *   context,
 *   outputChannel,
 *   connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
 * });
 *
 * // Use in code
 * const filePath = sanitizePath('/workspaces/project/src/test.ts');
 * TelemetryService.instance.sendEvent('FileOpened', { path: filePath });
 * ```
 */

export { TelemetryService } from './TelemetryService';
export { ITelemetry, TelemetryInitializeOptions } from './types';
export { sanitizePath, scrubPII, sanitizeParams } from './privacy';
