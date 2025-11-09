/**
 * Core types for MCP (Model Context Protocol) server integration.
 * 
 * This module defines the type contracts used throughout the MCP server implementation,
 * particularly for server initialization and configuration.
 * 
 * @module cli/lib/mcp/types
 */

/**
 * Configuration options for initializing an MCP server instance.
 * 
 * These options define the runtime environment and operational parameters
 * for the MCP server. The options are transport-agnostic to support both
 * stdio-based production usage and in-memory testing scenarios.
 * 
 * @example
 * ```typescript
 * const options: McpServerOptions = {
 *   workspace: '/path/to/project',
 *   timeout: 30000,
 *   bridgeRoot: '/path/to/project/.vsc-bridge'
 * };
 * ```
 * 
 * @see {@link isValidMcpServerOptions} - Runtime validation function
 */
export interface McpServerOptions {
  /**
   * Absolute path to the workspace directory where the Extension Host is opened.
   * 
   * This path is used to:
   * - Resolve relative file paths for debugging operations
   * - Determine the scope of workspace-wide operations
   * - Locate project-specific configuration
   * 
   * @example '/Users/username/my-project'
   */
  workspace: string;

  /**
   * Global timeout in milliseconds for MCP tool operations.
   * 
   * This timeout applies to all MCP tools by default, though individual tools
   * may override this via their metadata. The timeout covers the entire tool
   * execution lifecycle, including:
   * - IPC communication with fs-bridge
   * - Extension API calls via HTTP
   * - Response processing
   * 
   * Typical values:
   * - 30000 (30s) - Standard operations
   * - 60000 (60s) - Long-running debug sessions
   * - 10000 (10s) - Quick metadata queries
   * 
   * @default 30000
   */
  timeout: number;

  /**
   * Absolute path to the .vsc-bridge directory for IPC coordination.
   * 
   * This directory contains:
   * - `request.json` - Client commands sent to Extension Host
   * - `response.json` - Extension Host responses
   * - File watchers coordinate the request-response cycle
   * 
   * The bridge directory enables the fs-bridge IPC mechanism that allows
   * the MCP server to communicate with the VS Code Extension Host.
   * 
   * @example '/Users/username/my-project/.vsc-bridge'
   * @see {@link https://github.com/yourusername/vsc-bridge/blob/main/docs/how/how-cli-works.md}
   */
  bridgeRoot: string;
}

/**
 * Metadata describing an MCP server instance.
 * 
 * This information is returned during server initialization and used for
 * client identification and logging purposes.
 */
export interface McpServerInfo {
  /**
   * Human-readable name of the MCP server.
   * 
   * @example 'vsc-bridge-mcp'
   */
  name: string;

  /**
   * Semantic version string for the MCP server implementation.
   * 
   * Should follow semver format (e.g., '1.0.0').
   */
  version: string;
}

/**
 * Type guard to validate McpServerOptions at runtime.
 * 
 * Performs comprehensive validation of option structure and value types.
 * This is critical for catching configuration errors early in the server
 * initialization flow.
 * 
 * @param options - Value to validate as McpServerOptions
 * @returns true if options is a valid McpServerOptions object
 * 
 * @example
 * ```typescript
 * const userInput: unknown = getConfigFromUser();
 * if (isValidMcpServerOptions(userInput)) {
 *   const server = createMcpServer(userInput);
 * } else {
 *   throw new Error('Invalid server options');
 * }
 * ```
 */
export function isValidMcpServerOptions(options: unknown): options is McpServerOptions {
  if (!options || typeof options !== 'object') {
    return false;
  }

  const opts = options as Record<string, unknown>;

  return (
    typeof opts.workspace === 'string' &&
    opts.workspace.length > 0 &&
    typeof opts.timeout === 'number' &&
    opts.timeout > 0 &&
    typeof opts.bridgeRoot === 'string' &&
    opts.bridgeRoot.length > 0
  );
}
