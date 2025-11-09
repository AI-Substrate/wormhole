#!/usr/bin/env node

/**
 * Validate Script Imports
 *
 * Purpose: Ensure all scripts in manifest.json have corresponding static imports
 *          in src/vsc-scripts/index.ts
 *
 * Usage: Called during build process to prevent silent registration failures
 * Exits: 0 if all imports present, 1 if missing imports detected
 *
 * Context: Part of Phase 5 Registry Integration (Task T002)
 *          Manual import maintenance requires build-time validation
 */

const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.resolve(process.cwd(), 'packages', 'extension', 'src', 'vsc-scripts');
const MANIFEST_PATH = path.join(SCRIPTS_DIR, 'manifest.json');
const INDEX_PATH = path.join(SCRIPTS_DIR, 'index.ts');

function extractClassNameFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^export class (\w+Script)/m);
    return match ? match[1] : null;
}

function extractExportsFromIndex(indexPath) {
    const content = fs.readFileSync(indexPath, 'utf8');
    const exports = new Set();

    // Match: export { ClassName } from './path'; (but not commented lines)
    const lines = content.split('\n');
    for (const line of lines) {
        // Skip commented lines
        if (line.trim().startsWith('//')) {
            continue;
        }

        const match = line.match(/export\s+\{\s*(\w+)\s*\}\s+from/);
        if (match) {
            exports.add(match[1]);
        }
    }

    return exports;
}

function validateScriptImports() {
    console.log('🔍 Validating script imports...\n');

    // Load manifest
    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error(`❌ Manifest not found: ${MANIFEST_PATH}`);
        return false;
    }

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

    // Extract exports from index.ts
    if (!fs.existsSync(INDEX_PATH)) {
        console.error(`❌ Index file not found: ${INDEX_PATH}`);
        return false;
    }

    const indexExports = extractExportsFromIndex(INDEX_PATH);

    // Validate each script
    const errors = [];
    const warnings = [];
    let checkedCount = 0;

    for (const [alias, entry] of Object.entries(manifest.scripts)) {
        const scriptPath = entry.scriptRelPath.replace('.js', '.ts');
        const fullPath = path.join(SCRIPTS_DIR, scriptPath);

        // Extract class name from script file
        const className = extractClassNameFromFile(fullPath);

        if (!className) {
            warnings.push(`⚠️  Could not extract class name from ${scriptPath}`);
            continue;
        }

        // Check if class is exported in index.ts
        if (!indexExports.has(className)) {
            errors.push(`❌ Missing import for ${alias}: ${className} (from ${scriptPath})`);
        } else {
            checkedCount++;
        }
    }

    // Report results
    console.log(`✅ Checked ${checkedCount} script imports`);
    console.log(`📦 Total exports in index.ts: ${indexExports.size}`);
    console.log(`📋 Total scripts in manifest: ${Object.keys(manifest.scripts).length}\n`);

    if (warnings.length > 0) {
        console.log('Warnings:');
        warnings.forEach(w => console.log(w));
        console.log();
    }

    if (errors.length > 0) {
        console.error('❌ Validation FAILED:\n');
        errors.forEach(e => console.error(e));
        console.error(`\n💡 Fix: Add missing imports to ${INDEX_PATH}`);
        return false;
    }

    console.log('✅ All scripts have corresponding imports in index.ts');
    return true;
}

// Run validation
const success = validateScriptImports();
process.exit(success ? 0 : 1);
