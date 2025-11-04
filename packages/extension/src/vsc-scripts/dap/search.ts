import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * DAP Search Script - Pattern Search Across Outputs
 *
 * Search one or all sessions for text/regex patterns in outputs.
 * Returns matches with surrounding context.
 */
@RegisterScript('dap.search')
export class DapSearchScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(), // or 'all'
            pattern: z.string(),
            category: z.enum(['all', 'stdout', 'stderr', 'console', 'telemetry']).optional(),
            contextLines: z.coerce.number().int().min(0).max(20).optional().default(2),
            limit: z.coerce.number().int().min(1).max(1000).optional().default(50),
            caseSensitive: z.coerce.boolean().optional().default(false)
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

        // Determine which sessions to search
        const sessionsToSearch = [];
        if (params.sessionId === 'all') {
            // Search all sessions
            const allSessions = service.getAllSessions();
            sessionsToSearch.push(...allSessions);
        } else {
            // Search specific session or latest
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
            sessionsToSearch.push(session);
        }

        // Build regex pattern
        const regex = new RegExp(
            params.pattern,
            params.caseSensitive ? '' : 'i'
        );

        // Search all sessions
        const allMatches: any[] = [];
        const matchesBySession: Record<string, number> = {};

        for (const session of sessionsToSearch) {
            let outputs = session.outputs;

            // Filter by category if specified
            if (params.category && params.category !== 'all') {
                outputs = outputs.filter((o: any) => o.category === params.category);
            }

            // Search for pattern
            outputs.forEach((output: any, idx: number) => {
                if (regex.test(output.text)) {
                    // Found a match!
                    const match: any = {
                        sessionId: session.sessionId,
                        output: {
                            ts: output.ts,
                            relativeTime: output.ts - session.startTime,
                            category: output.category,
                            text: output.text
                        },
                        matchText: output.text.match(regex)?.[0] || null
                    };

                    // Add context if requested
                    if (params.contextLines > 0) {
                        const beforeStart = Math.max(0, idx - params.contextLines);
                        const afterEnd = Math.min(outputs.length, idx + params.contextLines + 1);

                        match.context = {
                            before: outputs.slice(beforeStart, idx).map((o: any) => ({
                                ts: o.ts,
                                category: o.category,
                                text: o.text.slice(0, 200)
                            })),
                            after: outputs.slice(idx + 1, afterEnd).map((o: any) => ({
                                ts: o.ts,
                                category: o.category,
                                text: o.text.slice(0, 200)
                            }))
                        };
                    }

                    allMatches.push(match);

                    // Track by session
                    if (!matchesBySession[session.sessionId]) {
                        matchesBySession[session.sessionId] = 0;
                    }
                    matchesBySession[session.sessionId]++;
                }
            });
        }

        // Limit results
        const limitedMatches = allMatches.slice(0, params.limit);

        return ScriptResult.success({
            matches: limitedMatches,
            totalMatches: allMatches.length,
            matchesBySession,
            sessionsSearched: sessionsToSearch.length,
            pattern: params.pattern,
            truncated: allMatches.length > params.limit
        });
    }
}

export default DapSearchScript;
