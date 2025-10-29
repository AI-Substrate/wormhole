import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  generateMcpTools,
  aliasToToolName,
  paramsToJsonSchema,
  shouldIncludeTool,
  extractP0Metadata,
  extractP1Metadata,
  type McpTool,
} from '../../src/lib/mcp/tool-generator.js';
import type { ManifestV2, ScriptMetadata } from '../../src/lib/manifest-loader.js';

// Get test fixture path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, 'fixtures');

describe('Tool Generator', () => {
  let testManifest: ManifestV2;

  beforeAll(() => {
    // Load test manifest fixture
    const manifestPath = join(fixturesDir, 'test-manifest.json');
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    testManifest = JSON.parse(manifestContent);
  });

  describe('T012: Alias → Tool Name Mapping (Critical Discovery 03)', () => {
    it('should convert dots to underscores in aliases', () => {
      expect(aliasToToolName('breakpoint.set')).toBe('breakpoint_set');
      expect(aliasToToolName('debug.evaluate')).toBe('debug_evaluate');
      expect(aliasToToolName('test.debug-single')).toBe('test_debug_single');
    });

    it('should generate tool names from fixture aliases', () => {
      const tools = generateMcpTools(testManifest);
      const toolNames = tools.map(t => t.name);

      // Auto-generated names (dots → underscores)
      expect(toolNames).toContain('debug_evaluate');
      expect(toolNames).toContain('test_debug_single');
      expect(toolNames).toContain('breakpoint_list');

      // Override name (from mcp.tool field)
      expect(toolNames).toContain('add_breakpoint'); // Not breakpoint_set
    });

    it('should not include old abbreviated aliases', () => {
      const tools = generateMcpTools(testManifest);
      const toolNames = tools.map(t => t.name);

      expect(toolNames).not.toContain('bp_set');
      expect(toolNames).not.toContain('tests_debug_single');
    });
  });

  describe('T013: YAML → JSON Schema Type Conversion', () => {
    it('should convert string parameters', () => {
      const metadata = testManifest.scripts['breakpoint.set'].metadata;
      const schema = paramsToJsonSchema(metadata.params!);

      expect(schema.properties?.path?.type).toBe('string');
      expect(schema.properties?.path?.description).toBeTruthy();
    });

    it('should convert number parameters with constraints', () => {
      const metadata = testManifest.scripts['breakpoint.set'].metadata;
      const schema = paramsToJsonSchema(metadata.params!);

      expect(schema.properties?.line?.type).toBe('number');
      expect(schema.properties?.line?.minimum).toBe(1);

      // dap.logs has number with min/max
      const dapMeta = testManifest.scripts['dap.logs'].metadata;
      const dapSchema = paramsToJsonSchema(dapMeta.params!);
      expect(dapSchema.properties?.limit?.minimum).toBe(1);
      expect(dapSchema.properties?.limit?.maximum).toBe(1000);
      expect(dapSchema.properties?.limit?.default).toBe(100);
    });

    it('should convert enum parameters without explicit type', () => {
      const metadata = testManifest.scripts['debug.evaluate'].metadata;
      const schema = paramsToJsonSchema(metadata.params!);

      // Enum should not have explicit type, just enum values
      expect(schema.properties?.context?.type).toBeUndefined();
      expect(schema.properties?.context?.enum).toEqual(['repl', 'watch', 'hover']);
      expect(schema.properties?.context?.default).toBe('repl');
    });

    it('should convert object parameters to simple schema', () => {
      const metadata = testManifest.scripts['debug.list-variables'].metadata;
      const schema = paramsToJsonSchema(metadata.params!);

      expect(schema.properties?.filters?.type).toBe('object');
      expect(schema.properties?.filters?.description).toBeTruthy();
    });

    it('should mark required fields correctly', () => {
      const metadata = testManifest.scripts['breakpoint.set'].metadata;
      const schema = paramsToJsonSchema(metadata.params!);

      expect(schema.required).toContain('path');
      expect(schema.required).toContain('line');
      expect(schema.required).not.toContain('condition'); // Optional
    });
  });

  describe('T014: mcp.enabled Filtering', () => {
    it('should exclude tools with enabled=false', () => {
      const tools = generateMcpTools(testManifest);
      const toolNames = tools.map(t => t.name);

      expect(toolNames).not.toContain('disabled_tool');
    });

    it('should include tools without mcp.enabled field (default true)', () => {
      const tools = generateMcpTools(testManifest);
      const toolNames = tools.map(t => t.name);

      expect(toolNames).toContain('breakpoint_list'); // No mcp.enabled field
    });

    it('should check shouldIncludeTool correctly', () => {
      const disabledMeta = testManifest.scripts['disabled.tool'].metadata;
      expect(shouldIncludeTool(disabledMeta)).toBe(false);

      const enabledMeta = testManifest.scripts['breakpoint.set'].metadata;
      expect(shouldIncludeTool(enabledMeta)).toBe(true);
    });
  });

  describe('T015: P0 Metadata Extraction (Critical Discovery 04)', () => {
    it('should extract description from mcp.description or fallback', () => {
      const tools = generateMcpTools(testManifest);
      const addBpTool = tools.find(t => t.name === 'add_breakpoint');

      expect(addBpTool?.description).toBe('Adds a breakpoint to the specified file and line');
    });

    it('should extract custom timeout from mcp.timeout', () => {
      const tools = generateMcpTools(testManifest);

      // breakpoint.set has 5s timeout
      const addBpTool = tools.find(t => t.name === 'add_breakpoint');
      expect(addBpTool?.annotations?.timeout).toBe(5000);

      // test.debug-single has 60s timeout
      const testTool = tools.find(t => t.name === 'test_debug_single');
      expect(testTool?.annotations?.timeout).toBe(60000);

      // dap.logs has 10s timeout
      const debugEvalTool = tools.find(t => t.name === 'debug_evaluate');
      expect(debugEvalTool?.annotations?.timeout).toBe(10000);
    });

    it('should respect mcp.tool override for tool name', () => {
      const tools = generateMcpTools(testManifest);
      const customNameTool = tools.find(t => t.name === 'add_breakpoint');

      expect(customNameTool).toBeDefined();
      expect(customNameTool?.name).toBe('add_breakpoint'); // Override
    });

    it('should extract _meta.category and _meta.tags', () => {
      const tools = generateMcpTools(testManifest);
      const addBpTool = tools.find(t => t.name === 'add_breakpoint');

      expect(addBpTool?._meta?.category).toBe('breakpoint');
      expect(addBpTool?._meta?.tags).toContain('debugging');
      expect(addBpTool?._meta?.tags).toContain('breakpoints');
    });

    it('should extract annotations per MCP spec', () => {
      const tools = generateMcpTools(testManifest);

      // Query responses should have readOnlyHint
      const listTool = tools.find(t => t.name === 'breakpoint_list');
      expect(listTool?.annotations?.readOnlyHint).toBe(true);

      // Explicitly set annotations
      const addBpTool = tools.find(t => t.name === 'add_breakpoint');
      expect(addBpTool?.annotations?.destructiveHint).toBe(false);
      expect(addBpTool?.annotations?.idempotentHint).toBe(true);
    });
  });

  describe('T016: P1 Metadata Extraction', () => {
    it('should extract when_to_use guidance', () => {
      const tools = generateMcpTools(testManifest);
      const addBpTool = tools.find(t => t.name === 'add_breakpoint');

      expect(addBpTool?.annotations?.when_to_use).toBeTruthy();
      expect(addBpTool?.annotations?.when_to_use).toContain('pause execution');
    });

    it('should extract parameter_hints with examples', () => {
      const tools = generateMcpTools(testManifest);
      const addBpTool = tools.find(t => t.name === 'add_breakpoint');

      expect(addBpTool?.annotations?.parameter_hints).toBeDefined();
      expect(addBpTool?.annotations?.parameter_hints?.path).toBeDefined();
      expect(addBpTool?.annotations?.parameter_hints?.path?.examples).toBeInstanceOf(Array);
      expect(addBpTool?.annotations?.parameter_hints?.path?.examples?.length).toBeGreaterThan(0);
    });

    it('should extract language_specific hints', () => {
      const tools = generateMcpTools(testManifest);
      const addBpTool = tools.find(t => t.name === 'add_breakpoint');

      const conditionHints = addBpTool?.annotations?.parameter_hints?.condition;
      expect(conditionHints?.language_specific).toBeDefined();
      expect(conditionHints?.language_specific?.python).toContain('Python syntax');
      expect(conditionHints?.language_specific?.javascript).toContain('JavaScript syntax');
    });

    it('should extract prerequisites from parameter hints', () => {
      const tools = generateMcpTools(testManifest);
      const evalTool = tools.find(t => t.name === 'debug_evaluate');

      const exprHints = evalTool?.annotations?.parameter_hints?.expression;
      expect(exprHints?.prerequisites).toBeDefined();
      expect(exprHints?.prerequisites).toContain('Active debug session');
    });
  });

  describe('Integration: Complete Tool Generation', () => {
    it('should generate all enabled tools from manifest', () => {
      const tools = generateMcpTools(testManifest);

      // Should have 7 enabled tools (8 total - 1 disabled)
      expect(tools.length).toBe(7);
    });

    it('should generate valid tool objects with all required fields', () => {
      const tools = generateMcpTools(testManifest);

      tools.forEach(tool => {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    it('should preserve parameter order and structure', () => {
      const tools = generateMcpTools(testManifest);
      const addBpTool = tools.find(t => t.name === 'add_breakpoint');

      const properties = addBpTool?.inputSchema.properties;
      expect(properties).toHaveProperty('path');
      expect(properties).toHaveProperty('line');
      expect(properties).toHaveProperty('condition');
    });
  });
});
