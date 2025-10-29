/**
 * Investigate Variable Expansion Failures
 *
 * This script investigates why debug.get-variable failed during Phase 3 testing
 * for Java Debug Adapter. It attempts to expand variables and provides detailed
 * logging to understand the failure points.
 *
 * During Phase 3 testing, we observed:
 * - debug.list-variables worked correctly (9 variables listed)
 * - debug.get-variable failed with "Script execution failed" errors
 * - Variables to expand: list (ref 23), map (24), p (25), r (26), pipeline (27)
 *
 * Usage:
 *   # Start debug session and pause at breakpoint first
 *   vscb script run -f ./scripts/sample/dynamic/investigate-variable-expansion.js
 *
 *   # Or test specific variablesReference
 *   vscb script run -f ./scripts/sample/dynamic/investigate-variable-expansion.js --param variablesReference=23
 *
 * @version 1.0.0
 * @author AI Agent
 * @date 2025-10-08
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;

    console.log('[INVESTIGATE] Starting variable expansion investigation...');
    console.log('[INVESTIGATE] Script version: 1.0.0');

    // Step 1: Validate active debug session
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        console.log('[INVESTIGATE] ❌ No active debug session');
        return {
            success: false,
            error: 'E_NO_SESSION',
            message: 'No active debug session',
            hint: 'Start debugging and pause at a breakpoint first'
        };
    }

    console.log('[INVESTIGATE] ✓ Active session found:', {
        id: session.id,
        name: session.name,
        type: session.type
    });

    // Step 2: Verify session is paused
    console.log('[INVESTIGATE] Checking threads...');
    let threadsResponse;
    try {
        threadsResponse = await session.customRequest('threads');
        console.log('[INVESTIGATE] Threads response:', {
            threadCount: threadsResponse.threads?.length || 0,
            threads: threadsResponse.threads?.map(t => ({ id: t.id, name: t.name }))
        });
    } catch (error) {
        console.log('[INVESTIGATE] ❌ Failed to get threads:', error.message);
        return {
            success: false,
            error: 'E_THREADS_FAILED',
            message: 'Failed to get threads',
            detail: error.message
        };
    }

    if (!threadsResponse.threads || threadsResponse.threads.length === 0) {
        console.log('[INVESTIGATE] ❌ No threads (session not paused?)');
        return {
            success: false,
            error: 'E_NOT_PAUSED',
            message: 'No threads available - debugger may not be paused',
            hint: 'Ensure execution is paused at a breakpoint'
        };
    }

    // Step 3: Get stack frames for first thread
    const threadId = threadsResponse.threads[0].id;
    console.log('[INVESTIGATE] Getting stack frames for thread', threadId);

    let stackResponse;
    try {
        stackResponse = await session.customRequest('stackTrace', {
            threadId: threadId,
            startFrame: 0,
            levels: 1
        });
        console.log('[INVESTIGATE] Stack response:', {
            totalFrames: stackResponse.totalFrames,
            frameCount: stackResponse.stackFrames?.length || 0,
            topFrame: stackResponse.stackFrames?.[0] ? {
                id: stackResponse.stackFrames[0].id,
                name: stackResponse.stackFrames[0].name,
                line: stackResponse.stackFrames[0].line
            } : null
        });
    } catch (error) {
        console.log('[INVESTIGATE] ❌ Failed to get stack frames:', error.message);
        return {
            success: false,
            error: 'E_STACK_FAILED',
            message: 'Failed to get stack frames',
            detail: error.message
        };
    }

    if (!stackResponse.stackFrames || stackResponse.stackFrames.length === 0) {
        console.log('[INVESTIGATE] ❌ No stack frames available');
        return {
            success: false,
            error: 'E_NO_FRAMES',
            message: 'No stack frames available'
        };
    }

    const frameId = stackResponse.stackFrames[0].id;
    console.log('[INVESTIGATE] ✓ Using frameId:', frameId);

    // Step 4: Get scopes
    console.log('[INVESTIGATE] Getting scopes for frameId', frameId);
    let scopesResponse;
    try {
        scopesResponse = await session.customRequest('scopes', {
            frameId: frameId
        });
        console.log('[INVESTIGATE] Scopes response:', {
            scopeCount: scopesResponse.scopes?.length || 0,
            scopes: scopesResponse.scopes?.map(s => ({
                name: s.name,
                variablesReference: s.variablesReference,
                expensive: s.expensive
            }))
        });
    } catch (error) {
        console.log('[INVESTIGATE] ❌ Failed to get scopes:', error.message);
        return {
            success: false,
            error: 'E_SCOPES_FAILED',
            message: 'Failed to get scopes',
            detail: error.message,
            stack: error.stack
        };
    }

    if (!scopesResponse.scopes || scopesResponse.scopes.length === 0) {
        console.log('[INVESTIGATE] ❌ No scopes available');
        return {
            success: false,
            error: 'E_NO_SCOPES',
            message: 'No scopes available'
        };
    }

    // Step 5: Get variables from first scope (usually Local)
    const localScope = scopesResponse.scopes[0];
    console.log('[INVESTIGATE] Getting variables from scope:', localScope.name);

    let variablesResponse;
    try {
        variablesResponse = await session.customRequest('variables', {
            variablesReference: localScope.variablesReference
        });
        console.log('[INVESTIGATE] Variables response:', {
            variableCount: variablesResponse.variables?.length || 0,
            variables: variablesResponse.variables?.map(v => ({
                name: v.name,
                value: v.value,
                type: v.type,
                variablesReference: v.variablesReference,
                namedVariables: v.namedVariables,
                indexedVariables: v.indexedVariables
            }))
        });
    } catch (error) {
        console.log('[INVESTIGATE] ❌ Failed to get variables:', error.message);
        return {
            success: false,
            error: 'E_VARIABLES_FAILED',
            message: 'Failed to get variables',
            detail: error.message,
            stack: error.stack
        };
    }

    // Step 6: Attempt to expand expandable variables
    const expandableVars = variablesResponse.variables.filter(v => v.variablesReference > 0);
    console.log('[INVESTIGATE] Found', expandableVars.length, 'expandable variables');

    const expansionResults = [];

    // If specific variablesReference provided, test only that one
    const targetRef = params?.variablesReference ? parseInt(params.variablesReference) : null;

    for (const variable of expandableVars) {
        // Skip if testing specific reference and this isn't it
        if (targetRef && variable.variablesReference !== targetRef) {
            continue;
        }

        console.log('[INVESTIGATE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('[INVESTIGATE] Attempting to expand:', {
            name: variable.name,
            type: variable.type,
            value: variable.value,
            variablesReference: variable.variablesReference,
            namedVariables: variable.namedVariables,
            indexedVariables: variable.indexedVariables
        });

        try {
            const childrenResponse = await session.customRequest('variables', {
                variablesReference: variable.variablesReference,
                start: 0,
                count: variable.indexedVariables || 100
            });

            console.log('[INVESTIGATE] ✓ SUCCESS! Got', childrenResponse.variables?.length || 0, 'children');
            console.log('[INVESTIGATE] Children:', childrenResponse.variables?.map(c => ({
                name: c.name,
                value: c.value,
                type: c.type
            })));

            expansionResults.push({
                variable: variable.name,
                variablesReference: variable.variablesReference,
                success: true,
                childCount: childrenResponse.variables?.length || 0,
                children: childrenResponse.variables
            });

        } catch (error) {
            console.log('[INVESTIGATE] ❌ FAILED to expand:', error.message);
            console.log('[INVESTIGATE] Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });

            expansionResults.push({
                variable: variable.name,
                variablesReference: variable.variablesReference,
                success: false,
                error: error.message,
                errorName: error.name,
                errorStack: error.stack
            });
        }
    }

    console.log('[INVESTIGATE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[INVESTIGATE] Investigation complete!');
    console.log('[INVESTIGATE] Summary:', {
        totalExpandable: expandableVars.length,
        tested: expansionResults.length,
        successful: expansionResults.filter(r => r.success).length,
        failed: expansionResults.filter(r => !r.success).length
    });

    return {
        success: true,
        sessionInfo: {
            sessionId: session.id,
            sessionType: session.type,
            sessionName: session.name
        },
        threadInfo: {
            threadId: threadId,
            threadCount: threadsResponse.threads.length
        },
        frameInfo: {
            frameId: frameId,
            totalFrames: stackResponse.totalFrames
        },
        scopeInfo: {
            scopeCount: scopesResponse.scopes.length,
            scopes: scopesResponse.scopes.map(s => ({
                name: s.name,
                variablesReference: s.variablesReference
            }))
        },
        variableInfo: {
            totalVariables: variablesResponse.variables.length,
            expandableVariables: expandableVars.length,
            expandableList: expandableVars.map(v => ({
                name: v.name,
                type: v.type,
                variablesReference: v.variablesReference
            }))
        },
        expansionResults: expansionResults,
        summary: {
            totalExpandable: expandableVars.length,
            tested: expansionResults.length,
            successful: expansionResults.filter(r => r.success).length,
            failed: expansionResults.filter(r => !r.success).length
        }
    };
};
