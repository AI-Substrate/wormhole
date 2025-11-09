/**
 * MCP (Model Context Protocol) server integration for vsc-bridge CLI.
 * 
 * This module provides the core infrastructure for running an MCP server
 * that exposes vsc-bridge debugging capabilities to AI assistants and other
 * MCP clients.
 * 
 * @module cli/lib/mcp
 */

// Core types and validation
export type { McpServerOptions, McpServerInfo } from './types.js';
export { isValidMcpServerOptions } from './types.js';

// Phase 2: Bridge adapter
export type { BridgeAdapterOptions, ToolResponse } from './bridge-adapter.js';
export { executeToolViaBridge } from './bridge-adapter.js';

// Phase 3: Tool generator
export type { McpTool, ToolMetadata, JSONSchema, ParameterHint } from './tool-generator.js';
export { generateMcpTools, aliasToToolName, paramsToJsonSchema } from './tool-generator.js';

// Phase 4: Server factory
export { createMcpServer } from './server.js';
