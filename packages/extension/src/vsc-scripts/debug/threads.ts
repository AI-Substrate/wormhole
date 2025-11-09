import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Get debug threads query script
 * Returns information about active threads in the debug session
 */
@RegisterScript('debug.threads')
export class ThreadsDebugScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional()
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        try {
            const vscode = bridgeContext.vscode;

            // Get the active debug session
            const session = params.sessionId
                ? vscode.debug.activeDebugSession?.id === params.sessionId
                    ? vscode.debug.activeDebugSession
                    : undefined
                : vscode.debug.activeDebugSession;

            if (!session) {
                return ScriptResult.failure(
                    `No active debug session${params.sessionId ? ` with ID ${params.sessionId}` : ''}`,
                    ErrorCode.E_NO_SESSION
                );
            }

            // TODO: Full implementation requires DAP integration to get thread information
            // For now, return basic thread info if available
            const threads = [];

            // Most single-threaded applications will have just one thread
            const activeFrame = vscode.debug.activeStackItem;
            if (activeFrame && activeFrame.threadId !== undefined) {
                threads.push({
                    id: activeFrame.threadId,
                    name: `Thread ${activeFrame.threadId}`,
                    active: true
                });
            } else {
                // Default thread for single-threaded apps
                threads.push({
                    id: 1,
                    name: 'Main Thread',
                    active: true
                });
            }

            // Log to output channel
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[debug.threads] Found ${threads.length} thread(s)`
                );
            }

            return ScriptResult.success({
                threads,
                activeThreadId: activeFrame?.threadId || 1,
                note: 'Full thread information requires DAP integration'
            });
        } catch (error: any) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}
