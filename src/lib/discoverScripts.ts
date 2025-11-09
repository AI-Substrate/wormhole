/**
 * Script discovery system for dynamic scripts
 * Discovers scripts from standard locations:
 * - workspace/.vsc-bridge/scripts/
 * - ~/.vscbridge/scripts/
 * - extension/src/vsc-scripts/ (built-ins)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { extractMetadata } from './extractMetadata.js';

export interface DiscoveredScript {
    path: string;
    name: string;
    description: string;
    category?: string;
    dangerOnly?: boolean;
    hasParamsSchema?: boolean;
    location: 'workspace' | 'user' | 'builtin';
}

/**
 * Get standard script discovery locations
 */
export function getDiscoveryLocations(): { path: string; type: 'workspace' | 'user' | 'builtin' }[] {
    const locations: { path: string; type: 'workspace' | 'user' | 'builtin' }[] = [];

    // 1. Workspace scripts
    const workspacePath = path.join(process.cwd(), '.vsc-bridge', 'scripts');
    if (fs.existsSync(workspacePath)) {
        locations.push({ path: workspacePath, type: 'workspace' });
    }

    // 2. User scripts
    const userPath = path.join(os.homedir(), '.vscbridge', 'scripts');
    if (fs.existsSync(userPath)) {
        locations.push({ path: userPath, type: 'user' });
    }

    // Note: Built-in scripts are accessed via manifest only, not discovered dynamically
    // to avoid conflicts and ensure proper execution context

    return locations;
}

/**
 * Recursively discover .js files in a directory
 */
function discoverJsFiles(dir: string): string[] {
    const files: string[] = [];

    function walk(currentDir: string) {
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    // Skip node_modules and hidden directories
                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        walk(fullPath);
                    }
                } else if (entry.isFile() && entry.name.endsWith('.js')) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Ignore permission errors
            console.error(`Error reading directory ${currentDir}:`, error);
        }
    }

    walk(dir);
    return files;
}

/**
 * Discover all scripts from standard locations
 */
export async function discoverScripts(): Promise<DiscoveredScript[]> {
    const scripts: DiscoveredScript[] = [];
    const locations = getDiscoveryLocations();
    const seenNames = new Set<string>(); // Track seen names to handle duplicates

    for (const location of locations) {
        const jsFiles = discoverJsFiles(location.path);

        for (const filePath of jsFiles) {
            try {
                const metadata = await extractMetadata(filePath);

                // Generate a unique name if needed
                let scriptName = metadata.name;
                if (seenNames.has(scriptName)) {
                    // Append location type for duplicates
                    scriptName = `${metadata.name}.${location.type}`;
                }
                seenNames.add(scriptName);

                scripts.push({
                    path: filePath,
                    name: scriptName,
                    description: metadata.description,
                    category: metadata.category,
                    dangerOnly: metadata.dangerOnly,
                    hasParamsSchema: metadata.hasParamsSchema,
                    location: location.type
                });
            } catch (error) {
                // Log but don't fail on individual script errors
                console.error(`Failed to extract metadata from ${filePath}:`, error);
            }
        }
    }

    // Sort by location priority: workspace > user > builtin
    const locationPriority = { workspace: 0, user: 1, builtin: 2 };
    scripts.sort((a, b) => {
        const priorityDiff = locationPriority[a.location] - locationPriority[b.location];
        if (priorityDiff !== 0) return priorityDiff;
        return a.name.localeCompare(b.name);
    });

    return scripts;
}

/**
 * Find a specific script by name
 */
export async function findScript(name: string): Promise<DiscoveredScript | undefined> {
    const scripts = await discoverScripts();
    return scripts.find(s => s.name === name);
}