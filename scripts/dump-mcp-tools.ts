#!/usr/bin/env npx tsx
/**
 * MCP Tools Documentation Dumper
 *
 * Boots the wormhole MCP server using InMemoryTransport and dumps all tools
 * documentation including descriptions, schemas, annotations, and usage hints.
 *
 * Usage:
 *   npx tsx scripts/dump-mcp-tools.ts [options]
 *
 * Options:
 *   --json        Output as JSON instead of Markdown
 *   --filter <p>  Filter tools by name pattern (regex)
 *   --verbose     Show additional metadata (_meta fields)
 *   --help        Show this help message
 *
 * Examples:
 *   npx tsx scripts/dump-mcp-tools.ts                     # All tools, Markdown
 *   npx tsx scripts/dump-mcp-tools.ts --json              # All tools, JSON
 *   npx tsx scripts/dump-mcp-tools.ts --filter debug      # Debug tools only
 *   npx tsx scripts/dump-mcp-tools.ts --filter "^break"   # Breakpoint tools
 *   npx tsx scripts/dump-mcp-tools.ts --verbose           # Include _meta
 *
 * @module scripts/dump-mcp-tools
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Get script directory - MUST be before any other imports that use manifest
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Auto-detect manifest path BEFORE importing modules that depend on it
if (!process.env.VSC_BRIDGE_MANIFEST_PATH) {
  const manifestPaths = [
    path.join(projectRoot, 'dist', 'manifest.json'),
    path.join(projectRoot, 'packages', 'extension', 'src', 'vsc-scripts', 'manifest.json'),
    path.join(projectRoot, 'packages', 'extension', 'out', 'vsc-scripts', 'manifest.json'),
  ];

  for (const p of manifestPaths) {
    if (fs.existsSync(p)) {
      process.env.VSC_BRIDGE_MANIFEST_PATH = p;
      break;
    }
  }
}

// Now import modules that use the manifest
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { ListToolsResultSchema } = await import('@modelcontextprotocol/sdk/types.js');
const { createMcpServer } = await import('../src/lib/mcp/server.js');

// Parse CLI arguments
const args = process.argv.slice(2);

// Handle --help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
MCP Tools Documentation Dumper

Boots the wormhole MCP server using InMemoryTransport and dumps all tools
documentation including descriptions, schemas, annotations, and usage hints.

Usage:
  npx tsx scripts/dump-mcp-tools.ts [options]

Options:
  --json        Output as JSON instead of Markdown
  --filter <p>  Filter tools by name pattern (regex)
  --verbose     Show additional metadata (_meta fields)
  --help        Show this help message

Examples:
  npx tsx scripts/dump-mcp-tools.ts                     # All tools, Markdown
  npx tsx scripts/dump-mcp-tools.ts --json              # All tools, JSON
  npx tsx scripts/dump-mcp-tools.ts --filter debug      # Debug tools only
  npx tsx scripts/dump-mcp-tools.ts --filter "^break"   # Breakpoint tools
  npx tsx scripts/dump-mcp-tools.ts --verbose           # Include _meta
`);
  process.exit(0);
}

const jsonOutput = args.includes('--json');
const verboseOutput = args.includes('--verbose');
const filterIdx = args.indexOf('--filter');
const filterPattern = filterIdx !== -1 ? args[filterIdx + 1] : null;

interface ToolAnnotations {
  timeout?: number;
  when_to_use?: string;
  parameter_hints?: Record<string, {
    description?: string;
    examples?: string[];
    language_specific?: Record<string, string>;
    prerequisites?: string[];
  }>;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type?: string;
    properties?: Record<string, {
      type?: string;
      description?: string;
      enum?: any[];
      default?: any;
      minimum?: number;
      maximum?: number;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      items?: { type?: string };
    }>;
    required?: string[];
    additionalProperties?: boolean;
  };
  title?: string;
  annotations?: ToolAnnotations;
  outputSchema?: object;
  _meta?: {
    category?: string;
    tags?: string[];
  };
}

async function main() {
  let client: Client | null = null;
  let clientTx: InMemoryTransport | null = null;
  let serverTx: InMemoryTransport | null = null;

  try {
    // Create linked in-memory transports
    [clientTx, serverTx] = InMemoryTransport.createLinkedPair();

    // Create MCP server (no workspace needed - tools/list doesn't require bridge)
    const server = createMcpServer({});
    await server.connect(serverTx);

    // Create and connect test client
    client = new Client(
      { name: 'dump-tools-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(clientTx);

    // Request tools list
    const result = await client.request(
      { method: 'tools/list' },
      ListToolsResultSchema
    );

    let tools = result.tools as ToolDefinition[];

    // Apply filter if provided
    if (filterPattern) {
      const regex = new RegExp(filterPattern, 'i');
      tools = tools.filter(t => regex.test(t.name));
    }

    // Sort tools alphabetically
    tools.sort((a, b) => a.name.localeCompare(b.name));

    if (jsonOutput) {
      // JSON output
      console.log(JSON.stringify(tools, null, 2));
    } else {
      // Markdown output
      printMarkdownTools(tools, verboseOutput);
    }

    // Cleanup
    await clientTx.close();
    await serverTx.close();

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function printMarkdownTools(tools: ToolDefinition[], verbose: boolean) {
  console.log('# MCP Tools Documentation');
  console.log();
  console.log(`> **Total tools:** ${tools.length}`);
  console.log();

  // Group tools by category
  const byCategory = new Map<string, ToolDefinition[]>();
  for (const tool of tools) {
    const category = (tool as any)._meta?.category || tool.name.split('_')[0];
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(tool);
  }

  // Print table of contents
  console.log('## Table of Contents');
  console.log();
  for (const [category, categoryTools] of [...byCategory.entries()].sort()) {
    console.log(`### ${category} (${categoryTools.length} tools)`);
    for (const tool of categoryTools) {
      // Create anchor link
      const anchor = tool.name.toLowerCase().replace(/_/g, '-');
      console.log(`- [\`${tool.name}\`](#${anchor})`);
    }
    console.log();
  }

  console.log('---');
  console.log();

  // Print each tool
  for (const tool of tools) {
    printMarkdownTool(tool, verbose);
  }
}

function printMarkdownTool(tool: ToolDefinition, verbose: boolean) {
  // Tool header with anchor
  const anchor = tool.name.toLowerCase().replace(/_/g, '-');
  console.log(`## \`${tool.name}\` {#${anchor}}`);
  console.log();

  if (tool.title) {
    console.log(`**${tool.title}**`);
    console.log();
  }

  // Description
  console.log(tool.description);
  console.log();

  // Behavior hints as badges
  if (tool.annotations) {
    const ann = tool.annotations;
    const badges: string[] = [];

    if (ann.readOnlyHint) badges.push('`read-only`');
    if (ann.destructiveHint) badges.push('`DESTRUCTIVE`');
    if (ann.idempotentHint) badges.push('`idempotent`');
    if (ann.openWorldHint) badges.push('`open-world`');
    if (ann.timeout) badges.push(`\`timeout: ${ann.timeout}ms\``);

    if (badges.length > 0) {
      console.log(`**Behavior:** ${badges.join(' ')}`);
      console.log();
    }
  }

  // When to use
  if (tool.annotations?.when_to_use) {
    console.log('<details>');
    console.log('<summary><strong>When to Use</strong></summary>');
    console.log();
    console.log(tool.annotations.when_to_use);
    console.log();
    console.log('</details>');
    console.log();
  }

  // Parameters table
  console.log('### Parameters');
  console.log();

  const schema = tool.inputSchema;
  const props = schema.properties || {};
  const required = schema.required || [];

  if (Object.keys(props).length === 0) {
    console.log('*No parameters*');
  } else {
    console.log('| Parameter | Type | Required | Description |');
    console.log('|-----------|------|----------|-------------|');

    for (const [name, prop] of Object.entries(props)) {
      const isRequired = required.includes(name);
      const typeLabel = prop.enum
        ? `enum: \`${prop.enum.join('`, `')}\``
        : `\`${prop.type || 'any'}\``;

      let desc = prop.description || '';
      if (prop.default !== undefined) {
        desc += ` (default: \`${JSON.stringify(prop.default)}\`)`;
      }

      // Constraints
      const constraints: string[] = [];
      if (prop.minimum !== undefined) constraints.push(`min: ${prop.minimum}`);
      if (prop.maximum !== undefined) constraints.push(`max: ${prop.maximum}`);
      if (prop.minLength !== undefined) constraints.push(`minLength: ${prop.minLength}`);
      if (prop.maxLength !== undefined) constraints.push(`maxLength: ${prop.maxLength}`);
      if (prop.pattern) constraints.push(`pattern: \`${prop.pattern}\``);

      if (constraints.length > 0) {
        desc += ` [${constraints.join(', ')}]`;
      }

      // Escape pipes in description for table
      desc = desc.replace(/\|/g, '\\|').replace(/\n/g, ' ');

      console.log(`| \`${name}\` | ${typeLabel} | ${isRequired ? 'Yes' : 'No'} | ${desc} |`);
    }
  }
  console.log();

  // Parameter hints
  if (tool.annotations?.parameter_hints && Object.keys(tool.annotations.parameter_hints).length > 0) {
    console.log('<details>');
    console.log('<summary><strong>Parameter Hints</strong></summary>');
    console.log();

    for (const [param, hint] of Object.entries(tool.annotations.parameter_hints)) {
      console.log(`#### \`${param}\``);
      console.log();

      if (hint.description) {
        console.log(hint.description);
        console.log();
      }

      if (hint.examples?.length) {
        console.log('**Examples:**');
        for (const ex of hint.examples) {
          console.log(`- \`${ex}\``);
        }
        console.log();
      }

      if (hint.prerequisites?.length) {
        console.log('**Prerequisites:**');
        for (const prereq of hint.prerequisites) {
          console.log(`- ${prereq}`);
        }
        console.log();
      }

      if (hint.language_specific) {
        console.log('**Language-specific:**');
        console.log();
        console.log('| Language | Note |');
        console.log('|----------|------|');
        for (const [lang, note] of Object.entries(hint.language_specific)) {
          console.log(`| ${lang} | ${note.replace(/\|/g, '\\|')} |`);
        }
        console.log();
      }
    }

    console.log('</details>');
    console.log();
  }

  // Output Schema
  if (tool.outputSchema) {
    console.log('<details>');
    console.log('<summary><strong>Output Schema</strong></summary>');
    console.log();
    console.log('```json');
    console.log(JSON.stringify(tool.outputSchema, null, 2));
    console.log('```');
    console.log();
    console.log('</details>');
    console.log();
  }

  // Verbose: _meta
  if (verbose && (tool as any)._meta) {
    const meta = (tool as any)._meta;
    console.log('<details>');
    console.log('<summary><strong>Metadata</strong></summary>');
    console.log();
    if (meta.category) console.log(`- **Category:** ${meta.category}`);
    if (meta.tags?.length) console.log(`- **Tags:** ${meta.tags.join(', ')}`);
    console.log();
    console.log('</details>');
    console.log();
  }

  console.log('---');
  console.log();
}

// Run
main();
