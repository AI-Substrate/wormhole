#!/usr/bin/env node

/**
 * Validates that webpack aliases and TypeScript path mappings are synchronized.
 * Exits with code 1 if any mismatches are found.
 */

const fs = require('fs');
const path = require('path');

// Load webpack config
const webpackConfig = require('../packages/extension/webpack.config.js');
const webpackAliases = webpackConfig[1].resolve.alias; // scriptsConfig is index 1

// Load tsconfig.json
const tsconfigPath = path.join(__dirname, '../packages/extension/tsconfig.json');
const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf8');
// Remove comments before parsing
const tsconfigClean = tsconfigContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
const tsconfig = JSON.parse(tsconfigClean);
const tsPaths = tsconfig.compilerOptions.paths || {};

// Check for mismatches
let hasError = false;

// Check each webpack alias exists in TypeScript
for (const [alias, webpackPath] of Object.entries(webpackAliases)) {
  const tsPath = tsPaths[alias];
  if (!tsPath) {
    console.error(`❌ Webpack alias '${alias}' is missing from tsconfig.json paths`);
    hasError = true;
  }
}

// Check each TypeScript path exists in webpack
for (const [tsAlias] of Object.entries(tsPaths)) {
  if (!webpackAliases[tsAlias]) {
    console.error(`❌ TypeScript path '${tsAlias}' is missing from webpack.config.js aliases`);
    hasError = true;
  }
}

if (hasError) {
  console.error('\n⚠️  Path validation failed: webpack and TypeScript paths must match');
  console.error('Fix by adding missing aliases to the appropriate config file.');
  process.exit(1);
} else {
  console.log('✅ Path validation passed: webpack and TypeScript paths are synchronized');
}