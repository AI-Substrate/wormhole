const { z } = require('zod');
const { QueryScript } = require('@script-base');

/**
 * DAP Summary Script - Session Overview Dashboard
 *
 * Provides a quick health check of the debug session by analyzing captured DAP events.
 * Shows counts, metrics, health indicators, and sample outputs.
 *
 * Use this first when paused at a breakpoint to get an overview of session state.
 */
class DapSummaryScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            compact: z.boolean().optional().default(false)
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{sessionId?: string, compact?: boolean}} params
     * @returns {Promise<object>}
     */
    async execute(bridgeContext, params) {
        // Access the global capture service
        const service = global.debugSessionCaptureService;
        if (!service) {
            return { error: 'Debug session capture service not available' };
        }

        // Get session (latest if no ID provided)
        const sessionId = params.sessionId || service.getLastSessionId();
        if (!sessionId) {
            return { error: 'No debug sessions captured yet' };
        }

        const session = service.getSession(sessionId);
        if (!session) {
            return {
                error: 'Session not found',
                sessionId,
                hint: 'Session may have been cleared or never existed'
            };
        }

        // Calculate metrics
        const duration = session.endTime
            ? session.endTime - session.startTime
            : Date.now() - session.startTime;
        const durationSec = duration / 1000;

        const totalOutputs = session.outputs.length;
        const byCategory = {
            stdout: session.outputs.filter(o => o.category === 'stdout').length,
            stderr: session.outputs.filter(o => o.category === 'stderr').length,
            console: session.outputs.filter(o => o.category === 'console').length,
            telemetry: session.outputs.filter(o => o.category === 'telemetry').length
        };

        const totalDataSize = session.outputs.reduce((sum, o) => sum + (o.text?.length || 0), 0);
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
                breakpointHits: session.stoppedEvents.filter(e => e.reason === 'breakpoint').length
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
                first: firstOutputs.map(o => ({ ts: o.ts, category: o.category, text: o.text.slice(0, 100) })),
                last: lastOutputs.map(o => ({ ts: o.ts, category: o.category, text: o.text.slice(0, 100) })),
                lastException: lastException ? {
                    message: lastException.message,
                    description: lastException.description
                } : null
            }
        };

        // Compact mode: one-line summary
        if (params.compact) {
            return {
                summary: `Session ${session.sessionId.slice(0, 8)}: ${totalOutputs} outputs, ${session.exceptions.length} exceptions, exit=${session.exitCode ?? 'none'}, ${session.isActive ? 'active' : 'ended'}`,
                ...result
            };
        }

        return result;
    }
}

module.exports = { DapSummaryScript };
