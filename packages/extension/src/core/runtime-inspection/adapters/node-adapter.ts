/**
 * Node.js Debug Adapter
 *
 * Full implementation for Node.js (pwa-node) debug adapter with all enhanced features.
 * Ports proven logic from dynamic debug scripts into the service layer architecture.
 *
 * Critical Discoveries Applied:
 * - Discovery 02: Variable references only valid while paused (handled by BaseDebugAdapter)
 * - Discovery 03: Memory budget tracking with 5MB/20k nodes limits
 * - Discovery 05: Object.is() cycle detection for JavaScript objects
 */

import * as vscode from 'vscode';
import {
    IDebugAdapter,
    IDebugCapabilities,
    IVariableData,
    IListVariablesParams,
    ISetVariableParams,
    ISetVariableResult,
    IVariableChildrenParams,
    IStreamVariablesParams,
    IStreamResult
} from '../interfaces';
import { CDPCommonAdapter } from './CDPCommonAdapter';
import {
    IDebugError,
    DebugErrorCode,
    createDebugError,
    createLargeDataError
} from '../../errors/debug-errors';

/**
 * Node.js Debug Adapter - Full implementation for pwa-node
 *
 * This adapter implements all variable exploration features for Node.js debugging:
 * - Variable listing with depth control and scope filtering
 * - Cycle detection using Object.is() for JavaScript objects
 * - Memory budget tracking to prevent crashes
 * - Variable modification via setVariable and evaluate fallback
 * - Pagination for large arrays and objects
 * - File streaming suggestion for large data
 */
export class NodeDebugAdapter extends CDPCommonAdapter {
    /**
     * Create Node.js debug adapter
     * Per T002: Set capabilities specific to pwa-node
     */
    constructor(session: vscode.DebugSession) {
        // Define Node.js-specific capabilities
        const capabilities: IDebugCapabilities = {
            supportsSetVariable: true,
            supportsVariablePaging: true,
            supportsVariableType: true,
            supportsMemoryReferences: false, // pwa-node doesn't provide memory refs
            supportsProgressReporting: true,
            supportsInvalidatedEvent: true,
            supportsMemoryEvent: false,
            supportsEvaluateForHovers: true,
            supportsSetExpression: true,
            supportsDataBreakpoints: false
        };

        super(session, capabilities);
    }

    // All methods inherited from CDPCommonAdapter:
    // - listVariables (with dual cycle detection and memory budget tracking)
    // - setVariable (with DAP setVariable → evaluate fallback)
    // - getVariableChildren (with pagination support)
    // - streamVariables (returns not-implemented suggestion)
    // - getMostRecentlyStoppedThread (simple thread detection)
    // - estimateVariableSize (type-specific estimation)
    // - buildSafeAssignment (injection prevention)
    // - encodeValueForEvaluate (safe value encoding)
}
