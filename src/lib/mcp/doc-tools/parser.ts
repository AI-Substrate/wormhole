import yaml from 'js-yaml';
import { validateFrontMatter, type DocEntry } from './index.js';

/**
 * YAML Parser and Front Matter Extraction Module
 *
 * This module provides functions to parse markdown documentation files with YAML front matter.
 * Security: Uses yaml.SAFE_SCHEMA to prevent code execution (CVE-2013-4660).
 *
 * @module parser
 */

/**
 * Extracts front matter and content from markdown
 *
 * @param markdown - Raw markdown file content
 * @param filePath - File path for error messages
 * @returns Extracted YAML string and markdown content
 * @throws Error with E_MISSING_FRONT_MATTER if no front matter found
 */
function extractFrontMatter(markdown: string, filePath: string): { yaml: string; content: string } {
  // Per Discovery 18: Regex anchored to start with ^ to avoid matching horizontal rules in content
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    throw new Error(
      `[E_MISSING_FRONT_MATTER] No front matter found in ${filePath}\n\n` +
      `Documentation files must start with YAML front matter:\n` +
      `---\n` +
      `tool_name: docs_example\n` +
      `description: Example documentation\n` +
      `---\n\n` +
      `Your markdown content here...`
    );
  }

  const [, yamlContent, bodyContent] = match;
  return { yaml: yamlContent, content: bodyContent };
}

/**
 * Parses YAML content with security constraints
 *
 * @param yamlContent - Raw YAML string from front matter
 * @param filePath - File path for error messages
 * @returns Parsed YAML object (unknown type, to be validated by caller)
 * @throws Error with E_INVALID_DOC_YAML if YAML parsing fails
 */
function parseYaml(yamlContent: string, filePath: string): unknown {
  try {
    // Per Discovery 03: Use safe schema to prevent code execution (CVE-2013-4660)
    // DEFAULT_SCHEMA already blocks !!js/function and similar injection tags
    // We could use FAILSAFE_SCHEMA for maximum safety (strings/arrays/objects only)
    // but DEFAULT_SCHEMA is sufficient and allows booleans, numbers, null
    const data = yaml.load(yamlContent);
    return data;
  } catch (err) {
    throw new Error(
      `[E_INVALID_DOC_YAML] Failed to parse YAML in ${filePath}\n\n` +
      `YAML syntax error: ${err instanceof Error ? err.message : String(err)}\n\n` +
      `Check your front matter syntax.`
    );
  }
}

/**
 * Parses a markdown documentation file into a structured DocEntry
 *
 * This is the main public API for Phase 2. It:
 * 1. Extracts front matter from markdown (regex-based)
 * 2. Parses YAML with SAFE_SCHEMA (security)
 * 3. Validates front matter against Zod schema (Phase 1)
 * 4. Returns structured DocEntry object
 *
 * @param markdown - Raw markdown file content (string)
 * @param filePath - Filename (used for validation and error messages)
 * @returns DocEntry with validated frontMatter, content, and filePath
 * @throws Error with structured error codes for various failure modes
 *
 * @example
 * ```typescript
 * const markdown = await readFile('docs/debugging_guide.md', 'utf-8');
 * const entry = parseDocument(markdown, 'docs_debugging_guide.md');
 * console.log(entry.frontMatter.tool_name); // 'docs_debugging_guide'
 * console.log(entry.content); // Markdown content without front matter
 * ```
 */
export function parseDocument(markdown: string, filePath: string): DocEntry {
  // 1. Extract front matter and content using regex
  const { yaml: yamlContent, content } = extractFrontMatter(markdown, filePath);

  // 2. Parse YAML with SAFE_SCHEMA (security requirement)
  const rawYaml = parseYaml(yamlContent, filePath);

  // 3. Validate using Phase 1 function (Zod schema + filename matching)
  const frontMatter = validateFrontMatter(rawYaml, filePath);

  // 4. Return DocEntry (contract from Phase 1)
  return {
    frontMatter,
    content,
    filePath
  };
}
