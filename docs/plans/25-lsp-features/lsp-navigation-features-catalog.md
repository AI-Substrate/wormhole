# LSP & Navigation Features Catalog

**Purpose**: Comprehensive catalog of proposed LSP and navigation features for VSC-Bridge MCP tools.

**Status**: 📋 **UNDER REVIEW** - Awaiting decision on which features to implement

**Source**: Research document at `docs/research/more-features.md`

---

## Executive Summary

### Current State (41 MCP Tools)
We already have:
- ✅ **`search.symbol-search`** - Workspace symbol search AND document outline (mode parameter)
- ✅ **`diagnostic.collect`** - Diagnostic information gathering
- ✅ Comprehensive debugging tools (38 tools across breakpoints, debug, DAP, tests)

### Proposed Additions (13 Features → Estimated 7-11 New Tools)

**Priority Guidance from User**:
- 🔥 **P1**: Symbol Navigation (references, implementations)
- 🔥 **P2**: Workspace Discovery (file listing)
- 🔥 **P3**: Code Search/Replace (with document outline extension)
- ⏸️ **Skip**: Code Actions, Go-to-Definition (not needed - covered by existing tools)

**Design Philosophy**:
- Direct apply only (no dry-run/preview workflow)
- Consolidation decisions TBD during implementation
- All features leverage VS Code's built-in LSP providers (multi-language support)

---

## Feature Catalog

### Category 1: Symbol Navigation 🔥 **P1**

#### ⏸️ Note: Go-to-Definition NOT Needed

**Rationale**: We already have sufficient tools to handle "find where symbol is defined":

1. **`search.symbol-search`** (workspace mode) - Finds symbols by name and returns their definition locations
2. **`editor.goto-line`** - Navigates to any file:line location

**Workflow Example**:
```json
// Step 1: Find symbol
{ "tool": "search_symbol_search", "params": { "query": "UserService", "mode": "workspace" } }
// Returns: { "location": { "uri": "...", "range": { "start": { "line": 4, ... } } } }

// Step 2: Navigate there
{ "tool": "editor_goto_line", "params": { "path": "...", "line": 4 } }
```

This two-step approach covers the use case without adding position-based go-to-definition complexity.

---

#### 1.1 Find References ✅ **APPROVED FOR IMPLEMENTATION**

**What it does**: Find all places where a symbol is used across the entire workspace. Essential for refactoring and understanding impact.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Where is `UserService.getUser()` called?"
- "Show all usages of this variable"
- Safe refactoring (understand impact before changing)
- Finding dead code (no references = unused)

**Key Innovation**: **Semantic input via Flowspace IDs** - No need to know exact cursor positions!

**Proposed Parameters**:
```typescript
{
  // PRIMARY INPUT: Flowspace Node ID (recommended)
  nodeId?: string,           // e.g., "method:src/user/UserService.ts:UserService.getUser"

  // ALTERNATIVE INPUT: Symbol name + path
  path?: string,             // File containing the symbol
  symbol?: string,           // Qualified symbol name (e.g., "UserService.getUser")

  // OPTIONS
  includeDeclaration?: boolean  // Include the declaration itself? (default: true)
}
```

**Input Validation**:
- Must provide EITHER `nodeId` OR (`path` + `symbol`)
- `nodeId` takes precedence if both provided

**Example MCP Call - Flowspace ID (Preferred)**:
```json
{
  "tool": "symbol_references_find",
  "params": {
    "nodeId": "method:src/user/UserService.ts:UserService.getUser",
    "includeDeclaration": true
  }
}
```

**Example MCP Call - Symbol Name**:
```json
{
  "tool": "symbol_references_find",
  "params": {
    "path": "src/user/UserService.ts",
    "symbol": "UserService.getUser",
    "includeDeclaration": true
  }
}
```


**Example Response**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": {
    "symbol": {
      "name": "getUser",
      "kind": "Method",
      "container": "UserService",
      "nodeId": "method:src/user/UserService.ts:UserService.getUser"
    },
    "references": [
      {
        "uri": "file:///workspace/src/user/UserController.ts",
        "file": "src/user/UserController.ts",
        "line": 19,
        "character": 8,
        "range": {
          "start": { "line": 19, "character": 8 },
          "end": { "line": 19, "character": 18 }
        },
        "preview": "    const user = await userService.getUser(id);"
      },
      {
        "uri": "file:///workspace/src/admin/AdminController.ts",
        "file": "src/admin/AdminController.ts",
        "line": 45,
        "character": 12,
        "range": {
          "start": { "line": 45, "character": 12 },
          "end": { "line": 45, "character": 22 }
        },
        "preview": "        return this.userService.getUser(userId);"
      }
    ],
    "total": 2,
    "includeDeclaration": true
  },
  "meta": {
    "scriptName": "symbol.references.find",
    "durationMs": 22,
    "resolvedVia": "flowspaceId"  // or "symbolName" or "position"
  }
}
```

**Implementation Steps**:

1. **Symbol Resolution Layer**:
   ```typescript
   // Utility: SymbolResolver
   async function resolveSymbol(params: FindReferencesParams): Promise<{ uri: Uri, position: Position, symbol: DocumentSymbol }> {
     if (params.nodeId) {
       return await resolveFromFlowspaceId(params.nodeId);
     } else if (params.symbol && params.path) {
       return await resolveFromSymbolName(params.path, params.symbol);
     }
     throw new Error('Must provide nodeId or symbol+path');
   }
   ```

2. **Flowspace ID Parser**:
   ```typescript
   function parseFlowspaceId(nodeId: string): { type: string, filePath: string, qualifiedName: string } {
     // Parse "method:src/user/UserService.ts:UserService.getUser"
     const [type, ...rest] = nodeId.split(':');
     const lastColonIndex = rest.join(':').lastIndexOf(':');
     const filePath = rest.join(':').substring(0, lastColonIndex);
     const qualifiedName = rest.join(':').substring(lastColonIndex + 1);
     return { type, filePath, qualifiedName };
   }
   ```

3. **Symbol Finder** (reusable utility):
   ```typescript
   async function findSymbolInDocument(uri: Uri, qualifiedName: string): Promise<DocumentSymbol | null> {
     const symbols = await vscode.commands.executeCommand(
       'vscode.executeDocumentSymbolProvider',
       uri
     );
     // Search recursively for matching symbol (handle nested classes: "Class.method")
     return findSymbolRecursive(symbols, qualifiedName);
   }
   ```

4. **VS Code LSP Call**:
   ```typescript
   const results = await vscode.commands.executeCommand(
     'vscode.executeReferenceProvider',
     uri,
     position,
     { includeDeclaration: params.includeDeclaration ?? true }
   );
   // Returns: Location[]
   ```

**Error Handling**:
- `E_INVALID_NODE_ID`: Flowspace ID format is invalid
- `E_FILE_NOT_FOUND`: File in nodeId/path doesn't exist
- `E_SYMBOL_NOT_FOUND`: Symbol not found in document outline
- `E_NO_LANGUAGE_SERVER`: Language server doesn't support references
- `E_AMBIGUOUS_SYMBOL`: Multiple symbols match (should not happen with qualified names)

**Consolidation Decision**: **Keep as separate tool**
- Unique parameter (`includeDeclaration`)
- Very common operation deserving dedicated tool
- Clear, focused API better for LLM agents

**Implementation Effort**: 🟡 Medium
- Symbol resolution layer required (new utility)
- Flowspace ID parsing required
- Symbol finder with recursive search
- All reusable for other tools

**Dependencies**:
- Shared `SymbolResolver` utility (create first)
- Flowspace ID parser (shared module)

---

#### 1.2 Find Implementations ✅ **APPROVED FOR IMPLEMENTATION**

**What it does**: Find concrete implementations of interfaces or abstract methods. Critical for OOP codebases (TypeScript, Java, C#, Go).

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Show me all classes that implement `IUserRepository`"
- "What are the concrete implementations of this abstract method?"
- Understanding polymorphism and inheritance hierarchies
- Navigating from interface to implementations

**Key Innovation**: **Semantic input via Flowspace IDs** - No need to know exact cursor positions!

**Proposed Parameters**:
```typescript
{
  // PRIMARY INPUT: Flowspace Node ID (recommended)
  nodeId?: string,           // e.g., "class:src/types/IUserRepository.ts:IUserRepository"

  // ALTERNATIVE INPUT: Symbol name + path
  path?: string,             // File containing the interface/abstract class
  symbol?: string            // Qualified symbol name (e.g., "IUserRepository")
}
```

**Input Validation**:
- Must provide EITHER `nodeId` OR (`path` + `symbol`)
- `nodeId` takes precedence if both provided

**Example MCP Call - Flowspace ID (Preferred)**:
```json
{
  "tool": "symbol_implementation_get",
  "params": {
    "nodeId": "class:src/types/IUserRepository.ts:IUserRepository"
  }
}
```

**Example MCP Call - Symbol Name**:
```json
{
  "tool": "symbol_implementation_get",
  "params": {
    "path": "src/types/IUserRepository.ts",
    "symbol": "IUserRepository"
  }
}
```

**Example Response**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": {
    "symbol": {
      "name": "IUserRepository",
      "kind": "Interface",
      "nodeId": "class:src/types/IUserRepository.ts:IUserRepository"
    },
    "implementations": [
      {
        "uri": "file:///workspace/src/db/SqlUserRepository.ts",
        "file": "src/db/SqlUserRepository.ts",
        "line": 5,
        "character": 13,
        "range": {
          "start": { "line": 5, "character": 13 },
          "end": { "line": 5, "character": 30 }
        },
        "preview": "export class SqlUserRepository implements IUserRepository {",
        "symbolName": "SqlUserRepository",
        "nodeId": "class:src/db/SqlUserRepository.ts:SqlUserRepository"
      },
      {
        "uri": "file:///workspace/src/cache/CachedUserRepository.ts",
        "file": "src/cache/CachedUserRepository.ts",
        "line": 8,
        "character": 13,
        "range": {
          "start": { "line": 8, "character": 13 },
          "end": { "line": 8, "character": 33 }
        },
        "preview": "export class CachedUserRepository implements IUserRepository {",
        "symbolName": "CachedUserRepository",
        "nodeId": "class:src/cache/CachedUserRepository.ts:CachedUserRepository"
      }
    ],
    "total": 2
  },
  "meta": {
    "scriptName": "symbol.implementation.get",
    "durationMs": 18,
    "resolvedVia": "flowspaceId"  // or "symbolName"
  }
}
```

**Implementation Steps**:

1. **Symbol Resolution Layer** (reuses utility from Find References):
   ```typescript
   // Utility: SymbolResolver (shared)
   async function resolveSymbol(params: FindImplementationParams): Promise<{ uri: Uri, position: Position, symbol: DocumentSymbol }> {
     if (params.nodeId) {
       return await resolveFromFlowspaceId(params.nodeId);
     } else if (params.symbol && params.path) {
       return await resolveFromSymbolName(params.path, params.symbol);
     }
     throw new Error('Must provide nodeId or symbol+path');
   }
   ```

2. **VS Code LSP Call**:
   ```typescript
   const results = await vscode.commands.executeCommand(
     'vscode.executeImplementationProvider',
     uri,
     position
   );
   // Returns: Location[] or LocationLink[]
   ```

3. **Response Enrichment**:
   ```typescript
   // For each implementation, get symbol info and generate Flowspace ID
   const enrichedImplementations = await Promise.all(
     results.map(async (loc) => {
       const implSymbol = await getSymbolAtPosition(loc.uri, loc.range.start);
       const preview = await getLinePreview(loc.uri, loc.range.start.line);
       return {
         ...formatLocation(loc),
         preview,
         symbolName: implSymbol?.name,
         nodeId: implSymbol ? generateFlowspaceId(loc.uri, implSymbol) : undefined
       };
     })
   );
   ```

**Error Handling**:
- `E_INVALID_NODE_ID`: Flowspace ID format is invalid
- `E_FILE_NOT_FOUND`: File in nodeId/path doesn't exist
- `E_SYMBOL_NOT_FOUND`: Symbol not found in document outline
- `E_NO_LANGUAGE_SERVER`: Language server doesn't support implementation provider
- `E_NOT_IMPLEMENTABLE`: Symbol is not an interface/abstract class/method

**Language Support Note**: Not all language servers support implementation providers. Return graceful error (`E_NO_LANGUAGE_SERVER`) for unsupported languages.

**Consolidation Decision**: **Keep as separate tool**
- Specific to interfaces/abstract classes
- Different mental model than "find references"
- Clear, focused API better for LLM agents

**Implementation Effort**: 🟡 Medium
- Reuses SymbolResolver utility from Find References
- Additional response enrichment (get implementation symbols)
- Language support detection required

**Dependencies**:
- Shared `SymbolResolver` utility (same as Find References)
- Flowspace ID parser (shared module)
- Symbol-to-Flowspace-ID generator utility

---

#### 1.3 Find Type Definition ⏸️ **SKIPPED - NOT NEEDED**

**What it does**: Jump to the type definition of a symbol. Useful in TypeScript for "go to type" rather than "go to variable".

**Current Status**: ❌ Not implemented

**Decision**: **SKIPPED** - Less commonly used than references/implementations. Can be added later if needed.

**Rationale**:
- Less common operation than references/implementations
- TypeScript-specific use case (limited language support)
- Not critical for initial LSP features release
- Can be added in future iteration if demand exists

**Language Support Note**: Primarily useful for TypeScript, Go, Rust, C++. May not be supported in all languages.

**Implementation Effort**: 🟢 Low - Single VS Code command (if we decide to add later)

---

### Category 2: Symbol Refactoring 🔥 **P1**

#### 2.0 Symbol Rename ✅ **APPROVED FOR IMPLEMENTATION**

**What it does**: LSP-powered, workspace-wide rename of symbols. Renames all references atomically with language awareness.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Rename `UserService` to `AccountService` everywhere"
- Safe refactoring with language-aware scope resolution
- Automatic handling of imports, exports, references
- Rename methods, classes, variables, functions

**Key Innovation**: **Semantic input via Flowspace IDs** - No need to know exact cursor positions!

**Proposed Parameters**:
```typescript
{
  // PRIMARY INPUT: Flowspace Node ID (recommended)
  nodeId?: string,           // e.g., "class:src/user/UserService.ts:UserService"

  // ALTERNATIVE INPUT: Symbol name + path
  path?: string,             // File containing the symbol to rename
  symbol?: string,           // Qualified symbol name (e.g., "UserService")

  // REQUIRED
  newName: string,           // New name for the symbol

  // OPTIONS
  apply?: boolean            // Apply immediately (default: true, per user requirement)
}
```

**Input Validation**:
- Must provide EITHER `nodeId` OR (`path` + `symbol`)
- `nodeId` takes precedence if both provided
- `newName` is always required

**Example MCP Call - Flowspace ID (Preferred)**:
```json
{
  "tool": "symbol_rename",
  "params": {
    "nodeId": "class:src/user/UserService.ts:UserService",
    "newName": "AccountService",
    "apply": true
  }
}
```

**Example MCP Call - Symbol Name**:
```json
{
  "tool": "symbol_rename",
  "params": {
    "path": "src/user/UserService.ts",
    "symbol": "UserService",
    "newName": "AccountService",
    "apply": true
  }
}
```

**Example Response**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": {
    "symbol": {
      "name": "UserService",
      "kind": "Class",
      "nodeId": "class:src/user/UserService.ts:UserService"
    },
    "newName": "AccountService",
    "applied": true,
    "changes": [
      {
        "uri": "file:///workspace/src/user/UserService.ts",
        "file": "src/user/UserService.ts",
        "editCount": 1,
        "edits": [
          {
            "line": 4,
            "character": 13,
            "oldText": "UserService",
            "newText": "AccountService"
          }
        ]
      },
      {
        "uri": "file:///workspace/src/user/UserController.ts",
        "file": "src/user/UserController.ts",
        "editCount": 3,
        "edits": [
          { "line": 5, "character": 7, "oldText": "UserService", "newText": "AccountService" },
          { "line": 12, "character": 20, "oldText": "UserService", "newText": "AccountService" },
          { "line": 28, "character": 15, "oldText": "UserService", "newText": "AccountService" }
        ]
      },
      {
        "uri": "file:///workspace/src/admin/AdminController.ts",
        "file": "src/admin/AdminController.ts",
        "editCount": 2,
        "edits": [
          { "line": 8, "character": 7, "oldText": "UserService", "newText": "AccountService" },
          { "line": 22, "character": 25, "oldText": "UserService", "newText": "AccountService" }
        ]
      }
    ],
    "totalFiles": 3,
    "totalEdits": 6
  },
  "meta": {
    "scriptName": "symbol.rename",
    "durationMs": 125,
    "resolvedVia": "flowspaceId"  // or "symbolName"
  }
}
```

**Implementation Steps**:

1. **Symbol Resolution Layer** (reuses utility from Find References):
   ```typescript
   // Utility: SymbolResolver (shared)
   async function resolveSymbol(params: RenameParams): Promise<{ uri: Uri, position: Position, symbol: DocumentSymbol }> {
     if (params.nodeId) {
       return await resolveFromFlowspaceId(params.nodeId);
     } else if (params.symbol && params.path) {
       return await resolveFromSymbolName(params.path, params.symbol);
     }
     throw new Error('Must provide nodeId or symbol+path');
   }
   ```

2. **Get Rename Edit from LSP**:
   ```typescript
   const edit = await vscode.commands.executeCommand(
     'vscode.executeDocumentRenameProvider',
     uri,
     position,
     params.newName
   );

   if (!edit) {
     throw new Error('Language server rejected rename operation');
   }
   ```

3. **Apply Edit** (if `apply: true`):
   ```typescript
   const success = await vscode.workspace.applyEdit(edit);

   if (!success) {
     throw new Error('Failed to apply rename edits');
   }
   ```

4. **Summarize Changes**:
   ```typescript
   // Extract detailed edit information from WorkspaceEdit
   const changes = [];
   for (const [uriString, edits] of edit.entries()) {
     const uri = typeof uriString === 'string' ? vscode.Uri.parse(uriString) : uriString;
     const fileEdits = edits.map(edit => ({
       line: edit.range.start.line + 1,  // Convert to 1-indexed
       character: edit.range.start.character,
       oldText: await getTextInRange(uri, edit.range),
       newText: edit.newText
     }));

     changes.push({
       uri: uri.toString(),
       file: vscode.workspace.asRelativePath(uri),
       editCount: edits.length,
       edits: fileEdits
     });
   }

   return {
     applied: success,
     changes,
     totalFiles: changes.length,
     totalEdits: changes.reduce((sum, c) => sum + c.editCount, 0)
   };
   ```

**Error Handling**:
- `E_INVALID_NODE_ID`: Flowspace ID format is invalid
- `E_FILE_NOT_FOUND`: File in nodeId/path doesn't exist
- `E_SYMBOL_NOT_FOUND`: Symbol not found in document outline
- `E_NO_LANGUAGE_SERVER`: Language server doesn't support rename
- `E_RENAME_REJECTED`: Language server rejected the rename (e.g., invalid name, conflicts)
- `E_RENAME_FAILED`: Failed to apply the rename edits
- `E_INVALID_NAME`: `newName` is not a valid identifier

**Safety Considerations**:
- Direct apply by default (no dry-run workflow, per user requirement)
- Could fail if language server rejects rename (e.g., conflicts, invalid name)
- Returns clear error codes if rename not possible
- Provides detailed change summary so user can see what was changed
- Language server performs scope analysis (won't rename unrelated symbols)

**Consolidation Decision**: **Keep as separate tool**
- Complex operation distinct from navigation
- Different return type (workspace edit summary vs locations)
- Different mental model (modification vs query)
- Requires `newName` parameter unique to this operation

**Implementation Effort**: 🟡 Medium
- Reuses SymbolResolver utility from Find References
- WorkspaceEdit parsing and summarization required
- Detailed edit extraction for transparency
- Error handling for various failure modes

**Dependencies**:
- Shared `SymbolResolver` utility (same as Find References)
- Flowspace ID parser (shared module)
- WorkspaceEdit summarizer (new utility)

---

### Category 3: Code Search & Replace 🔥 **P3**

#### 3.1 Code Search (Text/Regex) ⏸️ **SKIPPED - NOT NEEDED**

**What it does**: Fast text or regex search across workspace using VS Code's ripgrep backend. Non-symbol search for patterns, TODOs, strings, etc.

**Current Status**: ❌ Not implemented

**Decision**: **SKIPPED** - Coding agents (Claude, Cline, etc.) already have text search capabilities built-in.

**Rationale**:
- Most AI coding agents have built-in grep/search tools
- VS Code already exposes search via editor UI
- Not critical for LSP-focused features
- Can be added later if specific use case emerges
- Focus on semantic/LSP features where we add unique value

**Implementation Effort**: 🟡 Medium (if we decide to add later)

---

#### 3.2 Code Replace (Text/Regex) ⏸️ **SKIPPED - NOT NEEDED**

**What it does**: Multi-file find-and-replace with glob filtering. Atomic workspace edit.

**Current Status**: ❌ Not implemented

**Decision**: **SKIPPED** - Not needed, same rationale as code search.

**Rationale**:
- AI coding agents can perform find-and-replace operations
- Use symbol rename for semantic refactoring
- Text-based replace is less safe than LSP-powered operations
- Focus on LSP features where we provide unique value

**Implementation Effort**: 🟡 Medium (if we decide to add later)

---

### Category 4: Method-Level Editing 🔥 **P3**

#### 4.1 Replace Method Body ✅ **APPROVED FOR IMPLEMENTATION**

**What it does**: Replace a method/function body or entire declaration by Flowspace ID or symbol name. Uses DocumentSymbolProvider to find the method - no manual line number calculation needed.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Replace the implementation of `UserService.getUser()` with caching logic"
- Targeted refactoring of specific methods
- Update function bodies without touching signatures
- Replace entire method declarations

**Key Innovation**: **Semantic input via Flowspace IDs** - Find and replace methods by name, not position!

**Proposed Parameters**:
```typescript
{
  // PRIMARY INPUT: Flowspace Node ID (recommended)
  nodeId?: string,            // e.g., "method:src/user/UserService.ts:UserService.getUser"

  // ALTERNATIVE INPUT: Symbol name + path
  path?: string,              // File containing the method
  symbol?: string,            // Qualified symbol name (e.g., "UserService.getUser")

  // REQUIRED
  replacement: string,        // New code (full method or just body)

  // OPTIONS
  mode?: "replace-body" | "replace-node",  // Body only or entire declaration (default: "replace-node")
  apply?: boolean             // Apply immediately (default: true)
}
```

**Input Validation**:
- Must provide EITHER `nodeId` OR (`path` + `symbol`)
- `nodeId` takes precedence if both provided
- `replacement` is always required

**Example MCP Call - Flowspace ID (Preferred)**:
```json
{
  "tool": "code_replace_method",
  "params": {
    "nodeId": "method:src/user/UserService.ts:UserService.getUser",
    "replacement": "getUser(id: string) {\n  return this.cache.get(id) ?? this.api.get(id);\n}",
    "mode": "replace-node",
    "apply": true
  }
}
```

**Example MCP Call - Symbol Name**:
```json
{
  "tool": "code_replace_method",
  "params": {
    "path": "src/user/UserService.ts",
    "symbol": "UserService.getUser",
    "replacement": "return this.cache.get(id) ?? this.api.get(id);",
    "mode": "replace-body",
    "apply": true
  }
}
```

**Example Response**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": {
    "symbol": {
      "name": "getUser",
      "kind": "Method",
      "container": "UserService",
      "nodeId": "method:src/user/UserService.ts:UserService.getUser"
    },
    "mode": "replace-node",
    "applied": true,
    "changes": [
      {
        "uri": "file:///workspace/src/user/UserService.ts",
        "file": "src/user/UserService.ts",
        "range": {
          "start": { "line": 24, "character": 2 },
          "end": { "line": 51, "character": 3 }
        },
        "oldText": "getUser(id: string) {\n    const user = await this.db.findById(id);\n    return user;\n  }",
        "newText": "getUser(id: string) {\n  return this.cache.get(id) ?? this.api.get(id);\n}",
        "linesReplaced": 27
      }
    ],
    "totalEdits": 1
  },
  "meta": {
    "scriptName": "code.replace-method",
    "durationMs": 28,
    "resolvedVia": "flowspaceId"  // or "symbolName"
  }
}
```

**Implementation Steps**:

1. **Symbol Resolution Layer** (reuses utility):
   ```typescript
   // Utility: SymbolResolver (shared)
   async function resolveSymbol(params: ReplaceMethodParams): Promise<{ uri: Uri, position: Position, symbol: DocumentSymbol }> {
     if (params.nodeId) {
       return await resolveFromFlowspaceId(params.nodeId);
     } else if (params.symbol && params.path) {
       return await resolveFromSymbolName(params.path, params.symbol);
     }
     throw new Error('Must provide nodeId or symbol+path');
   }
   ```

2. **Determine Target Range**:
   ```typescript
   // For replace-node: use full symbol range
   // For replace-body: extract body range (trim braces/signature)
   const range = params.mode === 'replace-body'
     ? extractBodyRange(resolvedSymbol.symbol, document)
     : resolvedSymbol.symbol.range;

   // Body extraction heuristic (language-agnostic):
   function extractBodyRange(symbol: DocumentSymbol, document: TextDocument): Range {
     // Find opening brace after symbol name
     const symbolEnd = symbol.range.start;
     const text = document.getText(new Range(symbolEnd, symbol.range.end));
     const openBrace = text.indexOf('{');
     const closeBrace = text.lastIndexOf('}');

     if (openBrace === -1 || closeBrace === -1) {
       throw new Error('Cannot extract body - no braces found');
     }

     // Return range inside braces (excluding braces themselves)
     const bodyStart = document.positionAt(document.offsetAt(symbolEnd) + openBrace + 1);
     const bodyEnd = document.positionAt(document.offsetAt(symbolEnd) + closeBrace);
     return new Range(bodyStart, bodyEnd);
   }
   ```

3. **Get Old Text**:
   ```typescript
   const document = await vscode.workspace.openTextDocument(uri);
   const oldText = document.getText(range);
   ```

4. **Build and Apply Edit**:
   ```typescript
   const edit = new vscode.WorkspaceEdit();
   edit.replace(uri, range, params.replacement);

   const success = await vscode.workspace.applyEdit(edit);

   if (!success) {
     throw new Error('Failed to apply method replacement');
   }
   ```

5. **Return Detailed Summary**:
   ```typescript
   return {
     symbol: {
       name: resolvedSymbol.symbol.name,
       kind: SymbolKind[resolvedSymbol.symbol.kind],
       container: resolvedSymbol.symbol.containerName,
       nodeId: params.nodeId || generateFlowspaceId(uri, resolvedSymbol.symbol)
     },
     mode: params.mode || 'replace-node',
     applied: success,
     changes: [{
       uri: uri.toString(),
       file: vscode.workspace.asRelativePath(uri),
       range: formatRange(range),
       oldText,
       newText: params.replacement,
       linesReplaced: range.end.line - range.start.line + 1
     }],
     totalEdits: 1
   };
   ```

**Error Handling**:
- `E_INVALID_NODE_ID`: Flowspace ID format is invalid
- `E_FILE_NOT_FOUND`: File in nodeId/path doesn't exist
- `E_SYMBOL_NOT_FOUND`: Symbol not found in document outline
- `E_SYMBOL_NOT_METHOD`: Symbol is not a method/function (wrong kind)
- `E_BODY_EXTRACTION_FAILED`: Cannot extract body (no braces found)
- `E_AMBIGUOUS_SYMBOL`: Multiple symbols match (e.g., overloaded methods)
- `E_REPLACEMENT_FAILED`: Failed to apply the edit

**Complexity Notes**:
- `replace-body` requires language-agnostic heuristics (find braces)
- May not work perfectly for all languages (Python uses colons, not braces)
- Should handle multiple matches (overloaded methods) by returning error with choices
- Body extraction is best-effort; may fail for unusual syntax

**Consolidation Decision**: **Keep as separate tool**
- Unique use case (method-level editing)
- Different from symbol rename (local edit vs workspace-wide)
- Different from text replace (semantic vs pattern matching)

**Implementation Effort**: 🔴 High
- Reuses SymbolResolver utility
- Body range extraction requires heuristics
- Language-specific edge cases to handle
- Overload detection and error messaging

**Dependencies**:
- Shared `SymbolResolver` utility (same as Find References)
- Flowspace ID parser (shared module)
- Body range extraction utility (new, language-aware)

---

### Category 5: Workspace Editing Primitives ⏸️ **ALL SKIPPED - NOT NEEDED**

#### 5.1 Apply Workspace Edits ⏸️ **SKIPPED**

**Decision**: **SKIPPED** - Low-level primitive not needed for initial release.

**Rationale**: LLMs can construct edits via higher-level tools (rename, replace method, etc.)

---

#### 5.2 Format Document/Range ⏸️ **SKIPPED**

**Decision**: **SKIPPED** - Not critical for LSP navigation features.

**Rationale**: AI agents can request formatting via editor actions; not core to semantic navigation

---

#### 5.3 Organize Imports ⏸️ **SKIPPED**

**Decision**: **SKIPPED** - Not critical for initial release.

**Rationale**: Minor code hygiene feature; can be added later if needed

---

### Category 6: Code Actions ⏸️ **User: NOT NEEDED**

#### 6.1 List Code Actions

**What it does**: Discover all Quick Fixes, Refactorings, and Source Actions available at a location. Lets LLM choose from IDE's suggestions.

**Current Status**: ❌ Not implemented

**User Feedback**: ⏸️ **Not needed** - Skipping per user request

**Use Cases** (for reference):
- "What refactorings are available for this code?"
- "Show me Quick Fixes for this error"
- Discover "Extract Method", "Extract Variable", etc.

**Proposed Parameters**:
```typescript
{
  path: string,
  line: number,
  character: number,
  range?: Range,           // Optional selection range
  only?: string            // Filter by kind (e.g., "refactor.extract")
}
```

**VS Code Implementation**:
```typescript
const actions = await vscode.commands.executeCommand(
  'vscode.executeCodeActionProvider',
  uri,
  range,
  kind
);

return actions.map(a => ({
  title: a.title,
  kind: a.kind,
  isPreferred: a.isPreferred
}));
```

**Status**: ⏸️ **SKIP** - Not implementing per user feedback

**Implementation Effort**: 🟢 Low (if we were to implement)

---

### Category 7: Advanced Navigation

#### 7.1 Call Hierarchy ✅ **APPROVED FOR IMPLEMENTATION**

**What it does**: Show incoming callers or outgoing callees of a function. Deeper navigation than find-references - understand call chains and dependencies.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "What functions call `UserService.getUser()`?" (incoming callers)
- "What functions does `UserController.createUser()` call?" (outgoing callees)
- Understanding call chains and dependency flows
- Analyzing function impact and usage patterns

**Key Innovation**: **Semantic input via Flowspace IDs** - No need to know exact cursor positions!

**Proposed Parameters**:
```typescript
{
  // PRIMARY INPUT: Flowspace Node ID (recommended)
  nodeId?: string,           // e.g., "method:src/user/UserService.ts:UserService.getUser"

  // ALTERNATIVE INPUT: Symbol name + path
  path?: string,             // File containing the function/method
  symbol?: string,           // Qualified symbol name (e.g., "UserService.getUser")

  // REQUIRED
  direction: "incoming" | "outgoing"  // Incoming callers or outgoing callees
}
```

**Input Validation**:
- Must provide EITHER `nodeId` OR (`path` + `symbol`)
- `nodeId` takes precedence if both provided
- `direction` is always required

**Example MCP Call - Flowspace ID (Preferred)**:
```json
{
  "tool": "hierarchy_calls",
  "params": {
    "nodeId": "method:src/user/UserService.ts:UserService.getUser",
    "direction": "incoming"
  }
}
```

**Example MCP Call - Symbol Name**:
```json
{
  "tool": "hierarchy_calls",
  "params": {
    "path": "src/user/UserService.ts",
    "symbol": "UserService.getUser",
    "direction": "incoming"
  }
}
```

**Example Response - Incoming Calls**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": {
    "symbol": {
      "name": "getUser",
      "kind": "Method",
      "container": "UserService",
      "nodeId": "method:src/user/UserService.ts:UserService.getUser"
    },
    "direction": "incoming",
    "calls": [
      {
        "caller": {
          "name": "getUser",
          "kind": "Method",
          "container": "UserController",
          "uri": "file:///workspace/src/user/UserController.ts",
          "file": "src/user/UserController.ts",
          "range": {
            "start": { "line": 30, "character": 2 },
            "end": { "line": 45, "character": 3 }
          },
          "nodeId": "method:src/user/UserController.ts:UserController.getUser"
        },
        "callSites": [
          {
            "line": 35,
            "character": 12,
            "range": {
              "start": { "line": 35, "character": 12 },
              "end": { "line": 35, "character": 22 }
            },
            "preview": "    const user = await this.userService.getUser(id);"
          }
        ]
      },
      {
        "caller": {
          "name": "getUserProfile",
          "kind": "Function",
          "uri": "file:///workspace/src/api/users.ts",
          "file": "src/api/users.ts",
          "range": {
            "start": { "line": 18, "character": 0 },
            "end": { "line": 28, "character": 1 }
          },
          "nodeId": "function:src/api/users.ts:getUserProfile"
        },
        "callSites": [
          {
            "line": 22,
            "character": 18,
            "range": {
              "start": { "line": 22, "character": 18 },
              "end": { "line": 22, "character": 28 }
            },
            "preview": "  return await userService.getUser(userId);"
          }
        ]
      }
    ],
    "total": 2
  },
  "meta": {
    "scriptName": "hierarchy.calls",
    "durationMs": 31,
    "resolvedVia": "flowspaceId"  // or "symbolName"
  }
}
```

**Example Response - Outgoing Calls**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": {
    "symbol": {
      "name": "createUser",
      "kind": "Method",
      "container": "UserController",
      "nodeId": "method:src/user/UserController.ts:UserController.createUser"
    },
    "direction": "outgoing",
    "calls": [
      {
        "callee": {
          "name": "validateInput",
          "kind": "Function",
          "uri": "file:///workspace/src/utils/validation.ts",
          "file": "src/utils/validation.ts",
          "range": {
            "start": { "line": 10, "character": 0 },
            "end": { "line": 15, "character": 1 }
          },
          "nodeId": "function:src/utils/validation.ts:validateInput"
        },
        "callSites": [
          {
            "line": 42,
            "character": 8,
            "range": {
              "start": { "line": 42, "character": 8 },
              "end": { "line": 42, "character": 21 }
            },
            "preview": "    validateInput(userData);"
          }
        ]
      },
      {
        "callee": {
          "name": "save",
          "kind": "Method",
          "container": "UserService",
          "uri": "file:///workspace/src/user/UserService.ts",
          "file": "src/user/UserService.ts",
          "range": {
            "start": { "line": 60, "character": 2 },
            "end": { "line": 68, "character": 3 }
          },
          "nodeId": "method:src/user/UserService.ts:UserService.save"
        },
        "callSites": [
          {
            "line": 44,
            "character": 28,
            "range": {
              "start": { "line": 44, "character": 28 },
              "end": { "line": 44, "character": 32 }
            },
            "preview": "    const newUser = await this.userService.save(userData);"
          }
        ]
      }
    ],
    "total": 2
  },
  "meta": {
    "scriptName": "hierarchy.calls",
    "durationMs": 45,
    "resolvedVia": "symbolName"
  }
}
```

**Implementation Steps**:

1. **Symbol Resolution Layer** (reuses utility):
   ```typescript
   // Utility: SymbolResolver (shared)
   async function resolveSymbol(params: CallHierarchyParams): Promise<{ uri: Uri, position: Position, symbol: DocumentSymbol }> {
     if (params.nodeId) {
       return await resolveFromFlowspaceId(params.nodeId);
     } else if (params.symbol && params.path) {
       return await resolveFromSymbolName(params.path, params.symbol);
     }
     throw new Error('Must provide nodeId or symbol+path');
   }
   ```

2. **Prepare Call Hierarchy** (get hierarchy items):
   ```typescript
   const items = await vscode.commands.executeCommand(
     'vscode.prepareCallHierarchy',
     resolvedSymbol.uri,
     resolvedSymbol.position
   );

   if (!items || items.length === 0) {
     throw new Error('Call hierarchy not supported for this symbol/language');
   }

   const hierarchyItem = items[0];  // Use first item
   ```

3. **Get Calls** (incoming or outgoing):
   ```typescript
   const callItems = params.direction === 'incoming'
     ? await vscode.commands.executeCommand(
         'vscode.provideIncomingCalls',
         hierarchyItem
       )
     : await vscode.commands.executeCommand(
         'vscode.provideOutgoingCalls',
         hierarchyItem
       );

   if (!callItems) {
     return { calls: [], total: 0 };
   }
   ```

4. **Enrich Response** (add Flowspace IDs and previews):
   ```typescript
   const enrichedCalls = await Promise.all(
     callItems.map(async (callItem) => {
       // For incoming: callItem.from is the caller
       // For outgoing: callItem.to is the callee
       const targetItem = params.direction === 'incoming' ? callItem.from : callItem.to;

       // Get symbol at target location
       const targetSymbol = await getSymbolAtPosition(
         targetItem.uri,
         targetItem.range.start
       );

       // Get preview text for each call site
       const callSites = await Promise.all(
         callItem.fromRanges.map(async (range) => {
           const preview = await getLinePreview(targetItem.uri, range.start.line);
           return {
             line: range.start.line + 1,  // 1-indexed
             character: range.start.character,
             range: formatRange(range),
             preview
           };
         })
       );

       return {
         [params.direction === 'incoming' ? 'caller' : 'callee']: {
           name: targetItem.name,
           kind: SymbolKind[targetItem.kind],
           container: targetSymbol?.containerName,
           uri: targetItem.uri.toString(),
           file: vscode.workspace.asRelativePath(targetItem.uri),
           range: formatRange(targetItem.range),
           nodeId: targetSymbol ? generateFlowspaceId(targetItem.uri, targetSymbol) : undefined
         },
         callSites
       };
     })
   );

   return {
     calls: enrichedCalls,
     total: enrichedCalls.length
   };
   ```

**Error Handling**:
- `E_INVALID_NODE_ID`: Flowspace ID format is invalid
- `E_FILE_NOT_FOUND`: File in nodeId/path doesn't exist
- `E_SYMBOL_NOT_FOUND`: Symbol not found in document outline
- `E_NO_CALL_HIERARCHY`: Language server doesn't support call hierarchy
- `E_NOT_CALLABLE`: Symbol is not a function/method (wrong kind)
- `E_INVALID_DIRECTION`: Direction must be "incoming" or "outgoing"

**Language Support Note**: Not all languages support call hierarchy. TypeScript, Python, Java, C++, Go typically do. Return graceful error (`E_NO_CALL_HIERARCHY`) for unsupported languages.

**Consolidation Decision**: **Keep as separate tool**
- Specialized navigation feature
- Different from references (shows call structure, not all usages)
- Two-way operation (incoming vs outgoing)
- Unique call site information

**Implementation Effort**: 🟡 Medium
- Reuses SymbolResolver utility
- Two-step VS Code process (prepare + provide)
- Response enrichment (symbols + previews + Flowspace IDs)
- Language support detection

**Dependencies**:
- Shared `SymbolResolver` utility (same as Find References)
- Flowspace ID parser (shared module)
- Symbol-to-Flowspace-ID generator utility
- Line preview utility (shared)

---

### Category 8: Workspace Discovery ⏸️ **SKIPPED**

#### 8.1 Workspace File Listing ⏸️ **SKIPPED - NOT NEEDED**

**What it does**: Glob-based file discovery. Fast way to find files matching patterns.

**Current Status**: ❌ Not implemented

**Decision**: **SKIPPED** - Not needed for initial LSP features release.

**Rationale**:
- AI agents already have file listing capabilities (Glob tool in Claude Code)
- Not an LSP/semantic feature
- Can be added later if specific use case emerges
- Focus on semantic navigation features where we add unique value

**Implementation Effort**: 🟢 Low - Single VS Code API call (if we decide to add later)

---

## Special Consideration: Document Outline Extension 🔥 **P3**

**User Request**: Extend `search.symbol-search` document mode to support **markdown and other file types** beyond code.

### Current State
`search.symbol-search` with `mode: "document"` currently works for:
- Languages with DocumentSymbolProvider (TS, JS, Python, etc.)

### Enhancement Needed
Support markdown outlines:
- H1/H2/H3 headers as symbols
- Nested structure (H2 under H1, etc.)
- Works with VS Code's markdown outline

### Implementation Path
Already supported! VS Code provides DocumentSymbolProvider for markdown:
- No code changes needed
- Just document that it works with markdown
- Test with `.md` files

**Test Cases to Add**:
```json
// Test: Markdown outline
{
  "tool": "search_symbol_search",
  "params": {
    "mode": "document",
    "path": "/workspace/README.md"
  }
}
// Should return: Headers as symbols with hierarchy
```

**Implementation Effort**: 🟢 None - Already works, just needs testing/documentation

---

## ✅ **FINAL DECISION: Option A - Maximum Consolidation**

### Approved Tools (4 new MCP tools)

**Based on user decision: Maximum consolidation**

```
1. symbol.navigate - Consolidated navigation (references, implementations)
2. symbol.rename - Workspace-wide rename
3. code.replace-method - Method-level editing
4. hierarchy.calls - Call hierarchy (incoming/outgoing)
```

**MCP Impact**: +4 tools (41 → 45 total)

### Tool Breakdown

#### 1. `symbol.navigate` (consolidated)
**Consolidates**:
- Find References (with `action: "references"`)
- Find Implementations (with `action: "implementations"`)
- ~~Type Definition~~ (SKIPPED - not needed)

**Parameters**:
```typescript
{
  nodeId?: string,
  path?: string,
  symbol?: string,
  action: "references" | "implementations",
  includeDeclaration?: boolean  // Only for references
}
```

#### 2. `symbol.rename` (standalone)
Workspace-wide symbol rename with Flowspace ID support

#### 3. `code.replace-method` (standalone)
Method/function body or node replacement with Flowspace ID support

#### 4. `hierarchy.calls` (standalone)
Call hierarchy with incoming/outgoing direction

---

## Consolidation Rationale

**Why consolidate references + implementations?**
- Same input format (nodeId or path+symbol)
- Same output format (list of locations)
- Only difference is `action` parameter
- Reduces tool count while maintaining clarity
- `includeDeclaration` is action-specific (only for references)

**Why keep rename, replace-method, hierarchy separate?**
- **Rename**: Different return type (workspace edit summary vs locations)
- **Replace-method**: Unique parameters (`replacement`, `mode`)
- **Hierarchy**: Unique structure (caller/callee relationships, call sites)

---

## Skipped Features Summary

### Option A Excludes These (from original catalog):
- ⏸️ Go-to-definition (covered by existing tools)
- ⏸️ Type definition (less common, can add later)
- ⏸️ Code search (AI agents have grep)
- ⏸️ Code replace text (AI agents can do find-replace)
- ⏸️ Workspace file listing (AI agents have Glob)
- ⏸️ Apply edits (low-level primitive)
- ⏸️ Format document (not critical)
- ⏸️ Organize imports (minor convenience)
- ⏸️ Code actions (user requested skip)

---

## Implementation Effort Matrix

| Feature | Effort | Why |
|---------|--------|-----|
| ~~Go-to-definition~~ | ⏸️ SKIPPED | Covered by `search.symbol-search` + `editor.goto-line` |
| Find references | 🟢 Low | Single VS Code command |
| Find implementations | 🟢 Low | Single VS Code command, needs unsupported language handling |
| Type definition | 🟢 Low | Single VS Code command |
| Symbol rename | 🟡 Medium | Need to parse/summarize WorkspaceEdit |
| Code search | 🟡 Medium | Streaming results, format output |
| Code replace | 🟡 Medium | Reuses search, builds WorkspaceEdit |
| Replace method | 🔴 High | Symbol tree traversal, range heuristics, overload handling |
| Apply edits | 🟢 Low | JSON → WorkspaceEdit conversion |
| Format | 🟢 Low | Single VS Code command |
| Organize imports | 🟢 Low | Single VS Code command or code action |
| ~~Code actions list~~ | ⏸️ SKIPPED | User requested skip |
| Call hierarchy | 🟡 Medium | Two-step process, unsupported language handling |
| Files list | 🟢 Low | Single VS Code API call |

---

## Recommendations for Review

### ✅ Definitely Implement (Priority 1 & 2)
Based on user priority and low effort:

1. **symbol.references.find** - Core navigation, low effort
2. **symbol.implementation.get** - Core navigation, low effort
3. **workspace.files.list** - P2, very low effort

### ⚠️ High Value, Moderate Effort
4. **code.search** - P3, frequently needed
5. **code.replace** (text mode) - P3, builds on search
6. **symbol.rename** - P1 refactoring, medium effort

### 🤔 Consider Based on Use Cases
7. **symbol.type-definition.get** - Less common, but trivial to add
8. **code.format** - Quality-of-life, very low effort
9. **code.replace.method** - High effort, specialized use case
10. **hierarchy.calls** - Advanced, not all languages

### ⏸️ Skip or Phase 2
- **Go-to-definition** (user confirmed skip - covered by existing tools)
- **Code actions** (user requested skip)
- Apply edits (low-level primitive, can add later)
- Organize imports (minor convenience)

---

## 📋 Final Implementation Summary

### ✅ **Approved: 4 New MCP Tools**

All tools support **Flowspace ID** and **symbol name** inputs (no legacy position inputs):

1. **`symbol.navigate`** 🟡 Medium effort
   - Action: `"references"` - Find all references to a symbol
   - Action: `"implementations"` - Find implementations of interfaces/abstract classes
   - Consolidates two navigation operations into one tool
   - Returns enriched locations with Flowspace IDs

2. **`symbol.rename`** 🟡 Medium effort
   - Workspace-wide LSP-powered symbol rename
   - Direct apply (no dry-run)
   - Returns detailed workspace edit summary

3. **`code.replace-method`** 🔴 High effort
   - Replace method body or entire declaration
   - Mode: `"replace-body"` or `"replace-node"`
   - Semantic targeting (no line numbers needed)

4. **`hierarchy.calls`** 🟡 Medium effort
   - Direction: `"incoming"` - Who calls this function?
   - Direction: `"outgoing"` - What does this function call?
   - Returns call hierarchy with Flowspace IDs

### 🔧 **Shared Infrastructure**

All tools require these shared utilities:

1. **SymbolResolver** - Resolve Flowspace IDs and symbol names to positions
2. **Flowspace ID Parser** - Parse and validate Flowspace IDs
3. **Flowspace ID Generator** - Generate IDs from symbols
4. **Line Preview Utility** - Get preview text for code locations
5. **WorkspaceEdit Summarizer** - Summarize edits for transparency

### 📊 **Impact**

- **New tools**: 4
- **Total MCP tools**: 41 → 45
- **Reusable utilities**: 5 new shared modules
- **Skipped features**: 9 (not needed for initial release)

### 🎯 **Next Steps**

1. ✅ Catalog review complete
2. ✅ Consolidation decision made
3. ⏭️ Update spec document with final decisions
4. ⏭️ Run `/plan-2-clarify` to resolve open questions
5. ⏭️ Create detailed implementation plan with phases
6. ⏭️ Begin implementation

