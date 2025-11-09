import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * DAP Logs Script - Recent Logs Viewer
 *
 * Filters and displays console output from captured debug sessions.
 * Supports filtering by category, search patterns, time windows, and more.
 *
 * Most commonly used script for viewing debug output.
 */
@RegisterScript('dap.logs')
export class DapLogsScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            count: z.coerce.number().int().min(1).max(10000).optional().default(20),
            category: z.enum(['all', 'stdout', 'stderr', 'console', 'telemetry']).optional().default('all'),
            search: z.string().optional(),
            since: z.coerce.number().optional(), // timestamp in ms or negative offset
            reverse: z.coerce.boolean().optional().default(false),
            showSource: z.coerce.boolean().optional().default(true)
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

        // Start with all outputs
        let filtered = [...session.outputs];
        const filterStats = {
            byCategory: 0,
            bySearch: 0,
            byTime: 0,
            original: filtered.length
        };

        // Filter by category
        if (params.category !== 'all') {
            filtered = filtered.filter((o: any) => o.category === params.category);
            filterStats.byCategory = filterStats.original - filtered.length;
        }

        // Filter by search pattern
        if (params.search) {
            const searchRegex = new RegExp(params.search, 'i');
            const beforeSearch = filtered.length;
            filtered = filtered.filter((o: any) => searchRegex.test(o.text));
            filterStats.bySearch = beforeSearch - filtered.length;
        }

        // Filter by time
        if (params.since != null) {
            const beforeTime = filtered.length;
            if (params.since < 0) {
                // Negative offset: "last N milliseconds"
                const cutoff = Date.now() + params.since; // since is negative
                filtered = filtered.filter((o: any) => o.ts >= cutoff);
            } else {
                // Absolute timestamp
                filtered = filtered.filter((o: any) => o.ts >= params.since);
            }
            filterStats.byTime = beforeTime - filtered.length;
        }

        // Reverse if oldest-first requested
        if (params.reverse) {
            // Already in chronological order, keep as-is
        } else {
            // Default: most recent first
            filtered.reverse();
        }

        // Limit count
        const logs = filtered.slice(0, params.count);

        // Format logs
        const formattedLogs = logs.map((o: any) => {
            const result: any = {
                ts: o.ts,
                relativeTime: o.ts - session.startTime,
                category: o.category,
                text: o.text
            };

            if (params.showSource && o.source) {
                result.source = {
                    file: o.source.path || o.source.name,
                    line: o.line,
                    column: o.column
                };
            }

            return result;
        });

        return ScriptResult.success({
            logs: formattedLogs,
            matched: logs.length,
            total: session.outputs.length,
            filtered: {
                byCategory: filterStats.byCategory,
                bySearch: filterStats.bySearch,
                byTime: filterStats.byTime
            },
            session: {
                id: session.sessionId,
                type: session.type,
                name: session.name
            }
        });
    }
}

export default DapLogsScript;
