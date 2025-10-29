/**
 * Base Debug Adapter
 *
 * Abstract base class providing common DAP operations for all language adapters.
 * Handles session management, memory budgets, and reference lifecycle.
 *
 * Critical Discoveries Applied:
 * - Discovery 02: Clear caches on execution resume (references become invalid)
 * - Discovery 03: Enforce memory budgets to prevent crashes
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
import { IMemoryBudget, MemoryBudget } from '../MemoryBudget';
import {
    IDebugError,
    DebugErrorCode,
    createDebugError,
    createLargeDataError
} from '../../errors/debug-errors';

/**
 * Abstract base adapter with common DAP functionality
 */
export abstract class BaseDebugAdapter implements IDebugAdapter {
    protected readonly memoryBudget: IMemoryBudget;
    protected variableCache: Map<number, IVariableData[]> = new Map();
    protected scopeCache: Map<number, any> = new Map();

    // Per Subtask 001 ST004: Lifecycle management for proper cleanup
    private disposables: vscode.Disposable[] = [];
    private sessionAbortController = new AbortController();

    // Per Subtask 001 ST007: Operation locking to prevent concurrent access
    private operationLocks = new Map<string, boolean>();

    constructor(
        public readonly session: vscode.DebugSession,
        public readonly capabilities: IDebugCapabilities
    ) {
        // Initialize memory budget with standard limits
        this.memoryBudget = new MemoryBudget(20000, 5 * 1024 * 1024);

        // Listen for execution state changes to clear caches
        // This is critical per Discovery 02: references become invalid on resume
        this.setupLifecycleHooks();
    }

    /**
     * Setup lifecycle hooks to handle reference invalidation
     * Per Critical Discovery 02: Variable references only valid while paused
     * Per Subtask 001 ST004-ST005: Real VS Code event listeners for cache invalidation
     */
    private setupLifecycleHooks(): void {
        // Session termination - full cleanup
        // When the debug session ends, all resources must be cleaned up
        this.disposables.push(
            vscode.debug.onDidTerminateDebugSession(session => {
                // CRITICAL: Only respond to events for THIS session
                if (session.id === this.session.id) {
                    this.clearCaches();
                    this.sessionAbortController.abort();
                }
            })
        );

        // Frame/thread changes - clear caches
        // Per Critical Discovery 02: Variable references change when stack changes
        // Per Subtask 001 ST005: Conservative cache clearing on state changes
        this.disposables.push(
            vscode.debug.onDidChangeActiveStackItem(stackItem => {
                // CRITICAL: Only respond to events for THIS session
                if (stackItem?.session.id === this.session.id) {
                    // Conservative: clear on ANY stack item change
                    // Frame or thread changes invalidate all variable references
                    this.clearCaches();
                }
            })
        );

        // Breakpoint changes - conservative clearing
        // Per Subtask 001 ST006: "When in doubt, CLEAR"
        // Breakpoint changes might affect execution state
        this.disposables.push(
            vscode.debug.onDidChangeBreakpoints(() => {
                // Conservative approach: clear caches when breakpoints change
                // This prevents potential stale reference bugs
                this.clearCaches();
            })
        );

        // DAP invalidated events - canonical reference invalidation signal
        // Per Code Review: Listen for DAP-standard invalidated events
        // This catches execution resume, step, and other state changes that invalidate references
        this.disposables.push(
            vscode.debug.onDidReceiveDebugSessionCustomEvent(event => {
                // CRITICAL: Only respond to events for THIS session
                if (event.session.id === this.session.id && event.event === 'invalidated') {
                    // DAP spec: invalidated event signals that references are no longer valid
                    this.clearCaches();
                }
            })
        );
    }

    /**
     * Check if a capability is supported before executing an operation
     * Per Subtask 001 ST002: Capability checking prevents unsupported operations
     *
     * @param capability - The capability key to check
     * @param operation - Human-readable operation name for error messages
     * @returns null if supported, IDebugError if not supported
     */
    protected checkCapability(
        capability: keyof IDebugCapabilities,
        operation: string
    ): IDebugError | null {
        if (!this.capabilities[capability]) {
            return createDebugError(
                DebugErrorCode.E_UNSUPPORTED_CAPABILITY,
                `The '${operation}' operation requires '${capability}' which is not supported by this debug adapter`
            );
        }
        return null;
    }

    /**
     * Get suggested fallback for an unsupported operation
     * Per Subtask 001 ST003: Graceful degradation with actionable suggestions
     *
     * @param operation - The operation name
     * @returns Suggestion object with fallback approach
     */
    protected getSuggestedFallback(operation: string): { kind: string; hint: string; sample?: string } {
        switch (operation) {
            case 'setVariable':
                return {
                    kind: 'use-evaluate',
                    hint: 'Use evaluate request to modify variables instead',
                };
            case 'variablePaging':
                return {
                    kind: 'manual-iteration',
                    hint: 'Fetch all children at once without pagination',
                };
            default:
                return {
                    kind: 'not-available',
                    hint: 'This operation is not available for this debug adapter',
                };
        }
    }

    /**
     * Execute an operation with concurrency locking and timeout
     * Per Subtask 001 ST007-ST008: Prevent concurrent operations and handle timeouts
     *
     * Lock Key Conventions:
     * - `list-variables` - Listing variables for a frame
     * - `get-children-${variablesReference}` - Getting children for a specific reference
     * - `set-variable-${variablesReference}-${name}` - Setting a specific variable
     * - `stream-variables` - Streaming variables to file
     * - `evaluate-${expression}` - Evaluating an expression
     *
     * Lock keys are automatically prefixed with session ID to prevent cross-session interference.
     *
     * Timeout Policy:
     * - Default timeout: 30 seconds
     * - Returns E_BUSY with timeout reason if exceeded
     * - Lock is ALWAYS released in finally block (prevents deadlocks)
     * - Combines session abort + timeout abort signals
     *
     * Concurrency Policy:
     * - Only ONE operation per lock key per session
     * - Concurrent requests return E_BUSY immediately (no queueing)
     * - Caller should retry after receiving E_BUSY
     * - All locks cleared on cache invalidation (session end, frame change, etc.)
     *
     * @param key - Lock key (will be prefixed with session ID)
     * @param operation - The operation to execute
     * @param options - Options including timeout
     * @returns Operation result or E_BUSY error
     */
    protected async withOperationLock<T>(
        key: string,
        operation: (signal: AbortSignal) => Promise<T>,
        options: { timeoutMs?: number } = {}
    ): Promise<T | IDebugError> {
        // Create session-scoped lock key to prevent cross-session interference
        const lockKey = `${this.session.id}-${key}`;

        // Check if operation is already locked
        if (this.operationLocks.get(lockKey)) {
            return createDebugError(
                DebugErrorCode.E_BUSY,
                `Operation '${key}' is currently locked by another concurrent request. Retry after current operation completes.`
            );
        }

        // Acquire lock
        this.operationLocks.set(lockKey, true);

        // Setup timeout mechanism (default 30 seconds)
        const timeoutMs = options.timeoutMs ?? 30000;
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => {
            timeoutController.abort();
        }, timeoutMs);

        // Combine session abort signal with timeout signal
        const combinedSignal = this.combineAbortSignals([
            this.sessionAbortController.signal,
            timeoutController.signal
        ]);

        try {
            // Execute the operation with combined abort signal
            const result = await operation(combinedSignal);
            return result;
        } catch (error) {
            // Check if operation was aborted
            if (combinedSignal.aborted) {
                // Determine abort reason
                if (timeoutController.signal.aborted) {
                    return createDebugError(
                        DebugErrorCode.E_BUSY,
                        `Operation '${key}' exceeded timeout of ${timeoutMs}ms and was aborted`
                    );
                }
                // Session was terminated
                return createDebugError(DebugErrorCode.E_SESSION_TERMINATED);
            }
            // Re-throw other errors
            throw error;
        } finally {
            // CRITICAL: Always release lock and clear timeout
            clearTimeout(timeoutId);
            this.operationLocks.delete(lockKey);
        }
    }

    /**
     * Combine multiple abort signals into a single signal
     * Per Subtask 001 ST008: Support for multiple abort conditions
     *
     * @param signals - Array of abort signals to combine
     * @returns Combined abort signal that triggers when any input signal triggers
     */
    private combineAbortSignals(signals: AbortSignal[]): AbortSignal {
        const controller = new AbortController();

        // Check if any signal is already aborted
        for (const signal of signals) {
            if (signal.aborted) {
                controller.abort();
                break;
            }
            // Listen for abort on each signal
            signal.addEventListener('abort', () => controller.abort());
        }

        return controller.signal;
    }

    /**
     * Get threads from debug session
     */
    protected async getThreads(): Promise<any[]> {
        try {
            const response = await this.session.customRequest('threads');
            return response.threads || [];
        } catch (error) {
            throw createDebugError(
                DebugErrorCode.E_NO_THREADS,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Get stack frames for a thread
     */
    protected async getStackFrames(threadId: number, levels: number = 1): Promise<any[]> {
        try {
            const response = await this.session.customRequest('stackTrace', {
                threadId,
                startFrame: 0,
                levels
            });
            return response.stackFrames || [];
        } catch (error) {
            throw createDebugError(
                DebugErrorCode.E_NO_STACK,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Get scopes for a stack frame
     */
    protected async getScopes(frameId: number): Promise<any[]> {
        // Check cache first
        if (this.scopeCache.has(frameId)) {
            return this.scopeCache.get(frameId)!;
        }

        try {
            const response = await this.session.customRequest('scopes', { frameId });
            const scopes = response.scopes || [];

            // Cache for reuse while paused
            this.scopeCache.set(frameId, scopes);
            return scopes;
        } catch (error) {
            throw createDebugError(
                DebugErrorCode.E_NO_FRAMES,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Get variables for a variables reference
     */
    protected async getVariables(
        variablesReference: number,
        filter?: 'indexed' | 'named',
        start?: number,
        count?: number
    ): Promise<IVariableData[]> {
        if (variablesReference === 0) {
            throw createDebugError(DebugErrorCode.E_INVALID_REFERENCE);
        }

        try {
            const params: any = { variablesReference };
            if (filter) params.filter = filter;
            if (start !== undefined) params.start = start;
            if (count !== undefined) params.count = count;

            const response = await this.session.customRequest('variables', params);
            return response.variables || [];
        } catch (error) {
            throw createDebugError(
                DebugErrorCode.E_INVALID_REFERENCE,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Clear all caches (call when execution resumes)
     * Per Critical Discovery 02: References become invalid on resume
     * Per Subtask 001 ST007: Also clear operation locks on state changes
     */
    public clearCaches(): void {
        this.variableCache.clear();
        this.scopeCache.clear();
        this.memoryBudget.reset();
        // Clear operation locks to prevent stuck locks across state changes
        this.operationLocks.clear();
    }

    /**
     * Check if memory budget is exceeded
     * Per Critical Discovery 03: Prevent crashes from large data
     */
    protected checkMemoryBudget(): boolean {
        return this.memoryBudget.isExceeded();
    }

    /**
     * Create large data error with suggestion
     * Per Critical Discovery 03: Suggest streaming alternative
     */
    protected createLargeDataError(): IDebugError {
        const status = this.memoryBudget.getStatus();
        return createLargeDataError(status.currentNodes, status.currentBytes);
    }

    /**
     * Evaluate an expression in debug context
     */
    async evaluateExpression(expression: string, frameId?: number): Promise<any | IDebugError> {
        try {
            const params: any = { expression, context: 'watch' };
            if (frameId !== undefined) {
                params.frameId = frameId;
            }

            const response = await this.session.customRequest('evaluate', params);
            return response;
        } catch (error) {
            return createDebugError(
                DebugErrorCode.E_EVALUATE_FAILED,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Dispose adapter and clean up
     * Per Subtask 001 ST004: Properly dispose of all event listeners
     */
    dispose(): void {
        this.clearCaches();

        // Dispose all VS Code event listeners
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];

        // Abort any ongoing operations
        this.sessionAbortController.abort();

        // Subclasses can override to add additional cleanup
    }

    /**
     * Abstract methods that language-specific adapters must implement
     *
     * IMPLEMENTATION REQUIREMENTS:
     * 1. Use checkCapability() at the start of each method to verify adapter support
     * 2. Wrap operations with withOperationLock() for concurrency protection
     * 3. Check memory budget before adding nodes: const result = this.memoryBudget.addNode(bytes)
     * 4. Return structured errors with suggestions when capabilities unsupported
     * 5. Respect the AbortSignal for timeout and session termination
     *
     * Example pattern:
     * ```typescript
     * async setVariable(params: ISetVariableParams): Promise<ISetVariableResult> {
     *     // 1. Check capability
     *     const capError = this.checkCapability('supportsSetVariable', 'setVariable');
     *     if (capError) {
     *         return {
     *             success: false,
     *             error: capError,
     *             suggestion: this.getSuggestedFallback('setVariable')
     *         };
     *     }
     *
     *     // 2. Wrap with lock
     *     return await this.withOperationLock('set-variable', async (signal) => {
     *         // 3. Execute operation
     *         const response = await this.session.customRequest('setVariable', params);
     *         return { success: true, ...response };
     *     });
     * }
     * ```
     */
    abstract listVariables(params: IListVariablesParams): Promise<IVariableData[] | IDebugError>;
    abstract setVariable(params: ISetVariableParams): Promise<ISetVariableResult>;
    abstract getVariableChildren(params: IVariableChildrenParams): Promise<IVariableData[] | IDebugError>;
    abstract streamVariables(params: IStreamVariablesParams): Promise<IStreamResult>;
}
