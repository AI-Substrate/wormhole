# LSP Navigation & Code Intelligence Features

## Summary

Add semantic code navigation and intelligence features to VSC-Bridge that work exclusively via **Flowspace Node IDs** and **symbol names**. This enables AI agents and external tools to navigate, search, and refactor code semantically without needing to know exact line/character positions.

The features leverage VS Code's built-in Language Server Protocol (LSP) providers to support multiple languages (TypeScript, Python, Java, Go, C#, Rust, etc.) without per-language implementation code.

**Key Innovation**: Tools accept **only** **Flowspace IDs** (e.g., `method:src/Calculator.ts:Calculator.add`) or **symbol names** (e.g., `Calculator.add` with file path) as input. Legacy position-based inputs (`line`/`character`) are NOT supported, ensuring semantic, location-independent code operations.

**Consolidation Decision**: Maximum consolidation approach with 4 core tools that cover all essential navigation and refactoring needs.

## Goals

- **Semantic navigation**: Find references and implementations by symbol name or Flowspace ID, not cursor position
- **Multi-language support**: Work across all languages with LSP support (TypeScript, Python, Java, Go, C#, Rust, etc.)
- **Flowspace ID integration**: All tools accept Flowspace Node IDs and symbol names as ONLY input formats (no position support)
- **Symbol-based refactoring**: Rename symbols and replace method bodies by name/ID without needing exact positions
- **Call hierarchy navigation**: Understand call relationships (incoming/outgoing) for functions
- **Consistent UX**: All tools follow same parameter patterns and response formats
- **Agent-friendly**: Designed for AI agents and external tooling, not just interactive editor use
- **Maximum consolidation**: Unified tool interfaces where operations are similar (e.g., references + implementations in one tool)

## Non-Goals

- **Go-to-definition**: Already covered by existing `search.symbol-search` + `editor.goto-line` workflow
- **Type definition navigation**: Skipped - less commonly used than references/implementations
- **Code actions/Quick Fixes**: Not needed per user feedback; agents can apply edits directly
- **Text-based code search/replace**: Skipped - agents can use existing grep/edit tools for text operations
- **Workspace file listing**: Skipped - agents can use existing glob tools
- **Workspace editing primitives**: Skipped - low-level operations not needed (format, organize imports, apply edits)
- **AST parsing**: Use VS Code's LSP providers, not custom per-language parsers
- **Dry-run/preview workflows**: Tools apply changes directly (no multi-step preview/approve flow)
- **IDE replacement**: These are automation tools, not interactive editor features
- **Custom language support**: Only languages with VS Code LSP support; no custom language servers
- **Legacy position support**: No `line`/`character` parameters - only Flowspace IDs and symbol names

## Acceptance Criteria

### 1. Flowspace ID Support (All Tools)
**Given** a user has a Flowspace Node ID like `method:src/Calculator.ts:Calculator.add`
**When** they call any tool with `nodeId` parameter
**Then** the tool resolves the symbol position and performs the requested operation
**And** returns results without requiring line/character parameters
**And** NO legacy `line`/`character` parameters are accepted

### 2. Symbol Name Resolution (All Tools)
**Given** a user knows a symbol name like `Calculator.add` in file `src/Calculator.ts`
**When** they call a tool with `path` and `symbol` parameters
**Then** the tool finds the symbol in the document outline
**And** uses its position for the LSP operation
**And** returns results successfully

### 3. Symbol Navigation - References & Implementations
**Given** a method exists: `method:src/Calculator.ts:Calculator.add`
**When** user calls `symbol.navigate` with `action: "references"` and the Flowspace ID
**Then** returns all locations where `Calculator.add` is called
**And** includes/excludes declaration based on `includeDeclaration` flag
**When** user calls `symbol.navigate` with `action: "implementations"` on an interface
**Then** returns all classes that implement the interface
**And** response includes file paths, line numbers, and code ranges

### 4. Symbol Rename - Workspace-Wide
**Given** a class `Calculator` used across multiple files
**When** user calls `symbol.rename` with `newName: "MathCalculator"` and Flowspace ID
**Then** renames all references across the workspace atomically
**And** updates imports, exports, and usages
**And** returns summary of files changed and edit count

### 5. Method Body Replacement
**Given** a method `UserService.getUser` that needs refactoring
**When** user calls `code.replace-method` with the symbol name and new implementation
**Then** replaces the method body or entire method declaration
**And** uses document symbols to find the method (no position needed)
**And** returns summary of changes applied

### 6. Call Hierarchy Navigation
**Given** a function `UserService.getUser` exists
**When** user calls `hierarchy.calls` with `direction: "incoming"` and Flowspace ID
**Then** returns all functions that call `UserService.getUser`
**When** user calls `hierarchy.calls` with `direction: "outgoing"`
**Then** returns all functions that `UserService.getUser` calls
**And** includes function names, file paths, and call site ranges

### 7. Error Handling - Unsupported Languages
**Given** a file in a language without LSP support
**When** user calls a symbol navigation tool
**Then** returns clear error: `E_NO_LANGUAGE_SERVER`
**And** includes hint about required language support
**And** does not crash or hang

### 8. Error Handling - Symbol Not Found
**Given** user provides invalid symbol name or Flowspace ID
**When** tool attempts to resolve the symbol
**Then** returns error: `E_SYMBOL_NOT_FOUND`
**And** includes details about what was searched
**And** suggests using `search.symbol-search` to find valid symbols

### 9. Response Format Consistency
**Given** any LSP navigation tool is called
**When** it returns results
**Then** response includes standard envelope (ok, status, type, data, meta)
**And** location data uses consistent format (uri, file, line, character, range)
**And** line numbers are 1-indexed (user-facing convention)
**And** character offsets are 0-indexed (VS Code convention)

## Risks & Assumptions

### Risks

1. **Language server availability**: Some languages may not have full LSP support
   - *Mitigation*: Graceful errors with clear messaging; document supported languages

2. **Flowspace ID parsing complexity**: Nested classes, special characters, Windows paths
   - *Mitigation*: Use established Flowspace ID spec; comprehensive test coverage

3. **Symbol name ambiguity**: Multiple symbols with same name in different scopes
   - *Mitigation*: Require file path + symbol name; support qualified names (e.g., `Class.method`)

4. **Performance**: Large codebases may have slow LSP operations
   - *Mitigation*: Use VS Code's built-in caching; add timeout parameters; document expected performance

5. **Workspace edit failures**: Rename/replace may fail if files are read-only or locked
   - *Mitigation*: Return clear error codes; document file permissions requirements

### Assumptions

1. **VS Code LSP providers work correctly**: We rely on VS Code's built-in language servers
2. **Flowspace ID format is stable**: The spec at `docs/research/flowpace-node-id-spec.md` won't change during implementation
3. **Symbol names are unique within files**: For a given file, `Class.method` uniquely identifies a method
4. **Users understand LSP limitations**: Not all operations work in all languages (documented per tool)
5. **Editor context not required**: Tools work without active editor or cursor position
6. **File paths are workspace-relative**: Unless absolute, paths are relative to workspace root

## Open Questions

### ✅ Resolved During Catalog Review

1. **Tool consolidation strategy**: ✅ **RESOLVED** - Maximum consolidation with 4 tools
   - `symbol.navigate` consolidates references + implementations (NOT type definition)
   - Separate tools for rename, method replacement, call hierarchy

2. **Flowspace ID vs symbol name priority**: ✅ **RESOLVED** - Support BOTH
   - Tools accept Flowspace ID (`nodeId`) OR symbol name (`symbol` + `path`)
   - No legacy `line`/`character` position support

3. **Position parameter support**: ✅ **RESOLVED** - NO position support
   - Only semantic inputs (Flowspace ID / symbol name)
   - No backward compatibility with `line`/`character` parameters

4. **Type definition scope**: ✅ **RESOLVED** - Skipped
   - Not included in initial implementation
   - Less commonly used than references/implementations

5. **Call hierarchy**: ✅ **RESOLVED** - Included
   - Part of the 4 core tools as `hierarchy.calls`
   - Two-step complexity accepted for this important feature

6. **Symbol resolver location**: ✅ **RESOLVED** - Dedicated utility with thin script wrappers
   - Create `packages/extension/src/core/utils/symbol-resolver.ts` with helper methods
   - Scripts (`symbol.navigate`, `symbol.rename`, etc.) are thin wrappers calling helpers
   - Maximizes code reuse for future features

7. **Error code strategy**: ✅ **RESOLVED** - Hybrid approach (new LSP-specific + reuse generic)
   - **New codes**: `E_NO_LANGUAGE_SERVER` (LSP not available), `E_AMBIGUOUS_SYMBOL` (multiple matches)
   - **Reuse existing**: `E_NOT_FOUND` (symbol not found), `E_INVALID_INPUT` (bad Flowspace ID), `E_OPERATION_FAILED` (LSP provider failures)
   - Balance between semantic clarity and consistency with existing error infrastructure

8. **Nested class handling**: ✅ **RESOLVED** - Defer to implementation
   - Handle edge cases during implementation based on actual DocumentSymbol structure across languages
   - Document observed behavior in TAD tests (tests as executable documentation)
   - Start with dot notation parsing (split at last dot), adjust if needed based on real-world LSP behavior
   - Pragmatic approach: let implementation discover the right pattern rather than over-specifying upfront

## Feature Breakdown

**Final Toolset**: 4 core tools covering all essential LSP navigation and refactoring needs.

### Tool 1: Symbol Navigation (`symbol.navigate`)

**Purpose**: Unified tool for finding references and implementations. Consolidates two related operations into one tool with an `action` parameter.

**Input Formats**:
- Flowspace ID: `{ nodeId: "method:src/Calculator.ts:Calculator.add", action: "references" }`
- Symbol name: `{ path: "src/Calculator.ts", symbol: "Calculator.add", action: "implementations" }`

**Parameters**:
- `nodeId` (optional): Flowspace Node ID
- `path` (optional): File path (required if `symbol` is provided)
- `symbol` (optional): Symbol name (required if `nodeId` not provided)
- `action` (required): `"references"` or `"implementations"`
- `includeDeclaration` (optional, references only): Include declaration in results (default: true)

**Output**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": [
    {
      "uri": "file:///workspace/src/main.ts",
      "file": "src/main.ts",
      "line": 42,
      "character": 12,
      "range": { "start": {...}, "end": {...} },
      "nodeId": "method:src/Calculator.ts:Calculator.add"
    }
  ],
  "meta": {
    "scriptName": "symbol.navigate",
    "action": "references",
    "total": 5,
    "targetSymbol": {
      "nodeId": "method:src/Calculator.ts:Calculator.add",
      "name": "Calculator.add",
      "file": "src/Calculator.ts"
    }
  }
}
```

**VS Code APIs**:
- References: `vscode.executeReferenceProvider`
- Implementations: `vscode.executeImplementationProvider`

---

### Tool 2: Symbol Rename (`symbol.rename`)

**Purpose**: LSP-powered workspace-wide symbol renaming with language awareness.

**Input Formats**:
- Flowspace ID: `{ nodeId: "class:src/Calculator.ts:Calculator", newName: "MathCalculator" }`
- Symbol name: `{ path: "src/Calculator.ts", symbol: "Calculator", newName: "MathCalculator" }`

**Parameters**:
- `nodeId` (optional): Flowspace Node ID
- `path` (optional): File path (required if `symbol` is provided)
- `symbol` (optional): Symbol name (required if `nodeId` not provided)
- `newName` (required): New name for the symbol

**Output**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": {
    "applied": true,
    "changes": [
      { "uri": "file:///workspace/src/Calculator.ts", "editCount": 1 },
      { "uri": "file:///workspace/src/main.ts", "editCount": 3 }
    ],
    "totalFiles": 2,
    "totalEdits": 4
  },
  "meta": {
    "scriptName": "symbol.rename",
    "durationMs": 125,
    "symbol": {
      "nodeId": "class:src/Calculator.ts:Calculator",
      "oldName": "Calculator",
      "newName": "MathCalculator",
      "file": "src/Calculator.ts"
    }
  }
}
```

**VS Code API**: `vscode.executeDocumentRenameProvider` + `workspace.applyEdit`

---

### Tool 3: Replace Method Body (`code.replace-method`)

**Purpose**: Replace method/function implementation by symbol name without manual line calculation.

**Input Formats**:
- Flowspace ID: `{ nodeId: "method:src/UserService.ts:UserService.getUser", replacement: "...", mode: "replace-body" }`
- Symbol name: `{ path: "src/UserService.ts", symbol: "getUser", replacement: "...", mode: "replace-node" }`

**Parameters**:
- `nodeId` (optional): Flowspace Node ID
- `path` (optional): File path (required if `symbol` is provided)
- `symbol` (optional): Symbol name (required if `nodeId` not provided)
- `replacement` (required): New code to replace with
- `mode` (required): `"replace-body"` (only method body) or `"replace-node"` (entire declaration)

**Output**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": {
    "applied": true,
    "changes": [{
      "uri": "file:///workspace/src/UserService.ts",
      "range": { "start": { "line": 24, "character": 2 }, "end": { "line": 51, "character": 3 } },
      "oldText": "getUser(id: string) { /* old impl */ }",
      "newText": "getUser(id: string) { return this.cache.get(id); }"
    }]
  },
  "meta": {
    "scriptName": "code.replace-method",
    "durationMs": 28,
    "symbol": {
      "nodeId": "method:src/UserService.ts:UserService.getUser",
      "name": "UserService.getUser",
      "file": "src/UserService.ts",
      "mode": "replace-body"
    }
  }
}
```

**VS Code API**: `vscode.executeDocumentSymbolProvider` + `WorkspaceEdit`

---

### Tool 4: Call Hierarchy (`hierarchy.calls`)

**Purpose**: Navigate incoming callers or outgoing callees of a function.

**Input Formats**:
- Flowspace ID: `{ nodeId: "method:src/UserService.ts:UserService.getUser", direction: "incoming" }`
- Symbol name: `{ path: "src/UserService.ts", symbol: "getUser", direction: "outgoing" }`

**Parameters**:
- `nodeId` (optional): Flowspace Node ID
- `path` (optional): File path (required if `symbol` is provided)
- `symbol` (optional): Symbol name (required if `nodeId` not provided)
- `direction` (required): `"incoming"` (who calls this) or `"outgoing"` (what this calls)

**Output**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": [
    {
      "from": {
        "name": "UserController.getUser",
        "nodeId": "method:src/UserController.ts:UserController.getUser",
        "uri": "file:///workspace/src/UserController.ts",
        "range": { "start": { "line": 30, "character": 2 }, "end": { "line": 45, "character": 3 } }
      },
      "fromRanges": [
        { "start": { "line": 35, "character": 12 }, "end": { "line": 35, "character": 22 } }
      ]
    }
  ],
  "meta": {
    "scriptName": "hierarchy.calls",
    "direction": "incoming",
    "totalCalls": 1,
    "targetSymbol": {
      "nodeId": "method:src/UserService.ts:UserService.getUser",
      "name": "UserService.getUser",
      "file": "src/UserService.ts"
    }
  }
}
```

**VS Code APIs**: `vscode.prepareCallHierarchy` + `vscode.provideIncomingCalls` / `vscode.provideOutgoingCalls`

---

### Supporting Infrastructure

#### Symbol Resolver Utility
**Location**: `packages/extension/src/core/utils/symbol-resolver.ts`

**Purpose**: Shared helper methods for symbol resolution logic. Scripts are thin wrappers that call these helpers to maximize code reuse.

**Functions**:
- `resolveSymbol(path, symbolName) → Position` - Find symbol by name in document outline
- `resolveFromFlowspaceId(nodeId) → { uri, position, symbol }` - Parse Flowspace ID and resolve to position
- `parseFlowspaceId(nodeId) → { type, filePath, qualifiedName }` - Parse Flowspace ID format
- `findSymbolInDocument(uri, symbolName) → DocumentSymbol` - Search document symbols by qualified name
- `qualifiedNameMatches(symbol, targetName) → boolean` - Match symbol against target (handles nested classes)

**Used by**: All 4 tools (symbol.navigate, symbol.rename, code.replace-method, hierarchy.calls) as thin wrappers

## Success Metrics

- ✅ All 4 tools accept Flowspace IDs and symbol names as input (NO position support)
- ✅ Symbol resolution works for classes, methods, functions in multi-language workspace
- ✅ Error handling gracefully reports unsupported languages/missing symbols
- ✅ Response formats are consistent across all tools
- ✅ Integration tests cover TypeScript, Python, and at least one statically-typed language (Java/C#/Go)
- ✅ Documentation includes Flowspace ID and symbol name examples for each tool
- ✅ LLM guidance (`llm.when_to_use`) explains semantic input usage (no position parameters)
- ✅ `symbol.navigate` successfully consolidates references and implementations into single tool
- ✅ `hierarchy.calls` handles two-step LSP process (prepare + provide) correctly
- ✅ `code.replace-method` supports both replace-body and replace-node modes

## Testing Strategy

**Approach**: TAD (Test-Assisted Development)

**Rationale**: These LSP features require executable documentation given their complexity (symbol resolution, Flowspace ID parsing, multi-language LSP integration, two-step call hierarchy). Tests serve as high-fidelity documentation for how tools handle various input formats and edge cases.

**Focus Areas**:
- Symbol resolution logic (Flowspace ID parsing, symbol name lookup)
- LSP provider integrations (references, implementations, rename, call hierarchy)
- Error handling (unsupported languages, missing symbols, ambiguous symbols)
- Multi-language support (TypeScript, Python, at least one statically-typed language)
- Response enrichment with Flowspace IDs

**Excluded**:
- Extensive mocking of VS Code APIs (prefer real LSP providers in test workspace)
- Exhaustive edge case permutations (focus on critical paths documented in acceptance criteria)

**Mock Usage**: Avoid mocks entirely
- Use real VS Code LSP providers with actual test workspace fixtures
- No mocking of `vscode.execute*` APIs, `DocumentSymbolProvider`, `WorkspaceEdit`, etc.
- Integration tests with real language servers provide higher confidence
- Rationale: Real LSP behavior is critical to validate; mocks would hide integration issues

**TAD-Specific Workflow**:
- **Scratch→Promote**: Start tests in `scratch/test/`, promote to permanent test suite based on heuristic
- **Test Doc Blocks**: All tests include comment blocks explaining what they document
- **Promotion Heuristic**: Promote tests that are Critical (core functionality), Opaque (complex logic), Regression (found bugs), or Edge (boundary conditions)

## Documentation Strategy

**Location**: Hybrid (README.md + docs/how/)

**Rationale**: LSP features need both quick-start examples for discoverability and comprehensive guides for complex workflows like symbol resolution and multi-language support.

**Content Split**:
- **README.md**: 2-3 simple examples showing basic usage (find references, rename symbol) with Flowspace IDs. Link to detailed docs.
- **docs/how/**: Comprehensive guide covering symbol resolution architecture, all 4 tools with detailed examples, multi-language support matrix, error handling strategies, troubleshooting.

**Target Audience**:
- **README**: AI agents and developers wanting quick usage examples
- **docs/how/**: Extension developers, contributors, and users needing detailed integration patterns

**Maintenance**: Update README examples when tool parameters change; update docs/how/ when adding new languages or workflows.

## Clarifications

### Session 2025-10-28

**Q1: Testing Strategy**
- **Answer**: TAD (Test-Assisted Development)
- **Rationale**: LSP features have complex symbol resolution, multi-language support, and Flowspace ID parsing that benefit from tests as executable documentation

**Q2: Mock Usage Policy**
- **Answer**: Avoid mocks entirely
- **Rationale**: Real LSP behavior is critical to validate; mocks would hide integration issues with actual language servers

**Q3: Documentation Strategy**
- **Answer**: Hybrid (README.md + docs/how/)
- **Content Split**: README shows 2-3 simple examples (find references, rename with Flowspace ID); docs/how/ has comprehensive guide for all 4 tools, symbol resolution architecture, multi-language support
- **Rationale**: Need both quick-start examples for discoverability and detailed guides for complex symbol resolution workflows

**Q4: Symbol Resolver Location**
- **Answer**: Dedicated utility file with thin script wrappers
- **Location**: `packages/extension/src/core/utils/symbol-resolver.ts`
- **Rationale**: All methods should be helper methods with scripts as thin wrappers to achieve maximum code reuse for future features

**Q5: Error Code Strategy**
- **Answer**: Hybrid (new LSP-specific + reuse generic)
- **New codes**: `E_NO_LANGUAGE_SERVER`, `E_AMBIGUOUS_SYMBOL`
- **Reuse**: `E_NOT_FOUND` (missing symbols), `E_INVALID_INPUT` (bad Flowspace IDs), `E_OPERATION_FAILED` (LSP failures)
- **Rationale**: Balance semantic clarity for LSP-specific errors with consistency using existing error infrastructure

**Q6: Nested Class Handling**
- **Answer**: Defer to implementation
- **Approach**: Handle edge cases during implementation based on actual DocumentSymbol structure; document behavior in TAD tests
- **Starting Point**: Dot notation parsing (split at last dot), adjust based on real-world LSP behavior
- **Rationale**: Pragmatic approach - let implementation discover the right pattern rather than over-specifying upfront

## Related Documents

- **Feature catalog**: `docs/plans/25-lsp-features/lsp-navigation-features-catalog.md` - Comprehensive feature analysis
- **Flowspace ID spec**: `docs/research/flowpace-node-id-spec.md` - Node ID format specification
- **Research document**: `docs/research/more-features.md` - Original feature proposals
- **Existing tools**: `search.symbol-search` - Foundation for symbol resolution pattern
