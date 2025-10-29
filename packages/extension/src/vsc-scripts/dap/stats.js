const { z } = require('zod');
const { QueryScript } = require('@script-base');

/**
 * DAP Stats Script - Statistical Analysis
 *
 * Aggregate metrics and pattern detection across debug sessions.
 * Answers questions like "What's generating the most log spam?"
 */
class DapStatsScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(), // or 'all'
            groupBy: z.enum(['category', 'source', 'hour', 'session']).optional().default('category'),
            includeCharts: z.boolean().optional().default(true)
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{sessionId?: string, groupBy?: string, includeCharts?: boolean}} params
     * @returns {Promise<object>}
     */
    async execute(bridgeContext, params) {
        // Access the global capture service
        const service = global.debugSessionCaptureService;
        if (!service) {
            return { error: 'Debug session capture service not available' };
        }

        // Determine which sessions to analyze
        const sessionsToAnalyze = [];
        if (params.sessionId === 'all') {
            const allSessions = service.getAllSessions();
            sessionsToAnalyze.push(...allSessions);
        } else {
            const sessionId = params.sessionId || service.getLastSessionId();
            if (!sessionId) {
                return { error: 'No debug sessions captured yet' };
            }

            const session = service.getSession(sessionId);
            if (!session) {
                return {
                    error: 'Session not found',
                    sessionId
                };
            }
            sessionsToAnalyze.push(session);
        }

        // Aggregate all outputs
        const allOutputs = sessionsToAnalyze.flatMap(s => s.outputs);
        const allExceptions = sessionsToAnalyze.flatMap(s => s.exceptions);

        // Distribution by category
        const byCategory = {};
        allOutputs.forEach(o => {
            byCategory[o.category] = (byCategory[o.category] || 0) + 1;
        });

        // Distribution by source file
        const bySource = {};
        allOutputs.forEach(o => {
            if (o.source?.path || o.source?.name) {
                const file = o.source.path || o.source.name;
                bySource[file] = (bySource[file] || 0) + 1;
            }
        });

        // Distribution over time (hourly buckets)
        const overTime = {};
        allOutputs.forEach(o => {
            const hour = new Date(o.ts).toISOString().slice(0, 13) + ':00';
            overTime[hour] = (overTime[hour] || 0) + 1;
        });

        // Top N most frequent messages
        const messageFrequency = {};
        allOutputs.forEach(o => {
            const msg = o.text.slice(0, 100); // First 100 chars
            messageFrequency[msg] = (messageFrequency[msg] || 0) + 1;
        });
        const mostFrequentMessages = Object.entries(messageFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([text, count]) => ({ text, count }));

        // Noisiest files
        const noisiestFiles = Object.entries(bySource)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([file, count]) => ({ file, count }));

        // Exception hotspots
        const exceptionLocations = {};
        allExceptions.forEach(exc => {
            if (exc.stackFrames && exc.stackFrames.length > 0) {
                const location = `${exc.stackFrames[0].source}:${exc.stackFrames[0].line}`;
                exceptionLocations[location] = (exceptionLocations[location] || 0) + 1;
            }
        });
        const exceptionHotspots = Object.entries(exceptionLocations)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([location, count]) => ({ location, count }));

        // Calculate averages
        const totalDuration = sessionsToAnalyze.reduce((sum, s) => {
            const duration = (s.endTime || Date.now()) - s.startTime;
            return sum + duration;
        }, 0);
        const totalDurationSec = totalDuration / 1000;

        const eventsPerSecond = totalDurationSec > 0 ? (allOutputs.length / totalDurationSec).toFixed(2) : '0';
        const timeBetweenOutputs = allOutputs.length > 1
            ? Math.round(totalDuration / (allOutputs.length - 1))
            : 0;
        const outputsPerSession = sessionsToAnalyze.length > 0
            ? Math.round(allOutputs.length / sessionsToAnalyze.length)
            : 0;

        // Detect anomalies (simple spike detection)
        const anomalies = {
            spikes: [],
            gaps: [],
            patterns: []
        };

        // Build charts if requested
        const charts = {};
        if (params.includeCharts) {
            // Category distribution as structured data
            const maxCount = Math.max(...Object.values(byCategory));
            charts.categoryDistribution = Object.entries(byCategory).map(([cat, count]) => {
                const barLength = Math.floor((count / maxCount) * 40);
                const percentage = ((count / allOutputs.length) * 100).toFixed(1);
                return {
                    category: cat,
                    count,
                    percentage: parseFloat(percentage),
                    bar: '█'.repeat(barLength),
                    barLength
                };
            });

            // Simple sparkline for timeline (hourly)
            const hourCounts = Object.values(overTime);
            if (hourCounts.length > 0) {
                const maxHourCount = Math.max(...hourCounts);
                const sparkChars = ' ▁▂▃▄▅▆▇█';
                charts.timeline = {
                    sparkline: hourCounts.map(count => {
                        const index = Math.floor((count / maxHourCount) * (sparkChars.length - 1));
                        return sparkChars[index];
                    }).join(''),
                    hours: Object.keys(overTime),
                    counts: hourCounts
                };
            }
        }

        return {
            distribution: {
                byCategory,
                bySource: Object.fromEntries(Object.entries(bySource).slice(0, 20)), // top 20
                overTime
            },
            topN: {
                mostFrequentMessages,
                noisiestFiles,
                exceptionHotspots
            },
            averages: {
                eventsPerSecond: parseFloat(eventsPerSecond),
                timeBetweenOutputs,
                outputsPerSession
            },
            anomalies,
            charts,
            summary: {
                totalOutputs: allOutputs.length,
                totalExceptions: allExceptions.length,
                sessionsAnalyzed: sessionsToAnalyze.length,
                timespan: `${totalDurationSec.toFixed(2)}s`
            }
        };
    }
}

module.exports = { DapStatsScript };
