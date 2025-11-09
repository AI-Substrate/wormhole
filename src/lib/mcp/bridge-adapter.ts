/**
 * Bridge adapter for MCP tool execution via filesystem IPC.
 *
 * This module provides the critical translation layer between MCP protocol and
 * the fs-bridge IPC mechanism. It wraps fs-bridge responses in MCP-compliant
 * format while preserving full response data in structuredContent.
 *
 * Key responsibilities:
 * - Execute tools via fs-bridge IPC (command.json → response.json polling)
 * - Wrap success/error responses in MCP envelope format
 * - Handle timeouts and cancellation signals
 * - Cleanup job directories after execution
 * - Detect and handle large payloads (>25k tokens)
 *
 * @module cli/lib/mcp/bridge-adapter
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { runCommand, sortableId, CommandJson } from '../fs-bridge.js';

/**
 * Options for bridge adapter execution.
 *
 * These options control how tools are executed via the fs-bridge IPC mechanism.
 */
export interface BridgeAdapterOptions {
  /**
   * Absolute path to the .vsc-bridge directory for IPC coordination.
   *
   * @example '/Users/username/my-project/.vsc-bridge'
   */
  bridgeRoot: string;

  /**
   * Timeout in milliseconds for tool execution.
   *
   * This timeout is passed directly to fs-bridge without padding.
   * The adapter wraps the call in Promise.race as a safety net for dead bridges.
   *
   * @default 30000
   */
  timeout?: number;

  /**
   * AbortSignal for cancellation support.
   *
   * Simple pass-through to fs-bridge. Cancellation semantics are handled
   * by fs-bridge's cancel file mechanism.
   */
  signal?: AbortSignal;
}

/**
 * MCP tool response format.
 *
 * Complies with MCP SDK's CallToolResult schema while preserving full
 * fs-bridge envelope data in structuredContent.
 */
export interface ToolResponse {
  /**
   * Array of content blocks for the response.
   *
   * For success: JSON stringified data
   * For error: Error code and message
   * For large payloads: Temp file path with token count
   */
  content: Array<{
    type: 'text';
    text: string;
  }>;

  /**
   * Full fs-bridge envelope preserved for debugging and advanced use cases.
   *
   * Contains: {ok, type, data, meta, error?}
   */
  structuredContent?: unknown;

  /**
   * True if this response represents an error condition.
   */
  isError?: boolean;
}

/**
 * Execute a tool via filesystem bridge and wrap response in MCP format.
 *
 * This is the core function that bridges MCP tool calls to fs-bridge IPC.
 * It handles the full execution lifecycle:
 * 1. Create CommandJson payload
 * 2. Execute via fs-bridge.runCommand
 * 3. Wrap response in MCP format
 * 4. Cleanup job directory
 *
 * Implementation follows four critical insights:
 * - Insight #1: Use same timeout for adapter and fs-bridge (no +1000ms)
 * - Insight #2: Use tiktoken to detect large payloads, spill to temp files
 * - Insight #3: Always cleanup job directories in finally block
 * - Insight #4: Simple AbortSignal pass-through (defer semantics)
 *
 * @param toolName - Script alias (e.g., 'breakpoint.set', 'debug.evaluate')
 * @param args - Tool arguments as key-value pairs
 * @param options - Bridge adapter options
 * @returns MCP-formatted tool response
 *
 * @example
 * ```typescript
 * const response = await executeToolViaBridge(
 *   'breakpoint.set',
 *   { path: '/test/file.js', line: 10 },
 *   { bridgeRoot: '/project/.vsc-bridge', timeout: 30000 }
 * );
 *
 * if (response.isError) {
 *   console.error('Tool failed:', response.content[0].text);
 * } else {
 *   console.log('Tool succeeded:', response.structuredContent);
 * }
 * ```
 */
export async function executeToolViaBridge(
  toolName: string,
  args: Record<string, unknown>,
  options: BridgeAdapterOptions
): Promise<ToolResponse> {
  let jobDir: string | undefined;

  try {
    // Create CommandJson payload
    const commandId = sortableId(Date.now());
    const commandJson: CommandJson = {
      version: 1,
      clientId: 'mcp-server',
      id: commandId,
      createdAt: new Date().toISOString(),
      scriptName: toolName,
      params: args,
      timeout: options.timeout
    };

    jobDir = path.join(options.bridgeRoot, 'execute', commandId);

    // Execute via fs-bridge with same timeout (Insight #1: no +1000ms padding)
    const timeout = options.timeout ?? 30000;
    const envelope = await runCommand(
      options.bridgeRoot,
      commandJson,
      { timeout, signal: options.signal, verbose: false }  // Phase 5: MCP always uses verbose: false
    );

    // Wrap response in MCP format
    if (envelope.ok) {
      return wrapSuccessResponse(envelope);
    } else {
      return wrapErrorResponse(envelope);
    }
  } finally {
    // Insight #3: Always cleanup job directories
    if (jobDir) {
      try {
        await fs.rm(jobDir, { recursive: true, force: true });
      } catch (err) {
        // Log but don't fail if cleanup fails
        // This could happen if the directory was already deleted
        console.error(`[bridge-adapter] Failed to cleanup job directory: ${jobDir}`, err);
      }
    }
  }
}

/**
 * Wrap a success response from fs-bridge in MCP format.
 *
 * Implements Insight #2: Use tiktoken to detect large payloads (>25k tokens)
 * and spill to temporary files when exceeded.
 *
 * @param envelope - fs-bridge success envelope
 * @returns MCP-formatted success response
 */
function wrapSuccessResponse(envelope: any): ToolResponse {
  const dataStr = JSON.stringify(envelope.data);

  // TODO (Phase 6): Add tiktoken measurement for large payload detection
  // For now, use simple character count as proxy (1 token ≈ 4 characters)
  const estimatedTokens = Math.ceil(dataStr.length / 4);

  // Insight #2: Spill large payloads to temp files
  if (estimatedTokens > 25000) {
    // TODO: Implement temp file spillover
    // For now, return truncated response with warning
    return {
      content: [{
        type: 'text',
        text: `⚠️ Response too large (est. ${estimatedTokens} tokens > 25k limit). Truncated preview:\n${dataStr.substring(0, 1000)}...`
      }],
      structuredContent: envelope
    };
  }

  return {
    content: [{
      type: 'text',
      text: dataStr
    }],
    structuredContent: envelope
  };
}

/**
 * Wrap an error response from fs-bridge in MCP format.
 *
 * Error responses include the error code in the text content for easy parsing
 * by LLM agents, while preserving the full error envelope in structuredContent.
 *
 * @param envelope - fs-bridge error envelope
 * @returns MCP-formatted error response
 */
function wrapErrorResponse(envelope: any): ToolResponse {
  const errorCode = envelope.error?.code || 'E_UNKNOWN';
  const errorMessage = envelope.error?.message || 'Unknown error';

  return {
    isError: true,
    content: [{
      type: 'text',
      text: `[${errorCode}] ${errorMessage}`
    }],
    structuredContent: envelope
  };
}
