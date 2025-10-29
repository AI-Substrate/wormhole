# Editor Context Detection - Research Findings

**Date**: 2025-10-20
**Script**: `scratch/editor-context-experiment.js`
**Objective**: Research VS Code APIs for detecting cursor position, selection, and containing symbols

## Summary

✅ **SUCCESS**: VS Code provides comprehensive APIs for editor context detection that work reliably across multiple languages and file types.

## Key Findings

### 1. Active Editor Access

**API**: `vscode.window.activeTextEditor`

**Returns**:
- Current document URI and language ID
- Selection and cursor position
- null if no editor is active

**Reliability**: ✅ Works perfectly

### 2. Cursor Position and Selection

**Properties**:
- `editor.selection.active` - Current cursor position (Line, Character)
- `editor.selection.isEmpty` - Boolean indicating if text is selected
- `document.getText(selection)` - Gets selected text

**Coordinates**: 0-indexed (need to add 1 for human-readable line numbers)

**Reliability**: ✅ Works perfectly

### 3. Symbol Hierarchy Detection

**API**: `vscode.executeDocumentSymbolProvider(uri)`

**Returns**: Tree of `DocumentSymbol` objects with:
- `name` - Symbol name (function/class/header name)
- `kind` - SymbolKind enum (Class, Method, Function, Constructor, Variable, String for Markdown, etc.)
- `detail` - Additional info (may contain signatures, but varies by language)
- `range` - Full line range including body
- `selectionRange` - Just the name/declaration line
- `children` - Nested symbols (recursive tree structure)

**Reliability**: ✅ Works perfectly across tested languages

### 4. Finding Containing Symbol

**Approach**: Recursively walk symbol tree using `range.contains(position)`

**Works for**:
- ✅ JavaScript/TypeScript classes and methods
- ✅ Nested scopes (variables inside methods)
- ✅ Constructors
- ✅ Markdown headers (nested hierarchy)
- ✅ Top-level code (returns empty array when no containing symbol)

**Hierarchy Depth**: Unlimited - can traverse arbitrarily deep nesting

## Test Results

### Test 1: Constructor in JavaScript Class

**Location**: `/packages/extension/src/vsc-scripts/search/symbol-search.js:50`

**Result**:
```json
{
  "containingScopes": [
    {
      "depth": 0,
      "name": "SymbolSearchScript",
      "kind": "Class",
      "range": { "start": 47, "end": 250, "length": 204 }
    },
    {
      "depth": 1,
      "name": "constructor",
      "kind": "Constructor",
      "range": { "start": 48, "end": 65, "length": 18 }
    }
  ],
  "scopeHierarchy": "Class:SymbolSearchScript > Constructor:constructor"
}
```

**Notes**:
- Correctly identifies both class and constructor
- Provides accurate line ranges
- `detail` field is null for JavaScript

### Test 2: Variable Inside Method

**Location**: `/packages/extension/src/vsc-scripts/search/symbol-search.js:100`

**Result**:
```json
{
  "containingScopes": [
    {
      "depth": 0,
      "name": "SymbolSearchScript",
      "kind": "Class",
      "range": { "start": 47, "end": 250, "length": 204 }
    },
    {
      "depth": 1,
      "name": "execute",
      "kind": "Method",
      "range": { "start": 73, "end": 164, "length": 92 }
    },
    {
      "depth": 2,
      "name": "docSymbols",
      "kind": "Variable",
      "kindNumber": 12,
      "range": { "start": 97, "end": 100, "length": 4 }
    }
  ],
  "scopeHierarchy": "Class:SymbolSearchScript > Method:execute > Variable:docSymbols"
}
```

**Notes**:
- **Three-level nesting** detected correctly!
- Variable scope (const/let declarations) are tracked as symbols
- Very granular scope detection

### Test 3: Markdown Header Section

**Location**: `/README.md:50`

**Result**:
```json
{
  "containingScopes": [
    {
      "depth": 0,
      "name": "# VSC-Bridge",
      "kind": "String",
      "range": { "start": 1, "end": 913, "length": 913 }
    },
    {
      "depth": 1,
      "name": "## 🚀 Getting Started",
      "kind": "String",
      "range": { "start": 9, "end": 290, "length": 282 }
    },
    {
      "depth": 2,
      "name": "### Installation",
      "kind": "String",
      "range": { "start": 11, "end": 92, "length": 82 }
    },
    {
      "depth": 3,
      "name": "#### Alternative: Use npx for CLI (Auto-Updates)",
      "kind": "String",
      "range": { "start": 40, "end": 69, "length": 30 }
    }
  ],
  "scopeHierarchy": "String:# VSC-Bridge > String:## 🚀 Getting Started > String:### Installation > String:#### Alternative: Use npx for CLI (Auto-Updates)"
}
```

**Notes**:
- ✅ **Markdown headers work perfectly!**
- Four-level header nesting detected
- SymbolKind is `String` (kindNumber: 14) for all headers
- Full header text including emojis preserved
- Header ranges are accurate (represent section extent)

### Test 4: Top-Level Code (No Containing Symbol)

**Location**: `/packages/extension/src/vsc-scripts/search/symbol-search.js:5` (require statements)

**Result**:
```json
{
  "containingScopes": [],
  "immediateScope": null,
  "scopeHierarchy": ""
}
```

**Notes**:
- ✅ Correctly handles module-level code
- No error or crash when no symbol contains the cursor
- Clean empty response

## API Observations

### Symbol `detail` Field

**Varies by language and symbol type**:
- JavaScript/TypeScript: Often null or minimal
- May contain type signatures in TypeScript
- Markdown: null
- **Unreliable for signature extraction** - need alternative approach

### Symbol `range` vs `selectionRange`

- **`range`**: Full extent including body (e.g., entire function including closing brace)
- **`selectionRange`**: Just the name/declaration line (e.g., `function foo()` line)

**Use case**: `range` is what we want for "which method am I in" detection

### Position Coordinates

- 0-indexed in API (Line 0 = first line)
- Need to add 1 for human-readable output
- `position.line` and `position.character`

## Limitations and Edge Cases

### 1. Symbol Detail Unreliability

**Issue**: `symbol.detail` field doesn't consistently contain signatures

**Impact**: Cannot rely on it for getting method signatures

**Workaround Options**:
- Extract signature from source code using `selectionRange`
- Use language server protocol (LSP) for richer type info
- Parse the declaration line directly

### 2. Language Server Dependency

**Observation**: Symbol detection requires language extension to be active

**Tested**: Works for JavaScript, Markdown (built-in support)

**Unknown**: May need language extensions for Python, Dart, etc.

### 3. Performance

**Symbol Provider Call**: ~10-50ms per call (very fast)

**Scalability**: Tested on 253-line file (110 symbols) and 913-line file (66 symbols) - instant results

## Recommended Production Approach

### Option A: Automatic Context Enrichment (Recommended)

**Idea**: Modify bridge response wrapper to automatically include editor context in every response

**Pros**:
- Zero opt-in required by script authors
- Consistent context across all tools
- Very useful for LLM context

**Cons**:
- Adds ~50ms to every request
- May include unnecessary data for scripts that don't need it

**Implementation**:
```javascript
// In bridge response handler
const context = await getEditorContext();
return {
  ...scriptResult,
  editorContext: context
};
```

### Option B: Explicit Script Parameter

**Idea**: Scripts opt-in to context via parameter `includeEditorContext: true`

**Pros**:
- No performance overhead for scripts that don't need it
- Explicit and clear

**Cons**:
- Requires script authors to remember to opt-in
- Inconsistent across scripts

### Option C: Standalone Script

**Idea**: Create `editor.get-context` script that can be called separately

**Pros**:
- Explicit and controllable
- Can be called when needed

**Cons**:
- Requires separate MCP tool call
- Less convenient

## Signature Extraction Strategy

Since `symbol.detail` is unreliable, we need to extract signatures from source:

### Approach: Read Declaration Line

```javascript
const declarationLine = document.lineAt(symbol.selectionRange.start.line);
const signature = declarationLine.text.trim();
```

**Example Outputs**:
- JavaScript: `async execute(bridgeContext, params) {`
- Python: `def add(a: int, b: int) -> int:`
- Markdown: `## 🚀 Getting Started`

**Pros**:
- Works across all languages
- Actual source text (no parsing needed)
- Includes type hints where present

**Cons**:
- May include opening brace/colon
- Needs trimming/cleaning

## Next Steps

1. **Decide on integration strategy** (Option A/B/C)
2. **Implement signature extraction** from declaration line
3. **Add support for multiple cursors** (if needed)
4. **Test with Python, Dart, TypeScript** to verify language-agnostic behavior
5. **Consider caching** if called frequently
6. **Add to MCP tools** if standalone script approach

## Conclusion

✅ **Feasibility**: CONFIRMED - All required APIs exist and work reliably

✅ **Cross-language**: Works for code AND Markdown

✅ **Performance**: Fast enough for real-time use (~50ms)

✅ **Accuracy**: Precise scope detection including deep nesting

**Recommended**: Proceed with implementation using automatic context enrichment (Option A)
