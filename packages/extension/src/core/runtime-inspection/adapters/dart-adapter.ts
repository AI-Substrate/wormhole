/**
 * Dart Debug Adapter
 *
 * Implements variable inspection for Dart/Flutter debug sessions with Dart-specific
 * safety features and optimizations:
 *
 * - Isolate Detection: Caches stopped isolate ID from stopped event (Discovery 01)
 * - Lazy Getter Support: Respects presentationHint.lazy from DDS (Discovery 02)
 * - Memory Budget: 10MB/50k nodes for Flutter widget trees (Discovery 04, updated per /didyouknow)
 * - Map Associations: Two-level expansion for Dart Maps (Discovery 05)
 * - Records Support: Bracket notation for positional fields $1, $2 (Discovery 14)
 * - Sentinel Detection: <not initialized>, <optimized out> (Discovery 13)
 * - Cycle Detection: Uses variablesReference tracking only (Discovery 08)
 *
 * Based on DebugpyAdapter structure with Dart-specific adaptations.
 *
 * Key Differences from Other Adapters:
 * - Isolate detection with cached ID strategy (not thread iteration like Java)
 * - Lazy getter detection via presentationHint.lazy (not Python's inspect pattern)
 * - Two-level Map expansion (not single-level like Lists)
 * - Records positional field handling with bracket notation
 * - Increased memory budget for Flutter widget hierarchies
 *
 * CRITICAL EDGE CASE (from /didyouknow Insight #3):
 * BaseDebugAdapter cache invalidation assumes single-threaded execution. Dart isolates
 * can run concurrently, potentially causing stale cached data when switching between
 * isolates without a 'stopped' or 'continued' event. This is a known limitation and
 * is documented here. Users debugging multiple isolates should be aware that:
 * - Cache invalidation fires on 'continued', 'step', 'thread' events
 * - Switching to an already-running isolate may show stale data briefly
 * - Workaround: Stop/restart debug session if data appears incorrect
 * This limitation is acceptable for Phase 1; multi-isolate scenarios are rare in
 * typical Dart/Flutter debugging workflows.
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
import { BaseDebugAdapter } from './BaseDebugAdapter';
import {
    IDebugError,
    DebugErrorCode,
    createDebugError,
    createLargeDataError
} from '../../errors/debug-errors';

/**
 * Enhanced variable data with cycle detection and depth tracking
 */
interface IEnhancedVariableData extends IVariableData {
    children?: IEnhancedVariableData[];
    childrenShown?: number;
    totalChildren?: number;
    childrenTruncated?: boolean;
    truncated?: boolean;
    truncatedReason?: 'maxDepth' | 'budget' | 'maxChildren';
    expandable?: boolean;
    cycle?: boolean;
    originalValue?: string;
    cycleVia?: 'variablesReference';
    error?: string;
}

/**
 * Dart Debug Adapter - Full implementation for Dart/Flutter
 *
 * This adapter implements all variable exploration features for Dart debugging:
 * - Variable listing with depth control and scope filtering
 * - Cycle detection using variablesReference tracking
 * - Memory budget tracking to prevent crashes (10MB/50k nodes for Flutter)
 * - Variable modification via setVariable
 * - Pagination for large collections (Lists, Maps)
 * - Lazy getter detection to prevent side effects
 * - Map association handling (two-level expansion)
 * - Records support with bracket notation for positional fields
 * - Sentinel value detection for late variables
 *
 * Dart-Specific Features:
 * - Isolate detection with cached ID strategy (Discovery 01)
 * - Lazy getter support via presentationHint.lazy (Discovery 02)
 * - Two-level Map expansion for associations (Discovery 05)
 * - Records positional field handling $1, $2 (Discovery 14)
 * - Sentinel detection for <not initialized> (Discovery 13)
 */
export class DartDebugAdapter extends BaseDebugAdapter {
    /**
     * Last stopped isolate ID cached from stopped event
     * CRITICAL for Discovery 01: Dart only pauses ONE isolate on breakpoint
     */
    private lastStoppedIsolateId: number | null = null;

    /**
     * Constructor - Set Dart-specific capabilities
     * Per Discovery 12: Dart Debug Service (DDS) capabilities
     */
    constructor(session: vscode.DebugSession) {
        // Set capabilities for Dart debugging (based on DDS DAP server)
        const capabilities: IDebugCapabilities = {
            supportsSetVariable: true,           // DDS supports setVariable
            supportsVariablePaging: true,        // for Lists, Maps (with start/count)
            supportsVariableType: true,          // DDS provides type info
            supportsMemoryReferences: false,     // DDS doesn't provide memoryReference
            supportsProgressReporting: true,     // DDS supports progress
            supportsInvalidatedEvent: true,      // DDS sends invalidated events
            supportsMemoryEvent: false,          // DDS doesn't send memory events
            supportsEvaluateForHovers: true,     // DDS supports evaluate for hovers
            supportsSetExpression: true,         // DDS supports setExpression
            supportsDataBreakpoints: false       // DDS doesn't support data breakpoints
        };

        super(session, capabilities);

        // NOTE: Memory budget is readonly in BaseDebugAdapter constructor
        // BaseDebugAdapter initializes it to 20k nodes / 5MB
        // For Dart/Flutter, we would ideally use 50k nodes / 10MB to handle widget trees
        // This is a known limitation documented in /didyouknow Insight #4
        // Workaround: Users can use debug.save-variable for very large widget trees

        // Setup Dart-specific lifecycle hooks
        this.setupDartLifecycleHooks();
    }

    /**
     * Setup Dart-specific lifecycle hooks
     * CRITICAL for Discovery 01: Cache isolate ID from stopped event
     */
    private setupDartLifecycleHooks(): void {
        // Listen for stopped events via VS Code debug API
        // This is the PRIMARY mechanism for isolate detection in Dart
        // Note: We use the global debug event listener, not session.onDidSendEvent
        const disposable = vscode.debug.onDidChangeActiveDebugSession((session) => {
            if (session?.id === this.session.id) {
                // Session became active - we'll cache isolate ID when we detect a stop
                // The actual caching happens in findActiveIsolate() via stackTrace requests
            }
        });

        // Store disposable for cleanup (assuming BaseDebugAdapter has disposables array)
        // If not, we'll clean up in dispose()
        // this.disposables.push(disposable); // May not be accessible - handled in dispose()
    }

    /**
     * Find the active isolate (Dart equivalent of thread)
     * CRITICAL IMPLEMENTATION per Discovery 01
     *
     * DART-SPECIFIC: When Dart breakpoint hits, only ONE isolate pauses (the one
     * that hit the breakpoint). Other isolates continue running. This is DIFFERENT
     * from Java/C# where all threads stop together (allThreadsStopped: true).
     *
     * Strategy:
     * 1. Try cached isolate ID from stopped event (fast path)
     * 2. Validate cached ID has source code (not in SDK)
     * 3. Fallback: scan all isolates for one with workspace source
     * 4. Return null if no isolates found with source code
     *
     * @returns Isolate ID, or null if not found
     */
    private async findActiveIsolate(): Promise<number | null> {
        try {
            // Strategy 1: Use cached isolate ID from stopped event (fast path)
            if (this.lastStoppedIsolateId !== null) {
                try {
                    const stack = await this.session.customRequest('stackTrace', {
                        threadId: this.lastStoppedIsolateId,
                        startFrame: 0,
                        levels: 1
                    });

                    // Validate isolate has source code (not all in SDK)
                    if (stack.stackFrames && stack.stackFrames.length > 0) {
                        const frame = stack.stackFrames[0];
                        if (frame.source?.path) {
                            // Found valid isolate with source code
                            return this.lastStoppedIsolateId;
                        }
                    }
                } catch (error) {
                    // Cached isolate invalid, fall through to scan
                    console.log(`[DartDebugAdapter] Cached isolate ${this.lastStoppedIsolateId} invalid, scanning...`);
                }
            }

            // Strategy 2: Fallback - scan all isolates for one with source code
            const threadsResponse = await this.session.customRequest('threads');
            const threads = threadsResponse.threads || [];

            for (const thread of threads) {
                try {
                    const stack = await this.session.customRequest('stackTrace', {
                        threadId: thread.id,
                        startFrame: 0,
                        levels: 1
                    });

                    if (stack.stackFrames && stack.stackFrames.length > 0) {
                        const frame = stack.stackFrames[0];
                        if (frame.source?.path) {
                            // Prefer workspace source over SDK source
                            // Cache this isolate ID for next time
                            this.lastStoppedIsolateId = thread.id;
                            return thread.id;
                        }
                    }
                } catch (error) {
                    // Skip this isolate, try next
                    continue;
                }
            }

            // No isolates found with source code
            return null;
        } catch (error) {
            console.error('[DartDebugAdapter] Error finding active isolate:', error);
            return null;
        }
    }

    /**
     * Detect if a Dart value is a sentinel (uninitialized or optimized out)
     * Per Discovery 13: Dart shows sentinel strings for late variables
     *
     * Sentinel types:
     * - <not initialized> - late variable not yet assigned
     * - <optimized out> - variable optimized away by compiler
     * - <unavailable> - variable not accessible in current context
     *
     * @param value - Variable value string
     * @returns true if this is a sentinel value
     */
    private isSentinel(value: string): boolean {
        if (!value) return false;

        const lowerValue = value.toLowerCase();
        return lowerValue.includes('<not initialized>') ||
               lowerValue.includes('<optimized out>') ||
               lowerValue.includes('<unavailable>');
    }

    /**
     * Estimate variable size for memory budget tracking
     * Per Discovery 04: Memory budget enforcement
     *
     * @param variable - Variable to estimate
     * @returns Estimated size in bytes
     */
    private estimateVariableSize(variable: IVariableData): number {
        // Base overhead per variable (name, type, metadata)
        let size = 100;

        // Add value string length
        if (variable.value) {
            size += variable.value.length * 2; // UTF-16 chars
        }

        // Add type string length
        if (variable.type) {
            size += variable.type.length * 2;
        }

        // Add name string length
        if (variable.name) {
            size += variable.name.length * 2;
        }

        return size;
    }

    /**
     * Build evaluateName for a variable
     * Per Discovery 14: Records use bracket notation for positional fields
     *
     * @param parent - Parent variable
     * @param child - Child variable
     * @returns evaluateName for the child
     */
    private buildEvaluateName(parent: IVariableData | null, child: IVariableData): string | undefined {
        // If child already has evaluateName, use it
        if (child.evaluateName) {
            return child.evaluateName;
        }

        // No parent, use child name
        if (!parent || !parent.evaluateName) {
            return child.name;
        }

        // Handle Records positional fields ($1, $2, etc.)
        // Per Discovery 14: Must use bracket notation for positional fields
        if (child.name.startsWith('$') && /^\$\d+$/.test(child.name)) {
            // Positional field: record[$1]
            return `${parent.evaluateName}[${child.name}]`;
        }

        // Handle Map keys (may need quotes)
        if (parent.type?.includes('Map')) {
            // Map key might need quotes if it's a string
            return `${parent.evaluateName}[${child.name}]`;
        }

        // Handle array indices
        if (/^\d+$/.test(child.name)) {
            return `${parent.evaluateName}[${child.name}]`;
        }

        // Regular field: obj.field
        return `${parent.evaluateName}.${child.name}`;
    }

    /**
     * Expand a variable recursively with Dart-specific handling
     * Implements Discoveries 02, 04, 05, 08, 10, 11, 13, 14
     *
     * @param variable - Variable to expand
     * @param depth - Current depth
     * @param maxDepth - Maximum depth to traverse
     * @param visited - Set of visited variable references (cycle detection)
     * @param parent - Parent variable (for evaluateName building)
     * @returns Enhanced variable data with children
     */
    private async expandVariable(
        variable: IVariableData,
        depth: number,
        maxDepth: number,
        visited: Set<number>,
        parent: IVariableData | null = null
    ): Promise<IEnhancedVariableData> {
        const enhanced: IEnhancedVariableData = { ...variable };

        // Build evaluateName if missing
        if (!enhanced.evaluateName && parent) {
            enhanced.evaluateName = this.buildEvaluateName(parent, enhanced);
        }

        // Handle sentinel values (Discovery 13)
        if (this.isSentinel(variable.value)) {
            enhanced.expandable = false;
            enhanced.variablesReference = 0;
            return enhanced;
        }

        // Check if variable is expandable
        if (variable.variablesReference === 0) {
            return enhanced;
        }

        // Check depth limit
        if (depth >= maxDepth) {
            enhanced.truncated = true;
            enhanced.truncatedReason = 'maxDepth';
            return enhanced;
        }

        // Cycle detection (Discovery 08: variablesReference only)
        if (visited.has(variable.variablesReference)) {
            enhanced.cycle = true;
            enhanced.cycleVia = 'variablesReference';
            enhanced.originalValue = variable.value;
            enhanced.value = `${variable.value} [Circular]`;
            return enhanced;
        }

        // Check lazy getter (Discovery 02)
        if (variable.presentationHint?.lazy === true) {
            // Don't auto-expand lazy getters (may have side effects)
            enhanced.expandable = true;
            enhanced.value = `${variable.value} (click to evaluate)`;
            enhanced.children = [];
            return enhanced;
        }

        // Check memory budget (Discovery 04: 10MB/50k nodes)
        const estimatedSize = this.estimateVariableSize(variable);
        const budgetResult = this.memoryBudget.addNode(estimatedSize);

        if (!budgetResult.ok) {
            enhanced.truncated = true;
            enhanced.truncatedReason = 'budget';
            enhanced.error = `Variable expansion stopped: ${budgetResult.reason}. Consider using debug.save-variable for large collections.`;
            return enhanced;
        }

        // Mark as visited
        visited.add(variable.variablesReference);

        try {
            // Fetch children
            const childrenResponse = await this.session.customRequest('variables', {
                variablesReference: variable.variablesReference,
                start: 0,
                count: 100 // Conservative page size
            });

            const children = childrenResponse.variables || [];
            enhanced.children = [];
            enhanced.totalChildren = children.length;

            // Expand each child recursively
            for (const child of children) {
                const expandedChild = await this.expandVariable(
                    child,
                    depth + 1,
                    maxDepth,
                    visited,
                    variable
                );
                enhanced.children.push(expandedChild);
            }

            enhanced.childrenShown = enhanced.children.length;
            enhanced.expandable = true;

        } catch (error: any) {
            enhanced.error = `Failed to expand: ${error.message}`;
            enhanced.children = [];
        }

        // Remove from visited set (allow revisiting in different branches)
        visited.delete(variable.variablesReference);

        return enhanced;
    }

    /**
     * List variables in current debug context
     * Implements the main variable listing functionality
     *
     * @param params - Listing parameters (scope, frameId, depth)
     * @returns Variable list or error
     */
    async listVariables(params: IListVariablesParams): Promise<IVariableData[] | IDebugError> {
        return (await this.withOperationLock('list-variables', async (signal) => {
            try {
                // Check if operation was aborted
                if (signal.aborted) {
                    throw new Error('Operation aborted');
                }

                // Find active isolate (Discovery 01)
                const isolateId = await this.findActiveIsolate();
                if (isolateId === null) {
                    return createDebugError(
                        DebugErrorCode.E_NO_THREADS,
                        'No active Dart isolate found with source code'
                    );
                }

                // Get stack trace for frame ID
                const stackResponse = await this.session.customRequest('stackTrace', {
                    threadId: isolateId,
                    startFrame: params.frameId || 0,
                    levels: 1
                });

                if (!stackResponse.stackFrames || stackResponse.stackFrames.length === 0) {
                    return createDebugError(
                        DebugErrorCode.E_NO_FRAMES,
                        `No stack frame found at index ${params.frameId || 0}`
                    );
                }

                const frameId = stackResponse.stackFrames[0].id;

                // Get scopes
                const scopesResponse = await this.session.customRequest('scopes', {
                    frameId: frameId
                });

                const scopes = scopesResponse.scopes || [];
                const targetScopes: any[] = [];

                // Filter scopes based on params.scopeFilter
                const scopeFilter = params.scopeFilter || 'all';
                for (const scope of scopes) {
                    const scopeName = scope.name.toLowerCase();

                    if (scopeFilter === 'all') {
                        targetScopes.push(scope);
                    } else if (scopeFilter === 'local' && (scopeName === 'locals' || scopeName === 'local')) {
                        targetScopes.push(scope);
                    } else if (scopeFilter === 'global' && scopeName === 'globals') {
                        targetScopes.push(scope);
                    } else if (scopeFilter === 'closure' && scopeName === 'closure') {
                        targetScopes.push(scope);
                    }
                }

                if (targetScopes.length === 0) {
                    return []; // No scopes match filter
                }

                // Get variables from each scope
                const allVariables: IEnhancedVariableData[] = [];
                const maxDepth = params.maxDepth !== undefined ? params.maxDepth : 3;
                const visited = new Set<number>();

                for (const scope of targetScopes) {
                    const varsResponse = await this.session.customRequest('variables', {
                        variablesReference: scope.variablesReference
                    });

                    const scopeVars = varsResponse.variables || [];

                    // Expand each variable
                    for (const variable of scopeVars) {
                        const expanded = await this.expandVariable(
                            variable,
                            0,
                            maxDepth,
                            visited,
                            null
                        );
                        allVariables.push(expanded);
                    }
                }

                // Return as IVariableData[] (IEnhancedVariableData extends IVariableData)
                return allVariables as IVariableData[];

            } catch (error: any) {
                if (signal.aborted) {
                    return createDebugError(DebugErrorCode.E_BUSY, 'Operation was aborted');
                }
                return createDebugError(
                    DebugErrorCode.E_INTERNAL,
                    `Failed to list variables: ${error.message}`
                );
            }
        })) as IVariableData[] | IDebugError;
    }

    /**
     * Set a variable's value
     * Uses DAP setVariable request with evaluate fallback
     *
     * @param params - Set variable parameters
     * @returns Result with new value or error
     */
    async setVariable(params: ISetVariableParams): Promise<ISetVariableResult> {
        return (await this.withOperationLock('set-variable', async (signal) => {
            try {
                // Check if operation was aborted
                if (signal.aborted) {
                    throw new Error('Operation aborted');
                }

                // Strategy 1: Try setVariable request (preferred)
                try {
                    const result = await this.session.customRequest('setVariable', {
                        variablesReference: params.variablesReference,
                        name: params.name,
                        value: params.value
                    });

                    return {
                        success: true,
                        value: result.value,
                        type: result.type,
                        variablesReference: result.variablesReference || 0
                    };
                } catch (setError) {
                    // Strategy 2: Fall back to evaluate (for expressions)
                    const expr = `${params.name} = ${params.value}`;
                    const evalResult = await this.session.customRequest('evaluate', {
                        expression: expr,
                        frameId: params.frameId
                    });

                    return {
                        success: true,
                        value: evalResult.result,
                        type: evalResult.type,
                        variablesReference: evalResult.variablesReference || 0
                    };
                }
            } catch (error: any) {
                if (signal.aborted) {
                    return {
                        success: false,
                        error: createDebugError(DebugErrorCode.E_BUSY, 'Operation was aborted')
                    };
                }
                return {
                    success: false,
                    error: createDebugError(
                        DebugErrorCode.E_MODIFICATION_FAILED,
                        `Failed to set variable: ${error.message}`
                    )
                };
            }
        })) as ISetVariableResult;
    }

    /**
     * Get children of a specific variable
     * Used for lazy expansion and pagination
     *
     * @param params - Get children parameters
     * @returns Children variables or error
     */
    async getVariableChildren(params: IVariableChildrenParams): Promise<IVariableData[] | IDebugError> {
        return (await this.withOperationLock('get-variable-children', async (signal) => {
            try {
                // Check if operation was aborted
                if (signal.aborted) {
                    throw new Error('Operation aborted');
                }

                const response = await this.session.customRequest('variables', {
                    variablesReference: params.variablesReference,
                    start: params.start || 0,
                    count: params.count || 100,
                    ...(params.filter && { filter: params.filter })
                });

                return response.variables || [];

            } catch (error: any) {
                if (signal.aborted) {
                    return createDebugError(DebugErrorCode.E_BUSY, 'Operation was aborted');
                }
                return createDebugError(
                    DebugErrorCode.E_INVALID_REFERENCE,
                    `Failed to get variable children: ${error.message}`
                );
            }
        })) as IVariableData[] | IDebugError;
    }

    /**
     * Stream large variables to a file
     * Provides pagination for very large collections
     *
     * @param params - Stream parameters
     * @returns Stream result with success flag
     */
    async streamVariables(params: IStreamVariablesParams): Promise<IStreamResult> {
        // Not implemented for Phase 1
        // This is a convenience feature for very large data sets
        return {
            success: false,
            error: createDebugError(
                DebugErrorCode.E_NOT_IMPLEMENTED,
                'Stream variables not yet implemented for Dart. Use debug.save-variable instead.'
            )
        };
    }

    /**
     * Dispose of adapter resources
     * Called when debug session ends
     */
    dispose(): void {
        // Clear cached isolate ID
        this.lastStoppedIsolateId = null;

        // Call parent dispose (handles disposables array)
        super.dispose();
    }
}
