const { z } = require('zod');
const { QueryScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * DAP Filter Script - Advanced Multi-Filter Query
 *
 * Complex filtering with multiple AND-ed criteria.
 * For power users who need precise output filtering.
 */
class DapFilterScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            filters: z.object({
                categories: z.array(z.string()).optional(),
                timeRange: z.object({
                    start: z.number(),
                    end: z.number()
                }).optional(),
                exclude: z.array(z.string()).optional(), // regex patterns to exclude
                include: z.array(z.string()).optional(), // regex patterns that must match
                sources: z.array(z.string()).optional(), // file path filters
                minLength: z.number().int().min(0).optional(),
                maxLength: z.number().int().min(0).optional()
            })
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{sessionId?: string, filters: object}} params
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

        const filters = params.filters;
        let filtered = [...session.outputs];
        const stats = {
            original: filtered.length,
            afterCategories: 0,
            afterTimeRange: 0,
            afterExclude: 0,
            afterInclude: 0,
            afterSources: 0,
            afterLength: 0
        };

        // Apply category filter
        if (filters.categories && filters.categories.length > 0) {
            filtered = filtered.filter(o => filters.categories.includes(o.category));
            stats.afterCategories = filtered.length;
        }

        // Apply time range filter
        if (filters.timeRange) {
            filtered = filtered.filter(o =>
                o.ts >= filters.timeRange.start &&
                o.ts <= filters.timeRange.end
            );
            stats.afterTimeRange = filtered.length;
        }

        // Apply exclude patterns (regex)
        if (filters.exclude && filters.exclude.length > 0) {
            const excludeRegexes = filters.exclude.map(pattern => new RegExp(pattern, 'i'));
            filtered = filtered.filter(o => {
                return !excludeRegexes.some(regex => regex.test(o.text));
            });
            stats.afterExclude = filtered.length;
        }

        // Apply include patterns (regex) - ALL must match
        if (filters.include && filters.include.length > 0) {
            const includeRegexes = filters.include.map(pattern => new RegExp(pattern, 'i'));
            filtered = filtered.filter(o => {
                return includeRegexes.every(regex => regex.test(o.text));
            });
            stats.afterInclude = filtered.length;
        }

        // Apply source file filter
        if (filters.sources && filters.sources.length > 0) {
            filtered = filtered.filter(o => {
                if (!o.source?.path && !o.source?.name) return false;
                const sourcePath = o.source.path || o.source.name;
                return filters.sources.some(filterPath => sourcePath.includes(filterPath));
            });
            stats.afterSources = filtered.length;
        }

        // Apply length filters
        if (filters.minLength != null || filters.maxLength != null) {
            filtered = filtered.filter(o => {
                const len = o.text.length;
                if (filters.minLength != null && len < filters.minLength) return false;
                if (filters.maxLength != null && len > filters.maxLength) return false;
                return true;
            });
            stats.afterLength = filtered.length;
        }

        // Format results
        const events = filtered.map(o => ({
            ts: o.ts,
            relativeTime: o.ts - session.startTime,
            category: o.category,
            text: o.text,
            source: o.source ? {
                file: o.source.path || o.source.name,
                line: o.line,
                column: o.column
            } : null
        }));

        return ScriptResult.success({
            events,
            stats,
            totalFiltered: events.length,
            totalInSession: session.outputs.length,
            session: {
                id: session.sessionId,
                type: session.type,
                name: session.name
            }
        });
    }
}

module.exports = { DapFilterScript };
