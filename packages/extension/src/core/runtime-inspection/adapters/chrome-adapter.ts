/**
 * Chrome Debug Adapter (pwa-chrome)
 *
 * Debug adapter for Chrome/Chromium debugging, primarily used for Extension Host debugging
 * (dogfooding VSC Bridge extension itself). Extends CDPCommonAdapter for shared V8/CDP logic.
 *
 * Critical Discoveries Applied:
 * - Discovery 01: Extension Host session type is pwa-chrome (not pwa-extensionHost)
 * - Discovery 02: Scope type differences handled via SCOPE_TYPE_MAP in CDPCommonAdapter
 * - Discovery 04: DAP capabilities identical to pwa-node (both use js-debug)
 *
 * Current Implementation Scope:
 * - Extension Host debugging (single-target model)
 * - Simple thread model identical to Node.js
 * - All CDP/V8 logic inherited from CDPCommonAdapter
 *
 * Future Browser Support (Not Implemented):
 * - Multi-target handling (pages, iframes, workers, service workers)
 * - Browser-only features (DOM/event listener breakpoints, network inspection)
 * - Dynamic target creation/destruction events
 */

import * as vscode from 'vscode';
import { CDPCommonAdapter } from './CDPCommonAdapter';
import { IDebugCapabilities } from '../interfaces';

/**
 * Chrome/Chromium Debug Adapter - pwa-chrome session support
 *
 * Used for:
 * - Extension Host debugging (dogfooding the extension's own code)
 * - Future: General Chrome/Edge browser debugging
 *
 * Extends CDPCommonAdapter for shared V8/CDP functionality (~97% code reuse).
 *
 * Current implementation focuses on Extension Host (single-target model):
 * - Simple thread model (single main thread, like Node.js)
 * - Scope types: Local, Closure, Block, Global (handled by SCOPE_TYPE_MAP)
 * - All variable inspection logic inherited from CDPCommonAdapter
 *
 * NOTE: Browser support would require additional implementation:
 * - Multi-target detection and management (see js-debug's target discovery logic)
 * - Target lifecycle events: listen to targetCreated, targetDestroyed CDP events
 * - Per-target variable reference management and thread tracking
 * - Browser-specific capabilities (instrumentation breakpoints, network view)
 */
export class ChromeDebugAdapter extends CDPCommonAdapter {
    /**
     * Create Chrome debug adapter
     *
     * NOTE: Capabilities are identical to pwa-node per Critical Discovery 04.
     * Both adapters use the same js-debug DAP implementation with identical feature set.
     */
    constructor(session: vscode.DebugSession) {
        // Define Chrome-specific capabilities
        // NOTE: These are identical to NodeDebugAdapter per Discovery 04
        const capabilities: IDebugCapabilities = {
            supportsSetVariable: true,
            supportsVariablePaging: true,
            supportsVariableType: true,
            supportsMemoryReferences: false, // pwa-chrome doesn't provide memory refs
            supportsProgressReporting: true,
            supportsInvalidatedEvent: true,
            supportsMemoryEvent: false,
            supportsEvaluateForHovers: true,
            supportsSetExpression: true,
            supportsDataBreakpoints: false
            // NOTE: Browser-only capabilities would be added here for general browser debugging:
            // - supportsInstrumentationBreakpoints: true (DOM/XHR/event breakpoints)
            // - supportsBreakpointLocationsRequest: true (inline breakpoints)
        };

        super(session, capabilities);
    }

    // All methods inherited from CDPCommonAdapter:
    // - listVariables (with Block/With scope support via SCOPE_TYPE_MAP)
    // - setVariable (with CDP writable scope restrictions: local/closure/catch only)
    // - getVariableChildren (with pagination support)
    // - streamVariables (returns not-implemented suggestion)
    // - getMostRecentlyStoppedThread (simple thread detection, works for Extension Host)
    // - estimateVariableSize (type-specific estimation)
    // - buildSafeAssignment (injection prevention)
    // - encodeValueForEvaluate (safe value encoding)
    // - mapScopeType (handles Chrome-specific Block/With scopes)

    // NOTE: Browser multi-target support would override getMostRecentlyStoppedThread:
    // protected async getMostRecentlyStoppedThread(): Promise<number> {
    //     // Extension Host: simple single-thread model (inherited implementation works)
    //     // Browser: would need to track multiple threads across pages/iframes/workers
    //     // - Maintain thread list per target (main page, iframes, workers)
    //     // - Refresh on targetCreated/targetDestroyed CDP events
    //     // - Return thread ID from most recent stopped event across all targets
    //     return super.getMostRecentlyStoppedThread();
    // }
}
