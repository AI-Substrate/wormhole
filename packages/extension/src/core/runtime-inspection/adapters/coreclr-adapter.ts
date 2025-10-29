/**
 * CoreCLR Debug Adapter
 *
 * Full implementation for C# .NET (coreclr) debug adapter with vsdbg-specific features.
 * Ports proven logic from dynamic script (scripts/sample/dynamic/coreclr-list-variables.js)
 * into the service layer architecture.
 *
 * Critical Discoveries Applied:
 * - Thread Detection Required: Must iterate all threads to find active thread with source code
 * - NO Object.is() Needed: C# doesn't support JavaScript's Object.is(), use variablesReference only
 * - vsdbg Features: Preserve presentationHint and memoryReference (pass through)
 * - Conservative Property Evaluation: Respect expensive scope flag (C# properties can have side effects)
 *
 * Key Differences from NodeDebugAdapter:
 * - ADDS: Thread detection loop (C#-specific - multiple threads paused, only one has code)
 * - REMOVES: Object.is() cycle detection (JavaScript-specific, doesn't work in C#)
 * - SIMPLER: Cycle detection uses only variablesReference tracking
 * - PRESERVES: vsdbg features (presentationHint, memoryReference) without parsing
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
 * Same as NodeDebugAdapter but without Object.is() fields
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
    /** How cycle was detected (C#: only variablesReference) */
    cycleVia?: 'variablesReference';
    /** Error expanding this variable */
    error?: string;
}

/**
 * CoreCLR Debug Adapter - Full implementation for C# .NET (coreclr)
 *
 * This adapter implements all variable exploration features for C# debugging:
 * - Variable listing with depth control and scope filtering
 * - Cycle detection using variablesReference tracking (simpler than JavaScript)
 * - Memory budget tracking to prevent crashes
 * - Variable modification via setVariable and evaluate fallback
 * - Pagination for large collections (List<T>, arrays)
 * - File streaming suggestion for large data
 * - Thread detection to find active thread (C#-specific requirement)
 *
 * vsdbg-Specific Features (preserved, not parsed):
 * - presentationHint: Display metadata (kind, attributes like canHaveObjectId)
 * - memoryReference: Memory addresses for variables
 * - Type formatting: C# syntax like "step1 [int]"
 * - evaluateName: Expression for re-evaluation
 */
export class CoreClrDebugAdapter extends BaseDebugAdapter {
    /**
     * Constructor - Set C#-specific capabilities
     */
    constructor(session: vscode.DebugSession) {
        // Set capabilities for C# debugging
        const capabilities: IDebugCapabilities = {
            supportsSetVariable: true,           // vsdbg supports setVariable
            supportsVariablePaging: true,        // for List<T>, arrays
            supportsVariableType: true,          // vsdbg provides type info
            supportsMemoryReferences: true,      // vsdbg provides memoryReference
            supportsProgressReporting: true,     // vsdbg supports progress
            supportsInvalidatedEvent: true,      // vsdbg sends invalidated events
            supportsMemoryEvent: false,          // vsdbg doesn't send memory events
            supportsEvaluateForHovers: true,     // vsdbg supports evaluate for hovers
            supportsSetExpression: true,         // vsdbg supports setExpression
            supportsDataBreakpoints: false       // vsdbg doesn't support data breakpoints (yet)
        };

        super(session, capabilities);
    }

    /**
     * Find the thread with actual source code (not [External Code])
     *
     * C#-SPECIFIC: When C# debugger pauses, it pauses ALL threads, but only ONE
     * thread contains the actual source code location. The rest show [External Code]
     * at line 0. We must iterate all threads to find the correct one.
     *
     * From Phase 2 testing: 14 threads paused, only thread 24433613 had actual code.
     *
     * NOTE: This logic is duplicated from the shared helper findCoreclrThreadWithSource()
     * in session-helpers.js. Kept separate here due to TypeScript/JS boundary and private
     * method usage. A future refactor could unify these implementations.
     *
     * @returns Thread ID with valid source code, or null if not found
     */
    private async findActiveThread(): Promise<number | null> {
        try {
            const threadsResponse = await this.session.customRequest('threads');
            const threads = threadsResponse.threads || [];

            // Iterate all threads to find the one with actual source code
            for (const thread of threads) {
                try {
                    const stackResponse = await this.session.customRequest('stackTrace', {
                        threadId: thread.id,
                        startFrame: 0,
                        levels: 1
                    });

                    if (stackResponse.stackFrames && stackResponse.stackFrames.length > 0) {
                        const frame = stackResponse.stackFrames[0];

                        // Check if this thread has actual code (not [External Code])
                        if (frame.source && frame.source.path && frame.line > 0) {
                            // Found the thread with real source code!
                            return thread.id;
                        }
                    }
                } catch (error) {
                    // Thread not paused or no stack, continue checking other threads
                    continue;
                }
            }

            // No thread with valid source code found, fallback to first thread
            if (threads.length > 0) {
                return threads[0].id;
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * List variables with C#-specific thread detection
     *
     * Implementation based on:
     * - NodeDebugAdapter.listVariables() - Overall structure and logic
     * - scripts/sample/dynamic/coreclr-list-variables.js - Thread detection pattern
     *
     * Key differences from NodeDebugAdapter:
     * 1. Uses findActiveThread() instead of getMostRecentlyStoppedThread()
     * 2. NO Object.is() cycle detection (C# doesn't support it)
     * 3. Preserves vsdbg features without parsing
     */
    async listVariables(params: IListVariablesParams): Promise<IVariableData[] | IDebugError> {
        const maxDepth = params.maxDepth ?? 2;
        const maxChildren = params.maxChildren ?? 50;
        const includeExpensive = params.includeExpensive ?? false;
        const scopeFilter = params.scopeFilter ?? 'all';

        return await this.withOperationLock('list-variables', async (signal) => {
            try {
                // C#-SPECIFIC: Find the thread with actual source code
                // Cannot use getMostRecentlyStoppedThread() - C# pauses all threads
                const threadId = params.threadId ?? await this.findActiveThread();
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
                // C#-SPECIFIC: More conservative about expensive scopes (properties can have side effects)
                const scopesToProcess = scopes.filter(scope => {
                    // Check expensive flag
                    if (scope.expensive && !includeExpensive) {
                        return false;
                    }

                    // Apply scope filter
                    if (scopeFilter !== 'all') {
                        const scopeName = scope.name.toLowerCase();
                        if (scopeFilter === 'local' && !scopeName.includes('local')) {
                            return false;
                        }
                        if (scopeFilter === 'closure' && !scopeName.includes('closure')) {
                            return false;
                        }
                        if (scopeFilter === 'global' && !scopeName.includes('global')) {
                            return false;
                        }
                    }

                    return true;
                });

                // Reset memory budget for this operation
                this.memoryBudget.reset();

                // Track visited references for cycle detection
                // C#-SPECIFIC: Only variablesReference tracking, NO Object.is()
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

                    // C#-SPECIFIC: Cycle detection using ONLY variablesReference
                    // NO Object.is() - doesn't work in C#, simpler implementation
                    if (visited.has(variable.variablesReference)) {
                        return {
                            ...variable,
                            cycle: true,
                            value: '[Circular Reference]',
                            originalValue: variable.value,
                            cycleVia: 'variablesReference'
                        };
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
                        // vsdbg features (presentationHint, memoryReference) are preserved automatically
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

    /**
     * Estimate variable size for memory budget tracking
     * Same logic as NodeDebugAdapter
     */
    private estimateVariableSize(variable: IVariableData): number {
        let size = 100; // Base overhead

        // Name and value strings
        size += (variable.name?.length || 0) * 2;
        size += (variable.value?.length || 0) * 2;
        size += (variable.type?.length || 0) * 2;

        // C#-SPECIFIC: memoryReference is common in vsdbg
        if (variable.memoryReference) {
            size += variable.memoryReference.length * 2;
        }

        // evaluateName
        if (variable.evaluateName) {
            size += variable.evaluateName.length * 2;
        }

        return size;
    }

    /**
     * Get variable children with pagination
     * Supports C# collections like List<T>
     */
    async getVariableChildren(params: IVariableChildrenParams): Promise<IVariableData[] | IDebugError> {
        return await this.withOperationLock('get-variable-children', async (signal) => {
            try {
                const start = params.start ?? 0;
                const count = params.count ?? 100;

                const response = await this.session.customRequest('variables', {
                    variablesReference: params.variablesReference,
                    start: start,
                    count: count
                });

                const children: IVariableData[] = response.variables || [];

                // vsdbg features are preserved automatically in the response
                return children;
            } catch (error) {
                if (signal.aborted) {
                    return createDebugError(DebugErrorCode.E_BUSY, 'Operation was aborted');
                }
                return createDebugError(
                    DebugErrorCode.E_INTERNAL,
                    error instanceof Error ? error.message : String(error)
                );
            }
        }) as (IVariableData[] | IDebugError);
    }

    /**
     * Set variable value
     * Uses dual strategy: try setVariable, fall back to evaluate
     * Same pattern as NodeDebugAdapter
     */
    async setVariable(params: ISetVariableParams): Promise<ISetVariableResult> {
        return await this.withOperationLock('set-variable', async (signal) => {
            try {
                // Strategy 1: Try DAP setVariable (preferred)
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
                        variablesReference: result.variablesReference
                    };
                } catch (setVariableError) {
                    // Strategy 2: Fall back to evaluate (for expressions)
                    // Build assignment expression using params.name
                    const threadId = await this.findActiveThread();
                    if (threadId === null) {
                        return {
                            success: false,
                            error: createDebugError(DebugErrorCode.E_NO_THREADS)
                        };
                    }

                    const frames = await this.getStackFrames(threadId, 1);
                    const frameId = params.frameId ?? frames[0].id;

                    // Simple assignment expression for C#
                    const expression = `${params.name} = ${params.value}`;

                    try {
                        const evalResult = await this.session.customRequest('evaluate', {
                            expression: expression,
                            frameId: frameId,
                            context: 'repl'
                        });

                        return {
                            success: true,
                            value: evalResult.result,
                            type: evalResult.type,
                            variablesReference: evalResult.variablesReference || 0
                        };
                    } catch (evalError) {
                        // Both strategies failed
                        throw setVariableError;
                    }
                }
            } catch (error) {
                if (signal.aborted) {
                    return {
                        success: false,
                        error: createDebugError(DebugErrorCode.E_BUSY, 'Operation was aborted')
                    };
                }
                return {
                    success: false,
                    error: createDebugError(
                        DebugErrorCode.E_INTERNAL,
                        error instanceof Error ? error.message : String(error)
                    )
                };
            }
        }) as ISetVariableResult;
    }

    /**
     * Stream variables (stub for now)
     * TODO: Implement file streaming for large C# collections
     */
    async streamVariables(params: IStreamVariablesParams): Promise<IStreamResult> {
        return {
            success: false,
            error: createDebugError(
                DebugErrorCode.E_NOT_IMPLEMENTED,
                'Stream variables not yet implemented for C#. Use debug.save-variable instead.'
            )
        };
    }
}
