/**
 * Unified Documentation Tools Generator
 *
 * Phase 5 T014-T016a: Creates two unified MCP tools for doc browsing and retrieval
 * - docs_list: Catalog browsing with category/tags filtering
 * - docs_get: Fetch full doc content by ID
 *
 * Design:
 * - Replaces per-doc tools from Phase 4 (N tools → 2 tools)
 * - Strong agentHelp guidance: "Call docs_list FIRST to discover IDs"
 * - Includes MCP spec optional fields: title, annotations, outputSchema
 */

import type { McpTool } from '../tool-generator.js';
import type { DocRegistry } from './registry.js';

/**
 * T015: Create docs_list tool for catalog browsing
 *
 * Enables AI agents to discover available documentation with optional filtering.
 * Includes strong when_to_use guidance to prevent guessing doc IDs.
 *
 * @param registry - DocRegistry instance for fetching summaries
 * @returns McpTool for docs_list
 */
export function createDocsListTool(registry: DocRegistry): McpTool {
  return {
    name: 'docs_list',

    // T015a: MCP spec optional fields
    title: 'Browse Documentation Catalog',

    description: 'Browse available MCP documentation with optional filtering by category or tags. Returns catalog of doc summaries with IDs, descriptions, and when-to-use guidance. Call this FIRST before docs_get to discover available documentation.',

    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category (exact match). Example: "debugging", "workflows"'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (OR logic - matches docs with ANY of these tags). Example: ["python", "testing"]'
        }
      },
      additionalProperties: false
    },

    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      when_to_use: 'Call docs_list FIRST when you need documentation. This discovers available doc IDs and provides summaries with whenToUse guidance. Essential for finding the right documentation before calling docs_get. Use category/tags filters to narrow results if many docs exist.'
    },

    // T015a: outputSchema for structured response
    // Note: TypeScript JSONSchema type is simplified - actual MCP spec allows nested schemas
    outputSchema: {
      type: 'object',
      properties: {
        docs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Document ID (use with docs_get)' },
              summary: { type: 'string', description: '10-200 char summary of doc content' },
              category: { type: 'string', description: 'Category for filtering' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Tags for filtering' },
              whenToUse: { type: 'string', description: 'Agent guidance on when to use this doc' }
            } as any,
            required: ['id', 'summary']
          } as any
        },
        count: { type: 'number', description: 'Total number of docs returned' }
      },
      required: ['docs', 'count']
    } as any
  };
}

/**
 * T016: Create docs_get tool for fetching full documentation
 *
 * Retrieves full markdown content and metadata for a specific document by ID.
 * Includes strong when_to_use guidance: "Call docs_list FIRST if unsure of ID"
 *
 * @param registry - DocRegistry instance for fetching doc content
 * @returns McpTool for docs_get
 */
export function createDocsGetTool(registry: DocRegistry): McpTool {
  return {
    name: 'docs_get',

    // T016a: MCP spec optional fields
    title: 'Get Documentation by ID',

    description: 'Fetch full documentation content and metadata by ID. Returns complete markdown content, frontmatter metadata, and enrichment fields (agentHelp, examples, outputSchema if present). Call docs_list FIRST to discover available IDs if you are unsure what documentation exists.',

    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Document ID from docs_list (e.g., "debugging-guide"). Format: ^[a-z0-9-]+$ (lowercase, hyphens, no spaces)',
          pattern: '^[a-z0-9-]+$'
        }
      },
      required: ['id'],
      additionalProperties: false
    },

    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      when_to_use: 'Call docs_get AFTER docs_list when you know the specific doc ID you need. If you are unsure what documentation exists or need to search by category/tags, call docs_list FIRST. This prevents guessing invalid IDs and shows you available options with whenToUse guidance.',
      parameter_hints: {
        id: {
          description: 'Document ID must be exact match from docs_list. Format: lowercase with hyphens (e.g., "debugging-guide"). Will normalize "debugging-guide" ↔ "docs_debugging_guide" internally.',
          examples: ['debugging-guide', 'api-reference', 'workflow-guide']
        }
      }
    },

    // T016a: outputSchema for structured response
    // Note: TypeScript JSONSchema type is simplified - actual MCP spec allows nested schemas
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document ID (normalized)' },
        summary: { type: 'string', description: '10-200 char summary' },
        content: { type: 'string', description: 'Full markdown content' },
        metadata: {
          type: 'object',
          description: 'Frontmatter fields + enrichment (title, agentHelp, examples, outputSchema)',
          properties: {
            tool_name: { type: 'string' },
            description: { type: 'string' },
            summary: { type: 'string' },
            category: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            title: { type: 'string' },
            agentHelp: {
              type: 'object',
              properties: {
                whenToUse: { type: 'string' },
                whatToDoNext: { type: 'array', items: { type: 'string' } },
                useCases: { type: 'array', items: { type: 'string' } },
                paramsNotes: { type: 'string' },
                limits: { type: 'string' },
                fallbacks: { type: 'string' }
              } as any
            },
            examples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  input: { description: 'Example input' },
                  output: { description: 'Example output' },
                  description: { type: 'string' }
                } as any,
                required: ['input', 'output', 'description']
              } as any
            },
            outputSchema: {
              type: 'object',
              description: 'JSON Schema for structured output'
            }
          } as any,
          required: ['tool_name', 'description', 'summary']
        }
      },
      required: ['id', 'summary', 'content', 'metadata']
    } as any
  };
}
