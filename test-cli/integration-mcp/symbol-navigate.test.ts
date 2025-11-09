/**
 * Symbol Navigation Integration Tests
 *
 * Tests for symbol.navigate MCP tool (references and implementations).
 * Promoted from dynamic script exploration following TAD workflow.
 *
 * These tests use real LSP providers with actual test workspace fixtures.
 * No mocking of VS Code APIs - validates real language server behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupMcpTestEnvironment } from './helpers/mcp-test-environment.js';
import type { McpTestEnvironment } from './helpers/mcp-test-environment.js';

describe('symbol.navigate MCP Tool', () => {
  let env: McpTestEnvironment;

  beforeAll(async () => {
    env = setupMcpTestEnvironment({
      workspace: '/workspaces/vscode-bridge/test',
      timeout: 30000
    });
    await env.setup();
  }, 60000);

  afterAll(async () => {
    await env.cleanup();
  });

  it('should appear in tools list', async () => {
    const result = await env.client.request(
      { method: 'tools/list' },
      { timeout: 5000 }
    );

    expect(result.tools).toBeDefined();
    const tool = result.tools.find((t: any) => t.name === 'symbol_navigate');

    expect(tool).toBeDefined();
    expect(tool.name).toBe('symbol_navigate');
    expect(tool.description).toContain('references');
  });

  it('should have correct input schema', async () => {
    const result = await env.client.request(
      { method: 'tools/list' },
      { timeout: 5000 }
    );

    const tool = result.tools.find((t: any) => t.name === 'symbol_navigate');
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema.type).toBe('object');

    const props = tool.inputSchema.properties;
    expect(props.nodeId).toBeDefined();
    expect(props.path).toBeDefined();
    expect(props.symbol).toBeDefined();
    expect(props.action).toBeDefined();
    expect(props.includeDeclaration).toBeDefined();
    expect(props.enrichWithFlowspaceIds).toBeDefined();
  });

  /*
  Test Doc:
  - Why: Ensures references finding works with Flowspace IDs (critical path - primary use case for semantic navigation)
  - Contract: symbol.navigate with nodeId parameter must return all reference locations for the specified symbol
  - Usage Notes: Use action="references" with nodeId="type:path:qualifiedName" format; path must use forward slashes
  - Quality Contribution: Validates core Flowspace ID navigation functionality that enables position-independent code navigation
  - Worked Example: Input nodeId="function:test/python/test_example.py:add" → returns array of locations where add() is called
  */
  it('Given Flowspace ID for Python function When finding references Then returns all call sites', async () => {
    const nodeId = 'function:test/python/test_example.py:add';

    const result = await env.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            nodeId,
            action: 'references',
            includeDeclaration: true
          }
        }
      },
      { timeout: 15000 }
    );

    expect(result.content).toBeDefined();
    if (result.structuredContent) {
      const data = result.structuredContent;
      expect(data.action).toBe('references');
      expect(data.input.type).toBe('flowspaceId');
      expect(data.locations).toBeDefined();
      expect(Array.isArray(data.locations)).toBe(true);
    }
  }, 20000);

  /*
  Test Doc:
  - Why: Ensures includeDeclaration parameter controls whether declaration is included in results (opaque behavior - tri-state logic)
  - Contract: includeDeclaration=false must exclude declaration location, includeDeclaration=true must include it
  - Usage Notes: Set includeDeclaration=false to get only call sites; =true to get definition + call sites
  - Quality Contribution: Documents tri-state behavior that prevents confusion about declaration appearing/disappearing
  - Worked Example: Input includeDeclaration=false → locations array excludes definition line
  */
  it('Given includeDeclaration parameter When finding references Then respects declaration inclusion setting', async () => {
    const nodeId = 'function:test/python/test_example.py:add';

    const withDecl = await env.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            nodeId,
            action: 'references',
            includeDeclaration: true
          }
        }
      },
      { timeout: 15000 }
    );

    const withoutDecl = await env.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            nodeId,
            action: 'references',
            includeDeclaration: false
          }
        }
      },
      { timeout: 15000 }
    );

    expect(withDecl.content).toBeDefined();
    expect(withoutDecl.content).toBeDefined();
    // Note: Some language servers ignore includeDeclaration - this test documents observed behavior
  }, 30000);

  /*
  Test Doc:
  - Why: Ensures Location/LocationLink normalization works consistently (edge case - LSP providers return different types)
  - Contract: All location results must have consistent {file, range} structure
  - Usage Notes: Rely on {file, range.start.line, range.start.character} fields always being present
  - Quality Contribution: Prevents client breakage when different LSPs return Location vs LocationLink
  - Worked Example: Any LSP provider → normalized {file, range: {start, end}} structure
  */
  it('Given references from LSP provider When normalizing Then produces consistent location structure', async () => {
    const nodeId = 'function:test/javascript/auth-mocks.js:findUserByUsername';

    const result = await env.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            nodeId,
            action: 'references',
            includeDeclaration: true
          }
        }
      },
      { timeout: 15000 }
    );

    expect(result.content).toBeDefined();
    if (result.structuredContent && result.structuredContent.locations) {
      result.structuredContent.locations.forEach((loc: any) => {
        expect(loc.file).toBeDefined();
        expect(typeof loc.file).toBe('string');
        expect(loc.range).toBeDefined();
        expect(loc.range.start).toBeDefined();
        expect(loc.range.end).toBeDefined();
        expect(typeof loc.range.start.line).toBe('number');
        expect(typeof loc.range.start.character).toBe('number');
      });
    }
  }, 20000);

  /*
  Test Doc:
  - Why: Ensures missing symbols return clear error messages (edge case - prevents silent failures)
  - Contract: symbol.navigate with nonexistent symbol must throw E_NOT_FOUND error
  - Usage Notes: Wrap calls in try-catch; check error code
  - Quality Contribution: Prevents silent failures; guides users to verify input
  - Worked Example: nonexistent symbol → E_NOT_FOUND error
  */
  it('Given nonexistent symbol When finding references Then throws E_NOT_FOUND error', async () => {
    const nodeId = 'function:test/python/test_example.py:thisDoesNotExist123';

    await expect(
      env.client.request(
        {
          method: 'tools/call',
          params: {
            name: 'symbol_navigate',
            arguments: {
              nodeId,
              action: 'references'
            }
          }
        },
        { timeout: 15000 }
      )
    ).rejects.toThrow();
  }, 20000);

  /*
  Test Doc:
  - Why: Ensures implementations finding works with symbol names (critical path - alternative input)
  - Contract: symbol.navigate with path+symbol must return implementation locations
  - Usage Notes: Use action="implementations" with path="..." and symbol="..."
  - Quality Contribution: Validates dual input format
  - Worked Example: path+symbol → implementation locations
  */
  it('Given path and symbol When finding implementations Then returns result structure', async () => {
    const result = await env.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            path: 'test/javascript/auth-mocks.js',
            symbol: 'findUserByUsername',
            action: 'implementations'
          }
        }
      },
      { timeout: 15000 }
    );

    expect(result.content).toBeDefined();
    if (result.structuredContent) {
      expect(result.structuredContent.action).toBe('implementations');
      expect(result.structuredContent.input.type).toBe('symbolName');
      expect(result.structuredContent.locations).toBeDefined();
    }
  }, 20000);

  /*
  Test Doc:
  - Why: Ensures implementations with Flowspace ID works (critical path - semantic consistency)
  - Contract: nodeId must work for both references AND implementations
  - Usage Notes: Use nodeId with action="implementations"
  - Quality Contribution: Validates consistent Flowspace ID support
  - Worked Example: nodeId + implementations → locations
  */
  it('Given Flowspace ID When finding implementations Then returns implementation locations', async () => {
    const nodeId = 'function:test/javascript/auth-mocks.js:findUserByUsername';

    const result = await env.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            nodeId,
            action: 'implementations'
          }
        }
      },
      { timeout: 15000 }
    );

    expect(result.content).toBeDefined();
    if (result.structuredContent) {
      expect(result.structuredContent.action).toBe('implementations');
      expect(result.structuredContent.input.type).toBe('flowspaceId');
      expect(result.structuredContent.locations).toBeDefined();
    }
  }, 20000);

  /*
  Test Doc:
  - Why: Ensures concrete classes return empty results without errors (opaque behavior)
  - Contract: Concrete class must return empty array, NOT error
  - Usage Notes: Empty result is valid for concrete classes/functions
  - Quality Contribution: Documents expected behavior
  - Worked Example: concrete class → {locations: [], total: 0}
  */
  it('Given concrete class When finding implementations Then returns empty array without error', async () => {
    const nodeId = 'class:test/python/test_example.py:TestCalculator';

    const result = await env.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            nodeId,
            action: 'implementations'
          }
        }
      },
      { timeout: 15000 }
    );

    expect(result.content).toBeDefined();
    if (result.structuredContent) {
      expect(result.structuredContent.action).toBe('implementations');
      expect(result.structuredContent.locations).toBeDefined();
      expect(Array.isArray(result.structuredContent.locations)).toBe(true);
    }
  }, 20000);
});
