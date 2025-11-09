import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';
import { getActiveThreadId } from '@core/debug/session-helpers';

/**
 * Evaluate expression query script
 * Evaluates an expression in the context of a debug frame
 */
@RegisterScript('debug.evaluate')
export class EvaluateScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            expression: z.string().min(1),
            frameId: z.coerce.number().int().min(0).optional(),
            context: z.enum(['repl', 'watch', 'hover']).optional(),
            sessionId: z.string().optional()
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        const vscode = bridgeContext.vscode;

        // Get the target session
        let session;
        if (params.sessionId) {
            // Find specific session by ID
            const allSessions = vscode.debug.activeDebugSession
                ? [vscode.debug.activeDebugSession]
                : [];
            session = allSessions.find(s => s.id === params.sessionId);
            if (!session) {
                return ScriptResult.failure(
                    `Session ${params.sessionId} not found`,
                    ErrorCode.E_NO_SESSION
                );
            }
        } else {
            // Use active session
            session = vscode.debug.activeDebugSession;
            if (!session) {
                return ScriptResult.failure(
                    'No active debug session',
                    ErrorCode.E_NO_SESSION
                );
            }
        }

        try {
            // If no frameId provided, try to get the top frame
            let frameId = params.frameId;
            if (frameId === undefined) {
                try {
                    // Use shared thread detection logic (same as step commands)
                    const threadId = await getActiveThreadId(session, bridgeContext.vscode);

                    // Get stack trace for the active thread
                    const stackResponse = await session.customRequest('stackTrace', {
                        threadId: threadId,
                        levels: 1
                    });
                    const frames = stackResponse.body?.stackFrames || stackResponse.stackFrames || [];
                    if (frames.length > 0) {
                        frameId = frames[0].id;
                    }
                } catch (e) {
                    // Continue without frameId - evaluate will try without it
                }
            }

            // Use DAP evaluate request
            const response = await session.customRequest('evaluate', {
                expression: params.expression,
                frameId: frameId,
                context: params.context || 'repl'
            });

            const result = response.body || response;

            // Log to output channel
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[dbg.evaluate] Evaluated "${params.expression}" = ${result.result}`
                );
            }

            return ScriptResult.success({
                result: result.result,
                type: result.type,
                variablesReference: result.variablesReference,
                namedVariables: result.namedVariables,
                indexedVariables: result.indexedVariables
            });
        } catch (e: any) {
            return ScriptResult.failure(
                `Failed to evaluate expression: ${e.message}`,
                ErrorCode.E_INTERNAL
            );
        }
    }
}
