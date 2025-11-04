import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * DAP Summary Script - Session Overview Dashboard
 *
 * Provides a quick health check of the debug session by analyzing captured DAP events.
 * Shows counts, metrics, health indicators, and sample outputs.
 *
 * Use this first when paused at a breakpoint to get an overview of session state.
 */
@RegisterScript('dap.summary')
export class DapSummaryScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            compact: z.coerce.boolean().optional().default(false)
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

        // Get session (latest if no ID provided)
        const sessionId = params.sessionId || service.getLastSessionId();
        if (!sessionId) {
            return ScriptResult.failure(
                'No debug sessions captured yet',
                ErrorCode.E_NO_SESSION,
                { reason: 'No session history' }
            );
        }

        const session = service.getSession(sessionId);
        if (!session) {
            return ScriptResult.failure(
                `Session "${sessionId}" not found - may have been cleared or never existed`,
                ErrorCode.E_NOT_FOUND,
                { sessionId }
            );
        }

        // Calculate metrics
        const duration = session.endTime
            ? session.endTime - session.startTime
            : Date.now() - session.startTime;
        const durationSec = duration / 1000;

        const totalOutputs = session.outputs.length;
        const byCategory = {
            stdout: session.outputs.filter((o: any) => o.category === 'stdout').length,
            stderr: session.outputs.filter((o: any) => o.category === 'stderr').length,
            console: session.outputs.filter((o: any) => o.category === 'console').length,
            telemetry: session.outputs.filter((o: any) => o.category === 'telemetry').length
        };

        const totalDataSize = session.outputs.reduce((sum: number, o: any) => sum + (o.text?.length || 0), 0);
        const avgOutputLength = totalOutputs > 0 ? Math.round(totalDataSize / totalOutputs) : 0;
        const eventsPerSecond = durationSec > 0 ? (totalOutputs / durationSec).toFixed(2) : '0';

        const timeSinceLastEvent = session.outputs.length > 0
            ? Date.now() - session.outputs[session.outputs.length - 1].ts
            : null;

        // Health indicators
        const hasExceptions = session.exceptions.length > 0;
        const exceptionRate = durationSec > 0
            ? ((session.exceptions.length / durationSec) * 60).toFixed(2) // per minute
            : '0';
        const errorRatio = totalOutputs > 0
            ? (byCategory.stderr / totalOutputs * 100).toFixed(1)
            : '0';
        const abnormalExit = session.exitCode != null && session.exitCode !== 0;

        // Samples
        const firstOutputs = session.outputs.slice(0, 3);
        const lastOutputs = session.outputs.slice(-3);
        const lastException = session.exceptions.length > 0
            ? session.exceptions[session.exceptions.length - 1]
            : null;

        const result = {
            session: {
                id: session.sessionId,
                type: session.type,
                name: session.name,
                duration: `${durationSec.toFixed(2)}s`,
                status: session.isActive ? 'active' : (session.terminated ? 'terminated' : 'ended')
            },
            counts: {
                totalOutputs,
                byCategory,
                exceptions: session.exceptions.length,
                stoppedEvents: session.stoppedEvents.length,
                breakpointHits: session.stoppedEvents.filter((e: any) => e.reason === 'breakpoint').length
            },
            metrics: {
                totalDataSize,
                avgOutputLength,
                eventsPerSecond: parseFloat(eventsPerSecond),
                timeSinceLastEvent
            },
            health: {
                hasExceptions,
                exceptionRate: parseFloat(exceptionRate),
                errorRatio: parseFloat(errorRatio),
                exitCode: session.exitCode,
                abnormalExit,
                truncated: session.truncated || false
            },
            samples: {
                first: firstOutputs.map((o: any) => ({ ts: o.ts, category: o.category, text: o.text.slice(0, 100) })),
                last: lastOutputs.map((o: any) => ({ ts: o.ts, category: o.category, text: o.text.slice(0, 100) })),
                lastException: lastException ? {
                    message: lastException.message,
                    description: lastException.description
                } : null
            }
        };

        // Compact mode: one-line summary
        if (params.compact) {
            return ScriptResult.success({
                summary: `Session ${session.sessionId.slice(0, 8)}: ${totalOutputs} outputs, ${session.exceptions.length} exceptions, exit=${session.exitCode ?? 'none'}, ${session.isActive ? 'active' : 'ended'}`,
                ...result
            });
        }

        return ScriptResult.success(result);
    }
}

export default DapSummaryScript;
