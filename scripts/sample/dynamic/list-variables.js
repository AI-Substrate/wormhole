/**
 * List Variables - Core variable retrieval with depth limiting and cycle detection
 *
 * Phase 1 Implementation
 *
 * Implements the complete DAP chain: stackTrace → scopes → variables
 * with depth-limited traversal, cycle detection, and budget management.
 *
 * Critical Discoveries Applied:
 * - Discovery 02: Variable references only valid while paused
 * - Discovery 03: Use heuristic page sizes, not fixed limits
 * - Discovery 04: Cycle detection essential for safety
 * - Discovery 06: Respect scope.expensive flag
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const session = vscode.debug.activeDebugSession;

    // ============================================================
    // PARAMETER VALIDATION
    // ============================================================
    const maxDepth = params?.maxDepth ?? 2;
    const maxChildren = params?.maxChildren ?? 50;
    const includeExpensive = params?.includeExpensive ?? false;
    const scopeFilter = params?.scopeFilter ?? 'all'; // 'all' | 'local' | 'closure' | 'global'

    console.log('[LIST-VARS] Parameters:', {
        maxDepth,
        maxChildren,
        includeExpensive,
        scopeFilter
    });

    // ============================================================
    // T003: SESSION DETECTION & VALIDATION
    // ============================================================
    if (!session) {
        return {
            success: false,
            error: "No active debug session",
            hint: "Start debugging and pause at a breakpoint"
        };
    }

    // Check if paused using threads request (reuse Phase 0b pattern)
    let threadId;
    try {
        console.log('[LIST-VARS] Checking pause state...');
        const threadsResponse = await session.customRequest('threads');

        if (!threadsResponse.threads || threadsResponse.threads.length === 0) {
            return {
                success: false,
                error: "No threads available",
                sessionId: session.id
            };
        }

        threadId = threadsResponse.threads[0].id;
        console.log(`[LIST-VARS] Paused on thread ${threadId}`);
    } catch (error) {
        return {
            success: false,
            error: "Debugger not paused",
            detail: error.message,
            hint: "Pause at a breakpoint before querying variables"
        };
    }

    // ============================================================
    // T004: SCOPES RETRIEVAL (using debug-status pattern)
    // ============================================================
    let frameId;
    let scopes = [];

    try {
        console.log('[LIST-VARS] Getting stack trace...');
        const stackResponse = await session.customRequest('stackTrace', {
            threadId: threadId,
            startFrame: 0,
            levels: 1  // Only need top frame for variable queries
        });

        if (!stackResponse.stackFrames || stackResponse.stackFrames.length === 0) {
            return {
                success: false,
                error: "No stack frames available"
            };
        }

        frameId = stackResponse.stackFrames[0].id;
        const currentLocation = stackResponse.stackFrames[0];
        console.log(`[LIST-VARS] Top frame: ${currentLocation.name} at ${currentLocation.source?.path}:${currentLocation.line}`);

        console.log(`[LIST-VARS] Getting scopes for frame ${frameId}...`);
        const scopesResponse = await session.customRequest('scopes', {
            frameId: frameId
        });

        scopes = scopesResponse.scopes || [];
        console.log(`[LIST-VARS] Found ${scopes.length} scopes:`, scopes.map(s => `${s.name} (expensive: ${s.expensive})`));
    } catch (error) {
        return {
            success: false,
            error: "Failed to retrieve scopes",
            detail: error.message
        };
    }

    // ============================================================
    // T005: EXPENSIVE SCOPE FILTERING (Critical Discovery 06)
    // ============================================================
    const scopesToProcess = scopes.filter(scope => {
        // Check expensive flag (Critical Discovery 06)
        if (scope.expensive && !includeExpensive) {
            console.log(`[SKIP] Expensive scope: ${scope.name}`);
            return false;
        }

        // Apply scope filter
        if (scopeFilter !== 'all') {
            const scopeName = scope.name.toLowerCase();
            if (scopeFilter === 'local' && !scopeName.includes('local')) {
                console.log(`[SKIP] Non-local scope: ${scope.name}`);
                return false;
            }
            if (scopeFilter === 'closure' && !scopeName.includes('closure')) {
                console.log(`[SKIP] Non-closure scope: ${scope.name}`);
                return false;
            }
            if (scopeFilter === 'global' && !scopeName.includes('global')) {
                console.log(`[SKIP] Non-global scope: ${scope.name}`);
                return false;
            }
        }

        return true;
    });

    console.log(`[LIST-VARS] Processing ${scopesToProcess.length}/${scopes.length} scopes after filtering`);

    // ============================================================
    // T007 + T008: RECURSIVE TRAVERSAL WITH CYCLE DETECTION
    // ============================================================

    // Global visited set for cycle detection (Critical Discovery 04)
    const visited = new Set();

    /**
     * Recursively expand a variable with depth limiting and cycle detection
     *
     * @param {object} variable - Variable to expand
     * @param {number} currentDepth - Current depth in tree
     * @param {Array} ancestors - Array of ancestor variables for cycle detection
     * @returns {object} Expanded variable with children or cycle marker
     */
    async function expandVariable(variable, currentDepth, ancestors = []) {
        // T007: Check depth limit
        if (currentDepth >= maxDepth) {
            return {
                ...variable,
                truncated: true,
                truncatedReason: 'maxDepth',
                expandable: variable.variablesReference > 0
            };
        }

        // Leaf node (no children to expand)
        if (variable.variablesReference === 0) {
            return variable;
        }

        // T008: CYCLE DETECTION (Critical Discovery 04 & 09)
        // Strategy 1: Check variablesReference (works for Python/debugpy)
        if (visited.has(variable.variablesReference)) {
            console.log(`[CYCLE-REF] Detected at variablesReference ${variable.variablesReference}: ${variable.name}`);
            return {
                ...variable,
                cycle: true,
                value: '[Circular Reference]',
                originalValue: variable.value,
                cycleVia: 'variablesReference'
            };
        }

        // Strategy 2: For JavaScript (pwa-node), use Object.is() equality checks
        // Critical Discovery 09: pwa-node generates new references for same objects
        if (session.type === 'pwa-node' && variable.evaluateName) {
            // Only check against last 4 ancestors to limit performance impact
            const recentAncestors = ancestors.slice(-4);

            for (const ancestor of recentAncestors) {
                if (!ancestor.evaluateName) continue;

                try {
                    const expr = `Object.is(${variable.evaluateName}, ${ancestor.evaluateName})`;
                    console.log(`[CYCLE-CHECK] Testing: ${expr}`);

                    const evalResponse = await session.customRequest('evaluate', {
                        expression: expr,
                        frameId: frameId,
                        context: 'hover'  // Side-effect free if supported
                    });

                    if (evalResponse.result === 'true') {
                        console.log(`[CYCLE-JS] Object.is() detected cycle: ${variable.name} === ${ancestor.name}`);
                        return {
                            ...variable,
                            cycle: true,
                            value: '[Circular Reference]',
                            originalValue: variable.value,
                            cycleVia: 'Object.is',
                            cycleTarget: ancestor.evaluateName
                        };
                    }
                } catch (error) {
                    // Evaluation failed, continue checking
                    console.log(`[CYCLE-CHECK] Evaluation failed: ${error.message}`);
                }
            }
        }

        // Add to visited set (fallback for adapters that reuse references)
        visited.add(variable.variablesReference);

        // T006 + T009: Expand children with budget
        try {
            console.log(`[EXPAND] ${variable.name} (ref: ${variable.variablesReference}, depth: ${currentDepth})`);

            const childrenResponse = await session.customRequest('variables', {
                variablesReference: variable.variablesReference,
                // T009: Use heuristic page size (Critical Discovery 03)
                count: maxChildren  // Limit children per request
            });

            const allChildren = childrenResponse.variables || [];
            const childrenToExpand = allChildren.slice(0, maxChildren);

            console.log(`[EXPAND] Got ${allChildren.length} children, expanding first ${childrenToExpand.length}`);

            // Recursively expand children
            const expandedChildren = [];
            // Build new ancestors array with current variable
            const newAncestors = [...ancestors, variable];
            for (const child of childrenToExpand) {
                const expanded = await expandVariable(child, currentDepth + 1, newAncestors);
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
            console.error(`[ERROR] Failed to expand ${variable.name}:`, error.message);
            return {
                ...variable,
                error: error.message,
                expandable: true
            };
        }
    }

    // ============================================================
    // T006: VARIABLES REQUEST FOR EACH SCOPE
    // ============================================================
    const tree = [];
    let stats = {
        totalNodes: 0,
        maxDepthReached: 0,
        cyclesDetected: 0,
        cyclesDetectedByReference: 0,  // via variablesReference
        cyclesDetectedByObjectIs: 0,   // via Object.is() (JavaScript)
        scopesProcessed: 0,
        truncatedNodes: 0,
        expensiveScopesSkipped: scopes.length - scopesToProcess.length,
        adapterType: session.type || 'unknown'
    };

    for (const scope of scopesToProcess) {
        if (scope.variablesReference === 0) {
            console.log(`[SKIP] Scope ${scope.name} has no variables`);
            continue;
        }

        try {
            console.log(`[SCOPE] Processing ${scope.name} (ref: ${scope.variablesReference})...`);

            const varsResponse = await session.customRequest('variables', {
                variablesReference: scope.variablesReference,
                // Use heuristic page size (Critical Discovery 03)
                count: 200  // Conservative default for pwa-node
            });

            const variables = varsResponse.variables || [];
            console.log(`[SCOPE] ${scope.name} has ${variables.length} top-level variables`);

            // Expand each variable with depth limiting and cycle detection
            const expandedVariables = [];
            for (const variable of variables) {
                const expanded = await expandVariable(variable, 1, []); // Empty ancestors for top-level
                expandedVariables.push(expanded);
            }

            const scopeNode = {
                name: scope.name,
                expensive: scope.expensive || false,
                variablesReference: scope.variablesReference,
                namedVariables: scope.namedVariables,
                indexedVariables: scope.indexedVariables,
                variables: expandedVariables
            };

            tree.push(scopeNode);
            stats.scopesProcessed++;
        } catch (error) {
            console.error(`[ERROR] Failed to process scope ${scope.name}:`, error.message);
            tree.push({
                name: scope.name,
                error: error.message,
                variablesReference: scope.variablesReference
            });
        }
    }

    // ============================================================
    // T017: CALCULATE STATS
    // ============================================================
    function calculateStats(node, depth) {
        stats.totalNodes++;
        stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);

        if (node.cycle) {
            stats.cyclesDetected++;
            // Track which method detected the cycle
            if (node.cycleVia === 'Object.is') {
                stats.cyclesDetectedByObjectIs++;
            } else if (node.cycleVia === 'variablesReference') {
                stats.cyclesDetectedByReference++;
            }
        }
        if (node.truncated) stats.truncatedNodes++;

        if (node.children) {
            for (const child of node.children) {
                calculateStats(child, depth + 1);
            }
        }
    }

    for (const scope of tree) {
        if (scope.variables) {
            for (const variable of scope.variables) {
                calculateStats(variable, 1);
            }
        }
    }

    console.log('[LIST-VARS] Stats:', stats);

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
            frameId: frameId,
            threadId: threadId,
            parameters: {
                maxDepth,
                maxChildren,
                includeExpensive,
                scopeFilter
            }
        }
    };
};
