/**
 * set-variable.js - Variable modification during debug sessions (Phase 3)
 *
 * Purpose: Modify variable values during debugging using DAP setVariable and evaluate
 *
 * Usage:
 *   # Modify a local variable using setVariable
 *   vscb script run -f set-variable.js --param variablesReference=1 --param name=x --param value=42
 *
 *   # Modify object property using evaluate expression
 *   vscb script run -f set-variable.js --param expression="obj.prop = 'new value'" --param frameId=0
 *
 * Parameters:
 *   - variablesReference (number): Scope or parent variablesReference containing the variable
 *   - name (string): Variable name to modify (for local variables)
 *   - value (any): New value to set
 *   - expression (string): Expression to evaluate for complex modifications (alternative to name/value)
 *   - frameId (number, optional): Frame ID for evaluate context (defaults to topmost frame)
 *
 * Returns:
 *   {
 *     success: boolean,
 *     method: 'setVariable' | 'evaluate',
 *     oldValue: string,
 *     newValue: string,
 *     type: string,
 *     variable: { name, value, type, variablesReference }
 *   }
 *
 * Error Codes:
 *   - E_NO_SESSION: No active debug session
 *   - E_NOT_STOPPED: Debugger is not stopped at a breakpoint
 *   - E_INVALID_PARAMS: Missing or invalid parameters
 *   - E_UNSUPPORTED: Modification not supported by adapter
 *   - E_MODIFICATION_FAILED: DAP request failed
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;

    // Validate we have an active debug session
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        return {
            success: false,
            error: 'E_NO_SESSION',
            message: 'No active debug session. Start debugging first.'
        };
    }

    // Get the stopped thread and validate we're actually stopped
    let stoppedThreadId = null;
    try {
        const threadsResponse = await session.customRequest('threads');
        if (threadsResponse?.threads?.length > 0) {
            stoppedThreadId = threadsResponse.threads[0].id;
        }

        // Verify we're actually stopped by trying to get stack trace
        const stackResponse = await session.customRequest('stackTrace', {
            threadId: stoppedThreadId,
            startFrame: 0,
            levels: 1
        });

        if (!stackResponse?.stackFrames?.length) {
            return {
                success: false,
                error: 'E_NOT_STOPPED',
                message: 'Debugger is not stopped at a breakpoint. Pause execution first.'
            };
        }
    } catch (error) {
        if (error.message?.includes('notStopped') || error.message?.includes('not stopped')) {
            return {
                success: false,
                error: 'E_NOT_STOPPED',
                message: 'Debugger is not stopped at a breakpoint. Pause execution first.',
                details: error.message
            };
        }
        throw error;
    }

    // Determine modification method: setVariable or evaluate
    const useEvaluate = params?.expression !== undefined;
    const useSetVariable = params?.name !== undefined;

    if (!useEvaluate && !useSetVariable) {
        return {
            success: false,
            error: 'E_INVALID_PARAMS',
            message: 'Must provide either "name" + "value" for setVariable, or "expression" for evaluate',
            examples: {
                setVariable: '--param variablesReference=1 --param name=x --param value=42',
                evaluate: '--param expression="obj.prop = \'new value\'" --param frameId=0'
            }
        };
    }

    // Method 1: setVariable for local variables
    if (useSetVariable) {
        const { variablesReference, name, value } = params;

        if (variablesReference === undefined || !name || value === undefined) {
            return {
                success: false,
                error: 'E_INVALID_PARAMS',
                message: 'setVariable requires: variablesReference, name, and value',
                received: { variablesReference, name, value }
            };
        }

        try {
            // First, get the old value for reference
            const varsResponse = await session.customRequest('variables', {
                variablesReference: variablesReference
            });

            const oldVariable = varsResponse.variables?.find(v => v.name === name);
            const oldValue = oldVariable?.value || 'unknown';
            const oldType = oldVariable?.type || 'unknown';

            // Attempt setVariable
            const setResponse = await session.customRequest('setVariable', {
                variablesReference: variablesReference,
                name: name,
                value: String(value)  // DAP requires string format
            });

            return {
                success: true,
                method: 'setVariable',
                oldValue: oldValue,
                newValue: setResponse.value,
                type: setResponse.type || oldType,
                variable: {
                    name: name,
                    value: setResponse.value,
                    type: setResponse.type,
                    variablesReference: setResponse.variablesReference
                },
                metadata: {
                    sessionId: session.id,
                    sessionType: session.type,
                    adapterType: session.type
                }
            };

        } catch (error) {
            // Check if adapter doesn't support setVariable
            if (error.message?.includes('setVariable') &&
                (error.message?.includes('not supported') || error.message?.includes('unrecognized'))) {
                return {
                    success: false,
                    error: 'E_UNSUPPORTED',
                    message: `Adapter '${session.type}' does not support setVariable for this variable`,
                    hint: 'Try using evaluate expression instead: --param expression="varName = newValue"',
                    details: error.message
                };
            }

            return {
                success: false,
                error: 'E_MODIFICATION_FAILED',
                message: 'Failed to modify variable via setVariable',
                details: error.message,
                attempted: { variablesReference, name, value }
            };
        }
    }

    // Method 2: evaluate for complex expressions (object properties, array elements)
    if (useEvaluate) {
        const { expression, frameId } = params;

        if (!expression) {
            return {
                success: false,
                error: 'E_INVALID_PARAMS',
                message: 'evaluate requires: expression',
                example: '--param expression="obj.prop = \'new value\'"'
            };
        }

        try {
            // Get frameId if not provided
            let targetFrameId = frameId;
            if (targetFrameId === undefined) {
                const stackResponse = await session.customRequest('stackTrace', {
                    threadId: stoppedThreadId,
                    startFrame: 0,
                    levels: 1
                });
                targetFrameId = stackResponse.stackFrames[0]?.id || 0;
            }

            // Evaluate the expression
            // Note: This may have side effects! Using 'repl' context when possible
            const evalResponse = await session.customRequest('evaluate', {
                expression: expression,
                frameId: targetFrameId,
                context: 'repl'  // Use repl context for side effects
            });

            return {
                success: true,
                method: 'evaluate',
                expression: expression,
                result: evalResponse.result,
                type: evalResponse.type,
                variablesReference: evalResponse.variablesReference || 0,
                warning: 'Expression evaluation may have side effects',
                metadata: {
                    sessionId: session.id,
                    sessionType: session.type,
                    frameId: targetFrameId,
                    context: 'repl'
                }
            };

        } catch (error) {
            // Check for adapter-specific limitations
            if (error.message?.includes('Cannot set property') ||
                error.message?.includes('read-only') ||
                error.message?.includes('const')) {
                return {
                    success: false,
                    error: 'E_UNSUPPORTED',
                    message: 'Cannot modify this property (read-only, const, or frozen)',
                    details: error.message,
                    expression: expression
                };
            }

            return {
                success: false,
                error: 'E_MODIFICATION_FAILED',
                message: 'Failed to evaluate expression',
                details: error.message,
                expression: expression
            };
        }
    }

    // Should never reach here
    return {
        success: false,
        error: 'E_UNKNOWN',
        message: 'Unexpected code path'
    };
};
