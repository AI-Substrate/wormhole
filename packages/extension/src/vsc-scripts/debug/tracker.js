const { z } = require('zod');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript } = require('@script-base');

/**
 * Debug Adapter Protocol (DAP) Tracker
 *
 * Registers a DebugAdapterTrackerFactory to observe all DAP messages.
 * This is critical for:
 * - Capturing capabilities from initialize response
 * - Tracking stopped/continued events
 * - Mapping breakpoint IDs between DAP and VS Code
 * - Understanding the complete DAP message flow
 *
 * IMPORTANT: Run this BEFORE starting a debug session to capture all messages
 */

// Store tracked data globally (survives across script runs in same session)
global.debugTrackerData = global.debugTrackerData || {
    sessions: new Map(),
    capabilities: null,
    lastStopped: null,
    breakpointMappings: new Map()
};

class DebugTrackerScript extends QueryScript {
    constructor() {
        super();
        // No required parameters
        this.paramsSchema = z.object({}).optional();

        this.resultSchema = z.object({
            success: z.boolean(),
            message: z.string()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {object} params
     * @returns {Promise<object>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        console.log("=" + "=".repeat(58) + "=");
        console.log("DAP TRACKER REGISTRATION");
        console.log("=" + "=".repeat(58) + "=");
        console.log("");
        console.log("Registering tracker for all debug adapter types ('*')...");
        console.log("This will capture ALL DAP protocol messages");
        console.log("");

        // Create the tracker factory
        const trackerFactory = {
            createDebugAdapterTracker(session) {
                console.log(`[TRACKER] ✅ Created for session: ${session.id}`);
                console.log(`[TRACKER] Session type: ${session.type}`);
                console.log(`[TRACKER] Session name: ${session.name}`);
                console.log("");

                // Initialize session data
                global.debugTrackerData.sessions.set(session.id, {
                    id: session.id,
                    type: session.type,
                    name: session.name,
                    capabilities: null,
                    isPaused: false,
                    breakpoints: new Map()
                });

                return {
                    // Messages TO the debug adapter
                    onWillReceiveMessage(message) {
                        const sessionData = global.debugTrackerData.sessions.get(session.id);

                        // Log outgoing commands
                        if (message.command) {
                            console.log(`[→ TO ADAPTER] ${message.command}`);

                            // Track setBreakpoints requests for ID mapping
                            if (message.command === 'setBreakpoints' && message.arguments) {
                                const source = message.arguments.source;
                                const breakpoints = message.arguments.breakpoints || [];
                                console.log(`[BREAKPOINTS] Setting ${breakpoints.length} breakpoints in ${source?.path}`);

                                // Store request data for correlation with response
                                sessionData.pendingBreakpointRequest = {
                                    source: source?.path,
                                    breakpoints: breakpoints
                                };
                            }

                            // Log some key requests with details
                            if (message.command === 'threads') {
                                console.log(`[THREADS] Requesting thread list`);
                            }
                            if (message.command === 'stackTrace') {
                                console.log(`[STACK] Requesting stack for thread ${message.arguments?.threadId}`);
                            }
                            if (message.command === 'scopes') {
                                console.log(`[SCOPES] Requesting scopes for frame ${message.arguments?.frameId}`);
                            }
                            if (message.command === 'variables') {
                                console.log(`[VARIABLES] Requesting variables for ref ${message.arguments?.variablesReference}`);
                            }
                        }
                    },

                    // Messages FROM the debug adapter
                    onDidSendMessage(message) {
                        const sessionData = global.debugTrackerData.sessions.get(session.id);

                        // Handle responses
                        if (message.type === 'response') {
                            const status = message.success ? '✓' : '✗';
                            console.log(`[← FROM ADAPTER] Response: ${message.command} ${status}`);

                            // CRITICAL: Capture capabilities from initialize response
                            if (message.command === 'initialize' && message.success && message.body) {
                                global.debugTrackerData.capabilities = message.body;
                                sessionData.capabilities = message.body;

                                console.log(`[CAPABILITIES] Captured! Key features:`);
                                console.log(`  - supportsVariablePaging: ${message.body.supportsVariablePaging}`);
                                console.log(`  - supportsSetVariable: ${message.body.supportsSetVariable}`);
                                console.log(`  - supportsSetExpression: ${message.body.supportsSetExpression}`);
                                console.log(`  - supportsEvaluate: ${message.body.supportsEvaluate}`);
                                console.log(`  - supportsDelayedStackTraceLoading: ${message.body.supportsDelayedStackTraceLoading}`);

                                // Log to output channel for persistence
                                bridgeContext.logger.info('DAP Capabilities captured:', JSON.stringify(message.body, null, 2));
                            }

                            // Map breakpoint IDs from setBreakpoints response
                            if (message.command === 'setBreakpoints' && message.success && message.body) {
                                const breakpoints = message.body.breakpoints || [];
                                const pending = sessionData.pendingBreakpointRequest;

                                console.log(`[BREAKPOINTS] Response: ${breakpoints.length} breakpoints set`);

                                if (pending) {
                                    // Map DAP IDs to VS Code breakpoints
                                    breakpoints.forEach((bp, index) => {
                                        if (bp.id) {
                                            console.log(`  - Breakpoint ID ${bp.id}: line ${bp.line}, verified: ${bp.verified}`);
                                            sessionData.breakpoints.set(bp.id, {
                                                dapId: bp.id,
                                                line: bp.line,
                                                verified: bp.verified,
                                                source: pending.source
                                            });
                                        }
                                    });

                                    // Clear pending request
                                    delete sessionData.pendingBreakpointRequest;
                                }
                            }

                            // Log errors
                            if (!message.success && message.message) {
                                console.log(`  [ERROR] ${message.message}`);
                            }
                        }

                        // Handle events
                        if (message.type === 'event') {
                            console.log(`[← EVENT] ${message.event}`);

                            // CRITICAL: Track stopped event (debugger paused)
                            if (message.event === 'stopped') {
                                sessionData.isPaused = true;
                                global.debugTrackerData.lastStopped = message.body;

                                console.log(`[STOPPED] 🔴 Debugger paused!`);
                                console.log(`  - Reason: ${message.body.reason}`);
                                console.log(`  - Thread ID: ${message.body.threadId}`);
                                console.log(`  - All threads stopped: ${message.body.allThreadsStopped}`);

                                // Check for hit breakpoint IDs
                                if (message.body.hitBreakpointIds && message.body.hitBreakpointIds.length > 0) {
                                    console.log(`  - Hit breakpoint IDs: ${message.body.hitBreakpointIds.join(', ')}`);

                                    // Look up breakpoint info
                                    message.body.hitBreakpointIds.forEach(id => {
                                        const bpInfo = sessionData.breakpoints.get(id);
                                        if (bpInfo) {
                                            console.log(`    - Breakpoint ${id}: ${bpInfo.source}:${bpInfo.line}`);
                                        }
                                    });
                                }

                                bridgeContext.logger.info('Debugger stopped:', JSON.stringify(message.body));
                            }

                            // Track continued event (debugger resumed)
                            if (message.event === 'continued') {
                                sessionData.isPaused = false;

                                console.log(`[CONTINUED] ▶️ Debugger resumed`);
                                console.log(`  - Thread ID: ${message.body?.threadId || 'all'}`);
                                console.log(`  - All threads continued: ${message.body?.allThreadsContinued}`);

                                bridgeContext.logger.info('Debugger continued');
                            }

                            // Track other important events
                            if (message.event === 'initialized') {
                                console.log(`[INITIALIZED] Debug adapter ready`);
                            }
                            if (message.event === 'terminated') {
                                console.log(`[TERMINATED] Debug session ending`);
                                sessionData.isPaused = false;
                            }
                            if (message.event === 'exited') {
                                console.log(`[EXITED] Process exited with code: ${message.body?.exitCode}`);
                            }
                            if (message.event === 'output') {
                                // Don't log output events (too noisy), but note category
                                if (message.body?.category !== 'stdout' && message.body?.category !== 'console') {
                                    console.log(`[OUTPUT] Category: ${message.body?.category}`);
                                }
                            }
                            if (message.event === 'thread') {
                                console.log(`[THREAD] ${message.body?.reason}: Thread ${message.body?.threadId}`);
                            }
                            if (message.event === 'capabilities') {
                                // Mid-session capability update!
                                console.log(`[CAPABILITIES] Mid-session update received`);
                                if (message.body?.capabilities) {
                                    Object.assign(sessionData.capabilities || {}, message.body.capabilities);
                                    console.log(`  Updated capabilities:`, message.body.capabilities);
                                }
                            }
                        }
                    },

                    // Session lifecycle
                    onWillStartSession() {
                        console.log(`[LIFECYCLE] Session ${session.id} starting...`);
                    },

                    onWillStopSession() {
                        console.log(`[LIFECYCLE] Session ${session.id} stopping...`);
                    },

                    onExit(code, signal) {
                        console.log(`[LIFECYCLE] Debug adapter exited: code=${code}, signal=${signal}`);
                        // Clean up session data
                        global.debugTrackerData.sessions.delete(session.id);
                    },

                    onError(error) {
                        console.error(`[ERROR] Debug adapter error:`, error);
                    }
                };
            }
        };

        // Register the tracker factory
        const disposable = vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory);

        // Store disposable for cleanup
        bridgeContext.extensionContext.subscriptions.push(disposable);

        // Return status and any previously captured data
        const result = {
            success: true,
            message: "DAP tracker registered successfully",
            instructions: [
                "1. Tracker is now active and will capture all DAP messages",
                "2. Start a debug session to see messages in console",
                "3. Look for [CAPABILITIES] to see adapter features",
                "4. Look for [STOPPED] when breakpoint is hit",
                "5. Check VS Code Output > VSC-Bridge for persistent logs"
            ],
            previousData: {
                capabilities: global.debugTrackerData.capabilities,
                sessionsTracked: global.debugTrackerData.sessions.size,
                lastStoppedEvent: global.debugTrackerData.lastStopped
            }
        };

        console.log("");
        console.log("✅ Tracker registered and ready!");
        console.log("Start debugging to see DAP messages...");
        console.log("");
        console.log("=" + "=".repeat(58) + "=");

        return result;
    }
}

module.exports = { DebugTrackerScript };
