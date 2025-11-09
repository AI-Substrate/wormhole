import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * DAP Compare Script - Session Comparison Tool
 *
 * Side-by-side diff of two debug sessions for regression testing.
 * Answers "what changed between this test run and the previous one?"
 */
@RegisterScript('dap.compare')
export class DapCompareScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionA: z.string(),
            sessionB: z.string(),
            compareBy: z.enum(['counts', 'exceptions', 'timeline', 'outputs']).optional().default('counts')
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        // Access the global capture service
        const service = (global as any).debugSessionCaptureService;
        if (!service) {
            return ScriptResult.failure(
                'Debug session capture service not available',
                ErrorCode.E_NO_SESSION,
                { reason: 'Service not initialized' }
            );
        }

        // Get both sessions
        const sessionA = service.getSession(params.sessionA);
        const sessionB = service.getSession(params.sessionB);

        if (!sessionA) {
            return ScriptResult.failure(
                `Session A "${params.sessionA}" not found`,
                ErrorCode.E_NOT_FOUND,
                { sessionId: params.sessionA }
            );
        }
        if (!sessionB) {
            return ScriptResult.failure(
                `Session B "${params.sessionB}" not found`,
                ErrorCode.E_NOT_FOUND,
                { sessionId: params.sessionB }
            );
        }

        // Build comparison based on compareBy parameter
        const comparison: any = {};

        // Always include count deltas
        comparison.counts = {
            deltaOutputs: sessionA.outputs.length - sessionB.outputs.length,
            deltaExceptions: sessionA.exceptions.length - sessionB.exceptions.length,
            deltaStops: sessionA.stoppedEvents.length - sessionB.stoppedEvents.length,
            exitCodeA: sessionA.exitCode,
            exitCodeB: sessionB.exitCode,
            exitCodeChanged: sessionA.exitCode !== sessionB.exitCode
        };

        // Exception comparison
        if (params.compareBy === 'exceptions' || params.compareBy === 'counts') {
            const exceptionsA = sessionA.exceptions.map((e: any) => e.message || e.description);
            const exceptionsB = sessionB.exceptions.map((e: any) => e.message || e.description);

            comparison.exceptions = {
                onlyInA: exceptionsA.filter((msg: string) => !exceptionsB.includes(msg)),
                onlyInB: exceptionsB.filter((msg: string) => !exceptionsA.includes(msg)),
                common: exceptionsA.filter((msg: string) => exceptionsB.includes(msg))
            };
        }

        // Timeline comparison (find divergence point)
        if (params.compareBy === 'timeline' || params.compareBy === 'outputs') {
            let divergenceIndex = null;
            const minLength = Math.min(sessionA.outputs.length, sessionB.outputs.length);

            for (let i = 0; i < minLength; i++) {
                const outA = sessionA.outputs[i];
                const outB = sessionB.outputs[i];

                if (outA.text !== outB.text || outA.category !== outB.category) {
                    divergenceIndex = i;
                    break;
                }
            }

            comparison.divergencePoint = divergenceIndex != null ? {
                outputIndex: divergenceIndex,
                timestampA: sessionA.outputs[divergenceIndex]?.ts,
                timestampB: sessionB.outputs[divergenceIndex]?.ts,
                relativeTimeA: sessionA.outputs[divergenceIndex]?.ts - sessionA.startTime,
                relativeTimeB: sessionB.outputs[divergenceIndex]?.ts - sessionB.startTime,
                textA: sessionA.outputs[divergenceIndex]?.text?.slice(0, 100),
                textB: sessionB.outputs[divergenceIndex]?.text?.slice(0, 100)
            } : {
                message: 'Sessions matched until one ended',
                shorterSession: sessionA.outputs.length < sessionB.outputs.length ? 'A' : 'B'
            };
        }

        // Output comparison (detailed)
        if (params.compareBy === 'outputs') {
            const categoriesA: Record<string, number> = {};
            const categoriesB: Record<string, number> = {};

            sessionA.outputs.forEach((o: any) => {
                categoriesA[o.category] = (categoriesA[o.category] || 0) + 1;
            });
            sessionB.outputs.forEach((o: any) => {
                categoriesB[o.category] = (categoriesB[o.category] || 0) + 1;
            });

            comparison.outputBreakdown = {
                categoriesA,
                categoriesB,
                categoryDeltas: {}
            };

            // Calculate deltas for each category
            const allCategories = new Set([...Object.keys(categoriesA), ...Object.keys(categoriesB)]);
            allCategories.forEach((cat: string) => {
                const countA = categoriesA[cat] || 0;
                const countB = categoriesB[cat] || 0;
                comparison.outputBreakdown.categoryDeltas[cat] = countA - countB;
            });
        }

        // Summary for both sessions
        const sessionASummary = {
            id: sessionA.sessionId,
            type: sessionA.type,
            name: sessionA.name,
            duration: (sessionA.endTime || Date.now()) - sessionA.startTime,
            outputs: sessionA.outputs.length,
            exceptions: sessionA.exceptions.length,
            exitCode: sessionA.exitCode
        };

        const sessionBSummary = {
            id: sessionB.sessionId,
            type: sessionB.type,
            name: sessionB.name,
            duration: (sessionB.endTime || Date.now()) - sessionB.startTime,
            outputs: sessionB.outputs.length,
            exceptions: sessionB.exceptions.length,
            exitCode: sessionB.exitCode
        };

        return ScriptResult.success({
            comparison,
            sessionA: sessionASummary,
            sessionB: sessionBSummary,
            compareBy: params.compareBy
        });
    }
}

export default DapCompareScript;
