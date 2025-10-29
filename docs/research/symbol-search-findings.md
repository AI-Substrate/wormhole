# Symbol Search Dynamic Script - Research Findings

**Date**: 2025-10-20
**Script**: `scratch/symbol-search-experiment.js`

## Summary

Successfully created and tested a dynamic script that demonstrates VS Code's symbol search APIs. The script works with both workspace-wide symbol search (`vscode.executeWorkspaceSymbolProvider`) and document-level symbol outlines (`vscode.executeDocumentSymbolProvider`).

## Key Learnings

### 1. Dynamic Script Pattern

Dynamic scripts in vsc-bridge follow a simple pattern:

```javascript
module.exports = async function(bridgeContext, params) {
  const vscode = bridgeContext.vscode;

  // Use VS Code APIs
  const symbols = await vscode.commands.executeCommand(
    'vscode.executeWorkspaceSymbolProvider',
    query
  );

  return { success: true, data: symbols };
};
```

**Critical insights:**
- ✅ Use `bridgeContext.vscode` - never `require('vscode')`
- ✅ Return plain objects with `success` flag
- ✅ No need for base classes like `QueryScript` in dynamic scripts
- ✅ Parameters come as objects, all values are strings from CLI

### 2. VS Code Symbol Search APIs

#### Workspace Symbols (`vscode.executeWorkspaceSymbolProvider`)

**What it does**: Searches all indexed symbols across the entire workspace (same as `#` in command palette).

**Usage**:
```javascript
const symbols = await vscode.commands.executeCommand(
  'vscode.executeWorkspaceSymbolProvider',
  'queryString'
);
```

**Returns**: Array of `SymbolInformation` objects with:
- `name` - Symbol name
- `kind` - SymbolKind enum (0-25)
- `location.uri` - File URI
- `location.range` - Position in file
- `containerName` - Parent symbol name

**Example output**:
```json
{
  "name": "_remoteExecute(…)",
  "kind": "Method",
  "container": "_RemoteRunner",
  "location": {
    "file": "/usr/lib/dart/lib/isolate/isolate.dart",
    "line": 1102,
    "character": 2
  }
}
```

#### Document Symbols (`vscode.executeDocumentSymbolProvider`)

**What it does**: Gets hierarchical symbol outline for a single file (same as `@` in command palette).

**Usage**:
```javascript
const uri = vscode.Uri.file(filePath);
const symbols = await vscode.commands.executeCommand(
  'vscode.executeDocumentSymbolProvider',
  uri
);
```

**Returns**: Array of `DocumentSymbol` objects (hierarchical):
- `name` - Symbol name
- `kind` - SymbolKind enum
- `range` - Full symbol range
- `selectionRange` - Name range (for navigation)
- `children` - Nested symbols

**Note**: Document symbols are hierarchical (classes contain methods), while workspace symbols are flat.

### 3. SymbolKind Enum

Complete list of symbol types:

| Value | Name | Common Use |
|-------|------|------------|
| 0 | File | Top-level file |
| 1 | Module | Module/namespace |
| 2 | Namespace | Namespace declaration |
| 3 | Package | Package definition |
| 4 | Class | Class definition |
| 5 | Method | Class/instance method |
| 6 | Property | Class property |
| 7 | Field | Class field |
| 8 | Constructor | Constructor method |
| 9 | Enum | Enum type |
| 10 | Interface | Interface definition |
| 11 | Function | Standalone function |
| 12 | Variable | Variable declaration |
| 13 | Constant | Constant declaration |
| 14-20 | String, Number, Boolean, Array, Object, Key, Null | Primitive types |
| 21 | EnumMember | Enum member |
| 22 | Struct | Struct type |
| 23 | Event | Event handler |
| 24 | Operator | Operator overload |
| 25 | TypeParameter | Generic type parameter |

### 4. Test Results

#### Workspace Symbol Search
**Query**: `"execute"` with `kindFilter="Method"`

**Results**:
- Found: 17 methods across the workspace
- Sources: Dart SDK, pub packages, local files
- Performance: ~437ms

**Sample matches**:
- `_remoteExecute(…)` in `isolate.dart`
- `_executableElement(…)` in analyzer packages
- Methods from both Dart standard library and dependencies

#### Document Symbol Outline
**File**: `ScriptRegistry.ts`

**Results**:
- Total symbols: 97
- Breakdown:
  - 1 Class (ScriptRegistry)
  - 1 Constructor
  - 13 Methods
  - 45 Variables (local scope)
  - 33 Properties
  - 4 Functions

**Key observation**: Document symbols include local variables and nested scopes, providing complete code structure.

### 5. Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Workspace search (17 results) | ~437ms | Searches indexed symbols |
| Document outline (97 symbols) | ~83ms | Parses single file AST |
| First workspace search | ~2.9s | Initial indexing delay |

**Insight**: First workspace search is slower as VS Code builds/loads the symbol index. Subsequent searches are much faster (~400-500ms).

### 6. Filtering and Limits

The script supports:
- **Query filtering**: Fuzzy string matching (workspace mode)
- **Kind filtering**: Filter by symbol type (e.g., only Classes or Methods)
- **Limit**: Cap results to prevent overwhelming output
- **Statistics**: Auto-calculate counts by symbol kind

**Example**:
```bash
vscb script run --file scratch/symbol-search-experiment.js \
  --param query="Registry" \
  --param kindFilter="Class,Interface" \
  --param limit=10
```

### 7. Regex and Special Cases

#### Does it support regex?
**No** - The workspace symbol search uses fuzzy matching, not regex. The query string `"execute.*"` returns 0 results because it's looking for literal matches of that string, not a regex pattern.

**Fuzzy matching behavior**:
- Query `"execute"` finds methods like `_remoteExecute`, `_executableElement`, etc.
- No need for wildcards - partial matches work automatically
- Case-insensitive by default

#### Markdown File Support
**Yes!** ✅ Markdown files work excellently. Document symbols in `.md` files return all headers as `SymbolKind.String` (14).

**Example**: `README.md` symbols:
```json
{
  "total": 66,
  "byKind": { "String": 66 },
  "symbols": [
    { "name": "# VSC-Bridge", "container": null, "line": 1 },
    { "name": "## 🚀 Getting Started", "container": "# VSC-Bridge", "line": 9 },
    { "name": "### Installation", "container": "## 🚀 Getting Started", "line": 11 },
    { "name": "#### Recommended: Quick Install", "container": "### Installation", "line": 13 }
  ]
}
```

**Key features**:
- Headers maintain hierarchy (H2 nested under H1, H3 under H2, etc.)
- All header levels supported (# through ######)
- Includes emojis in header names
- Provides full document outline navigation

**Use cases**:
- Generate table of contents from document outline
- Navigate large documentation files
- Find specific sections in Markdown docs
- Analyze document structure

### 8. Practical Applications

Based on this research, symbol search would be useful for:

#### For AI Coding Agents
1. **Quick navigation** - "Find the UserService class"
2. **Code discovery** - "What methods exist in this class?"
3. **Workspace exploration** - "Show me all test functions"
4. **Reference finding** - Combined with definition/references APIs

#### For Production Implementation
Following the patterns in `docs/research/more-features.md`, we could create:

1. **`workspace.symbols.search`** - Built-in script for workspace-wide symbol search
2. **`document.symbols.outline`** - Built-in script for file outline
3. **MCP tool exposure** - Make symbols searchable via Model Context Protocol
4. **Integration with navigation** - Combine with goto-definition, find-references

### 8. Language Support

Symbol search works across all languages that have LSP support in VS Code:

**Tested languages** (via devcontainer):
- ✅ Dart (found symbols in standard library, pub packages, and local code)
- ✅ TypeScript (ScriptRegistry example showed full symbol hierarchy)

**Expected to work**:
- JavaScript, Python, Java, C#, Go, Rust, C++
- Any language with a VS Code language extension providing symbol providers

### 9. Next Steps

If we want to productionize this:

1. **Create built-in script** at `packages/extension/src/vsc-scripts/workspace/symbols-search.js`
2. **Add metadata** in `*.meta.yaml` with proper parameter schemas
3. **Update manifest** to expose via CLI and MCP
4. **Add tests** in `test/integration/scripts/`
5. **Document** in user-facing docs

**Effort estimate**: ~2-3 hours for complete implementation with tests.

## Example Usage

### Search for Classes
```bash
vscb script run --file scratch/symbol-search-experiment.js \
  --param query="Registry" \
  --param kindFilter="Class"
```

### Get File Outline
```bash
vscb script run --file scratch/symbol-search-experiment.js \
  --param mode="document" \
  --param path="/workspaces/vsc-bridge-devcontainer/packages/extension/src/core/registry/ScriptRegistry.ts"
```

### Find All Functions
```bash
vscb script run --file scratch/symbol-search-experiment.js \
  --param query="" \
  --param kindFilter="Function,Method" \
  --param limit=50
```

## References

- **VS Code API Docs**: [Built-in Commands](https://code.visualstudio.com/api/references/commands)
- **Implementation**: `scratch/symbol-search-experiment.js`
- **Feature ideas**: `docs/research/more-features.md`
- **Dynamic script examples**: `scripts/sample/dynamic/`
- **Dynamic script guide**: `scripts/sample/dynamic/README.md`
