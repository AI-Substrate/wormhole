/**
 * Extract metadata from dynamic script files
 * Supports JSDoc, export const meta, and module.exports.meta
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ExtractedMetadata {
    name: string;
    description: string;
    category?: string;
    dangerOnly?: boolean;
    hasParamsSchema?: boolean;
    params?: Record<string, any>;
}

/**
 * Extract JSDoc comments from source
 */
function extractJSDoc(source: string): Partial<ExtractedMetadata> {
    const metadata: Partial<ExtractedMetadata> = {};

    // Match JSDoc block
    const jsdocMatch = source.match(/\/\*\*([\s\S]*?)\*\//);
    if (!jsdocMatch) return metadata;

    const jsdoc = jsdocMatch[1];

    // Extract @name
    const nameMatch = jsdoc.match(/@name\s+(.+?)(?:\n|$)/);
    if (nameMatch) {
        metadata.name = nameMatch[1].trim();
    }

    // Extract @description
    const descMatch = jsdoc.match(/@description\s+(.+?)(?:\n|$)/);
    if (descMatch) {
        metadata.description = descMatch[1].trim();
    } else {
        // Try to get description from first non-tag line
        const lines = jsdoc.split('\n');
        for (const line of lines) {
            const trimmed = line.replace(/^\s*\*\s?/, '').trim();
            if (trimmed && !trimmed.startsWith('@')) {
                metadata.description = trimmed;
                break;
            }
        }
    }

    // Extract @category
    const categoryMatch = jsdoc.match(/@category\s+(.+?)(?:\n|$)/);
    if (categoryMatch) {
        metadata.category = categoryMatch[1].trim();
    }

    // Extract @dangerOnly
    const dangerMatch = jsdoc.match(/@dangerOnly(?:\s+(true|false))?/);
    if (dangerMatch) {
        metadata.dangerOnly = dangerMatch[1] !== 'false';
    }

    // Check for @param tags (indicates params are defined)
    if (jsdoc.includes('@param')) {
        metadata.params = {}; // We'll parse these more thoroughly if needed
    }

    return metadata;
}

/**
 * Extract exported meta object from source
 */
function extractExportedMeta(source: string): Partial<ExtractedMetadata> {
    const metadata: Partial<ExtractedMetadata> = {};

    // Try to match export const meta = { ... }
    const exportConstMatch = source.match(/export\s+const\s+meta\s*=\s*(\{[\s\S]*?\})\s*;?/);
    if (exportConstMatch) {
        try {
            // Simple eval-free parsing for basic object literals
            const metaStr = exportConstMatch[1];
            const parsed = parseObjectLiteral(metaStr);
            Object.assign(metadata, parsed);
        } catch (error) {
            // Fallback to regex parsing
            metadata.name = extractStringValue(exportConstMatch[1], 'name');
            metadata.description = extractStringValue(exportConstMatch[1], 'description');
            metadata.category = extractStringValue(exportConstMatch[1], 'category');
            metadata.dangerOnly = extractBoolValue(exportConstMatch[1], 'dangerOnly');
        }
    }

    // Try module.exports.meta = { ... }
    const moduleExportsMatch = source.match(/module\.exports\.meta\s*=\s*(\{[\s\S]*?\})\s*;?/);
    if (moduleExportsMatch && !exportConstMatch) {
        try {
            const metaStr = moduleExportsMatch[1];
            const parsed = parseObjectLiteral(metaStr);
            Object.assign(metadata, parsed);
        } catch (error) {
            // Fallback to regex parsing
            metadata.name = extractStringValue(moduleExportsMatch[1], 'name');
            metadata.description = extractStringValue(moduleExportsMatch[1], 'description');
            metadata.category = extractStringValue(moduleExportsMatch[1], 'category');
            metadata.dangerOnly = extractBoolValue(moduleExportsMatch[1], 'dangerOnly');
        }
    }

    return metadata;
}

/**
 * Extract string value from object literal string
 */
function extractStringValue(objStr: string, key: string): string | undefined {
    const pattern = new RegExp(`${key}\\s*:\\s*["'\`]([^"'\`]*?)["'\`]`);
    const match = objStr.match(pattern);
    return match ? match[1] : undefined;
}

/**
 * Extract boolean value from object literal string
 */
function extractBoolValue(objStr: string, key: string): boolean | undefined {
    const pattern = new RegExp(`${key}\\s*:\\s*(true|false)`);
    const match = objStr.match(pattern);
    return match ? match[1] === 'true' : undefined;
}

/**
 * Simple object literal parser (no eval)
 */
function parseObjectLiteral(objStr: string): any {
    const result: any = {};

    // Extract simple key-value pairs
    const stringPattern = /(\w+)\s*:\s*["'`]([^"'`]*?)["'`]/g;
    let match;
    while ((match = stringPattern.exec(objStr)) !== null) {
        result[match[1]] = match[2];
    }

    // Extract boolean values
    const boolPattern = /(\w+)\s*:\s*(true|false)/g;
    while ((match = boolPattern.exec(objStr)) !== null) {
        result[match[1]] = match[2] === 'true';
    }

    // Extract number values
    const numPattern = /(\w+)\s*:\s*(\d+(?:\.\d+)?)/g;
    while ((match = numPattern.exec(objStr)) !== null) {
        result[match[1]] = parseFloat(match[2]);
    }

    return result;
}

/**
 * Check if script has a paramsSchema
 */
function hasParamsSchema(source: string): boolean {
    return source.includes('paramsSchema') ||
           source.includes('validateParams') ||
           source.includes('@param');
}

/**
 * Extract metadata from a script file
 */
export async function extractMetadata(filePath: string): Promise<ExtractedMetadata> {
    const source = await fs.promises.readFile(filePath, 'utf-8');

    // Start with defaults
    const metadata: ExtractedMetadata = {
        name: path.basename(filePath, '.js'),
        description: 'No description available'
    };

    // Extract from JSDoc
    const jsdocMeta = extractJSDoc(source);
    Object.assign(metadata, jsdocMeta);

    // Extract from exported meta (overrides JSDoc if present)
    const exportedMeta = extractExportedMeta(source);
    Object.assign(metadata, exportedMeta);

    // Check for params schema
    metadata.hasParamsSchema = hasParamsSchema(source);

    // Generate name from filename if still not set
    if (!metadata.name || metadata.name === path.basename(filePath, '.js')) {
        // Convert filename to readable name
        // e.g., "set-breakpoint.js" -> "set-breakpoint"
        // e.g., "myScript.js" -> "myScript"
        metadata.name = path.basename(filePath, '.js')
            .replace(/[-_]/g, '.')  // Convert dashes/underscores to dots
            .replace(/([a-z])([A-Z])/g, '$1.$2')  // Add dots before capitals
            .toLowerCase();
    }

    return metadata;
}