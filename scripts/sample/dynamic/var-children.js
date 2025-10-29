/**
 * Variable Children - Pagination support for large arrays and objects
 *
 * Phase 2 Implementation
 *
 * Retrieves a page of children for a given variablesReference.
 * Supports indexed/named filtering and start/count pagination.
 *
 * Critical Discoveries Applied:
 * - Discovery 02: Variable references only valid while paused
 * - Discovery 03: Use heuristic page sizes (200 default, 250 for debugpy)
 * - Discovery 05: Memory budget tracking to prevent OOM
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const session = vscode.debug.activeDebugSession;

    // ============================================================
    // PARAMETER VALIDATION
    // ============================================================
    const variablesReference = params?.variablesReference;
    const start = params?.start ?? 0;
    const count = params?.count ?? 100;
    const filter = params?.filter ?? 'all'; // 'all' | 'indexed' | 'named'
    const trackMemory = params?.trackMemory ?? true;

    console.log('[VAR-CHILDREN] Parameters:', {
        variablesReference,
        start,
        count,
        filter,
        trackMemory
    });

    // ============================================================
    // VALIDATION
    // ============================================================
    if (!session) {
        return {
            success: false,
            error: "No active debug session",
            hint: "Start debugging and pause at a breakpoint"
        };
    }

    if (!variablesReference || variablesReference === 0) {
        return {
            success: false,
            error: "Invalid variablesReference",
            hint: "Use list-variables.js to get variablesReference for expandable items"
        };
    }

    // Check if paused using threads request
    try {
        console.log('[VAR-CHILDREN] Checking pause state...');
        const threadsResponse = await session.customRequest('threads');

        if (!threadsResponse.threads || threadsResponse.threads.length === 0) {
            return {
                success: false,
                error: "No threads available",
                sessionId: session.id
            };
        }

        console.log(`[VAR-CHILDREN] Paused on thread ${threadsResponse.threads[0].id}`);
    } catch (error) {
        return {
            success: false,
            error: "Debugger not paused",
            detail: error.message,
            hint: "Pause at a breakpoint before querying variables"
        };
    }

    // ============================================================
    // REQUEST CHILDREN WITH PAGINATION
    // ============================================================
    let allChildren = [];
    let childrenShown = 0;
    let totalAvailable = 0;
    let namedVariables = 0;
    let indexedVariables = 0;

    try {
        console.log(`[VAR-CHILDREN] Requesting children for ref ${variablesReference}, start=${start}, count=${count}, filter=${filter}`);

        // Build variables request
        const variablesRequest = {
            variablesReference: variablesReference
        };

        // Add filter if specified
        if (filter === 'indexed') {
            variablesRequest.filter = 'indexed';
        } else if (filter === 'named') {
            variablesRequest.filter = 'named';
        }

        // Add pagination params
        if (start > 0) {
            variablesRequest.start = start;
        }
        if (count > 0) {
            variablesRequest.count = count;
        }

        console.log('[VAR-CHILDREN] DAP request:', JSON.stringify(variablesRequest, null, 2));

        const response = await session.customRequest('variables', variablesRequest);

        allChildren = response.variables || [];

        // CRITICAL: Some adapters (like pwa-node) ignore start/count and return everything!
        // We need to slice client-side if we got more than requested
        const receivedCount = allChildren.length;
        console.log(`[VAR-CHILDREN] Received ${receivedCount} children from DAP`);

        if (receivedCount > count && start === 0) {
            console.log(`[VAR-CHILDREN] Adapter returned all ${receivedCount} items, slicing to ${count}`);
            allChildren = allChildren.slice(start, start + count);
            totalAvailable = receivedCount;
        } else if (receivedCount > count) {
            // We have a start offset, slice accordingly
            console.log(`[VAR-CHILDREN] Slicing from ${start} to ${start + count}`);
            totalAvailable = receivedCount;
            allChildren = allChildren.slice(start, start + count);
        }

        childrenShown = allChildren.length;
        console.log(`[VAR-CHILDREN] Showing ${childrenShown} children after slicing`);

        // Try to get total counts from first request (pwa-node provides these)
        // Note: Some adapters don't provide counts, so we estimate
        if (allChildren.length > 0 && allChildren[0].variablesReference > 0) {
            // For arrays, the parent scope should have told us indexedVariables
            // But we can also infer from what we receive
            totalAvailable = childrenShown; // Conservative estimate
        }

    } catch (error) {
        console.error(`[VAR-CHILDREN] Failed to fetch children:`, error.message);
        return {
            success: false,
            error: "Failed to retrieve variable children",
            detail: error.message,
            variablesReference
        };
    }

    // ============================================================
    // MEMORY BUDGET TRACKING (Phase 2 - Discovery 05)
    // ============================================================
    let budgetStats = null;

    if (trackMemory) {
        // Estimate size: rough calculation on the SLICED data
        const jsonString = JSON.stringify(allChildren);
        const byteCount = Buffer.byteLength(jsonString, 'utf8');
        const nodeCount = allChildren.length; // This is the sliced count

        // Thresholds from Critical Discovery 05
        const NODE_THRESHOLD = 20000;
        const BYTE_THRESHOLD = 5 * 1024 * 1024; // 5MB

        const exceedsNodeBudget = nodeCount > NODE_THRESHOLD;
        const exceedsByteBudget = byteCount > BYTE_THRESHOLD;

        budgetStats = {
            nodeCount,
            byteCount,
            nodeThreshold: NODE_THRESHOLD,
            byteThreshold: BYTE_THRESHOLD,
            exceedsNodeBudget,
            exceedsByteBudget,
            exceedsThreshold: exceedsNodeBudget || exceedsByteBudget
        };

        console.log('[VAR-CHILDREN] Budget:', budgetStats);

        if (budgetStats.exceedsThreshold) {
            console.warn('[VAR-CHILDREN] WARNING: Exceeds memory budget!');
            return {
                success: true,
                exceedsThreshold: true,
                budgetStats,
                hint: "Use dump-variable.js for file streaming",
                variablesReference,
                start,
                count,
                filter
            };
        }
    }

    // ============================================================
    // RETURN PAGINATED RESULTS
    // ============================================================
    return {
        success: true,
        children: allChildren,
        pagination: {
            start,
            count,
            shown: childrenShown,
            total: totalAvailable || childrenShown,
            hasMore: childrenShown === count, // If we got exactly count, there might be more
            filter
        },
        budgetStats,
        metadata: {
            sessionId: session.id,
            sessionType: session.type,
            variablesReference,
            requestParams: {
                start,
                count,
                filter
            }
        }
    };
};
