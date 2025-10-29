/**
 * Mock bridge utilities for MCP integration testing.
 *
 * Provides helpers to simulate the VS Code extension's filesystem bridge responses
 * without requiring a real extension to be running.
 *
 * @module test/integration-mcp/helpers/mock-bridge
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Mock bridge response data matching fs-bridge envelope format.
 */
export interface MockBridgeResponse {
  ok: boolean;
  type: 'success' | 'error';
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string;
    timestamp?: string;
    duration?: number;
  };
}

/**
 * Options for setting up a mock bridge environment.
 */
export interface MockBridgeOptions {
  /**
   * Optional custom bridge root path.
   * If not provided, creates a temporary directory.
   */
  bridgeRoot?: string;

  /**
   * Whether to automatically cleanup the bridge root on teardown.
   * @default true
   */
  autoCleanup?: boolean;
}

/**
 * Mock bridge environment for testing.
 */
export interface MockBridgeEnvironment {
  /**
   * Absolute path to the mock .vsc-bridge directory.
   */
  bridgeRoot: string;

  /**
   * Write a mock response for a specific job ID.
   *
   * @param jobId - The job ID to respond to
   * @param response - The response data to write
   * @param delayMs - Optional delay before writing response (simulates processing time)
   */
  writeMockResponse(jobId: string, response: MockBridgeResponse, delayMs?: number): Promise<void>;

  /**
   * Find the most recently created job ID in the execute directory.
   *
   * @returns The latest job ID, or null if no jobs exist
   */
  findLatestJobId(): Promise<string | null>;

  /**
   * Cleanup the mock bridge directory.
   */
  cleanup(): Promise<void>;
}

/**
 * Sets up a mock bridge environment for testing.
 *
 * Creates a temporary .vsc-bridge directory structure and provides utilities
 * to write mock responses that simulate the VS Code extension.
 *
 * @example
 * ```typescript
 * import { setupMockBridge } from './helpers/mock-bridge.js';
 *
 * describe('Bridge Integration', () => {
 *   let mockBridge: MockBridgeEnvironment;
 *
 *   beforeAll(async () => {
 *     mockBridge = await setupMockBridge();
 *   });
 *
 *   afterAll(async () => {
 *     await mockBridge.cleanup();
 *   });
 *
 *   test('handles success response', async () => {
 *     // Test will create job in mockBridge.bridgeRoot/execute/
 *     // We can write a response when ready
 *     const jobId = await mockBridge.findLatestJobId();
 *     await mockBridge.writeMockResponse(jobId, {
 *       ok: true,
 *       type: 'success',
 *       data: { result: 'test' }
 *     });
 *   });
 * });
 * ```
 *
 * @param options - Configuration options
 * @returns Mock bridge environment with helper methods
 */
export async function setupMockBridge(options: MockBridgeOptions = {}): Promise<MockBridgeEnvironment> {
  const { autoCleanup = true } = options;

  // Create or use provided bridge root
  const bridgeRoot = options.bridgeRoot ?? path.join(
    os.tmpdir(),
    `vsc-bridge-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );

  // Create directory structure
  await fs.mkdir(path.join(bridgeRoot, 'execute'), { recursive: true });

  // Write minimal host.json
  await fs.writeFile(
    path.join(bridgeRoot, 'host.json'),
    JSON.stringify({
      bridgeId: 'test-bridge',
      workspace: '/test/workspace',
      timestamp: new Date().toISOString()
    }, null, 2)
  );

  const env: MockBridgeEnvironment = {
    bridgeRoot,

    async writeMockResponse(jobId: string, response: MockBridgeResponse, delayMs = 0): Promise<void> {
      const jobDir = path.join(bridgeRoot, 'execute', jobId);

      // Wait for delay if specified (simulates processing time)
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // Ensure job directory exists
      await fs.mkdir(jobDir, { recursive: true });

      // Write response.json
      await fs.writeFile(
        path.join(jobDir, 'response.json'),
        JSON.stringify(response, null, 2)
      );

      // Write done marker
      await fs.writeFile(path.join(jobDir, 'done'), '');
    },

    async findLatestJobId(): Promise<string | null> {
      const executeDir = path.join(bridgeRoot, 'execute');

      try {
        const entries = await fs.readdir(executeDir, { withFileTypes: true });
        const jobDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

        if (jobDirs.length === 0) {
          return null;
        }

        // Job IDs are sortable timestamps, so last one alphabetically is latest
        jobDirs.sort();
        return jobDirs[jobDirs.length - 1];
      } catch (error) {
        return null;
      }
    },

    async cleanup(): Promise<void> {
      if (autoCleanup) {
        try {
          await fs.rm(bridgeRoot, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors (directory might not exist)
        }
      }
    }
  };

  return env;
}

/**
 * Predefined mock responses for common scenarios.
 */
export const MOCK_RESPONSES = {
  /**
   * Success response for breakpoint.set
   */
  breakpointSetSuccess: (): MockBridgeResponse => ({
    ok: true,
    type: 'success',
    data: {
      success: true,
      details: {
        breakpoint: {
          id: 1,
          verified: true,
          line: 10,
          source: { path: '/test/file.js' }
        }
      }
    },
    meta: {
      requestId: 'test-request-001',
      timestamp: new Date().toISOString(),
      duration: 45
    }
  }),

  /**
   * Error response for debug.evaluate with no active session
   */
  debugEvaluateNoSession: (): MockBridgeResponse => ({
    ok: false,
    type: 'error',
    error: {
      code: 'E_NO_SESSION',
      message: 'No active debug session',
      details: {
        suggestion: 'Start a debug session first using debug.start'
      }
    },
    meta: {
      requestId: 'test-request-002',
      timestamp: new Date().toISOString()
    }
  }),

  /**
   * Timeout error response
   */
  timeout: (): MockBridgeResponse => ({
    ok: false,
    type: 'error',
    error: {
      code: 'E_TIMEOUT',
      message: 'Operation timed out after 30000ms',
      details: {
        timeout: 30000
      }
    },
    meta: {
      requestId: 'test-request-003',
      timestamp: new Date().toISOString()
    }
  })
};
