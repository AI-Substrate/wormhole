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

#### 1.1 Find References

**What it does**: Find all places where a symbol is used across the entire workspace. Essential for refactoring and understanding impact.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Where is `UserService.getUser()` called?"
- "Show all usages of this variable"
- Safe refactoring (understand impact before changing)
- Finding dead code (no references = unused)

**Proposed Parameters**:
```typescript
{
  path: string,              // File containing the symbol
  line: number,              // 1-indexed line number
  character: number,         // 0-indexed character offset
  includeDeclaration: boolean  // Include the declaration itself? (default: true)
}
```

**Example MCP Call**:
```json
{
  "tool": "symbol_references_find",
  "params": {
    "path": "/workspace/src/user/UserService.ts",
    "line": 24,
    "character": 8,
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
  "data": [
    {
      "uri": "file:///workspace/src/user/UserController.ts",
      "range": {
        "start": { "line": 19, "character": 8 },
        "end": { "line": 19, "character": 18 }
      }
    },
    {
      "uri": "file:///workspace/src/admin/AdminController.ts",
      "range": {
        "start": { "line": 45, "character": 12 },
        "end": { "line": 45, "character": 22 }
      }
    }
  ],
  "meta": {
    "scriptName": "symbol.references.find",
    "durationMs": 22,
    "totalReferences": 2
  }
}
```

**VS Code Implementation**:
```typescript
const results = await vscode.commands.executeCommand(
  'vscode.executeReferenceProvider',
  uri,
  position,
  includeDeclaration
);
// Returns: Location[]
```

**Consolidation Options**:
- Could merge with definition/implementations into `symbol.navigate` with `action` parameter
- Unique parameter (`includeDeclaration`) suggests separate tool might be clearer

**Implementation Effort**: 🟢 Low - Single VS Code command, straightforward response

---

#### 1.2 Find Implementations

**What it does**: Jump to concrete implementations of interfaces or abstract methods. Critical for OOP codebases (TypeScript, Java, C#, Go).

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Show me all classes that implement `IUserRepository`"
- "What are the concrete implementations of this abstract method?"
- Understanding polymorphism and inheritance hierarchies

**Proposed Parameters**:
```typescript
{
  path: string,        // File containing the interface/abstract class
  line: number,        // 1-indexed line number
  character: number    // 0-indexed character offset
}
```

**Example MCP Call**:
```json
{
  "tool": "symbol_implementation_get",
  "params": {
    "path": "/workspace/src/types/IUserRepository.ts",
    "line": 10,
    "character": 9
  }
}
```

**Example Response**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": [
    {
      "uri": "file:///workspace/src/db/SqlUserRepository.ts",
      "range": {
        "start": { "line": 5, "character": 13 },
        "end": { "line": 5, "character": 30 }
      }
    },
    {
      "uri": "file:///workspace/src/cache/CachedUserRepository.ts",
      "range": {
        "start": { "line": 8, "character": 13 },
        "end": { "line": 8, "character": 33 }
      }
    }
  ],
  "meta": {
    "scriptName": "symbol.implementation.get",
    "durationMs": 18
  }
}
```

**VS Code Implementation**:
```typescript
const results = await vscode.commands.executeCommand(
  'vscode.executeImplementationProvider',
  uri,
  position
);
// Returns: Location[] or LocationLink[]
```

**Language Support Note**: Not all language servers support implementation providers. Should return graceful error for unsupported languages.

**Consolidation Options**:
- Very similar to definition/references - strong candidate for consolidation
- Could be `symbol.navigate` with `action: "implementation"`

**Implementation Effort**: 🟢 Low - Single VS Code command, handle unsupported languages gracefully

---

#### 1.3 Find Type Definition (Bonus)

**What it does**: Jump to the type definition of a symbol. Useful in TypeScript for "go to type" rather than "go to variable".

**Current Status**: ❌ Not implemented

**Use Cases**:
- "What is the type of this variable?" (jump to interface/type definition)
- Navigate from variable to its type definition
- Understand data structures in typed languages

**Proposed Parameters**:
```typescript
{
  path: string,        // File containing the symbol
  line: number,        // 1-indexed line number
  character: number    // 0-indexed character offset
}
```

**Example MCP Call**:
```json
{
  "tool": "symbol_type_definition_get",
  "params": {
    "path": "/workspace/src/user/UserController.ts",
    "line": 15,
    "character": 10
  }
}
```

**Example Response**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": [
    {
      "uri": "file:///workspace/src/types/User.ts",
      "range": {
        "start": { "line": 2, "character": 17 },
        "end": { "line": 2, "character": 21 }
      }
    }
  ],
  "meta": {
    "scriptName": "symbol.type-definition.get",
    "durationMs": 8
  }
}
```

**VS Code Implementation**:
```typescript
const results = await vscode.commands.executeCommand(
  'vscode.executeTypeDefinitionProvider',
  uri,
  position
);
// Returns: Location[] or LocationLink[]
```

**Language Support Note**: Primarily useful for TypeScript, Go, Rust, C++. May not be supported in all languages.

**Consolidation Options**:
- Natural fit for `symbol.navigate` with `action: "typeDefinition"`
- Least commonly used of the 4 navigation operations

**Implementation Effort**: 🟢 Low - Single VS Code command

---

### Category 2: Symbol Refactoring 🔥 **P1**

#### 2.0 Symbol Rename

**What it does**: LSP-powered, workspace-wide rename of symbols. Renames all references atomically with language awareness.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Rename `UserService` to `AccountService` everywhere"
- Safe refactoring with language-aware scope resolution
- Automatic handling of imports, exports, references

**Proposed Parameters**:
```typescript
{
  path: string,       // File containing the symbol to rename
  line: number,       // 1-indexed line number
  character: number,  // 0-indexed character offset
  newName: string,    // New name for the symbol
  apply: boolean      // Apply immediately (no dry-run, per user requirement)
}
```

**Example MCP Call**:
```json
{
  "tool": "symbol_rename",
  "params": {
    "path": "/workspace/src/user/UserService.ts",
    "line": 4,
    "character": 13,
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
    "applied": true,
    "changes": [
      {
        "uri": "file:///workspace/src/user/UserService.ts",
        "editCount": 1
      },
      {
        "uri": "file:///workspace/src/user/UserController.ts",
        "editCount": 3
      },
      {
        "uri": "file:///workspace/src/admin/AdminController.ts",
        "editCount": 2
      }
    ],
    "totalFiles": 3,
    "totalEdits": 6
  },
  "meta": {
    "scriptName": "symbol.rename",
    "durationMs": 125
  }
}
```

**VS Code Implementation**:
```typescript
// Get the workspace edit
const edit = await vscode.commands.executeCommand(
  'vscode.executeDocumentRenameProvider',
  uri,
  position,
  newName
);

// Apply it
const success = await vscode.workspace.applyEdit(edit);

// Return summary of changes
return { applied: success, changes: summarizeEdit(edit) };
```

**Safety Considerations**:
- User requested direct apply (no dry-run)
- Could fail if language server rejects rename (e.g., conflicts, invalid name)
- Should return clear error if rename not possible

**Consolidation Options**:
- Keep separate - complex operation distinct from navigation
- Different return type (workspace edit summary vs locations)

**Implementation Effort**: 🟡 Medium - Need to parse WorkspaceEdit and provide meaningful summary

---

### Category 3: Code Search & Replace 🔥 **P3**

#### 3.1 Code Search (Text/Regex)

**What it does**: Fast text or regex search across workspace using VS Code's ripgrep backend. Non-symbol search for patterns, TODOs, strings, etc.

**Current Status**: ❌ Not implemented (we have symbol search, not text search)

**Use Cases**:
- "Find all TODO comments"
- "Search for error message strings"
- "Find all places where we use the old API endpoint URL"
- Heuristic searches that don't involve symbols

**Proposed Parameters**:
```typescript
{
  query: string,              // Search query
  isRegex: boolean,           // Treat query as regex (default: false)
  matchCase: boolean,         // Case-sensitive search (default: false)
  wholeWord: boolean,         // Match whole words only (default: false)
  include?: string,           // Glob pattern for files to include (e.g., "src/**/*.ts")
  exclude?: string,           // Glob pattern for files to exclude (e.g., "**/node_modules/**")
  maxResults?: number         // Limit results (default: 500)
}
```

**Example MCP Call**:
```json
{
  "tool": "code_search",
  "params": {
    "query": "TODO:",
    "isRegex": false,
    "matchCase": false,
    "wholeWord": false,
    "include": "src/**/*.{ts,js}",
    "exclude": "**/node_modules/**",
    "maxResults": 100
  }
}
```

**Example Response**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": [
    {
      "uri": "file:///workspace/src/user/UserService.ts",
      "line": 88,
      "character": 4,
      "preview": "  // TODO: handle deactivated users"
    },
    {
      "uri": "file:///workspace/src/auth/AuthController.ts",
      "line": 145,
      "character": 6,
      "preview": "    // TODO: implement 2FA"
    }
  ],
  "meta": {
    "scriptName": "code.search",
    "durationMs": 38,
    "totalMatches": 2,
    "truncated": false
  }
}
```

**VS Code Implementation**:
```typescript
const results = [];

const query = {
  pattern: params.query,
  isRegExp: params.isRegex,
  isCaseSensitive: params.matchCase,
  isWordMatch: params.wholeWord
};

await vscode.workspace.findTextInFiles(
  query,
  {
    include: params.include,
    exclude: params.exclude,
    maxResults: params.maxResults,
    previewOptions: { matchLines: 1, charsPerLine: 200 }
  },
  (result) => {
    results.push({
      uri: result.uri.toString(),
      line: result.range.start.line,
      character: result.range.start.character,
      preview: result.preview.text
    });
  }
);

return results;
```

**Consolidation Options**:
- Keep separate - fundamentally different from symbol operations
- Different mental model (text matching vs semantic navigation)

**Implementation Effort**: 🟡 Medium - Need to handle streaming results, format output

---

#### 3.2 Code Replace (Text/Regex)

**What it does**: Multi-file find-and-replace with glob filtering. Atomic workspace edit.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Replace all `var` with `let` in TypeScript files"
- "Update old API endpoint URLs to new ones"
- "Fix typos across the codebase"
- Bulk refactoring of patterns

**Proposed Parameters**:
```typescript
{
  query: string,              // Search query
  replace: string,            // Replacement text
  isRegex: boolean,           // Treat query as regex (default: false)
  matchCase: boolean,         // Case-sensitive search (default: false)
  wholeWord: boolean,         // Match whole words only (default: false)
  include?: string,           // Glob pattern for files to include
  exclude?: string,           // Glob pattern for files to exclude
  apply: boolean              // Apply immediately (per user requirement)
}
```

**Example MCP Call**:
```json
{
  "tool": "code_replace",
  "params": {
    "query": "var ",
    "replace": "let ",
    "isRegex": false,
    "matchCase": false,
    "wholeWord": false,
    "include": "src/**/*.ts",
    "exclude": "**/{dist,node_modules}/**",
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
    "applied": true,
    "changes": [
      {
        "uri": "file:///workspace/src/utils/helpers.ts",
        "replacements": 5
      },
      {
        "uri": "file:///workspace/src/user/UserService.ts",
        "replacements": 12
      }
    ],
    "totalFiles": 2,
    "totalReplacements": 17
  },
  "meta": {
    "scriptName": "code.replace",
    "durationMs": 93
  }
}
```

**VS Code Implementation**:
```typescript
// 1. Find all matches (reuse code.search logic)
const matches = await findTextInFiles(...);

// 2. Build WorkspaceEdit
const edit = new vscode.WorkspaceEdit();
for (const match of matches) {
  edit.replace(match.uri, match.range, params.replace);
}

// 3. Apply edit
const success = await vscode.workspace.applyEdit(edit);

// 4. Return summary
return { applied: success, changes: summarizeEdit(edit) };
```

**Consolidation Options**:
- Could merge with "replace method" (below) via `mode` parameter
- OR keep separate (text vs semantic operations)

**Implementation Effort**: 🟡 Medium - Reuses search logic, adds workspace edit building

---

### Category 4: Method-Level Editing 🔥 **P3**

#### 4.1 Replace Method Body

**What it does**: Replace a method/function body by symbol name without manual line number calculation. Uses DocumentSymbolProvider to find the method.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Replace the implementation of `UserService.getUser()` with caching logic"
- Targeted refactoring of specific methods
- No need to compute exact line ranges

**Proposed Parameters**:
```typescript
{
  path: string,               // File containing the method
  selector: {
    kind: string,             // "method" | "function" | "class", etc.
    name: string              // Symbol name to find
  },
  replacement: string,        // New code (full method or just body)
  mode: "replace-body" | "replace-node",  // Body only or entire declaration
  apply: boolean              // Apply immediately
}
```

**Example MCP Call**:
```json
{
  "tool": "code_replace_method",
  "params": {
    "path": "/workspace/src/user/UserService.ts",
    "selector": {
      "kind": "method",
      "name": "getUser"
    },
    "replacement": "getUser(id: string) {\n  return this.cache.get(id) ?? this.api.get(id);\n}",
    "mode": "replace-node",
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
    "applied": true,
    "changes": [
      {
        "uri": "file:///workspace/src/user/UserService.ts",
        "range": {
          "start": { "line": 24, "character": 2 },
          "end": { "line": 51, "character": 3 }
        },
        "oldText": "getUser(id: string) {\n    // old implementation...",
        "newText": "getUser(id: string) {\n  return this.cache.get(id) ?? this.api.get(id);\n}"
      }
    ]
  },
  "meta": {
    "scriptName": "code.replace-method",
    "durationMs": 28
  }
}
```

**VS Code Implementation**:
```typescript
// 1. Get document symbols
const symbols = await vscode.commands.executeCommand(
  'vscode.executeDocumentSymbolProvider',
  uri
);

// 2. Find matching symbol by kind and name
const targetSymbol = findSymbol(symbols, params.selector);

if (!targetSymbol) {
  return fail(`Symbol not found: ${params.selector.name}`);
}

// 3. Determine range
const range = params.mode === 'replace-body'
  ? extractBodyRange(targetSymbol.range)  // Heuristic: trim outer braces
  : targetSymbol.range;

// 4. Build and apply edit
const edit = new vscode.WorkspaceEdit();
edit.replace(uri, range, params.replacement);
await vscode.workspace.applyEdit(edit);
```

**Complexity Note**:
- `replace-body` requires language-agnostic heuristics (trim braces/colons)
- May not work perfectly for all languages
- Should handle multiple matches (e.g., overloaded methods) by returning choices

**Consolidation Options**:
- Could merge with text replace via `mode` parameter
- Different enough to justify separate tool (symbol-based vs text-based)

**Implementation Effort**: 🔴 High - Requires symbol tree traversal, range extraction heuristics, overload handling

---

### Category 5: Workspace Editing Primitives

#### 5.1 Apply Workspace Edits

**What it does**: Generic primitive for applying a batch of edits across files. "Bring your own edit" - useful when LLM constructs the edit structure manually.

**Current Status**: ❌ Not implemented

**Use Cases**:
- Apply custom edits built by LLM
- Atomic multi-file changes
- Foundation for other refactoring operations

**Proposed Parameters**:
```typescript
{
  edit: {
    changes: Array<{
      uri: string,
      edits: Array<{
        range: {
          start: { line: number, character: number },
          end: { line: number, character: number }
        },
        newText: string
      }>
    }>
  },
  apply: boolean
}
```

**Example MCP Call**:
```json
{
  "tool": "code_apply_edits",
  "params": {
    "edit": {
      "changes": [
        {
          "uri": "file:///workspace/src/user/UserService.ts",
          "edits": [
            {
              "range": {
                "start": { "line": 10, "character": 0 },
                "end": { "line": 10, "character": 3 }
              },
              "newText": "const"
            }
          ]
        }
      ]
    },
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
    "applied": true,
    "filesChanged": 1,
    "totalEdits": 1
  },
  "meta": {
    "scriptName": "workspace.apply-edits",
    "durationMs": 15
  }
}
```

**VS Code Implementation**:
```typescript
// Convert JSON to WorkspaceEdit
const edit = new vscode.WorkspaceEdit();
for (const change of params.edit.changes) {
  const uri = vscode.Uri.parse(change.uri);
  for (const textEdit of change.edits) {
    const range = new vscode.Range(
      textEdit.range.start.line,
      textEdit.range.start.character,
      textEdit.range.end.line,
      textEdit.range.end.character
    );
    edit.replace(uri, range, textEdit.newText);
  }
}

// Apply
const success = await vscode.workspace.applyEdit(edit);
return { applied: success };
```

**Consolidation Options**:
- Could be base implementation for other editing tools
- Keep separate as low-level primitive

**Implementation Effort**: 🟢 Low - Straightforward JSON → WorkspaceEdit conversion

---

#### 5.2 Format Document/Range

**What it does**: Format code using the configured formatter (Prettier, ESLint, etc.). Respects user's VS Code formatter settings.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Format this messy file"
- Clean up after code generation
- Ensure consistent style

**Proposed Parameters**:
```typescript
{
  path: string,       // File to format
  range?: {           // Optional: format only a range
    start: { line: number, character: number },
    end: { line: number, character: number }
  },
  apply: boolean
}
```

**Example MCP Call**:
```json
{
  "tool": "code_format",
  "params": {
    "path": "/workspace/src/user/UserService.ts",
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
    "applied": true,
    "editsApplied": 15
  },
  "meta": {
    "scriptName": "code.format",
    "durationMs": 42
  }
}
```

**VS Code Implementation**:
```typescript
const edits = params.range
  ? await vscode.commands.executeCommand(
      'vscode.executeFormatRangeProvider',
      uri,
      range,
      options
    )
  : await vscode.commands.executeCommand(
      'vscode.executeFormatDocumentProvider',
      uri,
      options
    );

// Apply edits
const edit = new vscode.WorkspaceEdit();
edit.set(uri, edits);
await vscode.workspace.applyEdit(edit);
```

**Consolidation Options**:
- Could be part of `workspace.edit` with `action: "format"`
- OR keep separate (common operation)

**Implementation Effort**: 🟢 Low - Single VS Code command

---

#### 5.3 Organize Imports

**What it does**: Sort and remove unused imports using language server. Lightweight code hygiene.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "Clean up imports in this file"
- Remove unused imports automatically
- Sort imports alphabetically

**Proposed Parameters**:
```typescript
{
  path: string,       // File to organize imports in
  apply: boolean
}
```

**Example MCP Call**:
```json
{
  "tool": "code_organize_imports",
  "params": {
    "path": "/workspace/src/user/UserService.ts",
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
    "applied": true,
    "importsRemoved": 2,
    "importsSorted": true
  },
  "meta": {
    "scriptName": "code.organize-imports",
    "durationMs": 18
  }
}
```

**VS Code Implementation**:
```typescript
// Method 1: Via code action
const actions = await vscode.commands.executeCommand(
  'vscode.executeCodeActionProvider',
  uri,
  fullDocumentRange,
  'source.organizeImports'
);

if (actions && actions.length > 0) {
  await vscode.workspace.applyEdit(actions[0].edit);
}

// Method 2: Direct command (fallback)
await vscode.commands.executeCommand(
  'editor.action.organizeImports',
  uri
);
```

**Consolidation Options**:
- Could be part of code actions or workspace.edit
- Simple enough to justify standalone tool

**Implementation Effort**: 🟢 Low - Uses existing VS Code command

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

#### 7.1 Call Hierarchy

**What it does**: Show incoming callers or outgoing callees of a function. Deeper navigation than find-references.

**Current Status**: ❌ Not implemented

**Use Cases**:
- "What functions call `UserService.getUser()`?" (incoming)
- "What functions does `UserController.createUser()` call?" (outgoing)
- Understanding call chains and dependencies

**Proposed Parameters**:
```typescript
{
  path: string,
  line: number,
  character: number,
  direction: "incoming" | "outgoing"
}
```

**Example MCP Call**:
```json
{
  "tool": "hierarchy_calls",
  "params": {
    "path": "/workspace/src/user/UserService.ts",
    "line": 24,
    "character": 8,
    "direction": "incoming"
  }
}
```

**Example Response**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": [
    {
      "from": {
        "name": "UserController.getUser",
        "uri": "file:///workspace/src/user/UserController.ts",
        "range": {
          "start": { "line": 30, "character": 2 },
          "end": { "line": 45, "character": 3 }
        }
      },
      "fromRanges": [
        {
          "start": { "line": 35, "character": 12 },
          "end": { "line": 35, "character": 22 }
        }
      ]
    }
  ],
  "meta": {
    "scriptName": "hierarchy.calls",
    "durationMs": 31
  }
}
```

**VS Code Implementation**:
```typescript
// 1. Prepare call hierarchy
const items = await vscode.commands.executeCommand(
  'vscode.prepareCallHierarchy',
  uri,
  position
);

if (!items || items.length === 0) {
  return fail('Call hierarchy not supported for this symbol');
}

// 2. Get incoming or outgoing calls
const calls = params.direction === 'incoming'
  ? await vscode.commands.executeCommand(
      'vscode.provideIncomingCalls',
      items[0]
    )
  : await vscode.commands.executeCommand(
      'vscode.provideOutgoingCalls',
      items[0]
    );

return calls;
```

**Language Support Note**: Not all languages support call hierarchy. Need graceful error handling.

**Consolidation Options**:
- Keep separate - specialized feature
- Not commonly used enough to justify consolidation

**Implementation Effort**: 🟡 Medium - Two-step process (prepare + provide), handle unsupported languages

---

### Category 8: Workspace Discovery 🔥 **P2**

#### 8.1 Workspace File Listing

**What it does**: Glob-based file discovery. Fast way to find files matching patterns.

**Current Status**: ❌ Not implemented (we have symbol search, not file search)

**Use Cases**:
- "List all TypeScript files in src/"
- "Find all test files"
- "Show me all markdown documentation"
- Discover workspace structure

**Proposed Parameters**:
```typescript
{
  include: string,          // Glob pattern (e.g., "src/**/*.ts")
  exclude?: string,         // Exclude pattern (e.g., "**/node_modules/**")
  maxResults?: number       // Limit (default: 2000)
}
```

**Example MCP Call**:
```json
{
  "tool": "workspace_files_list",
  "params": {
    "include": "src/**/*.{ts,tsx}",
    "exclude": "**/{dist,node_modules}/**",
    "maxResults": 1000
  }
}
```

**Example Response**:
```json
{
  "ok": true,
  "status": "ok",
  "type": "result",
  "data": [
    { "uri": "file:///workspace/src/user/UserService.ts" },
    { "uri": "file:///workspace/src/user/UserController.ts" },
    { "uri": "file:///workspace/src/auth/AuthService.ts" }
  ],
  "meta": {
    "scriptName": "workspace.files.list",
    "durationMs": 21,
    "totalFiles": 3,
    "truncated": false
  }
}
```

**VS Code Implementation**:
```typescript
const files = await vscode.workspace.findFiles(
  params.include,
  params.exclude,
  params.maxResults
);

return files.map(uri => ({ uri: uri.toString() }));
```

**Consolidation Options**:
- Keep separate - fundamental workspace operation
- Different from symbol/code operations

**Implementation Effort**: 🟢 Low - Single VS Code API call

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

## Consolidation Options Summary

### Option A: Maximum Consolidation (5 tools)
```
1. symbol.navigate (references, implementations, typeDefinition)
2. symbol.rename
3. code.search
4. code.replace (text, method - via mode parameter)
5. workspace.files.list
```
**MCP Impact**: +5 tools (41 → 46 total)

---

### Option B: Moderate Consolidation (6-7 tools)
```
1. symbol.navigate (consolidates 3 operations: references, implementations, typeDefinition)
2. symbol.rename
3. code.search
4. code.replace.text
5. code.replace.method
6. workspace.files.list
7. code.format (optional)
8. hierarchy.calls (optional)
```
**MCP Impact**: +6-8 tools (41 → 47-49 total)

---

### Option C: Keep Separate (9-13 tools)
```
Symbol: references, implementations, typeDefinition, rename (4)
Code: search, replace.text, replace.method, format, organizeImports (5)
Workspace: files.list (1)
Advanced: hierarchy.calls, apply.edits (2)
```
**MCP Impact**: +9-12 tools (41 → 50-53 total)

**Note**: Go-to-definition removed - covered by existing `search.symbol-search` + `editor.goto-line`

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

## Next Steps

1. **Review this document** and mark which features you want
2. **Decide on consolidation** for features you selected
3. **Create implementation plan** with phases for approved features

**Questions to Consider**:
- Do we consolidate symbol navigation into one tool?
- Do we implement text and method replace as separate tools or unified?
- Do we skip high-effort features (replace method) for now?
- Any other features to add to the list?

