import { z } from 'zod';
import { WaitableScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { executeStepOperation } from '@core/debug/step-operations';
import {
    getStepStrategies,
    EventDrivenWaitStrategy
} from '@core/debug/step-strategies';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Step over debug operation waitable script
 * Steps over the current line and waits until stopped at the next line
 *
 * Uses unified step operation architecture with multi-thread support for Dart isolates.
 */
@RegisterScript('debug.step-over')
export class StepOverDebugScript extends WaitableScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            timeoutMs: z.coerce.number().int().min(1).max(10000).default(5000)
        });
    }

    async wait(bridgeContext: IBridgeContext, params: any): Promise<any> {
        try {
            const vscode = bridgeContext.vscode;
            const session = params.sessionId
                ? vscode.debug.activeDebugSession?.id === params.sessionId
                    ? vscode.debug.activeDebugSession
                    : undefined
                : vscode.debug.activeDebugSession;

            if (!session) {
                const error: any = new Error(`No active debug session${params.sessionId ? ` with ID ${params.sessionId}` : ''}`);
                error.code = ErrorCode.E_NO_SESSION;
                throw error;
            }

            // Get language-appropriate strategies based on session type
            const { threadResolver, stepExecutor } = getStepStrategies(session.type, 'next');

            // Use unified step operation architecture
            const result = await executeStepOperation(bridgeContext, params, {
                threadResolver,
                stepExecutor,
                waitStrategy: new EventDrivenWaitStrategy(),
                commandName: 'debug.step-over'
            });

            return ScriptResult.success(result);
        } catch (error: any) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}
