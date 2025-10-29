/**
 * MCP test environment setup with InMemoryTransport.
 *
 * Provides a reusable, safe pattern for setting up MCP client/server pairs
 * for integration testing. Handles all lifecycle management, error handling,
 * and cleanup automatically.
 *
 * @module test/integration-mcp/helpers/mcp-test-environment
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../../src/lib/mcp/server.js';
import type { McpServerOptions } from '../../../src/lib/mcp/types.js';

/**
 * MCP test environment providing connected client/server pair.
 */
export interface McpTestEnvironment {
  /**
   * Connected MCP client for making requests.
   * Only available after setup() completes successfully.
   */
  readonly client: Client;

  /**
   * Connected MCP server being tested.
   * Only available after setup() completes successfully.
   */
  readonly server: Server;

  /**
   * Setup the test environment.
   *
   * Creates linked InMemoryTransport pair, initializes server and client,
   * and connects both. Must be called before accessing client/server properties.
   *
   * Should be called in beforeAll/beforeEach hooks.
   *
   * @throws Error if setup fails (connection errors, server creation errors, etc.)
   */
  setup(): Promise<void>;

  /**
   * Cleanup the test environment.
   *
   * Closes transports and releases resources. Safe to call multiple times.
   * Should be called in afterAll/afterEach hooks.
   */
  cleanup(): Promise<void>;
}

/**
 * Sets up a complete MCP test environment with InMemoryTransport.
 *
 * This is the standard way to test MCP servers. It provides:
 * - Linked client/server transports in the same process (fast, no subprocess overhead)
 * - Robust error handling during setup
 * - Automatic cleanup on errors
 * - Type-safe client/server access
 *
 * **Usage Pattern** (standard for all MCP tests):
 *
 * ```typescript
 * import { setupMcpTestEnvironment } from './helpers/mcp-test-environment.js';
 *
 * describe('My MCP Tests', () => {
 *   const env = setupMcpTestEnvironment({ workspace: '/test/workspace' });
 *
 *   beforeAll(env.setup);
 *   afterAll(env.cleanup);
 *
 *   test('can list tools', async () => {
 *     const result = await env.client.request({
 *       method: 'tools/list'
 *     }, ListToolsResultSchema);
 *
 *     expect(result.tools).toBeArray();
 *   });
 *
 *   test('can call tools', async () => {
 *     const result = await env.client.request({
 *       method: 'tools/call',
 *       params: {
 *         name: 'breakpoint_set',
 *         arguments: { path: '/test.js', line: 10 }
 *       }
 *     }, CallToolResultSchema);
 *
 *     expect(result.isError).toBeFalsy();
 *   });
 * });
 * ```
 *
 * @param options - MCP server options (workspace, timeout, etc.)
 * @returns Test environment with setup/cleanup methods and client/server accessors
 */
export function setupMcpTestEnvironment(options?: McpServerOptions): McpTestEnvironment {
  // Internal state (not exposed directly to prevent misuse before setup)
  let client: Client | null = null;
  let server: Server | null = null;
  let clientTx: InMemoryTransport | null = null;
  let serverTx: InMemoryTransport | null = null;
  let isSetup = false;

  const env: McpTestEnvironment = {
    get client(): Client {
      if (!isSetup || !client) {
        throw new Error(
          'MCP test environment not set up. Call env.setup() in beforeAll/beforeEach first.'
        );
      }
      return client;
    },

    get server(): Server {
      if (!isSetup || !server) {
        throw new Error(
          'MCP test environment not set up. Call env.setup() in beforeAll/beforeEach first.'
        );
      }
      return server;
    },

    async setup(): Promise<void> {
      try {
        // Create linked in-memory transports
        [clientTx, serverTx] = InMemoryTransport.createLinkedPair();

        // Create MCP server using factory
        server = createMcpServer(options);
        await server.connect(serverTx);

        // Create and connect test client
        client = new Client(
          {
            name: 'test-client',
            version: '1.0.0'
          },
          {
            capabilities: {}
          }
        );
        await client.connect(clientTx);

        isSetup = true;
      } catch (error) {
        // Cleanup partial state on error
        await env.cleanup();

        throw new Error(
          `MCP test environment setup failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    async cleanup(): Promise<void> {
      // Close transports (safe to call even if null/already closed)
      const closePromises: Promise<void>[] = [];

      if (clientTx) {
        closePromises.push(
          clientTx.close().catch(() => {
            /* Ignore close errors */
          })
        );
      }

      if (serverTx) {
        closePromises.push(
          serverTx.close().catch(() => {
            /* Ignore close errors */
          })
        );
      }

      await Promise.all(closePromises);

      // Reset state
      client = null;
      server = null;
      clientTx = null;
      serverTx = null;
      isSetup = false;
    }
  };

  return env;
}
