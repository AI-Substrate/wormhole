// scripts/semrel-prepare.mjs
// Usage: node scripts/semrel-prepare.mjs <version>
// Example: node scripts/semrel-prepare.mjs 1.2.3

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

const version = process.argv[2];
if (!version) {
  console.error('ERROR: Version argument required');
  console.error('Usage: node scripts/semrel-prepare.mjs <version>');
  process.exit(1);
}

console.log(`🚀 Preparing release for version ${version}`);

// PRE-VALIDATION: Run build BEFORE making any changes
console.log('🔍 Pre-validating build...');
run('just', ['build']);
console.log('✓ Pre-validation passed');

// Step 1: Bump version in all package.json files
const packageFiles = [
  'package.json',
  'packages/extension/package.json'
];

for (const file of packageFiles) {
  const path = resolve(process.cwd(), file);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`✓ Updated ${file} → ${version}`);
}

// Step 2: Synchronize package-lock.json
console.log('🔄 Synchronizing package-lock.json...');
run('npm', ['install']);
console.log('✓ package-lock.json synchronized');

// Step 3: Build everything with new version
console.log('🔨 Building project with new version...');
run('just', ['build']);

// Step 4: Ensure artifacts directory exists
mkdirSync('artifacts', { recursive: true });

// Step 5: Package extension to artifacts/
console.log('📦 Packaging VSIX...');
run('just', ['package-extension']);

// Step 6: Create offline installation bundle
console.log('📦 Creating offline installation bundle...');
run('just', ['package-offline-bundle']);

console.log('✅ Release preparation complete');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`ERROR: Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
}
