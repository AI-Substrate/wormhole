import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Parameter definition from metadata
 */
export interface ParamDefinition {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';
    required?: boolean;
    default?: any;
    description?: string;
    values?: string[];  // For enum type
    minLength?: number;  // For strings
    maxLength?: number;  // For strings
    min?: number;        // For numbers
    max?: number;        // For numbers
    integer?: boolean;   // For numbers
    aliases?: string[];  // Alternative names for this parameter
    resolve?: 'workspace-relative' | 'absolute' | 'cwd-relative';  // Path resolution strategy
    pattern?: string;    // Regex pattern for string validation
    coerce?: boolean;    // Override global coercion setting for this parameter
    items?: {            // For array type - defines the type of array elements
        type?: string;
    };
}

/**
 * Script metadata from manifest
 */
export interface ScriptMetadata {
    alias: string;
    name?: string;
    category?: string;
    description?: string;
    dangerOnly?: boolean;
    params?: Record<string, ParamDefinition>;
    response?: 'action' | 'query' | 'waitable' | 'stream';
    errors?: string[];
    cli?: {
        command: string;
        description: string;
        examples: string[];
    };
    mcp?: {
        tool: string;
        description: string;
    };
}

/**
 * Manifest entry for a script
 */
export interface ManifestEntry {
    metadata: ScriptMetadata;
    scriptRelPath: string;
}

/**
 * Manifest v2 structure
 */
export interface ManifestV2 {
    version: number;
    generatedAt: string;
    scripts: Record<string, ManifestEntry>;
}

/**
 * Manifest loader with caching and fallback paths
 */
export class ManifestLoader {
    private cache: ManifestV2 | null = null;
    private searchPaths: string[] = [];

    constructor() {
        // Initialize search paths
        this.initializeSearchPaths();
    }

    /**
     * Initialize the search paths for manifest
     */
    private initializeSearchPaths(): void {
        // Get the directory of this file (when compiled)
        const __dirname = path.dirname(fileURLToPath(import.meta.url));

        this.searchPaths = [
            // 1. CLI dist directory (highest priority)
            path.join(__dirname, '..', 'manifest.json'),

            // 2. Current working directory .vsc-bridge
            path.join(process.cwd(), '.vsc-bridge', 'manifest.json'),

            // 3. Extension out directory (relative to CLI)
            path.join(__dirname, '..', '..', '..', 'extension', 'out', 'vsc-scripts', 'manifest.json'),

            // 4. Extension src directory (development)
            path.join(__dirname, '..', '..', '..', 'extension', 'src', 'vsc-scripts', 'manifest.json'),

            // 5. Absolute fallback paths
            path.join(process.env.HOME || '', '.vsc-bridge', 'manifest.json'),
        ];

        // Add any custom path from environment
        if (process.env.VSC_BRIDGE_MANIFEST_PATH) {
            this.searchPaths.unshift(process.env.VSC_BRIDGE_MANIFEST_PATH);
        }
    }

    /**
     * Load the manifest from the first available location
     */
    load(): ManifestV2 {
        // Return cached version if available
        if (this.cache) {
            return this.cache;
        }

        // Try each search path
        for (const searchPath of this.searchPaths) {
            try {
                if (fs.existsSync(searchPath)) {
                    const content = fs.readFileSync(searchPath, 'utf-8');
                    const manifest = JSON.parse(content) as ManifestV2;

                    // Validate version
                    if (manifest.version !== 2) {
                        console.warn(`Warning: Manifest at ${searchPath} has version ${manifest.version}, expected 2`);
                        continue;
                    }

                    // Cache and return
                    this.cache = manifest;
                    return manifest;
                }
            } catch (error) {
                // Log error but continue to next path
                console.debug(`Failed to load manifest from ${searchPath}:`, error);
                continue;
            }
        }

        // No manifest found
        throw new Error(
            `Manifest not found in any of the following locations:\n${this.searchPaths.map(p => `  - ${p}`).join('\n')}\n\n` +
            `Make sure the extension is built with 'just build-manifest' or set VSC_BRIDGE_MANIFEST_PATH environment variable.`
        );
    }

    /**
     * Clear the cached manifest
     */
    clearCache(): void {
        this.cache = null;
    }

    /**
     * Get metadata for a specific script
     */
    getScriptMetadata(alias: string): ScriptMetadata | null {
        const manifest = this.load();
        const entry = manifest.scripts[alias];
        return entry?.metadata || null;
    }

    /**
     * List all available scripts
     */
    listScripts(): string[] {
        const manifest = this.load();
        return Object.keys(manifest.scripts);
    }

    /**
     * Get scripts grouped by category
     */
    getScriptsByCategory(): Record<string, ScriptMetadata[]> {
        const manifest = this.load();
        const byCategory: Record<string, ScriptMetadata[]> = {};

        for (const entry of Object.values(manifest.scripts)) {
            const category = entry.metadata.category || 'uncategorized';
            if (!byCategory[category]) {
                byCategory[category] = [];
            }
            byCategory[category].push(entry.metadata);
        }

        return byCategory;
    }

    /**
     * Check if a script exists
     */
    hasScript(alias: string): boolean {
        const manifest = this.load();
        return alias in manifest.scripts;
    }

    /**
     * Get the path where manifest was loaded from
     */
    getLoadedPath(): string | null {
        // Try to find which path worked
        for (const searchPath of this.searchPaths) {
            if (fs.existsSync(searchPath)) {
                try {
                    const content = fs.readFileSync(searchPath, 'utf-8');
                    const manifest = JSON.parse(content) as ManifestV2;
                    if (manifest.version === 2) {
                        return searchPath;
                    }
                } catch {
                    continue;
                }
            }
        }
        return null;
    }
}

// Export singleton instance
export const manifestLoader = new ManifestLoader();