/**
 * MCP Runner Implementation
 *
 * Wraps the MCP client from stdio-test-client.ts to implement the DebugRunner
 * interface. This runner executes debug operations via the Model Context Protocol.
 *
 * Path Resolution Strategy:
 * - MCP server is launched with --workspace flag pointing to test/ directory
 * - All paths are resolved relative to that workspace
 *
 * Error Handling:
 * - Populates rawError field with full MCP protocol error details
 * - Provides normalized error messages for test assertions
 *
 * Timeout: 30 seconds per operation (matches CLI baseline)
 *
 * Lifecycle:
 * - Extension Host must be launched separately (via CLI) before MCP server starts
 * - MCP server spawned as subprocess, connected via StdioClientTransport
 * - Cleanup requires closing client, killing subprocess, stopping Extension Host
 */

import { DebugRunner, RunnerResponse, Breakpoint, StepResult, StackFrame, Variable, EvaluateResult } from './DebugRunner';
import { DebugConfig, SessionInfo, StatusResponse } from './types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Project paths
 */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEST_WORKSPACE = path.join(PROJECT_ROOT, 'test');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'index.js');

/**
 * Timeout for operations (30 seconds)
 */
const OPERATION_TIMEOUT = 30000;

/**
 * Extension startup delay (from stdio-test-client.ts pattern)
 */
const EXTENSION_STARTUP_DELAY = 10000;

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * MCP Runner - executes debug operations via Model Context Protocol
 */
export class MCPRunner implements DebugRunner {
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;

    /**
     * Initialize MCP client and connect to server
     *
     * This must be called before using any debug operations. It:
     * 1. Creates StdioClientTransport (spawns MCP server subprocess)
     * 2. Creates MCP Client
     * 3. Connects client to transport
     *
     * The Extension Host must already be running before calling this.
     */
    async initialize(): Promise<void> {
        if (this.client) {
            throw new Error('MCPRunner already initialized');
        }

        // Create transport (spawns MCP server subprocess)
        this.transport = new StdioClientTransport({
            command: 'node',
            args: [CLI_PATH, 'mcp', '--workspace', TEST_WORKSPACE],
            env: {
                ...process.env,
                NODE_ENV: 'production',
            }
        });

        // Create client
        this.client = new Client(
            { name: 'mcp-runner-test-client', version: '1.0.0' },
            { capabilities: {} }
        );

        // Connect
        await this.client.connect(this.transport);

        // Small delay to ensure MCP server is fully ready
        await sleep(1000);

        // Validate bridge health using bridge_status tool
        const healthResult = await this.callMCPTool('bridge_status', {});
        if (!healthResult.healthy) {
            throw new Error(`Bridge not healthy: last seen ${healthResult.lastSeenAgo}s ago (threshold: 30s)`);
        }
    }

    /**
     * Cleanup MCP client and transport
     *
     * Closes the client connection and kills the MCP server subprocess.
     * Should be called in test cleanup (afterAll).
     */
    async cleanup(): Promise<void> {
        if (this.client) {
            try {
                await this.client.close();
            } catch (e) {
                // Ignore cleanup errors
            }
            this.client = null;
        }
        this.transport = null;
    }

    /**
     * Execute CLI command (for Extension Host lifecycle management)
     *
     * MCP runner still needs CLI for Extension Host start/stop since those
     * operations happen before MCP server is available.
     */
    private async runCLI(command: string, fromRoot: boolean = false): Promise<any> {
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
                timeout: OPERATION_TIMEOUT,
                env,
                maxBuffer: 10 * 1024 * 1024
            }
        );

        if (stderr && !stderr.includes('warning') && !stderr.includes('ℹ')) {
            throw new Error(`CLI error: ${stderr}`);
        }

        try {
            return JSON.parse(stdout);
        } catch (e) {
            const parseError = e instanceof Error ? e.message : String(e);
            throw new Error(`Failed to parse CLI response: ${parseError}\nOutput: ${stdout.substring(0, 500)}`);
        }
    }

    /**
     * Poll bridge health until ready
     */
    private async waitForBridgeReady(maxAttempts: number = 6): Promise<void> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const healthResult = await this.runCLI('status --json', true);
                if (healthResult.healthy) {
                    return;
                }
            } catch (e) {
                // Retry on error
            }

            if (attempt < maxAttempts) {
                await sleep(5000);
            }
        }

        throw new Error('Bridge failed to become healthy after 30 seconds');
    }

    /**
     * Resolve path relative to test/ workspace directory
     *
     * MCP server is launched with --workspace pointing to test/ directory,
     * so path resolution is identical to CLI runner.
     */
    resolvePath(relativePath: string): string {
        if (path.isAbsolute(relativePath)) {
            return relativePath;
        }
        return path.resolve(TEST_WORKSPACE, relativePath);
    }

    /**
     * Start a debug session via MCP
     *
     * This ONLY launches the Extension Host via CLI. The MCP client must be
     * initialized separately via initialize() AFTER the bridge is confirmed healthy.
     *
     * Following the pattern from stdio-test-client.ts where Extension Host launch
     * and MCP client initialization are separate steps.
     */
    async startDebug(config: DebugConfig): Promise<RunnerResponse<SessionInfo>> {
        try {
            // Step 1: Stop any existing Extension Host
            try {
                await this.runCLI('script run debug.stop', true);
            } catch (e) {
                // Ignore if nothing to stop
            }

            // Step 2: Launch Extension Host via CLI
            const launchResult = await this.runCLI('script run debug.start --param launch="Run Extension"', true);
            if (!launchResult.ok) {
                return {
                    success: false,
                    error: 'Failed to launch Extension Host',
                    rawError: launchResult
                };
            }

            // NOTE: Do NOT initialize MCP client here
            // That must happen separately AFTER bridge health is confirmed
            // Call initialize() explicitly after polling bridge health

            return {
                success: true,
                data: {
                    id: 'extension-host',
                    status: 'started'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error starting debug session',
                rawError: error
            };
        }
    }

    /**
     * Get current status via CLI
     *
     * Note: Status is a CLI-level operation (checks bridge health), not an MCP tool.
     * MCP runner uses CLI for Extension Host lifecycle operations like status checks.
     */
    async getStatus(): Promise<RunnerResponse<StatusResponse>> {
        try {
            const result = await this.runCLI('status --json', true);

            return {
                success: true,
                data: {
                    healthy: result.healthy ?? false,
                    message: result.message,
                    ...result
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error getting status',
                rawError: error
            };
        }
    }

    /**
     * Stop the current debug session via MCP
     *
     * This ONLY stops the debug session, NOT the Extension Host or MCP client.
     * To fully tear down (for afterAll cleanup), call cleanup() explicitly.
     *
     * Following the pattern where stopDebug() is called multiple times during
     * a test session (e.g., between tests), so we can't tear down the client.
     */
    async stopDebug(): Promise<RunnerResponse<void>> {
        try {
            // Stop debug session via MCP tool (if client is initialized)
            if (this.client) {
                try {
                    await this.callMCPTool('debug_stop', {});
                } catch (e) {
                    // Ignore if already stopped
                }
            } else {
                // If no MCP client, use CLI to stop
                try {
                    await this.runCLI('script run debug.stop');
                } catch (e) {
                    // Ignore if already stopped
                }
            }

            // NOTE: Do NOT cleanup MCP client here
            // Do NOT stop Extension Host here
            // Those are only for final teardown in afterAll

            return {
                success: true
            };
        } catch (error) {
            // Stopping may fail if nothing is running - that's ok
            return {
                success: true, // End state is what matters
                rawError: error
            };
        }
    }

    /**
     * Helper: Call an MCP tool and parse JSON response
     */
    private async callMCPTool(toolName: string, args: Record<string, any>): Promise<any> {
        if (!this.client) {
            throw new Error('MCP client not initialized');
        }

        const result = await this.client.request(
            {
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: args
                }
            },
            CallToolResultSchema
        );

        // MCP tool responses come back as content array
        const content = result.content?.[0];
        if (content?.type === 'text') {
            return JSON.parse(content.text);
        }

        throw new Error(`Unexpected MCP response format from ${toolName}`);
    }

    /**
     * Helper: Call an MCP tool with retry logic for test discovery stability
     *
     * Matches the retry pattern from HTTP tests (5 retries, 2-second delay).
     * Used for operations that may fail due to test discovery timing issues.
     */
    private async callMCPToolWithRetry(
        toolName: string,
        args: Record<string, any>,
        maxAttempts: number = 5,
        delayMs: number = 2000
    ): Promise<any> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`[MCP Retry] Attempt ${attempt}/${maxAttempts}: ${toolName}`);
                const result = await this.callMCPTool(toolName, args);
                console.log(`[MCP Retry] ✅ Success on attempt ${attempt}`);
                return result;
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

    // ========== Breakpoint Operations ==========

    /**
     * Set a breakpoint via MCP
     */
    async setBreakpoint(path: string, line: number): Promise<RunnerResponse<Breakpoint>> {
        try {
            const absolutePath = this.resolvePath(path);
            const data = await this.callMCPTool('breakpoint_set', {
                path: absolutePath,
                line: line
            });

            return {
                success: true,
                data: {
                    verified: true,
                    line: line,
                    source: { path: absolutePath }
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error setting breakpoint',
                rawError: error
            };
        }
    }

    /**
     * Clear all project breakpoints via MCP
     */
    async clearProjectBreakpoints(): Promise<RunnerResponse<void>> {
        try {
            await this.callMCPTool('breakpoint_clear_project', {});
            return {
                success: true
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error clearing breakpoints',
                rawError: error
            };
        }
    }

    /**
     * List all breakpoints via MCP
     */
    async listBreakpoints(): Promise<RunnerResponse<Breakpoint[]>> {
        try {
            const data = await this.callMCPTool('breakpoint_list', {});

            const breakpoints: Breakpoint[] = (data.breakpoints || []).map((bp: any) => ({
                id: bp.id,
                verified: bp.verified ?? true,
                line: bp.line,
                source: bp.source
            }));

            return {
                success: true,
                data: breakpoints
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error listing breakpoints',
                rawError: error
            };
        }
    }

    /**
     * Navigate editor to a specific file and line via MCP
     */
    async gotoLine(path: string, line: number): Promise<RunnerResponse<void>> {
        try {
            const absolutePath = this.resolvePath(path);
            await this.callMCPTool('editor_goto_line', {
                path: absolutePath,
                line: line
            });

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error navigating to line',
                rawError: error
            };
        }
    }

    // ========== Debug Session Operations ==========

    /**
     * Start debugging at a specific test location via MCP
     *
     * Uses retry logic to handle test discovery timing issues (matches HTTP test pattern).
     */
    async debugSingle(path: string, line: number): Promise<RunnerResponse<StepResult>> {
        try {
            const absolutePath = this.resolvePath(path);
            const data = await this.callMCPToolWithRetry('test_debug_single', {
                path: absolutePath,
                line: line
            });

            return {
                success: true,
                data: {
                    event: data.event || 'stopped',
                    line: data.line,
                    reason: data.reason,
                    editorContext: data.editorContext
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in debug single',
                rawError: error
            };
        }
    }

    // ========== Stepping Operations ==========

    async stepInto(): Promise<RunnerResponse<StepResult>> {
        try {
            const data = await this.callMCPTool('debug_step_into', {});
            return {
                success: true,
                data: {
                    event: data.event || 'stopped',
                    line: data.line,
                    reason: data.reason,
                    editorContext: data.editorContext
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error stepping into',
                rawError: error
            };
        }
    }

    async stepOver(): Promise<RunnerResponse<StepResult>> {
        try {
            const data = await this.callMCPTool('debug_step_over', {});
            return {
                success: true,
                data: {
                    event: data.event || 'stopped',
                    line: data.line,
                    reason: data.reason,
                    editorContext: data.editorContext
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error stepping over',
                rawError: error
            };
        }
    }

    async stepOut(): Promise<RunnerResponse<StepResult>> {
        try {
            const data = await this.callMCPTool('debug_step_out', {});
            return {
                success: true,
                data: {
                    event: data.event || 'stopped',
                    line: data.line,
                    reason: data.reason,
                    editorContext: data.editorContext
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error stepping out',
                rawError: error
            };
        }
    }

    async continue(): Promise<RunnerResponse<StepResult>> {
        try {
            const data = await this.callMCPTool('debug_continue', {});
            return {
                success: true,
                data: {
                    event: data.event || 'stopped',
                    line: data.line,
                    reason: data.reason,
                    editorContext: data.editorContext
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error continuing',
                rawError: error
            };
        }
    }

    // ========== Inspection Operations ==========

    async getStackTrace(): Promise<RunnerResponse<StackFrame[]>> {
        try {
            const data = await this.callMCPTool('debug_stack', {});

            const frames: StackFrame[] = (data.stackFrames || []).map((frame: any) => ({
                id: frame.id,
                name: frame.name,
                line: frame.line,
                column: frame.column,
                source: frame.source
            }));

            return {
                success: true,
                data: frames
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error getting stack trace',
                rawError: error
            };
        }
    }

    async listVariables(scope: string): Promise<RunnerResponse<Variable[]>> {
        try {
            const data = await this.callMCPTool('debug_list_variables', {
                scope: scope
            });

            return {
                success: true,
                data: data.variables || []
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error listing variables',
                rawError: error
            };
        }
    }

    async evaluate(expression: string): Promise<RunnerResponse<EvaluateResult>> {
        try {
            const data = await this.callMCPTool('debug_evaluate', {
                expression: expression
            });

            return {
                success: true,
                data: {
                    result: data.result,
                    type: data.type,
                    variablesReference: data.variablesReference,
                    editorContext: data.editorContext
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error evaluating expression',
                rawError: error
            };
        }
    }

    // ========== Code Manipulation Operations ==========

    async replaceMethod(path: string, symbol: string, replacement: string): Promise<RunnerResponse<void>> {
        try {
            const absolutePath = this.resolvePath(path);
            await this.callMCPTool('code_replace_method', {
                path: absolutePath,
                symbol: symbol,
                replacement: replacement
            });

            return {
                success: true
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error replacing method',
                rawError: error
            };
        }
    }

    async callHierarchy(
        path: string,
        symbol: string,
        direction: 'incoming' | 'outgoing'
    ): Promise<RunnerResponse<import('./DebugRunner').CallHierarchyResult>> {
        try {
            const absolutePath = this.resolvePath(path);
            const data = await this.callMCPTool('symbol_calls', {
                path: absolutePath,
                symbol: symbol,
                direction: direction
            });

            return {
                success: true,
                data: data
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error getting call hierarchy',
                rawError: error
            };
        }
    }
}
