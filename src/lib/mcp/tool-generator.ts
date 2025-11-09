import type { ManifestV2, ParamDefinition, ScriptMetadata } from '../manifest-loader.js';

/**
 * JSON Schema type for MCP tool input parameters
 */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JSONSchemaProperty {
  type?: string;
  description?: string;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: any;
  items?: JSONSchemaProperty;
}

/**
 * MCP tool metadata (P0 + P1 fields)
 */
export interface ToolMetadata {
  // P0 metadata (required for tool discovery)
  description: string;
  timeout?: number;
  category?: string;
  tags?: string[];

  // P1 metadata (LLM guidance)
  when_to_use?: string;
  parameter_hints?: Record<string, ParameterHint>;

  // Annotations per MCP spec
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface ParameterHint {
  description?: string;
  examples?: string[];
  language_specific?: Record<string, string>;
  prerequisites?: string[];
}

/**
 * MCP tool definition
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  // Phase 5 T003: Add MCP spec optional fields for metadata enrichment
  title?: string; // Human-readable UI display name (distinct from name)
  outputSchema?: JSONSchema; // JSON Schema for structured output
  _meta?: {
    category?: string;
    tags?: string[];
  };
  annotations?: {
    timeout?: number;
    when_to_use?: string;
    parameter_hints?: Record<string, ParameterHint>;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

/**
 * Main entry point: Generate MCP tool definitions from manifest
 */
export function generateMcpTools(manifest: ManifestV2): McpTool[] {
  const tools: McpTool[] = [];

  for (const [alias, entry] of Object.entries(manifest.scripts)) {
    const { metadata } = entry;

    // Check if tool is enabled for MCP (default true if field absent)
    if (!shouldIncludeTool(metadata)) {
      continue;
    }

    // Generate tool name (auto-generate or use override)
    const toolName = metadata.mcp?.tool || aliasToToolName(alias);

    // Convert params to JSON Schema
    const inputSchema = paramsToJsonSchema(metadata.params || {});

    // Extract P0 metadata
    const p0 = extractP0Metadata(metadata);

    // Extract P1 metadata
    const p1 = extractP1Metadata(metadata);

    // Build complete tool definition
    const tool: McpTool = {
      name: toolName,
      description: p0.description,
      inputSchema,
    };

    // Add _meta if category or tags present
    if (p0.category || p0.tags) {
      tool._meta = {
        category: p0.category,
        tags: p0.tags,
      };
    }

    // Add annotations if any metadata present
    const annotations: McpTool['annotations'] = {};
    if (p0.timeout) annotations.timeout = p0.timeout;
    if (p1.when_to_use) annotations.when_to_use = p1.when_to_use;
    if (p1.parameter_hints) annotations.parameter_hints = p1.parameter_hints;
    if (p0.annotations?.readOnlyHint !== undefined) annotations.readOnlyHint = p0.annotations.readOnlyHint;
    if (p0.annotations?.destructiveHint !== undefined) annotations.destructiveHint = p0.annotations.destructiveHint;
    if (p0.annotations?.idempotentHint !== undefined) annotations.idempotentHint = p0.annotations.idempotentHint;
    if (p0.annotations?.openWorldHint !== undefined) annotations.openWorldHint = p0.annotations.openWorldHint;

    if (Object.keys(annotations).length > 0) {
      tool.annotations = annotations;
    }

    tools.push(tool);
  }

  return tools;
}

/**
 * T004: Map alias to tool name (replace dots and hyphens with underscores)
 * Examples:
 *   breakpoint.set → breakpoint_set
 *   test.debug-single → test_debug_single
 *   debug.list-variables → debug_list_variables
 */
export function aliasToToolName(alias: string): string {
  return alias.replace(/[\.\-]/g, '_');
}

/**
 * T005: Convert YAML parameter definitions to JSON Schema
 */
export function paramsToJsonSchema(params: Record<string, ParamDefinition>): JSONSchema {
  const schema: JSONSchema = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };

  const required: string[] = [];

  for (const [paramName, paramDef] of Object.entries(params)) {
    const property: JSONSchemaProperty = {
      description: paramDef.description,
    };

    // Handle enum type specially (no explicit type, just enum values)
    if (paramDef.type === 'enum') {
      property.enum = paramDef.values || [];
    } else if (paramDef.type === 'object') {
      // Simple object schema (Phase 3 limitation)
      property.type = 'object';
    } else if (paramDef.type === 'array') {
      property.type = 'array';
      // Copy items property if present
      if (paramDef.items) {
        property.items = {
          type: paramDef.items.type || 'string'
        };
      }
    } else {
      // Standard types: string, number, boolean
      property.type = paramDef.type;

      // Add constraints based on type
      if (paramDef.type === 'string') {
        if (paramDef.minLength !== undefined) property.minLength = paramDef.minLength;
        if (paramDef.maxLength !== undefined) property.maxLength = paramDef.maxLength;
        if (paramDef.pattern) property.pattern = paramDef.pattern;
      } else if (paramDef.type === 'number') {
        if (paramDef.min !== undefined) property.minimum = paramDef.min;
        if (paramDef.max !== undefined) property.maximum = paramDef.max;
      }
    }

    // Add default value if present
    if (paramDef.default !== undefined) {
      property.default = paramDef.default;
    }

    schema.properties![paramName] = property;

    // Track required fields
    if (paramDef.required) {
      required.push(paramName);
    }
  }

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

/**
 * T006: Check if tool should be included in MCP exposure
 * Returns false if mcp.enabled === false, true otherwise (default true)
 */
export function shouldIncludeTool(metadata: ScriptMetadata): boolean {
  // If mcp field doesn't exist at all, include the tool
  if (!metadata.mcp) {
    return true;
  }

  // Check for explicit enabled field (not in current manifest, but supported)
  const mcpAny = metadata.mcp as any;
  if ('enabled' in mcpAny && mcpAny.enabled === false) {
    return false;
  }

  return true;
}

/**
 * T007: Extract P0 metadata (basic tool info)
 */
export function extractP0Metadata(metadata: ScriptMetadata): ToolMetadata {
  const mcpAny = metadata.mcp as any;

  // Infer category from alias (e.g., breakpoint.set → breakpoint)
  const category = metadata.category || metadata.alias.split('.')[0];

  return {
    description: metadata.mcp?.description || metadata.description || 'No description available',
    timeout: mcpAny?.timeout,
    category,
    tags: mcpAny?.tags,
    annotations: {
      readOnlyHint: metadata.response === 'query',
      destructiveHint: mcpAny?.destructiveHint,
      idempotentHint: mcpAny?.idempotentHint,
      openWorldHint: mcpAny?.openWorldHint,
    },
  };
}

/**
 * T008: Extract P1 metadata (LLM guidance)
 */
export function extractP1Metadata(metadata: ScriptMetadata): Partial<ToolMetadata> {
  const mcpAny = metadata.mcp as any;
  const llm = mcpAny?.llm || {};

  return {
    when_to_use: llm.when_to_use,
    parameter_hints: llm.parameter_hints,
  };
}
