/**
 * CoreCLR List Variables - Dynamic script for testing C# variable operations
 *
 * Phase 2: Dynamic Script Development
 *
 * Purpose: Rapidly prototype and test CoreCLR (C#) debug adapter behavior
 * before baking into extension. This script mimics what CoreClrDebugAdapter
 * will do, allowing quick iteration without rebuilds.
 *
 * Key Differences from pwa-node (JavaScript):
 * - NO Object.is() cycle detection (C# doesn't support)
 * - Rely solely on variablesReference tracking
 * - Conservative property evaluation (respect expensive flag)
 * - Handle vsdbg-specific features (Object IDs, presentationHint)
 *
 * Usage:
 *   1. Start C# debug session and pause at breakpoint
 *   2. Run: vscb script run -f scripts/sample/dynamic/coreclr-list-variables.js --param scope=local
 *   3. Observe logs to understand vsdbg behavior
 *   4. Iterate on implementation
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const session = vscode.debug.activeDebugSession;

    // ============================================================
    // LOGGING HELPER
    // ============================================================
    const log = (...args) => {
        const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        console.log(`[CORECLR-LIST] ${message}`);
    };

    log('='.repeat(60));
    log('CoreCLR List Variables - Dynamic Script');
    log('='.repeat(60));

    // ============================================================
    // PARAMETER VALIDATION
    // ============================================================
    const maxDepth = params?.maxDepth ?? 2;
    const maxChildren = params?.maxChildren ?? 50;
    const includeExpensive = params?.includeExpensive ?? false;
    const scope = params?.scope ?? 'local'; // 'local' | 'all'

    log('Parameters:', { maxDepth, maxChildren, includeExpensive, scope });

    // ============================================================
    // SESSION DETECTION & VALIDATION
    // ============================================================
    if (!session) {
        log('ERROR: No active debug session');
        return {
            success: false,
            error: 'No active debug session',
            hint: 'Start C# debugging and pause at a breakpoint'
        };
    }

    log(`Session ID: ${session.id}`);
    log(`Session Type: ${session.type}`);
    log(`Session Name: ${session.name}`);

    // Verify this is a C# session
    if (session.type !== 'coreclr') {
        log(`WARNING: Session type is '${session.type}', expected 'coreclr'`);
        log('This script is designed for C# debugging');
    }

    // ============================================================
    // CHECK IF PAUSED & FIND CORRECT THREAD
    // ============================================================
    let threadId;
    try {
        log('Checking if debugger is paused...');
        const threadsResponse = await session.customRequest('threads');
        log('Threads response:', threadsResponse);

        if (!threadsResponse.threads || threadsResponse.threads.length === 0) {
            log('ERROR: No threads available');
            return {
                success: false,
                error: 'No threads available',
                hint: 'Debugger may not be paused'
            };
        }

        // C#-SPECIFIC: Find the thread with actual stack frames (not [External Code])
        // In C#, multiple threads are paused but only one has the breakpoint
        log(`Searching ${threadsResponse.threads.length} threads for actual code...`);
        let foundThread = null;

        for (const thread of threadsResponse.threads) {
            try {
                const stackResponse = await session.customRequest('stackTrace', {
                    threadId: thread.id,
                    startFrame: 0,
                    levels: 1
                });

                if (stackResponse.stackFrames && stackResponse.stackFrames.length > 0) {
                    const frame = stackResponse.stackFrames[0];
                    // Check if this is actual code (not [External Code])
                    if (frame.source && frame.source.path && frame.line > 0) {
                        foundThread = thread;
                        threadId = thread.id;
                        log(`✓ Found paused thread: ${thread.id} (${thread.name})`);
                        log(`  Location: ${frame.source.path}:${frame.line} in ${frame.name}`);
                        break;
                    } else {
                        log(`  Thread ${thread.id} (${thread.name}): [External Code]`);
                    }
                }
            } catch (error) {
                // Thread not paused or no stack, continue checking
                log(`  Thread ${thread.id} (${thread.name}): No stack (${error.message})`);
                continue;
            }
        }

        if (!foundThread) {
            // Fallback to first thread if no "real" code found
            threadId = threadsResponse.threads[0].id;
            log(`⚠ No thread with source code found, using thread ${threadId}`);
        }
    } catch (error) {
        log('ERROR: Failed to get threads:', error.message);
        return {
            success: false,
            error: 'Debugger not paused',
            detail: error.message,
            hint: 'Pause at a breakpoint before querying variables'
        };
    }

    // ============================================================
    // GET STACK TRACE
    // ============================================================
    let frameId;
    let currentLocation;

    try {
        log('Getting stack trace...');
        const stackResponse = await session.customRequest('stackTrace', {
            threadId: threadId,
            startFrame: 0,
            levels: 1  // Only need top frame
        });
        log('Stack response:', stackResponse);

        if (!stackResponse.stackFrames || stackResponse.stackFrames.length === 0) {
            log('ERROR: No stack frames available');
            return {
                success: false,
                error: 'No stack frames available'
            };
        }

        frameId = stackResponse.stackFrames[0].id;
        currentLocation = stackResponse.stackFrames[0];
        log(`✓ Top frame: ${currentLocation.name}`);
        log(`  Location: ${currentLocation.source?.path}:${currentLocation.line}`);
    } catch (error) {
        log('ERROR: Failed to get stack trace:', error.message);
        return {
            success: false,
            error: 'Failed to retrieve stack trace',
            detail: error.message
        };
    }

    // ============================================================
    // GET SCOPES
    // ============================================================
    let scopes = [];

    try {
        log(`Getting scopes for frame ${frameId}...`);
        const scopesResponse = await session.customRequest('scopes', {
            frameId: frameId
        });
        log('Scopes response:', scopesResponse);

        scopes = scopesResponse.scopes || [];
        log(`✓ Found ${scopes.length} scopes:`);
        scopes.forEach(s => {
            log(`  - ${s.name} (ref: ${s.variablesReference}, expensive: ${s.expensive || false})`);
        });
    } catch (error) {
        log('ERROR: Failed to get scopes:', error.message);
        return {
            success: false,
            error: 'Failed to retrieve scopes',
            detail: error.message
        };
    }

    // ============================================================
    // FILTER SCOPES (C#-SPECIFIC: Respect expensive flag)
    // ============================================================
    const scopesToProcess = scopes.filter(s => {
        // Skip expensive scopes unless explicitly requested
        if (s.expensive && !includeExpensive) {
            log(`[SKIP] Expensive scope: ${s.name}`);
            return false;
        }

        // Filter by scope parameter
        if (scope === 'local') {
            const isLocal = s.name.toLowerCase().includes('local');
            if (!isLocal) {
                log(`[SKIP] Non-local scope: ${s.name}`);
            }
            return isLocal;
        }

        return true;
    });

    log(`Processing ${scopesToProcess.length}/${scopes.length} scopes after filtering`);

    // ============================================================
    // CYCLE DETECTION (C#-SPECIFIC: NO Object.is())
    // ============================================================
    // For C#, we rely ONLY on variablesReference tracking
    // JavaScript's Object.is() doesn't work in C#
    const visited = new Set();

    /**
     * Recursively expand a variable
     * C#-SPECIFIC: Uses variablesReference-only cycle detection
     */
    async function expandVariable(variable, currentDepth, path = []) {
        const varPath = [...path, variable.name].join('.');

        // Check depth limit
        if (currentDepth >= maxDepth) {
            log(`[DEPTH LIMIT] ${varPath} at depth ${currentDepth}`);
            return {
                ...variable,
                truncated: true,
                truncatedReason: 'maxDepth',
                expandable: variable.variablesReference > 0
            };
        }

        // Leaf node (no children)
        if (variable.variablesReference === 0) {
            return variable;
        }

        // CYCLE DETECTION (C#-SPECIFIC: variablesReference only)
        if (visited.has(variable.variablesReference)) {
            log(`[CYCLE] Detected at variablesReference ${variable.variablesReference}: ${varPath}`);
            return {
                ...variable,
                cycle: true,
                value: '[Circular Reference]',
                originalValue: variable.value,
                cycleVia: 'variablesReference'
            };
        }

        // Add to visited set
        visited.add(variable.variablesReference);

        // Expand children
        try {
            log(`[EXPAND] ${varPath} (ref: ${variable.variablesReference}, depth: ${currentDepth})`);

            const childrenResponse = await session.customRequest('variables', {
                variablesReference: variable.variablesReference,
                count: maxChildren
            });

            log(`[EXPAND] Got ${childrenResponse.variables?.length || 0} children for ${varPath}`);

            // C#-SPECIFIC: Log presentationHint if present (vsdbg feature)
            if (variable.presentationHint) {
                log(`[VSDBG] presentationHint for ${varPath}:`, variable.presentationHint);
            }

            const allChildren = childrenResponse.variables || [];
            const childrenToExpand = allChildren.slice(0, maxChildren);

            // Recursively expand children
            const expandedChildren = [];
            for (const child of childrenToExpand) {
                const expanded = await expandVariable(child, currentDepth + 1, [...path, variable.name]);
                expandedChildren.push(expanded);
            }

            return {
                ...variable,
                children: expandedChildren,
                childrenShown: childrenToExpand.length,
                totalChildren: variable.namedVariables || variable.indexedVariables || allChildren.length,
                childrenTruncated: allChildren.length > maxChildren
            };
        } catch (error) {
            log(`[ERROR] Failed to expand ${varPath}:`, error.message);
            return {
                ...variable,
                error: error.message,
                expandable: true
            };
        }
    }

    // ============================================================
    // PROCESS EACH SCOPE
    // ============================================================
    const tree = [];
    const stats = {
        totalNodes: 0,
        maxDepthReached: 0,
        cyclesDetected: 0,
        scopesProcessed: 0,
        truncatedNodes: 0,
        expensiveScopesSkipped: scopes.length - scopesToProcess.length,
        adapterType: session.type,
        vsdbgFeatures: {
            presentationHintsFound: 0,
            objectIdsFound: 0
        }
    };

    for (const scopeObj of scopesToProcess) {
        if (scopeObj.variablesReference === 0) {
            log(`[SKIP] Scope ${scopeObj.name} has no variables`);
            continue;
        }

        try {
            log(`[SCOPE] Processing ${scopeObj.name} (ref: ${scopeObj.variablesReference})...`);

            const varsResponse = await session.customRequest('variables', {
                variablesReference: scopeObj.variablesReference,
                count: 200  // Request up to 200 top-level variables
            });

            const variables = varsResponse.variables || [];
            log(`[SCOPE] ${scopeObj.name} has ${variables.length} top-level variables`);

            // Log first few variables for inspection
            if (variables.length > 0) {
                log(`[SAMPLE] First variable in ${scopeObj.name}:`, variables[0]);
            }

            // Expand each variable
            const expandedVariables = [];
            for (const variable of variables) {
                const expanded = await expandVariable(variable, 1, []);
                expandedVariables.push(expanded);

                // Track vsdbg-specific features
                if (variable.presentationHint) {
                    stats.vsdbgFeatures.presentationHintsFound++;
                }
                // Check for Object IDs in presentationHint
                if (variable.presentationHint?.attributes?.includes('rawString')) {
                    stats.vsdbgFeatures.objectIdsFound++;
                }
            }

            const scopeNode = {
                name: scopeObj.name,
                expensive: scopeObj.expensive || false,
                variablesReference: scopeObj.variablesReference,
                namedVariables: scopeObj.namedVariables,
                indexedVariables: scopeObj.indexedVariables,
                variables: expandedVariables
            };

            tree.push(scopeNode);
            stats.scopesProcessed++;
        } catch (error) {
            log(`[ERROR] Failed to process scope ${scopeObj.name}:`, error.message);
            tree.push({
                name: scopeObj.name,
                error: error.message,
                variablesReference: scopeObj.variablesReference
            });
        }
    }

    // ============================================================
    // CALCULATE STATS
    // ============================================================
    function calculateStats(node, depth) {
        stats.totalNodes++;
        stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);

        if (node.cycle) stats.cyclesDetected++;
        if (node.truncated) stats.truncatedNodes++;

        if (node.children) {
            for (const child of node.children) {
                calculateStats(child, depth + 1);
            }
        }
    }

    for (const scopeObj of tree) {
        if (scopeObj.variables) {
            for (const variable of scopeObj.variables) {
                calculateStats(variable, 1);
            }
        }
    }

    log('='.repeat(60));
    log('FINAL STATS:', stats);
    log('='.repeat(60));

    // ============================================================
    // RETURN RESULT
    // ============================================================
    return {
        success: true,
        tree: {
            scopes: tree
        },
        stats: stats,
        metadata: {
            sessionId: session.id,
            sessionType: session.type,
            sessionName: session.name,
            frameId: frameId,
            threadId: threadId,
            currentLocation: {
                file: currentLocation.source?.path,
                line: currentLocation.line,
                function: currentLocation.name
            },
            parameters: {
                maxDepth,
                maxChildren,
                includeExpensive,
                scope
            },
            note: 'C#-specific: Uses variablesReference-only cycle detection (no Object.is())'
        }
    };
};
