#!/usr/bin/env ts-node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

interface ScriptParams {
    [key: string]: {
        type: string;
        required?: boolean;
        default?: any;
        description?: string;
        values?: string[];
        when?: string;
    };
}

interface ScriptMetadata {
    alias: string;
    name?: string;
    category?: string;
    description?: string;
    dangerOnly?: boolean;
    params?: ScriptParams;
    response?: string;
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

interface ManifestEntry {
    metadata: ScriptMetadata;
    scriptRelPath: string;
}

interface ScriptManifest {
    version: number;
    generatedAt: string;
    scripts: { [alias: string]: ManifestEntry };
}

const SCRIPTS_DIR = path.resolve(process.cwd(), 'packages', 'extension', 'src', 'vsc-scripts');
const OUTPUT_FILE = path.join(SCRIPTS_DIR, 'manifest.json');

async function discoverScripts(dir: string, baseDir: string = dir): Promise<ManifestEntry[]> {
    const entries: ManifestEntry[] = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
            // Recursively discover scripts in subdirectories
            const subEntries = await discoverScripts(fullPath, baseDir);
            entries.push(...subEntries);
        } else if (item.name.endsWith('.meta.yaml')) {
            // Found a metadata file, check for corresponding .ts or .js file
            const baseName = item.name.replace('.meta.yaml', '');
            const tsPath = path.join(dir, baseName + '.ts');
            const jsPath = path.join(dir, baseName + '.js');

            // Prefer .ts over .js during incremental conversion
            const scriptPath = fs.existsSync(tsPath) ? tsPath :
                             fs.existsSync(jsPath) ? jsPath : null;

            if (scriptPath) {
                try {
                    // Read and parse metadata
                    const metaContent = fs.readFileSync(fullPath, 'utf-8');
                    const metadata = yaml.load(metaContent) as ScriptMetadata;

                    // Calculate relative path from scripts directory
                    const relPath = path.relative(baseDir, scriptPath);

                    // Convert .ts extension to .js for runtime loading from out/ directory
                    const runtimeRelPath = relPath.replace(/\.ts$/, '.js');

                    entries.push({
                        metadata,
                        scriptRelPath: runtimeRelPath
                    });

                    console.log(`✓ Discovered script: ${metadata.alias} (${relPath})`);
                } catch (error) {
                    console.error(`✗ Failed to parse metadata for ${fullPath}:`, error);
                }
            } else {
                console.warn(`⚠ Metadata file ${item.name} has no corresponding .ts or .js file`);
            }
        }
    }

    return entries;
}

async function buildManifest() {
    console.log('Building script manifest...\n');

    // Check if scripts directory exists
    if (!fs.existsSync(SCRIPTS_DIR)) {
        console.error(`Scripts directory not found: ${SCRIPTS_DIR}`);
        process.exit(1);
    }

    // Discover all scripts
    const entries = await discoverScripts(SCRIPTS_DIR);

    // Build manifest v2 with enhanced metadata preservation
    const manifest: ScriptManifest = {
        version: 2,
        generatedAt: new Date().toISOString(),
        scripts: {}
    };

    // Add each script to manifest by alias
    for (const entry of entries) {
        const alias = entry.metadata.alias;
        if (manifest.scripts[alias]) {
            console.warn(`⚠ Duplicate alias detected: ${alias}`);
        }
        manifest.scripts[alias] = entry;
    }

    // Write manifest to file
    const manifestJson = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(OUTPUT_FILE, manifestJson);

    console.log(`\n✅ Manifest generated successfully!`);
    console.log(`   Output: ${OUTPUT_FILE}`);
    console.log(`   Scripts: ${Object.keys(manifest.scripts).length}`);
    console.log(`   Aliases: ${Object.keys(manifest.scripts).join(', ')}`);
}

// Run the build
buildManifest().catch(error => {
    console.error('Failed to build manifest:', error);
    process.exit(1);
});