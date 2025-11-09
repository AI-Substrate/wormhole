/**
 * MCP server factory for VSC-Bridge debugging tools.
 *
 * Creates an MCP server instance that exposes all VSC-Bridge tools through
 * the Model Context Protocol. The server auto-generates tool definitions from
 * the manifest and handles tool execution via the filesystem bridge.
 *
 * @module cli/lib/mcp/server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { generateMcpTools, aliasToToolName } from './tool-generator.js';
import { manifestLoader } from '../manifest-loader.js';
import { executeToolViaBridge, type ToolResponse } from './bridge-adapter.js';
import { docLoader, DocRegistry, createDocsListTool, createDocsGetTool } from './doc-tools/index.js';
import { findBridgeRoot, checkBridgeHealth } from '../fs-bridge.js';
import type { McpTool } from './tool-generator.js';

/**
 * Options for creating an MCP server instance.
 */
export interface McpServerOptions {
  /**
   * Workspace directory for bridge root discovery.
   *
   * If not specified, defaults to `process.cwd()`.
   * The server will search for `.vsc-bridge` directory starting from this location.
   *
   * @default process.cwd()
   * @example '/Users/username/my-project'
   */
  workspace?: string;

  /**
   * Default timeout in milliseconds for tool execution.
   *
   * Individual tools can override this via their metadata (`mcp.timeout` field).
   * This provides a fallback for tools without specific timeout configuration.
   *
   * @default 30000 (30 seconds)
   */
  timeout?: number;
}

/**
 * Creates an MCP server instance for VSC-Bridge tools.
 *
 * The returned server is **not yet connected** to a transport. Callers must
 * connect it to either `StdioServerTransport` (for CLI usage) or
 * `InMemoryTransport` (for testing).
 *
 * **Architecture**:
 * 1. Loads `manifest.json` from CLI dist directory
 * 2. Generates MCP tool definitions using `generateMcpTools()`
 * 3. Caches tools array in memory (no regeneration per request)
 * 4. Registers `tools/list` handler to return cached tools
 *
 * **Usage (CLI)**:
 * ```typescript
 * import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
 *
 * const server = createMcpServer({ workspace: '/my/project', timeout: 60000 });
 * await server.connect(new StdioServerTransport());
 * // Server now runs until stdin closes
 * ```
 *
 * **Usage (Tests)**:
 * ```typescript
 * import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
 *
 * const [clientTx, serverTx] = InMemoryTransport.createLinkedPair();
 * const server = createMcpServer({ workspace: '/test/workspace' });
 * await server.connect(serverTx);
 * // Server ready for in-memory client requests
 * ```
 *
 * @param options - Server configuration options
 * @returns Configured MCP Server instance (not yet connected)
 */
export function createMcpServer(options: McpServerOptions = {}): Server {
  // Read package.json for server version
  const pkg = { name: 'vsc-bridge-mcp', version: '1.0.0' }; // TODO: Read from actual package.json

  // Create MCP Server instance with capabilities
  const server = new Server(
    {
      name: pkg.name,
      version: pkg.version
    },
    {
      capabilities: {
        tools: {} // Advertise tool support
      }
    }
  );

  // Load manifest and generate MCP tools (cached for lifetime of server)
  const manifest = manifestLoader.load();
  const functionalTools = generateMcpTools(manifest);

  // Phase 5 T019-T020: Load documentation and create unified doc tools
  const docEntries = docLoader.load();
  const registry = new DocRegistry(docEntries);
  const docsListTool = createDocsListTool(registry);
  const docsGetTool = createDocsGetTool(registry);

  // Merge all tools: functional + unified docs + special
  const tools: McpTool[] = [
    ...functionalTools,
    docsListTool,
    docsGetTool,

    // Special local tool: bridge_status (does not cross the bridge)
    {
      name: 'bridge_status',
      description: 'Check if VSC-Bridge Extension Host is running and responsive. ' +
                   'Works locally without crossing the bridge, so use this first to verify the bridge is available before calling other tools.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      _meta: {
        category: 'diagnostic',
        tags: ['health', 'status', 'bridge']
      },
      annotations: {
        timeout: 5000,
        readOnlyHint: true,
        idempotentHint: true,
        when_to_use: 'Check if VSC-Bridge extension is running and responsive. ' +
                     'Use this before executing other tools to ensure bridge is available. ' +
                     'This tool works even if the bridge is down because it performs a local filesystem check.'
      }
    }
  ];

  // Log warning if tool count exceeds threshold (Phase 4 - Discovery 11)
  if (tools.length > 50) {
    console.warn(`[MCP SERVER] Tool count (${tools.length}) exceeds recommended threshold (50)`);
  }

  // Build reverse lookup map: MCP tool name → script alias
  // This enables bijective transformation for aliases with hyphens (e.g., test.debug-single)
  const toolNameToAliasMap = new Map<string, string>();
  for (const [alias, entry] of Object.entries(manifest.scripts)) {
    const toolName = entry.metadata.mcp?.tool || aliasToToolName(alias);
    toolNameToAliasMap.set(toolName, alias);
  }

  // Register tools/list handler - returns all generated tool definitions
  // Phase 5 T003: Include ALL optional MCP fields (title, annotations, outputSchema)
  // Previously stripped these fields, preventing clients from seeing tool metadata
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        // Include optional fields if present (Phase 5 enrichment + Discovery 20 fix)
        ...(tool.title !== undefined && { title: tool.title }),
        ...(tool.annotations !== undefined && { annotations: tool.annotations }),
        ...(tool.outputSchema !== undefined && { outputSchema: tool.outputSchema })
      }))
    };
  });

  // Register tools/call handler - executes tools via bridge adapter
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
    const { name: toolName, arguments: args } = request.params;

    try {
      // T030: Special case for local tools that don't cross the bridge
      if (toolName === 'bridge_status') {
        return await executeBridgeStatus(options.workspace);
      }

      // T020: Check if tool exists before execution
      const tool = tools.find(t => t.name === toolName);
      if (!tool) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Unknown tool: ${toolName}. Use tools/list to see available tools.`
          }]
        };
      }

      // Phase 5 T021-T022: Unified doc handlers (BEFORE findBridgeRoot per Insight #1)
      // Place these checks before bridge operations to avoid unnecessary I/O

      // T021: docs_list handler - catalog browsing with filtering
      if (toolName === 'docs_list') {
        const filter = args as { category?: string; tags?: string[] };
        const summaries = registry.getAllSummaries(filter);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              docs: summaries,
              count: summaries.length
            }, null, 2)
          }]
        };
      }

      // T022: docs_get handler - fetch full doc content by ID
      if (toolName === 'docs_get') {
        try {
          const { id } = args as { id: string };
          if (!id) {
            return {
              isError: true,
              content: [{
                type: 'text',
                text: 'E_INVALID_ID: Missing required parameter "id"'
              }]
            };
          }

          const doc = registry.getDocById(id);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(doc, null, 2)
            }]
          };
        } catch (error) {
          // Registry throws DocNotFoundError or InvalidDocIdError with helpful messages
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            isError: true,
            content: [{
              type: 'text',
              text: errorMessage
            }]
          };
        }
      }

      // T022: Extract timeout from tool metadata, fallback to server default
      const timeout = tool.annotations?.timeout ?? options.timeout ?? 30000;

      // Convert MCP tool name back to script alias using reverse lookup map
      // This ensures bijective transformation for hyphenated aliases (e.g., test.debug-single)
      const scriptAlias = toolNameToAliasMap.get(toolName) || toolName.replace(/_/g, '.');

      // Find bridge root (default to process.cwd() per Insight #4)
      const workspace = options.workspace ?? process.cwd();
      const bridgeRoot = await findBridgeRoot(workspace);

      // Execute tool via bridge adapter
      const response = await executeToolViaBridge(
        scriptAlias,
        args || {},
        { bridgeRoot, timeout }
      );

      return response;
    } catch (error) {
      // Handle bridge errors (e.g., bridge root not found, timeout, etc.)
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Tool execution failed: ${errorMessage}`
        }]
      };
    }
  });

  return server;
}

/**
 * Execute bridge_status tool locally (does not cross the bridge).
 *
 * This tool checks if the VS Code Extension Host is running and responsive by
 * examining the health heartbeat (host.json mtime). Unlike regular tools,
 * this executes entirely in the MCP server process and does not use the
 * fs-bridge IPC mechanism.
 *
 * The health check works by:
 * 1. Finding the .vsc-bridge directory
 * 2. Checking the mtime of host.json
 * 3. If mtime is < 30 seconds old → healthy (extension updates it every 5s)
 * 4. If mtime is > 30 seconds old → unhealthy (extension crashed/stopped)
 *
 * @param workspace - Workspace directory to check (defaults to cwd)
 * @returns MCP-formatted tool response
 */
async function executeBridgeStatus(workspace?: string): Promise<ToolResponse> {
  try {
    const startDir = workspace ?? process.cwd();
    const bridgeRoot = await findBridgeRoot(startDir);
    const health = await checkBridgeHealth(bridgeRoot);

    const lastSeenAgo = Math.round((Date.now() - health.lastSeen.getTime()) / 1000);

    const data = {
      healthy: health.healthy,
      lastSeen: health.lastSeen.toISOString(),
      lastSeenAgo,
      bridgeRoot,
      transport: 'filesystem'
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }],
      structuredContent: {
        ok: true,
        type: 'query',
        data,
        meta: {
          timestamp: new Date().toISOString()
        }
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      isError: true,
      content: [{
        type: 'text',
        text: `[E_BRIDGE_NOT_FOUND] ${errorMessage}`
      }],
      structuredContent: {
        ok: false,
        type: 'error',
        error: {
          code: 'E_BRIDGE_NOT_FOUND',
          message: errorMessage
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      }
    };
  }
}
