import { z } from 'zod';
import { BridgeContext } from '../bridge-context/BridgeContext';
import { ErrorCode } from '../response/errorTaxonomy';

/**
 * Base class for all scripts
 */
export abstract class ScriptBase<TParams = unknown, TResult = unknown> {
    /**
     * Optional Zod schema for parameter validation
     * If not provided, the generated schema from metadata will be used
     */
    paramsSchema?: z.ZodSchema<TParams>;

    /**
     * Optional Zod schema for result validation
     */
    resultSchema?: z.ZodSchema<TResult>;

    /**
     * Script metadata (populated from YAML)
     */
    metadata?: {
        alias: string;
        category?: string;
        description?: string;
        dangerOnly?: boolean;
    };

    /**
     * Validate parameters against schema
     */
    validateParams(params: unknown) {
        if (!this.paramsSchema) {
            // If no schema is provided, accept any params
            // The generated schema will handle validation in the registry
            return { success: true, data: params };
        }
        return this.paramsSchema.safeParse(params);
    }

    /**
     * Execute the script
     */
    abstract execute(bridgeContext: BridgeContext, params: TParams): Promise<TResult>;
}

/**
 * Action result type
 */
export interface ActionResult {
    success: boolean;
    reason?: string;
    details?: unknown;
    errorCode?: ErrorCode;
}

/**
 * Base class for action scripts (simple success/fail operations)
 */
export abstract class ActionScript<TParams = unknown> extends ScriptBase<TParams, ActionResult> {
    /**
     * Helper to create success result
     */
    protected success(details?: unknown): ActionResult {
        return { success: true, details };
    }

    /**
     * Helper to create failure result
     */
    protected failure(reason: string | ErrorCode, details?: unknown): ActionResult {
        if (typeof reason === 'string') {
            return { success: false, reason, details };
        } else {
            return { success: false, reason: reason, details, errorCode: reason };
        }
    }
}

/**
 * Base class for waitable scripts (operations that block until condition)
 */
export abstract class WaitableScript<TParams = unknown, TResult = unknown> extends ScriptBase<TParams, TResult> {
    /**
     * Wait for a condition or event
     */
    protected abstract wait(bridgeContext: BridgeContext, params: TParams): Promise<TResult>;

    /**
     * Default execute delegates to wait
     */
    async execute(bridgeContext: BridgeContext, params: TParams): Promise<TResult> {
        return this.wait(bridgeContext, params);
    }

    /**
     * Helper to wait for a debug event
     * @param bridgeContext Bridge context
     * @param eventType Type of debug event to wait for
     * @param sessionId Optional session ID to filter events (if not provided, listens to all sessions)
     * @param timeoutMs Timeout in milliseconds
     * @returns Structured event data or null on timeout
     */
    protected async waitForDebugEvent(
        bridgeContext: BridgeContext,
        eventType: string,
        sessionId?: string,
        timeoutMs: number = 30000
    ): Promise<{ breakpoint?: { path: string; line: number }, threadId?: number, frame?: any } | null> {
        return new Promise((resolve, reject) => {
            let tracker: any;
            let timer: NodeJS.Timeout | undefined;
            let disposed = false;

            // Setup timeout
            timer = setTimeout(() => {
                if (!disposed) {
                    disposed = true;
                    resolve(null);
                }
            }, timeoutMs);

            // Setup abort handler
            if (bridgeContext.signal) {
                bridgeContext.signal.addEventListener('abort', () => {
                    if (!disposed) {
                        disposed = true;
                        if (timer) clearTimeout(timer);
                        reject(new Error('Aborted'));
                    }
                });
            }

            // Create debug adapter tracker
            const trackerFactory = {
                createDebugAdapterTracker(session: any): any {
                    // Filter by session ID if provided
                    if (sessionId && session.id !== sessionId) {
                        return undefined;
                    }

                    tracker = {
                        onDidSendMessage: (message: any) => {
                            if (message.type === 'event' && message.event === eventType && !disposed) {
                                disposed = true;
                                if (timer) clearTimeout(timer);

                                // Return structured data based on event type
                                let result: any = { raw: message };

                                if (eventType === 'stopped' && message.body) {
                                    // Extract breakpoint info from stopped event
                                    result.threadId = message.body.threadId;
                                    if (message.body.hitBreakpointIds && message.body.hitBreakpointIds.length > 0) {
                                        // Would need to look up breakpoint details from VS Code API
                                        result.breakpoint = { path: 'unknown', line: 0 };
                                    }
                                } else if (eventType === 'breakpoint' && message.body && message.body.breakpoint) {
                                    // Extract breakpoint info
                                    const bp = message.body.breakpoint;
                                    if (bp.source && bp.line) {
                                        result.breakpoint = {
                                            path: bp.source.path || bp.source.name || 'unknown',
                                            line: bp.line
                                        };
                                    }
                                }

                                resolve(result);
                            }
                        }
                    };
                    return tracker;
                }
            };

            // Register tracker - use specific session type if we can determine it, otherwise '*'
            const sessionType = sessionId ? bridgeContext.debug.getSession()?.type || '*' : '*';
            const disposable = bridgeContext.vscode.debug?.registerDebugAdapterTrackerFactory?.(sessionType, trackerFactory);

            // Cleanup when done
            const cleanup = () => {
                disposable?.dispose?.();
            };

            // Add cleanup to promise chain
            resolve = ((originalResolve) => (value: any) => {
                cleanup();
                originalResolve(value);
            })(resolve);

            reject = ((originalReject) => (reason: any) => {
                cleanup();
                originalReject(reason);
            })(reject);
        });
    }
}

/**
 * Base class for query scripts (immediate data retrieval)
 */
export abstract class QueryScript<TParams = unknown, TResult = unknown> extends ScriptBase<TParams, TResult> {
    // Query scripts are simple - just implement execute
}

/**
 * Base class for streaming scripts (async generators)
 * Placeholder for Phase 3
 */
export abstract class StreamScript<TParams = unknown, TResult = unknown> extends ScriptBase<TParams, AsyncGenerator<TResult>> {
    abstract execute(bridgeContext: BridgeContext, params: TParams): Promise<AsyncGenerator<TResult>>;

    /**
     * Helper to create async generator
     */
    protected async *createStream(items: TResult[]): AsyncGenerator<TResult> {
        for (const item of items) {
            yield item;
        }
    }
}