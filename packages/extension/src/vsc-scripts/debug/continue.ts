import { z } from 'zod';
import { WaitableScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { executeStepOperation } from '@core/debug/step-operations';
import {
    MultiThreadResolver,
    MultiThreadStepExecutor,
    EventDrivenWaitStrategy
} from '@core/debug/step-strategies';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Continue debug execution waitable script
 * Continues execution until next breakpoint hit or program exit
 *
 * Uses unified step operation architecture (upgraded from polling to event-driven).
 */
@RegisterScript('debug.continue')
export class ContinueDebugScript extends WaitableScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            timeoutMs: z.coerce.number().int().min(1).max(300000).default(30000)
        });
    }

    async wait(bridgeContext: IBridgeContext, params: any): Promise<any> {
        try {
            // Use unified step operation architecture
            const result = await executeStepOperation(bridgeContext, params, {
                threadResolver: new MultiThreadResolver(),
                stepExecutor: new MultiThreadStepExecutor('continue'),
                waitStrategy: new EventDrivenWaitStrategy(),
                commandName: 'debug.continue'
            });

            return ScriptResult.success(result);
        } catch (error: any) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }
}
