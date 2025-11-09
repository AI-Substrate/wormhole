// Documentation loader with singleton caching pattern
// Discovers markdown files and parses them using Phase 2 parser

import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { readdirSync, readFileSync } from 'fs';
import type { DocEntry } from './types.js';
import { parseDocument } from './parser.js';

// ESM __dirname replacement (Node 18+ compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DocLoader {
  private cache: DocEntry[] | null = null;

  /**
   * Load documentation files from the docs directory.
   *
   * @param docsDir Optional docs directory path (defaults to ../docs relative to loader.js)
   * @returns Array of parsed documentation entries
   */
  load(docsDir?: string): DocEntry[] {
    // Return cached result if available
    if (this.cache) return this.cache;

    // Default to docs/ directory next to compiled loader.js
    // In dist/: dist/lib/mcp/doc-tools/loader.js → ../docs → dist/lib/mcp/docs/
    const dir = docsDir ?? join(__dirname, '../docs');
    const startTime = Date.now();

    // Discover all .md files
    const files = this.discoverDocFiles(dir);
    const validEntries: DocEntry[] = [];
    let invalidCount = 0;

    // Parse each discovered file with error resilience
    for (const file of files) {
      try {
        const markdown = readFileSync(file, 'utf-8');
        const entry = parseDocument(markdown, basename(file));
        validEntries.push(entry);
      } catch (err) {
        const error = err as Error;
        console.error(`[doc-loader] Skipping invalid doc ${file}: ${error.message}`);
        invalidCount++;
      }
    }

    // Log summary if there were issues
    if (invalidCount > 0) {
      console.error(`[doc-loader] Loaded ${validEntries.length}/${files.length} docs (${invalidCount} invalid)`);
    }

    // Performance logging
    const loadTime = Date.now() - startTime;
    if (loadTime > 500) {
      console.error(`[doc-loader] WARNING: Doc loading took ${loadTime}ms (expected <500ms for 10 files)`);
    }

    // Cache and return
    this.cache = validEntries;
    return validEntries;
  }

  /**
   * Discover all .md files in the docs directory.
   *
   * @param docsDir Directory to search for markdown files
   * @returns Array of absolute file paths
   */
  private discoverDocFiles(docsDir: string): string[] {
    try {
      const files = readdirSync(docsDir);
      return files
        .filter(file => file.endsWith('.md'))
        .map(file => join(docsDir, file));
    } catch (err) {
      // Directory doesn't exist or not readable
      console.error(`[doc-loader] Failed to read docs directory: ${docsDir}`);
      return [];
    }
  }

  /**
   * Clear the cache (for testing purposes).
   */
  clearCache(): void {
    this.cache = null;
  }
}

// Export singleton instance for production use
export const docLoader = new DocLoader();
