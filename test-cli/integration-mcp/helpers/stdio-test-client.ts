/**
 * Stdio Test Client Helper
 *
 * This helper provides infrastructure for running MCP integration tests via stdio transport.
 * It handles:
 * - Spawning the MCP server subprocess (`vscb mcp`)
 * - Launching the Extension Host programmatically
 * - Polling bridge health until ready
 * - Creating MCP client connected via StdioClientTransport
 * - Cleanup (stopping Extension Host + killing subprocess)
 *
 * Usage:
 * ```typescript
 * const { client, cleanup } = await setupStdioTestEnvironment();
 * try {
 *   const tools = await client.request({ method: 'tools/list' }, ListToolsResultSchema);
 *   // ... test MCP protocol ...
 * } finally {
 *   await cleanup();
 * }
 * ```
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { spawn, ChildProcess } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Configuration for stdio test environment
 */
export interface StdioTestEnvironment {
    client: Client;
    cleanup: () => Promise<void>;
}

/**
 * Project paths (matching cross-language-debug.test.ts pattern)
 */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const TEST_WORKSPACE = path.join(PROJECT_ROOT, 'test');
const CLI_PATH = path.join(PROJECT_ROOT, 'cli', 'dist', 'index.js');

/**
 * Timeouts (matching cross-language-debug.test.ts pattern)
 */
const EXTENSION_STARTUP_DELAY = 10000; // 10 seconds
const CLI_TIMEOUT = 30000; // 30 seconds

/**
 * Sleep helper function
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute CLI command (for Extension Host lifecycle management)
 *
 * This is used to launch and stop the Extension Host. The MCP server itself
 * is spawned as a subprocess, not via this function.
 *
 * @param command CLI command (without 'node dist/index.js' prefix)
 * @param fromRoot If true, run from vsc-bridge root; if false, run from test/ workspace
 * @returns Parsed JSON response from CLI
 */
async function runCLI(command: string, fromRoot: boolean = false): Promise<any> {
    const env = {
        ...process.env,
        NODE_ENV: 'production',
        OCLIF_TS_NODE: '0',
        TS_NODE_PROJECT: '',
    };

    const cwd = fromRoot ? PROJECT_ROOT : TEST_WORKSPACE;

    const { stdout, stderr } = await execAsync(
        `node ${CLI_PATH} ${command}`,
        {
            cwd,
            timeout: CLI_TIMEOUT,
            env,
            maxBuffer: 10 * 1024 * 1024  // 10MB buffer
        }
    );

    // Ignore info logs and warnings in stderr
    if (stderr && !stderr.includes('warning') && !stderr.includes('ℹ')) {
        throw new Error(`CLI error: ${stderr}`);
    }

    // Parse JSON response
    try {
        return JSON.parse(stdout);
    } catch (e) {
        const parseError = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to parse CLI response: ${parseError}\nOutput: ${stdout.substring(0, 500)}`);
    }
}

/**
 * Execute MCP tool call with retry logic for test discovery stability
 *
 * Matches the retry pattern from HTTP tests (5 retries, 2-second delay).
 * Used for operations that may fail due to test discovery timing issues.
 *
 * @param client MCP client instance
 * @param toolName Name of the MCP tool to call
 * @param args Tool arguments
 * @param maxAttempts Maximum retry attempts (default 5)
 * @param delayMs Delay between retries in milliseconds (default 2000)
 * @returns Parsed JSON response from the tool
 */
export async function callMCPToolWithRetry(
    client: Client,
    toolName: string,
    args: Record<string, any>,
    maxAttempts: number = 5,
    delayMs: number = 2000
): Promise<any> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`[MCP Retry] Attempt ${attempt}/${maxAttempts}: ${toolName}`);

            const result = await client.request(
                {
                    method: 'tools/call',
                    params: {
                        name: toolName,
                        arguments: args
                    }
                },
                { type: 'object' } as any // CallToolResultSchema
            );

            // Parse response
            const content = (result as any).content?.[0];
            if (content?.type === 'text') {
                console.log(`[MCP Retry] ✅ Success on attempt ${attempt}`);
                return JSON.parse(content.text);
            }

            throw new Error(`Unexpected MCP response format from ${toolName}`);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[MCP Retry] ❌ Attempt ${attempt} failed: ${errorMsg}`);

            if (attempt < maxAttempts) {
                console.log(`[MCP Retry] ⏳ Waiting ${delayMs}ms before retry...`);
                await sleep(delayMs);
            } else {
                throw error;
            }
        }
    }

    throw new Error(`callMCPToolWithRetry: All ${maxAttempts} attempts failed`);
}

/**
 * Poll bridge health until ready or timeout
 *
 * Polls the `status --json` command every 5 seconds for up to 30 seconds
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

    throw new Error('❌ Bridge failed to become healthy after 30 seconds');
}

/**
 * Launch Extension Host programmatically
 *
 * Uses the debug.start command to launch the Extension Host with the test workspace.
 * This matches the pattern from cross-language-debug.test.ts lines 180-234.
 *
 * @throws Error if Extension Host fails to launch
 */
async function launchExtensionHost(): Promise<void> {
    console.log('🚀 Launching Extension Host...');

    // Stop any existing Extension Host first (may fail, that's ok)
    try {
        await runCLI('script run debug.stop', true);
        console.log('✅ Existing Extension Host stopped');
    } catch (e) {
        console.log('ℹ️  No existing Extension Host to stop');
    }

    // Launch Extension Host
    const launchResult = await runCLI('script run debug.start --param launch="Run Extension"', true);
    if (!launchResult.ok) {
        throw new Error('Failed to launch Extension Host');
    }
    console.log('✅ Extension Host launched');

    // Wait for extension to fully initialize
    console.log(`⏳ Waiting ${EXTENSION_STARTUP_DELAY / 1000}s for initialization...`);
    await sleep(EXTENSION_STARTUP_DELAY);

    // Poll bridge health
    await waitForBridgeReady();

    console.log('✅ Extension Host ready');
}

/**
 * Stop Extension Host
 *
 * Stops the running Extension Host. This is called during cleanup.
 */
async function stopExtensionHost(): Promise<void> {
    console.log('🧹 Stopping Extension Host...');

    try {
        await runCLI('script run debug.stop', true);
        console.log('✅ Extension Host stopped');
    } catch (e) {
        console.log('ℹ️  No Extension Host to stop');
    }
}

/**
 * Spawn MCP server subprocess
 *
 * Spawns `vscb mcp --workspace <test-workspace>` as a subprocess.
 * The subprocess communicates via stdin/stdout, which is used by StdioClientTransport.
 *
 * @returns ChildProcess handle
 */
function spawnMcpServer(): ChildProcess {
    console.log('🚀 Spawning MCP server subprocess...');

    // Spawn: node dist/index.js mcp --workspace <test-workspace>
    const mcpProcess = spawn(
        'node',
        [CLI_PATH, 'mcp', '--workspace', TEST_WORKSPACE],
        {
            cwd: PROJECT_ROOT,
            stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
            env: {
                ...process.env,
                NODE_ENV: 'production',
            }
        }
    );

    // Log stderr for debugging (MCP server logs go to stderr)
    mcpProcess.stderr?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        if (message) {
            console.log(`[MCP stderr] ${message}`);
        }
    });

    // Handle process exit
    mcpProcess.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
            console.warn(`⚠️  MCP server exited with code ${code}`);
        } else if (signal) {
            console.log(`ℹ️  MCP server killed with signal ${signal}`);
        }
    });

    console.log(`✅ MCP server subprocess spawned (PID: ${mcpProcess.pid})`);
    return mcpProcess;
}

/**
 * Kill MCP server subprocess gracefully
 *
 * Attempts SIGTERM first, then SIGKILL after 5 seconds if process doesn't exit.
 *
 * @param mcpProcess The subprocess to kill
 */
async function killMcpServer(mcpProcess: ChildProcess): Promise<void> {
    if (!mcpProcess.pid || mcpProcess.killed) {
        console.log('ℹ️  MCP server already killed');
        return;
    }

    console.log('🛑 Killing MCP server subprocess...');

    // Try SIGTERM first (graceful shutdown)
    mcpProcess.kill('SIGTERM');

    // Wait 5 seconds for graceful shutdown
    const gracefulTimeout = 5000;
    const startTime = Date.now();

    while (!mcpProcess.killed && Date.now() - startTime < gracefulTimeout) {
        await sleep(100);
    }

    // If still running, force kill with SIGKILL
    if (!mcpProcess.killed) {
        console.warn('⚠️  MCP server did not exit gracefully, forcing SIGKILL...');
        mcpProcess.kill('SIGKILL');
        await sleep(500); // Give it time to die
    }

    console.log('✅ MCP server subprocess killed');
}

/**
 * Setup stdio test environment
 *
 * This is the main entry point for stdio E2E tests. It:
 * 1. Launches Extension Host
 * 2. Spawns MCP server subprocess
 * 3. Creates MCP client connected via StdioClientTransport
 * 4. Returns client and cleanup function
 *
 * Usage:
 * ```typescript
 * beforeAll(async () => {
 *   env = await setupStdioTestEnvironment();
 * }, 120000); // 120-second timeout
 *
 * afterAll(async () => {
 *   await env.cleanup();
 * });
 * ```
 *
 * @returns StdioTestEnvironment with client and cleanup function
 */
export async function setupStdioTestEnvironment(): Promise<StdioTestEnvironment> {
    console.log('⚙️  Setting up stdio test environment...');

    // Step 1: Launch Extension Host
    await launchExtensionHost();

    // Step 2: Spawn MCP server subprocess
    const mcpProcess = spawnMcpServer();

    // Step 3: Create MCP client connected via stdio
    const transport = new StdioClientTransport({
        command: 'node',
        args: [CLI_PATH, 'mcp', '--workspace', TEST_WORKSPACE],
        stderr: 'pipe' // Capture stderr for logging
    });

    const client = new Client(
        { name: 'stdio-test-client', version: '1.0.0' },
        { capabilities: {} }
    );

    console.log('🔗 Connecting MCP client...');
    await client.connect(transport);
    console.log('✅ MCP client connected');

    // Step 4: Verify MCP server is responsive (try tools/list)
    console.log('🔍 Verifying MCP server is responsive...');
    try {
        const tools = await client.request(
            { method: 'tools/list', params: {} },
            ListToolsResultSchema
        );
        console.log(`✅ MCP server responded with ${tools.tools?.length || 0} tools`);
    } catch (e) {
        throw new Error(`MCP server not responsive: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Step 5: Return client and cleanup function
    const cleanup = async () => {
        console.log('🧹 Cleaning up stdio test environment...');

        // Close MCP client (closes transport)
        try {
            await client.close();
            console.log('✅ MCP client closed');
        } catch (e) {
            console.warn('⚠️  Error closing MCP client:', e);
        }

        // Kill MCP server subprocess
        await killMcpServer(mcpProcess);

        // Stop Extension Host
        await stopExtensionHost();

        console.log('✅ Stdio test environment cleaned up');
    };

    console.log('✅ Stdio test environment ready');
    return { client, cleanup };
}
