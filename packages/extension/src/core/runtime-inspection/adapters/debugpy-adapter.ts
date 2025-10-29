/**
 * Python Debug Adapter (debugpy)
 *
 * Implements variable inspection for Python debug sessions with Python-specific
 * safety features:
 *
 * - Property Detection: Uses inspect.getattr_static() to detect @property
 *   decorators without triggering side effects (API calls, DB writes, etc.)
 * - Simple Thread Detection: Python's GIL means all threads stop together,
 *   so we use simple first-thread detection (not C#'s iteration)
 * - Cycle Detection: Uses variablesReference tracking only (no id() calls)
 * - Special Types: Handles generators, coroutines, None vs empty gracefully
 *
 * Based on CoreClrAdapter structure (~538 lines) with Python adaptations.
 *
 * Key Differences from CoreClrAdapter:
 * - REMOVES: findActiveThread() - Python doesn't need C#-style thread iteration
 * - ADDS: getMostRecentlyStoppedThread() - Simple thread detection for Python
 * - ADDS: detectProperty() - Critical property detection via inspect.getattr_static()
 * - ADDS: Special type detection for generators, coroutines, None
 * - KEEPS: variablesReference-only cycle detection (same as CoreCLR)
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
 * Same as CoreClrAdapter
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
    /** How cycle was detected (Python: only variablesReference) */
    cycleVia?: 'variablesReference';
    /** Error expanding this variable */
    error?: string;
}

/**
 * Python Debug Adapter (debugpy) - Full implementation for Python
 *
 * This adapter implements all variable exploration features for Python debugging:
 * - Variable listing with depth control and scope filtering
 * - Cycle detection using variablesReference tracking
 * - Memory budget tracking to prevent crashes
 * - Variable modification via setVariable and evaluate fallback
 * - Pagination for large collections (lists, dicts)
 * - File streaming suggestion for large data
 * - Property detection to prevent side effects (@property)
 * - Special type handling (generators, coroutines, None)
 *
 * Python-Specific Features:
 * - @property detection: Uses inspect.getattr_static() to detect properties without calling them
 * - Simple thread detection: Python's GIL means all threads stop together
 * - Special types: Generators (exhaustible), coroutines (can't await), None vs empty
 */
export class DebugpyAdapter extends BaseDebugAdapter {
    /**
     * Constructor - Set Python-specific capabilities
     */
    constructor(session: vscode.DebugSession) {
        // Set capabilities for Python debugging
        const capabilities: IDebugCapabilities = {
            supportsSetVariable: true,           // debugpy supports setVariable
            supportsVariablePaging: true,        // for lists, dicts
            supportsVariableType: true,          // debugpy provides type info
            supportsMemoryReferences: false,     // debugpy doesn't provide memoryReference
            supportsProgressReporting: true,     // debugpy supports progress
            supportsInvalidatedEvent: true,      // debugpy sends invalidated events
            supportsMemoryEvent: false,          // debugpy doesn't send memory events
            supportsEvaluateForHovers: true,     // debugpy supports evaluate for hovers
            supportsSetExpression: true,         // debugpy supports setExpression
            supportsDataBreakpoints: false       // debugpy doesn't support data breakpoints
        };

        super(session, capabilities);
    }

    /**
     * Get the most recently stopped thread (simple detection for Python)
     *
     * PYTHON-SPECIFIC: When Python debugger pauses, it pauses ALL threads together
     * (allThreadsStopped: true) due to the GIL. We can simply use the first thread
     * or the most recently stopped one. No need for C#-style iteration.
     *
     * @returns Thread ID, or null if not found
     */
    private async getMostRecentlyStoppedThread(): Promise<number | null> {
        try {
            const threadsResponse = await this.session.customRequest('threads');
            const threads = threadsResponse.threads || [];

            // Python: all threads stop together, use first thread
            if (threads.length > 0) {
                return threads[0].id;
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Detect if a variable is a Python @property without calling it
     *
     * CRITICAL PYTHON-SPECIFIC FEATURE: Python properties can execute arbitrary
     * code (API calls, DB writes) when accessed. We must detect them WITHOUT
     * calling them, then mark as 'lazy' to prevent auto-expansion in VS Code.
     *
     * Uses inspect.getattr_static() to check if attribute is a property descriptor
     * without triggering the getter method.
     *
     * @param evaluateName - Full expression path (e.g., "obj.attr")
     * @param frameId - Stack frame ID for evaluation context
     * @returns true if this is a property, false otherwise
     */
    private async detectProperty(
        evaluateName: string | undefined,
        frameId: number
    ): Promise<boolean> {
        if (!evaluateName || !evaluateName.includes('.')) {
            return false;
        }

        const parts = evaluateName.split('.');
        const objExpr = parts.slice(0, -1).join('.');
        const attrName = parts[parts.length - 1];

        try {
            // Use inspect.getattr_static() to detect property without calling it
            const checkExpr = `
import inspect
isinstance(inspect.getattr_static(type(${objExpr}), '${attrName}', None), property)
            `.trim();

            const response = await this.session.customRequest('evaluate', {
                expression: checkExpr,
                frameId: frameId,
                context: 'watch'
            });

            // Python returns 'True' or 'False' as strings
            return response.result === 'True';
        } catch {
            // Per clarification Q2: if detection fails, assume NOT a property
            // (prioritize visibility over safety)
            return false;
        }
    }

    /**
     * Check if variable is a special Python type requiring careful handling
     *
     * PYTHON-SPECIFIC: Some Python types can't be safely expanded:
     * - Generators: Consumed by iteration, can't inspect twice
     * - Coroutines: Can't await in sync debug console
     * - Async generators: Combination of both issues
     *
     * @param variable - Variable to check
     * @returns true if this is a special non-expandable type
     */
    private isSpecialType(variable: IVariableData): boolean {
        const type = variable.type?.toLowerCase() || '';
        const value = variable.value?.toLowerCase() || '';

        // Detect generators
        if (type.includes('generator') || value.includes('<generator')) {
            return true;
        }

        // Detect coroutines
        if (type.includes('coroutine') || value.includes('<coroutine')) {
            return true;
        }

        // Detect async generators
        if (type.includes('async_generator') || value.includes('<async_generator')) {
            return true;
        }

        return false;
    }

    /**
     * List variables with Python-specific thread detection and property handling
     *
     * Implementation based on CoreClrAdapter.listVariables() with Python adaptations:
     * 1. Uses getMostRecentlyStoppedThread() instead of findActiveThread()
     * 2. Adds property detection via detectProperty()
     * 3. Adds special type handling for generators/coroutines
     * 4. Same variablesReference-only cycle detection as CoreCLR
     */
    async listVariables(params: IListVariablesParams): Promise<IVariableData[] | IDebugError> {
        const maxDepth = params.maxDepth ?? 2;
        const maxChildren = params.maxChildren ?? 50;
        const includeExpensive = params.includeExpensive ?? false;
        const scopeFilter = params.scopeFilter ?? 'all';

        return await this.withOperationLock('list-variables', async (signal) => {
            try {
                // PYTHON-SPECIFIC: Simple thread detection (all threads stop together)
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
                const scopesToProcess = scopes.filter(scope => {
                    // Check expensive flag
                    if (scope.expensive && !includeExpensive) {
                        return false;
                    }

                    // Apply scope filter
                    if (scopeFilter !== 'all') {
                        const scopeName = scope.name.toLowerCase();
                        const hint = scope.presentationHint?.toLowerCase();

                        if (scopeFilter === 'local' && !(scopeName.includes('local') || hint === 'locals')) {
                            return false;
                        }
                        if (scopeFilter === 'global' && !(scopeName.includes('global') || hint === 'globals')) {
                            return false;
                        }
                        // Python doesn't typically have closure scope like JavaScript
                    }

                    return true;
                });

                // Reset memory budget for this operation
                this.memoryBudget.reset();

                // Track visited references for cycle detection
                // PYTHON-SPECIFIC: Only variablesReference tracking, NO id() calls
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

                    // PYTHON-SPECIFIC: Check for special types (generators, coroutines)
                    if (this.isSpecialType(variable)) {
                        return {
                            ...variable,
                            variablesReference: 0,  // Mark as non-expandable
                            value: `${variable.value} (exhaustible/non-inspectable)`,
                            expandable: false
                        };
                    }

                    // PYTHON-SPECIFIC: Detect properties to prevent side effects
                    if (variable.evaluateName) {
                        const isProperty = await this.detectProperty(variable.evaluateName, frameId);
                        if (isProperty) {
                            // Mark as lazy to prevent auto-expansion
                            return {
                                ...variable,
                                presentationHint: {
                                    ...variable.presentationHint,
                                    lazy: true
                                },
                                // Don't auto-expand, user must explicitly expand
                                truncated: true,
                                truncatedReason: 'maxDepth',
                                expandable: true
                            };
                        }
                    }

                    // PYTHON-SPECIFIC: Cycle detection using ONLY variablesReference
                    // (same as CoreCLR - simpler than Node's Object.is())
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
     * Same logic as CoreClrAdapter but without memoryReference
     */
    private estimateVariableSize(variable: IVariableData): number {
        let size = 100; // Base overhead

        // Name and value strings
        size += (variable.name?.length || 0) * 2;
        size += (variable.value?.length || 0) * 2;
        size += (variable.type?.length || 0) * 2;

        // evaluateName
        if (variable.evaluateName) {
            size += variable.evaluateName.length * 2;
        }

        return size;
    }

    /**
     * Get variable children with pagination
     * Supports Python collections like lists, dicts
     */
    async getVariableChildren(params: IVariableChildrenParams): Promise<IVariableData[] | IDebugError> {
        return await this.withOperationLock('get-variable-children', async (signal) => {
            try {
                const start = params.start ?? 0;
                const count = params.count ?? 100;

                const response = await this.session.customRequest('variables', {
                    variablesReference: params.variablesReference,
                    start: start,
                    count: count,
                    ...(params.filter && { filter: params.filter })
                });

                const children: IVariableData[] = response.variables || [];

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
     * Same pattern as CoreClrAdapter
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
                    const threadId = await this.getMostRecentlyStoppedThread();
                    if (threadId === null) {
                        return {
                            success: false,
                            error: createDebugError(DebugErrorCode.E_NO_THREADS)
                        };
                    }

                    const frames = await this.getStackFrames(threadId, 1);
                    const frameId = params.frameId ?? frames[0].id;

                    // Simple assignment expression for Python
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
     * TODO: Implement file streaming for large Python collections
     */
    async streamVariables(params: IStreamVariablesParams): Promise<IStreamResult> {
        return {
            success: false,
            error: createDebugError(
                DebugErrorCode.E_NOT_IMPLEMENTED,
                'Stream variables not yet implemented for Python. Use debug.save-variable instead.'
            )
        };
    }
}
