#!/usr/bin/env node
/**
 * Test to ensure no HTTP dependencies are present in package.json files
 * This prevents accidental reintroduction of network dependencies
 */

const fs = require('fs');
const path = require('path');

const BANNED_DEPENDENCIES = [
  'express',
  'axios',
  'undici',
  'cors',
  'helmet',
  'body-parser',
  'cookie-parser',
  'compression',
  'morgan',
  'http-proxy',
  'node-fetch',
  'got',
  'superagent',
  'request'
];

const BANNED_DEV_DEPENDENCIES = [
  '@types/express',
  '@types/cors',
  '@types/body-parser',
  '@types/cookie-parser',
  '@types/compression',
  '@types/morgan'
];

const PACKAGE_FILES = [
  'package.json',
  'extension/package.json',
  'cli/package.json',
  'mcp-server/package.json'
];

let hasErrors = false;

console.log('Checking for banned HTTP dependencies...\n');

for (const packageFile of PACKAGE_FILES) {
  const fullPath = path.join(__dirname, '..', packageFile);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Skipping ${packageFile} (not found)`);
    continue;
  }

  console.log(`Checking ${packageFile}...`);

  const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const dependencies = packageJson.dependencies || {};
  const devDependencies = packageJson.devDependencies || {};

  // Check regular dependencies
  for (const dep of BANNED_DEPENDENCIES) {
    if (dependencies[dep]) {
      console.error(`  ❌ Found banned dependency: ${dep}`);
      hasErrors = true;
    }
  }

  // Check dev dependencies
  for (const dep of BANNED_DEV_DEPENDENCIES) {
    if (devDependencies[dep]) {
      console.error(`  ❌ Found banned dev dependency: ${dep}`);
      hasErrors = true;
    }
  }

  // Also check for any dependency containing 'http' in the name
  // (except for @modelcontextprotocol which is allowed)
  const allDeps = { ...dependencies, ...devDependencies };
  for (const [name, version] of Object.entries(allDeps)) {
    if (name.includes('http') && !name.includes('@modelcontextprotocol')) {
      console.warn(`  ⚠️  Warning: Found dependency with 'http' in name: ${name}`);
    }
  }

  if (!hasErrors) {
    console.log(`  ✅ No banned dependencies found`);
  }
}

console.log();

if (hasErrors) {
  console.error('❌ Test failed: HTTP dependencies found!');
  console.error('\nThese dependencies should be removed to maintain filesystem-only communication.');
  console.error('The VSC-Bridge project uses filesystem IPC, not HTTP.');
  process.exit(1);
} else {
  console.log('✅ All checks passed: No HTTP dependencies found');
  process.exit(0);
}