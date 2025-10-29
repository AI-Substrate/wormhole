/**
 * Unified Debug Integration Test
 *
 * This test validates VSC-Bridge's debugging capabilities using the runner
 * abstraction layer. The same test logic runs against both CLI and MCP transports,
 * eliminating code duplication and ensuring consistent coverage.
 *
 * Architecture:
 * - DebugRunner interface: Transport-agnostic abstraction
 * - CLIRunner: Wraps CLI commands
 * - MCPRunner: Wraps MCP protocol
 * - Workflows: Shared test logic (Python, JS, C#, Java, TypeScript)
 *
 * Testing Approach: Manual Only (no mocking)
 * - Tests execute real debug operations against actual Extension Host
 * - Extension Host must be running (launched programmatically in beforeAll)
 * - All paths resolved via runner.resolvePath() for cross-platform support
 * - 30-second timeout per operation for reliability
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DebugRunner } from './runners/DebugRunner';
import { CLIRunner } from './runners/CLIRunner';
import { MCPRunner } from './runners/MCPRunner';
import { pythonEnhancedDebugWorkflow } from './workflows/python-workflow';
import { javaEnhancedDebugWorkflow } from './workflows/java-workflow';
import { csharpEnhancedDebugWorkflow } from './workflows/csharp-workflow';
import { typescriptEnhancedDebugWorkflow } from './workflows/typescript-workflow';
import { dartEnhancedDebugWorkflow } from './workflows/dart-workflow';

/**
 * Extension Host startup delay (10 seconds)
 */
const EXTENSION_STARTUP_DELAY = 10000;

/**
 * Sleep helper function
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parameterized test factory for unified debugging tests
 *
 * This factory creates a complete test suite for a given runner implementation.
 * The same workflow logic executes for both CLI and MCP runners, ensuring
 * identical test coverage and eliminating duplication.
 *
 * @param runnerName - Human-readable name (e.g., "CLI", "MCP")
 * @param createRunner - Factory function that creates and initializes a runner instance
 */
function createUnifiedDebugTests(
    runnerName: string,
    createRunner: () => DebugRunner,
    setupRunner?: (runner: DebugRunner) => Promise<void>
) {
    describe(`${runnerName} - Unified Debug Tests`, () => {
        let runner: DebugRunner;

        /**
         * Setup: Launch Extension Host and initialize runner
         *
         * This follows the EXACT pattern from:
         * - cross-language-debug.test.ts (CLI pattern)
         * - stdio-e2e.test.ts (MCP pattern)
         *
         * Critical sequence:
         * 1. Launch Extension Host via CLI
         * 2. Wait 10s for initialization
         * 3. Poll bridge health (retry up to 6 times, 5s intervals)
         * 4. [MCP ONLY] Initialize MCP client AFTER bridge is healthy
         * 5. Trigger test discovery
         * 6. Wait 5s for test discovery
         * 7. Stop discovery debug session
         * 8. [MCP ONLY] Clear breakpoints from discovery
         */
        beforeAll(async () => {
            console.log(`⚙️  Setting up ${runnerName} test infrastructure...`);

            // Create runner instance
            runner = createRunner();

            // STEP 1: Launch Extension Host via CLI
            console.log('🚀 Launching Extension Host...');
            const launchResult = await runner.startDebug({
                type: 'node',
                program: '',
                cwd: ''
            });
            expect(launchResult.success, `Failed to launch Extension Host: ${launchResult.error}`).toBe(true);
            console.log('✅ Extension Host launched');

            // STEP 2: Wait 10s for initialization
            console.log('⏳ Waiting 10s for initialization...');
            await sleep(EXTENSION_STARTUP_DELAY);

            // STEP 3: Trigger test discovery (enables Python test discovery)
            console.log('🔍 Triggering test discovery...');
            try {
                // Both runners use CLI for this - Extension Host operation
                const mcpRunner = runner as any;
                await mcpRunner.runCLI('script run editor.show-testing-ui');
                console.log('✅ Testing view shown');
            } catch (e) {
                // Command may not return JSON - that's ok, it still triggers discovery
                console.log('ℹ️  Testing view triggered (no JSON response expected)');
            }

            // STEP 4: Wait 5s for test discovery to complete
            console.log('⏳ Waiting 5s for test discovery to complete...');
            await sleep(5000);

            // STEP 5: Stop any debug session from discovery
            console.log('🧹 Stopping any debug session from discovery...');
            try {
                await runner.stopDebug();
            } catch (e) {
                // Ignore - no session may be active
            }

            // STEP 6: Poll bridge health (retry up to 6 times, 5s intervals)
            console.log('⏳ Polling bridge health (30s timeout, 5s intervals)...');
            let healthy = false;
            for (let attempt = 1; attempt <= 6; attempt++) {
                try {
                    const statusResult = await runner.getStatus();
                    if (statusResult.success && statusResult.data?.healthy) {
                        console.log(`✅ Bridge is healthy (attempt ${attempt}/6)`);
                        healthy = true;
                        break;
                    }
                } catch (e) {
                    console.log(`ℹ️  Attempt ${attempt}/6: Bridge not ready yet`);
                }

                if (attempt < 6) {
                    await sleep(5000);
                }
            }
            expect(healthy, 'Bridge failed to become healthy after 30 seconds').toBe(true);

            // STEP 7: [MCP ONLY] Initialize MCP client NOW (after bridge is healthy)
            if (runnerName === 'MCP') {
                console.log('🔗 Initializing MCP client connection...');
                const mcpRunner = runner as any;
                if (mcpRunner.initialize) {
                    await mcpRunner.initialize();
                    console.log('✅ MCP client connected');
                } else {
                    throw new Error('MCPRunner does not have initialize() method');
                }
            }

            // STEP 8: Clear breakpoints from test discovery (BOTH runners need this!)
            // Test discovery leaves stale breakpoints that can cause timeouts
            console.log('🧹 Clearing breakpoints from test discovery...');
            try {
                await runner.clearProjectBreakpoints();
                console.log('✅ Breakpoints cleared');
            } catch (e) {
                console.log('ℹ️  No breakpoints to clear');
            }

            console.log(`✅ ${runnerName} test infrastructure ready`);
        }, 120000); // 120-second timeout for setup

        /**
         * Cleanup: Stop Extension Host
         *
         * CRITICAL: This matches cross-language-debug.test.ts (line 290).
         * The afterAll calls debug.stop with fromRoot=true, which is DIFFERENT
         * from calling it inside tests (fromRoot=false from test/ workspace).
         *
         * Inside test (fromRoot=false): Stops debug session in active workspace
         * AfterAll (fromRoot=true): Stops Extension Host from project root
         */
        afterAll(async () => {
            console.log(`🧹 Cleaning up ${runnerName} test infrastructure...`);

            if (runner) {
                // For MCP runner: cleanup client connection first
                if (runnerName === 'MCP') {
                    const mcpRunner = runner as any;
                    if (mcpRunner.cleanup) {
                        await mcpRunner.cleanup();
                        console.log('✅ MCP client cleaned up');
                    }
                }

                // Stop Extension Host via CLI from PROJECT ROOT
                // This is CRITICAL: fromRoot=true (different from in-test debug.stop)
                const anyRunner = runner as any;
                try {
                    await anyRunner.runCLI('script run debug.stop', true);
                    console.log('✅ Extension Host stopped');
                } catch (e) {
                    // Ignore errors - Extension Host may not be running
                    console.log('ℹ️  No Extension Host to stop');
                }

                console.log(`✅ ${runnerName} test infrastructure cleaned up`);
            }
        });

        /**
         * Smoke test: Verify runner communication works
         */
        it('should verify bridge status', async () => {
            console.log(`🧪 Running ${runnerName} smoke test...`);

            const statusResult = await runner.getStatus();

            expect(statusResult.success).toBe(true);
            expect(statusResult.data).toBeDefined();
            expect(statusResult.data?.healthy).toBe(true);
            console.log(`✅ ${runnerName} smoke test passed`);
        }, 30000);

        /**
         * Python Enhanced Debug Workflow
         *
         * Comprehensive Python debugging test with 6 stages:
         * - Stage 1: Initial variable inspection
         * - Stage 2: Step into function
         * - Stage 3: Step out and verify assignment
         * - Stage 4: Dynamic breakpoint setting
         * - Stage 5: Continue to second breakpoint
         * - Stage 6: Final variable validation
         */
        describe('Python (pytest) - Enhanced Coverage', () => {
            it('should complete enhanced Python debug workflow', async () => {
                await pythonEnhancedDebugWorkflow(runner);
            }, 60000); // 60-second timeout for enhanced workflow
        });

        /**
         * JavaScript (Jest) - SKIPPED
         *
         * JavaScript test is marked as skip in the original test file.
         * It uses a different workflow structure (no step operations, has object expansion)
         * and is not suitable for the enhanced coverage pattern.
         */
        describe.skip('JavaScript (Jest) - Object Expansion', () => {
            it('should test JavaScript object expansion workflow', async () => {
                // Not implemented - JavaScript uses a different workflow pattern
                // Original test at cross-language-debug.test.ts lines 551-697
            });
        });

        /**
         * C# Enhanced Debug Workflow
         *
         * Comprehensive C# debugging test with 6 stages.
         * Key difference: C# includes type annotations in variable names (e.g., "x [int]")
         */
        describe('C# (xUnit) - Enhanced Coverage', () => {
            it('should complete enhanced C# debug workflow', async () => {
                await csharpEnhancedDebugWorkflow(runner);
            }, 60000); // 60-second timeout for enhanced workflow
        });

        /**
         * Java Enhanced Debug Workflow
         *
         * Comprehensive Java debugging test with 6 stages.
         * Key difference: Requires retry logic for test discovery (5 retries, 2s delay)
         */
        describe('Java (JUnit 5) - Enhanced Coverage', () => {
            it('should complete enhanced Java debug workflow', async () => {
                await javaEnhancedDebugWorkflow(runner);
            }, 60000); // 60-second timeout for enhanced workflow
        });

        /**
         * TypeScript Enhanced Debug Workflow
         *
         * Comprehensive TypeScript debugging test with 6 stages.
         * Key differences:
         * - Does NOT require step-over after step-out (unique)
         * - Uses /number/ type pattern instead of /int/
         * - Requires retry logic for Vitest test discovery
         */
        describe('TypeScript (Vitest) - Enhanced Coverage', () => {
            it('should complete enhanced TypeScript debug workflow', async () => {
                await typescriptEnhancedDebugWorkflow(runner);
            }, 60000); // 60-second timeout for enhanced workflow
        });

        /**
         * Dart Enhanced Debug Workflow
         *
         * Comprehensive Dart debugging test with 6 stages:
         * - Stage 1: Initial variable inspection
         * - Stage 2: Step into function
         * - Stage 3: Step out and verify assignment
         * - Stage 4: Dynamic breakpoint setting
         * - Stage 5: Continue to second breakpoint
         * - Stage 6: Final variable validation
         *
         * NOTE: Expected to FAIL in Phase 0 (no DartDebugAdapter implemented yet)
         */
        describe('Dart (package:test) - Enhanced Coverage', () => {
            it('should complete enhanced Dart debug workflow', async () => {
                await dartEnhancedDebugWorkflow(runner);
            }, 60000); // 60-second timeout for enhanced workflow
        });
    });
}

// ========== Execute Unified Tests for Both Runners ==========

/**
 * IMPORTANT: These test suites MUST run sequentially, not in parallel.
 * Both CLI and MCP runners need exclusive access to the Extension Host.
 * Running them concurrently causes conflicts and test failures.
 */

/**
 * CLI Runner Tests
 *
 * Tests debug operations via CLI commands (script run debug.*)
 */
describe.sequential('Sequential Runner Tests', () => {
    createUnifiedDebugTests('CLI', () => new CLIRunner());

    /**
     * MCP Runner Tests
     *
     * Tests debug operations via MCP protocol (tools/call with debug_* tools)
     */
    createUnifiedDebugTests('MCP', () => new MCPRunner());
});
