/**
 * MCP Documentation Tools - Public API
 *
 * This module provides type-safe parsing and validation for documentation with YAML front matter.
 *
 * Public API:
 * - DocFrontMatterSchema: Zod schema for validation
 * - DocFrontMatter: TypeScript type (inferred from schema)
 * - DocEntry: Interface for parsed documentation
 * - DocSummary: Summary format for catalog browsing (Phase 5)
 * - DocContent: Full doc content format (Phase 5)
 * - DocMetadata: Enriched frontmatter structure (Phase 5)
 * - validateFrontMatter: Validation function
 * - parseDocument: Parser function (Phase 2)
 * - docLoader: Singleton loader instance (Phase 3)
 * - DocLoader: Loader class (Phase 3)
 * - DocRegistry: Unified doc management class (Phase 5)
 * - createDocsListTool: Generate docs_list tool (Phase 5)
 * - createDocsGetTool: Generate docs_get tool (Phase 5)
 *
 * Usage (Phase 5 Unified API):
 * ```typescript
 * import { docLoader, DocRegistry, createDocsListTool, createDocsGetTool } from './doc-tools/index.js';
 *
 * const docs = docLoader.load();
 * const registry = new DocRegistry(docs);
 * const listTool = createDocsListTool(registry);
 * const getTool = createDocsGetTool(registry);
 * ```
 *
 * Legacy Usage (Phase 1-3):
 * ```typescript
 * import { parseDocument, type DocEntry } from './doc-tools/index.js';
 *
 * const markdown = await readFile('docs/example.md', 'utf-8');
 * const entry: DocEntry = parseDocument(markdown, 'docs_example.md');
 * console.log(entry.frontMatter.tool_name); // 'docs_example'
 * console.log(entry.content); // Clean markdown without front matter
 * ```
 */

// Re-export types and schema from types.ts
export {
  DocFrontMatterSchema,
  type DocFrontMatter,
  type DocEntry,
  type DocSummary,
  type DocContent,
  type DocMetadata
} from './types.js';

// Re-export validator function from validator.ts
export { validateFrontMatter } from './validator.js';

// Re-export parser function from parser.ts (Phase 2)
export { parseDocument } from './parser.js';

// Re-export loader singleton and class from loader.ts (Phase 3)
export { docLoader, DocLoader } from './loader.js';

// Re-export Phase 5 unified documentation system
export { DocRegistry, DocNotFoundError, InvalidDocIdError } from './registry.js';
export { createDocsListTool, createDocsGetTool } from './unified-tools.js';

// Phase 4 export removed (T017) - generateDocTools deprecated
// Use DocRegistry + createDocsListTool/createDocsGetTool instead
