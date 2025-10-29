import * as vscode from 'vscode';

/**
 * Options for waiting operations
 */
export interface WaitOptions {
    timeoutMs?: number;
    pollMs?: number;
}

/**
 * Result from debug completion
 */
export type DebugResult =
    | { kind: 'paused'; reason: string; threadId?: number; frame?: { name: string; source?: string; line?: number } }
    | { kind: 'terminated' }
    | { kind: 'error'; message: string };

/**
 * Ensure tests are discovered by triggering refresh
 * Note: We cannot verify TestItems exist on stable API - we just trigger discovery
 */
export async function ensureTestsDiscovered(
    uri: vscode.Uri,
    opts: WaitOptions = {}
): Promise<void> {
    const { timeoutMs = 5000 } = opts;

    console.log('[ensureTestsDiscovered] Triggering test refresh for:', uri.fsPath);

    // Ensure likely test providers are activated (best-effort)
    const fileExt = uri.fsPath.split('.').pop()?.toLowerCase();

    if (fileExt === 'py') {
        // Activate Python extension if available
        const pythonExt = vscode.extensions.getExtension('ms-python.python');
        if (pythonExt && !pythonExt.isActive) {
            console.log('[ensureTestsDiscovered] Activating Python extension...');
            try {
                await pythonExt.activate();
            } catch (error) {
                console.log('[ensureTestsDiscovered] Python extension activation failed:', error);
            }
        }
    } else if (fileExt === 'js' || fileExt === 'ts' || fileExt === 'jsx' || fileExt === 'tsx') {
        // Could activate Jest/Mocha extensions here
    }

    // Trigger test discovery - this is all we can do on stable API
    try {
        await vscode.commands.executeCommand('testing.refreshTests');
        console.log('[ensureTestsDiscovered] Test refresh command executed');
    } catch (error) {
        console.error('[ensureTestsDiscovered] Failed to refresh tests:', error);
        throw error;
    }

    // Give discovery a moment to complete
    // We can't verify completion on stable API, so this is best-effort
    await sleep(Math.min(timeoutMs, 2000));
}

/**
 * Check if a debug session is a Java test session
 * Per Critical Discovery 02: Java test sessions don't have purpose: ["debug-test"] flag
 * Detection via mainClass containing test launcher or classPaths containing junit/testng
 */
function isJavaTestSession(session: vscode.DebugSession): boolean {
    if (session.type !== 'java') return false;
    const config = session.configuration;
    const mainClass = config.mainClass || '';

    return mainClass.includes('RemoteTestRunner') ||
           mainClass.includes('junit.runner') ||
           config.classPaths?.some((cp: string) => cp.includes('junit') || cp.includes('testng'));
}

/**
 * Wait for a test debug session to start (language-agnostic)
 * Filters by purpose: ['debug-test'] first, then falls back to name heuristics
 */
export async function waitForTestDebugSession(
    opts: WaitOptions = {}
): Promise<vscode.DebugSession> {
    const { timeoutMs = 20000 } = opts;

    console.log(`[waitForTestDebugSession] Waiting for test debug session (${timeoutMs}ms timeout)`);

    return new Promise<vscode.DebugSession>((resolve, reject) => {
        const timer = setTimeout(() => {
            console.error('[waitForTestDebugSession] ❌ Timeout - no test debug session started');
            console.error('[waitForTestDebugSession] This likely means:');
            console.error('  1. No test exists at the cursor position');
            console.error('  2. Test discovery hasn\'t completed yet');
            console.error('  3. The test provider isn\'t installed/activated');
            subscription.dispose();
            reject(new Error('E_NO_TEST_AT_CURSOR: No test debug session started - likely no test at cursor'));
        }, timeoutMs);

        const subscription = vscode.debug.onDidStartDebugSession((session) => {
            const config = session.configuration as any;
            const purpose = config?.purpose;

            // Primary check: purpose includes 'debug-test' (language-agnostic)
            const hasDebugTestPurpose = Array.isArray(purpose) && purpose.includes('debug-test');

            // Java-specific check (no purpose flag for Java tests)
            const isJavaTest = isJavaTestSession(session);

            // Fallback: check if session name looks like a test
            const looksLikeTest = session.name && (
                session.name.toLowerCase().includes('test') ||
                session.name.toLowerCase().includes('pytest') ||
                session.name.toLowerCase().includes('unittest') ||
                session.name.toLowerCase().includes('jest') ||
                session.name.toLowerCase().includes('mocha') ||
                session.name.toLowerCase().includes('vitest')
            );

            console.log('[waitForTestDebugSession] Session started:', {
                name: session.name,
                type: session.type,
                hasDebugTestPurpose,
                isJavaTest,
                looksLikeTest,
                purpose
            });

            if (hasDebugTestPurpose || isJavaTest || looksLikeTest) {
                console.log('[waitForTestDebugSession] ✅ Test debug session matched!');
                clearTimeout(timer);
                subscription.dispose();
                resolve(session);
            } else {
                console.log('[waitForTestDebugSession] ⏭️ Not a test session, continuing to wait...');
            }
        });
    });
}

/**
 * @deprecated Use polling-executor.ts instead for simpler, more reliable detection
 * Wait for debug session to pause at breakpoint or terminate
 * Uses DebugAdapterTracker to intercept DAP events
 */
export async function waitForDebugCompletion(
    session: vscode.DebugSession,
    opts: WaitOptions = {}
): Promise<DebugResult> {
    const { timeoutMs = 30000 } = opts;
    const disposables: vscode.Disposable[] = [];

    console.log(`[waitForDebugCompletion] Waiting for breakpoint or termination (${timeoutMs}ms timeout)`);

    return new Promise<DebugResult>((resolve) => {
        let settled = false;

        const finish = (result: DebugResult) => {
            if (settled) return;
            settled = true;
            disposables.forEach(d => d.dispose());
            console.log('[waitForDebugCompletion] Result:', result);
            resolve(result);
        };

        // Register Debug Adapter Tracker to intercept DAP messages
        // Use session.type to track the specific debugger type
        const trackerFactory = vscode.debug.registerDebugAdapterTrackerFactory(session.type, {
            createDebugAdapterTracker(targetSession) {
                // Only track our specific session
                if (targetSession.id !== session.id) {
                    return undefined;
                }

                return {
                    onDidSendMessage: async (message: any) => {
                        // Detect when execution pauses (breakpoint, exception, step, etc.)
                        if (message?.event === 'stopped') {
                            const reason = message.body?.reason ?? 'unknown';
                            const threadId = message.body?.threadId;

                            console.log(`[waitForDebugCompletion] ⏸️ Stopped: ${reason}`);

                            // Try to get stack frame for context
                            let frame;
                            try {
                                if (threadId != null) {
                                    const stackTrace = await session.customRequest('stackTrace', {
                                        threadId,
                                        startFrame: 0,
                                        levels: 1
                                    });
                                    const topFrame = stackTrace?.stackFrames?.[0];
                                    if (topFrame) {
                                        frame = {
                                            name: topFrame.name,
                                            source: topFrame.source?.path,
                                            line: topFrame.line
                                        };
                                    }
                                }
                            } catch {
                                // Ignore errors getting stack frame
                            }

                            finish({ kind: 'paused', reason, threadId, frame });
                        }

                        // Detect session termination
                        if (message?.event === 'terminated' || message?.event === 'exited') {
                            console.log('[waitForDebugCompletion] 🛑 Session terminated');
                            finish({ kind: 'terminated' });
                        }
                    },
                    onError: (error) => {
                        console.error('[waitForDebugCompletion] Tracker error:', error);
                        finish({ kind: 'error', message: String(error) });
                    },
                    onExit: () => {
                        console.log('[waitForDebugCompletion] Debug adapter exited');
                        finish({ kind: 'terminated' });
                    }
                };
            }
        });
        disposables.push(trackerFactory);

        // Also observe session termination as safety net
        const termListener = vscode.debug.onDidTerminateDebugSession((s) => {
            if (s.id === session.id) {
                console.log('[waitForDebugCompletion] Session terminated event');
                finish({ kind: 'terminated' });
            }
        });
        disposables.push(termListener);

        // Timeout guard
        const timeoutTimer = setTimeout(() => {
            console.error('[waitForDebugCompletion] ❌ Timeout waiting for pause/termination');
            finish({ kind: 'error', message: 'E_TIMEOUT: No pause or termination detected' });
        }, timeoutMs);

        // Add cleanup for the timeout
        disposables.push(new vscode.Disposable(() => clearTimeout(timeoutTimer)));
    });
}

// Keep the old function name for backward compatibility
export const waitForPythonTestSession = waitForTestDebugSession;

/**
 * @deprecated Use polling-executor.ts instead for simpler, more reliable detection
 * Pre-arm a tracker for ALL upcoming debug sessions and resolve
 * the first time a TEST debug session (purpose: ['debug-test']) reports 'stopped' or terminates.
 * This must be called BEFORE starting the debug session to avoid race conditions.
 */
export function prearmImmediateTestStopDetector(
    opts: WaitOptions = {}
): { latch: Promise<{ session: vscode.DebugSession; result: DebugResult }>; dispose: () => void } {
    const { timeoutMs = 30000 } = opts;

    let settled = false;
    let resolve!: (v: { session: vscode.DebugSession; result: DebugResult }) => void;

    const latch = new Promise<{ session: vscode.DebugSession; result: DebugResult }>(res => (resolve = res));

    console.log('[prearmImmediateTestStopDetector] Pre-arming tracker for all debug sessions');

    // Track sessions started in our time window (5s)
    const startTs = Date.now();
    const seenCandidate = new Set<string>();
    const WINDOW_MS = 5000;

    // Track session starts to seed "candidates" (language-agnostic)
    const sessionStart = vscode.debug.onDidStartDebugSession(s => {
        if (Date.now() - startTs <= WINDOW_MS) {
            seenCandidate.add(s.id);
            console.log('[prearmImmediateTestStopDetector] Candidate session started:', s.name);
        }
    });

    // Register BEFORE starting debug so we never miss early 'stopped'
    // Using '*' wildcard to catch ALL debug types (Python, Node, etc.)
    const disposable = vscode.debug.registerDebugAdapterTrackerFactory('*', {
        createDebugAdapterTracker(session) {
            // ALWAYS return a tracker - decide test/non-test on message arrival
            console.log('[prearmImmediateTestStopDetector] Creating tracker for session:', session.name);

            const finish = (result: DebugResult) => {
                if (settled) return;
                settled = true;
                console.log('[prearmImmediateTestStopDetector] Detected event:', result);
                resolve({ session, result });
            };

            // Check if this looks like a test session
            const looksLikeTest = () => {
                const purpose = (session.configuration as any)?.purpose;
                if (Array.isArray(purpose) && purpose.includes('debug-test')) {
                    return true;
                }
                // Java test detection (no purpose flag)
                if (isJavaTestSession(session)) {
                    return true;
                }
                // Fallback heuristics if purpose is absent
                const name = (session.name || '').toLowerCase();
                const isCandidate = seenCandidate.has(session.id);
                const hasTestKeywords = /test|pytest|jest|mocha|vitest|junit|unittest/.test(name);
                return isCandidate || hasTestKeywords;
            };

            return {
                onDidSendMessage: async (m: any) => {
                    // Check if this is a test session before processing
                    if (!looksLikeTest()) return;

                    // Detect 'stopped' event (breakpoint, exception, step, etc.)
                    if (m?.event === 'stopped') {
                        const reason = m.body?.reason ?? 'unknown';
                        const threadId = m.body?.threadId;

                        console.log(`[prearmImmediateTestStopDetector] 🎯 STOPPED event detected: ${reason}`);

                        let frame: { name: string; source?: string; line?: number } | undefined;

                        try {
                            if (threadId != null) {
                                const st = await session.customRequest('stackTrace', {
                                    threadId,
                                    startFrame: 0,
                                    levels: 1
                                });
                                const top = st?.stackFrames?.[0];
                                if (top) {
                                    frame = {
                                        name: top.name,
                                        source: top.source?.path,
                                        line: top.line
                                    };
                                }
                            }
                        } catch {
                            // Ignore errors getting stack frame
                        }

                        finish({ kind: 'paused', reason, threadId, frame });
                    }

                    // Detect session termination
                    if (m?.event === 'terminated' || m?.event === 'exited') {
                        if (!looksLikeTest()) return;
                        console.log('[prearmImmediateTestStopDetector] Session terminated');
                        finish({ kind: 'terminated' });
                    }
                },

                onError: (err) => {
                    if (looksLikeTest()) {
                        console.error('[prearmImmediateTestStopDetector] Tracker error:', err);
                        if (!settled) finish({ kind: 'error', message: String(err) });
                    }
                },

                onExit: () => {
                    if (looksLikeTest()) {
                        console.log('[prearmImmediateTestStopDetector] Debug adapter exited');
                        if (!settled) finish({ kind: 'terminated' });
                    }
                }
            };
        }
    });

    // Timeout to avoid hanging forever if no session ever starts
    const timeoutTimer = setTimeout(() => {
        if (!settled) {
            settled = true;
            console.log('[prearmImmediateTestStopDetector] Timeout waiting for test session');
            // Resolve with an error that caller can check
            resolve({
                session: undefined as any,
                result: { kind: 'error', message: 'E_TIMEOUT: No test session started or stopped' }
            });
        }
    }, timeoutMs);

    const dispose = () => {
        clearTimeout(timeoutTimer);
        disposable.dispose();
        sessionStart.dispose();
        console.log('[prearmImmediateTestStopDetector] Disposed tracker and session listener');
    };

    return { latch, dispose };
}

/**
 * Check if a debug session is already paused by querying thread states.
 * Useful as a fallback if we somehow still miss the initial stopped event.
 */
export async function isSessionAlreadyPaused(
    session: vscode.DebugSession
): Promise<{ paused: boolean; frame?: { name: string; source?: string; line?: number } }> {
    try {
        console.log('[isSessionAlreadyPaused] Checking if session is paused:', session.id);

        // Query all threads
        const threads = await session.customRequest('threads');
        const list: Array<{ id: number }> = threads?.threads ?? [];

        console.log(`[isSessionAlreadyPaused] Found ${list.length} threads`);

        // Check each thread for a stack frame (indicates it's paused)
        for (const t of list) {
            try {
                const st = await session.customRequest('stackTrace', {
                    threadId: t.id,
                    startFrame: 0,
                    levels: 1
                });
                const top = st?.stackFrames?.[0];
                if (top) {
                    console.log('[isSessionAlreadyPaused] Found paused thread:', t.id);
                    return {
                        paused: true,
                        frame: {
                            name: top.name,
                            source: top.source?.path,
                            line: top.line
                        }
                    };
                }
            } catch {
                // stackTrace failing commonly means the thread is running; try next
            }
        }
    } catch (error) {
        // Adapter might not support these commands yet
        console.log('[isSessionAlreadyPaused] Error checking pause state:', error);
    }

    console.log('[isSessionAlreadyPaused] Session is not paused');
    return { paused: false };
}

/**
 * Simple sleep utility
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @deprecated Use polling-executor.ts instead for simpler, more reliable detection
 * First-success combiner that only resolves when a detector reports 'paused'.
 * Ignores non-paused results (errors, timeouts, terminations) and keeps waiting.
 */
export function firstPaused<T extends { result: DebugResult }>(
    candidates: Array<Promise<T>>,
    { timeoutMs = 30000 }: { timeoutMs?: number } = {}
): Promise<T> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const disposables: vscode.Disposable[] = [];

        const finish = (v: T) => {
            if (!settled) {
                settled = true;
                resolve(v);
                disposables.forEach(d => d.dispose());
            }
        };

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                reject(new Error('E_TIMEOUT: no paused detection'));
            }
        }, timeoutMs);

        disposables.push(new vscode.Disposable(() => clearTimeout(timer)));

        for (const p of candidates) {
            p.then(v => {
                if (settled) return;
                // Only a PAUSE wins the race
                if (v.result?.kind === 'paused') {
                    console.log('[firstPaused] Paused detection won the race');
                    finish(v);
                }
                // else ignore (terminated/error/undefined) and keep waiting
            }).catch(() => {
                // Ignore errors and keep waiting for other candidates
            });
        }
    });
}

/**
 * Micro-polling for rapid pause detection in the first 300-500ms after session starts.
 * Polls every 25ms for stack frames to detect paused threads.
 */
export async function pollPausedSnapshot(
    session: vscode.DebugSession,
    budgetMs = 500,
    stepMs = 25
): Promise<{ session: vscode.DebugSession; result: DebugResult }> {
    console.log(`[pollPausedSnapshot] Starting micro-poll for ${budgetMs}ms at ${stepMs}ms intervals`);
    const end = Date.now() + budgetMs;

    while (Date.now() < end) {
        try {
            const threads = await session.customRequest('threads');
            const list: Array<{ id: number }> = threads?.threads ?? [];

            for (const t of list) {
                try {
                    const st = await session.customRequest('stackTrace', {
                        threadId: t.id,
                        startFrame: 0,
                        levels: 1
                    });
                    const top = st?.stackFrames?.[0];
                    if (top) {
                        console.log(`[pollPausedSnapshot] Found paused thread ${t.id} with frame`);
                        return {
                            session,
                            result: {
                                kind: 'paused',
                                reason: 'breakpoint',
                                threadId: t.id,
                                frame: {
                                    name: top.name,
                                    source: top.source?.path,
                                    line: top.line
                                }
                            } as DebugResult
                        };
                    }
                } catch {
                    // Thread is running, try next
                }
            }
        } catch {
            // Adapter not ready yet, continue polling
        }

        await sleep(stepMs);
    }

    // No pause detected within budget
    console.log('[pollPausedSnapshot] No pause detected within budget');
    return {
        session,
        result: { kind: 'error', message: 'no paused snapshot' } as DebugResult
    };
}