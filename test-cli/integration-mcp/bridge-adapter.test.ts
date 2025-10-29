/**
 * Integration tests for bridge adapter module.
 *
 * These tests validate that the bridge adapter correctly wraps fs-bridge
 * responses in MCP-compliant format. Tests use real filesystem operations
 * with mock extension responses (synthetic response.json files).
 *
 * Test approach (per plan's Manual testing philosophy):
 * - Real fs-bridge IPC (real file operations)
 * - Mock extension responses (write synthetic files)
 * - No mocking of fs-bridge internals or MCP SDK
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { executeToolViaBridge } from '../../src/lib/mcp/bridge-adapter.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('Bridge Adapter Integration Tests', () => {
  let testBridgeRoot: string;

  beforeEach(async () => {
    // Create isolated test environment for fs-bridge operations
    testBridgeRoot = path.join('/tmp', `vsc-bridge-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(path.join(testBridgeRoot, 'execute'), { recursive: true });

    // Create host.json (required by fs-bridge for health checks)
    await fs.writeFile(
      path.join(testBridgeRoot, 'host.json'),
      JSON.stringify({
        bridgeId: 'test-bridge',
        workspace: '/test/workspace',
        startedAt: new Date().toISOString()
      })
    );
  });

  afterEach(async () => {
    // Cleanup test bridge root
    try {
      await fs.rm(testBridgeRoot, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  test('should execute tool and wrap success response in MCP format', async () => {
    // Arrange: Set up mock response
    let jobId: string | undefined;

    // Intercept the job ID by watching for command.json creation
    const watchForCommand = async () => {
      const executeDir = path.join(testBridgeRoot, 'execute');

      // Poll for new job directories
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
          const entries = await fs.readdir(executeDir);
          const newJob = entries.find(e => e.startsWith('202')); // Job IDs start with timestamp

          if (newJob && !jobId) {
            jobId = newJob;
            const jobDir = path.join(executeDir, newJob);

            // Phase 3: Write claimed.json FIRST (pickup acknowledgment)
            await fs.writeFile(
              path.join(jobDir, 'claimed.json'),
              JSON.stringify({
                bridgeId: 'test-bridge',
                claimedAt: new Date().toISOString(),
                pid: process.pid
              })
            );

            // Write mock success response
            const mockResponse = {
              ok: true,
              type: 'success',
              data: {
                success: true,
                details: {
                  breakpoint: {
                    id: 'bp-001',
                    path: '/test/file.js',
                    line: 10,
                    verified: true
                  }
                }
              },
              meta: {
                requestId: newJob,
                timestamp: new Date().toISOString()
              }
            };

            await fs.writeFile(
              path.join(jobDir, 'response.json'),
              JSON.stringify(mockResponse)
            );
            await fs.writeFile(path.join(jobDir, 'done'), '');
            break;
          }
        } catch (err) {
          // Continue polling
        }
      }
    };

    // Start watching for command in background
    const watchPromise = watchForCommand();

    // Act: Execute tool
    const resultPromise = executeToolViaBridge(
      'breakpoint.set',
      { path: '/test/file.js', line: 10 },
      { bridgeRoot: testBridgeRoot, timeout: 5000 }
    );

    // Wait for both to complete
    const [_, result] = await Promise.all([watchPromise, resultPromise]);

    // Assert: Verify MCP format
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('structuredContent');
    expect(result.content).toBeTypeOf('object');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('text');

    // Verify structured content preserves envelope
    expect(result.structuredContent).toHaveProperty('ok', true);
    expect(result.structuredContent).toHaveProperty('type', 'success');
    expect(result.structuredContent).toHaveProperty('data');
    expect(result.structuredContent).toHaveProperty('meta');

    // Verify no error flag
    expect(result.isError).toBeUndefined();

    // Verify job directory was cleaned up
    if (jobId) {
      const jobDir = path.join(testBridgeRoot, 'execute', jobId);
      await expect(fs.access(jobDir)).rejects.toThrow();
    }
  }, 10000); // 10s timeout for test

  test('should handle error responses and wrap in MCP format', async () => {
    // Arrange: Set up mock error response
    let jobId: string | undefined;

    const watchForCommand = async () => {
      const executeDir = path.join(testBridgeRoot, 'execute');

      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
          const entries = await fs.readdir(executeDir);
          const newJob = entries.find(e => e.startsWith('202'));

          if (newJob && !jobId) {
            jobId = newJob;
            const jobDir = path.join(executeDir, newJob);

            // Phase 3: Write claimed.json FIRST (pickup acknowledgment)
            await fs.writeFile(
              path.join(jobDir, 'claimed.json'),
              JSON.stringify({
                bridgeId: 'test-bridge',
                claimedAt: new Date().toISOString(),
                pid: process.pid
              })
            );

            // Write mock error response
            const mockError = {
              ok: false,
              type: 'error',
              error: {
                code: 'E_NO_SESSION',
                message: 'No active debug session'
              },
              meta: {
                requestId: newJob,
                timestamp: new Date().toISOString()
              }
            };

            await fs.writeFile(
              path.join(jobDir, 'error.json'),
              JSON.stringify(mockError)
            );
            await fs.writeFile(path.join(jobDir, 'done'), '');
            break;
          }
        } catch (err) {
          // Continue polling
        }
      }
    };

    const watchPromise = watchForCommand();

    // Act
    const resultPromise = executeToolViaBridge(
      'debug.evaluate',
      { expression: 'x + 1' },
      { bridgeRoot: testBridgeRoot, timeout: 5000 }
    );

    const [_, result] = await Promise.all([watchPromise, resultPromise]);

    // Assert: Verify error in MCP format
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('E_NO_SESSION');
    expect(result.content[0].text).toContain('No active debug session');
    expect(result.structuredContent).toHaveProperty('ok', false);
    expect(result.structuredContent).toHaveProperty('error');

    // Verify job directory was cleaned up
    if (jobId) {
      const jobDir = path.join(testBridgeRoot, 'execute', jobId);
      await expect(fs.access(jobDir)).rejects.toThrow();
    }
  }, 10000);

  test('should handle timeout scenarios and return E_TIMEOUT', async () => {
    // Act: Execute with short timeout, no response written (simulates hung extension)
    const result = await executeToolViaBridge(
      'debug.start',
      { launch: 'Python' },
      { bridgeRoot: testBridgeRoot, timeout: 1000 }
    );

    // Assert: Verify timeout error in MCP format
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('E_TIMEOUT');
    expect(result.structuredContent).toHaveProperty('error');
    expect(result.structuredContent.error).toHaveProperty('code', 'E_TIMEOUT');
  }, 5000);

  test('should propagate AbortSignal cancellation to fs-bridge', async () => {
    // Arrange: Create AbortController
    const controller = new AbortController();
    let jobId: string | undefined;
    let cancelFileFound = false;

    // Watch for command creation and cancel sentinel
    const watchForCancellation = async () => {
      const executeDir = path.join(testBridgeRoot, 'execute');

      for (let i = 0; i < 200; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
          const entries = await fs.readdir(executeDir);
          const newJob = entries.find(e => e.startsWith('202'));

          if (newJob && !jobId) {
            jobId = newJob;
            const jobDir = path.join(executeDir, newJob);

            // Phase 3: Write claimed.json to pass pickup phase
            await fs.writeFile(
              path.join(jobDir, 'claimed.json'),
              JSON.stringify({
                bridgeId: 'test-bridge',
                claimedAt: new Date().toISOString(),
                pid: process.pid
              })
            );

            // Don't write response - let it abort/timeout naturally
          }

          // Check for cancel sentinel file
          if (jobId) {
            const cancelPath = path.join(executeDir, jobId, 'cancel');
            try {
              await fs.access(cancelPath);
              cancelFileFound = true;
              break;
            } catch {
              // Cancel file not created yet
            }
          }
        } catch (err) {
          // Continue watching
        }
      }
    };

    // Start watching in background
    const watchPromise = watchForCancellation();

    // Set up delayed abort (after 500ms)
    setTimeout(() => controller.abort(), 500);

    // Act: Execute with abort signal (no response will be written)
    const resultPromise = executeToolViaBridge(
      'debug.wait-for-hit',
      {},
      { bridgeRoot: testBridgeRoot, timeout: 5000, signal: controller.signal }
    );

    // Wait for both to complete
    const [_, result] = await Promise.all([watchPromise, resultPromise]);

    // Assert: Verify cancellation occurred
    expect(cancelFileFound).toBe(true); // Strong assertion: cancel sentinel must exist
    expect(result).toBeDefined();
    expect(result).toHaveProperty('content');

    // Should either timeout or return error after cancellation
    expect(result.isError).toBe(true);
    expect((result.structuredContent as any)?.error?.code).toMatch(/E_TIMEOUT|E_NO_RESPONSE/);
  }, 15000);

  test('should always pass verbose: false to runCommand (Phase 5)', async () => {
    // This test verifies that MCP adapter never enables verbose logging
    // to keep stdout clean for JSON-RPC protocol.
    //
    // Testing approach: Capture stderr and verify no debug logs appear
    // even though runCommand supports verbose logging when opts.verbose === true

    let jobId: string | undefined;
    const logs: string[] = [];
    const originalStderrWrite = process.stderr.write;

    // Capture stderr output
    process.stderr.write = ((chunk: any) => {
      logs.push(chunk.toString());
      return true;
    }) as any;

    try {
      // Set up mock response
      const watchForCommand = async () => {
        const executeDir = path.join(testBridgeRoot, 'execute');

        for (let i = 0; i < 100; i++) {
          await new Promise(resolve => setTimeout(resolve, 50));

          try {
            const entries = await fs.readdir(executeDir);
            const newJob = entries.find(e => e.startsWith('202'));

            if (newJob && !jobId) {
              jobId = newJob;
              const jobDir = path.join(executeDir, newJob);

              // Write claimed.json (pickup acknowledgment)
              await fs.writeFile(path.join(jobDir, 'claimed.json'), '{}');

              // Write mock success response
              const mockResponse = {
                ok: true,
                type: 'success',
                data: { result: 'test' },
                meta: { requestId: newJob, timestamp: new Date().toISOString() }
              };

              await fs.writeFile(
                path.join(jobDir, 'response.json'),
                JSON.stringify(mockResponse)
              );
              await fs.writeFile(path.join(jobDir, 'done'), '');
              break;
            }
          } catch (err) {
            // Continue polling
          }
        }
      };

      // Start watching for command in background
      const watchPromise = watchForCommand();

      // Act: Execute tool via MCP adapter
      const resultPromise = executeToolViaBridge(
        'test.command',
        { param: 'value' },
        { bridgeRoot: testBridgeRoot, timeout: 5000 }
      );

      // Wait for both to complete
      const [_, result] = await Promise.all([watchPromise, resultPromise]);

      // Assert: Verify NO debug logs appear
      const debugLog = logs.find(log => log.includes('[DEBUG] Job claimed'));
      expect(debugLog).toBeUndefined();

      // Verify result is successful (test baseline)
      expect(result.structuredContent).toHaveProperty('ok', true);
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  }, 10000);
});
