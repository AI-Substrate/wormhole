#!/usr/bin/env tsx

/**
 * Prepare script for npx GitHub installation.
 *
 * This script orchestrates the build process when users install via:
 * npx github:AI-Substrate/wormhole
 *
 * Build Steps:
 * 1. Generate manifest.json from extension metadata
 * 2. Compile TypeScript CLI source
 * 3. Copy manifest to dist/
 *
 * Critical: Uses devDependencies (tsx, typescript, shx, js-yaml)
 * which npm DOES install before running prepare for git installs.
 *
 * Per Critical Discovery 02 and 05:
 * - devDependencies available during prepare
 * - Use Node.js for cross-platform compatibility
 * - Provide clear error messages on failure
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Console colors for better visibility
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
};

function log(message: string, color = colors.cyan) {
  console.error(`${color}${message}${colors.reset}`);
}

function error(message: string) {
  console.error(`${colors.red}❌ ${message}${colors.reset}`);
}

function success(message: string) {
  console.error(`${colors.green}✅ ${message}${colors.reset}`);
}

function runCommand(command: string, description: string) {
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
    const manifestScriptPath = path.join(process.cwd(), 'scripts', 'build-manifest.cts');
    if (!fs.existsSync(manifestScriptPath)) {
      error('Manifest build script not found');
      error(`Expected: ${manifestScriptPath}`);
      error('\nThis may indicate incomplete repository clone.');
      process.exit(1);
    }
    success('Build scripts found ✓');

    // Build steps
    runCommand('npm run build:manifest', 'Step 1/2: Generating manifest');

    // Diagnostic: Prove what TypeScript version and config are used in CI
    log('\n🔍 Diagnostic info for CI troubleshooting...');
    execSync('npx tsc --version', { stdio: 'inherit' });
    log('Current working directory: ' + process.cwd());
    log('Checking if source files exist:');
    execSync('ls -la src/lib/ | head -10', { stdio: 'inherit', shell: '/bin/bash' });
    log('Checking one problematic import:');
    execSync('cat src/commands/config.ts | head -15', { stdio: 'inherit', shell: '/bin/bash' });
    log('Running tsc --showConfig (first 30 lines):');
    execSync('npx tsc -p tsconfig.json --showConfig | head -30', { stdio: 'inherit', shell: '/bin/bash' });

    runCommand('npm run build:cli', 'Step 2/2: Compiling TypeScript');

    // Validate output
    const distPath = path.join(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.js');
    const manifestPath = path.join(distPath, 'manifest.json');

    if (!fs.existsSync(indexPath)) {
      error('Build failed: dist/index.js not created');
      process.exit(1);
    }

    if (!fs.existsSync(manifestPath)) {
      error('Build failed: dist/manifest.json not created');
      process.exit(1);
    }

    // Make CLI executable (fixes permission denied error)
    try {
      fs.chmodSync(indexPath, 0o755);
      success('CLI executable permissions set ✓');
    } catch (err) {
      error(`Failed to set executable permissions: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    success('\n🎉 Build complete! vscb CLI is ready to use.\n');

  } catch (err) {
    error('\n💥 Build failed\n');
    error('Troubleshooting:');
    error('  1. Ensure Node.js >= 18.0.0: node --version');
    error('  2. Try manual build: npm install && npm run build:manifest && npm run build:cli');
    error('  3. Check TypeScript version: npx tsc --version');
    error('  4. Report issue: https://github.com/AI-Substrate/wormhole/issues');
    error(`\nError details: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
