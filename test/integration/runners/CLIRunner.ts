/**
 * CLI Runner Implementation
 *
 * Wraps the existing runCLI() function from cross-language-debug.test.ts to
 * implement the DebugRunner interface. This runner executes debug operations
 * via the command-line interface.
 *
 * Path Resolution Strategy:
 * - CLI commands are executed from the test/ workspace directory
 * - All paths are resolved relative to test/ directory
 *
 * Error Handling:
 * - Populates rawError field with full CLI error details (stderr, exit code)
 * - Provides normalized error messages for test assertions
 *
 * Timeout: 30 seconds per operation (matches current CLI test baseline)
 */

import { DebugRunner, RunnerResponse, Breakpoint, StepResult, StackFrame, Variable, EvaluateResult } from './DebugRunner';
import { DebugConfig, SessionInfo, StatusResponse } from './types';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Project paths (matching cross-language-debug.test.ts pattern)
 */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEST_WORKSPACE = path.join(PROJECT_ROOT, 'test');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'index.js');

/**
 * Timeout for CLI operations (30 seconds)
 */
const CLI_TIMEOUT = 30000;

/**
 * CLI Runner - executes debug operations via command-line interface
 */
export class CLIRunner implements DebugRunner {
    /**
     * Execute a CLI command and parse JSON response
     *
     * This is a thin wrapper around the runCLI() pattern from cross-language-debug.test.ts.
     * It handles command execution, stderr filtering, and JSON parsing.
     *
     * @param command - CLI command (without 'node dist/index.js' prefix)
     * @param fromRoot - If true, run from project root; if false, run from test/ workspace
     * @returns Parsed JSON response
     * @throws Error with stderr details if command fails
     */
    private async runCLI(command: string, fromRoot: boolean = false): Promise<any> {
        // Force oclif to use compiled dist, not TypeScript sources
        const env = {
            ...process.env,
            NODE_ENV: 'production',      // Prevents oclif dev heuristics
            OCLIF_TS_NODE: '0',          // Force oclif to NOT use ts-node
            TS_NODE_PROJECT: '',         // Belt & suspenders
        };

        const cwd = fromRoot ? PROJECT_ROOT : TEST_WORKSPACE;

        const { stdout, stderr } = await execAsync(
            `node ${CLI_PATH} ${command}`,
            {
                cwd,
                timeout: CLI_TIMEOUT,
                env,
                maxBuffer: 10 * 1024 * 1024  // 10MB buffer for large responses
            }
        );

        // IMPROVED: Better stderr handling
        // Only throw if stderr contains actual error markers (not just info logs)
        const errorMarkers = ['Error:', 'ERROR:', 'error:', 'E_OPERATION_FAILED', 'E_NOT_FOUND', 'E_TIMEOUT'];
        const hasError = stderr && errorMarkers.some(marker => stderr.includes(marker));

        if (hasError) {
            throw new Error(`CLI error: ${stderr}`);
        }

        // Parse JSON response from stdout
        if (!stdout || stdout.trim().length === 0) {
            throw new Error(`No output from CLI command (stderr: ${stderr.substring(0, 200)})`);
        }

        try {
            return JSON.parse(stdout);
        } catch (e) {
            const parseError = e instanceof Error ? e.message : String(e);
            throw new Error(
                `Failed to parse CLI response (${stdout.length} bytes): ${parseError}\n` +
                `Stdout first 500 chars: ${stdout.substring(0, 500)}\n` +
                `Stderr first 200 chars: ${stderr.substring(0, 200)}`
            );
        }
    }

    /**
     * Resolve path relative to test/ workspace directory
     *
     * CLI commands are executed from test/ directory, so we resolve paths
     * relative to that location.
     *
     * @param relativePath - Path to resolve (may be relative or absolute)
     * @returns Absolute path from test/ workspace
     */
    resolvePath(relativePath: string): string {
        // If already absolute, return as-is (handles Windows C:\ and Unix /)
        if (path.isAbsolute(relativePath)) {
            return relativePath;
        }

        // Otherwise resolve from test/ workspace
        return path.resolve(TEST_WORKSPACE, relativePath);
    }

    /**
     * Start a debug session via CLI
     *
     * Uses the debug.start script to launch the Extension Host and initialize
     * a debug session. For smoke testing, we use the simple launch configuration.
     *
     * @param config - Debug configuration (currently unused for smoke test)
     * @returns Session information on success, error details on failure
     */
    async startDebug(config: DebugConfig): Promise<RunnerResponse<SessionInfo>> {
        try {
            // For smoke test, we just launch Extension Host (matches stdio-test-client pattern)
            const result = await this.runCLI('script run debug.start --param launch="Run Extension"', true);

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to launch Extension Host',
                    rawError: result
                };
            }

            return {
                success: true,
                data: {
                    id: 'cli-session',
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
     * Get current status of the debug bridge
     *
     * Uses the status command to check bridge health. This is used for
     * readiness checks and smoke testing.
     *
     * @returns Status information including healthy flag
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
     * Stop the current debug session via CLI
     *
     * Uses the debug.stop script to terminate the debug session.
     * This ONLY stops the debug session, NOT the Extension Host.
     * To stop the Extension Host, call this with fromRoot=true in afterAll.
     *
     * @returns Success/error indication
     */
    async stopDebug(): Promise<RunnerResponse<void>> {
        try {
            // Run from test workspace (fromRoot=false) to only stop debug session
            await this.runCLI('script run debug.stop', false);

            return {
                success: true
            };
        } catch (error) {
            // Stopping may fail if nothing is running - that's ok
            return {
                success: true, // Treat as success since end state is what we want
                rawError: error // But preserve error for debugging
            };
        }
    }

    // ========== Breakpoint Operations ==========

    /**
     * Set a breakpoint via CLI
     */
    async setBreakpoint(path: string, line: number): Promise<RunnerResponse<Breakpoint>> {
        try {
            const absolutePath = this.resolvePath(path);
            const result = await this.runCLI(
                `script run breakpoint.set --param path="${absolutePath}" --param line=${line}`
            );

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to set breakpoint',
                    rawError: result
                };
            }

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
     * Clear all project breakpoints via CLI
     */
    async clearProjectBreakpoints(): Promise<RunnerResponse<void>> {
        try {
            const result = await this.runCLI('script run breakpoint.clear.project');

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to clear breakpoints',
                    rawError: result
                };
            }

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
     * List all breakpoints via CLI
     */
    async listBreakpoints(): Promise<RunnerResponse<Breakpoint[]>> {
        try {
            const result = await this.runCLI('script run breakpoint.list');

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to list breakpoints',
                    rawError: result
                };
            }

            // Transform CLI response to Breakpoint array
            const breakpoints: Breakpoint[] = (result.data?.breakpoints || []).map((bp: any) => ({
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
     * Navigate editor to a specific file and line via CLI
     */
    async gotoLine(path: string, line: number): Promise<RunnerResponse<void>> {
        try {
            const absolutePath = this.resolvePath(path);
            const result = await this.runCLI(
                `script run editor.goto-line --param path="${absolutePath}" --param line=${line}`
            );

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to navigate to line',
                    rawError: result
                };
            }

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
     * Start debugging at a specific test location via CLI
     */
    async debugSingle(path: string, line: number): Promise<RunnerResponse<StepResult>> {
        try {
            const absolutePath = this.resolvePath(path);
            const result = await this.runCLI(
                `script run test.debug-single --param path="${absolutePath}" --param line=${line}`
            );

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to start debug session',
                    rawError: result
                };
            }

            return {
                success: true,
                data: {
                    event: result.data.event || 'stopped',
                    line: result.data.line,
                    reason: result.data.reason,
                    editorContext: result.editorContext
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

    /**
     * Step into via CLI
     */
    async stepInto(): Promise<RunnerResponse<StepResult>> {
        try {
            const result = await this.runCLI('script run debug.step-into');

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to step into',
                    rawError: result
                };
            }

            return {
                success: true,
                data: {
                    event: result.data.event || 'stopped',
                    line: result.data.line,
                    reason: result.data.reason,
                    editorContext: result.editorContext
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

    /**
     * Step over via CLI
     */
    async stepOver(): Promise<RunnerResponse<StepResult>> {
        try {
            const result = await this.runCLI('script run debug.step-over');

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to step over',
                    rawError: result
                };
            }

            return {
                success: true,
                data: {
                    event: result.data.event || 'stopped',
                    line: result.data.line,
                    reason: result.data.reason,
                    editorContext: result.editorContext
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

    /**
     * Step out via CLI
     */
    async stepOut(): Promise<RunnerResponse<StepResult>> {
        try {
            const result = await this.runCLI('script run debug.step-out');

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to step out',
                    rawError: result
                };
            }

            return {
                success: true,
                data: {
                    event: result.data.event || 'stopped',
                    line: result.data.line,
                    reason: result.data.reason,
                    editorContext: result.editorContext
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

    /**
     * Continue execution via CLI
     */
    async continue(): Promise<RunnerResponse<StepResult>> {
        try {
            const result = await this.runCLI('script run debug.continue');

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to continue',
                    rawError: result
                };
            }

            return {
                success: true,
                data: {
                    event: result.data.event || 'stopped',
                    line: result.data.line,
                    reason: result.data.reason,
                    editorContext: result.editorContext
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

    /**
     * Get stack trace via CLI
     */
    async getStackTrace(): Promise<RunnerResponse<StackFrame[]>> {
        try {
            const result = await this.runCLI('script run debug.stack');

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to get stack trace',
                    rawError: result
                };
            }

            // Transform CLI response to StackFrame array
            const frames: StackFrame[] = (result.data?.stackFrames || []).map((frame: any) => ({
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

    /**
     * List variables via CLI
     */
    async listVariables(scope: string): Promise<RunnerResponse<Variable[]>> {
        try {
            const result = await this.runCLI(`script run debug.list-variables --param scope=${scope}`);

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to list variables',
                    rawError: result
                };
            }

            return {
                success: true,
                data: result.data.variables || []
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error listing variables',
                rawError: error
            };
        }
    }

    /**
     * Evaluate expression via CLI
     */
    async evaluate(expression: string): Promise<RunnerResponse<EvaluateResult>> {
        try {
            const result = await this.runCLI(`script run debug.evaluate --param expression="${expression}"`);

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to evaluate expression',
                    rawError: result
                };
            }

            return {
                success: true,
                data: {
                    result: result.data.result,
                    type: result.data.type,
                    variablesReference: result.data.variablesReference,
                    editorContext: result.editorContext
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

    /**
     * Replace method via CLI with retry logic for transient file lock issues
     */
    async replaceMethod(path: string, symbol: string, replacement: string): Promise<RunnerResponse<void>> {
        const absolutePath = this.resolvePath(path);
        let lastError: any;

        // Retry up to 3 times for transient file lock/dirty state issues
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // Escape replacement text for shell - use heredoc-style approach via file
                const result = await this.runCLI(
                    `script run code.replace-method --param path="${absolutePath}" --param symbol="${symbol}" --param replacement="${replacement.replace(/"/g, '\\"')}"`
                );

                // Check if result is valid JSON object
                if (!result || typeof result !== 'object') {
                    throw new Error(`Invalid response format: ${JSON.stringify(result)}`);
                }

                if (!result.ok) {
                    return {
                        success: false,
                        error: `Failed to replace method: ${result.error?.message || 'Unknown error'}`,
                        rawError: result
                    };
                }

                return {
                    success: true
                };
            } catch (error) {
                lastError = error;
                if (attempt < 3) {
                    console.log(`🔄 Retry ${attempt}/3: Method replacement failed, retrying in 1s...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
            }
        }

        // All retries exhausted
        return {
            success: false,
            error: lastError instanceof Error ? lastError.message : 'Unknown error replacing method',
            rawError: lastError
        };
    }

    /**
     * Get call hierarchy via CLI
     */
    async callHierarchy(
        path: string,
        symbol: string,
        direction: 'incoming' | 'outgoing'
    ): Promise<RunnerResponse<import('./DebugRunner').CallHierarchyResult>> {
        try {
            const absolutePath = this.resolvePath(path);
            const result = await this.runCLI(
                `script run symbol.calls --param path="${absolutePath}" --param symbol="${symbol}" --param direction="${direction}"`
            );

            if (!result.ok) {
                return {
                    success: false,
                    error: 'Failed to get call hierarchy',
                    rawError: result
                };
            }

            return {
                success: true,
                data: result.data
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
