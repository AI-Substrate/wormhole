/**
 * Java Debug Adapter
 *
 * Full implementation for Java debug adapter with JDT Language Server features.
 * Based on proven CoreCLR adapter pattern, adapted for Java-specific requirements.
 *
 * Critical Discoveries Applied:
 * - Discovery 01: Session Type Always "java" - single session type for all Java debug scenarios
 * - Discovery 03: Multi-Threading Identical to C# - use cached threadId → verify → scan pattern
 * - Discovery 04: Static Fields in Separate Scope - handle "Static" scope alongside "Local" and "This"
 * - Discovery 05: Stream Objects Are Opaque - Streams are lazy pipelines, not materialized collections
 *
 * Key Differences from CoreCLR:
 * - ADDS: Static scope handling (Java static fields in separate scope)
 * - ADDS: Lambda captured variables documentation (appear in Local scope)
 * - SAME: Thread detection pattern (multi-threaded apps common in Java)
 * - SAME: Cycle detection via variablesReference only (no Object.is())
 * - REMOVES: vsdbg-specific features (memoryReference, presentationHint less common in Java)
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
 * Same structure as CoreCLR adapter
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
    /** How cycle was detected (Java: only variablesReference) */
    cycleVia?: 'variablesReference';
    /** Error expanding this variable */
    error?: string;
}

/**
 * Java Debug Adapter - Full implementation for Java (JDT Language Server)
 *
 * This adapter implements all variable exploration features for Java debugging:
 * - Variable listing with depth control and scope filtering
 * - Cycle detection using variablesReference tracking
 * - Memory budget tracking to prevent crashes
 * - Variable modification via setVariable and evaluate fallback
 * - Pagination for large collections (ArrayList, HashMap, etc.)
 * - File streaming suggestion for large data
 * - Thread detection to find active thread (Java-specific requirement)
 * - Static scope handling (Java static fields in separate scope)
 *
 * Java-Specific Features:
 * - Static Scope: Java debugger exposes static fields in separate "Static" scope
 *   Controlled by `java.debug.settings.showStaticVariables` user setting
 * - Lambdas: Captured variables appear in Local scope (not as lambda properties)
 * - Streams: java.util.stream.* objects are lazy pipelines, shown as opaque objects
 *   (internal fields only, NOT expanded to elements)
 * - Multi-threading: Identical to C# - must find active thread with source code
 */
export class JavaDebugAdapter extends BaseDebugAdapter {
    /**
     * Cache the last stopped thread ID for efficient thread detection
     * Per Critical Discovery 03: Cache threadId from stopped event to avoid scanning
     */
    private lastStoppedThreadId: number | null = null;

    /**
     * Constructor - Set Java-specific capabilities
     * Per Critical Discovery 01: Session type is always "java" (no variants)
     */
    constructor(session: vscode.DebugSession) {
        // Set capabilities for Java debugging
        const capabilities: IDebugCapabilities = {
            supportsSetVariable: true,           // Java debugger supports setVariable
            supportsVariablePaging: true,        // for ArrayList, HashMap, etc.
            supportsVariableType: true,          // Java debugger provides type info
            supportsMemoryReferences: false,     // Java doesn't provide memoryReference
            supportsProgressReporting: false,    // Java debugger doesn't support progress
            supportsInvalidatedEvent: false,     // Java debugger doesn't send invalidated events
            supportsMemoryEvent: false,          // Java debugger doesn't send memory events
            supportsEvaluateForHovers: true,     // Java debugger supports evaluate for hovers
            supportsSetExpression: false,        // Java debugger doesn't support setExpression
            supportsDataBreakpoints: false       // Java debugger doesn't support data breakpoints
        };

        super(session, capabilities);
    }

    /**
     * Find the thread with actual source code (not framework/internal code)
     *
     * JAVA-SPECIFIC: When Java debugger pauses, it pauses ALL threads, but only ONE
     * thread contains the actual user source code location. The rest show framework code.
     * We must iterate all threads to find the correct one.
     *
     * Per Critical Discovery 03: Use cached threadId → verify → scan pattern
     * Same pattern as CoreCLR adapter (proven in multi-threaded C# apps)
     *
     * @returns Thread ID with valid source code, or null if not found
     */
    private async findActiveThread(): Promise<number | null> {
        try {
            // Strategy 1: Try cached thread from stopped event (fast path)
            if (this.lastStoppedThreadId !== null) {
                try {
                    const stackResponse = await this.session.customRequest('stackTrace', {
                        threadId: this.lastStoppedThreadId,
                        startFrame: 0,
                        levels: 1
                    });

                    if (stackResponse.stackFrames && stackResponse.stackFrames.length > 0) {
                        const frame = stackResponse.stackFrames[0];
                        // Check if this cached thread still has valid source code
                        if (frame.source && frame.source.path && frame.line > 0) {
                            return this.lastStoppedThreadId;
                        }
                    }
                } catch (error) {
                    // Cached thread no longer valid, fall through to scan
                }
            }

            // Strategy 2: Scan all threads to find the one with source code (slow path)
            const threadsResponse = await this.session.customRequest('threads');
            const threads = threadsResponse.threads || [];

            for (const thread of threads) {
                try {
                    const stackResponse = await this.session.customRequest('stackTrace', {
                        threadId: thread.id,
                        startFrame: 0,
                        levels: 1
                    });

                    if (stackResponse.stackFrames && stackResponse.stackFrames.length > 0) {
                        const frame = stackResponse.stackFrames[0];

                        // Check if this thread has actual user code (not framework)
                        if (frame.source && frame.source.path && frame.line > 0) {
                            // Found the thread with real source code!
                            // Cache it for next time
                            this.lastStoppedThreadId = thread.id;
                            return thread.id;
                        }
                    }
                } catch (error) {
                    // Thread not paused or no stack, continue checking other threads
                    continue;
                }
            }

            // Fallback: Use first thread if no thread with source found
            if (threads.length > 0) {
                return threads[0].id;
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * List variables with Java-specific Static scope handling
     *
     * Implementation based on CoreClrAdapter.listVariables() with Java adaptations:
     * - Uses findActiveThread() for multi-threaded apps
     * - Handles "Static" scope alongside "Local" and "This" (Per Critical Discovery 04)
     * - NO Object.is() cycle detection (Java doesn't support it, same as C#)
     * - Filters Static scope when scopeFilter='local'
     *
     * Java Scope Names (from JDT Language Server):
     * - "Local" - Local variables in current method
     * - "This" - Instance fields and methods
     * - "Static" - Static fields (controlled by java.debug.settings.showStaticVariables)
     */
    async listVariables(params: IListVariablesParams): Promise<IVariableData[] | IDebugError> {
        const maxDepth = params.maxDepth ?? 2;
        const maxChildren = params.maxChildren ?? 50;
        const includeExpensive = params.includeExpensive ?? false;
        const scopeFilter = params.scopeFilter ?? 'all';

        return await this.withOperationLock('list-variables', async (signal) => {
            try {
                // JAVA-SPECIFIC: Find the thread with actual user source code
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
                // JAVA-SPECIFIC: Filter "Static" scope when scopeFilter='local' (Per Critical Discovery 04)
                const scopesToProcess = scopes.filter(scope => {
                    // Check expensive flag
                    if (scope.expensive && !includeExpensive) {
                        return false;
                    }

                    // Apply scope filter
                    const scopeName = scope.name.toLowerCase();
                    if (scopeFilter === 'local') {
                        // When user requests local-only, exclude Static scope
                        // But include "Local" and "This" scopes
                        if (scopeName.includes('static')) {
                            return false;
                        }
                    }

                    return true;
                });

                // Reset memory budget for this operation
                this.memoryBudget.reset();

                // Track visited references for cycle detection
                // JAVA-SPECIFIC: Only variablesReference tracking, NO Object.is()
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

                    // JAVA-SPECIFIC: Cycle detection using ONLY variablesReference
                    // NO Object.is() - doesn't work in Java, same as C#
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
     * Same logic as CoreCLR adapter but without memoryReference
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
     * Supports Java collections like ArrayList, HashMap
     * Same implementation as CoreCLR adapter
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
     * Same pattern as CoreCLR adapter
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
                    const threadId = await this.findActiveThread();
                    if (threadId === null) {
                        return {
                            success: false,
                            error: createDebugError(DebugErrorCode.E_NO_THREADS)
                        };
                    }

                    const frames = await this.getStackFrames(threadId, 1);
                    const frameId = params.frameId ?? frames[0].id;

                    // Simple assignment expression for Java
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
     * TODO: Implement file streaming for large Java collections
     */
    async streamVariables(params: IStreamVariablesParams): Promise<IStreamResult> {
        return {
            success: false,
            error: createDebugError(
                DebugErrorCode.E_NOT_IMPLEMENTED,
                'Stream variables not yet implemented for Java. Use debug.save-variable instead.'
            )
        };
    }

    /**
     * Dispose adapter and clean up
     * Clear cached thread ID and call base cleanup
     */
    dispose(): void {
        this.lastStoppedThreadId = null;
        super.dispose();
    }
}
