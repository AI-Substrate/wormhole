#!/usr/bin/env node

/**
 * Prepare script for npx GitHub installation.
 *
 * This script orchestrates the build process when users install via:
 * npx github:AI-Substrate/wormhole
 *
 * Build Steps:
 * 1. Generate manifest.json from extension metadata (using bundled script)
 * 2. Compile TypeScript CLI source
 * 3. Copy manifest to dist/
 *
 * CRITICAL: This script uses NO external dependencies (pure Node.js builtins).
 * The manifest builder is bundled with esbuild to include js-yaml inline.
 *
 * Why: npm lifecycle scripts for git installs cannot reliably depend on
 * devDependencies being present across npm versions/contexts.
 */

import { execSync } from 'node:child_process';
import { existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

// Console colors for better visibility
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
};

function log(message, color = colors.cyan) {
  console.error(`${color}${message}${colors.reset}`);
}

function error(message) {
  console.error(`${colors.red}❌ ${message}${colors.reset}`);
}

function success(message) {
  console.error(`${colors.green}✅ ${message}${colors.reset}`);
}

function runCommand(command, description) {
  log(`\n${description}...`);
  try {
    execSync(command, {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd()
    });
    success(description + ' complete');
  } catch (err) {
    error(`${description} failed`);
    throw err;
  }
}

async function main() {
  log('\n🚀 Building vscb CLI for npx installation...\n');
  log('⏱️  First run: ~30-60 seconds (subsequent runs use npm cache: <5s)\n');

  try {
    // Validate environment
    log('Checking build environment...');
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (major < 18) {
      error('Node.js >= 18.0.0 required');
      error(`Current version: ${nodeVersion}`);
      error('\nPlease upgrade Node.js: https://nodejs.org/');
      process.exit(1);
    }
    success(`Node.js ${nodeVersion} ✓`);

    // Check for required files
    const manifestScriptPath = join(process.cwd(), 'scripts', 'build-manifest.bundle.cjs');
    if (!existsSync(manifestScriptPath)) {
      error('Manifest build script not found');
      error(`Expected: ${manifestScriptPath}`);
      error('\nThis may indicate incomplete repository clone.');
      process.exit(1);
    }
    success('Build scripts found ✓');

    // Build steps - use bundled manifest builder (no dependencies!)
    runCommand('node scripts/build-manifest.bundle.cjs', 'Step 1/2: Generating manifest');

    runCommand('npm run build:cli', 'Step 2/2: Compiling TypeScript');

    // Validate output
    const distPath = join(process.cwd(), 'dist');
    const indexPath = join(distPath, 'index.js');
    const manifestPath = join(distPath, 'manifest.json');

    if (!existsSync(indexPath)) {
      error('Build failed: dist/index.js not created');
      process.exit(1);
    }

    if (!existsSync(manifestPath)) {
      error('Build failed: dist/manifest.json not created');
      process.exit(1);
    }

    // Make CLI executable (fixes permission denied error)
    try {
      chmodSync(indexPath, 0o755);
      success('CLI executable permissions set ✓');
    } catch (err) {
      error(`Failed to set executable permissions: ${err.message}`);
      process.exit(1);
    }

    success('\n🎉 Build complete! vscb CLI is ready to use.\n');

  } catch (err) {
    error('\n💥 Build failed\n');
    error('Troubleshooting:');
    error('  1. Ensure Node.js >= 18.0.0: node --version');
    error('  2. Try manual build: npm install && node scripts/build-manifest.bundle.cjs && npm run build:cli');
    error('  3. Check TypeScript version: npx tsc --version');
    error('  4. Report issue: https://github.com/AI-Substrate/wormhole/issues');
    error(`\nError details: ${err.message}`);
    process.exit(1);
  }
}

main();
