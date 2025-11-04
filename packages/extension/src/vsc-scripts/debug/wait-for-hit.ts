import { z } from 'zod';
import { WaitableScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Wait for breakpoint hit waitable script
 * Waits for debugger to hit any breakpoint
 */
@RegisterScript('debug.wait-for-hit')
export class WaitForHitScript extends WaitableScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            timeoutMs: z.coerce.number()
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

    async wait(bridgeContext: IBridgeContext, params: any): Promise<any> {
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
                let disposable: any;
                let timer: any;
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
                    resolve(ScriptResult.success({
                        event: 'timeout',
                        timestamp: new Date().toISOString()
                    }));
                }, timeoutMs);

                // Listen for breakpoint hit (stopped event)
                disposable = vscode.debug.onDidChangeActiveStackItem((e: any) => {
                    if (e && e.source && !disposed) {
                        cleanup();

                        // Log to output channel
                        if (bridgeContext.outputChannel) {
                            bridgeContext.outputChannel.appendLine(
                                `[dbg.waitForHit] Breakpoint hit at ${e.source.path}:${e.line}`
                            );
                        }

                        resolve(ScriptResult.success({
                            event: 'breakpoint-hit',
                            breakpoint: {
                                path: e.source.path || 'unknown',
                                line: e.line || 0,
                                hitCount: 1 // VS Code doesn't provide hit count directly
                            },
                            timestamp: new Date().toISOString()
                        }));
                    }
                });
            });
        } catch (error: any) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}
