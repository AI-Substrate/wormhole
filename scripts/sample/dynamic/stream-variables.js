/**
 * Stream Variables - Write large variable payloads to disk without flooding CLI output.
 *
 * Phase 4 utility script that evaluates an expression in the current paused frame,
 * pages through its children, and emits JSON Lines records to the requested file.
 *
 * Parameters:
 *   - outputPath (string, required): Absolute or workspace-relative path to write.
 *   - expression (string, required): Expression to evaluate for the root variable.
 *   - pageSize (number, optional, default 500): Number of children to fetch per page.
 *   - maxItems (number, optional): Hard cap on total records written (for sampling).
 *   - context (string, optional, default 'watch'): DAP evaluate context.
 */

const fs = require('fs');
const path = require('path');

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const session = vscode.debug.activeDebugSession;

    const outputPathParam = params?.outputPath;
    const expression = params?.expression;
    const pageSize = Number.isFinite(params?.pageSize) && params.pageSize > 0
        ? Math.floor(params.pageSize)
        : 500;
    const maxItems = Number.isFinite(params?.maxItems) && params.maxItems > 0
        ? Math.floor(params.maxItems)
        : null;
    const context = typeof params?.context === 'string' ? params.context : 'watch';

    if (!outputPathParam || typeof outputPathParam !== 'string') {
        return {
            success: false,
            error: 'E_INVALID_PARAMS',
            message: 'outputPath parameter is required',
            hint: 'Provide --param outputPath=/tmp/debug-vars.jsonl'
        };
    }

    if (!expression || typeof expression !== 'string') {
        return {
            success: false,
            error: 'E_INVALID_PARAMS',
            message: 'expression parameter is required',
            hint: 'Provide --param expression=massiveArray (or any in-scope variable)'
        };
    }

    if (!session) {
        return {
            success: false,
            error: 'E_NO_SESSION',
            message: 'No active debug session. Start debugging with F5 and pause at a breakpoint first.'
        };
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
            return {
                success: false,
                error: 'E_NO_THREADS',
                message: 'No threads available. Pause the debugger and try again.'
            };
        }

        const pausedThread = threads.find(t => t.presentationHint === 'paused' || t.stopped) || threads[0];
        threadId = pausedThread.id;

        const stackResponse = await session.customRequest('stackTrace', {
            threadId,
            startFrame: 0,
            levels: 1
        });

        if (!stackResponse.stackFrames || stackResponse.stackFrames.length === 0) {
            return {
                success: false,
                error: 'E_NO_STACK',
                message: 'No stack frames available. Pause at a breakpoint before streaming variables.'
            };
        }

        frameInfo = stackResponse.stackFrames[0];
        frameId = frameInfo.id;
    } catch (error) {
        return {
            success: false,
            error: 'E_NOT_STOPPED',
            message: 'Debugger must be paused at a breakpoint before streaming variables.',
            detail: error.message
        };
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
        return {
            success: false,
            error: 'E_EVALUATE_FAILED',
            message: `Failed to evaluate expression "${expression}"`,
            detail: error.message
        };
    }

    if (!evalResponse || typeof evalResponse.variablesReference !== 'number' || evalResponse.variablesReference === 0) {
        return {
            success: false,
            error: 'E_NOT_EXPANDABLE',
            message: `Expression "${expression}" did not produce expandable variables.`,
            preview: evalResponse?.result ?? null
        };
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

    async function streamWithFilter(filter, totalHint) {
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
    }

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

    return {
        success: true,
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
    };
};
