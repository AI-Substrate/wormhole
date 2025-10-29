const { z } = require('zod');
const { QueryScript } = require('@script-base');

/**
 * DAP Exceptions Script - Exception Inspector
 *
 * Shows all exceptions with surrounding context (outputs before/after).
 * Includes stack traces and location information when available.
 *
 * Use this to deep dive into what was happening around each exception.
 */
class DapExceptionsScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional(),
            count: z.number().int().min(1).max(100).optional().default(10),
            withContext: z.boolean().optional().default(true),
            contextLines: z.number().int().min(0).max(50).optional().default(5)
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{sessionId?: string, count?: number, withContext?: boolean, contextLines?: number}} params
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

        if (session.exceptions.length === 0) {
            return {
                exceptions: [],
                totalExceptions: 0,
                message: 'No exceptions captured in this session',
                session: {
                    id: session.sessionId,
                    type: session.type,
                    name: session.name
                }
            };
        }

        // Get last N exceptions
        const exceptionsToShow = session.exceptions.slice(-params.count);

        // Build exception details with context
        const exceptionDetails = exceptionsToShow.map((exception, idx) => {
            const result = {
                exception: {
                    message: exception.message,
                    description: exception.description,
                    typeName: exception.typeName
                },
                stackTrace: exception.stackFrames || null,
                timeSinceStart: null
            };

            // Find the associated stopped event
            const stoppedEvent = session.stoppedEvents.find(e =>
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
                    before: session.outputs.slice(beforeStart, estimatedOutputIndex).map(o => ({
                        ts: o.ts,
                        category: o.category,
                        text: o.text.slice(0, 200)
                    })),
                    after: session.outputs.slice(estimatedOutputIndex, afterEnd).map(o => ({
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

        return {
            exceptions: exceptionDetails,
            totalExceptions: session.exceptions.length,
            showing: exceptionDetails.length,
            session: {
                id: session.sessionId,
                type: session.type,
                name: session.name
            }
        };
    }
}

module.exports = { DapExceptionsScript };
