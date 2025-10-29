/**
 * Smoke Test - Unified Test Architecture
 *
 * This test validates the runner abstraction layer by testing both CLI and MCP
 * transports with a simple smoke test: start Extension Host → get status → stop.
 *
 * Test Factory Pattern:
 * - createSmokeTests() generates test suite for a given runner
 * - Same test logic executes for both CLIRunner and MCPRunner
 * - Test output clearly shows which runner is being tested
 *
 * Success Criteria:
 * - Both runners can start Extension Host
 * - Both runners can retrieve status successfully
 * - Both runners can stop cleanly
 * - No test code duplication
 */

import { describe, test, expect } from 'vitest';
import { DebugRunner } from './runners/DebugRunner';
import { CLIRunner } from './runners/CLIRunner';
import { MCPRunner } from './runners/MCPRunner';

/**
 * Parameterized test factory for smoke testing
 *
 * Generates a test suite that can run against any DebugRunner implementation.
 * This pattern eliminates code duplication while ensuring both transports are
 * tested identically.
 *
 * @param runnerName - Human-readable name (e.g., "CLI", "MCP")
 * @param getRunner - Factory function that creates a runner instance
 */
function createSmokeTests(runnerName: string, getRunner: () => DebugRunner) {
    describe(`${runnerName} Smoke Tests`, () => {
        let runner: DebugRunner;

        test('should start extension, get status, and stop', async () => {
            runner = getRunner();

            // Step 1: Start debug session (launches Extension Host)
            console.log(`[${runnerName}] Starting debug session...`);
            const startResult = await runner.startDebug({
                type: 'node',
                program: '/dummy/path',
                cwd: '/dummy/cwd'
            });

            // Verify start succeeded
            expect(startResult.success, `[${runnerName}] Failed to start: ${startResult.error}`).toBe(true);
            expect(startResult.data).toBeDefined();
            expect(startResult.data?.status).toBe('started');
            console.log(`[${runnerName}] ✅ Debug session started`);

            // Step 2: Get status (verify bridge is healthy)
            console.log(`[${runnerName}] Getting status...`);
            const statusResult = await runner.getStatus();

            // Verify status succeeded and bridge is healthy
            expect(statusResult.success, `[${runnerName}] Failed to get status: ${statusResult.error}`).toBe(true);
            expect(statusResult.data).toBeDefined();
            expect(statusResult.data?.healthy, `[${runnerName}] Bridge not healthy`).toBe(true);
            console.log(`[${runnerName}] ✅ Status retrieved, bridge is healthy`);

            // Step 3: Stop debug session
            console.log(`[${runnerName}] Stopping debug session...`);
            const stopResult = await runner.stopDebug();

            // Verify stop succeeded (or was already stopped)
            expect(stopResult.success, `[${runnerName}] Failed to stop: ${stopResult.error}`).toBe(true);
            console.log(`[${runnerName}] ✅ Debug session stopped`);

        }, 120000); // 2-minute timeout for Extension Host startup
    });
}

// Execute smoke tests for both runners
createSmokeTests('CLI', () => new CLIRunner());
createSmokeTests('MCP', () => new MCPRunner());
