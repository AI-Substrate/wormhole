import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * DAP Filter Script - Advanced Multi-Filter Query
 *
 * Complex filtering with multiple AND-ed criteria.
 * For power users who need precise output filtering.
 */
@RegisterScript('dap.filter')
export class DapFilterScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            filters: z.object({
                categories: z.array(z.string()).optional(),
                timeRange: z.object({
                    start: z.coerce.number(),
                    end: z.coerce.number()
                }).optional(),
                exclude: z.array(z.string()).optional(), // regex patterns to exclude
                include: z.array(z.string()).optional(), // regex patterns that must match
                sources: z.array(z.string()).optional(), // file path filters
                minLength: z.coerce.number().int().min(0).optional(),
                maxLength: z.coerce.number().int().min(0).optional()
            })
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
            filtered = filtered.filter((o: any) => filters.categories.includes(o.category));
            stats.afterCategories = filtered.length;
        }

        // Apply time range filter
        if (filters.timeRange) {
            filtered = filtered.filter((o: any) =>
                o.ts >= filters.timeRange.start &&
                o.ts <= filters.timeRange.end
            );
            stats.afterTimeRange = filtered.length;
        }

        // Apply exclude patterns (regex)
        if (filters.exclude && filters.exclude.length > 0) {
            const excludeRegexes = filters.exclude.map((pattern: string) => new RegExp(pattern, 'i'));
            filtered = filtered.filter((o: any) => {
                return !excludeRegexes.some((regex: RegExp) => regex.test(o.text));
            });
            stats.afterExclude = filtered.length;
        }

        // Apply include patterns (regex) - ALL must match
        if (filters.include && filters.include.length > 0) {
            const includeRegexes = filters.include.map((pattern: string) => new RegExp(pattern, 'i'));
            filtered = filtered.filter((o: any) => {
                return includeRegexes.every((regex: RegExp) => regex.test(o.text));
            });
            stats.afterInclude = filtered.length;
        }

        // Apply source file filter
        if (filters.sources && filters.sources.length > 0) {
            filtered = filtered.filter((o: any) => {
                if (!o.source?.path && !o.source?.name) return false;
                const sourcePath = o.source.path || o.source.name;
                return filters.sources.some((filterPath: string) => sourcePath.includes(filterPath));
            });
            stats.afterSources = filtered.length;
        }

        // Apply length filters
        if (filters.minLength != null || filters.maxLength != null) {
            filtered = filtered.filter((o: any) => {
                const len = o.text.length;
                if (filters.minLength != null && len < filters.minLength) return false;
                if (filters.maxLength != null && len > filters.maxLength) return false;
                return true;
            });
            stats.afterLength = filtered.length;
        }

        // Format results
        const events = filtered.map((o: any) => ({
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

export default DapFilterScript;
