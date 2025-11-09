// Documentation tool generator - converts DocEntry to McpTool
// Follows manifest-driven pattern from ../tool-generator.ts

import type { DocEntry } from './types.js';
import type { McpTool } from '../tool-generator.js';

/**
 * Generate MCP tool definitions from documentation entries.
 *
 * Follows the same manifest-driven pattern as generateMcpTools(),
 * converting DocEntry objects to McpTool definitions for registration
 * in the MCP server tools array.
 *
 * @param entries - Array of parsed documentation entries from docLoader
 * @returns Array of McpTool definitions ready for server registration
 */
export function generateDocTools(entries: DocEntry[]): McpTool[] {
  return entries.map(entry => {
    const { frontMatter } = entry;

    // Build base tool with required fields (T012-T014)
    const tool: McpTool = {
      name: frontMatter.tool_name,
      description: frontMatter.description,
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    };

    // Add _meta if category or tags present (T015)
    // Follow conditional pattern from tool-generator.ts:105-111
    if (frontMatter.category || frontMatter.tags) {
      tool._meta = {
        category: frontMatter.category,
        tags: frontMatter.tags
      };
    }

    // Add annotations for read-only and idempotent hints (T016)
    // Only assign annotations if at least one field has value
    const annotations: McpTool['annotations'] = {};
    annotations.readOnlyHint = true;
    annotations.idempotentHint = true;

    if (Object.keys(annotations).length > 0) {
      tool.annotations = annotations;
    }

    return tool;
  });
}
