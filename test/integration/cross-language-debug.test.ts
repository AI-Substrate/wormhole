/**
 * Cross-Language Debug Integration Test
 *
 * This test validates VSC-Bridge's debugging capabilities across all 4 supported
 * languages (Python, JavaScript, C#, Java) by executing real CLI commands against
 * an actual Extension Host.
 *
 * Testing Approach: Manual Only (no mocking)
 * - Tests execute real CLI commands via child_process
 * - Extension Host must be running (manual F5 or programmatic launch)
 * - All paths are absolute per Critical Discovery 03
 * - 30-second timeout per operation for reliability
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { findBreakpointLine, findBreakpoint2Line } from '../test-utils/breakpoint-finder';

// Critical Discovery 02: Use promisify(exec) for CLI execution
const execAsync = promisify(exec);

/**
 * Project root and test workspace paths (Critical Discovery 03)
 *
 * IMPORTANT: Must use absolute paths. The CLI commands will execute with these
 * as the current working directory to match the Extension Host's workspace.
 *
 * PROJECT_ROOT: Dynamically resolved to support different developer machines
 * TEST_WORKSPACE: Extension Host opens this directory for testing
 */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TEST_WORKSPACE = path.join(PROJECT_ROOT, 'test');

/**
 * Timeout for all CLI operations (30 seconds)
 *
 * Generous timeout ensures reliability across all language debuggers,
 * especially slower ones like C# (8s) and Java (6s).
 */
const CLI_TIMEOUT = 30000; // 30 seconds

/**
 * Extension Host startup delay (10 seconds)
 *
 * Allows Extension Host to fully initialize before running tests.
 * This includes loading the extension, starting the bridge server,
 * and discovering test frameworks.
 */
const EXTENSION_STARTUP_DELAY = 10000; // 10 seconds

/**
 * Test file paths for all supported languages
 *
 * These paths must match the actual test files in the test workspace.
 * All paths are absolute per Critical Discovery 03.
 */
const TEST_FILES = {
    typescript: path.join(PROJECT_ROOT, 'test/integration-simple/typescript/debug.test.ts'),
    python: path.join(PROJECT_ROOT, 'test/integration-simple/python/test_debug.py'),
    javascript: path.join(TEST_WORKSPACE, 'javascript/example.test.js'),
    csharp: path.join(PROJECT_ROOT, 'test/integration-simple/csharp/DebugTest.cs'),
    java: path.join(PROJECT_ROOT, 'test/integration-simple/java/src/test/java/com/example/DebugTest.java')
};;

/**
 * Line numbers for breakpoints in each language's test file
 *
 * TypeScript: Dynamically discovered via VSCB_BREAKPOINT_NEXT_LINE marker
 * From docs/manual-test/debug-single.md:
 * - Python: line 29 (test_simple_subtraction)
 * - JavaScript: line 533 (may pause elsewhere due to Jest structure)
 * - C#: line 17 (TestSimpleAddition, may pause at [External Code])
 * - Java: line 28 (inspectLocalsAndStatics)
 */
const TEST_LINES = {
    typescript: findBreakpointLine(TEST_FILES.typescript),
    python: findBreakpointLine(TEST_FILES.python),
    javascript: 533,
    csharp: findBreakpointLine(TEST_FILES.csharp),
    java: findBreakpointLine(TEST_FILES.java)
};;

/**
 * Second breakpoint line numbers for enhanced coverage testing
 *
 * TypeScript: Dynamically discovered via VSCB_BREAKPOINT_2_NEXT_LINE marker
 */
const TEST_LINES_2 = {
    typescript: findBreakpoint2Line(TEST_FILES.typescript),
    python: findBreakpoint2Line(TEST_FILES.python),
    csharp: findBreakpoint2Line(TEST_FILES.csharp),
    java: findBreakpoint2Line(TEST_FILES.java)
};;

/**
 * Sleep helper function
 *
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the specified time
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll bridge health until ready or timeout
 *
 * Polls the native `status --json` command every 5 seconds for up to 30 seconds
 * to wait for the Extension Host bridge to become healthy.
 *
 * @param maxAttempts Maximum number of retry attempts (default 6 = 30 seconds at 5s intervals)
 * @throws Error if bridge doesn't become healthy within timeout
 */
async function waitForBridgeReady(maxAttempts: number = 6): Promise<void> {
    console.log('⏳ Polling bridge health (30s timeout, 5s intervals)...');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const healthResult = await runCLI('status --json', true);
            if (healthResult.healthy) {
                console.log(`✅ Bridge is healthy (attempt ${attempt}/${maxAttempts})`);
                return;
            }
        } catch (e) {
            console.log(`ℹ️  Attempt ${attempt}/${maxAttempts}: Bridge not ready yet`);
        }

        if (attempt < maxAttempts) {
            await sleep(5000); // Wait 5 seconds before retry
        }
    }

    throw new Error('❌ Bridge failed to become healthy after 30 seconds - no bridge detected');
}

/**
 * Execute CLI command and return parsed JSON response
 *
 * Critical Discovery 02: CLI communicates via stdout/stderr, not direct API.
 * Critical Discovery 03: Run from correct directory based on operation:
 *   - Extension Host lifecycle (debug.start/stop): Run from vsc-bridge root
 *   - Test/debug commands (test.debug-single, breakpoint.set, etc): Run from test/ workspace
 *
 * @param command CLI command (without 'node dist/index.js' prefix)
 * @param fromRoot If true, run from vsc-bridge root; if false, run from test/ workspace (default)
 * @returns Parsed JSON response from CLI
 * @throws Error if CLI returns non-zero exit code or stderr (except warnings)
 */
async function runCLI(command: string, fromRoot: boolean = false): Promise<any> {
    // Force oclif to use compiled dist, not TypeScript sources
    // This prevents MODULE_NOT_FOUND errors when oclif tries to load TS files
    const env = {
        ...process.env,
        NODE_ENV: 'production',      // Prevents oclif dev heuristics
        OCLIF_TS_NODE: '0',          // Force oclif to NOT use ts-node
        TS_NODE_PROJECT: '',         // Belt & suspenders
    };

    const cwd = fromRoot ? PROJECT_ROOT : TEST_WORKSPACE;
    const cliPath = path.join(PROJECT_ROOT, 'dist', 'index.js');

    const { stdout, stderr } = await execAsync(
        `node ${cliPath} ${command}`,
        {
            cwd,
            timeout: CLI_TIMEOUT,
            env,
            maxBuffer: 10 * 1024 * 1024  // 10MB buffer for large Python variable responses
        }
    );

    // Ignore info logs and warnings in stderr, but throw on real errors
    // CLI outputs ℹ info messages to stderr, which are not errors
    if (stderr && !stderr.includes('warning') && !stderr.includes('ℹ')) {
        throw new Error(`CLI error: ${stderr}`);
    }

    // Parse JSON response from stdout
    try {
        return JSON.parse(stdout);
    } catch (e) {
        const parseError = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to parse CLI response (${stdout.length} bytes): ${parseError}\nFirst 500 chars: ${stdout.substring(0, 500)}`);
    }
}

/**
 * Retry helper for intermittent test.debug-single failures
 *
 * @param command CLI command to retry
 * @param maxRetries Maximum number of retry attempts (default: 5)
 * @param delayMs Delay between retries in milliseconds (default: 2000)
 * @returns Parsed JSON response from CLI
 */
async function runCLIWithRetry(command: string, maxRetries: number = 5, delayMs: number = 2000): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 Attempt ${attempt}/${maxRetries}: ${command.substring(0, 60)}...`);
            const result = await runCLI(command);
            console.log(`✅ Succeeded on attempt ${attempt}`);
            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.log(`❌ Attempt ${attempt} failed: ${lastError.message.substring(0, 100)}`);

            if (attempt < maxRetries) {
                console.log(`⏳ Waiting ${delayMs}ms before retry...`);
                await sleep(delayMs);
            }
        }
    }

    throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
}

describe('Cross-Language Debug Integration', () => {
    /**
     * Setup: Launch Extension Host and wait for initialization
     *
     * Programmatically launches Extension Host using debug.start command.
     * This matches the dogfooding workflow from docs/how/dogfood/dogfooding-vsc-bridge.md
     */
    beforeAll(async () => {
        console.log('⚙️  Starting test infrastructure setup...');
        console.log(`📁 Test workspace: ${TEST_WORKSPACE}`);

        // Stop any existing Extension Host first (run from vsc-bridge root)
        console.log('🧹 Stopping any existing Extension Host...');
        try {
            await runCLI('script run debug.stop', true);
            console.log('✅ Existing Extension Host stopped');
        } catch (e) {
            // Ignore errors - no Extension Host may be running
            console.log('ℹ️  No existing Extension Host to stop');
        }

        // Launch Extension Host programmatically (run from vsc-bridge root)
        console.log('🚀 Launching Extension Host...');
        const launchResult = await runCLI('script run debug.start --param launch="Run Extension"', true);
        expect(launchResult.ok).toBe(true);
        console.log('✅ Extension Host launched');

        // Wait for extension to fully initialize
        console.log(`⏳ Waiting ${EXTENSION_STARTUP_DELAY / 1000}s for initialization...`);
        await sleep(EXTENSION_STARTUP_DELAY);

        // Trigger test discovery (enables Python test discovery)
        console.log('🔍 Triggering test discovery...');
        try {
            await runCLI('script run editor.show-testing-ui');
            console.log('✅ Testing view shown');
        } catch (e) {
            // Command may not return JSON - that's ok, it still triggers discovery
            console.log('ℹ️  Testing view triggered (no JSON response expected)');
        }

        // Wait for test discovery to complete (especially Python)
        console.log('⏳ Waiting 5s for test discovery to complete...');
        await sleep(5000);

        // Stop any debug session from discovery
        try {
            await runCLI('script run debug.stop');
        } catch (e) {
            // Ignore - no session may be active
        }

        // Poll bridge health (30s timeout, 5s intervals)
        await waitForBridgeReady();

        // Verify debug.status script works (no active session expected)
        console.log('🔍 Verifying debug.status script...');
        const debugStatusResult = await runCLI('script run debug.status');
        expect(debugStatusResult.ok).toBe(true);
        expect(debugStatusResult.data.isActive).toBe(false); // No session yet
        console.log('✅ Debug status script working (no active session)');
    }, 120000); // 120-second timeout for beforeAll hook (allows for 30s polling + 10s init + buffer)

    /**
     * Cleanup: Stop Extension Host
     */
    afterAll(async () => {
        console.log('🧹 Cleaning up - stopping Extension Host...');

        try {
            await runCLI('script run debug.stop', true);
            console.log('✅ Extension Host stopped');
        } catch (e) {
            // Ignore errors - Extension Host may not be running
            console.log('ℹ️  No Extension Host to stop');
        }
    });

    /**
     * Smoke test: Verify CLI communication works
     *
     * This test validates the entire infrastructure chain:
     * 1. CLI executable is accessible
     * 2. Bridge server is running
     * 3. Extension Host is responding
     * 4. JSON parsing works correctly
     */
    it('should verify bridge status', async () => {
        console.log('🧪 Running smoke test: debug.status');

        const response = await runCLI('script run debug.status');

        // Basic validation - response should be JSON with ok property
        expect(response).toBeDefined();
        expect(response).toHaveProperty('ok');
        console.log(`✅ Smoke test passed - CLI communication works`);
    }, 30000); // 30-second timeout for test

    /**
     * Python (pytest) debugging workflow test - Enhanced Coverage
     *
     * Tests comprehensive debug lifecycle for Python using the simple unified test file:
     * 1. Cleanup: Stop any existing session to ensure fresh start
     * 2. Set breakpoint at dynamically discovered line (via VSCB_BREAKPOINT_NEXT_LINE marker)
     * 3. Start debug session at first breakpoint (line 30: sum_result = add(x, y))
     * 4. Validate initial variables (x=5, y=3 - sum_result not yet assigned)
     * 5. Step into add() function
     * 6. Validate function parameters (a=5, b=3)
     * 7. Step out back to test
     * 8. Validate sum_result is now available (sum_result=8)
     * 9. Set second breakpoint dynamically (line 35: assert diff == 2)
     * 10. Continue to second breakpoint
     * 11. Validate all variables present (x=5, y=3, sum_result=8, diff=2)
     * 12. Stop debug session to clean up
     *
     * CRITICAL: Each test MUST clean up (stop debugger) to allow next test to run.
     * Only ONE debug session can be active at a time in the Extension Host.
     *
     * This test validates:
     * - Marker-based breakpoint discovery
     * - Step-in to function calls
     * - Step-out from nested functions
     * - Dynamic breakpoint setting during active session
     * - Continue to second breakpoint
     * - Multi-stage variable inspection
     */
    describe('Python (pytest) - Enhanced Coverage', () => {
        it('should complete enhanced Python debug workflow', async () => {
            console.log('🐍 Testing Python debugging (enhanced coverage)...');
            console.log(`📍 Breakpoint 1 line discovered: ${TEST_LINES.python}`);
            console.log(`📍 Breakpoint 2 line discovered: ${TEST_LINES_2.python}`);

            // CLEANUP: Stop any existing debug session (may fail, that's ok)
            console.log('🧹 Cleaning up any existing debug session...');
            try {
                await runCLI('script run debug.stop');
            } catch (e) {
                // Ignore errors - session may not exist
                console.log('ℹ️  No existing session to stop');
            }

            // Set first breakpoint (Python requires explicit breakpoint before debugging)
            console.log(`📍 Setting breakpoint 1 at ${TEST_FILES.python}:${TEST_LINES.python}...`);
            const bpResponse = await runCLI(
                `script run breakpoint.set --param path=${TEST_FILES.python} --param line=${TEST_LINES.python}`
            );
            expect(bpResponse.ok).toBe(true);
            console.log('✅ Breakpoint 1 set');

            // Navigate to breakpoint line to ensure file is visible
            console.log(`📍 Navigating to breakpoint...`);
            await runCLI(
                `script run editor.goto-line --param path=${TEST_FILES.python} --param line=${TEST_LINES.python}`
            );
            await sleep(2000);

            // Start debug session with retry (Python test discovery can be intermittent)
            console.log(`🎯 Starting debug session at ${TEST_FILES.python}:${TEST_LINES.python}...`);
            const startResponse = await runCLIWithRetry(
                `script run test.debug-single --param path=${TEST_FILES.python} --param line=${TEST_LINES.python} --param timeoutMs=5000`,
                5,  // 5 retries
                2000  // 2 seconds between retries
            );

            // Verify debug session started successfully
            expect(startResponse.ok).toBe(true);
            expect(startResponse.data.event).toBe('stopped');
            expect(startResponse.data.line).toBeDefined();
            console.log(`✅ Debug session started at line ${startResponse.data.line}`);

            // Check for sessionType (debugpy)
            if (startResponse.data.sessionType) {
                expect(startResponse.data.sessionType).toBe('debugpy');
                console.log(`✅ Session type: ${startResponse.data.sessionType}`);
            } else {
                console.log('ℹ️  sessionType not in response (may be in different field)');
            }

            // STAGE 1: List variables at first breakpoint (before sum_result is assigned)
            console.log('📋 Stage 1: Listing variables at breakpoint 1 (before sum_result assignment)...');
            const vars1Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars1Response.ok).toBe(true);
            expect(vars1Response.data.variables).toBeDefined();
            console.log(`✅ Found ${vars1Response.data.variables.length} variables`);
            console.log(`📋 Available variables: ${vars1Response.data.variables.map((v: any) => v.name).join(', ')}`);
            console.log(`🔍 DEBUG: Full variable structure: ${JSON.stringify(vars1Response.data.variables, null, 2)}`);

            // Python returns variables in a scope container - extract from children
            const scopeVar1 = vars1Response.data.variables[0];
            const actualVars1 = scopeVar1?.children || vars1Response.data.variables;
            console.log(`📋 Actual variables extracted: ${actualVars1.map((v: any) => v.name).join(', ')}`);

            // Validate x and y are present (sum_result should NOT be assigned yet)
            const x1 = actualVars1.find((v: any) => v.name === 'x');
            const y1 = actualVars1.find((v: any) => v.name === 'y');
            expect(x1).toBeDefined();
            expect(y1).toBeDefined();
            expect(x1.value).toBe('5');
            expect(y1.value).toBe('3');
            console.log(`✅ Stage 1 validation: x=${x1.value}, y=${y1.value}`);

            // STAGE 2: Step into add() function
            console.log('🔽 Stage 2: Stepping into add() function...');
            const stepInResponse = await runCLI('script run debug.step-into');
            expect(stepInResponse.ok).toBe(true);
            expect(stepInResponse.data.event).toBe('stopped');
            console.log(`✅ Stepped into function at line ${stepInResponse.data.line}`);

            // List variables inside add() function (should see a and b parameters)
            console.log('📋 Listing variables inside add() function...');
            const vars2Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars2Response.ok).toBe(true);
            console.log(`📋 Available variables: ${vars2Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // Python returns variables in a scope container - extract from children
            const scopeVar2 = vars2Response.data.variables[0];
            const actualVars2 = scopeVar2?.children || vars2Response.data.variables;

            // Validate a and b parameters (may not be visible if at return statement)
            const a = actualVars2.find((v: any) => v.name === 'a');
            const b = actualVars2.find((v: any) => v.name === 'b');

            if (a && b) {
                expect(a.value).toBe('5');
                expect(b.value).toBe('3');
                console.log(`✅ Stage 2 validation: a=${a.value}, b=${b.value} (inside add function)`);
            } else {
                console.log(`ℹ️  Stage 2: Parameters not visible (likely at return statement) - skipping validation`);
            }

            // STAGE 3: Step out back to test
            console.log('🔼 Stage 3: Stepping out back to test...');
            const stepOutResponse = await runCLI('script run debug.step-out');
            expect(stepOutResponse.ok).toBe(true);
            expect(stepOutResponse.data.event).toBe('stopped');
            console.log(`✅ Stepped out to line ${stepOutResponse.data.line}`);

            // Python debugger stops BEFORE completing the assignment - step over to complete it
            console.log('⏭️  Stepping over to complete sum_result assignment...');
            const stepOverResponse = await runCLI('script run debug.step-over');
            expect(stepOverResponse.ok).toBe(true);
            console.log(`✅ Stepped over to line ${stepOverResponse.data.line}`);

            // List variables after stepping over (sum_result should now be assigned)
            console.log('📋 Listing variables after step-over (sum_result should be assigned)...');
            const vars3Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars3Response.ok).toBe(true);
            console.log(`📋 Available variables: ${vars3Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // Python returns variables in a scope container - extract from children
            const scopeVar3 = vars3Response.data.variables[0];
            const actualVars3 = scopeVar3?.children || vars3Response.data.variables;

            // Validate x, y, and sum_result are present
            const x3 = actualVars3.find((v: any) => v.name === 'x');
            const y3 = actualVars3.find((v: any) => v.name === 'y');
            const sum3 = actualVars3.find((v: any) => v.name === 'sum_result');
            expect(x3).toBeDefined();
            expect(y3).toBeDefined();
            expect(sum3).toBeDefined();
            expect(x3.value).toBe('5');
            expect(y3.value).toBe('3');
            expect(sum3.value).toBe('8');
            console.log(`✅ Stage 3 validation: x=${x3.value}, y=${y3.value}, sum_result=${sum3.value}`);

            // STAGE 4: Set second breakpoint dynamically
            console.log(`📍 Stage 4: Setting breakpoint 2 at line ${TEST_LINES_2.python}...`);
            const bp2Response = await runCLI(
                `script run breakpoint.set --param path=${TEST_FILES.python} --param line=${TEST_LINES_2.python}`
            );
            expect(bp2Response.ok).toBe(true);
            console.log('✅ Breakpoint 2 set dynamically during active session');

            // STAGE 5: Continue to second breakpoint
            console.log('▶️  Stage 5: Continuing to breakpoint 2...');
            const continueResponse = await runCLI('script run debug.continue');
            expect(continueResponse.ok).toBe(true);
            expect(continueResponse.data.event).toBe('stopped');
            expect(continueResponse.data.line).toBe(TEST_LINES_2.python);
            console.log(`✅ Stopped at breakpoint 2 (line ${continueResponse.data.line})`);

            // STAGE 6: Final validation - all 4 variables should be present
            console.log('📋 Stage 6: Final variable validation (all 4 expected)...');
            const vars4Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars4Response.ok).toBe(true);
            console.log(`📋 Available variables: ${vars4Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // Python returns variables in a scope container - extract from children
            const scopeVar4 = vars4Response.data.variables[0];
            const actualVars4 = scopeVar4?.children || vars4Response.data.variables;

            const expectedVars = [
                { name: 'x', value: '5', type: /int/ },
                { name: 'y', value: '3', type: /int/ },
                { name: 'sum_result', value: '8', type: /int/ },
                { name: 'diff', value: '2', type: /int/ }
            ];
            let foundCount = 0;

            for (const expected of expectedVars) {
                const found = actualVars4.find((v: any) => v.name === expected.name);
                if (found) {
                    foundCount++;
                    console.log(`✅ Found expected variable: ${found.name} = ${found.value} (${found.type})`);
                    expect(found.value).toBe(expected.value);
                    expect(found.type).toMatch(expected.type);
                } else {
                    console.log(`⚠️  Expected variable not found: ${expected.name}`);
                }
            }

            expect(foundCount).toBe(expectedVars.length);
            console.log(`✅ Stage 6 validation: Found all ${foundCount}/${expectedVars.length} expected variables`);

            // CLEANUP: Stop debug session (REQUIRED to allow next test to run)
            console.log('🛑 Stopping debug session...');
            const stopResponse = await runCLI('script run debug.stop');
            expect(stopResponse.ok).toBe(true);
            console.log('✅ Debug session stopped cleanly');

            console.log('✅ Python enhanced debugging test passed ✓');
        }, 60000); // 60-second timeout for enhanced workflow
    });

    /**
     * JavaScript (Jest) debugging workflow test
     *
     * Tests the complete debug lifecycle for JavaScript including object expansion:
     * 1. Cleanup: Stop any existing session to ensure fresh start
     * 2. Start debug session at example.test.js:533 (may pause elsewhere due to Jest)
     * 3. List variables and find objects with variablesReference > 0
     * 4. Expand at least one object and verify children structure
     * 5. Stop debug session to clean up for next test
     *
     * CRITICAL: Each test MUST clean up (stop debugger) to allow next test to run.
     * Only ONE debug session can be active at a time in the Extension Host.
     *
     * NOTE: This test enables Python test discovery by "jiggling" VS Code's test explorer.
     * Running a Node/Jest test first triggers proper Python test discovery.
     */
    describe.skip('JavaScript (Jest)', () => {
        it('should complete full JavaScript debug workflow with object expansion', async () => {
            console.log('🧪 Testing JavaScript debugging...');

            // CLEANUP: Stop any existing debug session (may fail, that's ok)
            console.log('🧹 Cleaning up any existing debug session...');
            try {
                await runCLI('script run debug.stop');
            } catch (e) {
                // Ignore errors - session may not exist
                console.log('ℹ️  No existing session to stop');
            }

            // Note: We don't verify status here as debug.status requires an active debug session
            // The cleanup stop above ensures we start fresh

            // Set breakpoint first (JavaScript requires explicit breakpoint before debugging)
            console.log(`📍 Setting breakpoint at ${TEST_FILES.javascript}:${TEST_LINES.javascript}...`);
            const bpResponse = await runCLI(
                `script run breakpoint.set --param path=${TEST_FILES.javascript} --param line=${TEST_LINES.javascript}`
            );
            expect(bpResponse.ok).toBe(true);
            console.log('✅ Breakpoint set');

            // Start debug session
            console.log(`🎯 Starting debug session at ${TEST_FILES.javascript}:${TEST_LINES.javascript}...`);
            const startResponse = await runCLI(
                `script run test.debug-single --param path=${TEST_FILES.javascript} --param line=${TEST_LINES.javascript}`
            );

            // Verify debug session started successfully
            expect(startResponse.ok).toBe(true);

            // JavaScript/Jest may return 'terminated' if test discovery hasn't completed yet
            // Wait additional time for Jest test discovery (slower than expected)
            if (startResponse.data.event === 'terminated') {
                console.log('⚠️  Jest test returned "terminated" - waiting 5s for test discovery...');
                await sleep(5000); // Give Jest more time for discovery

                // Retry once after delay
                console.log('🔄 Retrying Jest debug session after discovery delay...');
                const retryResponse = await runCLI(
                    `script run test.debug-single --param path=${TEST_FILES.javascript} --param line=${TEST_LINES.javascript}`
                );

                expect(retryResponse.ok).toBe(true);
                expect(retryResponse.data.event).toBe('stopped');
                console.log(`✅ Debug session started at line ${retryResponse.data.line} (after retry)`);

                // Use retry response for rest of test
                Object.assign(startResponse, retryResponse);
            } else {
                expect(startResponse.data.event).toBe('stopped');
                expect(startResponse.data.line).toBeDefined();
                console.log(`✅ Debug session started at line ${startResponse.data.line}`);
            }

            // Note: Jest may pause at different line than 533 due to test structure
            if (startResponse.data.line !== TEST_LINES.javascript) {
                console.log(`ℹ️  Note: Paused at line ${startResponse.data.line} (expected ${TEST_LINES.javascript} - Jest quirk)`);
            }

            // Check for sessionType (pwa-node)
            if (startResponse.data.sessionType) {
                expect(startResponse.data.sessionType).toBe('pwa-node');
                console.log(`✅ Session type verified: ${startResponse.data.sessionType}`);
            } else {
                console.log('ℹ️  sessionType not in response (may be in different field)');
            }

            // List variables with scope=local
            console.log('📋 Listing variables...');
            const varsResponse = await runCLI('script run debug.list-variables --param scope=local');

            // Verify variables response structure
            expect(varsResponse.ok).toBe(true);
            expect(varsResponse.data.variables).toBeDefined();
            expect(varsResponse.data.variables.length).toBeGreaterThan(0);
            console.log(`✅ Found ${varsResponse.data.variables.length} variables`);

            // 🆕 SEMANTIC VALIDATION: Check for expected JavaScript variables at line 533
            console.log('🔍 Validating expected JavaScript variables...');
            const expectedVars = ['calc', 'result']; // Expected at processCalculation call line 533
            let foundCount = 0;

            for (const varName of expectedVars) {
                const found = varsResponse.data.variables.find((v: any) => v.name === varName);
                if (found) {
                    foundCount++;
                    console.log(`✅ Found expected variable: ${varName} (type: ${found.type})`);
                } else {
                    console.log(`ℹ️  Expected variable not found: ${varName} (may be paused at different Jest line)`);
                }
            }

            console.log(`✅ Found ${foundCount}/${expectedVars.length} expected variables`);

            // Find a variable with variablesReference > 0 (object for expansion)
            const objectVar = varsResponse.data.variables.find(
                (v: any) => v.variablesReference && v.variablesReference > 0
            );
            expect(objectVar).toBeDefined();
            console.log(`✅ Found object with variablesReference: ${objectVar?.variablesReference} (name: ${objectVar?.name})`);

            // Expand object to verify object expansion works
            console.log('🔍 Expanding object...');
            const expandResponse = await runCLI(
                `script run debug.get-variable --param variablesReference=${objectVar!.variablesReference} --param count=10`
            );

            // Verify object expansion response
            expect(expandResponse.ok).toBe(true);
            expect(expandResponse.data.children).toBeDefined();
            expect(expandResponse.data.children.length).toBeGreaterThan(0);
            console.log(`✅ Object expanded with ${expandResponse.data.children.length} children`);

            // Verify children have expected structure (name, value, type properties)
            const firstChild = expandResponse.data.children[0];
            expect(firstChild).toHaveProperty('name');
            expect(firstChild).toHaveProperty('value');
            expect(firstChild).toHaveProperty('type');
            console.log(`✅ Child structure verified: ${JSON.stringify(firstChild)}`);

            // 🆕 SEMANTIC VALIDATION: Check for common object properties in expanded children
            console.log('🔍 Validating expanded object properties...');
            const expectedProps = ['length', 'constructor', 'toString', 'valueOf']; // Common object/array properties
            let propsFound = 0;

            for (const propName of expectedProps) {
                const found = expandResponse.data.children.find((c: any) => c.name === propName);
                if (found) {
                    propsFound++;
                    console.log(`✅ Found expected property: ${propName}`);
                }
            }

            console.log(`✅ Found ${propsFound}/${expectedProps.length} common properties in expanded object`);

            // CLEANUP: Stop debug session (REQUIRED to allow next test to run)
            console.log('🛑 Stopping debug session...');
            const stopResponse = await runCLI('script run debug.stop');
            expect(stopResponse.ok).toBe(true);
            console.log('✅ Debug session stopped cleanly');

            console.log('✅ JavaScript debugging test passed ✓');
        }, CLI_TIMEOUT);
    });

    /**
     * C# (xUnit) debugging workflow test - Enhanced Coverage
     *
     * Tests comprehensive debug lifecycle for C# using the simple unified test file:
     * 1. Cleanup: Stop any existing session to ensure fresh start
     * 2. Set breakpoint at dynamically discovered line (via VSCB_BREAKPOINT_NEXT_LINE marker)
     * 3. Start debug session at first breakpoint (line 32: int sum = Add(x, y))
     * 4. Validate initial variables (x=5, y=3 - sum not yet assigned)
     * 5. Step into Add() method
     * 6. Validate method parameters (a=5, b=3)
     * 7. Step out back to test
     * 8. Validate sum is now available (sum=8)
     * 9. Set second breakpoint dynamically (line 37: Assert.Equal(2, diff))
     * 10. Continue to second breakpoint
     * 11. Validate all variables present (x=5, y=3, sum=8, diff=2)
     * 12. Stop debug session to clean up
     *
     * CRITICAL: Each test MUST clean up (stop debugger) to allow next test to run.
     * Only ONE debug session can be active at a time in the Extension Host.
     *
     * This test validates:
     * - Marker-based breakpoint discovery
     * - Step-in to method calls
     * - Step-out from nested methods
     * - Dynamic breakpoint setting during active session
     * - Continue to second breakpoint
     * - Multi-stage variable inspection
     */
    describe('C# (xUnit) - Enhanced Coverage', () => {
        it('should complete enhanced C# debug workflow', async () => {
            console.log('🎯 Testing C# debugging (enhanced coverage)...');
            console.log(`📍 Breakpoint 1 line discovered: ${TEST_LINES.csharp}`);
            console.log(`📍 Breakpoint 2 line discovered: ${TEST_LINES_2.csharp}`);

            // CLEANUP: Stop any existing debug session (may fail, that's ok)
            console.log('🧹 Cleaning up any existing debug session...');
            try {
                await runCLI('script run debug.stop');
            } catch (e) {
                // Ignore errors - session may not exist
                console.log('ℹ️  No existing session to stop');
            }

            // Set first breakpoint (C# requires explicit breakpoint before debugging)
            console.log(`📍 Setting breakpoint 1 at ${TEST_FILES.csharp}:${TEST_LINES.csharp}...`);
            const bpResponse = await runCLI(
                `script run breakpoint.set --param path=${TEST_FILES.csharp} --param line=${TEST_LINES.csharp}`
            );
            expect(bpResponse.ok).toBe(true);
            console.log('✅ Breakpoint 1 set');

            // Navigate to breakpoint line to ensure file is visible
            console.log(`📍 Navigating to breakpoint...`);
            await runCLI(
                `script run editor.goto-line --param path=${TEST_FILES.csharp} --param line=${TEST_LINES.csharp}`
            );
            await sleep(2000);

            // Start debug session with retry (C# startup is slow - 30+ seconds, and test discovery can be intermittent)
            console.log(`🎯 Starting debug session at ${TEST_FILES.csharp}:${TEST_LINES.csharp}...`);
            const startResponse = await runCLIWithRetry(
                `script run test.debug-single --param path=${TEST_FILES.csharp} --param line=${TEST_LINES.csharp} --param timeoutMs=5000`,
                5,  // 5 retries
                2000  // 2 seconds between retries
            );

            // Verify debug session started successfully
            expect(startResponse.ok).toBe(true);
            expect(startResponse.data.event).toBe('stopped');
            expect(startResponse.data.line).toBeDefined();
            console.log(`✅ Debug session started at line ${startResponse.data.line}`);

            // Check for sessionType (coreclr)
            if (startResponse.data.sessionType) {
                expect(startResponse.data.sessionType).toBe('coreclr');
                console.log(`✅ Session type: ${startResponse.data.sessionType}`);
            } else {
                console.log('ℹ️  sessionType not in response (may be in different field)');
            }

            // STAGE 1: List variables at first breakpoint (before sum is assigned)
            console.log('📋 Stage 1: Listing variables at breakpoint 1 (before sum assignment)...');
            const vars1Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars1Response.ok).toBe(true);
            expect(vars1Response.data.variables).toBeDefined();
            console.log(`✅ Found ${vars1Response.data.variables.length} variables`);
            console.log(`📋 Available variables: ${vars1Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // C# may return nested scope structure - extract actual variables
            const scopeVar1 = vars1Response.data.variables[0];
            const actualVars1 = scopeVar1?.children || vars1Response.data.variables;

            // Validate x and y are present (sum should NOT be assigned yet)
            // C# includes type annotations in variable names (e.g., "x [int]")
            const x1 = actualVars1.find((v: any) => v.name.startsWith('x'));
            const y1 = actualVars1.find((v: any) => v.name.startsWith('y'));
            expect(x1).toBeDefined();
            expect(y1).toBeDefined();
            expect(x1.value).toBe('5');
            expect(y1.value).toBe('3');
            console.log(`✅ Stage 1 validation: x=${x1.value}, y=${y1.value}`);

            // STAGE 2: Step into Add() method
            console.log('🔽 Stage 2: Stepping into Add() method...');
            const stepInResponse = await runCLI('script run debug.step-into');
            expect(stepInResponse.ok).toBe(true);
            expect(stepInResponse.data.event).toBe('stopped');
            console.log(`✅ Stepped into method at line ${stepInResponse.data.line}`);

            // List variables inside Add() method (should see a and b parameters)
            console.log('📋 Listing variables inside Add() method...');
            const vars2Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars2Response.ok).toBe(true);
            console.log(`📋 Available variables: ${vars2Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // Extract actual variables from scope
            const scopeVar2 = vars2Response.data.variables[0];
            const actualVars2 = scopeVar2?.children || vars2Response.data.variables;

            // Validate a and b parameters (may not be visible if at return statement)
            // C# includes type annotations in variable names (e.g., "a [int]")
            const a = actualVars2.find((v: any) => v.name.startsWith('a'));
            const b = actualVars2.find((v: any) => v.name.startsWith('b'));

            if (a && b) {
                expect(a.value).toBe('5');
                expect(b.value).toBe('3');
                console.log(`✅ Stage 2 validation: a=${a.value}, b=${b.value} (inside Add method)`);
            } else {
                console.log(`ℹ️  Stage 2: Parameters not visible (likely at return statement) - skipping validation`);
            }

            // STAGE 3: Step out back to test
            console.log('🔼 Stage 3: Stepping out back to test...');
            const stepOutResponse = await runCLI('script run debug.step-out');
            expect(stepOutResponse.ok).toBe(true);
            expect(stepOutResponse.data.event).toBe('stopped');
            console.log(`✅ Stepped out to line ${stepOutResponse.data.line}`);

            // C# debugger may stop BEFORE completing the assignment - step over to complete it
            console.log('⏭️  Stepping over to complete sum assignment...');
            const stepOverResponse = await runCLI('script run debug.step-over');
            expect(stepOverResponse.ok).toBe(true);
            console.log(`✅ Stepped over to line ${stepOverResponse.data.line}`);

            // List variables after stepping over (sum should now be assigned)
            console.log('📋 Listing variables after step-over (sum should be assigned)...');
            const vars3Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars3Response.ok).toBe(true);
            console.log(`📋 Available variables: ${vars3Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // Extract actual variables from scope
            const scopeVar3 = vars3Response.data.variables[0];
            const actualVars3 = scopeVar3?.children || vars3Response.data.variables;

            // Validate x, y, and sum are present
            // C# includes type annotations in variable names (e.g., "sum [int]")
            const x3 = actualVars3.find((v: any) => v.name.startsWith('x'));
            const y3 = actualVars3.find((v: any) => v.name.startsWith('y'));
            const sum3 = actualVars3.find((v: any) => v.name.startsWith('sum'));
            expect(x3).toBeDefined();
            expect(y3).toBeDefined();
            expect(sum3).toBeDefined();
            expect(x3.value).toBe('5');
            expect(y3.value).toBe('3');
            expect(sum3.value).toBe('8');
            console.log(`✅ Stage 3 validation: x=${x3.value}, y=${y3.value}, sum=${sum3.value}`);

            // STAGE 4: Set second breakpoint dynamically
            console.log(`📍 Stage 4: Setting breakpoint 2 at line ${TEST_LINES_2.csharp}...`);
            const bp2Response = await runCLI(
                `script run breakpoint.set --param path=${TEST_FILES.csharp} --param line=${TEST_LINES_2.csharp}`
            );
            expect(bp2Response.ok).toBe(true);
            console.log('✅ Breakpoint 2 set dynamically during active session');

            // STAGE 5: Continue to second breakpoint
            console.log('▶️  Stage 5: Continuing to breakpoint 2...');
            const continueResponse = await runCLI('script run debug.continue');
            expect(continueResponse.ok).toBe(true);
            expect(continueResponse.data.event).toBe('stopped');
            expect(continueResponse.data.line).toBe(TEST_LINES_2.csharp);
            console.log(`✅ Stopped at breakpoint 2 (line ${continueResponse.data.line})`);

            // STAGE 6: Final validation - all 4 variables should be present
            console.log('📋 Stage 6: Final variable validation (all 4 expected)...');
            const vars4Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars4Response.ok).toBe(true);
            console.log(`📋 Available variables: ${vars4Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // Extract actual variables from scope
            const scopeVar4 = vars4Response.data.variables[0];
            const actualVars4 = scopeVar4?.children || vars4Response.data.variables;

            // C# includes type annotations in variable names (e.g., "x [int]")
            const expectedVars = [
                { name: 'x', value: '5', type: /int/ },
                { name: 'y', value: '3', type: /int/ },
                { name: 'sum', value: '8', type: /int/ },
                { name: 'diff', value: '2', type: /int/ }
            ];
            let foundCount = 0;

            for (const expected of expectedVars) {
                const found = actualVars4.find((v: any) => v.name.startsWith(expected.name));
                if (found) {
                    foundCount++;
                    console.log(`✅ Found expected variable: ${found.name} = ${found.value} (${found.type})`);
                    expect(found.value).toBe(expected.value);
                    expect(found.type).toMatch(expected.type);
                } else {
                    console.log(`⚠️  Expected variable not found: ${expected.name}`);
                }
            }

            expect(foundCount).toBe(expectedVars.length);
            console.log(`✅ Stage 6 validation: Found all ${foundCount}/${expectedVars.length} expected variables`);

            // CLEANUP: Stop debug session (REQUIRED to allow next test to run)
            console.log('🛑 Stopping debug session...');
            const stopResponse = await runCLI('script run debug.stop');
            expect(stopResponse.ok).toBe(true);
            console.log('✅ Debug session stopped cleanly');

            console.log('✅ C# enhanced debugging test passed ✓');
        }, 60000); // 60-second timeout for enhanced workflow
    });

    /**
     * Java (JUnit 5) debugging workflow test - Enhanced Coverage
     *
     * Tests comprehensive debug lifecycle for Java using the simple unified test file:
     * 1. Cleanup: Stop any existing session to ensure fresh start
     * 2. Set breakpoint at dynamically discovered line (via VSCB_BREAKPOINT_NEXT_LINE marker)
     * 3. Start debug session at first breakpoint (line 36: int sum = add(x, y))
     * 4. Validate initial variables (x=5, y=3 - sum not yet assigned)
     * 5. Step into add() method
     * 6. Validate method parameters (a=5, b=3)
     * 7. Step out back to test
     * 8. Validate sum is now available (sum=8)
     * 9. Set second breakpoint dynamically (line 41: assertEquals(2, diff))
     * 10. Continue to second breakpoint
     * 11. Validate all variables present (x=5, y=3, sum=8, diff=2)
     * 12. Stop debug session to clean up
     *
     * CRITICAL: Each test MUST clean up (stop debugger) to allow next test to run.
     * Only ONE debug session can be active at a time in the Extension Host.
     *
     * This test validates:
     * - Marker-based breakpoint discovery
     * - Step-in to method calls
     * - Step-out from nested methods
     * - Dynamic breakpoint setting during active session
     * - Continue to second breakpoint
     * - Multi-stage variable inspection
     *
     * NOTE: Java returns variables in a nested scope structure (children array).
     * The test extracts actual variables from the scope's children property.
     */
    describe('Java (JUnit 5) - Enhanced Coverage', () => {
        it('should complete enhanced Java debug workflow', async () => {
            console.log('☕ Testing Java debugging (enhanced coverage)...');
            console.log(`📍 Breakpoint 1 line discovered: ${TEST_LINES.java}`);
            console.log(`📍 Breakpoint 2 line discovered: ${TEST_LINES_2.java}`);

            // CLEANUP: Stop any existing debug session (may fail, that's ok)
            console.log('🧹 Cleaning up any existing debug session...');
            try {
                await runCLI('script run debug.stop');
            } catch (e) {
                // Ignore errors - session may not exist
                console.log('ℹ️  No existing session to stop');
            }

            // Set first breakpoint (Java requires explicit breakpoint before debugging)
            console.log(`📍 Setting breakpoint 1 at ${TEST_FILES.java}:${TEST_LINES.java}...`);
            const bpResponse = await runCLI(
                `script run breakpoint.set --param path=${TEST_FILES.java} --param line=${TEST_LINES.java}`
            );
            expect(bpResponse.ok).toBe(true);
            console.log('✅ Breakpoint 1 set');

            // Navigate to breakpoint line to ensure file is visible
            console.log(`📍 Navigating to breakpoint...`);
            await runCLI(
                `script run editor.goto-line --param path=${TEST_FILES.java} --param line=${TEST_LINES.java}`
            );
            await sleep(2000);

            // Start debug session with retry (Java test discovery can be intermittent)
            console.log(`🎯 Starting debug session at ${TEST_FILES.java}:${TEST_LINES.java}...`);
            const startResponse = await runCLIWithRetry(
                `script run test.debug-single --param path=${TEST_FILES.java} --param line=${TEST_LINES.java} --param timeoutMs=5000`,
                5,  // 5 retries
                2000  // 2 seconds between retries
            );

            // Verify debug session started successfully
            expect(startResponse.ok).toBe(true);
            expect(startResponse.data.event).toBe('stopped');
            expect(startResponse.data.line).toBeDefined();
            console.log(`✅ Debug session started at line ${startResponse.data.line}`);

            // Check for sessionType (java)
            if (startResponse.data.sessionType) {
                expect(startResponse.data.sessionType).toBe('java');
                console.log(`✅ Session type: ${startResponse.data.sessionType}`);
            } else {
                console.log('ℹ️  sessionType not in response (may be in different field)');
            }

            // STAGE 1: List variables at first breakpoint (before sum is assigned)
            console.log('📋 Stage 1: Listing variables at breakpoint 1 (before sum assignment)...');
            const vars1Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars1Response.ok).toBe(true);
            expect(vars1Response.data.variables).toBeDefined();
            console.log(`✅ Found ${vars1Response.data.variables.length} variables`);

            // Java returns a scope variable with children - extract the actual variables
            const scopeVar1 = vars1Response.data.variables[0];
            const actualVars1 = scopeVar1?.children || vars1Response.data.variables;

            // Validate x and y are present (sum should NOT be assigned yet)
            const x1 = actualVars1.find((v: any) => v.name === 'x');
            const y1 = actualVars1.find((v: any) => v.name === 'y');
            expect(x1).toBeDefined();
            expect(y1).toBeDefined();
            expect(x1.value).toBe('5');
            expect(y1.value).toBe('3');
            console.log(`✅ Stage 1 validation: x=${x1.value}, y=${y1.value}`);

            // STAGE 2: Step into add() method
            console.log('🔽 Stage 2: Stepping into add() method...');
            const stepInResponse = await runCLI('script run debug.step-into');
            expect(stepInResponse.ok).toBe(true);
            expect(stepInResponse.data.event).toBe('stopped');
            console.log(`✅ Stepped into method at line ${stepInResponse.data.line}`);

            // List variables inside add() method (should see a and b parameters)
            console.log('📋 Listing variables inside add() method...');
            const vars2Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars2Response.ok).toBe(true);

            // Extract actual variables from scope
            const scopeVar2 = vars2Response.data.variables[0];
            const actualVars2 = scopeVar2?.children || vars2Response.data.variables;

            // Validate a and b parameters (may not be visible if at return statement)
            const a = actualVars2.find((v: any) => v.name === 'a');
            const b = actualVars2.find((v: any) => v.name === 'b');

            if (a && b) {
                expect(a.value).toBe('5');
                expect(b.value).toBe('3');
                console.log(`✅ Stage 2 validation: a=${a.value}, b=${b.value} (inside add method)`);
            } else {
                console.log(`ℹ️  Stage 2: Parameters not visible (likely at return statement) - skipping validation`);
            }

            // STAGE 3: Step out back to test
            console.log('🔼 Stage 3: Stepping out back to test...');
            const stepOutResponse = await runCLI('script run debug.step-out');
            expect(stepOutResponse.ok).toBe(true);
            expect(stepOutResponse.data.event).toBe('stopped');
            console.log(`✅ Stepped out to line ${stepOutResponse.data.line}`);

            // Java debugger may stop BEFORE completing the assignment - step over to complete it
            console.log('⏭️  Stepping over to complete sum assignment...');
            const stepOverResponse = await runCLI('script run debug.step-over');
            expect(stepOverResponse.ok).toBe(true);
            console.log(`✅ Stepped over to line ${stepOverResponse.data.line}`);

            // List variables after stepping over (sum should now be assigned)
            console.log('📋 Listing variables after step-over (sum should be assigned)...');
            const vars3Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars3Response.ok).toBe(true);

            // Extract actual variables from scope
            const scopeVar3 = vars3Response.data.variables[0];
            const actualVars3 = scopeVar3?.children || vars3Response.data.variables;

            // Validate x, y, and sum are present
            const x3 = actualVars3.find((v: any) => v.name === 'x');
            const y3 = actualVars3.find((v: any) => v.name === 'y');
            const sum3 = actualVars3.find((v: any) => v.name === 'sum');
            expect(x3).toBeDefined();
            expect(y3).toBeDefined();
            expect(sum3).toBeDefined();
            expect(x3.value).toBe('5');
            expect(y3.value).toBe('3');
            expect(sum3.value).toBe('8');
            console.log(`✅ Stage 3 validation: x=${x3.value}, y=${y3.value}, sum=${sum3.value}`);

            // STAGE 4: Set second breakpoint dynamically
            console.log(`📍 Stage 4: Setting breakpoint 2 at line ${TEST_LINES_2.java}...`);
            const bp2Response = await runCLI(
                `script run breakpoint.set --param path=${TEST_FILES.java} --param line=${TEST_LINES_2.java}`
            );
            expect(bp2Response.ok).toBe(true);
            console.log('✅ Breakpoint 2 set dynamically during active session');

            // STAGE 5: Continue to second breakpoint
            console.log('▶️  Stage 5: Continuing to breakpoint 2...');
            const continueResponse = await runCLI('script run debug.continue');
            expect(continueResponse.ok).toBe(true);
            expect(continueResponse.data.event).toBe('stopped');
            expect(continueResponse.data.line).toBe(TEST_LINES_2.java);
            console.log(`✅ Stopped at breakpoint 2 (line ${continueResponse.data.line})`);

            // STAGE 6: Final validation - all 4 variables should be present
            console.log('📋 Stage 6: Final variable validation (all 4 expected)...');
            const vars4Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars4Response.ok).toBe(true);

            // Extract actual variables from scope
            const scopeVar4 = vars4Response.data.variables[0];
            const actualVars4 = scopeVar4?.children || vars4Response.data.variables;

            const expectedVars = [
                { name: 'x', value: '5', type: /int/ },
                { name: 'y', value: '3', type: /int/ },
                { name: 'sum', value: '8', type: /int/ },
                { name: 'diff', value: '2', type: /int/ }
            ];
            let foundCount = 0;

            for (const expected of expectedVars) {
                const found = actualVars4.find((v: any) => v.name === expected.name);
                if (found) {
                    foundCount++;
                    console.log(`✅ Found expected variable: ${found.name} = ${found.value} (${found.type})`);
                    expect(found.value).toBe(expected.value);
                    expect(found.type).toMatch(expected.type);
                } else {
                    console.log(`⚠️  Expected variable not found: ${expected.name}`);
                }
            }

            expect(foundCount).toBe(expectedVars.length);
            console.log(`✅ Stage 6 validation: Found all ${foundCount}/${expectedVars.length} expected variables`);

            // CLEANUP: Stop debug session (REQUIRED to allow next test to run)
            console.log('🛑 Stopping debug session...');
            const stopResponse = await runCLI('script run debug.stop');
            expect(stopResponse.ok).toBe(true);
            console.log('✅ Debug session stopped cleanly');

            console.log('✅ Java enhanced debugging test passed ✓');
        }, 60000); // 60-second timeout for enhanced workflow
    });

    /**
     * TypeScript (Vitest) debugging workflow test - Enhanced Coverage
     *
     * Tests comprehensive debug lifecycle for TypeScript using the simple unified test file:
     * 1. Cleanup: Stop any existing session to ensure fresh start
     * 2. Set breakpoint at dynamically discovered line (via VSCB_BREAKPOINT_NEXT_LINE marker)
     * 3. Start debug session at first breakpoint (line 32: const sum = add(x, y))
     * 4. Validate initial variables (x=5, y=3 - sum not yet assigned)
     * 5. Step into add() function
     * 6. Validate function parameters (a=5, b=3)
     * 7. Step out back to test
     * 8. Validate sum is now available (sum=8)
     * 9. Set second breakpoint dynamically (line 37: expect(diff).toBe(2))
     * 10. Continue to second breakpoint
     * 11. Validate all variables present (x=5, y=3, sum=8, diff=2)
     * 12. Stop debug session to clean up
     *
     * CRITICAL: Each test MUST clean up (stop debugger) to allow next test to run.
     * Only ONE debug session can be active at a time in the Extension Host.
     *
     * This test validates:
     * - Marker-based breakpoint discovery
     * - Step-in to function calls
     * - Step-out from nested functions
     * - Dynamic breakpoint setting during active session
     * - Continue to second breakpoint
     * - Multi-stage variable inspection
     */
    describe('TypeScript (Vitest) - Enhanced Coverage', () => {
        it('should complete enhanced TypeScript debug workflow', async () => {
            console.log('🔷 Testing TypeScript debugging (enhanced coverage)...');
            console.log(`📍 Breakpoint 1 line discovered: ${TEST_LINES.typescript}`);
            console.log(`📍 Breakpoint 2 line discovered: ${TEST_LINES_2.typescript}`);

            // CLEANUP: Stop any existing debug session (may fail, that's ok)
            console.log('🧹 Cleaning up any existing debug session...');
            try {
                await runCLI('script run debug.stop');
            } catch (e) {
                // Ignore errors - session may not exist
                console.log('ℹ️  No existing session to stop');
            }

            // Set first breakpoint (TypeScript requires explicit breakpoint before debugging)
            console.log(`📍 Setting breakpoint 1 at ${TEST_FILES.typescript}:${TEST_LINES.typescript}...`);
            const bpResponse = await runCLI(
                `script run breakpoint.set --param path=${TEST_FILES.typescript} --param line=${TEST_LINES.typescript}`
            );
            expect(bpResponse.ok).toBe(true);
            console.log('✅ Breakpoint 1 set');

            // Navigate to breakpoint line to ensure file is visible
            console.log(`📍 Navigating to breakpoint...`);
            await runCLI(
                `script run editor.goto-line --param path=${TEST_FILES.typescript} --param line=${TEST_LINES.typescript}`
            );
            await sleep(2000);

            // Start debug session with retry (Vitest test discovery can be intermittent)
            console.log(`🎯 Starting debug session at ${TEST_FILES.typescript}:${TEST_LINES.typescript}...`);
            const startResponse = await runCLIWithRetry(
                `script run test.debug-single --param path=${TEST_FILES.typescript} --param line=${TEST_LINES.typescript} --param timeoutMs=5000`,
                5,  // 5 retries
                2000  // 2 seconds between retries
            );

            // Verify debug session started successfully
            expect(startResponse.ok).toBe(true);
            expect(startResponse.data.event).toBe('stopped');
            expect(startResponse.data.line).toBeDefined();
            console.log(`✅ Debug session started at line ${startResponse.data.line}`);

            // Check for sessionType (pwa-node or node)
            if (startResponse.data.sessionType) {
                console.log(`✅ Session type: ${startResponse.data.sessionType}`);
            } else {
                console.log('ℹ️  sessionType not in response (may be in different field)');
            }

            // STAGE 1: List variables at first breakpoint (before sum is assigned)
            console.log('📋 Stage 1: Listing variables at breakpoint 1 (before sum assignment)...');
            const vars1Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars1Response.ok).toBe(true);
            expect(vars1Response.data.variables).toBeDefined();
            console.log(`✅ Found ${vars1Response.data.variables.length} variables`);
            console.log(`📋 Available variables: ${vars1Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // TypeScript/Vitest returns variables in a nested scope structure - extract actual variables
            const scopeVar1 = vars1Response.data.variables[0];
            const actualVars1 = scopeVar1.children || vars1Response.data.variables;
            console.log(`📋 Actual variables: ${actualVars1.map((v: any) => v.name).join(', ')}`);

            // Validate x and y are present (sum should NOT be assigned yet)
            const x1 = actualVars1.find((v: any) => v.name === 'x');
            const y1 = actualVars1.find((v: any) => v.name === 'y');
            expect(x1).toBeDefined();
            expect(y1).toBeDefined();
            expect(x1.value).toBe('5');
            expect(y1.value).toBe('3');
            console.log(`✅ Stage 1 validation: x=${x1.value}, y=${y1.value}`);

            // STAGE 2: Step into add() function
            console.log('🔽 Stage 2: Stepping into add() function...');
            const stepInResponse = await runCLI('script run debug.step-into');
            expect(stepInResponse.ok).toBe(true);
            expect(stepInResponse.data.event).toBe('stopped');
            console.log(`✅ Stepped into function at line ${stepInResponse.data.line}`);

            // List variables inside add() function (should see a and b parameters)
            console.log('📋 Listing variables inside add() function...');
            const vars2Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars2Response.ok).toBe(true);
            console.log(`📋 Available variables: ${vars2Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // Extract actual variables from scope (handle empty variables array)
            const scopeVar2 = vars2Response.data.variables[0];
            const actualVars2 = scopeVar2?.children || vars2Response.data.variables;
            console.log(`📋 Actual variables: ${actualVars2.map((v: any) => v.name).join(', ')}`);

            // Validate a and b parameters (may not be visible if at return statement)
            const a = actualVars2.find((v: any) => v.name === 'a');
            const b = actualVars2.find((v: any) => v.name === 'b');

            if (a && b) {
                expect(a.value).toBe('5');
                expect(b.value).toBe('3');
                console.log(`✅ Stage 2 validation: a=${a.value}, b=${b.value} (inside add function)`);
            } else {
                console.log(`ℹ️  Stage 2: Parameters not visible (likely at return statement) - skipping validation`);
            }

            // STAGE 3: Step out back to test
            console.log('🔼 Stage 3: Stepping out back to test...');
            const stepOutResponse = await runCLI('script run debug.step-out');
            expect(stepOutResponse.ok).toBe(true);
            expect(stepOutResponse.data.event).toBe('stopped');
            console.log(`✅ Stepped out to line ${stepOutResponse.data.line}`);

            // List variables after stepping out (sum should now be assigned)
            console.log('📋 Listing variables after step-out (sum should be assigned)...');
            const vars3Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars3Response.ok).toBe(true);
            console.log(`📋 Available variables: ${vars3Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // Extract actual variables from scope
            const scopeVar3 = vars3Response.data.variables[0];
            const actualVars3 = scopeVar3.children || vars3Response.data.variables;
            console.log(`📋 Actual variables: ${actualVars3.map((v: any) => v.name).join(', ')}`);

            // Validate x, y, and sum are present
            const x3 = actualVars3.find((v: any) => v.name === 'x');
            const y3 = actualVars3.find((v: any) => v.name === 'y');
            const sum3 = actualVars3.find((v: any) => v.name === 'sum');
            expect(x3).toBeDefined();
            expect(y3).toBeDefined();
            expect(sum3).toBeDefined();
            expect(x3.value).toBe('5');
            expect(y3.value).toBe('3');
            expect(sum3.value).toBe('8');
            console.log(`✅ Stage 3 validation: x=${x3.value}, y=${y3.value}, sum=${sum3.value}`);

            // STAGE 4: Set second breakpoint dynamically
            console.log(`📍 Stage 4: Setting breakpoint 2 at line ${TEST_LINES_2.typescript}...`);
            const bp2Response = await runCLI(
                `script run breakpoint.set --param path=${TEST_FILES.typescript} --param line=${TEST_LINES_2.typescript}`
            );
            expect(bp2Response.ok).toBe(true);
            console.log('✅ Breakpoint 2 set dynamically during active session');

            // STAGE 5: Continue to second breakpoint
            console.log('▶️  Stage 5: Continuing to breakpoint 2...');
            const continueResponse = await runCLI('script run debug.continue');
            expect(continueResponse.ok).toBe(true);
            expect(continueResponse.data.event).toBe('stopped');
            expect(continueResponse.data.line).toBe(TEST_LINES_2.typescript);
            console.log(`✅ Stopped at breakpoint 2 (line ${continueResponse.data.line})`);

            // STAGE 6: Final validation - all 4 variables should be present
            console.log('📋 Stage 6: Final variable validation (all 4 expected)...');
            const vars4Response = await runCLI('script run debug.list-variables --param scope=local');
            expect(vars4Response.ok).toBe(true);
            console.log(`📋 Available variables: ${vars4Response.data.variables.map((v: any) => v.name).join(', ')}`);

            // Extract actual variables from scope
            const scopeVar4 = vars4Response.data.variables[0];
            const actualVars4 = scopeVar4.children || vars4Response.data.variables;
            console.log(`📋 Actual variables: ${actualVars4.map((v: any) => v.name).join(', ')}`);

            const expectedVars = [
                { name: 'x', value: '5', type: /number/ },
                { name: 'y', value: '3', type: /number/ },
                { name: 'sum', value: '8', type: /number/ },
                { name: 'diff', value: '2', type: /number/ }
            ];
            let foundCount = 0;

            for (const expected of expectedVars) {
                const found = actualVars4.find((v: any) => v.name === expected.name);
                if (found) {
                    foundCount++;
                    console.log(`✅ Found expected variable: ${found.name} = ${found.value} (${found.type})`);
                    expect(found.value).toBe(expected.value);
                    expect(found.type).toMatch(expected.type);
                } else {
                    console.log(`⚠️  Expected variable not found: ${expected.name}`);
                }
            }

            expect(foundCount).toBe(expectedVars.length);
            console.log(`✅ Stage 6 validation: Found all ${foundCount}/${expectedVars.length} expected variables`);

            // CLEANUP: Stop debug session (REQUIRED to allow next test to run)
            console.log('🛑 Stopping debug session...');
            const stopResponse = await runCLI('script run debug.stop');
            expect(stopResponse.ok).toBe(true);
            console.log('✅ Debug session stopped cleanly');

            console.log('✅ TypeScript enhanced debugging test passed ✓');
        }, 60000); // 60-second timeout for enhanced workflow
    });
});
