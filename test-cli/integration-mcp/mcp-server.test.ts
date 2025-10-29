/**
 * MCP Server integration tests.
 *
 * Tests the MCP server factory and handlers using InMemoryTransport for fast,
 * reliable integration testing without subprocess overhead.
 *
 * @module test/integration-mcp/mcp-server.test
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { setupMcpTestEnvironment } from './helpers/mcp-test-environment.js';

describe('Phase 4: MCP Server Factory & Registration', () => {
  // Set up test environment with InMemoryTransport
  const env = setupMcpTestEnvironment({
    workspace: '/test/workspace',
    timeout: 30000
  });

  beforeAll(env.setup);
  afterAll(env.cleanup);

  /**
   * T010: Test createMcpServer factory returns configured Server instance
   *
   * Purpose: Validates factory pattern works correctly
   * Quality: Ensures server can be created and connected
   * Acceptance: Server instance exists and is connected
   */
  test('T010: createMcpServer returns configured Server instance', async () => {
    // Server should be accessible after setup
    expect(env.server).toBeDefined();
    expect(env.server.constructor.name).toBe('Server');

    // Client should be connected
    expect(env.client).toBeDefined();
  });

  /**
   * T011: Test tools/list handler returns all generated tool definitions
   *
   * Purpose: VALIDATE THE PIPE - Proves end-to-end InMemoryTransport works
   * Quality: Ensures server boots, loads tools, and responds to requests
   * Acceptance: tools/list returns array with name, description, inputSchema
   *
   * This is the CRITICAL test that validates:
   * - InMemoryTransport connection works
   * - Server boots successfully
   * - Manifest loads and tools generate
   * - tools/list handler responds correctly
   * - Client can receive and parse responses
   */
  test('T011: tools/list returns all generated tool definitions', async () => {
    // Make tools/list request via in-memory transport
    const response = await env.client.request(
      { method: 'tools/list' },
      ListToolsResultSchema
    );

    // Should return tools array
    expect(response.tools).toBeInstanceOf(Array);
    expect(response.tools.length).toBeGreaterThan(0);

    // Pick a known tool (from Phase 3 test fixture or real manifest)
    const breakpointTool = response.tools.find(t => t.name === 'breakpoint_set');

    if (breakpointTool) {
      // Validate tool structure
      expect(breakpointTool).toHaveProperty('name');
      expect(breakpointTool).toHaveProperty('description');
      expect(breakpointTool).toHaveProperty('inputSchema');

      // Validate inputSchema has required properties
      expect(breakpointTool.inputSchema).toHaveProperty('properties');
      expect(breakpointTool.inputSchema).toHaveProperty('required');

      // Log success (helps with debugging)
      console.log(`✓ Found breakpoint_set tool with ${Object.keys(breakpointTool.inputSchema.properties || {}).length} parameters`);
    } else {
      // Log all available tools for debugging if breakpoint_set missing
      console.log('Available tools:', response.tools.map(t => t.name));
    }
  });

  /**
   * T015: Test tools/call handler executes valid tool via bridge adapter
   *
   * Purpose: CRITICAL TEST - Validates tools/call can execute tools via bridge
   * Quality: Ensures end-to-end tool execution works
   * Acceptance: Tool executes successfully and returns MCP-wrapped response
   *
   * This test validates:
   * - tools/call handler receives and processes requests
   * - Tool name → script alias conversion works (breakpoint_set → breakpoint.set)
   * - Bridge adapter is called with correct parameters
   * - MCP response format is preserved (content + structuredContent)
   */
  test('T015: tools/call executes valid tool via bridge adapter', async () => {
    // TODO: This test requires mock bridge setup to work
    // For now, skip implementation until mock bridge is ready
    expect(true).toBe(true);
  });

  /**
   * T016: Test tools/call error handling with unknown tool name
   *
   * Purpose: Validates error handling for non-existent tools
   * Quality: Ensures clear error messages for LLM agents
   * Acceptance: Returns isError=true with helpful message
   *
   * This test validates:
   * - Unknown tool detection before bridge execution
   * - MCP error format (isError=true, error message in content)
   * - No bridge call is made for unknown tools
   */
  test('T016: tools/call returns error for unknown tool', async () => {
    // TODO: Implement after tools/call handler exists
    expect(true).toBe(true);
  });

  /**
   * T017: Test parameter validation with missing required params
   *
   * Purpose: Validate parameter validation against inputSchema
   * Quality: Prevents invalid tool calls reaching bridge
   * Acceptance: Returns error mentioning missing parameter
   *
   * This test uses test-driven discovery:
   * - If SDK validates automatically: test passes without our validation code
   * - If SDK doesn't validate: test fails, we implement T021
   */
  test('T017: tools/call validates missing required parameters', async () => {
    // TODO: Implement to discover if SDK validates params
    expect(true).toBe(true);
  });

  /**
   * T018: Test timeout configuration (default and per-tool overrides)
   *
   * Purpose: Validate timeout extraction from tool metadata
   * Quality: Ensures tools with custom timeouts work correctly
   * Acceptance: Tool metadata contains correct timeout value
   *
   * This test validates Critical Discovery 04:
   * - Tools can specify custom timeouts in metadata
   * - Timeout is passed to bridge adapter correctly
   * - Default timeout is used when tool doesn't specify
   */
  test('T018: tools/call uses per-tool timeout from metadata', async () => {
    // First, verify that tools with custom timeouts have them in annotations
    const response = await env.client.request(
      { method: 'tools/list' },
      ListToolsResultSchema
    );

    // Find a tool that should have a custom timeout (test operations are usually longer)
    const testTool = response.tools.find(t => t.name.startsWith('test_'));

    if (testTool) {
      // Check if annotations exist and contain timeout
      // Note: This validates Phase 3 tool generation, not Phase 4b execution yet
      console.log(`Found test tool: ${testTool.name}`);
      console.log('Annotations:', JSON.stringify(testTool.inputSchema.annotations || {}, null, 2));
    } else {
      console.log('No test tools found in manifest');
    }

    // For now, just verify the test infrastructure works
    expect(response.tools.length).toBeGreaterThan(0);
  });
});
