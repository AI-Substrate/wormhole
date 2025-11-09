import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * DAP Exceptions Script - Exception Inspector
 *
 * Shows all exceptions with surrounding context (outputs before/after).
 * Includes stack traces and location information when available.
 *
 * Use this to deep dive into what was happening around each exception.
 */
@RegisterScript('dap.exceptions')
export class DapExceptionsScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            count: z.coerce.number().int().min(1).max(100).optional().default(10),
            withContext: z.coerce.boolean().optional().default(true),
            contextLines: z.coerce.number().int().min(0).max(50).optional().default(5)
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

        if (session.exceptions.length === 0) {
            return ScriptResult.success({
                exceptions: [],
                totalExceptions: 0,
                message: 'No exceptions captured in this session',
                session: {
                    id: session.sessionId,
                    type: session.type,
                    name: session.name
                }
            });
        }

        // Get last N exceptions
        const exceptionsToShow = session.exceptions.slice(-params.count);

        // Build exception details with context
        const exceptionDetails = exceptionsToShow.map((exception: any, idx: number) => {
            const result: any = {
                exception: {
                    message: exception.message,
                    description: exception.description,
                    typeName: exception.typeName
                },
                stackTrace: exception.stackFrames || null,
                timeSinceStart: null
            };

            // Find the associated stopped event
            const stoppedEvent = session.stoppedEvents.find((e: any) =>
                e.reason === 'exception' &&
                Math.abs(e.threadId - (exception.threadId || 0)) < 100 // rough match
            );

            if (stoppedEvent) {
                result.stoppedEvent = {
                    reason: stoppedEvent.reason,
                    threadId: stoppedEvent.threadId,
                    text: stoppedEvent.text,
                    hitBreakpointIds: stoppedEvent.hitBreakpointIds
                };
            }

            // Add context if requested
            if (params.withContext) {
                // Find exception timestamp by matching with outputs around the same time
                // Exceptions don't have timestamps, so we estimate based on session progress
                const exceptionIndex = session.exceptions.indexOf(exception);
                const estimatedOutputIndex = Math.floor(
                    (session.outputs.length / session.exceptions.length) * (exceptionIndex + 1)
                );

                const beforeStart = Math.max(0, estimatedOutputIndex - params.contextLines);
                const afterEnd = Math.min(session.outputs.length, estimatedOutputIndex + params.contextLines);

                result.context = {
                    before: session.outputs.slice(beforeStart, estimatedOutputIndex).map((o: any) => ({
                        ts: o.ts,
                        category: o.category,
                        text: o.text.slice(0, 200)
                    })),
                    after: session.outputs.slice(estimatedOutputIndex, afterEnd).map((o: any) => ({
                        ts: o.ts,
                        category: o.category,
                        text: o.text.slice(0, 200)
                    }))
                };

                if (result.context.before.length > 0) {
                    result.timeSinceStart = result.context.before[0].ts - session.startTime;
                }
            }

            // Extract location from stack trace
            if (exception.stackFrames && exception.stackFrames.length > 0) {
                const topFrame = exception.stackFrames[0];
                result.location = {
                    file: topFrame.source,
                    line: topFrame.line,
                    column: topFrame.column,
                    function: topFrame.name
                };
            }

            return result;
        });

        return ScriptResult.success({
            exceptions: exceptionDetails,
            totalExceptions: session.exceptions.length,
            showing: exceptionDetails.length,
            session: {
                id: session.sessionId,
                type: session.type,
                name: session.name
            }
        });
    }
}

export default DapExceptionsScript;
