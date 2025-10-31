const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const { QueryScript } = require('@script-base');
const { ScriptResult } = require('@core/scripts/ScriptResult');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * Save Variable Query Script
 *
 * Saves large variable data to disk without flooding CLI output.
 * Evaluates an expression in the current paused frame, pages through its children,
 * and emits JSON Lines records to the requested file.
 *
 * Features:
 * - File streaming for large data structures
 * - Pagination to avoid memory exhaustion
 * - JSON Lines format for easy parsing
 * - Metadata header with context
 *
 * Usage:
 *   vscb script run debug.save-variable --expression="largeArray" --outputPath="/tmp/vars.jsonl"
 */
class SaveVariableScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            outputPath: z.string().min(1),
            expression: z.string().min(1),
            pageSize: z.number().int().positive().optional().default(500),
            maxItems: z.number().int().positive().optional(),
            context: z.string().optional().default('watch')
        });

        this.resultSchema = z.object({
            success: z.boolean(),
            message: z.string().optional(),
            outputPath: z.string().optional(),
            bytes: z.number().optional(),
            counts: z.object({
                named: z.number(),
                indexed: z.number()
            }).optional(),
            error: z.any().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{outputPath: string, expression: string, pageSize?: number, maxItems?: number, context?: string}} params
     * @returns {Promise<object>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;
        const session = vscode.debug.activeDebugSession;

        const outputPathParam = params.outputPath;
        const expression = params.expression;
        const pageSize = Number.isFinite(params.pageSize) && params.pageSize > 0
            ? Math.floor(params.pageSize)
            : 500;
        const maxItems = Number.isFinite(params.maxItems) && params.maxItems > 0
            ? Math.floor(params.maxItems)
            : null;
        const context = typeof params.context === 'string' ? params.context : 'watch';

        // Check if there's an active debug session
        if (!session) {
            return ScriptResult.failure(
                'No active debug session',
                ErrorCode.E_NO_SESSION
            );
        }

        const workspaceDir = bridgeContext.workspaceFolder?.uri?.fsPath || process.cwd();
        const resolvedOutputPath = path.isAbsolute(outputPathParam)
            ? outputPathParam
            : path.resolve(workspaceDir, outputPathParam);

        await fs.promises.mkdir(path.dirname(resolvedOutputPath), { recursive: true });

        // Ensure the debugger is paused and capture frame/thread information
        let threadId;
        let frameId;
        let frameInfo;

        try {
            const threadsResponse = await session.customRequest('threads');
            const threads = threadsResponse.threads || [];
            if (threads.length === 0) {
                return ScriptResult.failure(
                    'No threads available',
                    ErrorCode.E_INTERNAL
                );
            }

            const pausedThread = threads.find(t => t.presentationHint === 'paused' || t.stopped) || threads[0];
            threadId = pausedThread.id;

            const stackResponse = await session.customRequest('stackTrace', {
                threadId,
                startFrame: 0,
                levels: 1
            });

            if (!stackResponse.stackFrames || stackResponse.stackFrames.length === 0) {
                return ScriptResult.failure(
                    'No stack frames available',
                    ErrorCode.E_INTERNAL
                );
            }

            frameInfo = stackResponse.stackFrames[0];
            frameId = frameInfo.id;
        } catch (error) {
            return ScriptResult.failure(
                'Debugger must be paused at a breakpoint',
                ErrorCode.E_OPERATION_FAILED
            );
        }

        // Evaluate expression to get variablesReference metadata
        let evalResponse;
        try {
            evalResponse = await session.customRequest('evaluate', {
                expression,
                frameId,
                context
            });
        } catch (error) {
            return ScriptResult.failure(
                `Failed to evaluate expression "${expression}": ${error.message}`,
                ErrorCode.E_OPERATION_FAILED
            );
        }

        if (!evalResponse || typeof evalResponse.variablesReference !== 'number' || evalResponse.variablesReference === 0) {
            return ScriptResult.failure(
                `Expression "${expression}" did not produce expandable variables`,
                ErrorCode.E_OPERATION_FAILED
            );
        }

        const rootReference = evalResponse.variablesReference;
        const rootMetadata = {
            expression,
            dataType: evalResponse.type || null,
            valuePreview: evalResponse.result,
            namedVariables: evalResponse.namedVariables ?? 0,
            indexedVariables: evalResponse.indexedVariables ?? 0
        };

        const writeStream = fs.createWriteStream(resolvedOutputPath, { encoding: 'utf8' });

        const writeLine = (record) => new Promise((resolve, reject) => {
            const payload = JSON.stringify(record) + '\n';
            if (!writeStream.write(payload, 'utf8')) {
                writeStream.once('drain', resolve);
                writeStream.once('error', reject);
            } else {
                resolve();
            }
        });

        const counts = {
            named: 0,
            indexed: 0
        };
        let truncatedByLimit = false;

        await writeLine({
            type: 'metadata',
            sessionId: session.id,
            threadId,
            frameId,
            frame: {
                name: frameInfo.name,
                source: frameInfo.source?.path || frameInfo.source?.name || null,
                line: frameInfo.line,
                column: frameInfo.column
            },
            expression: rootMetadata.expression,
            dataType: rootMetadata.dataType,
            valuePreview: rootMetadata.valuePreview,
            namedVariables: rootMetadata.namedVariables,
            indexedVariables: rootMetadata.indexedVariables,
            pageSize,
            maxItems,
            timestamp: new Date().toISOString()
        });

        const ensureFinished = () => new Promise((resolve, reject) => {
            writeStream.once('finish', resolve);
            writeStream.once('error', reject);
            writeStream.end();
        });

        const shouldStop = () => maxItems !== null && (counts.named + counts.indexed) >= maxItems;

        const streamWithFilter = async (filter, totalHint) => {
            let start = 0;
            let fetched = 0;

            while (true) {
                if (shouldStop()) {
                    truncatedByLimit = true;
                    break;
                }

                let count = pageSize;
                if (totalHint && totalHint > 0) {
                    const remaining = totalHint - fetched;
                    if (remaining <= 0) break;
                    count = Math.min(count, remaining);
                }

                const request = {
                    variablesReference: rootReference,
                    start,
                    count,
                    filter
                };

                if (!filter) {
                    delete request.filter;
                }

                let response;
                try {
                    response = await session.customRequest('variables', request);
                } catch (error) {
                    if (filter) {
                        console.warn(`[STREAM] filter "${filter}" not supported: ${error.message}`);
                        return false;
                    }
                    throw error;
                }

                const variables = response?.variables || [];
                if (variables.length === 0) {
                    break;
                }

                for (const variable of variables) {
                    const record = {
                        type: filter === 'indexed' ? 'indexed' : 'named',
                        name: variable.name,
                        value: variable.value,
                        evaluateName: variable.evaluateName,
                        variablesReference: variable.variablesReference,
                        namedVariables: variable.namedVariables ?? undefined,
                        indexedVariables: variable.indexedVariables ?? undefined,
                        dataType: variable.type ?? undefined
                    };

                    await writeLine(record);

                    if (filter === 'indexed') {
                        counts.indexed += 1;
                    } else {
                        counts.named += 1;
                    }

                    if (shouldStop()) {
                        truncatedByLimit = true;
                        break;
                    }
                }

                if (shouldStop()) {
                    break;
                }

                fetched += variables.length;
                start += variables.length;

                if ((count && variables.length < count) || variables.length === 0) {
                    break;
                }

                // Fallback guard: if totalHint is unknown and we do not progress, exit to avoid infinite loops
                if (!totalHint && variables.length === 0) {
                    break;
                }
            }

            return true;
        };

        // Named variables (object properties, map entries)
        if (rootMetadata.namedVariables > 0) {
            await streamWithFilter('named', rootMetadata.namedVariables);
        } else {
            // Some adapters do not populate namedVariables; attempt once without filter
            await streamWithFilter(undefined, null);
        }

        // Indexed variables (arrays, lists)
        if (!shouldStop() && rootMetadata.indexedVariables > 0) {
            const ok = await streamWithFilter('indexed', rootMetadata.indexedVariables);
            if (!ok) {
                // Retry without filter if adapter rejected 'indexed'
                await streamWithFilter(undefined, rootMetadata.indexedVariables);
            }
        }

        await ensureFinished();

        const fileStats = await fs.promises.stat(resolvedOutputPath);

        return ScriptResult.success({
            message: `Wrote ${counts.named + counts.indexed} records to ${resolvedOutputPath}`,
            outputPath: resolvedOutputPath,
            bytes: fileStats.size,
            counts,
            truncatedByLimit,
            metadata: {
                adapterType: session.type,
                expression,
                pageSize,
                namedVariables: rootMetadata.namedVariables,
                indexedVariables: rootMetadata.indexedVariables
            }
        });
    }
}

module.exports = { SaveVariableScript };
