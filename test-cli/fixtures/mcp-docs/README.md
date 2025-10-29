# MCP Documentation Test Fixtures

## Required Fields
- `tool_name`: string, pattern `^docs_[a-z0-9_]+$`, 1-50 chars
- `description`: string, 10-500 chars

## Optional Fields
- `category`: string (e.g., "documentation", "testing")
- `tags`: string[] (e.g., ["debugging", "workflows"])
- `timeout`: number (milliseconds, default 30000)

## Naming Convention

**KISS**: Filename must exactly match `tool_name` field (plus `.md` extension).
Example: `docs_test_valid.md` → `tool_name: docs_test_valid`

## Fixtures

### Valid Documentation (`docs_test_valid.md`)
**Purpose**: Happy path - all required fields, correct types, docs_ prefix
**Expected**: Parser accepts, generates tool

### Invalid YAML Syntax (`docs_test_invalid_yaml.md`)
**Purpose**: Malformed YAML (missing closing quote)
**Expected**: Parser rejects with YAML syntax error

### Wrong Field Types (`docs_test_wrong_types.md`)
**Purpose**: Type validation - tool_name as number instead of string
**Expected**: Parser rejects with type error

### Missing Required Fields (`docs_test_missing_fields.md`)
**Purpose**: Missing required 'description' field
**Expected**: Parser rejects with missing field error

### Duplicate Tool Names (`docs_test_duplicate_a.md`, `docs_test_duplicate_b.md`)
**Purpose**: Two files with same tool_name 'docs_test_duplicate'
**Expected**: Parser rejects duplicate tool names across files

### Missing docs_ Prefix (`test_missing_prefix.md`)
**Purpose**: tool_name missing required 'docs_' prefix
**Expected**: Parser rejects tool names not matching pattern ^docs_[a-z0-9_]+$
**Note**: Filename also missing prefix (KISS - matches tool_name exactly)

### YAML Injection Attack (`docs_test_injection.md`)
**Purpose**: YAML injection with !!python/object malicious payload
**Expected**: Parser safely handles or rejects malicious YAML constructs
**Security**: Addresses Critical Discovery 03 (use safe YAML loading)
