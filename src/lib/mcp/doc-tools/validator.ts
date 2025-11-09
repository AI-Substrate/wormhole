import { basename } from 'path';
import { DocFrontMatterSchema, type DocFrontMatter } from './types.js';

/**
 * Validates raw YAML front matter against the DocFrontMatterSchema.
 *
 * Performs two validations:
 * 1. Schema validation: Checks all required fields, types, and constraints
 * 2. Filename matching: Ensures tool_name matches filename (case-insensitive)
 *
 * @param raw - Raw YAML object (from parser)
 * @param filePath - Path to the .md file (for filename matching and error messages)
 * @returns Validated and typed DocFrontMatter object
 * @throws Error with structured message if validation fails
 *
 * Design Decisions:
 * - Uses Zod safeParse() to get structured error messages
 * - Normalizes both filename and tool_name to lowercase for comparison
 *   (addresses cross-platform case sensitivity issues per Insight 1)
 * - Error messages include file path and specific field issues
 *
 * @example
 * ```typescript
 * const raw = {
 *   tool_name: 'docs_debugging_guide',
 *   description: 'Comprehensive debugging guide for MCP tools'
 * };
 *
 * const validated = validateFrontMatter(raw, 'docs_debugging_guide.md');
 * // Returns typed DocFrontMatter object
 * ```
 *
 * @example
 * ```typescript
 * const invalid = { tool_name: 12345, description: 'Test' };
 * validateFrontMatter(invalid, 'docs_test.md');
 * // Throws: "Invalid front matter in docs_test.md: tool_name: Expected string, received number"
 * ```
 */
export function validateFrontMatter(
  raw: unknown,
  filePath: string
): DocFrontMatter {
  // 1. Validate against Zod schema
  const result = DocFrontMatterSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new Error(`Invalid front matter in ${filePath}: ${issues}`);
  }

  // 2. Check filename matches tool_name (normalized to lowercase)
  // Normalize both sides to handle case-insensitive filesystems
  // (macOS/Windows are case-insensitive, Linux is case-sensitive)
  const expectedToolName = basename(filePath, '.md').toLowerCase();
  const actualToolName = result.data.tool_name.toLowerCase();

  if (actualToolName !== expectedToolName) {
    throw new Error(
      `Filename/tool_name mismatch in ${filePath}: ` +
      `expected tool_name="${expectedToolName}" (normalized), ` +
      `got tool_name="${actualToolName}" (normalized)`
    );
  }

  return result.data;
}
