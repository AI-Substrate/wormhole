# MCP Tools Relative Path Resolution

## Research Context

📚 This specification incorporates findings from `/plan-1a-explore` research conducted 2025-11-25.

**Components affected:**
- `packages/extension/src/vsc-scripts/search/symbol-search.ts`
- `packages/extension/src/vsc-scripts/symbol/calls.ts`
- `packages/extension/src/vsc-scripts/symbol/navigate.ts`
- `packages/extension/src/vsc-scripts/breakpoint/set.ts`
- `packages/extension/src/core/util/symbol-resolver.ts`

**Critical dependencies:**
- `PathService` exists at `packages/extension/src/core/bridge-context/services/PathService.ts` but is **not used** by affected scripts
- `bridgeContext.paths?.resolve()` interface exists but unused

**Modification risks:**
- Central fix in `symbol-resolver.ts` affects multiple downstream scripts
- Must preserve absolute path behavior (no regression)
- Extension runs in VS Code context where workspace differs from CLI CWD

**Link:** See research output from `/plan-1a-explore` for full analysis.

---

## Summary

**WHAT**: Enable MCP tools (`search_symbol_search`, `symbol_calls`, `symbol_navigate`, `breakpoint_set`) to accept workspace-relative paths and correctly resolve them to absolute paths before file operations.

**WHY**: Currently, when MCP tools receive relative paths (e.g., `lib/services/converter.dart`), they either:
1. Fail with "File not found" because `fs.existsSync()` checks against wrong CWD
2. Fail with "Unable to read file '/lib/...'" because `vscode.Uri.file()` treats relative paths as relative to filesystem root

Users expect relative paths to resolve against the VS Code workspace root, matching standard developer workflows where paths are relative to project root.

---

## Goals

1. **Workspace-relative resolution**: Relative paths resolve against VS Code's first workspace folder
2. **Consistent behavior**: All MCP tools handle paths identically
3. **Transparent UX**: Users can use paths like `src/main.ts` without prefixing workspace root
4. **Zero breaking changes**: Absolute paths continue working exactly as before
5. **Clear error messages**: When paths fail, show both original and resolved path for debugging

---

## Non-Goals

1. **CWD-relative resolution**: MCP tools run in VS Code extension context, not CLI context; CWD is meaningless
2. **Home directory expansion**: `~` paths are not supported (users should use absolute paths for home references)
3. **Symlink resolution**: Standard path resolution; no special symlink handling
4. **Multi-root workspace support**: Uses first workspace folder silently (deferred to future work)
5. **CLI path resolution changes**: CLI already handles path resolution (plan 3-relative-paths); this is extension-side only

---

## Complexity

**Score**: CS-2 (small)

**Breakdown**:
| Factor | Score | Rationale |
|--------|-------|-----------|
| Surface Area (S) | 1 | 5-6 files need modification, all in one package |
| Integration (I) | 0 | Internal only; uses existing VS Code APIs |
| Data/State (D) | 0 | No schema or state changes |
| Novelty (N) | 0 | Well-specified; PathService pattern already exists |
| Non-Functional (F) | 0 | No special performance/security requirements |
| Testing/Rollout (T) | 1 | Integration tests needed for path scenarios |

**Total**: P = 1+0+0+0+0+1 = **2** → **CS-2 (small)**

**Confidence**: 0.85

**Assumptions**:
- PathService is available via `bridgeContext.paths` in all affected scripts
- First workspace folder is always the correct resolution target
- No performance impact from adding path resolution step

**Dependencies**:
- None (internal refactor only)

**Risks**:
- PathService might not be available in all contexts (need fallback)
- Potential confusion with CLI path resolution (different CWD vs workspace semantics)

**Phases**:
1. Central fix in `symbol-resolver.ts`
2. Script-level fixes for direct `fs.existsSync()` calls
3. Test coverage for relative path scenarios

---

## Acceptance Criteria

1. **AC-1**: `symbol_navigate(path: "src/Calculator.ts", symbol: "Calculator")` resolves against workspace root and finds the symbol
2. **AC-2**: `symbol_calls(path: "lib/services/converter.dart", symbol: "Converter.convert")` resolves and returns call hierarchy
3. **AC-3**: `search_symbol_search(mode: "document", path: "src/main.ts")` returns document symbols
4. **AC-4**: `breakpoint_set(path: "test/example.py", line: 10)` sets breakpoint at correct location
5. **AC-5**: Absolute paths (e.g., `/Users/dev/project/src/main.ts`) continue working unchanged
6. **AC-6**: Error messages for non-existent files show both original relative path and resolved absolute path
7. **AC-7**: When workspace has no folders open, relative paths fail with clear error message

---

## Risks & Assumptions

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PathService unavailable in some contexts | Low | Medium | Add inline fallback using `vscode.workspace.workspaceFolders[0]` |
| Breaking existing absolute path handling | Low | High | Comprehensive test coverage; `isAbsolute()` check first |
| Multi-root workspace confusion | Medium | Low | Document single-workspace behavior; non-goal for now |

**Assumptions**:
- MCP tools are always invoked with VS Code workspace open
- Relative paths should resolve against workspace root, not extension host CWD
- All affected scripts have access to `bridgeContext` or can import workspace API

---

## Open Questions

~~All resolved - see Clarifications section.~~

---

## Testing Strategy

- **Approach**: Lightweight
- **Rationale**: CS-2 feature with clear behavior; leverage existing integration test infrastructure (`just test-integration`)
- **Focus Areas**:
  - Relative path resolution against workspace root
  - Absolute path regression (must continue working)
  - Error messages for non-existent files
- **Excluded**: Extensive unit tests for PathService (already tested)
- **Mock Usage**: Avoid mocks entirely - use real VS Code workspace and fixtures

---

## Documentation Strategy

- **Location**: None (D)
- **Rationale**: This fix makes MCP tools behave as users already expect. No new concepts to document - "it just works now."
- **Maintenance**: N/A

---

## Clarifications

### Session 2025-11-25

**Q1: Testing approach?**
- **Answer**: C - Lightweight
- **Rationale**: Use existing integration tests (`just test-integration`); add cases for relative path scenarios

**Q2: Mock usage?**
- **Answer**: A - Avoid mocks entirely
- **Rationale**: Integration tests run against real VS Code extension with real workspace

**Q3: Documentation location?**
- **Answer**: D - No new documentation
- **Rationale**: Internal fix; behavior becomes what users already expect

**Q4: Multi-root workspace behavior?**
- **Answer**: A - Use first folder silently
- **Rationale**: Multi-root not a concept in system currently; defer to future work

**Q5: Flowspace ID path component resolution?**
- **Answer**: A - Yes, resolve paths in Flowspace IDs
- **Rationale**: Same fix covers both `path` parameter and path component in `nodeId` (e.g., `method:src/Calculator.ts:add`)
- **Discovery**: `resolveFromFlowspaceId()` at line 378 has the same `vscode.Uri.file(parsed.filePath)` bug

---

## ADR Seeds (Optional)

**Decision Drivers**:
- Consistency with user expectations (relative = relative to project)
- Minimal code changes (reuse existing PathService)
- Zero regression risk for absolute paths

**Candidate Alternatives**:
- A: Fix at script level (each script resolves) - Simple but repetitive
- B: Fix at symbol-resolver level (central) - DRY but couples scripts to resolver
- C: Fix at MCP parameter parsing level - Most central but affects all tools

**Stakeholders**:
- MCP tool users (AI agents like Claude, Cline)
- Extension developers maintaining scripts
