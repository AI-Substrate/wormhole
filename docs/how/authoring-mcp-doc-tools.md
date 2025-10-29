# Authoring MCP Documentation Tools

**Version**: Phase 5 (2025-10-27)
**Audience**: Documentation authors (developers or technical writers)
**Style**: Clear, concise, example-driven

> **Maintenance Note**: If the schema changes in `src/lib/mcp/doc-tools/types.ts`, update this guide AND all examples to match.

---

## Overview

### What is the Unified Docs System?

The VSC-Bridge MCP documentation system uses a **unified API pattern** with two tools:

- **`docs_list`**: Browse the documentation catalog with summaries, categories, and tags
- **`docs_get`**: Retrieve full documentation content by ID

This replaces the old per-document tool pattern (e.g., `docs_debugging_guide`, `docs_api_reference`) which created tool count bloat and poor discoverability.

### When to Create New Documentation

Create new MCP documentation when you:
- Add a new VSC-Bridge feature that needs agent guidance
- Document complex workflows or patterns
- Provide troubleshooting guides for common issues
- Create reference documentation for tool usage

### How Agents Discover and Retrieve Documentation

1. **Discovery**: Agent calls `docs_list` (optionally filtering by category or tags)
2. **Browse**: Agent reads summaries to find relevant documentation
3. **Retrieval**: Agent calls `docs_get({id: "doc-id"})` to fetch full content
4. **Use**: Agent reads markdown content and follows guidance

---

## Unified Docs API (Phase 5)

### docs_list: Browse Catalog with Summaries

**Purpose**: Discover available documentation with summaries and metadata.

**Input**:
```json
{
  "category": "debugging",     // Optional: filter by exact category match
  "tags": ["python", "testing"] // Optional: filter by tags (OR logic - any match)
}
```

**Output**:
```json
{
  "docs": [
    {
      "id": "debugging-guide",
      "summary": "5-step debug pattern for AI agents with language syntax (Python/JS/C#) and DAP log workflows",
      "category": "documentation",
      "tags": ["debugging", "workflows", "best-practices"],
      "whenToUse": "Use when you need test documentation"
    }
  ],
  "count": 1
}
```

**Example using MCP Inspector**:
```bash
# List all docs
tools/call docs_list {}

# Filter by category
tools/call docs_list {"category": "debugging"}

# Filter by tags (OR logic)
tools/call docs_list {"tags": ["python", "testing"]}
```

### docs_get: Retrieve Full Content by ID

**Purpose**: Fetch complete documentation content for reading.

**Input**:
```json
{
  "id": "debugging-guide"  // Required: kebab-case ID (NOT tool_name format)
}
```

**Output**:
```json
{
  "id": "debugging-guide",
  "summary": "5-step debug pattern for AI agents...",
  "content": "# Debugging Guide\n\n...",  // Full markdown content
  "metadata": {
    "tool_name": "docs_debugging_guide",
    "description": "...",
    "summary": "...",
    "category": "documentation",
    "tags": ["debugging", "workflows"],
    // ... other frontmatter fields
  }
}
```

**Example using MCP Inspector**:
```bash
tools/call docs_get {"id": "debugging-guide"}
```

### Why This is Better Than Per-Doc Tools

**Old pattern** (deprecated):
- ❌ Each doc = separate MCP tool (`docs_debugging_guide`, `docs_api_reference`, ...)
- ❌ Tool count bloat (hit 50-tool performance threshold)
- ❌ Poor discoverability (agents must guess tool names)

**New pattern** (unified API):
- ✅ Only 2 tools regardless of doc count (`docs_list` + `docs_get`)
- ✅ Scalable (can add unlimited docs without increasing tool count)
- ✅ Better UX (catalog browsing enables discovery workflow)

---

## Front Matter Schema Reference

All documentation files must include YAML front matter with the following fields:

| Field | Type | Required/Optional | Constraints | Description |
|-------|------|-------------------|-------------|-------------|
| **tool_name** | string | **REQUIRED** | Pattern: `^docs_[a-z0-9_]+$` | Internal tool identifier (snake_case with `docs_` prefix) |
| **description** | string | **REQUIRED** | 10-500 characters | Long-form description for tool listings |
| **summary** | string | **REQUIRED** | 10-200 characters | **Short summary for catalog browsing (Phase 5 addition)** |
| **category** | string | Optional | - | Category for filtering (e.g., "debugging", "workflows") |
| **tags** | string[] | Optional | Array of strings | Tags for filtering (OR logic when multiple) |
| **title** | string | Optional | Max 100 characters | UI-friendly display name (shown in MCP clients) |
| **agentHelp** | object | Optional | See enrichment fields below | Structured LLM guidance |
| **examples** | array | Optional | See enrichment fields below | Input/output examples |
| **outputSchema** | object | Optional | See enrichment fields below | JSON Schema for structured output |

### Required Fields

#### tool_name
- **Pattern**: Must match `^docs_[a-z0-9_]+$` (underscores, lowercase, `docs_` prefix)
- **Purpose**: Internal identifier for tool registration
- **Example**: `docs_debugging_guide`
- **Note**: Gets normalized to kebab-case for external API (e.g., `debugging-guide`)

#### description
- **Length**: 10-500 characters
- **Purpose**: Full description shown in tool listings and metadata
- **Example**: `"Comprehensive guide for using VSC-Bridge MCP tools to debug code with step-by-step workflows and language-specific syntax examples."`

#### summary ⚠️ **REQUIRED (Breaking Change in Phase 5)**
- **Length**: 10-200 characters
- **Purpose**: Short summary shown in `docs_list` catalog for quick browsing
- **Example**: `"5-step debug pattern for AI agents with language syntax (Python/JS/C#) and DAP log workflows"`
- **Critical**: All new docs MUST include this field (validation will reject without it)

### Optional Metadata Fields

#### category
- **Purpose**: Enable filtering in `docs_list` (exact match)
- **Example**: `"debugging"`
- **Common values**: `"debugging"`, `"workflows"`, `"reference"`, `"guides"`

#### tags
- **Purpose**: Enable filtering in `docs_list` (OR logic - matches any tag)
- **Format**: Array of strings
- **Example**: `["debugging", "python", "best-practices"]`
- **Usage**: Agent calls `docs_list({"tags": ["python"]})` to find all Python-related docs

### Enrichment Fields (Optional but Recommended)

#### agentHelp
Structured guidance for AI agents with **ALL 6 sub-fields**:

```yaml
agentHelp:
  whenToUse: "Use when you need to debug Python code with VSC-Bridge"
  whatToDoNext:
    - "Clear all breakpoints first"
    - "Set breakpoint at test start line"
    - "Call test_debug_single to launch debugger"
  useCases:
    - "Debugging failing pytest tests"
    - "Inspecting variable state at runtime"
    - "Understanding complex code flow"
  paramsNotes: "Use absolute paths for file parameters; line numbers are 1-indexed"
  limits: "Python only; requires pytest framework installed"
  fallbacks: "If debugging fails, use print() statements or logging as fallback"
```

**Sub-fields**:
- `whenToUse`: When agents should use this documentation
- `whatToDoNext`: Step-by-step workflow (array of strings)
- `useCases`: Scenarios where this doc applies (array of strings)
- `paramsNotes`: Important parameter details or gotchas
- `limits`: Known limitations or constraints
- `fallbacks`: Alternative approaches if primary method fails

#### examples
Array of input/output examples with descriptions:

```yaml
examples:
  - input:
      path: "/workspaces/project/test.py"
      line: 42
    output:
      session_id: "abc123"
      status: "paused"
    description: "Debug Python test at line 42"
  - input:
      expression: "len(my_list)"
    output:
      result: 5
    description: "Evaluate expression in debug context"
```

**Structure**:
- `input`: Any JSON value (object, string, number, array)
- `output`: Any JSON value
- `description`: Required - explains what the example demonstrates

#### outputSchema
JSON Schema describing structured output format:

```yaml
outputSchema:
  type: object
  properties:
    session_id:
      type: string
      description: "Unique debug session identifier"
    status:
      type: string
      enum: ["running", "paused", "stopped"]
    breakpoints:
      type: array
      items:
        type: object
  required: ["session_id", "status"]
```

**Purpose**: Documents expected output structure for agents to parse responses correctly.

---

## File Naming Convention

### Kebab-Case → Snake_Case Transformation

**File name** (source): `debugging-guide.md` (kebab-case, no prefix)
**Tool name** (internal): `docs_debugging_guide` (snake_case with `docs_` prefix)
**External ID** (API): `debugging-guide` (kebab-case, no prefix)

### Transformation Rules

1. **File creation**: Use kebab-case (e.g., `debugging-guide.md`)
2. **Front matter tool_name**: Use snake_case with `docs_` prefix (e.g., `docs_debugging_guide`)
3. **API access**: Use kebab-case without prefix (e.g., `docs_get({"id": "debugging-guide"})`)

### Examples

| File Name | tool_name (frontmatter) | API ID |
|-----------|------------------------|--------|
| `debugging-guide.md` | `docs_debugging_guide` | `debugging-guide` |
| `api-reference.md` | `docs_api_reference` | `api-reference` |
| `python-best-practices.md` | `docs_python_best_practices` | `python-best-practices` |

### Reserved Prefix

The `docs_` prefix is **RESERVED** for documentation tools only. This prevents collisions with functional tools in the VSC-Bridge MCP server.

---

## Step-by-Step: Adding a New Documentation File

Follow these steps to add new documentation to the unified docs system:

### Step 1: Create Markdown File in Source Directory

**⚠️ CRITICAL**: Edit files in `docs/mcp-prompts/` (source), NOT `src/lib/mcp/docs/` (auto-generated).

```bash
cd /workspaces/wormhole/docs/mcp-prompts
touch your-doc-name.md
```

### Step 2: Add YAML Front Matter with Required Fields

Open your file and add front matter at the very beginning:

```yaml
---
tool_name: docs_your_doc_name
description: "Full description of your documentation (10-500 characters)"
summary: "Short summary for catalog (10-200 characters)"
---
```

**Minimum viable front matter** - these 3 fields are REQUIRED.

### Step 3: Add Optional Metadata (Recommended)

Enhance discoverability with category and tags:

```yaml
---
tool_name: docs_your_doc_name
description: "Full description of your documentation"
summary: "Short summary for catalog"
category: "your-category"
tags: ["tag1", "tag2", "tag3"]
---
```

### Step 4: Add Enrichment Fields (Optional but Recommended)

Add structured guidance for AI agents:

```yaml
---
tool_name: docs_your_doc_name
description: "Full description"
summary: "Short summary"
category: "your-category"
tags: ["tag1", "tag2"]
title: "UI-Friendly Display Name"
agentHelp:
  whenToUse: "When agents need this specific guidance"
  whatToDoNext:
    - "Step 1: Do this"
    - "Step 2: Then this"
  useCases:
    - "Use case A"
    - "Use case B"
examples:
  - input: "example input"
    output: "example output"
    description: "What this example shows"
---
```

### Step 5: Write Markdown Content

After the closing `---`, write your documentation in standard markdown:

```markdown
---
tool_name: docs_your_doc_name
description: "..."
summary: "..."
---

# Your Documentation Title

## Section 1

Content here...

## Section 2

More content...
```

**Important**: No front matter delimiters (`---`) should appear in your content.

### Step 6: Run Build Process

```bash
cd /workspaces/wormhole
just build-docs
```

This copies:
1. `docs/mcp-prompts/your-doc-name.md` → `src/lib/mcp/docs/your-doc-name.md`
2. `src/lib/mcp/docs/your-doc-name.md` → `dist/lib/mcp/docs/your-doc-name.md`

### Step 7: Verify Build Success

```bash
# Check intermediate
ls -la src/lib/mcp/docs/your-doc-name.md

# Check final distribution
ls -la dist/lib/mcp/docs/your-doc-name.md
```

Both files should exist after build.

### Step 8: Test Locally - Verify in docs_list

Start the MCP server and verify your doc appears in the catalog:

```bash
# Using MCP Inspector
npx @modelcontextprotocol/inspector

# Call docs_list
tools/call docs_list {}
```

**Expected**: Your doc appears in the `docs` array with correct `id`, `summary`, and metadata.

### Step 9: Test Retrieval via docs_get

Verify full content retrieval:

```bash
# Call docs_get with your doc's ID (kebab-case, no docs_ prefix)
tools/call docs_get {"id": "your-doc-name"}
```

**Expected**: Response includes full markdown content in `content` field.

### Step 10: Commit and Verify CI

```bash
git add docs/mcp-prompts/your-doc-name.md
git commit -m "docs: add your-doc-name documentation"
git push
```

CI should pass with no validation errors.

---

## Build Process

### Overview

The build system uses a **three-stage pipeline**:

```
SOURCE                    INTERMEDIATE                 FINAL
docs/mcp-prompts/*.md  →  src/lib/mcp/docs/*.md  →  dist/lib/mcp/docs/*.md
(EDIT HERE)              (AUTO-GENERATED)          (PACKAGED)
```

### npm Script: copy-mcp-docs

**Not currently used** - build handled by justfile.

### justfile Target: build-docs

**Command**: `just build-docs`

**Location**: `/workspaces/wormhole/justfile` lines 48-54

**What it does**:
```bash
# 1. Create intermediate directory
mkdir -p src/lib/mcp/docs

# 2. Copy source → intermediate
cp docs/mcp-prompts/*.md src/lib/mcp/docs/

# 3. Create dist directory
mkdir -p dist/lib/mcp/docs

# 4. Copy intermediate → dist
cp src/lib/mcp/docs/*.md dist/lib/mcp/docs/
```

### Integrated Build

**Command**: `just build`

**What it does**:
```bash
just build-manifest     # Build script manifest
just build-base-classes # Compile base classes
just build-extension    # Build VS Code extension
just build-cli          # Build CLI (TypeScript compilation)
just build-docs         # Copy MCP documentation (THIS STEP)
```

### Verification Steps

After building:

```bash
# Verify intermediate copy
ls -la src/lib/mcp/docs/*.md

# Verify final distribution
ls -la dist/lib/mcp/docs/*.md

# Count files (should match source)
ls -1 docs/mcp-prompts/*.md | wc -l
ls -1 dist/lib/mcp/docs/*.md | wc -l
```

### ⚠️ Critical Warning

**DO NOT edit files in `src/lib/mcp/docs/` or `dist/lib/mcp/docs/`** - they are auto-generated and will be overwritten on next build.

**ALWAYS edit source files in `docs/mcp-prompts/`**.

---

## Validation Errors and Solutions

### Phase 2 Parser Errors

#### E_MISSING_FRONT_MATTER

**Error**:
```
E_MISSING_FRONT_MATTER: /path/to/file.md
Front matter delimiters (---) not found at start of file.

Expected format:
---
tool_name: docs_example
description: "Example doc"
summary: "Quick summary"
---
```

**Cause**: No front matter delimiters, or delimiters not at file start.

**Solution**:
1. Ensure file starts with `---` (line 1)
2. Add YAML front matter
3. Close with `---` before content
4. No spaces before opening `---`

#### E_INVALID_DOC_YAML

**Error**:
```
E_INVALID_DOC_YAML: /path/to/file.md
Failed to parse YAML front matter: unexpected end of the stream within a flow collection

YAML content:
---
tool_name: docs_example
description: "Missing closing quote
---
```

**Cause**: Malformed YAML syntax (missing quotes, wrong indentation, etc.)

**Solution**:
1. Check all quoted strings have closing quotes
2. Verify YAML indentation (use 2 spaces, no tabs)
3. Test YAML with online validator
4. Watch for special characters needing quotes

### Phase 1 Zod Validation Errors

#### Required Field Missing

**Error**:
```
Invalid front matter in file.md:
  summary: Required
```

**Cause**: Missing `summary` field (REQUIRED in Phase 5).

**Solution**: Add `summary` field to front matter:
```yaml
summary: "Short summary 10-200 characters"
```

#### Field Too Short

**Error**:
```
Invalid front matter in file.md:
  summary: Summary too short (minimum 10 characters)
```

**Cause**: `summary` field has <10 characters.

**Solution**: Expand summary to at least 10 characters:
```yaml
# ❌ Too short
summary: "Quick"

# ✅ Correct
summary: "Quick guide for debugging"
```

#### Field Too Long

**Error**:
```
Invalid front matter in file.md:
  summary: Summary too long (maximum 200 characters)
  description: String must contain at most 500 character(s)
```

**Cause**: Field exceeds maximum length.

**Solution**: Shorten field to meet constraints:
- `summary`: Max 200 characters
- `description`: Max 500 characters
- `title`: Max 100 characters

#### Invalid tool_name Pattern

**Error**:
```
Invalid front matter in file.md:
  tool_name: tool_name must match pattern: docs_[a-z0-9_]+
```

**Cause**: `tool_name` missing `docs_` prefix or using invalid characters.

**Solution**:
```yaml
# ❌ Wrong
tool_name: debugging_guide

# ❌ Wrong
tool_name: docs-debugging-guide

# ✅ Correct
tool_name: docs_debugging_guide
```

#### Wrong Field Type

**Error**:
```
Invalid front matter in file.md:
  tool_name: Expected string, received number
```

**Cause**: Field has wrong type (e.g., number instead of string).

**Solution**: Ensure correct types:
```yaml
# ❌ Wrong
tool_name: 12345
tags: "tag1, tag2"

# ✅ Correct
tool_name: "docs_example"
tags: ["tag1", "tag2"]
```

### Phase 5 Registry Errors

#### DocNotFoundError

**Error**:
```
E_DOC_NOT_FOUND: No documentation found with ID 'nonexistent-doc'

Available documents:
- debugging-guide
- api-reference
- python-guide
```

**Cause**: Called `docs_get` with invalid ID.

**Solution**:
1. Call `docs_list` first to see available IDs
2. Use correct kebab-case ID (not tool_name format)
3. Check spelling

#### InvalidDocIdError

**Error**:
```
E_INVALID_ID: Invalid document ID format: 'invalid ID with spaces!'
Expected format: ^[a-z0-9-]+$ (lowercase, hyphens only)
```

**Cause**: ID contains invalid characters (spaces, uppercase, special chars).

**Solution**: Use only lowercase letters, numbers, and hyphens:
```javascript
// ❌ Wrong
docs_get({"id": "Debugging Guide"})

// ✅ Correct
docs_get({"id": "debugging-guide"})
```

---

## Examples

### Valid Front Matter (Minimal - No Enrichment)

**Use case**: Simple documentation with only required fields.

```yaml
---
tool_name: docs_example_minimal
description: "Example documentation showing minimal required fields for the unified docs system"
summary: "Minimal example with only required fields"
---
```

**Validates**: ✅ All required fields present, all constraints met.

### Valid Front Matter (Typical - With Enrichment)

**Use case**: Production documentation with category, tags, and basic agent guidance.

```yaml
---
tool_name: docs_example_typical
description: "Example documentation showing typical fields including category, tags, and basic agent guidance for production use"
summary: "Typical example with category, tags, and basic agentHelp"
category: "examples"
tags: ["documentation", "examples", "authoring"]
title: "Typical Documentation Example"
agentHelp:
  whenToUse: "Use when you need an example of typical documentation structure"
  whatToDoNext:
    - "Read the front matter to understand fields"
    - "Copy template to your new doc"
    - "Customize for your use case"
  useCases:
    - "Creating new documentation files"
    - "Understanding documentation structure"
---
```

**Validates**: ✅ All fields present with correct types and constraints.

### Valid Front Matter (Maximal - All Fields)

**Use case**: Comprehensive documentation with all enrichment fields.

```yaml
---
tool_name: docs_example_maximal
description: "Example documentation showing all possible fields including full agentHelp with all 6 sub-fields, examples array, and outputSchema for maximum agent guidance"
summary: "Maximal example with all enrichment fields including agentHelp, examples, outputSchema"
category: "examples"
tags: ["documentation", "examples", "authoring", "comprehensive"]
title: "Maximal Documentation Example"
agentHelp:
  whenToUse: "Use when you need a complete reference for all possible documentation fields"
  whatToDoNext:
    - "Review all enrichment fields"
    - "Decide which fields apply to your doc"
    - "Copy relevant sections to your doc"
    - "Remove unused optional fields"
  useCases:
    - "Creating comprehensive documentation"
    - "Understanding all enrichment capabilities"
    - "Providing maximum agent guidance"
  paramsNotes: "All enrichment fields are optional; use only what adds value"
  limits: "Large front matter increases file size; use judiciously"
  fallbacks: "If unsure about enrichment fields, start with minimal template and add later"
examples:
  - input:
      file: "example.md"
      fields: ["tool_name", "description", "summary"]
    output:
      valid: true
      message: "All required fields present"
    description: "Valid minimal front matter passes validation"
  - input:
      file: "invalid.md"
      fields: ["tool_name", "description"]
    output:
      valid: false
      error: "summary: Required"
    description: "Missing summary field fails validation"
outputSchema:
  type: object
  properties:
    valid:
      type: boolean
      description: "Whether validation passed"
    message:
      type: string
      description: "Validation message"
    error:
      type: string
      description: "Error message if validation failed"
  required: ["valid"]
---
```

**Validates**: ✅ All fields including all agentHelp sub-fields, examples, and outputSchema.

### Invalid Example: Missing summary

**Problem**: Missing required `summary` field (Phase 5 breaking change).

```yaml
---
tool_name: docs_example_invalid
description: "Example documentation missing the required summary field"
---
```

**Error**:
```
Invalid front matter in file.md:
  summary: Required
```

**Explanation**: The `summary` field became **REQUIRED** in Phase 5. All docs created before Phase 5 broke when this field was added. All new docs MUST include this field.

**Fix**:
```yaml
---
tool_name: docs_example_invalid
description: "Example documentation missing the required summary field"
summary: "Example with missing summary field fixed"
---
```

### Invalid Example: Wrong Prefix

**Problem**: `tool_name` missing `docs_` prefix.

```yaml
---
tool_name: example_invalid_prefix
description: "Example documentation with tool_name missing the required docs_ prefix"
summary: "Example with wrong tool_name prefix"
---
```

**Error**:
```
Invalid front matter in file.md:
  tool_name: tool_name must match pattern: docs_[a-z0-9_]+
```

**Explanation**: The `docs_` prefix is RESERVED for documentation tools to prevent collisions with functional tools in the MCP server.

**Fix**:
```yaml
---
tool_name: docs_example_invalid_prefix
description: "Example documentation with tool_name missing the required docs_ prefix"
summary: "Example with wrong tool_name prefix"
---
```

### Invalid Example: summary Too Short

**Problem**: `summary` field has <10 characters.

```yaml
---
tool_name: docs_example_short_summary
description: "Example documentation with summary field that is too short to meet the 10 character minimum constraint"
summary: "Short"
---
```

**Error**:
```
Invalid front matter in file.md:
  summary: Summary too short (minimum 10 characters)
```

**Explanation**: The `summary` field must be 10-200 characters to ensure meaningful catalog browsing. Very short summaries don't provide enough context.

**Fix**:
```yaml
---
tool_name: docs_example_short_summary
description: "Example documentation with summary field that is too short to meet the 10 character minimum constraint"
summary: "Example with short summary field fixed with more detail"
---
```

---

## Testing Approach

### Verify New Doc Appears in docs_list

After creating your documentation file and running `just build-docs`, verify it appears in the catalog:

#### Using MCP Inspector

```bash
# 1. Start MCP Inspector
npx @modelcontextprotocol/inspector

# 2. Connect to VSC-Bridge MCP server
# (Follow Inspector prompts)

# 3. Call docs_list to see all docs
tools/call docs_list {}

# 4. Verify your doc in response
# Look for your doc in the "docs" array:
{
  "docs": [
    {
      "id": "your-doc-name",        // ✅ Your doc's kebab-case ID
      "summary": "Your summary",     // ✅ Your summary text
      "category": "your-category",   // ✅ If you added category
      "tags": ["tag1", "tag2"]       // ✅ If you added tags
    }
  ],
  "count": 1
}
```

#### Using Claude Desktop (if configured with VSC-Bridge MCP)

Ask Claude:
```
Can you list all available VSC-Bridge documentation?
```

Claude should call `docs_list` and show your doc in the response.

### Verify Full Content via docs_get

Test document retrieval with full content:

#### Using MCP Inspector

```bash
# Call docs_get with your doc's ID (kebab-case, no docs_ prefix)
tools/call docs_get {"id": "your-doc-name"}

# Verify response includes:
{
  "id": "your-doc-name",                    // ✅ Correct ID
  "summary": "Your summary",                 // ✅ Summary text
  "content": "# Your Doc Title\n\n...",     // ✅ Full markdown content
  "metadata": {
    "tool_name": "docs_your_doc_name",      // ✅ Internal tool name
    "description": "...",                    // ✅ Description
    "summary": "...",                        // ✅ Summary
    // ... other frontmatter fields
  }
}
```

#### Using Claude Desktop

Ask Claude:
```
Can you show me the full documentation for <your-doc-name>?
```

Claude should call `docs_get({"id": "your-doc-name"})` and display the content.

### ID Normalization Rules

**Remember**: External IDs use kebab-case without `docs_` prefix:

| Front Matter tool_name | External API ID | docs_get Usage |
|------------------------|-----------------|----------------|
| `docs_debugging_guide` | `debugging-guide` | `{"id": "debugging-guide"}` |
| `docs_api_reference` | `api-reference` | `{"id": "api-reference"}` |
| `docs_your_doc_name` | `your-doc-name` | `{"id": "your-doc-name"}` |

**Common mistake**: Using tool_name format in `docs_get`:
```javascript
// ❌ Wrong
docs_get({"id": "docs_debugging_guide"})  // Will fail

// ✅ Correct
docs_get({"id": "debugging-guide"})       // Will succeed
```

### Integration Testing (Optional)

For more thorough validation, you can write integration tests following the pattern in `/workspaces/wormhole/test-cli/integration-mcp/`:

```typescript
import { describe, test, expect } from 'vitest';
import { setupMcpTestEnvironment } from '../helpers/mcp-test-env.js';

describe('Your Doc Integration', () => {
  test('given_docs_list_when_called_then_includes_your_doc', async () => {
    const { client, cleanup } = await setupMcpTestEnvironment();

    const response = await client.request({
      method: 'tools/call',
      params: {
        name: 'docs_list',
        arguments: {}
      }
    });

    expect(response.content[0].text).toContain('your-doc-name');
    cleanup();
  });
});
```

---

## Maintenance and Updates

### When Schema Changes

If the Zod schema in `src/lib/mcp/doc-tools/types.ts` changes:

1. **Update this guide**: Revise Front Matter Schema Reference table (section 3)
2. **Update all examples**: Ensure valid/invalid examples match new schema
3. **Update version number**: Change version in header
4. **Test all examples**: Run copy-paste validation (see validation section)
5. **Update existing docs**: Migrate old docs to new schema if breaking changes

### Schema Version Tracking

**Current Version**: Phase 5 (2025-10-27)

**Breaking Changes**:
- Phase 5: `summary` field made REQUIRED (was optional in Phases 1-4)

**Additive Changes**:
- Phase 5: Added `title`, `agentHelp`, `examples`, `outputSchema` enrichment fields

### Deprecation Notices

**Deprecated**: Per-document tool pattern (Phase 4)
- Old tools like `docs_debugging_guide` are deprecated
- Use unified API (`docs_list` + `docs_get`) instead
- Old tools may still exist for backward compatibility but should not be documented

---

## Quick Reference Card

### TL;DR - Adding New Doc in 5 Minutes

```bash
# 1. Create file (edit SOURCE)
cd /workspaces/wormhole/docs/mcp-prompts
cat > my-doc.md <<'EOF'
---
tool_name: docs_my_doc
description: "Full description 10-500 chars"
summary: "Short summary 10-200 chars"
category: "my-category"
tags: ["tag1", "tag2"]
---

# My Documentation Title

Content here...
EOF

# 2. Build
cd /workspaces/wormhole
just build-docs

# 3. Test
npx @modelcontextprotocol/inspector
# Call: docs_list {}
# Call: docs_get {"id": "my-doc"}

# 4. Commit
git add docs/mcp-prompts/my-doc.md
git commit -m "docs: add my-doc documentation"
```

### Common Gotchas

1. ❌ **Don't edit `src/lib/mcp/docs/`** → ✅ Edit `docs/mcp-prompts/`
2. ❌ **Don't forget `summary` field** → ✅ Required in Phase 5
3. ❌ **Don't use `docs_my_doc` in API** → ✅ Use `my-doc` (kebab-case)
4. ❌ **Don't skip `docs_` prefix in tool_name** → ✅ Always use `docs_` prefix
5. ❌ **Don't make summary <10 or >200 chars** → ✅ Keep 10-200 chars

### Need Help?

**Validation errors**: See "Validation Errors and Solutions" section
**Schema reference**: See "Front Matter Schema Reference" section
**Examples**: See "Examples" section with 6 complete templates
**Build process**: See "Build Process" section for troubleshooting

---

**End of Guide**
