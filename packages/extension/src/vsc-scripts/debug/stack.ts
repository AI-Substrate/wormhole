import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Get call stack query script
 * Returns the current call stack frames
 */
@RegisterScript('debug.stack')
export class StackDebugScript extends QueryScript<any> {
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

            // Check if debugger is stopped
            const activeFrame = vscode.debug.activeStackItem;
            if (!activeFrame) {
                return ScriptResult.failure(
                    'Debugger must be stopped to get call stack',
                    ErrorCode.E_NO_SESSION // E_NOT_STOPPED doesn't exist, use E_NO_SESSION
                );
            }

            // TODO: Full implementation requires DAP integration to get complete stack
            // For now, return the active frame information
            const frames = [];

            // Add the active frame
            if (activeFrame) {
                const frame = activeFrame as any; // Type assertion for missing properties
                frames.push({
                    id: frame.id || '0',
                    name: frame.name || 'unknown',
                    source: {
                        path: frame.source?.path || 'unknown',
                        name: frame.source?.name || 'unknown'
                    },
                    line: frame.line || 0,
                    column: frame.column || 0
                });
            }

            // Log to output channel
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[debug.stack] Retrieved ${frames.length} stack frame(s)`
                );
            }

            return ScriptResult.success({
                frames,
                threadId: (activeFrame as any)?.threadId || 0,
                note: 'Full stack trace requires DAP integration'
            });
        } catch (error: any) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}
