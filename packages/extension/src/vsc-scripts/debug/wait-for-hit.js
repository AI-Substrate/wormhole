const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Wait for breakpoint hit waitable script
 * Phase 3 will implement actual DAP event listening
 */
class WaitForHitScript extends WaitableScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            timeoutMs: z.number()
                .min(100)
                .max(300000)
                .optional()
                .default(30000)
        });

        this.resultSchema = z.object({
            event: z.string(),
            breakpoint: z.object({
                path: z.string(),
                line: z.number(),
                hitCount: z.number().optional()
            }).optional(),
            timestamp: z.string()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{timeoutMs?: number}} params
     * @returns {Promise<{event: string, breakpoint?: {path: string, line: number, hitCount?: number}, timestamp: string}>}
     */
    async wait(bridgeContext, params) {
        try {
            const vscode = bridgeContext.vscode;
            const timeoutMs = params.timeoutMs || 30000;

            // Check if there's an active debug session
            if (!vscode.debug.activeDebugSession) {
                return ScriptResult.failure(
                    'No active debug session',
                    ErrorCode.E_NO_SESSION,
                    { message: 'No active debug session' }
                );
            }

            return new Promise((resolve, reject) => {
                let disposable;
                let timer;
                let disposed = false;

                const cleanup = () => {
                    if (disposed) return;
                    disposed = true;
                    if (timer) clearTimeout(timer);
                    if (disposable) disposable.dispose();
                };

                // Setup timeout
                timer = setTimeout(() => {
                    cleanup();
                    resolve({
                        event: 'timeout',
                        timestamp: new Date().toISOString()
                    });
                }, timeoutMs);

                // Handle abort signal
                if (ctx.signal) {
                    ctx.signal.addEventListener('abort', () => {
                        cleanup();
                        reject(new Error('E_ABORTED: Operation aborted'));
                    });
                }

                // Listen for breakpoint hit (stopped event)
                disposable = vscode.debug.onDidChangeActiveStackItem((e) => {
                    if (e && e.source && !disposed) {
                        cleanup();

                        // Log to output channel
                        if (bridgeContext.outputChannel) {
                            bridgeContext.outputChannel.appendLine(
                                `[dbg.waitForHit] Breakpoint hit at ${e.source.path}:${e.line}`
                            );
                        }

                        resolve({
                            event: 'breakpoint-hit',
                            breakpoint: {
                                path: e.source.path || 'unknown',
                                line: e.line || 0,
                                hitCount: 1 // VS Code doesn't provide hit count directly
                            },
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            });
        } catch (error) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}

module.exports = { WaitForHitScript };