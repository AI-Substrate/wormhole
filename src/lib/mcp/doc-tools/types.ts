import { z } from 'zod';

/**
 * T007: AgentHelp Zod schema - Structured LLM guidance with 6 sub-fields.
 */
const AgentHelpSchema = z.object({
  whenToUse: z.string().optional(),
  whatToDoNext: z.array(z.string()).optional(),
  useCases: z.array(z.string()).optional(),
  paramsNotes: z.string().optional(),
  limits: z.string().optional(),
  fallbacks: z.string().optional(),
}).optional();

/**
 * T007a: Examples field schema - MCP spec structure for usage demonstrations.
 */
const ExamplesSchema = z.array(z.object({
  input: z.any(),
  output: z.any(),
  description: z.string()
})).optional();

/**
 * T009a: OutputSchema field - JSON Schema object for structured output.
 */
const OutputSchemaSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.any()).optional(),
  required: z.array(z.string()).optional()
}).optional();

/**
 * Zod schema for documentation front matter validation.
 *
 * Phase 1-4 fields (existing):
 * - tool_name: Must match ^docs_[a-z0-9_]+$ pattern and match filename
 * - description: 10-500 characters for token budget constraint
 * - category: Optional organizational grouping
 * - tags: Optional array of keywords for filtering
 *
 * Phase 5 additions:
 * - summary: REQUIRED 10-200 char summary (T008 - BREAKING CHANGE)
 * - title: Optional UI-friendly display name (T007b)
 * - agentHelp: Optional structured guidance with 6 sub-fields (T007)
 * - examples: Optional usage demonstrations (T007a)
 * - outputSchema: Optional JSON Schema for output structure (T009a)
 *
 * Design Decisions:
 * - No .strict() mode: Allows authors to add custom metadata fields for
 *   organizational purposes (e.g., author, last_updated, version). This
 *   maintains forward compatibility and aligns with "minimal required fields"
 *   philosophy from the spec.
 * - No timeout field: YAGNI - documentation tools return instantly (<1ms).
 *   Can be added later if async doc generation becomes a requirement.
 * - Lowercase normalization: Filename comparison uses .toLowerCase() to
 *   handle case-insensitive filesystems (macOS, Windows) consistently.
 */
export const DocFrontMatterSchema = z.object({
  // Phase 1-4 fields (existing)
  tool_name: z.string()
    .min(1, "tool_name is required")
    .max(50, "tool_name too long (max 50 chars)")
    .regex(/^docs_[a-z0-9_]+$/, "tool_name must match pattern: docs_[a-z0-9_]+"),

  description: z.string()
    .min(10, "Description too short (min 10 chars)")
    .max(500, "Description too long (max 500 chars for token budget)"),

  category: z.string().optional(),
  tags: z.array(z.string()).optional(),

  // Phase 5 REQUIRED field (T008 - BREAKING CHANGE from Phase 4)
  // Safe to add because T007c updates all test fixtures first
  summary: z.string()
    .min(10, "Summary too short (min 10 chars)")
    .max(200, "Summary too long (max 200 chars)"),

  // Phase 5 enrichment fields (T007b, T009 - all optional)
  title: z.string().max(100, "Title too long (max 100 chars)").optional(),
  agentHelp: AgentHelpSchema,
  examples: ExamplesSchema,
  outputSchema: OutputSchemaSchema,
});

/**
 * TypeScript type inferred from Zod schema.
 * Use this for function parameters and return types.
 */
export type DocFrontMatter = z.infer<typeof DocFrontMatterSchema>;

/**
 * Represents a parsed documentation entry.
 *
 * This is the output of the parser (Phase 2) and input to the loader (Phase 3).
 *
 * @property frontMatter - Validated YAML front matter
 * @property content - Markdown content (excluding front matter delimiters)
 * @property filePath - Absolute path to source .md file
 */
export interface DocEntry {
  frontMatter: DocFrontMatter;
  content: string;
  filePath: string;
}

// ============================================================================
// Phase 5: Unified API Types and Enrichment Schema
// ============================================================================

/**
 * T004: Summary information for catalog browsing (docs_list response).
 *
 * Lightweight representation for browsing documentation catalog without
 * fetching full content. Used by docs_list tool to enable discovery.
 */
export interface DocSummary {
  id: string;           // Document ID (e.g., "debugging-guide" without docs_ prefix)
  summary: string;      // REQUIRED: 10-200 char summary (T008)
  category?: string;    // Optional: Category for filtering
  tags?: string[];      // Optional: Tags for filtering
  whenToUse?: string;   // Optional: Agent guidance from agentHelp
}

/**
 * T005: Full document content for retrieval (docs_get response).
 *
 * Complete representation including markdown content and all metadata.
 * Used by docs_get tool after agent selects from catalog.
 */
export interface DocContent {
  id: string;           // Document ID
  summary: string;      // REQUIRED: 10-200 char summary
  content: string;      // Full markdown content
  metadata: DocMetadata; // All frontmatter fields + enrichment
}

/**
 * T006: Complete document metadata (enriched frontmatter).
 *
 * Combines Phase 1-4 fields with Phase 7 enrichment fields.
 * All enrichment fields are optional for backward compatibility.
 */
export interface DocMetadata {
  // Phase 1-4 fields (existing)
  tool_name: string;
  description: string;
  category?: string;
  tags?: string[];

  // Phase 5 REQUIRED field (T008)
  summary: string;

  // Phase 5/7 enrichment fields (T007-T009a - all optional)
  title?: string;                    // UI-friendly display name
  agentHelp?: AgentHelp;             // Structured LLM guidance
  examples?: Array<{                 // Usage examples
    input: any;
    output: any;
    description: string;
  }>;
  outputSchema?: {                   // JSON Schema for output
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}

/**
 * T007: Structured agent guidance for LLM tool usage.
 *
 * All 6 sub-fields are optional. Provides contextual help beyond
 * basic description field. Aligned with MCP best practices.
 */
export interface AgentHelp {
  whenToUse?: string;        // When to call this tool vs alternatives
  whatToDoNext?: string[];   // Suggested follow-up actions
  useCases?: string[];       // Common usage scenarios
  paramsNotes?: string;      // Parameter usage tips and gotchas
  limits?: string;           // Limitations and constraints
  fallbacks?: string;        // Alternative approaches if tool fails
}
