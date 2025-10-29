/**
 * CDP Common Debug Adapter
 *
 * Base class for CDP-based debug adapters (pwa-node, pwa-chrome).
 * Both Node.js and Chrome/browser debugging use V8 engine and Chrome DevTools Protocol (CDP),
 * allowing significant code reuse (~97% shared implementation).
 *
 * Critical Discoveries Applied:
 * - Discovery 02: SCOPE_TYPE_MAP for handling Chrome scope types (Block, With) vs Node (Script, Module)
 * - Discovery 03: Memory budget enforcement and setVariable writable scope restrictions
 * - Discovery 04: Identical capabilities between pwa-node and pwa-chrome
 * - Discovery 05: Dual-strategy cycle detection (variablesReference + Object.is())
 *
 * NOTE: Browser support (pwa-chrome with multi-target) would add:
 * - Target/thread management for pages, iframes, workers, service workers
 * - Browser-only features (event listener breakpoints, network view)
 * - Dynamic target creation/destruction handling
 */

import * as vscode from 'vscode';
import {
    IDebugCapabilities,
    IVariableData,
    IListVariablesParams,
    ISetVariableParams,
    ISetVariableResult,
    IVariableChildrenParams,
    IStreamVariablesParams,
    IStreamResult
} from '../interfaces';
import { BaseDebugAdapter } from './BaseDebugAdapter';
import {
    IDebugError,
    DebugErrorCode,
    createDebugError
} from '../../errors/debug-errors';

/**
 * Enhanced variable data with cycle detection and depth tracking
 */
interface IEnhancedVariableData extends IVariableData {
    /** Children array if expanded */
    children?: IEnhancedVariableData[];
    /** Number of children shown */
    childrenShown?: number;
    /** Total children available */
    totalChildren?: number;
    /** Whether children were truncated */
    childrenTruncated?: boolean;
    /** Truncated due to depth or budget */
    truncated?: boolean;
    /** Reason for truncation */
    truncatedReason?: 'maxDepth' | 'budget' | 'maxChildren';
    /** Whether this is expandable */
    expandable?: boolean;
    /** Circular reference detected */
    cycle?: boolean;
    /** Original value before cycle marker */
    originalValue?: string;
    /** How cycle was detected */
    cycleVia?: 'variablesReference' | 'Object.is';
    /** Target of the cycle (evaluateName) */
    cycleTarget?: string;
    /** Error expanding this variable */
    error?: string;
}

/**
 * Scope type mapping from CDP scope types to DAP-friendly metadata.
 *
 * Based on Chrome DevTools Protocol scope types.
 * Handles differences between pwa-node and pwa-chrome scope reporting.
 *
 * Scope Type Sources:
 * - CDP Debugger Domain: Debugger.Scope type field
 * - Node (pwa-node): local, closure, script, module, global, catch, eval
 * - Chrome (pwa-chrome): local, block, closure, with, global, catch, eval
 *
 * Writability Rules (CDP Restriction):
 * - Writable: local, closure, catch (can use setVariable)
 * - Read-only: block, with, script, module, global, eval (setVariable fails)
 *
 * Expense Rules:
 * - Expensive: script, module, global (large scope, fetch lazily)
 * - Cheap: local, closure, block, catch, with, eval (small scope)
 */
const SCOPE_TYPE_MAP: Record<string, { name: string; expensive: boolean; writable: boolean }> = {
    // Writable scopes (can modify via setVariable)
    'local': {
        name: 'Local',
        expensive: false,
        writable: true
    },
    'closure': {
        name: 'Closure',
        expensive: false,
        writable: true
    },
    'catch': {
        name: 'Catch',
        expensive: false,
        writable: true
    },

    // Read-only scopes (setVariable not allowed)
    'block': {
        name: 'Block',
        expensive: false,
        writable: false
    },
    'with': {
        name: 'With',
        expensive: false,
        writable: false
    },
    'script': {
        name: 'Script',
        expensive: true,  // Large scope (entire script)
        writable: false
    },
    'module': {
        name: 'Module',
        expensive: true,  // Large scope (entire module)
        writable: false
    },
    'global': {
        name: 'Global',
        expensive: true,  // Large scope (global object)
        writable: false
    },
    'eval': {
        name: 'Eval',
        expensive: false,
        writable: false
    }
};

/**
 * Common base class for CDP-based debug adapters (pwa-node, pwa-chrome).
 *
 * Subclasses should override:
 * - Thread/target detection (Node: simple, Chrome: may have multiple targets)
 * - Scope name customization (if needed beyond SCOPE_TYPE_MAP)
 * - Adapter-specific capabilities or restrictions
 *
 * Browser Support Extension Points (pwa-chrome with multi-target):
 * When implementing full browser debugging beyond Extension Host (single-target), consider:
 * - Target/thread management: Browser has multiple targets (pages, iframes, workers, service workers)
 * - getMostRecentlyStoppedThread: Would need to iterate across multiple targets
 * - listVariables: Would need multi-target iteration for comprehensive variable listing
 * - Dynamic target creation/destruction: Handle new pages/workers appearing during debug session
 * - Browser-specific capabilities: Event listener breakpoints, DOM breakpoints, network view
 */
export abstract class CDPCommonAdapter extends BaseDebugAdapter {
    /**
     * Common capabilities for CDP-based adapters (pwa-node, pwa-chrome)
     * Per Discovery 04: Capabilities are identical between Node and Chrome adapters
     *
     * Browser Extension Point:
     * For full browser debugging (beyond Extension Host), additional capabilities may include:
     * - supportsInstrumentationBreakpoints: true (for DOM/XHR/event listener breakpoints)
     * - supportsBreakpointLocationsRequest: true (for inline breakpoints)
     */
    protected static readonly CDP_COMMON_CAPABILITIES: IDebugCapabilities = {
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

    /**
     * Throttling for Object.is() cycle detection
     * Track failures per evaluateName to avoid repeated failed evaluates
     * Per Discovery 05: Dual-strategy cycle detection
     */
    protected evaluateFailures: Map<string, number> = new Map();
    protected readonly MAX_EVALUATE_FAILURES = 2; // After 2 failures, skip Object.is() for that path

    constructor(
        session: vscode.DebugSession,
        capabilities: IDebugCapabilities
    ) {
        super(session, capabilities);
    }

    /**
     * Safely encode a value string for use in evaluate expression
     * Handles primitives, special numbers, and detects unsupported types
     *
     * @param valueStr String representation of the value to encode
     * @returns Encoded value or error for unsupported types
     */
    protected encodeValueForEvaluate(valueStr: string): { encoded?: string; error?: IDebugError } {
        // Trim whitespace
        const value = valueStr.trim();

        // Handle special number literals
        if (value === 'NaN') {
            return { encoded: 'Number.NaN' };
        }
        if (value === 'Infinity') {
            return { encoded: 'Number.POSITIVE_INFINITY' };
        }
        if (value === '-Infinity') {
            return { encoded: 'Number.NEGATIVE_INFINITY' };
        }

        // Handle boolean literals
        if (value === 'true' || value === 'false') {
            return { encoded: value };
        }

        // Handle null and undefined
        if (value === 'null') {
            return { encoded: 'null' };
        }
        if (value === 'undefined') {
            return { encoded: 'undefined' };
        }

        // Handle BigInt (ends with 'n')
        if (/^-?\d+n$/.test(value)) {
            return { encoded: value };
        }

        // Handle numbers (integer or decimal, positive or negative)
        if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
            return { encoded: value };
        }

        // Handle strings - if it looks like a quoted string, use it
        // Otherwise treat the whole value as a string literal
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            // Already quoted, use JSON.stringify to ensure proper escaping
            try {
                // Remove quotes and re-stringify to ensure safety
                const unquoted = value.slice(1, -1);
                return { encoded: JSON.stringify(unquoted) };
            } catch (error) {
                return { encoded: JSON.stringify(value) };
            }
        }

        // For unquoted strings, assume it's a string literal to set
        // This handles the common case: --param value=hello → x = "hello"
        return { encoded: JSON.stringify(value) };
    }

    /**
     * Build a safe assignment expression for evaluate fallback
     * Per code review: Prevent injection and handle special values correctly
     *
     * @param targetPath Variable name or property path (e.g., "x" or "obj.prop")
     * @param value Value to assign (must be serializable)
     * @returns Safe expression string or error
     */
    protected buildSafeAssignment(targetPath: string, value: string): { expr?: string; error?: IDebugError } {
        // Validate target path to prevent injection
        // Allow: simple identifiers, dot notation, bracket notation
        const safePathPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*|\[[^\]]+\])*$/;

        if (!safePathPattern.test(targetPath)) {
            return {
                error: createDebugError(
                    DebugErrorCode.E_INVALID_PARAMS,
                    `Invalid target path: "${targetPath}". Use simple identifiers, dot notation, or bracket notation.`
                )
            };
        }

        // Parse and safely encode the value
        const safeValue = this.encodeValueForEvaluate(value);
        if ('error' in safeValue) {
            return { error: safeValue.error };
        }

        return { expr: `${targetPath} = ${safeValue.encoded}` };
    }

    /**
     * Estimate size of a variable in bytes (conservative estimate)
     * Improved to handle special types better
     */
    protected estimateVariableSize(variable: IVariableData): number {
        let size = 100; // Base size for variable metadata

        if (variable.name) {
            size += variable.name.length * 2; // UTF-16 chars
        }
        if (variable.value) {
            size += variable.value.length * 2;
        }
        if (variable.type) {
            size += variable.type.length * 2;
        }

        // Type-specific estimation improvements
        if (variable.type) {
            const type = variable.type.toLowerCase();

            // Arrays: estimate based on indexed children count
            if (type.includes('array') && variable.indexedVariables) {
                size += variable.indexedVariables * 50; // Conservative per-element estimate
            }

            // Maps/Sets: estimate based on named children count
            if ((type.includes('map') || type.includes('set')) && variable.namedVariables) {
                size += variable.namedVariables * 75; // Entry overhead
            }

            // Buffers/TypedArrays: use byte length hint from value if available
            if (type.includes('buffer') || type.includes('int8') || type.includes('int16') ||
                type.includes('int32') || type.includes('float') || type.includes('uint')) {
                // Value often contains size info like "Uint8Array(1024)"
                const sizeMatch = variable.value?.match(/\((\d+)\)/);
                if (sizeMatch) {
                    size += parseInt(sizeMatch[1], 10);
                }
            }
        }

        return size;
    }

    /**
     * Map CDP scope type to DAP-friendly scope metadata.
     *
     * Handles both Node and Chrome scope types using SCOPE_TYPE_MAP.
     * Logs warning for unknown scope types to facilitate future improvements.
     *
     * Unknown Type Strategy:
     * - Use CDP type as display name
     * - Mark as non-expensive (fetch immediately)
     * - Mark as read-only (conservative, prevents modification errors)
     * - Log warning for investigation
     *
     * @param cdpScopeType - CDP scope type string (e.g., "local", "block", "script")
     * @returns Scope metadata with name, expensive flag, writable flag
     */
    protected mapScopeType(cdpScopeType: string): { name: string; expensive: boolean; writable: boolean } {
        const scopeInfo = SCOPE_TYPE_MAP[cdpScopeType];

        if (!scopeInfo) {
            // Unknown scope type - log for future improvement
            // This helps us discover new CDP scope types in the wild
            console.warn(
                `Unknown CDP scope type encountered: "${cdpScopeType}". ` +
                `Treating as read-only, non-expensive scope. ` +
                `Please report this if it appears frequently.`
            );

            // Conservative fallback
            return {
                name: cdpScopeType,    // Use CDP type as display name
                expensive: false,      // Assume cheap (fetch immediately)
                writable: false        // Assume read-only (prevent modification errors)
            };
        }

        return scopeInfo;
    }

    /**
     * Get the most appropriate thread for debugging operations
     * Per code review: Prefer most recently stopped thread
     *
     * NOTE: Extension Host has single thread; browser may have multiple targets with multiple threads each.
     *
     * @returns Thread ID to use for debugging operations, or null if no suitable thread
     */
    protected async getMostRecentlyStoppedThread(): Promise<number | null> {
        const threads = await this.getThreads();
        if (threads.length === 0) {
            return null;
        }

        // Strategy: Find first thread that appears to be stopped
        // Note: DAP doesn't provide explicit "stopped" state on thread objects
        // We infer from ability to get stack frames
        for (const thread of threads) {
            try {
                const frames = await this.getStackFrames(thread.id, 1);
                if (frames.length > 0) {
                    // This thread has stack frames, likely stopped
                    return thread.id;
                }
            } catch (error) {
                // Can't get frames, try next thread
                continue;
            }
        }

        // Fallback: use first thread
        return threads[0].id;
    }

    /**
     * Stream variables to file - returns suggestion for manual testing phase
     * Per T011: Suggest streaming when budget exceeded
     */
    async streamVariables(params: IStreamVariablesParams): Promise<IStreamResult> {
        // For Phase 3, this returns a "not yet implemented" suggestion
        // Phase 4 will implement actual file streaming via the script
        return {
            success: false,
            error: createDebugError(
                DebugErrorCode.E_NOT_IMPLEMENTED,
                'File streaming is available via the debug.stream-variables script. Use that script directly for file output.'
            )
        };
    }

    /**
     * Get variable children with pagination
     * Per T009: Implement pagination support
     * Per T010: Add indexed/named filtering
     */
    async getVariableChildren(params: IVariableChildrenParams): Promise<IVariableData[] | IDebugError> {
        if (params.variablesReference === 0) {
            return createDebugError(DebugErrorCode.E_INVALID_REFERENCE);
        }

        // Build collision-resistant lock key
        const lockKey = `get-children-${this.session.id}-${params.variablesReference}`;

        return await this.withOperationLock(
            lockKey,
            async (signal) => {
                try {
                    const requestParams: any = {
                        variablesReference: params.variablesReference
                    };

                    // Add pagination parameters if provided
                    if (params.filter) {
                        requestParams.filter = params.filter;
                    }
                    if (params.start !== undefined) {
                        requestParams.start = params.start;
                    }
                    if (params.count !== undefined) {
                        requestParams.count = params.count;
                    }

                    const response = await this.session.customRequest('variables', requestParams);
                    return response.variables || [];
                } catch (error) {
                    if (signal.aborted) {
                        return createDebugError(DebugErrorCode.E_BUSY, 'Operation was aborted');
                    }
                    return createDebugError(
                        DebugErrorCode.E_INVALID_REFERENCE,
                        error instanceof Error ? error.message : String(error)
                    );
                }
            }
        ) as Promise<IVariableData[] | IDebugError>;
    }

    /**
     * Set a variable value using triple-fallback strategy
     * Per T007: Port logic from set-variable.js with dual strategy
     * Per T008: Add evaluate fallback for property paths
     * Per code review: Prefer setExpression before evaluate (better DAP semantics, fewer side effects)
     *
     * Strategy sequence:
     * 1. Try setVariable (works for local/closure/catch scopes with variablesReference)
     * 2. Try setExpression (better DAP semantics, works for simple expressions)
     * 3. Evaluate assignment (last resort, builds safe assignment expression)
     */
    async setVariable(params: ISetVariableParams): Promise<ISetVariableResult> {
        // Build collision-resistant lock key including session, thread, frame context
        // Per code review: Prevent collisions across different scopes
        const threads = await this.getThreads();
        const threadId = threads.length > 0 ? threads[0].id : 0;
        const frames = await this.getStackFrames(threadId, 1);
        const frameId = params.frameId ?? (frames.length > 0 ? frames[0].id : 0);

        const lockKey = `set-var-${this.session.id}-${threadId}-${frameId}-${params.variablesReference}-${params.name}`;

        const result = await this.withOperationLock(
            lockKey,
            async (signal) => {
                try {
                    // Strategy 1: Try setVariable request first
                    if (this.capabilities.supportsSetVariable && params.variablesReference !== undefined) {
                        try {
                            const response = await this.session.customRequest('setVariable', {
                                variablesReference: params.variablesReference,
                                name: params.name,
                                value: params.value
                            });

                            return {
                                success: true,
                                value: response.value,
                                type: response.type,
                                variablesReference: response.variablesReference,
                                namedVariables: response.namedVariables,
                                indexedVariables: response.indexedVariables
                            } as ISetVariableResult;
                        } catch (error) {
                            // setVariable failed, try setExpression or evaluate fallback
                        }
                    }

                    // Strategy 2: Try setExpression (better DAP semantics than raw evaluate)
                    // Per code review: Prefer setExpression before evaluate assignment
                    if (this.capabilities.supportsSetExpression && params.frameId !== undefined) {
                        try {
                            const response = await this.session.customRequest('setExpression', {
                                frameId: params.frameId,
                                expression: params.name,
                                value: params.value
                            });

                            return {
                                success: true,
                                value: response.value,
                                type: response.type,
                                variablesReference: response.variablesReference,
                                namedVariables: response.namedVariables,
                                indexedVariables: response.indexedVariables
                            } as ISetVariableResult;
                        } catch (error) {
                            // setExpression failed, fall through to evaluate assignment
                        }
                    }

                    // Strategy 3: Evaluate assignment fallback (last resort)
                    // Use safe expression builder to prevent injection
                    const threadId = await this.getMostRecentlyStoppedThread();
                    if (threadId === null) {
                        return {
                            success: false,
                            error: createDebugError(DebugErrorCode.E_NO_THREADS)
                        } as ISetVariableResult;
                    }

                    const frames = await this.getStackFrames(threadId, 1);
                    const frameId = params.frameId ?? frames[0].id;

                    // Build safe assignment expression
                    const safeAssignment = this.buildSafeAssignment(params.name, params.value);
                    if (safeAssignment.error) {
                        return {
                            success: false,
                            error: safeAssignment.error
                        } as ISetVariableResult;
                    }

                    const evalResponse = await this.evaluateExpression(safeAssignment.expr!, frameId);

                    if ('code' in evalResponse) {
                        // Evaluation returned an error
                        return {
                            success: false,
                            error: evalResponse
                        } as ISetVariableResult;
                    }

                    return {
                        success: true,
                        value: evalResponse.result,
                        type: evalResponse.type,
                        variablesReference: evalResponse.variablesReference
                    } as ISetVariableResult;
                } catch (error) {
                    if (signal.aborted) {
                        return {
                            success: false,
                            error: createDebugError(DebugErrorCode.E_BUSY, 'Operation was aborted')
                        } as ISetVariableResult;
                    }
                    return {
                        success: false,
                        error: createDebugError(
                            DebugErrorCode.E_MODIFICATION_FAILED,
                            error instanceof Error ? error.message : String(error)
                        )
                    } as ISetVariableResult;
                }
            }
        );

        // withOperationLock might return IDebugError for busy/timeout
        if ('code' in result) {
            return {
                success: false,
                error: result
            };
        }

        return result as ISetVariableResult;
    }

    /**
     * List variables in current scope with depth control
     * Per T003: Port logic from list-variables.js
     * Per T004: Implement memory budget tracking
     * Per T005-T006: Implement cycle detection
     * Per Discovery 02: Refactored scope filtering to use mapScopeType()
     */
    async listVariables(params: IListVariablesParams): Promise<IVariableData[] | IDebugError> {
        const maxDepth = params.maxDepth ?? 2;
        const maxChildren = params.maxChildren ?? 50;
        const includeExpensive = params.includeExpensive ?? false;
        const scopeFilter = params.scopeFilter ?? 'all';

        return await this.withOperationLock('list-variables', async (signal) => {
            try {
                // Get thread and frame
                // Per code review: Use most recently stopped thread, not just first
                const threadId = params.threadId ?? await this.getMostRecentlyStoppedThread();
                if (threadId === null) {
                    return createDebugError(DebugErrorCode.E_NO_THREADS);
                }
                const frames = await this.getStackFrames(threadId, 1);
                if (frames.length === 0) {
                    return createDebugError(DebugErrorCode.E_NO_STACK);
                }

                const frameId = params.frameId ?? frames[0].id;

                // Get scopes
                const scopes = await this.getScopes(frameId);

                // Filter scopes based on expensive flag and scope filter
                // REFACTORED: Use mapScopeType() instead of hardcoded scope name matching (Discovery 02)
                const scopesToProcess = scopes.filter(scope => {
                    // Map CDP scope type to metadata
                    const scopeInfo = this.mapScopeType(scope.type || scope.name.toLowerCase());

                    // Check expensive flag using mapped metadata
                    if (scopeInfo.expensive && !includeExpensive) {
                        return false;
                    }

                    // Apply scope filter using mapped scope name
                    if (scopeFilter !== 'all') {
                        if (scopeFilter === 'local' && scopeInfo.name !== 'Local') {
                            return false;
                        }
                        if (scopeFilter === 'closure' && scopeInfo.name !== 'Closure') {
                            return false;
                        }
                        if (scopeFilter === 'global' && scopeInfo.name !== 'Global') {
                            return false;
                        }
                    }

                    return true;
                });

                // Reset memory budget for this operation
                this.memoryBudget.reset();

                // Track visited references for cycle detection
                const visited = new Set<number>();

                // Recursive expansion with cycle detection and budget tracking
                const expandVariable = async (
                    variable: IVariableData,
                    currentDepth: number,
                    ancestors: IVariableData[]
                ): Promise<IEnhancedVariableData> => {
                    // Check if aborted
                    if (signal.aborted) {
                        throw new Error('Operation aborted');
                    }

                    // Check depth limit
                    if (currentDepth >= maxDepth) {
                        return {
                            ...variable,
                            truncated: true,
                            truncatedReason: 'maxDepth',
                            expandable: variable.variablesReference > 0
                        };
                    }

                    // Leaf node
                    if (variable.variablesReference === 0) {
                        return variable;
                    }

                    // Cycle detection - Strategy 1 (PREFERRED): variablesReference
                    // This is reliable and fast, use it first
                    if (visited.has(variable.variablesReference)) {
                        return {
                            ...variable,
                            cycle: true,
                            value: '[Circular Reference]',
                            originalValue: variable.value,
                            cycleVia: 'variablesReference'
                        };
                    }

                    // Cycle detection - Strategy 2: Object.is() for JavaScript
                    // Per Critical Discovery 05: JavaScript requires Object.is() for accurate detection
                    // Per code review: Add throttling to avoid repeated failed evaluates
                    if (variable.evaluateName) {
                        // Check if we've hit the failure limit for this evaluateName
                        const failures = this.evaluateFailures.get(variable.evaluateName) ?? 0;

                        // Only attempt Object.is() if we haven't exceeded failure threshold
                        if (failures < this.MAX_EVALUATE_FAILURES) {
                            // Check against recent ancestors (last 4 to limit perf impact)
                            const recentAncestors = ancestors.slice(-4);

                            for (const ancestor of recentAncestors) {
                                if (!ancestor.evaluateName) continue;

                                try {
                                    const expr = `Object.is(${variable.evaluateName}, ${ancestor.evaluateName})`;
                                    const evalResponse = await this.session.customRequest('evaluate', {
                                        expression: expr,
                                        frameId: frameId,
                                        context: 'hover' // Side-effect free (throwOnSideEffect)
                                    });

                                    if (evalResponse.result === 'true') {
                                        // Reset failure count on success
                                        this.evaluateFailures.delete(variable.evaluateName);

                                        return {
                                            ...variable,
                                            cycle: true,
                                            value: '[Circular Reference]',
                                            originalValue: variable.value,
                                            cycleVia: 'Object.is',
                                            cycleTarget: ancestor.evaluateName
                                        };
                                    }
                                } catch (error) {
                                    // Evaluation failed (likely getter/proxy side effects)
                                    // Increment failure count and back off
                                    const currentFailures = this.evaluateFailures.get(variable.evaluateName) ?? 0;
                                    this.evaluateFailures.set(variable.evaluateName, currentFailures + 1);

                                    // Log throttling decision (per code review: add observability)
                                    if (currentFailures + 1 >= this.MAX_EVALUATE_FAILURES) {
                                        console.warn(
                                            `Cycle detection throttle activated for "${variable.evaluateName}". ` +
                                            `Failed ${this.MAX_EVALUATE_FAILURES} Object.is() attempts. ` +
                                            `Future checks will rely on variablesReference tracking only.`
                                        );
                                    }
                                    // Continue to next ancestor or fall through
                                }
                            }
                        }
                        // If throttled or all ancestors checked, continue with reference tracking
                    }

                    // Add to visited set
                    visited.add(variable.variablesReference);

                    // Get children
                    try {
                        const childrenResponse = await this.session.customRequest('variables', {
                            variablesReference: variable.variablesReference,
                            count: maxChildren
                        });

                        const allChildren: IVariableData[] = childrenResponse.variables || [];
                        const childrenToExpand = allChildren.slice(0, maxChildren);

                        // Expand children recursively
                        const expandedChildren: IEnhancedVariableData[] = [];
                        const newAncestors = [...ancestors, variable];

                        for (const child of childrenToExpand) {
                            // Check memory budget before expanding
                            const estimatedBytes = this.estimateVariableSize(child);
                            const budgetResult = this.memoryBudget.addNode(estimatedBytes);

                            if (!budgetResult.ok) {
                                // Budget exceeded, stop expanding
                                return {
                                    ...variable,
                                    children: expandedChildren,
                                    childrenShown: expandedChildren.length,
                                    totalChildren: allChildren.length,
                                    truncated: true,
                                    truncatedReason: 'budget'
                                };
                            }

                            const expanded = await expandVariable(child, currentDepth + 1, newAncestors);
                            expandedChildren.push(expanded);
                        }

                        return {
                            ...variable,
                            children: expandedChildren,
                            childrenShown: childrenToExpand.length,
                            totalChildren: variable.namedVariables || variable.indexedVariables || allChildren.length,
                            childrenTruncated: allChildren.length > maxChildren
                        };
                    } catch (error) {
                        return {
                            ...variable,
                            error: error instanceof Error ? error.message : String(error),
                            expandable: true
                        };
                    }
                };

                // Process each scope
                const result: IVariableData[] = [];

                for (const scope of scopesToProcess) {
                    if (scope.variablesReference === 0) {
                        continue;
                    }

                    try {
                        const varsResponse = await this.session.customRequest('variables', {
                            variablesReference: scope.variablesReference,
                            count: 200 // Conservative default
                        });

                        const variables: IVariableData[] = varsResponse.variables || [];

                        // Expand each variable
                        const expandedVariables: IEnhancedVariableData[] = [];
                        for (const variable of variables) {
                            const expanded = await expandVariable(variable, 1, []);
                            expandedVariables.push(expanded);
                        }

                        // Add scope node to result
                        result.push({
                            name: scope.name,
                            value: `${variables.length} variables`,
                            type: 'scope',
                            variablesReference: scope.variablesReference,
                            namedVariables: scope.namedVariables,
                            indexedVariables: scope.indexedVariables,
                            ...(expandedVariables.length > 0 && {
                                children: expandedVariables
                            } as any)
                        });
                    } catch (error) {
                        // Add error scope to result
                        result.push({
                            name: scope.name,
                            value: `Error: ${error instanceof Error ? error.message : String(error)}`,
                            type: 'error',
                            variablesReference: 0
                        });
                    }
                }

                // Check if memory budget was exceeded
                if (this.checkMemoryBudget()) {
                    // Return partial data with suggestion
                    const error = this.createLargeDataError();
                    return {
                        ...error,
                        partialData: result
                    } as any;
                }

                return result;
            } catch (error) {
                if (signal.aborted) {
                    return createDebugError(DebugErrorCode.E_BUSY, 'Operation was aborted');
                }
                return createDebugError(
                    DebugErrorCode.E_INTERNAL,
                    error instanceof Error ? error.message : String(error)
                );
            }
        }) as Promise<IVariableData[] | IDebugError>;
    }
}
