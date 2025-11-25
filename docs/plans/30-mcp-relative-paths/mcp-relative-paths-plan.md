# MCP Tools Relative Path Resolution - Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2025-11-25
**Spec**: [./mcp-relative-paths-spec.md](./mcp-relative-paths-spec.md)
**Status**: READY

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Phase 1: Relative Path Resolution](#phase-1-relative-path-resolution)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

### Problem Statement

MCP tools (`search_symbol_search`, `symbol_calls`, `symbol_navigate`, `breakpoint_set`) fail when given workspace-relative paths. A path like `lib/services/converter.dart` either fails with "File not found" or resolves incorrectly to `/lib/services/converter.dart` (filesystem root).

### Solution Approach

- Add path resolution in `symbol-resolver.ts` to handle both `path` parameters and Flowspace ID path components
- Add path resolution in scripts with direct `fs.existsSync()` calls
- Use existing `PathService.resolve()` or inline workspace resolution as fallback
- Preserve absolute path handling (no regression)

### Expected Outcomes

- Relative paths resolve against VS Code workspace root
- All MCP tools behave consistently
- Absolute paths continue working unchanged
- Clear error messages showing both original and resolved paths

### Success Metrics

- All 7 acceptance criteria from spec pass
- Existing integration tests continue passing
- No regression in absolute path handling

---

## Technical Context

### Current System State

```
User calls:   symbol_navigate(path: "lib/converter.dart", symbol: "Converter")
                         ↓
symbol-resolver.ts:429   vscode.Uri.file("lib/converter.dart")
                         ↓
Result:                  file:///lib/converter.dart  ← WRONG (filesystem root)
Expected:                file:///Users/dev/project/lib/converter.dart
```

### Integration Requirements

- Must use `vscode.workspace.workspaceFolders[0]` for resolution base
- PathService available via `bridgeContext.paths?.resolve()` but not consistently accessible in all contexts
- Symbol-resolver functions don't receive bridgeContext; need direct VS Code API access

### Constraints and Limitations

- Multi-root workspaces: Use first folder silently (deferred to future work)
- Home directory (`~`): Not supported (non-goal)
- CWD-relative: Not meaningful in extension context (non-goal)

### Assumptions

- VS Code workspace always has at least one folder open when MCP tools are used
- PathService pattern is correct; just needs to be applied
- No performance impact from path resolution (single sync check)

---

## Critical Research Findings

### Discovery 01: PathService Exists But Unused

**Impact**: Critical
**Problem**: `PathService.resolve()` correctly handles relative paths but no affected scripts use it
**Location**: `packages/extension/src/core/bridge-context/services/PathService.ts:22-46`
**Solution**: Either use PathService via bridgeContext or inline the resolution logic
**Affects**: All tasks

### Discovery 02: Two Resolution Points in symbol-resolver.ts

**Impact**: Critical
**Problem**: Both `resolveFromFlowspaceId()` (line 378) and `resolveFromSymbolName()` (line 429) use `vscode.Uri.file()` directly without resolving relative paths
**Solution**: Add resolution before `vscode.Uri.file()` call in both functions
**Affects**: Task 1.2

### Discovery 03: Direct fs.existsSync() Calls

**Impact**: High
**Problem**: `symbol-search.ts:58` and `breakpoint/set.ts:30` check file existence with `fs.existsSync(params.path)` against process CWD, not workspace
**Solution**: Resolve path before existence check
**Affects**: Tasks 1.3, 1.4

### Discovery 04: Flowspace ID Path Component

**Impact**: High
**Problem**: Flowspace IDs like `method:src/Calculator.ts:Calculator.add` contain relative paths that also need resolution
**Solution**: Resolve `parsed.filePath` in `resolveFromFlowspaceId()` after parsing
**Affects**: Task 1.2

### Discovery 05: path.isAbsolute() Check Required

**Impact**: Medium
**Problem**: Must preserve absolute path behavior - only resolve if path is relative
**Solution**: Use `path.isAbsolute()` guard before resolution
**Affects**: All implementation tasks

---

## Testing Philosophy

### Testing Approach

- **Selected Approach**: Lightweight
- **Rationale**: CS-2 feature with clear behavior; leverage existing integration test infrastructure (`just test-integration`)
- **Focus Areas**:
  - Relative path resolution against workspace root
  - Absolute path regression (must continue working)
  - Error messages for non-existent files

### Test Strategy

- Add test cases to existing integration tests
- No new test files required
- Use real VS Code workspace and fixtures (no mocks)
- Verify with `just test-integration`

### Mock Usage

- **Policy**: Avoid mocks entirely
- **Rationale**: Integration tests run against real VS Code extension with real workspace

---

## Phase 1: Relative Path Resolution

**Objective**: Enable MCP tools to accept workspace-relative paths by adding path resolution at key points in the codebase.

**Deliverables**:
- Path resolution helper function in symbol-resolver.ts
- Updated `resolveFromFlowspaceId()` and `resolveFromSymbolName()`
- Updated `symbol-search.ts` and `breakpoint/set.ts`
- Passing integration tests

**Dependencies**: None (standalone fix)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Regression in absolute paths | Low | High | `path.isAbsolute()` guard; test both path types |
| PathService unavailable | Low | Medium | Inline fallback using `vscode.workspace.workspaceFolders[0]` |
| Multi-root workspace confusion | Medium | Low | Use first folder silently; documented non-goal |

### Tasks (Lightweight Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Add `resolveToAbsolutePath()` helper in symbol-resolver.ts | 1 | Function resolves relative paths against workspace, passes through absolute paths | - | Central utility for all resolution |
| 1.2 | [ ] | Update `resolveFromFlowspaceId()` and `resolveFromSymbolName()` to use helper | 2 | Both functions resolve paths before `vscode.Uri.file()` call | - | Lines 378 and 429 |
| 1.3 | [ ] | Update `symbol-search.ts` to resolve path before `fs.existsSync()` | 1 | Document mode works with relative paths | - | Line 58 |
| 1.4 | [ ] | Update `breakpoint/set.ts` to resolve path before `fs.existsSync()` | 1 | Breakpoints can be set with relative paths | - | Line 30 |
| 1.5 | [ ] | Run existing integration tests | 1 | `just test-integration` passes, no regressions | - | Verify absolute paths still work |
| 1.6 | [ ] | Manual verification of all acceptance criteria | 1 | AC-1 through AC-7 pass | - | Test each MCP tool with relative path |

### Implementation Details

#### Task 1.1: resolveToAbsolutePath() Helper

```typescript
// In symbol-resolver.ts

import * as path from 'path';

/**
 * Resolve a file path to absolute, using workspace root for relative paths.
 *
 * @param filePath - Absolute or workspace-relative path
 * @returns Absolute path
 * @throws Error if no workspace folder available for relative path
 */
export function resolveToAbsolutePath(filePath: string): string {
    // Already absolute - return as-is
    if (path.isAbsolute(filePath)) {
        return filePath;
    }

    // Resolve relative to first workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        const error: any = new Error(
            `Cannot resolve relative path "${filePath}": No workspace folder open. ` +
            `Use an absolute path or open a workspace folder.`
        );
        error.code = 'E_NO_WORKSPACE';
        throw error;
    }

    return path.resolve(workspaceFolder.uri.fsPath, filePath);
}
```

#### Task 1.2: Update Resolution Functions

```typescript
// In resolveFromFlowspaceId() - around line 378
export async function resolveFromFlowspaceId(
    nodeId: string
): Promise<SymbolResolutionResult | null> {
    const parsed = parseFlowspaceId(nodeId);

    // NEW: Resolve relative path in Flowspace ID
    const absolutePath = resolveToAbsolutePath(parsed.filePath);
    const uri = vscode.Uri.file(absolutePath);

    // ... rest unchanged
}

// In resolveFromSymbolName() - around line 429
export async function resolveFromSymbolName(
    filePath: string,
    symbolName: string
): Promise<SymbolResolutionResult | null> {
    // NEW: Resolve relative path
    const absolutePath = resolveToAbsolutePath(filePath);
    const uri = vscode.Uri.file(absolutePath);

    // ... rest unchanged
}
```

#### Task 1.3: Update symbol-search.ts

```typescript
// In execute() method - around line 58
import * as path from 'path';

// Before fs.existsSync check:
let resolvedPath = params.path;
if (!path.isAbsolute(params.path)) {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        return ScriptResult.failure(
            `Cannot resolve relative path "${params.path}": No workspace folder open`,
            ErrorCode.E_NO_WORKSPACE,
            { path: params.path }
        );
    }
    resolvedPath = path.resolve(workspace.uri.fsPath, params.path);
}

if (!fs.existsSync(resolvedPath)) {
    return ScriptResult.failure(
        `File not found: ${params.path}` +
        (resolvedPath !== params.path ? ` (resolved to: ${resolvedPath})` : ''),
        ErrorCode.E_FILE_NOT_FOUND,
        { path: params.path, resolvedPath }
    );
}

const uri = vscode.Uri.file(resolvedPath);
```

#### Task 1.4: Update breakpoint/set.ts

```typescript
// In execute() method - around line 30
import * as path from 'path';

// Before fs.existsSync check:
let resolvedPath = params.path;
if (!path.isAbsolute(params.path)) {
    const workspace = bridgeContext.vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        return ScriptResult.failure(
            `Cannot resolve relative path "${params.path}": No workspace folder open`,
            ErrorCode.E_NO_WORKSPACE,
            { path: params.path }
        );
    }
    resolvedPath = path.resolve(workspace.uri.fsPath, params.path);
}

if (!fs.existsSync(resolvedPath)) {
    return ScriptResult.failure(
        `File not found: ${params.path}` +
        (resolvedPath !== params.path ? ` (resolved to: ${resolvedPath})` : ''),
        ErrorCode.E_FILE_NOT_FOUND,
        { path: params.path, resolvedPath }
    );
}

const uri = vscodeApi.Uri.file(resolvedPath);
```

### Acceptance Criteria

- [ ] AC-1: `symbol_navigate(path: "src/Calculator.ts", symbol: "Calculator")` works
- [ ] AC-2: `symbol_calls(path: "lib/converter.dart", symbol: "Converter.convert")` works
- [ ] AC-3: `search_symbol_search(mode: "document", path: "src/main.ts")` works
- [ ] AC-4: `breakpoint_set(path: "test/example.py", line: 10)` works
- [ ] AC-5: Absolute paths continue working unchanged
- [ ] AC-6: Error messages show both original and resolved path
- [ ] AC-7: Clear error when no workspace folder open

---

## Cross-Cutting Concerns

### Security Considerations

- **Path traversal**: Resolution uses `path.resolve()` which normalizes `../` sequences; no security risk as VS Code workspace bounds are implicit
- **Input validation**: Paths are validated by file existence check after resolution

### Observability

- **Error messages**: Include both original and resolved paths for debugging
- **No additional logging**: Lightweight change; existing error paths sufficient

### Documentation

- **Location**: None (per spec - internal fix)
- **Rationale**: Behavior becomes what users already expect; no new concepts to document

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| symbol-resolver.ts | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | Central utility, affects multiple scripts | Test both resolution functions |
| symbol-search.ts | 1 | Trivial | S=0,I=0,D=0,N=0,F=0,T=1 | Single file, isolated change | Verify document mode works |
| breakpoint/set.ts | 1 | Trivial | S=0,I=0,D=0,N=0,F=0,T=1 | Single file, isolated change | Verify breakpoint setting works |

**Overall**: CS-2 (small) - matches spec assessment

---

## Progress Tracking

### Phase Completion Checklist

- [ ] Phase 1: Relative Path Resolution - NOT_STARTED

### STOP Rule

**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

**Initial State** (before implementation begins):

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
