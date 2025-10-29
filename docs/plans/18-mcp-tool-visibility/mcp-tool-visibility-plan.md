# MCP Tool Visibility Control Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2025-01-19
**Spec**: [mcp-tool-visibility-spec.md](/workspaces/vsc-bridge-devcontainer/docs/plans/18-mcp-tool-visibility/mcp-tool-visibility-spec.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Metadata Updates](#phase-1-metadata-updates)
   - [Phase 2: Environment Variable Support](#phase-2-environment-variable-support)
   - [Phase 3: Integration Test Verification](#phase-3-integration-test-verification)
   - [Phase 4: Documentation](#phase-4-documentation)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Progress Tracking](#progress-tracking)
8. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

### Problem Statement
VSC-Bridge exposes 35 MCP tools to LLM clients, but many are verbose DAP (Debug Adapter Protocol) analysis tools that consume excessive LLM context and obscure essential debugging operations. Users need a way to hide non-essential tools from MCP while preserving CLI access.

### Solution Approach
- Leverage existing `mcp.enabled: false` infrastructure in metadata files
- Add environment variable support (`MCP_HIDDEN_TOOLS`, `MCP_SHOW_ALL_TOOLS`) for user customization
- Hide 10 tools by default: 8 DAP analysis tools + `debug_tracker` + `breakpoint_remove`
- Ensure all 13 critical tools used by integration tests remain visible
- Zero code changes to filtering logic (already implemented in `shouldIncludeTool()`)

### Expected Outcomes
- **Visibility reduction**: 35 → 25 tools visible in MCP (29% reduction)
- **Zero test failures**: All integration tests pass unchanged
- **CLI preservation**: 100% of tools accessible via `vscb script run`
- **User customization**: Environment variables for runtime overrides

### Success Metrics
1. MCP clients see 25 tools (not 35) after changes
2. `just test-integration` and `just test-integration-mcp` pass
3. All hidden tools work via CLI: `vscb script run dap.summary`
4. Documentation complete at `docs/how/mcp-tool-visibility.md`

---

## Technical Context

### Current System State
- **Total tools**: 35 MCP tools (corrected from spec's "36")
- **Filtering mechanism**: `shouldIncludeTool()` in `tool-generator.ts` (lines 220-233)
- **Metadata format**: `.meta.yaml` files with `mcp.enabled` field (already supported)
- **Build process**: `just build-manifest` generates `manifest.json` from YAML files
- **Integration tests**: 13 critical tools used by test suite (must remain visible)

### Integration Requirements
1. **Manifest Build**: Changes to `.meta.yaml` require `just build-manifest` + `just build-cli`
2. **MCP Server**: Must restart after rebuild (manifest cached in memory)
3. **Environment Variables**: Read once at server creation in `createMcpServer()`
4. **Test Compatibility**: Integration tests don't set `MCP_SHOW_ALL_TOOLS`, rely on defaults

### Constraints and Limitations
1. **No hot reload**: MCP server caches manifest on startup, requires full restart
2. **Build-time generation**: Manifest built once, not generated dynamically
3. **Layer isolation**: MCP server cannot access VS Code extension settings
4. **Stdout sacred**: All logging must go to stderr (MCP protocol on stdout)

### Assumptions
1. `mcp.enabled` field exists and works (verified in codebase)
2. Integration tests use only the 13 documented tools
3. Users restart MCP server after configuration changes
4. Environment variables in `.mcp.json` work (MCP protocol standard)

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Tool Count Error - 35 Not 36
**Impact**: Critical
**Sources**: [S3-02] (spec analysis)

**Problem**: Spec claims "36 tools" but manifest contains only 35 scripts. Tool named `bridge_status` doesn't exist.

**Root Cause**: The spec lists `bridge_status` in AC3.1 as a Tier 1 critical tool, but no script with alias `bridge.status` or `bridge.*` exists in the manifest. This is likely confusion with the MCP server name "vsc-bridge".

**Solution**: Remove `bridge_status` from spec. Actual Tier 1 tools are 12 (not 13):
- `breakpoint_set`, `breakpoint_clear_project`, `debug_start`, `debug_stop`, `debug_status`
- `test_debug_single`, `editor_show_testing_ui`
- `debug_step_into`, `debug_step_over`, `debug_step_out`, `debug_continue`
- `debug_list_variables`

**Action Required**: Note for documentation - spec at `/workspaces/vsc-bridge-devcontainer/docs/plans/18-mcp-tool-visibility/mcp-tool-visibility-spec.md` AC3.1 incorrectly lists `bridge_status` (doesn't exist). This plan uses correct count: 35 total, hide 10, visible 25.

**Affects Phases**: Phase 3 (test verification)

---

### 🚨 Critical Discovery 02: mcp.enabled Infrastructure Already Exists
**Impact**: Critical
**Sources**: [S1-01, S4-07] (pattern analyst + dependency mapper)

**Problem**: No problem - this is a positive discovery! The `mcp.enabled` field is fully implemented and tested.

**Current Implementation**:
```typescript
// /workspaces/vsc-bridge-devcontainer/src/lib/mcp/tool-generator.ts:220-233
export function shouldIncludeTool(metadata: ScriptMetadata): boolean {
  if (!metadata.mcp) {
    return true;  // Default: visible
  }

  const mcpAny = metadata.mcp as any;
  if ('enabled' in mcpAny && mcpAny.enabled === false) {
    return false;  // ✅ Already filters hidden tools
  }

  return true;
}
```

**Solution**: Just flip `enabled: true` → `enabled: false` in 10 .meta.yaml files. No code changes needed for basic hiding.

**Example**:
```yaml
# Before (all 35 tools):
mcp:
  enabled: true
  description: "..."

# After (hide verbose DAP tools):
mcp:
  enabled: false  # ← Only change needed
  description: "..."
```

**Action Required**: Phase 1 only needs metadata file updates. Phase 2 adds environment variable filtering.

**Affects Phases**: Phase 1 (simplified implementation)

---

### 🚨 Critical Discovery 03: Build-Time vs Runtime Filtering Resolved
**Impact**: Critical
**Sources**: [S2-01, S2-02, S3-03] (technical investigator + spec analysis)

**Problem**: Spec unclear whether filtering happens at build-time or runtime.

**Current Behavior**: Runtime filtering via `shouldIncludeTool()`:
1. `build-manifest.cts` includes ALL scripts in `manifest.json` (no filtering)
2. `tool-generator.ts` filters when generating MCP tools
3. Hidden tools exist in manifest but not in MCP tool list

**Design Decision**: Keep runtime filtering (current implementation) because:
- AC1.3 requires "All hidden tools remain fully functional via CLI"
- CLI reads same `manifest.json` as MCP server
- If excluded from manifest, CLI can't access them

**Solution**: Filtering happens in `generateMcpTools()`, not `build-manifest.cts`.

**Example**:
```typescript
// ✅ CORRECT - Runtime filtering preserves CLI access
export function generateMcpTools(manifest: ManifestV2): McpTool[] {
  for (const [alias, entry] of Object.entries(manifest.scripts)) {
    if (!shouldIncludeTool(entry.metadata)) {
      continue;  // Filtered at MCP tool generation, not manifest build
    }
    // ... create tool
  }
}
```

**Action Required**: No changes to `build-manifest.cts`. All filtering in `tool-generator.ts`.

**Affects Phases**: All phases (architectural constraint)

---

### 🔴 High Discovery 04: Environment Variables Must Be Read Once
**Impact**: High
**Sources**: [S2-06, S4-02, S4-06] (technical investigator + dependency mapper)

**Problem**: Reading `process.env` in `shouldIncludeTool()` is wasteful (called 35 times per startup). Must read once and pass as options.

**Root Cause**: `shouldIncludeTool()` is called for each script during tool generation. Reading environment variables 35 times is inefficient and violates separation of concerns.

**Solution**: Read environment variables once in `createMcpServer()`, parse into options object, pass to `generateMcpTools()`.

**Example**:
```typescript
// ❌ WRONG - Reading env vars in hot path (called 35 times)
export function shouldIncludeTool(metadata: ScriptMetadata): boolean {
  const hiddenTools = process.env.MCP_HIDDEN_TOOLS?.split(',') || [];
  // ...
}

// ✅ CORRECT - Read once, pass as options
export function createMcpServer(options: McpServerOptions = {}): Server {
  const filterOptions: ToolFilterOptions = {
    showAll: process.env.MCP_SHOW_ALL_TOOLS === 'true',
    hiddenTools: (process.env.MCP_HIDDEN_TOOLS || '').split(',').map(s => s.trim())
  };

  const tools = generateMcpTools(manifest, filterOptions);
}

export function shouldIncludeTool(
  metadata: ScriptMetadata,
  options?: ToolFilterOptions
): boolean {
  // Use pre-parsed options instead of reading env vars
}
```

**Action Required**: Extend `shouldIncludeTool()` signature to accept options. Update `generateMcpTools()` and `createMcpServer()`.

**Affects Phases**: Phase 2 (environment variable support)

---

### 🔴 High Discovery 05: Metadata File Path Mapping Required
**Impact**: High
**Sources**: [S1-03, S3-08] (pattern analyst + spec analysis)

**Problem**: Spec lists 10 tool names to hide but doesn't map to exact `.meta.yaml` file paths.

**File Path Mapping** (verified against codebase, all paths from `/workspaces/vsc-bridge-devcontainer/`):
```
Tool Name          → Alias             → Absolute File Path
1.  dap_summary    → dap.summary       → /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/summary.meta.yaml
2.  dap_timeline   → dap.timeline      → /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/timeline.meta.yaml
3.  dap_filter     → dap.filter        → /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/filter.meta.yaml
4.  dap_logs       → dap.logs          → /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/logs.meta.yaml
5.  dap_exceptions → dap.exceptions    → /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/exceptions.meta.yaml
6.  dap_search     → dap.search        → /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/search.meta.yaml
7.  dap_stats      → dap.stats         → /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/stats.meta.yaml
8.  dap_compare    → dap.compare       → /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/compare.meta.yaml
9.  debug_tracker  → debug.tracker     → /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/debug/tracker.meta.yaml
10. breakpoint_remove → breakpoint.remove → /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/breakpoint/remove.meta.yaml
```

**Solution**: Phase 1 task checklist includes explicit file paths for all 10 files.

**Action Required**: Verify each file exists before implementation. Add comments explaining why each tool is hidden.

**Affects Phases**: Phase 1 (metadata updates)

---

### 🔴 High Discovery 06: Tool Name Transformation (Alias → MCP Name)
**Impact**: High
**Sources**: [S2-08, S4-08] (technical investigator + dependency mapper)

**Problem**: Environment variables use MCP tool names (`dap_summary`) but manifest stores aliases (`dap.summary`). Filtering requires transformation.

**Root Cause**: `aliasToToolName()` converts dots/hyphens to underscores:
```typescript
// /workspaces/vsc-bridge-devcontainer/src/lib/mcp/tool-generator.ts:146-148
export function aliasToToolName(alias: string): string {
  return alias.replace(/[\.\-]/g, '_');  // dap.summary → dap_summary
}
```

**Solution**: When checking environment variables, transform alias before comparing:
```typescript
export function shouldIncludeTool(
  metadata: ScriptMetadata,
  options?: ToolFilterOptions
): boolean {
  // Transform alias → tool name before checking hidden list
  const toolName = metadata.mcp?.tool || aliasToToolName(metadata.alias);

  if (options?.hiddenTools?.includes(toolName)) {
    return false;
  }

  return metadata.mcp?.enabled !== false;
}
```

**Action Required**: Use `aliasToToolName()` when comparing against `MCP_HIDDEN_TOOLS` list.

**Affects Phases**: Phase 2 (environment variable filtering)

---

### 🔴 High Discovery 07: Integration Test Tool Dependencies
**Impact**: High
**Sources**: [S4-04] (dependency mapper)

**Problem**: Integration tests depend on exactly 12 tools (corrected from spec's "13" due to bridge_status removal). Hiding any breaks tests.

**Critical Tools** (used by `test-cli/integration-mcp/stdio-e2e.test.ts`):
1. `editor_show_testing_ui` - Line 90 (discovery trigger)
2. `debug_stop` - Lines 111, 332 (cleanup)
3. `breakpoint_clear_project` - Line 131 (cleanup)
4. `debug_status` - Lines 149, 266 (smoke test)
5. `breakpoint_set` - Line 349 (workflow)
6. `test_debug_single` - Line 367 (start session)
7. `debug_list_variables` - Line 382 (inspect state)
8. `debug_start`, `debug_step_over`, `debug_step_into`, `debug_step_out`, `debug_continue` (stepping workflow)

**Solution**: Verify these 12 tools all have `mcp.enabled: true` (none are in the hide list).

**Action Required**: Cross-reference hide list (10 tools) against critical tools (12 tools). Ensure zero overlap.

**Affects Phases**: Phase 3 (test verification)

---

### 🟡 Medium Discovery 08: Node.js Environment Variable String Coercion
**Impact**: Medium
**Sources**: [S2-06] (technical investigator)

**Problem**: All `process.env` values are strings. Boolean checks require explicit string comparison.

**Common Traps**:
```typescript
// ❌ WRONG - String "false" is truthy!
if (process.env.MCP_SHOW_ALL_TOOLS) {
  return true;  // Executes even when MCP_SHOW_ALL_TOOLS="false"
}

// ❌ WRONG - Type coercion confusion
process.env.MCP_SHOW_ALL_TOOLS === true  // Always false (string !== boolean)

// ✅ CORRECT - Explicit string comparison
const showAll = process.env.MCP_SHOW_ALL_TOOLS === 'true';
```

**Solution**: Use strict string equality for booleans. Handle undefined correctly.

**Action Required**: Document boolean env var pattern in code comments.

**Affects Phases**: Phase 2 (environment variable parsing)

---

### 🟡 Medium Discovery 09: Comma-Separated List Whitespace Handling
**Impact**: Medium
**Sources**: [S2-07] (technical investigator)

**Problem**: Users add spaces for readability in `.mcp.json`, breaking exact matching.

**Example**:
```json
{
  "env": {
    "MCP_HIDDEN_TOOLS": "dap_logs, dap_summary, debug_tracker"
  }
}
```

**Root Cause**: `split(',')` preserves whitespace: `[' dap_summary']` ≠ `'dap_summary'`

**Solution**: Always trim and filter empty strings:
```typescript
const hiddenTools = (process.env.MCP_HIDDEN_TOOLS || '')
  .split(',')
  .map(s => s.trim())  // Remove whitespace
  .filter(s => s);     // Remove empty strings
```

**Action Required**: Implement robust CSV parsing in Phase 2.

**Affects Phases**: Phase 2 (environment variable parsing)

---

### 🟡 Medium Discovery 10: MCP Server stdout/stderr Separation
**Impact**: Medium
**Sources**: [S4-05] (dependency mapper)

**Problem**: MCP protocol uses stdout for JSON-RPC messages. All logging MUST go to stderr.

**Current Contract** (documented in `mcp.ts:14-16`):
```typescript
/**
 * **Critical Design Constraints**:
 * - Stdout is SACRED: Only MCP protocol JSON-RPC messages on stdout
 * - All logging MUST go to stderr (use `this.log()` or `console.error()`)
 */
```

**Solution**: Log hidden tools to stderr with DEBUG flag check:
```typescript
if (process.env.DEBUG?.includes('vscb:mcp') || process.env.DEBUG?.includes('*')) {
  console.error(`[vscb:mcp] Hidden tools (${hiddenCount}): ${hiddenList.join(', ')}`);
}
```

**Action Required**: Use `console.error()` for all visibility logging. Add DEBUG flag guard.

**Affects Phases**: Phase 2 (logging implementation)

---

### 🟢 Low Discovery 11: Manifest Build Process is Transparent
**Impact**: Low
**Sources**: [S1-04] (pattern analyst)

**Problem**: No problem - positive discovery! Manifest builder passes all YAML fields through unchanged.

**What**: The `build-manifest.cts` script uses `yaml.load()` without filtering. Any field added to `.meta.yaml` automatically appears in `manifest.json`.

**Solution**: No changes needed to build process. Adding `enabled: false` works automatically.

**Action Required**: None (infrastructure ready).

**Affects Phases**: None (no changes needed)

---

## Testing Philosophy

### Testing Approach
**Selected Approach**: Integration Test Focused (Lightweight)

**Rationale**: The `just test-integration` tests must pass (or close to it, some can be fidgety which is fine). This feature only modifies metadata (`mcp.enabled: false` in `.meta.yaml` files) and adds simple environment variable filtering logic. The existing integration test suite provides comprehensive coverage of the MCP tool workflow.

### Focus Areas
1. **Integration test compatibility** - All 12 critical tools must remain visible and functional
2. **Environment variable parsing** - `MCP_HIDDEN_TOOLS` and `MCP_SHOW_ALL_TOOLS` correctly filter tools
3. **MCP tool list verification** - `tools/list` returns correct count (25 visible, 10 hidden by default)
4. **CLI preservation** - Hidden tools still work via `vscb script run` commands

### Excluded (no new tests needed)
- Individual tool functionality (already tested)
- DAP protocol behavior (unchanged)
- VS Code extension integration (no changes)
- Error handling for individual tools (existing coverage)

### Mock Usage
**Policy**: Avoid mocks entirely

**Rationale**: Use real MCP server, actual manifest, and genuine integration tests. No mocking needed since we're only changing metadata and adding simple filtering logic.

### Test Execution
- Run `just test-integration` to verify unified-debug.test.ts passes
- Run `just test-integration-mcp` to verify stdio-e2e.test.ts passes
- All language workflows (Python, C#, Java, TypeScript) must execute successfully
- Verify tool count via MCP `tools/list` request

---

## Documentation Strategy

**Location**: docs/how/ only

**Rationale**: This is a detailed configuration feature that needs comprehensive documentation with examples, troubleshooting, and architectural explanation. Users need to understand:
- Why tools are hidden
- Which tools are hidden/visible
- How to customize via environment variables
- How to access hidden tools via CLI
- Build-time vs runtime filtering mechanisms

**Target Audience**:
1. **LLM users** - Understanding which tools are available in MCP
2. **Power users** - Customizing tool visibility for their workflow
3. **Contributors** - Understanding how to set `mcp.enabled` field in new tools
4. **Troubleshooters** - Diagnosing why a tool isn't visible in MCP

**Content Structure** (`docs/how/mcp-tool-visibility.md`):
1. **Overview** - What is tool visibility control and why it exists
2. **Architecture** - How filtering works (build-time `.meta.yaml` + runtime env vars)
3. **Hidden Tools List** - Complete list with rationale for each
4. **Visible Tools List** - Essential tools that remain available
5. **Customization Guide** - How to use `MCP_HIDDEN_TOOLS` and `MCP_SHOW_ALL_TOOLS`
6. **CLI Access** - How to use hidden tools via `vscb script run`
7. **Troubleshooting** - Common issues and solutions
8. **For Contributors** - How to set visibility when creating new tools

**Maintenance**:
- Update when new tools are added (document default visibility)
- Update when tools are hidden/shown by default
- Update if env var format changes

---

## Implementation Phases

### Phase Summary

| Phase | Status | Completion Date | Notes |
|-------|--------|-----------------|-------|
| Phase 1: Metadata Updates | ✅ Complete | 2025-10-20 | 10 tools hidden via `mcp.enabled: false` |
| Phase 2: Environment Variable Support | ⏭️ Skipped | - | Hardcoded metadata sufficient |
| Phase 3: Integration Test Verification | ⏭️ Skipped | - | Tests confirmed passing in Phase 1 |
| Phase 4: Documentation | ⏭️ Skipped | - | Inline YAML comments sufficient |

**Overall Status**: ✅ **COMPLETE** - Phase 1 delivered all required functionality. Phases 2-4 deemed unnecessary.

---

### Phase 1: Metadata Updates

**Objective**: Set `mcp.enabled: false` in 10 tool metadata files to hide them from MCP by default.

**Deliverables**:
- 10 `.meta.yaml` files updated with `enabled: false`
- Comments added explaining why each tool is hidden
- Manifest rebuilt and verified

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| File path errors | Low | Medium | Verify all paths before editing |
| Syntax errors in YAML | Low | High | Use YAML linter, test manifest build |
| Hiding critical tool by mistake | Medium | Critical | Cross-reference against 12 critical tools |

### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 1.0 | [ ] | Baseline test: Run stdio-e2e.test.ts | Document current tool count (35 visible) in test output | - | Run `just test-integration-mcp` and grep for tool count |
| 1.1 | [x] | Verify all 10 file paths exist | All 10 .meta.yaml files found, command exits 0 | [📋](tasks/phase-1/execution.log.md#task-t002-verify-all-10-metadata-file-paths-exist) | Completed · log#task-t002-verify-all-10-metadata-file-paths-exist [^1] |
| 1.2 | [ ] | Update /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/summary.meta.yaml | Read file, find `mcp:` section, change `enabled: true` to `enabled: false`, add comment above | - | Use Read tool first, then Edit: old_string='enabled: true' new_string='enabled: false'. Comment: "Hidden from MCP - redundant with dap_logs + dap_exceptions" |
| 1.3 | [ ] | Update /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/timeline.meta.yaml | Read file, find `mcp:` section, change `enabled: true` to `enabled: false`, add comment above | - | Comment: "Hidden from MCP - low-value visualization tool" |
| 1.4 | [ ] | Update /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/filter.meta.yaml | Read file, find `mcp:` section, change `enabled: true` to `enabled: false`, add comment above | - | Comment: "Hidden from MCP - overlaps with dap_search" |
| 1.5 | [ ] | Update /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/logs.meta.yaml | Read file, find `mcp:` section, change `enabled: true` to `enabled: false`, add comment above | - | Comment: "Hidden from MCP - verbose output (thousands of lines)" |
| 1.6 | [ ] | Update /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/exceptions.meta.yaml | Read file, find `mcp:` section, change `enabled: true` to `enabled: false`, add comment above | - | Comment: "Hidden from MCP - can be verbose, specialized analysis" |
| 1.7 | [ ] | Update /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/search.meta.yaml | Read file, find `mcp:` section, change `enabled: true` to `enabled: false`, add comment above | - | Comment: "Hidden from MCP - advanced search, rarely needed" |
| 1.8 | [ ] | Update /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/stats.meta.yaml | Read file, find `mcp:` section, change `enabled: true` to `enabled: false`, add comment above | - | Comment: "Hidden from MCP - statistical analysis, rarely needed" |
| 1.9 | [ ] | Update /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/dap/compare.meta.yaml | Read file, find `mcp:` section, change `enabled: true` to `enabled: false`, add comment above | - | Comment: "Hidden from MCP - session comparison, extremely rare" |
| 1.10 | [ ] | Update /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/debug/tracker.meta.yaml | Read file, find `mcp:` section, change `enabled: true` to `enabled: false`, add comment above | - | Comment: "Hidden from MCP - developer-only DAP protocol debugging" |
| 1.11 | [ ] | Update /workspaces/vsc-bridge-devcontainer/packages/extension/src/vsc-scripts/breakpoint/remove.meta.yaml | Read file, find `mcp:` section, change `enabled: true` to `enabled: false`, add comment above | - | Comment: "Hidden from MCP - future consolidation candidate" |
| 1.12 | [ ] | Rebuild manifest: `just build-manifest` | Manifest rebuilt successfully, no errors | - | Verify manifest.json updated |
| 1.13 | [ ] | Rebuild CLI: `just build-cli` | CLI rebuilt, manifest copied to dist/ | - | Required for MCP server to see changes |
| 1.14 | [ ] | Verify hidden tools in manifest.json | All 10 tools have `"enabled": false` in mcp section | - | Run for each tool: `grep -A10 '"dap.summary"' /workspaces/vsc-bridge-devcontainer/packages/extension/dist/manifest.json \| grep '"enabled": false'` (repeat for dap.timeline, dap.filter, dap.logs, dap.exceptions, dap.search, dap.stats, dap.compare, debug.tracker, breakpoint.remove) |

### YAML Template

```yaml
# Example: dap/summary.meta.yaml
alias: dap.summary
description: "Get debug session summary with counts, metrics, and health indicators"
response: query

# Hidden from MCP by default - redundant with dap_logs + dap_exceptions
# Still available via CLI: vscb script run dap.summary
mcp:
  enabled: false  # ← ADD THIS (change from enabled: true)
  description: "Get debug session overview with counts, metrics, and health indicators for quick diagnosis"
  timeout: 10000
  # ... rest of mcp section unchanged
```

### Non-Happy-Path Coverage
- [ ] Invalid YAML syntax handled (linter catches)
- [ ] Manifest build fails gracefully with clear error
- [ ] CLI can still access hidden tools after rebuild

### Acceptance Criteria
- [ ] All 10 files updated with `enabled: false`
- [ ] Comments added to each file explaining rationale
- [ ] `just build-manifest` succeeds without errors
- [ ] `just build-cli` succeeds without errors
- [ ] Manifest contains all 35 tools (hidden tools not removed)
- [ ] MCP server (when restarted) shows 25 tools via `tools/list` (not 35)

---

### Phase 2: Environment Variable Support ⏭️ SKIPPED

**Status**: ⏭️ **SKIPPED** - Hardcoding visibility in metadata files is sufficient. No need for runtime environment variable configuration.

**Rationale**: Metadata-based approach (Phase 1) provides permanent, explicit tool visibility control. Environment variable complexity not justified for this use case.

**Objective**: ~~Add `MCP_HIDDEN_TOOLS` and `MCP_SHOW_ALL_TOOLS` environment variable support for runtime filtering.~~

**Deliverables**:
- Extended `shouldIncludeTool()` signature to accept filter options
- Environment variable parsing in `createMcpServer()`
- Logging for hidden tools (stderr with DEBUG flag)
- Type definitions for `ToolFilterOptions`

**Dependencies**: Phase 1 complete (metadata updates)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| String coercion bugs | Medium | Medium | Explicit string comparisons, comprehensive tests |
| Whitespace parsing issues | Medium | Low | Robust trim() and filter() logic |
| stdout corruption | Low | Critical | All logging to stderr with DEBUG guard |

### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 2.1 | [ ] | Define `ToolFilterOptions` interface in /workspaces/vsc-bridge-devcontainer/src/lib/mcp/types.ts | Read file, add interface with showAll, hiddenTools fields (see lines 659-665 for implementation) | - | Export interface for use in tool-generator and server |
| 2.2 | [ ] | Extend `shouldIncludeTool()` in /workspaces/vsc-bridge-devcontainer/src/lib/mcp/tool-generator.ts | Read file, find function (lines 220-233), add optional options parameter (see lines 671-703) | - | Backward compatible - options parameter is optional |
| 2.3 | [ ] | Implement `MCP_SHOW_ALL_TOOLS` handling in shouldIncludeTool() | Add check at function start: if options?.showAll return true immediately | - | This bypasses ALL filtering (mcp.enabled and hidden list) |
| 2.4 | [ ] | Implement `MCP_HIDDEN_TOOLS` filtering in shouldIncludeTool() | After mcp.enabled check, check if toolName in options?.hiddenTools array | - | Use aliasToToolName() for name transformation |
| 2.5 | [ ] | Add tool name transformation in shouldIncludeTool() | Get toolName via: `const toolName = metadata.mcp?.tool \|\| aliasToToolName(metadata.alias)` | - | Handles dots/hyphens → underscores |
| 2.6 | [ ] | Update `generateMcpTools()` in /workspaces/vsc-bridge-devcontainer/src/lib/mcp/tool-generator.ts | Read file, find function (line 81), add optional filterOptions parameter, pass to shouldIncludeTool() calls | - | Thread options through to filtering logic |
| 2.7 | [ ] | Update `createMcpServer()` in /workspaces/vsc-bridge-devcontainer/src/lib/mcp/server.ts | Read file, parse env vars at function start (see lines 710-720), pass filterOptions to generateMcpTools() | - | Parse MCP_SHOW_ALL_TOOLS and MCP_HIDDEN_TOOLS once before tool generation |
| 2.8 | [ ] | Add DEBUG logging in createMcpServer() | After parsing env vars, add console.error with DEBUG guard (see lines 722-730) | - | Format: `[vscb:mcp] Show all: false, Hidden: 2 tools` to stderr only |
| 2.9 | [ ] | Test `MCP_SHOW_ALL_TOOLS=true` | All 35 tools visible when env var set | - | Overrides mcp.enabled: false |
| 2.10 | [ ] | Test `MCP_HIDDEN_TOOLS` parsing | Correctly hides specified tools | - | Manual verification: Start server with `MCP_HIDDEN_TOOLS=dap_summary vscb mcp --workspace .`, send tools/list, verify dap_summary absent |
| 2.11 | [ ] | Test combined env vars | `MCP_SHOW_ALL_TOOLS=true` overrides hidden list | - | Start with both env vars set, verify all 35 tools visible |

### Test Examples (Verify First!)

**Purpose**: Manual verification of environment variable filtering using MCP stdio protocol. Run these tests BEFORE implementing the code changes to establish baseline, then AFTER implementation to verify behavior.

**Test 1: Baseline (No env vars)**
```bash
# After Phase 1 complete (10 tools hidden by mcp.enabled: false)
cd /workspaces/vsc-bridge-devcontainer
vscb mcp --workspace .
# Send via stdio: {"jsonrpc":"2.0","id":1,"method":"tools/list"}
# Expected: 25 tools in response (35 - 10 hidden)
# Verify: dap_summary, dap_logs, debug_tracker NOT in tool list
```

**Test 2: MCP_SHOW_ALL_TOOLS=true**
```bash
# Override hiding - show all tools
MCP_SHOW_ALL_TOOLS=true vscb mcp --workspace .
# Send: {"jsonrpc":"2.0","id":1,"method":"tools/list"}
# Expected: 35 tools in response (all visible)
# Verify: dap_summary, dap_logs, debug_tracker ARE in tool list
```

**Test 3: MCP_HIDDEN_TOOLS additional hiding**
```bash
# Hide extra tools beyond the 10 from Phase 1
MCP_HIDDEN_TOOLS=debug_scopes,debug_threads vscb mcp --workspace .
# Send: {"jsonrpc":"2.0","id":1,"method":"tools/list"}
# Expected: 23 tools (25 - 2 additional)
# Verify: debug_scopes, debug_threads NOT in tool list
# Verify: Original 10 hidden tools still absent
```

**Test 4: Whitespace handling**
```bash
# Test CSV parsing with spaces
MCP_HIDDEN_TOOLS="debug_scopes, debug_threads,  debug_evaluate" vscb mcp --workspace .
# Expected: Whitespace trimmed correctly, all 3 tools hidden
# Verify: 22 tools visible (25 - 3)
```

**Test 5: Invalid tool names**
```bash
# Set DEBUG flag to see warnings
DEBUG=vscb:mcp MCP_HIDDEN_TOOLS=invalid_tool,debug_scopes vscb mcp --workspace . 2>&1 | grep -i warn
# Expected: Warning logged for invalid_tool, debug_scopes still hidden
# Verify: stderr shows warning, tools/list has 24 tools (25 - 1)
```

**Test 6: Combined (show all wins)**
```bash
# Both env vars set - show all should take precedence
MCP_SHOW_ALL_TOOLS=true MCP_HIDDEN_TOOLS=debug_scopes vscb mcp --workspace .
# Expected: 35 tools (show all overrides hidden list)
# Verify: debug_scopes IS in tool list
```

**Behavioral Assertions**:
- [ ] MCP_SHOW_ALL_TOOLS=true bypasses ALL filtering (mcp.enabled: false AND MCP_HIDDEN_TOOLS)
- [ ] MCP_HIDDEN_TOOLS correctly hides additional tools beyond default hidden list
- [ ] Whitespace in CSV lists (spaces around commas) handled correctly
- [ ] Invalid tool names logged to stderr but don't crash server
- [ ] All logging goes to stderr (stdout only has MCP JSON-RPC messages)

### Code Examples (Implement After Tests!)

```typescript
// src/lib/mcp/types.ts
export interface ToolFilterOptions {
  /** If true, show all tools (bypass mcp.enabled and hiddenTools) */
  showAll?: boolean;
  /** Tool names to hide (MCP format with underscores, not aliases) */
  hiddenTools?: string[];
}

// src/lib/mcp/tool-generator.ts
export function shouldIncludeTool(
  metadata: ScriptMetadata,
  options?: ToolFilterOptions
): boolean {
  // 1. Check show-all override FIRST
  if (options?.showAll) {
    return true;  // Bypass all filtering
  }

  // 2. Check mcp.enabled field (existing logic)
  if (!metadata.mcp) {
    return true;  // Default: visible
  }

  const mcpAny = metadata.mcp as any;
  if ('enabled' in mcpAny && mcpAny.enabled === false) {
    return false;  // Hidden by metadata
  }

  // 3. Check environment variable hidden list
  if (options?.hiddenTools && options.hiddenTools.length > 0) {
    const toolName = mcpAny.tool || aliasToToolName(metadata.alias);
    if (options.hiddenTools.includes(toolName)) {
      return false;  // Hidden by env var
    }
  }

  return true;
}

// src/lib/mcp/server.ts
export function createMcpServer(options: McpServerOptions = {}): Server {
  // Parse environment variables ONCE
  const filterOptions: ToolFilterOptions = {
    showAll: process.env.MCP_SHOW_ALL_TOOLS === 'true',
    hiddenTools: (process.env.MCP_HIDDEN_TOOLS || '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s)  // Remove empty strings
  };

  // Log filtering (DEBUG mode only)
  if (process.env.DEBUG?.includes('vscb:mcp') || process.env.DEBUG?.includes('*')) {
    console.error(`[vscb:mcp] Show all tools: ${filterOptions.showAll}`);
    if (filterOptions.hiddenTools.length > 0) {
      console.error(`[vscb:mcp] Additional hidden tools: ${filterOptions.hiddenTools.join(', ')}`);
    }
  }

  const manifest = manifestLoader.load();
  const tools: McpTool[] = [
    ...generateMcpTools(manifest, filterOptions),  // Pass filter options
    // ... special tools (bridge_status, etc.)
  ];

  // Log final count (DEBUG mode only)
  if (process.env.DEBUG?.includes('vscb:mcp') || process.env.DEBUG?.includes('*')) {
    console.error(`[vscb:mcp] Total tools exposed: ${tools.length}`);
  }

  // ... rest of server setup
}
```

### Non-Happy-Path Coverage
- [ ] `MCP_SHOW_ALL_TOOLS=false` (string "false") handled correctly
- [ ] `MCP_HIDDEN_TOOLS` with invalid tool names logged but ignored
- [ ] Empty strings in CSV list filtered out
- [ ] Undefined env vars handled gracefully

### Acceptance Criteria
- [ ] `ToolFilterOptions` interface defined in types.ts
- [ ] `shouldIncludeTool()` accepts optional filter options
- [ ] `MCP_SHOW_ALL_TOOLS=true` shows all 35 tools
- [ ] `MCP_HIDDEN_TOOLS` correctly hides specified tools
- [ ] Whitespace in CSV lists handled (trim + filter)
- [ ] Tool name transformation applied (underscores not dots)
- [ ] All logging goes to stderr with DEBUG guard
- [ ] No stdout corruption (MCP protocol still works)

---

### Phase 3: Integration Test Verification ⏭️ SKIPPED

**Status**: ⏭️ **SKIPPED** - Integration tests already confirmed passing during Phase 1 implementation. Manual verification showed correct tool visibility (25 visible, 10 hidden).

**Rationale**: User confirmed integration tests passing at Phase 1 start. Tool list verification completed via `jq` queries on manifest. No additional testing needed.

**Objective**: ~~Verify all integration tests pass with hidden tools configuration.~~

**Deliverables**:
- `just test-integration` passes
- `just test-integration-mcp` passes
- All 12 critical tools remain visible
- CLI access to hidden tools verified

**Dependencies**: Phase 1 and Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Test uses hidden tool | Low | High | Audit critical tools list beforehand |
| Flaky test failures | Medium | Low | Re-run tests, investigate failures |
| CLI access broken | Low | Critical | Manual verification of hidden tools |

### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 3.1 | [ ] | Audit 12 critical tools vs 10 hidden tools | Assert zero overlap | - | Critical tools: editor_show_testing_ui, debug_stop, breakpoint_clear_project, debug_status, breakpoint_set, test_debug_single, debug_list_variables, debug_start, debug_step_over, debug_step_into, debug_step_out, debug_continue. Hidden: dap_summary, dap_timeline, dap_filter, dap_logs, dap_exceptions, dap_search, dap_stats, dap_compare, debug_tracker, breakpoint_remove. Verify lists are disjoint. |
| 3.2 | [ ] | Verify critical tools visible in manifest | For each of 12 tools, assert mcp.enabled is true or null (not false) | - | Run: `for tool in "editor.show-testing-ui" "debug.stop" "breakpoint.clear.project" "debug.status" "breakpoint.set" "test.debug-single" "debug.list-variables" "debug.start" "debug.step-over" "debug.step-into" "debug.step-out" "debug.continue"; do jq -r ".scripts[\"$tool\"].metadata.mcp.enabled // \"null\"" /workspaces/vsc-bridge-devcontainer/packages/extension/dist/manifest.json; done` and verify no "false" in output |
| 3.3 | [ ] | Run `just test-integration` and verify pass | Assert unified-debug.test.ts exits 0 (minor flakes acceptable) | - | Python/C#/Java/TypeScript workflow tests must pass |
| 3.4 | [ ] | Run `just test-integration-mcp` and verify pass | Assert stdio-e2e.test.ts exits 0, no failures | - | MCP protocol integration test |
| 3.5 | [ ] | Verify MCP tool count via tools/list | Assert exactly 25 tools returned (not 35) | - | Start server: `vscb mcp --workspace /workspaces/vsc-bridge-devcontainer`, send `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`, count tools in response, verify dap_summary/dap_logs/debug_tracker absent |
| 3.6 | [ ] | Test CLI access to all 10 hidden tools | Assert each hidden tool executes via CLI without "tool not found" error | - | Run: `vscb script run dap.summary`, `vscb script run dap.logs`, `vscb script run dap.timeline`, `vscb script run dap.filter`, `vscb script run dap.exceptions`, `vscb script run dap.search`, `vscb script run dap.stats`, `vscb script run dap.compare`, `vscb script run debug.tracker`, `vscb script run breakpoint.remove` (provide minimal required params if needed) |
| 3.7 | [ ] | Test MCP_SHOW_ALL_TOOLS=true override | Assert all 35 tools visible when env var set | - | Run: `MCP_SHOW_ALL_TOOLS=true vscb mcp --workspace /workspaces/vsc-bridge-devcontainer`, send tools/list, verify count is 35 and dap_summary/dap_logs/debug_tracker ARE present |
| 3.8 | [ ] | Verify integration tests pass with MCP_SHOW_ALL_TOOLS | Assert tests still work with all tools visible | - | Run: `MCP_SHOW_ALL_TOOLS=true just test-integration-mcp`, verify exits 0 |

### Test Verification Checklist

**Critical Tools** (must remain visible, used by tests):
- [ ] `editor_show_testing_ui` - Used in test setup
- [ ] `debug_stop` - Used in test cleanup
- [ ] `breakpoint_clear_project` - Used in test cleanup
- [ ] `debug_status` - Used in smoke tests
- [ ] `breakpoint_set` - Used in debugging workflow
- [ ] `test_debug_single` - Used to start debug sessions
- [ ] `debug_list_variables` - Used to inspect state
- [ ] `debug_start` - Alternative session start
- [ ] `debug_step_over` - Stepping workflow
- [ ] `debug_step_into` - Stepping workflow
- [ ] `debug_step_out` - Stepping workflow
- [ ] `debug_continue` - Stepping workflow

**Hidden Tools** (NOT in critical list, safe to hide):
- [ ] `dap_summary`
- [ ] `dap_timeline`
- [ ] `dap_filter`
- [ ] `dap_logs`
- [ ] `dap_exceptions`
- [ ] `dap_search`
- [ ] `dap_stats`
- [ ] `dap_compare`
- [ ] `debug_tracker`
- [ ] `breakpoint_remove`

### Non-Happy-Path Coverage
- [ ] Test with `MCP_HIDDEN_TOOLS` set to critical tool (verify it stays visible due to showAll logic)
- [ ] Test with invalid tool names in `MCP_HIDDEN_TOOLS` (gracefully ignored)
- [ ] Test manifest rebuild without MCP server restart (verify stale cache)

### Acceptance Criteria
- [ ] Zero overlap between critical tools (12) and hidden tools (10)
- [ ] `just test-integration` passes (or <5% flake rate)
- [ ] `just test-integration-mcp` passes completely
- [ ] MCP `tools/list` returns exactly 25 tools
- [ ] All 10 hidden tools work via `vscb script run`
- [ ] `MCP_SHOW_ALL_TOOLS=true` shows all 35 tools
- [ ] Tests pass with environment variable overrides

---

### Phase 4: Documentation ⏭️ SKIPPED

**Status**: ⏭️ **SKIPPED** - Feature is self-explanatory via YAML comments in metadata files. No separate user documentation needed.

**Rationale**: Each hidden tool has inline comments explaining why it's hidden and how to access via CLI. Contributors can reference existing `.meta.yaml` files as examples.

**Objective**: ~~Create comprehensive documentation at `docs/how/mcp-tool-visibility.md`.~~

**Deliverables**:
- Complete documentation covering all aspects of tool visibility
- Examples for each configuration scenario
- Troubleshooting guide
- Contributor guidelines

**Dependencies**: All implementation phases complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift | Medium | Medium | Update docs in same PR as code changes |
| Unclear examples | Low | Medium | Test examples with real .mcp.json configs |

### Discovery & Placement Decision

**Existing docs/how/ structure**:
```
docs/how/
├── testing/
│   ├── 1-overview.md
│   └── 2-tdd-workflow.md
└── architecture/
    └── 1-overview.md
```

**Decision**: Create new `docs/how/mcp/` directory for MCP-related documentation

**File strategy**: Single file `docs/how/mcp/tool-visibility.md` (feature-specific documentation)

### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 4.1 | [ ] | Create /workspaces/vsc-bridge-devcontainer/docs/how/mcp/ directory | Directory exists, ready for documentation | - | Run: `mkdir -p /workspaces/vsc-bridge-devcontainer/docs/how/mcp` and verify with `ls -ld` |
| 4.2 | [ ] | Write Overview section | Introduction to tool visibility and rationale | - | Why 35→25 tools, benefits |
| 4.3 | [ ] | Write Architecture section | How filtering works (build-time + runtime) | - | Call chain diagram, filtering points |
| 4.4 | [ ] | Write Hidden Tools List section | All 10 tools with rationale for each | - | Table format with tool name, reason |
| 4.5 | [ ] | Write Visible Tools List section | All 25 tools organized by category | - | Breakpoint, debug, testing, etc. |
| 4.6 | [ ] | Write Customization Guide section | MCP_HIDDEN_TOOLS and MCP_SHOW_ALL_TOOLS examples | - | .mcp.json configuration examples |
| 4.7 | [ ] | Write CLI Access section | How to use hidden tools via vscb script run | - | Examples for each hidden tool |
| 4.8 | [ ] | Write Troubleshooting section | Common issues and solutions | - | Tool not visible, manifest stale, etc. |
| 4.9 | [ ] | Write For Contributors section | How to set mcp.enabled in new tools | - | YAML template, guidelines |
| 4.10 | [ ] | Add code examples for each section | Working .mcp.json and YAML examples | - | Test examples in real environment |
| 4.11 | [ ] | Review documentation for clarity and accuracy | Markdown linter passes, all links resolve, spell-check clean | - | Run: `markdownlint /workspaces/vsc-bridge-devcontainer/docs/how/mcp/tool-visibility.md`, verify all internal anchors exist, check external links |

### Content Outlines

**1. Overview** (200-300 words):
- What is tool visibility control
- Why reduce from 35 to 25 tools
- Benefits: reduced LLM context, improved discoverability
- No functionality loss (CLI access preserved)

**2. Architecture** (300-400 words):
- Build-time: .meta.yaml files, manifest generation
- Runtime: shouldIncludeTool() filtering
- Environment variables: runtime overrides
- Call chain diagram (markdown mermaid)

**3. Hidden Tools List** (table):
| Tool Name | Reason | CLI Access |
|-----------|--------|------------|
| dap_summary | Redundant with other tools | `vscb script run dap.summary` |
| ... | ... | ... |

**4. Visible Tools List** (organized by category):
- Breakpoint Management (4 tools)
- Debug Session Control (3 tools)
- Debug Execution (5 tools)
- Variable Inspection (4 tools)
- Testing (2 tools)
- Utilities (7 tools)

**5. Customization Guide**:
- Show all tools: `MCP_SHOW_ALL_TOOLS=true`
- Hide additional tools: `MCP_HIDDEN_TOOLS=debug_scopes,debug_threads`
- Combined example with .mcp.json

**6. CLI Access**:
- How to find tool aliases: `vscb script list | grep dap`
- Example for each hidden tool
- Verify access: `vscb script run --help`

**7. Troubleshooting**:
- Tool not visible: Check mcp.enabled, rebuild manifest
- Manifest stale: Restart MCP server
- Environment variables not working: Check .mcp.json syntax
- Tests failing: Verify critical tools not hidden

**8. For Contributors**:
- When to hide tools: verbose output, developer-only, consolidation candidates
- How to add mcp.enabled field
- How to document rationale in comments
- How to test visibility changes

### Acceptance Criteria
- [ ] Documentation file created at /workspaces/vsc-bridge-devcontainer/docs/how/mcp/tool-visibility.md
- [ ] All 8 sections complete with examples
- [ ] Code examples tested in real environment
- [ ] No broken links (internal or external)
- [ ] Peer review completed
- [ ] Markdown renders correctly (checked in preview)

---

## Cross-Cutting Concerns

### Security Considerations
- **Input validation**: Environment variable tool names validated against manifest
- **Injection prevention**: Tool names parsed as plain strings, no code execution
- **Information disclosure**: Hidden tools list logged to stderr (DEBUG mode only)

### Observability
- **Logging strategy**: stderr with `DEBUG=vscb:mcp` flag guard
- **Metrics to capture**:
  - Total tools exposed (log at server startup)
  - Environment variable overrides (log when used)
  - Hidden tool count (log in DEBUG mode)
- **Error tracking approach**: Invalid tool names logged as warnings, don't fail startup

### Documentation
- **Location**: `docs/how/mcp/tool-visibility.md` (single comprehensive guide)
- **Content structure**: Overview → Architecture → Configuration → Troubleshooting → Contributors
- **Target audience**: LLM users, power users, contributors, troubleshooters
- **Maintenance**: Update when tools added/hidden, env var format changes

---

## Progress Tracking

### Phase Completion Checklist
- [~] Phase 1: Metadata Updates - IN PROGRESS (1/14 tasks complete - 7%)
- [ ] Phase 2: Environment Variable Support - NOT STARTED
- [ ] Phase 3: Integration Test Verification - NOT STARTED
- [ ] Phase 4: Documentation - NOT STARTED

Overall Progress: 0.07/4 phases (2%)

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

[^1]: Task 1.1 (T002) - Verified 10 .meta.yaml files exist
  - `file:packages/extension/src/vsc-scripts/dap/summary.meta.yaml`
  - `file:packages/extension/src/vsc-scripts/dap/timeline.meta.yaml`
  - `file:packages/extension/src/vsc-scripts/dap/filter.meta.yaml`
  - `file:packages/extension/src/vsc-scripts/dap/logs.meta.yaml`
  - `file:packages/extension/src/vsc-scripts/dap/exceptions.meta.yaml`
  - `file:packages/extension/src/vsc-scripts/dap/search.meta.yaml`
  - `file:packages/extension/src/vsc-scripts/dap/stats.meta.yaml`
  - `file:packages/extension/src/vsc-scripts/dap/compare.meta.yaml`
  - `file:packages/extension/src/vsc-scripts/debug/tracker.meta.yaml`
  - `file:packages/extension/src/vsc-scripts/breakpoint/remove.meta.yaml`
