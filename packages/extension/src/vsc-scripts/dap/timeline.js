const { z } = require('zod');
const { QueryScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * DAP Timeline Script - Event Timeline Viewer
 *
 * Shows chronological view of all significant events in a debug session.
 * Helps understand what happened and when, especially useful for finding
 * what happened in the seconds before a crash.
 */
class DapTimelineScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            eventTypes: z.array(z.enum(['output', 'exception', 'stopped', 'exit'])).optional(),
            window: z.number().int().min(1).optional(), // time window in ms
            granularity: z.enum(['all', 'summary', 'milestones']).optional().default('all'),
            fromEnd: z.boolean().optional().default(false)
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{sessionId?: string, eventTypes?: string[], window?: number, granularity?: string, fromEnd?: boolean}} params
     * @returns {Promise<object>}
     */
    async execute(bridgeContext, params) {
        // Access the global capture service
        const service = global.debugSessionCaptureService;
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

        // Build timeline events
        const timeline = [];
        const eventTypesFilter = params.eventTypes || ['output', 'exception', 'stopped', 'exit'];

        // Add outputs
        if (eventTypesFilter.includes('output')) {
            session.outputs.forEach(o => {
                timeline.push({
                    timestamp: o.ts,
                    relativeTime: o.ts - session.startTime,
                    eventType: 'output',
                    summary: `[${o.category}] ${o.text.slice(0, 80)}${o.text.length > 80 ? '...' : ''}`,
                    significance: o.category === 'stderr' ? 'warning' : 'normal',
                    data: o
                });
            });
        }

        // Add exceptions
        if (eventTypesFilter.includes('exception')) {
            session.exceptions.forEach((exc, idx) => {
                // Estimate timestamp based on session progress
                const estimatedTs = session.startTime +
                    ((session.endTime || Date.now()) - session.startTime) *
                    ((idx + 1) / session.exceptions.length);

                timeline.push({
                    timestamp: estimatedTs,
                    relativeTime: estimatedTs - session.startTime,
                    eventType: 'exception',
                    summary: `Exception: ${exc.message || exc.description}`,
                    significance: 'error',
                    data: exc
                });
            });
        }

        // Add stopped events
        if (eventTypesFilter.includes('stopped')) {
            session.stoppedEvents.forEach(e => {
                // Estimate timestamp
                const estimatedTs = session.startTime + (session.endTime || Date.now() - session.startTime) / 2;
                timeline.push({
                    timestamp: estimatedTs,
                    relativeTime: estimatedTs - session.startTime,
                    eventType: 'stopped',
                    summary: `Paused: ${e.reason}${e.text ? ` - ${e.text}` : ''}`,
                    significance: e.reason === 'exception' ? 'error' : 'warning',
                    data: e
                });
            });
        }

        // Add exit event
        if (eventTypesFilter.includes('exit') && session.exitCode != null) {
            const exitTs = session.endTime || Date.now();
            timeline.push({
                timestamp: exitTs,
                relativeTime: exitTs - session.startTime,
                eventType: 'exit',
                summary: `Process exited: code ${session.exitCode}`,
                significance: session.exitCode === 0 ? 'normal' : 'error',
                data: { exitCode: session.exitCode }
            });
        }

        // Sort chronologically
        timeline.sort((a, b) => a.timestamp - b.timestamp);

        // Apply time window filter
        let filteredTimeline = timeline;
        if (params.window) {
            if (params.fromEnd) {
                // Last N milliseconds
                const sessionEnd = session.endTime || Date.now();
                const cutoff = sessionEnd - params.window;
                filteredTimeline = timeline.filter(e => e.timestamp >= cutoff);
            } else {
                // First N milliseconds
                const cutoff = session.startTime + params.window;
                filteredTimeline = timeline.filter(e => e.timestamp <= cutoff);
            }
        }

        // Apply granularity
        if (params.granularity === 'milestones') {
            // Only show significant events
            filteredTimeline = filteredTimeline.filter(e =>
                e.eventType === 'exception' ||
                e.eventType === 'stopped' ||
                e.eventType === 'exit' ||
                (e.eventType === 'output' && e.significance !== 'normal')
            );
        } else if (params.granularity === 'summary') {
            // Group events by second
            const grouped = {};
            filteredTimeline.forEach(e => {
                const second = Math.floor(e.relativeTime / 1000);
                if (!grouped[second]) {
                    grouped[second] = [];
                }
                grouped[second].push(e);
            });

            filteredTimeline = Object.entries(grouped).map(([second, events]) => ({
                timestamp: session.startTime + parseInt(second) * 1000,
                relativeTime: parseInt(second) * 1000,
                eventType: 'summary',
                summary: `Second ${second}: ${events.length} events (${events.filter(e => e.significance === 'error').length} errors)`,
                significance: events.some(e => e.significance === 'error') ? 'error' : 'normal',
                data: { events: events.length, types: events.map(e => e.eventType) }
            }));
        }

        // Calculate milestones
        const milestones = {
            firstOutput: session.outputs.length > 0 ? session.outputs[0].ts : null,
            firstException: session.exceptions.length > 0 ? session.exceptions[0] : null,
            breakpointHits: session.stoppedEvents
                .filter(e => e.reason === 'breakpoint')
                .map((e, idx) => session.startTime + (idx + 1) * 100), // estimated
            sessionExit: session.endTime || null
        };

        const duration = (session.endTime || Date.now()) - session.startTime;

        return ScriptResult.success({
            timeline: filteredTimeline,
            milestones,
            duration,
            eventCount: filteredTimeline.length,
            session: {
                id: session.sessionId,
                type: session.type,
                name: session.name
            }
        });
    }
}

module.exports = { DapTimelineScript };
