#!/usr/bin/env node

/**
 * Metadata Validation Script
 *
 * Validates that all VSC-Bridge tool metadata files have complete P0+P1 MCP metadata
 * following the research-based patterns from Phase 6.
 *
 * Usage: node validate-metadata.js
 *
 * Checks:
 * - All required P0 fields present (enabled, description, timeout, relationships, error_contract, safety)
 * - All required P1 fields present (when_to_use, parameter_hints)
 * - Token budget within 250-450 range (warns, doesn't fail)
 * - Exact label text in when_to_use
 * - Parameter hints have 2-3 examples
 * - Error codes match top-level errors field
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Validation state
let errors = [];
let warnings = [];
let fileCount = 0;
let toolCount = 0;

// Token estimation (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Validate exact label text in when_to_use
function validateWhenToUseLabels(whenToUse, filePath) {
  const requiredLabels = ['USE FOR:', 'DON\'T USE FOR:', 'PREREQUISITES:', 'SAFETY:'];
  const missingLabels = [];

  for (const label of requiredLabels) {
    if (!whenToUse.includes(label)) {
      missingLabels.push(label);
    }
  }

  if (missingLabels.length > 0) {
    errors.push(`${filePath}: Missing exact label text in when_to_use: ${missingLabels.join(', ')}`);
    return false;
  }

  return true;
}

// Validate parameter hints
function validateParameterHints(paramHints, params, filePath) {
  if (!params || Object.keys(params).length === 0) {
    // No parameters - no hints required
    return true;
  }

  if (!paramHints) {
    errors.push(`${filePath}: Missing parameter_hints for tool with parameters`);
    return false;
  }

  let valid = true;

  for (const paramName of Object.keys(params)) {
    const hint = paramHints[paramName];

    if (!hint) {
      errors.push(`${filePath}: Missing parameter_hint for parameter '${paramName}'`);
      valid = false;
      continue;
    }

    // Check examples count (should be 2-3)
    if (!hint.examples || !Array.isArray(hint.examples)) {
      errors.push(`${filePath}: Parameter '${paramName}' missing examples array`);
      valid = false;
    } else if (hint.examples.length < 2 || hint.examples.length > 3) {
      warnings.push(`${filePath}: Parameter '${paramName}' has ${hint.examples.length} examples (recommended: 2-3)`);
    }
  }

  return valid;
}

// Validate error contract codes match top-level errors
function validateErrorContract(errorContract, topLevelErrors, filePath) {
  if (!errorContract || !errorContract.errors || errorContract.errors.length === 0) {
    // Empty error contract is OK if tool has no common errors
    return true;
  }

  if (!topLevelErrors || topLevelErrors.length === 0) {
    warnings.push(`${filePath}: Has error_contract but no top-level errors field`);
    return true;
  }

  let valid = true;

  for (const error of errorContract.errors) {
    if (!topLevelErrors.includes(error.code)) {
      errors.push(`${filePath}: Error code '${error.code}' in error_contract not found in top-level errors field`);
      valid = false;
    }

    // Validate error structure
    if (!error.summary) {
      errors.push(`${filePath}: Error '${error.code}' missing summary`);
      valid = false;
    }
    if (typeof error.is_retryable !== 'boolean') {
      errors.push(`${filePath}: Error '${error.code}' missing or invalid is_retryable (must be boolean)`);
      valid = false;
    }
    if (!error.user_fix_hint) {
      errors.push(`${filePath}: Error '${error.code}' missing user_fix_hint`);
      valid = false;
    }
  }

  return valid;
}

// Validate relationships structure
function validateRelationships(relationships, filePath) {
  const requiredFields = ['requires', 'recommended', 'provides', 'conflicts'];
  let valid = true;

  for (const field of requiredFields) {
    if (!Array.isArray(relationships[field])) {
      errors.push(`${filePath}: relationships.${field} must be an array (use [] if empty)`);
      valid = false;
    }
  }

  return valid;
}

// Validate safety flags
function validateSafety(safety, filePath) {
  const requiredFlags = ['idempotent', 'read_only', 'destructive'];
  let valid = true;

  for (const flag of requiredFlags) {
    if (typeof safety[flag] !== 'boolean') {
      errors.push(`${filePath}: safety.${flag} must be boolean`);
      valid = false;
    }
  }

  return valid;
}

// Calculate token budget for metadata
function calculateTokenBudget(mcp) {
  let tokens = 0;

  // P0 fields
  tokens += estimateTokens(mcp.description || '');
  tokens += estimateTokens(JSON.stringify(mcp.relationships || {}));
  tokens += estimateTokens(JSON.stringify(mcp.error_contract || {}));
  tokens += estimateTokens(JSON.stringify(mcp.safety || {}));

  // P1 fields
  if (mcp.llm) {
    tokens += estimateTokens(mcp.llm.when_to_use || '');
    tokens += estimateTokens(JSON.stringify(mcp.llm.parameter_hints || {}));
  }

  return tokens;
}

// Validate a single metadata file
function validateFile(filePath) {
  fileCount++;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const meta = yaml.load(content);

    if (!meta.mcp) {
      errors.push(`${filePath}: Missing 'mcp' section`);
      return false;
    }

    const mcp = meta.mcp;
    toolCount++;

    let valid = true;

    // P0: Must-Have Fields
    if (typeof mcp.enabled === 'undefined') {
      // Default to true, but warn
      warnings.push(`${filePath}: mcp.enabled not set (defaults to true)`);
    }

    if (!mcp.description) {
      errors.push(`${filePath}: Missing mcp.description`);
      valid = false;
    }

    if (typeof mcp.timeout !== 'number') {
      warnings.push(`${filePath}: No mcp.timeout set (will use default 30000ms)`);
    }

    // P0: Relationships
    if (!mcp.relationships) {
      errors.push(`${filePath}: Missing mcp.relationships`);
      valid = false;
    } else {
      valid = validateRelationships(mcp.relationships, filePath) && valid;
    }

    // P0: Error Contract
    if (!mcp.error_contract) {
      warnings.push(`${filePath}: Missing mcp.error_contract (OK if tool has no common errors)`);
    } else {
      valid = validateErrorContract(mcp.error_contract, meta.errors, filePath) && valid;
    }

    // P0: Safety
    if (!mcp.safety) {
      errors.push(`${filePath}: Missing mcp.safety`);
      valid = false;
    } else {
      valid = validateSafety(mcp.safety, filePath) && valid;
    }

    // P1: LLM Guidance
    if (!mcp.llm) {
      errors.push(`${filePath}: Missing mcp.llm section`);
      valid = false;
    } else {
      // when_to_use
      if (!mcp.llm.when_to_use) {
        errors.push(`${filePath}: Missing mcp.llm.when_to_use`);
        valid = false;
      } else {
        valid = validateWhenToUseLabels(mcp.llm.when_to_use, filePath) && valid;
      }

      // parameter_hints
      valid = validateParameterHints(mcp.llm.parameter_hints, meta.params, filePath) && valid;
    }

    // Token budget check (warning only, not error)
    const tokens = calculateTokenBudget(mcp);
    if (tokens < 250) {
      warnings.push(`${filePath}: Token budget ${tokens} below guideline (250-450) - may lack sufficient guidance`);
    } else if (tokens > 450) {
      warnings.push(`${filePath}: Token budget ${tokens} exceeds guideline (250-450) - consider condensing`);
    }

    return valid;

  } catch (error) {
    errors.push(`${filePath}: Failed to parse YAML: ${error.message}`);
    return false;
  }
}

// Find all meta.yaml files
function findMetaFiles(dir) {
  const files = [];

  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.meta.yaml')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

// Main validation
function main() {
  console.log(`${colors.cyan}=== MCP Metadata Validation ===${colors.reset}\n`);

  const scriptsDir = path.resolve(__dirname, '../../../../../extension/src/vsc-scripts');

  if (!fs.existsSync(scriptsDir)) {
    console.error(`${colors.red}Error: Scripts directory not found: ${scriptsDir}${colors.reset}`);
    process.exit(1);
  }

  console.log(`Scanning: ${scriptsDir}\n`);

  const metaFiles = findMetaFiles(scriptsDir);

  console.log(`Found ${metaFiles.length} metadata files\n`);

  // Validate each file
  for (const file of metaFiles) {
    const relativePath = path.relative(scriptsDir, file);
    validateFile(file);
  }

  // Print results
  console.log(`${colors.cyan}=== Validation Results ===${colors.reset}\n`);

  console.log(`Files scanned: ${fileCount}`);
  console.log(`Tools validated: ${toolCount}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}\n`);

  if (errors.length > 0) {
    console.log(`${colors.red}=== ERRORS ===${colors.reset}\n`);
    errors.forEach(err => console.log(`${colors.red}✗${colors.reset} ${err}`));
    console.log();
  }

  if (warnings.length > 0) {
    console.log(`${colors.yellow}=== WARNINGS ===${colors.reset}\n`);
    warnings.forEach(warn => console.log(`${colors.yellow}⚠${colors.reset} ${warn}`));
    console.log();
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`${colors.green}✓ All metadata files validated successfully!${colors.reset}\n`);
    console.log(`All ${toolCount} tools have complete P0+P1 metadata following research-based patterns.\n`);
  }

  // Exit with appropriate code
  process.exit(errors.length > 0 ? 1 : 0);
}

// Run validation
main();
