/**
 * DocRegistry - Central document management for MCP documentation system
 *
 * Phase 5 T010-T013: Provides unified catalog and retrieval interface
 * - getAllSummaries(): List all docs with optional category/tags filtering
 * - getDocById(): Fetch full doc content with ID normalization
 * - Error handling: E_DOC_NOT_FOUND, E_INVALID_ID
 *
 * Design:
 * - O(N) linear search (YAGNI - no hash map optimization)
 * - ID normalization: "debugging-guide" ↔ "docs_debugging_guide"
 * - Filter logic: category exact match, tags OR match
 */

import type { DocEntry, DocSummary, DocContent, DocMetadata } from './types.js';

/**
 * Custom error for document not found
 */
export class DocNotFoundError extends Error {
  constructor(id: string, availableDocs: string[]) {
    const availableList = availableDocs.length > 0
      ? `\n\nAvailable documents:\n${availableDocs.map(d => `  - ${d}`).join('\n')}`
      : '';
    super(`E_DOC_NOT_FOUND: Document "${id}" not found.${availableList}`);
    this.name = 'DocNotFoundError';
  }
}

/**
 * Custom error for invalid document ID format
 */
export class InvalidDocIdError extends Error {
  constructor(id: string) {
    super(`E_INVALID_ID: Invalid document ID "${id}". Must match pattern: ^[a-z0-9-]+$`);
    this.name = 'InvalidDocIdError';
  }
}

/**
 * DocRegistry - Central document management singleton
 *
 * Manages collection of MCP documentation entries and provides
 * unified catalog and retrieval operations.
 */
export class DocRegistry {
  private entries: DocEntry[];

  /**
   * Create a new DocRegistry
   *
   * @param entries - Array of DocEntry objects from docLoader
   */
  constructor(entries: DocEntry[]) {
    this.entries = entries;
  }

  /**
   * Get all document summaries with optional filtering
   *
   * T011: Catalog endpoint logic
   * - No filter: returns all docs
   * - category filter: exact match
   * - tags filter: OR logic (doc matches if it has ANY of the specified tags)
   *
   * @param filter - Optional category and/or tags filter
   * @returns Array of DocSummary objects
   */
  getAllSummaries(filter?: { category?: string; tags?: string[] }): DocSummary[] {
    let filtered = this.entries;

    // Apply category filter (exact match)
    if (filter?.category) {
      filtered = filtered.filter(entry =>
        entry.frontMatter.category === filter.category
      );
    }

    // Apply tags filter (OR logic - doc must have at least one matching tag)
    if (filter?.tags && filter.tags.length > 0) {
      filtered = filtered.filter(entry => {
        const docTags = entry.frontMatter.tags || [];
        return filter.tags!.some(tag => docTags.includes(tag));
      });
    }

    // Map to DocSummary format
    return filtered.map(entry => ({
      id: this.stripDocsPrefix(entry.frontMatter.tool_name),
      summary: entry.frontMatter.summary,
      category: entry.frontMatter.category,
      tags: entry.frontMatter.tags,
      whenToUse: entry.frontMatter.agentHelp?.whenToUse
    }));
  }

  /**
   * Get full document content by ID
   *
   * T012: Fetch endpoint logic
   * - Normalizes ID: "debugging-guide" → "docs_debugging_guide"
   * - Returns full DocContent with metadata
   * - Throws DocNotFoundError if doc doesn't exist
   *
   * @param id - Document ID (with or without "docs_" prefix)
   * @returns Full document content and metadata
   * @throws {InvalidDocIdError} If ID format is invalid
   * @throws {DocNotFoundError} If document not found
   */
  getDocById(id: string): DocContent {
    // T013: Validate ID format
    const normalizedId = this.normalizeId(id);
    this.validateIdFormat(normalizedId);

    // Find document (O(N) linear search - YAGNI)
    const entry = this.entries.find(e =>
      e.frontMatter.tool_name.toLowerCase() === normalizedId.toLowerCase()
    );

    // T013: Throw helpful error if not found
    if (!entry) {
      const availableIds = this.entries.map(e =>
        this.stripDocsPrefix(e.frontMatter.tool_name)
      );
      throw new DocNotFoundError(id, availableIds);
    }

    // Return full DocContent
    // Map frontMatter to DocMetadata
    // Note: frontMatter (DocFrontMatter from Zod inference) has compatible structure
    // with DocMetadata, but TypeScript can't infer this due to Zod's type system.
    // Safe to cast since both types represent the same runtime structure.
    const metadata: DocMetadata = {
      tool_name: entry.frontMatter.tool_name,
      description: entry.frontMatter.description,
      summary: entry.frontMatter.summary,
      ...(entry.frontMatter.category && { category: entry.frontMatter.category }),
      ...(entry.frontMatter.tags && { tags: entry.frontMatter.tags }),
      ...(entry.frontMatter.title && { title: entry.frontMatter.title }),
      ...(entry.frontMatter.agentHelp && { agentHelp: entry.frontMatter.agentHelp }),
      ...(entry.frontMatter.examples && {
        examples: entry.frontMatter.examples as Array<{
          input: any;
          output: any;
          description: string;
        }>
      }),
      ...(entry.frontMatter.outputSchema && { outputSchema: entry.frontMatter.outputSchema })
    };

    return {
      id: this.stripDocsPrefix(entry.frontMatter.tool_name),
      summary: entry.frontMatter.summary,
      content: entry.content,
      metadata
    };
  }

  /**
   * Normalize document ID for lookup
   *
   * Handles both formats:
   * - "debugging-guide" → "docs_debugging_guide"
   * - "docs_debugging_guide" → "docs_debugging_guide"
   *
   * @param id - Raw document ID
   * @returns Normalized ID with "docs_" prefix and underscores
   */
  private normalizeId(id: string): string {
    const lowercase = id.toLowerCase();

    // Already has docs_ prefix
    if (lowercase.startsWith('docs_')) {
      return lowercase;
    }

    // Add docs_ prefix and convert hyphens to underscores
    return `docs_${lowercase.replace(/-/g, '_')}`;
  }

  /**
   * Strip "docs_" prefix from tool_name for external IDs
   *
   * @param toolName - Full tool_name (e.g., "docs_debugging_guide")
   * @returns ID without prefix (e.g., "debugging-guide")
   */
  private stripDocsPrefix(toolName: string): string {
    const withoutPrefix = toolName.replace(/^docs_/, '');
    // Convert underscores to hyphens for external ID format
    return withoutPrefix.replace(/_/g, '-');
  }

  /**
   * Validate document ID format
   *
   * T013: ID must match ^[a-z0-9-]+$ (after normalization and prefix strip)
   *
   * @param normalizedId - ID after normalization (with docs_ prefix)
   * @throws {InvalidDocIdError} If format is invalid
   */
  private validateIdFormat(normalizedId: string): void {
    // Validate pattern: docs_[a-z0-9_]+
    const pattern = /^docs_[a-z0-9_]+$/;
    if (!pattern.test(normalizedId)) {
      // Strip prefix to show user-friendly format in error
      const externalId = this.stripDocsPrefix(normalizedId);
      throw new InvalidDocIdError(externalId);
    }
  }
}
