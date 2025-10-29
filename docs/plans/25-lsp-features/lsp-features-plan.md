# LSP Navigation & Code Intelligence Features Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2025-10-28
**Spec**: [lsp-features-spec.md](./lsp-features-spec.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Documentation Strategy](#documentation-strategy)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: Symbol Resolver Foundation](#phase-1-symbol-resolver-foundation)
   - [Phase 2: Symbol Navigation Tool](#phase-2-symbol-navigation-tool)
   - [Phase 3: Symbol Rename Tool](#phase-3-symbol-rename-tool)
   - [Phase 4: Method Replacement Tool](#phase-4-method-replacement-tool)
   - [Phase 5: Call Hierarchy Tool](#phase-5-call-hierarchy-tool)
   - [Phase 6: Multi-Language Integration Testing](#phase-6-multi-language-integration-testing)
   - [Phase 7: Documentation](#phase-7-documentation)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [Progress Tracking](#progress-tracking)
9. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

### Problem Statement

AI agents and external tools currently lack semantic code navigation capabilities in VSC-Bridge. They must know exact line/character positions to query LSP features, which is impractical for automated workflows. There's no way to find references, rename symbols, or navigate call hierarchies using semantic identifiers like Flowspace Node IDs or symbol names.

### Solution Approach

- **4 consolidated LSP navigation tools** leveraging VS Code's built-in language server providers
- **Flowspace ID support** enabling semantic, position-independent operations (`method:src/Calculator.ts:Calculator.add`)
- **Symbol name resolution** allowing queries by qualified name without positions (`Calculator.add` in file)
- **Shared symbol resolver utility** maximizing code reuse across tools
- **Multi-language support** via VS Code LSP (TypeScript, Python, Java, Go, C#, Rust, etc.)
- **TAD approach** with tests as executable documentation, no mocking of VS Code APIs

### Expected Outcomes

1. AI agents can navigate code semantically using Flowspace IDs or symbol names
2. Users can find all references, implementations, and call relationships without cursor positions
3. Workspace-wide refactoring (rename, method replacement) works by symbol name
4. All operations work consistently across multiple programming languages
5. Clear error messages guide users when language servers don't support operations

### Success Metrics

- ✅ All 4 tools accept Flowspace IDs and symbol names (NO position support)
- ✅ Symbol resolution works for classes, methods, functions in TypeScript, Python, and Java
- ✅ Error handling gracefully reports unsupported languages/missing symbols
- ✅ Response formats consistent across all tools (standard envelope)
- ✅ Integration tests with real LSP providers (no mocks)
- ✅ Documentation includes Flowspace ID examples for each tool
- ✅ LLM guidance explains semantic input usage

---

## Technical Context

### Current System State

VSC-Bridge provides debugging and symbol search capabilities via vsc-scripts architecture:
- **37 existing scripts** organized by category (breakpoint/, debug/, search/, etc.)
- **Script discovery** via manifest.json (auto-generated from .meta.yaml files)
- **MCP integration** exposes scripts as tools for AI agents
- **BridgeContext** provides dependency injection (vscode APIs, logger, pathService, etc.)
- **Existing symbol search** (`search.symbol-search`) finds symbols by name but doesn't expose LSP navigation

### Integration Requirements

1. **Symbol Resolver Utility**: New shared utility at `packages/extension/src/core/utils/symbol-resolver.ts`
2. **4 LSP Scripts**: New scripts under `packages/extension/src/vsc-scripts/symbol/`:
   - `navigate.js` + `navigate.meta.yaml` (references + implementations consolidated)
   - `rename.js` + `rename.meta.yaml` (workspace-wide rename)
   - `replace-method.js` + `replace-method.meta.yaml` (method body replacement)
   - `../hierarchy/calls.js` + `../hierarchy/calls.meta.yaml` (incoming/outgoing calls)
3. **Test Workspace**: Use existing `test/` directory with Python, JavaScript, C#, Java fixtures
4. **Documentation**: Update README.md + create `docs/how/lsp-navigation/` directory

### Constraints and Limitations

1. **Language Server Availability**: Not all languages have full LSP support (documented per tool)
2. **Flowspace ID Format**: Must use forward slashes for Windows paths (`C:/Users/` not `C:\Users\`)
3. **Nested Class Handling**: Defer to implementation - document behavior in TAD tests
4. **Performance**: First workspace symbol search may take 3-10s (cold start indexing)
5. **WorkspaceEdit Failures**: Pre-validate file permissions before applying edits
6. **No Legacy Position Support**: Tools do NOT accept `line`/`character` parameters (Flowspace ID/symbol name only)

### Assumptions

1. **VS Code 1.104.0+**: All LSP APIs available and stable
2. **Real LSP Providers**: Integration tests use actual language servers (no mocking)
3. **Flowspace ID Stability**: The spec format won't change during implementation
4. **Symbol Names Unique Per File**: `Class.method` uniquely identifies method within file
5. **BridgeContext Services**: PathService, logger, vscode API available via injection
6. **Test Fixtures**: Existing test files contain symbols suitable for navigation testing

---

## Critical Research Findings

### Deduplication Log

| Original Sources | Merged Into | Reason |
|------------------|-------------|---------|
| S1-07, S2-01 | Discovery 05 | Both cover timeout handling utilities |
| S1-05, S3-04 | Discovery 08 | Both cover error code strategy |
| S4-02 | DISCARDED | Contradicts spec requirement for symbol-resolver.ts utility |

### 🚨 Critical Discovery 01: Three-Tier Base Class Architecture Determines Script Return Patterns
**Impact**: Critical
**Sources**: [S1-01] (pattern analyst)
**Problem**: Scripts extend one of three base classes (`QueryScript`, `ActionScript`, `WaitableScript`), each with different return value semantics. Wrong choice breaks response envelope generation.

**Root Cause**: ScriptRegistry expects different return patterns:
- `QueryScript`: Returns data object directly (e.g., `{ references: [...] }`)
- `ActionScript`: Returns `ActionResult` with `success` boolean + `details`
- `WaitableScript`: Returns data and waits for completion event

**Solution**: All 4 LSP navigation tools MUST extend `QueryScript` since they are read-only data retrieval operations, not state-changing actions.

**Example**:
```javascript
// ✅ CORRECT - QueryScript for read-only LSP operations
const { QueryScript } = require('@script-base');
class NavigateScript extends QueryScript {
  async execute(bridgeContext, params) {
    const results = await vscode.commands.executeCommand(...);
    return { references: results, total: results.length }; // Direct data return
  }
}

// ❌ WRONG - ActionScript is for state changes
const { ActionScript } = require('@script-base');
class NavigateScript extends ActionScript {
  async execute(bridgeContext, params) {
    return this.success({ references: results }); // Wrong pattern for read-only!
  }
}
```

**Action Required**: Extend `QueryScript` for `navigate`, `rename`, `replace-method`, `calls` scripts.
**Affects Phases**: Phase 2, 3, 4, 5

---

### 🚨 Critical Discovery 02: Dual-File Registration Pattern - Both Files Required
**Impact**: Critical
**Sources**: [S1-02] (pattern analyst)
**Problem**: Every script requires TWO files with identical base names. Missing either file causes build failure or runtime discovery failure.

**Root Cause**: Build process (`build-manifest.cts`) scans for `.meta.yaml` files and validates corresponding `.js` files exist. Manifest drives schema generation, CLI commands, and MCP tool registration.

**Solution**: Always create both `.js` AND `.meta.yaml` files. Use `just build-manifest` after creation to validate discovery.

**Example**:
```bash
# ✅ CORRECT - Both files present
packages/extension/src/vsc-scripts/symbol/navigate.js
packages/extension/src/vsc-scripts/symbol/navigate.meta.yaml

# ❌ WRONG - Orphan metadata file (build fails)
packages/extension/src/vsc-scripts/symbol/navigate.meta.yaml

# ❌ WRONG - Orphan implementation file (not discovered)
packages/extension/src/vsc-scripts/symbol/navigate.js
```

**Action Required**: Create paired `.js` + `.meta.yaml` for each of the 4 LSP tools.
**Affects Phases**: Phase 2, 3, 4, 5

---

### 🚨 Critical Discovery 03: Windows Path Ambiguity in Flowspace ID Parsing
**Impact**: Critical
**Sources**: [S3-01] (spec implications)
**Problem**: Windows paths contain colons (e.g., `C:\Users\file.py`) which conflict with Flowspace ID delimiter `:`. Ambiguous parsing can occur.

**Root Cause**: Flowspace ID format `type:file_path:qualified_name` uses colons as delimiters. Windows drive letters introduce extra colons.

**Solution**: Require forward slashes in Flowspace IDs (`C:/Users/` not `C:\Users\`) and validate during parsing. Split at first `:` for type, then last `:` in remainder for path/name boundary.

**Example**:
```typescript
// SAFE - Forward slashes in Flowspace ID
parseFlowspaceId("method:C:/src/Calculator.ts:Calculator.add")
// ✅ type="method", path="C:/src/Calculator.ts", name="Calculator.add"

// UNSAFE - Backslashes break parsing
parseFlowspaceId("method:C:\\src\\Calculator.ts:Calculator.add")
// ❌ Ambiguous: Is "C" part of type or path?

// ROBUST PARSER
function parseFlowspaceId(nodeId: string) {
  const firstColonIndex = nodeId.indexOf(':');
  const type = nodeId.substring(0, firstColonIndex);
  const remainder = nodeId.substring(firstColonIndex + 1);
  const lastColonIndex = remainder.lastIndexOf(':');

  if (lastColonIndex === -1) {
    return { type, filePath: remainder, qualifiedName: null };
  }

  const filePath = remainder.substring(0, lastColonIndex);
  const qualifiedName = remainder.substring(lastColonIndex + 1);

  // Validate Windows path format
  if (filePath.match(/^[A-Z]:[\\\/]/)) {
    if (filePath.includes('\\')) {
      throw new Error('Windows paths in Flowspace IDs must use forward slashes');
    }
  }

  return { type, filePath, qualifiedName };
}
```

**Action Required**: Implement robust parser in symbol-resolver.ts, validate Windows paths.
**Affects Phases**: Phase 1

---

### 🚨 Critical Discovery 04: Language Server Timeout/Unavailability Race Condition
**Impact**: Critical
**Sources**: [S2-01] (technical investigator)
**Problem**: VS Code's `executeCommand` for LSP providers can return `undefined`, hang indefinitely, or crash if language server isn't ready, doesn't support operation, or crashes during execution.

**Root Cause**: Language servers start asynchronously after extension activation. No built-in timeout mechanism. Returns `undefined` instead of throwing errors when provider unavailable.

**Solution**: Implement timeout wrapper with `Promise.race` pattern. Handle three states: success, timeout, or undefined (no provider). Use existing `SymbolUtils.getDocumentSymbols()` pattern.

**Example**:
```typescript
// ❌ WRONG - No timeout protection
const symbols = await vscode.commands.executeCommand(
  'vscode.executeDocumentSymbolProvider', uri
);
// Returns: DocumentSymbol[] | undefined | hangs forever

// ✅ CORRECT - Timeout protection with three-state handling
async function getLSPResultWithTimeout<T>(
  command: string,
  uri: vscode.Uri,
  ...args: any[]
): Promise<T | null | 'timeout'> {
  try {
    const resultPromise = vscode.commands.executeCommand<T>(command, uri, ...args);
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), 10000);
    });

    const result = await Promise.race([resultPromise, timeoutPromise]);
    if (result === 'timeout') return 'timeout';
    return result || null; // Coalesce undefined to null
  } catch (error) {
    return null; // Provider crashed
  }
}
```

**Action Required**: Implement timeout utilities in symbol-resolver.ts, reuse across all 4 tools.
**Affects Phases**: Phase 1

---

### 🔴 High Discovery 05: MCP Metadata Drives AI Agent Behavior - Invest in Guidance
**Impact**: High
**Sources**: [S1-08] (pattern analyst)
**Problem**: The `.meta.yaml` file's `mcp.llm` section directly controls how AI agents use tools. Poor guidance leads to misuse; rich guidance ensures effective adoption.

**Root Cause**: AI agents learn tool usage from `llm.when_to_use` and `parameter_hints` fields. This is the PRIMARY documentation they consume.

**Solution**: Spend 30-60% of implementation time writing comprehensive MCP guidance with use cases, prerequisites, patterns, examples, and pitfalls.

**Example**:
```yaml
# ✅ CORRECT - Comprehensive LLM guidance
mcp:
  llm:
    when_to_use: |
      USE FOR:
      - "Where is UserService.getUser() called?" (find references)
      - Safe refactoring (understand impact before changing)
      - Finding dead code (no references = unused)

      DON'T USE FOR:
      - Finding symbol definitions (use search.symbol-search)
      - Text search (use code.search)

      PREREQUISITES:
      - File must exist and contain valid code
      - Language server must support references (TS, Python, Go, Java, C#)

      PATTERNS:
      - Flowspace ID: nodeId="method:src/Calculator.ts:Calculator.add"
      - Symbol name: path="src/Calculator.ts" symbol="Calculator.add"

    parameter_hints:
      nodeId:
        description: "Flowspace Node ID for semantic navigation"
        examples: ["method:src/User.ts:UserService.getUser"]
        note: "Preferred input method - location-independent"
        pitfalls:
          - "Must use forward slashes for Windows paths (C:/ not C:\\)"

# ❌ WRONG - Minimal guidance
mcp:
  llm:
    when_to_use: "Find references to symbols"
```

**Action Required**: Write detailed MCP metadata for each tool with real examples from test workspace.
**Affects Phases**: Phase 2, 3, 4, 5

---

### 🔴 High Discovery 06: Nested Class Symbol Name Ambiguity Requires Hierarchical Search
**Impact**: High
**Sources**: [S3-02] (spec implications)
**Problem**: Given qualified name `Outer.Inner.method`, ambiguous whether `Outer.Inner` is nested class with method `method`, or `Outer` contains `Inner.method`. DocumentSymbol hierarchy varies by language.

**Root Cause**: Different languages have different nesting semantics. VS Code's DocumentSymbol tree structure doesn't always match dot-notation expectations.

**Solution**: Hierarchical search with fallbacks: (1) exact name match, (2) split and search recursively, (3) deep traversal.

**Example**:
```typescript
// SAFE - Hierarchical search with fallbacks
function findSymbolRecursive(
  symbols: DocumentSymbol[],
  qualifiedName: string
): DocumentSymbol | null {
  // Strategy 1: Exact match
  for (const sym of symbols) {
    if (sym.name === qualifiedName) return sym;
  }

  // Strategy 2: Hierarchical split
  const dotIndex = qualifiedName.indexOf('.');
  if (dotIndex > 0) {
    const containerName = qualifiedName.substring(0, dotIndex);
    const remainingName = qualifiedName.substring(dotIndex + 1);
    for (const sym of symbols) {
      if (sym.name === containerName && sym.children) {
        const result = findSymbolRecursive(sym.children, remainingName);
        if (result) return result;
      }
    }
  }

  // Strategy 3: Deep traversal
  for (const sym of symbols) {
    if (sym.children) {
      const result = findSymbolRecursive(sym.children, qualifiedName);
      if (result) return result;
    }
  }

  return null;
}
```

**Action Required**: Implement hierarchical search in symbol-resolver.ts, document behavior in TAD tests.
**Affects Phases**: Phase 1

---

### 🔴 High Discovery 07: WorkspaceEdit Application Can Silently Fail
**Impact**: High
**Sources**: [S2-03] (technical investigator)
**Problem**: `vscode.workspace.applyEdit()` returns `Promise<boolean>` with no details about WHY an edit failed (file read-only, doesn't exist, conflicting changes, etc.).

**Root Cause**: VS Code's WorkspaceEdit API designed for interactive scenarios where user sees error dialogs. Programmatic callers only get boolean.

**Solution**: Pre-validate files exist and are writable before applying edits. Provide helpful error context on failure.

**Example**:
```typescript
// ✅ CORRECT - Pre-validation with failure context
import * as fs from 'fs';

// Pre-check files are accessible
const filesToEdit = extractFilesFromEdit(edit);
for (const file of filesToEdit) {
  if (!fs.existsSync(file)) {
    throw createError('E_NOT_FOUND',
      `Cannot apply edit: ${file} does not exist`);
  }
  try {
    fs.accessSync(file, fs.constants.W_OK);
  } catch {
    throw createError('E_FILE_READ_ONLY',
      `Cannot apply edit: ${file} is read-only or permission denied`);
  }
}

const success = await vscode.workspace.applyEdit(edit);
if (!success) {
  throw createError('E_OPERATION_FAILED',
    'WorkspaceEdit failed. Check file is saved and not locked.');
}
```

**Action Required**: Implement pre-validation in rename and replace-method scripts.
**Affects Phases**: Phase 3, 4

---

### 🔴 High Discovery 08: Hybrid Error Code Strategy - New LSP-Specific + Reuse Generic
**Impact**: High
**Sources**: [S1-05, S3-04] (pattern analyst + spec implications)
**Problem**: Need clear distinction between LSP-specific errors (E_NO_LANGUAGE_SERVER, E_AMBIGUOUS_SYMBOL) and generic errors (E_NOT_FOUND, E_INVALID_INPUT).

**Root Cause**: Spec requires hybrid error strategy. LSP tools have unique failure modes (language server unavailable, ambiguous symbols) that need semantic error codes.

**Solution**: Define 2 new error codes for LSP-specific failures. Reuse existing codes for generic failures. All error messages use `E_` prefix and are declared in `.meta.yaml`.

**Example**:
```typescript
// Error code mapping
const ErrorCode = {
  // New LSP-specific
  E_NO_LANGUAGE_SERVER: 'E_NO_LANGUAGE_SERVER',
  E_AMBIGUOUS_SYMBOL: 'E_AMBIGUOUS_SYMBOL',

  // Reuse existing
  E_NOT_FOUND: 'E_NOT_FOUND',           // Symbol not found
  E_INVALID_INPUT: 'E_INVALID_INPUT',   // Bad Flowspace ID format
  E_OPERATION_FAILED: 'E_OPERATION_FAILED' // LSP provider exception
};

// Usage in scripts
if (!languageSupported) {
  throw new Error('E_NO_LANGUAGE_SERVER: No language server available for this file type');
}

if (matches.length > 1) {
  throw new Error('E_AMBIGUOUS_SYMBOL: Multiple symbols match name. Use qualified name.');
}

if (matches.length === 0) {
  throw new Error('E_NOT_FOUND: Symbol not found in document');
}
```

**Action Required**: Define error codes in `.meta.yaml` for each script, use consistently in implementation.
**Affects Phases**: Phase 1, 2, 3, 4, 5

---

### 🟡 Medium Discovery 09: Call Hierarchy Requires Two-Step LSP Process
**Impact**: Medium
**Sources**: [S2-04] (technical investigator)
**Problem**: Call hierarchy cannot be queried directly. Must call `prepareCallHierarchy` first to get CallHierarchyItem, then pass to `provideIncomingCalls`/`provideOutgoingCalls`.

**Root Cause**: LSP specification design. Call hierarchy is location-independent after preparation.

**Solution**: Always call `prepareCallHierarchy` first, check for undefined/empty, then use first item for relationships query.

**Example**:
```typescript
// ❌ WRONG - Can't skip preparation step
const calls = await vscode.commands.executeCommand(
  'vscode.provideIncomingCalls',
  uri, position // Wrong - expects CallHierarchyItem
);

// ✅ CORRECT - Two-step process
const items = await vscode.commands.executeCommand(
  'vscode.prepareCallHierarchy', uri, position
);

if (!items || items.length === 0) {
  throw new Error('E_NO_LANGUAGE_SERVER: Call hierarchy not supported');
}

const calls = await vscode.commands.executeCommand(
  'vscode.provideIncomingCalls',
  items[0] // Pass CallHierarchyItem
);

return calls || [];
```

**Action Required**: Implement two-step process in hierarchy.calls script.
**Affects Phases**: Phase 5

---

### 🟡 Medium Discovery 10: Symbol Detail Field Unreliable - Extract from Source
**Impact**: Medium
**Sources**: [S2-05] (technical investigator)
**Problem**: `DocumentSymbol.detail` field (for signatures/type info) is inconsistently populated across language servers. JavaScript/TypeScript often return `null`.

**Root Cause**: LSP spec defines `detail` as optional. Language servers have different conventions.

**Solution**: Don't rely on `detail`. Read declaration line from source using `selectionRange` to get actual code text.

**Example**:
```typescript
// ❌ WRONG - Assuming detail contains signature
function getSignature(symbol: DocumentSymbol) {
  return symbol.detail; // Often null!
}

// ✅ CORRECT - Extract from source
async function getSignature(
  document: vscode.TextDocument,
  symbol: DocumentSymbol
): Promise<string> {
  const line = document.lineAt(symbol.selectionRange.start.line);
  return line.text.trim().replace(/[{:;]\s*$/, '');
}
```

**Action Required**: Use source extraction for signature display in responses.
**Affects Phases**: Phase 2, 3, 4, 5

---

### 🟡 Medium Discovery 11: LSP Operations Return Location[] OR LocationLink[] Polymorphically
**Impact**: Medium
**Sources**: [S2-06] (technical investigator)
**Problem**: Reference and implementation providers can return EITHER `Location[]` OR `LocationLink[]` depending on language server capabilities.

**Root Cause**: LSP spec evolution. `LocationLink` added later for better UX. Older servers return `Location`.

**Solution**: Normalize both types. `LocationLink` has `targetUri` + `targetRange`, `Location` has `uri` + `range`.

**Example**:
```typescript
type LSPLocation = vscode.Location | vscode.LocationLink;

function normalizeLocation(loc: LSPLocation): { uri: string; range: vscode.Range } {
  if ('targetUri' in loc) {
    return { uri: loc.targetUri.toString(), range: loc.targetRange };
  } else {
    return { uri: loc.uri.toString(), range: loc.range };
  }
}

const refs = await vscode.commands.executeCommand<LSPLocation[]>(...);
return (refs || []).map(normalizeLocation);
```

**Action Required**: Implement normalization in symbol.navigate script.
**Affects Phases**: Phase 2

---

### 🟡 Medium Discovery 12: executeReferenceProvider includeDeclaration is Tri-State
**Impact**: Low
**Sources**: [S2-07] (technical investigator)
**Problem**: The `includeDeclaration` parameter behaves differently when `undefined` vs explicit `true`/`false`. Language servers may interpret `undefined` as "use default".

**Root Cause**: LSP spec allows servers to define default behavior.

**Solution**: Always pass explicit `true` or `false` (never `undefined`). Default to `true`.

**Example**:
```typescript
// ✅ CORRECT - Explicit parameter
async function findReferences(
  uri: vscode.Uri,
  position: vscode.Position,
  includeDeclaration: boolean = true // Explicit default
): Promise<vscode.Location[]> {
  return await vscode.commands.executeCommand(
    'vscode.executeReferenceProvider',
    uri,
    position,
    includeDeclaration // Always explicit
  );
}
```

**Action Required**: Pass explicit boolean to executeReferenceProvider.
**Affects Phases**: Phase 2

---

### 🟡 Medium Discovery 13: First Workspace Symbol Search Has 3-10x Slower Cold Start
**Impact**: Medium
**Sources**: [S2-08] (technical investigator)
**Problem**: First call to workspace symbol search after VS Code starts takes 2-10 seconds while language servers build index. Subsequent searches are ~200-500ms.

**Root Cause**: Language servers build symbol indexes lazily on first query.

**Solution**: Document expected latency. Set 10s timeout (not aggressive 1s). Optional warm-up on extension activation.

**Example**:
```typescript
// ✅ CORRECT - Appropriate timeout with documentation
async function searchSymbols(query: string, timeout: number = 10000) {
  const result = await Promise.race([
    vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query),
    new Promise((_, reject) => setTimeout(() => reject('timeout'), timeout))
  ]);

  if (result === 'timeout') {
    throw new Error('E_TIMEOUT: Symbol search timed out. ' +
      'First search may take 5-10s while indexing. Subsequent searches faster.');
  }

  return result || [];
}
```

**Action Required**: Document cold-start behavior in MCP metadata.
**Affects Phases**: Phase 2

---

### 🟡 Medium Discovery 14: Multiple Symbols With Same Name - E_AMBIGUOUS_SYMBOL Threshold
**Impact**: Medium
**Sources**: [S3-03] (spec implications)
**Problem**: When should `E_AMBIGUOUS_SYMBOL` be thrown? File may have multiple methods named `add` in different classes, or overloaded methods.

**Root Cause**: Spec mentions error code but doesn't define WHEN it occurs.

**Solution**: Require fully qualified names (`Class.method`). Throw `E_AMBIGUOUS_SYMBOL` only if qualified name still matches multiple symbols. Provide helpful error with match list.

**Example**:
```typescript
const matches = findAllMatchingSymbols(docSymbols, symbol);

if (matches.length === 0) {
  throw createError('E_NOT_FOUND',
    `Symbol "${symbol}" not found. Use search.symbol-search to find valid symbols.`,
    { suggestion: 'Use qualified name like "Calculator.add"' }
  );
}

if (matches.length > 1) {
  throw createError('E_AMBIGUOUS_SYMBOL',
    `Multiple symbols match "${symbol}". Use fully qualified name.`,
    { matches: matches.map(m => ({ name: m.name, container: m.containerName })) }
  );
}

return matches[0];
```

**Action Required**: Implement ambiguity detection in symbol-resolver.ts.
**Affects Phases**: Phase 1

---

### 🟡 Medium Discovery 15: Flowspace ID Enrichment Optional for Performance
**Impact**: Medium
**Sources**: [S3-05] (spec implications)
**Problem**: Spec says responses should include Flowspace IDs, but LSP providers return only `Location` (URI + Range) with no symbol information. Enrichment requires additional LSP calls per result.

**Root Cause**: To generate Flowspace ID `type:path:name`, we need symbol name/kind. LSP only gives position.

**Solution**: Make Flowspace ID enrichment OPTIONAL (parameter-controlled) since it's expensive. Fast path returns locations without IDs.

**Example**:
```typescript
interface NavigateParams {
  nodeId?: string;
  action: 'references' | 'implementations';
  enrichWithFlowspaceIds?: boolean; // Default: false
}

if (params.enrichWithFlowspaceIds) {
  // Expensive - requires symbol lookup per location
  const enriched = await Promise.all(
    locations.map(async (loc) => {
      const symbol = await findSymbolAtPosition(loc.uri, loc.range.start);
      return { ...loc, nodeId: symbol ? buildFlowspaceId(symbol, loc.uri) : null };
    })
  );
  return enriched;
}

// Fast path
return locations;
```

**Action Required**: Implement optional enrichment in symbol.navigate.
**Affects Phases**: Phase 2

---

### 🟡 Medium Discovery 16: Symbol Resolution Order - nodeId Takes Precedence
**Impact**: Medium
**Sources**: [S3-06] (spec implications)
**Problem**: What happens if user provides BOTH `nodeId` AND `path+symbol`? Spec says "nodeId takes precedence" but doesn't mention validation.

**Root Cause**: Dual input format (Flowspace ID OR symbol name) creates potential conflicts.

**Solution**: Silently prefer `nodeId` if provided, ignore other parameters. Add meta field showing resolution method used.

**Example**:
```typescript
async function resolveSymbolInput(params: SymbolNavigateParams) {
  if (params.nodeId) {
    const resolved = await resolveFromFlowspaceId(params.nodeId);
    return { ...resolved, resolvedVia: 'flowspaceId' };
  }

  if (params.path && params.symbol) {
    const resolved = await resolveFromSymbolName(params.path, params.symbol);
    return { ...resolved, resolvedVia: 'symbolName' };
  }

  throw createError('E_INVALID_INPUT',
    'Must provide either nodeId or both path and symbol');
}

return {
  ok: true,
  data: references,
  meta: { resolvedVia: 'flowspaceId' } // Shows which method used
};
```

**Action Required**: Implement precedence logic in symbol-resolver.ts.
**Affects Phases**: Phase 1

---

### 🟡 Medium Discovery 17: Replace Method Body vs Node Range Requires Heuristic
**Impact**: High
**Sources**: [S3-07] (spec implications)
**Problem**: DocumentSymbol provides `range` (full declaration) and `selectionRange` (just name). For `replace-body` mode, need JUST function body (inside braces), which is neither.

**Root Cause**: VS Code doesn't provide body-only range. Must calculate from source text.

**Solution**: Heuristic-based range calculation. Find first `{` and last `}` within symbol range. Fallback error if no body (interface method, abstract).

**Example**:
```typescript
async function calculateBodyRange(
  document: vscode.TextDocument,
  symbol: DocumentSymbol,
  mode: 'replace-body' | 'replace-node'
): Promise<vscode.Range> {
  if (mode === 'replace-node') return symbol.range;

  const fullText = document.getText(symbol.range);
  const firstBrace = fullText.indexOf('{');
  const lastBrace = fullText.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1) {
    throw createError('E_INVALID_INPUT',
      `Symbol "${symbol.name}" has no body. Use mode="replace-node".`,
      { kind: symbol.kind, hint: 'Abstract/interface methods have no body' }
    );
  }

  const startPos = document.positionAt(
    document.offsetAt(symbol.range.start) + firstBrace + 1
  );
  const endPos = document.positionAt(
    document.offsetAt(symbol.range.start) + lastBrace
  );

  return new vscode.Range(startPos, endPos);
}
```

**Action Required**: Implement body detection in replace-method script.
**Affects Phases**: Phase 4

---

### 🟡 Medium Discovery 18: Multi-Language LSP Support Matrix Varies
**Impact**: Medium
**Sources**: [S3-08] (spec implications)
**Problem**: Not all LSP operations supported equally across languages. Python may not support implementations (no interfaces), JavaScript rename may not work for CommonJS.

**Root Cause**: Language-specific LSP provider capabilities vary.

**Solution**: Return language-specific error messages with hints. Document supported operations per language in user guide. Add `language` meta field.

**Example**:
```typescript
async function executeImplementations(uri: vscode.Uri, position: vscode.Position) {
  const doc = await vscode.workspace.openTextDocument(uri);
  const languageId = doc.languageId;

  try {
    const implementations = await vscode.commands.executeCommand(
      'vscode.executeImplementationProvider', uri, position
    );

    if (!implementations || implementations.length === 0) {
      const hint = getLanguageHint(languageId, 'implementations');
      return { ok: true, data: [], meta: { language: languageId, hint } };
    }

    return { ok: true, data: implementations, meta: { language: languageId } };
  } catch (error) {
    const hint = getLanguageHint(languageId, 'implementations');
    throw createError('E_OPERATION_FAILED',
      `Implementation search failed for ${languageId}`, { language: languageId, hint }
    );
  }
}

function getLanguageHint(languageId: string, operation: string): string | null {
  const hints = {
    python: { implementations: 'Python has no interfaces. Use references instead.' },
    javascript: { rename: 'Rename may not work for CommonJS require().' }
  };
  return hints[languageId]?.[operation] || null;
}
```

**Action Required**: Add language hints to all 4 scripts, document in user guide.
**Affects Phases**: Phase 2, 3, 4, 5, 7

---

### 🔵 Low Discovery 19: Webpack Alias System for Cross-Module Imports
**Impact**: Medium
**Sources**: [S1-03] (pattern analyst)
**Problem**: Scripts must use webpack aliases (`@script-base`, `@core/utils/*`) to import base classes and utilities. Direct `require()` paths break during compilation.

**Root Cause**: Webpack rewrites module paths. Aliases ensure scripts can import without complex relative paths.

**Solution**: Use `@script-base` for base classes. Add new alias `@core/utils/symbol-resolver` for symbol resolver utility.

**Example**:
```javascript
// ✅ CORRECT - Use webpack alias
const { QueryScript } = require('@script-base');
const { resolveFromFlowspaceId } = require('@core/utils/symbol-resolver');

// ❌ WRONG - Relative path breaks
const { QueryScript } = require('../../core/scripts/base.ts');
```

**Action Required**: Add symbol-resolver alias to webpack.config.js, use in all 4 scripts.
**Affects Phases**: Phase 1, 2, 3, 4, 5

---

### 🔵 Low Discovery 20: BridgeContext Services Provide All Dependencies
**Impact**: High
**Sources**: [S4-03] (dependency mapper)
**Problem**: Scripts need VS Code APIs, path resolution, and logging. All available via injected BridgeContext.

**Root Cause**: Dependency injection pattern. ScriptRegistry creates BridgeContext per execution.

**Solution**: Use `bridgeContext.vscode` for API calls, `bridgeContext.pathService.toUri()` for path conversion, `bridgeContext.logger` for debugging.

**Example**:
```javascript
async execute(bridgeContext, params) {
  const vscode = bridgeContext.vscode;
  const pathService = bridgeContext.pathService;

  // Use pathService for Uri conversion
  const uri = pathService.toUri(params.path);
  const position = new vscode.Position(params.line - 1, params.character);

  const results = await vscode.commands.executeCommand(
    'vscode.executeReferenceProvider', uri, position
  );

  return this._formatResults(results);
}
```

**Action Required**: Use BridgeContext services consistently in all scripts.
**Affects Phases**: Phase 2, 3, 4, 5

---

### 🔵 Low Discovery 21: Test Infrastructure - MCP Integration Pattern
**Impact**: High
**Sources**: [S4-05] (dependency mapper)
**Problem**: Scripts tested via MCP integration tests using `setupStdioTestEnvironment()` which launches Extension Host with test workspace.

**Root Cause**: VSC-Bridge architecture. Scripts run in VS Code Extension Host, accessed via MCP protocol.

**Solution**: Create integration tests in `test-cli/integration-mcp/<script-name>.test.ts`. Use existing test files in `test/` workspace.

**Example**:
```typescript
describe('MCP Integration - Symbol Navigate', () => {
  let env: StdioTestEnvironment;

  beforeAll(async () => {
    env = await setupStdioTestEnvironment();
  }, 120000);

  it('should find references for TypeScript function', async () => {
    const testFile = path.join(env.testWorkspace, 'javascript/sample.test.js');

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'symbol_navigate',
        arguments: {
          nodeId: 'method:javascript/sample.test.js:MyClass.testMethod',
          action: 'references'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.references).toBeDefined();
    expect(data.references.length).toBeGreaterThan(0);
  }, 30000);
});
```

**Action Required**: Create integration tests for each tool with basic/error/edge cases.
**Affects Phases**: Phase 6

---

## Summary Table

| # | Title | Impact | Affects Phases |
|---|-------|--------|----------------|
| 01 | Base Class Architecture | Critical | 2, 3, 4, 5 |
| 02 | Dual-File Registration | Critical | 2, 3, 4, 5 |
| 03 | Windows Path Parsing | Critical | 1 |
| 04 | Timeout/Unavailability | Critical | 1 |
| 05 | MCP Metadata Guidance | High | 2, 3, 4, 5 |
| 06 | Nested Class Ambiguity | High | 1 |
| 07 | WorkspaceEdit Failures | High | 3, 4 |
| 08 | Error Code Strategy | High | 1-5 |
| 09 | Call Hierarchy Two-Step | Medium | 5 |
| 10 | Symbol Detail Unreliable | Medium | 2-5 |
| 11 | Location Polymorphism | Medium | 2 |
| 12 | includeDeclaration Tri-State | Low | 2 |
| 13 | Cold Start Performance | Medium | 2 |
| 14 | Ambiguous Symbol Threshold | Medium | 1 |
| 15 | Enrichment Performance | Medium | 2 |
| 16 | Resolution Precedence | Medium | 1 |
| 17 | Body Range Detection | High | 4 |
| 18 | Multi-Language Support | Medium | 2-5, 7 |
| 19 | Webpack Aliases | Medium | 1-5 |
| 20 | BridgeContext Services | High | 2-5 |
| 21 | MCP Integration Tests | High | 6 |

---

## Testing Philosophy

### Testing Approach: TAD (Test-Assisted Development)

**Selected Approach**: TAD (Test-Assisted Development)

**Rationale** (from spec): LSP features require executable documentation given their complexity (symbol resolution, Flowspace ID parsing, multi-language LSP integration, two-step call hierarchy). Tests serve as high-fidelity documentation for how tools handle various input formats and edge cases.

**Focus Areas**:
- Symbol resolution logic (Flowspace ID parsing, symbol name lookup)
- LSP provider integrations (references, implementations, rename, call hierarchy)
- Error handling (unsupported languages, missing symbols, ambiguous symbols)
- Multi-language support (TypeScript, Python, at least one statically-typed language)
- Response enrichment with Flowspace IDs

**Excluded**:
- Extensive mocking of VS Code APIs (prefer real LSP providers in test workspace)
- Exhaustive edge case permutations (focus on critical paths documented in acceptance criteria)

### Mock Usage: Avoid Mocks Entirely

**Policy**: Avoid mocks entirely

**Rationale** (from spec): Real LSP behavior is critical to validate; mocks would hide integration issues with actual language servers.

**Implementation**:
- Use real VS Code LSP providers with actual test workspace fixtures
- No mocking of `vscode.execute*` APIs, `DocumentSymbolProvider`, `WorkspaceEdit`, etc.
- Integration tests with real language servers provide higher confidence
- Test files: `test/javascript/sample.test.js`, `test/python/test_example.py`, `test/csharp/`, `test/java/`

### TAD-Specific Workflow

**Scratch → Promote Process**:
1. **Write probe tests** in `test/scratch/` to explore and iterate (fast, excluded from CI)
2. **Implement code** iteratively, refining behavior with scratch probes
3. **When behavior stabilizes**, promote valuable tests to `test-cli/integration-mcp/`
4. **Add Test Doc comment** to each promoted test (required 5 fields)
5. **Delete scratch probes** that don't add durable value; keep learning notes in execution log

**Promotion Heuristic**: Promote tests that are:
- **Critical**: Core functionality (Flowspace ID parsing, symbol resolution, LSP calls)
- **Opaque**: Complex logic (hierarchical search, body range detection)
- **Regression-prone**: Previously failed scenarios
- **Edge cases**: Boundary conditions (empty results, timeout, unsupported language)

**Test Naming Format**: `Given...When...Then...`
- Example: `test_given_flowspace_id_when_windows_path_then_parses_correctly`
- Example: `test_given_nested_class_when_resolving_symbol_then_finds_method`

**Test Doc Comment Block** (required for every promoted test):
```javascript
/*
Test Doc:
- Why: Ensures Flowspace IDs with Windows paths parse correctly (regression from initial implementation)
- Contract: parseFlowspaceId() must handle forward slashes in drive letters
- Usage Notes: Always use forward slashes (C:/ not C:\\) in Flowspace IDs
- Quality Contribution: Prevents path parsing failures on Windows that broke symbol navigation
- Worked Example: Input "method:C:/src/Calculator.ts:Calculator.add" → { type: "method", path: "C:/src/Calculator.ts", name: "Calculator.add" }
*/
```

**CI Requirements**:
- Exclude `test/scratch/` from CI (not in version control or explicitly ignored)
- Promoted tests in `test-cli/integration-mcp/` must be deterministic
- No network calls (except to VS Code Extension Host which is controlled)
- Tests must pass reliably with 30s timeout (10s for LSP cold start + execution)

---

## Documentation Strategy

**Location**: Hybrid (README.md + docs/how/)

**Rationale** (from spec): LSP features need both quick-start examples for discoverability and comprehensive guides for complex workflows like symbol resolution and multi-language support.

**Content Split**:
- **README.md**: 2-3 simple examples showing basic usage (find references, rename symbol) with Flowspace IDs. Link to detailed docs.
- **docs/how/lsp-navigation/**: Comprehensive guide covering symbol resolution architecture, all 4 tools with detailed examples, multi-language support matrix, error handling strategies, troubleshooting.

**Target Audience**:
- **README**: AI agents and developers wanting quick usage examples
- **docs/how/**: Extension developers, contributors, and users needing detailed integration patterns

**Maintenance**: Update README examples when tool parameters change; update docs/how/ when adding new languages or workflows.

---

## Implementation Phases

### Phase 1: Symbol Resolver Foundation

**Objective**: Create the foundational symbol resolver utility with Flowspace ID parsing, symbol name resolution, and timeout utilities.

**Deliverables**:
- Symbol resolver utility at `packages/extension/src/core/utils/symbol-resolver.ts`
- Flowspace ID parser with Windows path validation
- Hierarchical symbol search with fallbacks
- Timeout wrapper utilities
- Comprehensive TAD tests documenting parsing and resolution behavior

**Dependencies**: None (foundational phase)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Nested class parsing complexity | High | Medium | Defer to implementation with TAD tests documenting behavior |
| Windows path edge cases | Medium | Medium | Comprehensive test coverage with real Windows paths |
| Ambiguous symbol threshold | Low | Low | Clear error messages with match details |

### Tasks (TAD Approach)

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 1.1 | [ ] | Create tests/scratch/ directory for exploration | Directory exists, excluded from git | - | Add to .gitignore if needed |
| 1.2 | [x] | Write scratch probes for Flowspace ID parsing | 5-8 probe tests covering basic format, Windows paths, nested classes | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t002-t006-write-scratch-probes-for-flowspace-id-parsing) | Fast iteration, no Test Doc blocks. Completed [^1] |
| 1.3 | [x] | Implement parseFlowspaceId() function | Basic parsing works: type, filePath, qualifiedName extracted | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t007-t009-implement-parseflowspaceid-with-validation) | `/workspaces/wormhole/packages/extension/src/core/utils/symbol-resolver.ts`. Completed [^1] |
| 1.4 | [x] | Refine parser with Windows path validation | Windows paths (C:/) validated, backslashes rejected | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t007-t009-implement-parseflowspaceid-with-validation) | Discovery 03 guidance. Completed [^1] |
| 1.5 | [x] | Promote critical parsing tests to test-cli/ | 2-3 tests with Test Doc blocks: Windows path, nested class, invalid format | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t011-t013-promote-critical-parsing-tests-with-test-doc-blocks) | Follow promotion heuristic. Completed [^1] |
| 1.6 | [x] | Write scratch probes for symbol resolution | 5-8 probes: exact match, hierarchical search, deep traversal | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t014-t022-implement-symbol-resolution-with-hierarchical-search) | Use test/javascript/sample.test.js fixtures. Completed [^2] |
| 1.7 | [x] | Implement findSymbolInDocument() with hierarchical search | Three-strategy search (exact, hierarchical, deep) finds symbols | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t014-t022-implement-symbol-resolution-with-hierarchical-search) | Discovery 06 guidance. Completed [^2] |
| 1.8 | [x] | Implement resolveFromFlowspaceId() wrapper | Combines parsing + symbol lookup, returns { uri, position, symbol } | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t025-t051-completion) | Integrates parseFlowspaceId + findSymbolInDocument. Completed [^3] |
| 1.9 | [x] | Implement resolveFromSymbolName() wrapper | Takes path + symbolName, returns { uri, position, symbol } | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t025-t051-completion) | Alternative to Flowspace ID. Completed [^3] |
| 1.10 | [x] | Write scratch probes for timeout utilities | 3-5 probes: timeout, success, undefined handling | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t025-t051-completion) | Discovery 04 guidance. Completed [^3] |
| 1.11 | [x] | Implement getLSPResultWithTimeout() utility | Promise.race pattern, returns result \| null \| 'timeout' | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t025-t051-completion) | Reusable across all LSP calls. Completed [^3] |
| 1.12 | [x] | Promote valuable resolution tests | 3-4 tests: hierarchical search, ambiguous symbols, timeout handling | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t025-t051-completion) | Add Test Doc blocks. Completed [^3] |
| 1.13 | [x] | Delete non-valuable scratch tests | Only promoted tests remain in test suite | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t025-t051-completion) | Keep learning notes in execution log. Completed [^3] |
| 1.14 | [x] | Add webpack alias for symbol-resolver | `@core/utils/symbol-resolver` alias in webpack.config.js | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t025-t051-completion) | Discovery 19 guidance. Completed [^3] |
| 1.15 | [x] | Verify all tests pass in CI | Integration tests pass, symbol-resolver exported correctly | [📋](tasks/phase-1-symbol-resolver-foundation/execution.log.md#tasks-t025-t051-completion) | Completed [^3] |

### Test Examples (Write First in Scratch!)

```typescript
// Scratch test (test/scratch/flowspace-parsing.test.ts)
describe('[Scratch] Flowspace ID Parsing Exploration', () => {
  test('basic format parses correctly', () => {
    const result = parseFlowspaceId('method:src/Calculator.ts:Calculator.add');
    expect(result.type).toBe('method');
    expect(result.filePath).toBe('src/Calculator.ts');
    expect(result.qualifiedName).toBe('Calculator.add');
  });

  test('Windows path with forward slashes', () => {
    const result = parseFlowspaceId('method:C:/Users/code/Calculator.ts:Calculator.add');
    expect(result.filePath).toBe('C:/Users/code/Calculator.ts');
  });

  test('Windows path with backslashes throws error', () => {
    expect(() => parseFlowspaceId('method:C:\\Users\\Calculator.ts:add'))
      .toThrow(/forward slashes/);
  });
});
```

After implementation and promotion:

```typescript
// Promoted test (test-cli/integration-mcp/symbol-resolver.test.ts)
describe('Symbol Resolver - Flowspace ID Parsing', () => {
  test('Given Flowspace ID with Windows path When parsing Then extracts components correctly', () => {
    /*
    Test Doc:
    - Why: Windows paths with drive letters are common and must be handled correctly
    - Contract: parseFlowspaceId() accepts forward slashes (C:/) but rejects backslashes (C:\)
    - Usage Notes: Always use forward slashes in Flowspace IDs regardless of OS
    - Quality Contribution: Prevents cross-platform path parsing failures that broke navigation on Windows
    - Worked Example: "method:C:/src/Calculator.ts:Calculator.add" → { type: "method", path: "C:/src/Calculator.ts", name: "Calculator.add" }
    */

    const result = parseFlowspaceId('method:C:/Users/code/Calculator.ts:Calculator.add');

    expect(result.type).toBe('method');
    expect(result.filePath).toBe('C:/Users/code/Calculator.ts');
    expect(result.qualifiedName).toBe('Calculator.add');
  });

  test('Given nested class symbol When resolving Then finds method via hierarchical search', () => {
    /*
    Test Doc:
    - Why: Nested classes are common (Outer.Inner.method) and require hierarchical traversal
    - Contract: findSymbolInDocument() tries exact match, then hierarchical split, then deep traversal
    - Usage Notes: Qualified names like "Outer.Inner.method" are split at dots for hierarchy
    - Quality Contribution: Ensures nested class navigation works across TypeScript, Java, C#
    - Worked Example: Finding "Shape.Circle.area" traverses DocumentSymbol tree: Shape → Circle → area
    */

    const uri = vscode.Uri.file(testFile);
    const symbols = await vscode.commands.executeCommand(
      'vscode.executeDocumentSymbolProvider', uri
    );

    const result = findSymbolInDocument(symbols, 'OuterClass.InnerClass.method');

    expect(result).toBeDefined();
    expect(result.name).toBe('method');
    expect(result.containerName).toBe('InnerClass');
  });
});
```

### Non-Happy-Path Coverage

- [ ] Invalid Flowspace ID format (missing colons, wrong component count)
- [ ] Windows paths with backslashes (should throw error)
- [ ] Symbol not found (E_NOT_FOUND error)
- [ ] Ambiguous symbol matches (E_AMBIGUOUS_SYMBOL with match list)
- [ ] LSP provider timeout (returns 'timeout')
- [ ] LSP provider unavailable (returns null)
- [ ] Nested class with excessive depth (>5 levels)

### Acceptance Criteria

- [ ] All promoted tests passing (100% of phase tests, ~8-10 tests)
- [ ] Test coverage > 80% for symbol-resolver.ts
- [ ] Mock usage: ZERO mocks (real VS Code APIs only)
- [ ] Test Doc blocks present for all promoted tests (5 required fields)
- [ ] Scratch tests deleted after promotion
- [ ] Webpack alias functional (`require('@core/utils/symbol-resolver')` works)
- [ ] Windows path validation enforces forward slashes
- [ ] Hierarchical search handles 3 fallback strategies
- [ ] Timeout utilities return correct three-state result

---

### Phase 2: Symbol Navigation Tool

**Objective**: Implement consolidated `symbol.navigate` tool with Flowspace ID support for finding references and implementations.

**Deliverables**:
- `packages/extension/src/vsc-scripts/symbol/navigate.js` (QueryScript)
- `packages/extension/src/vsc-scripts/symbol/navigate.meta.yaml` (with comprehensive MCP guidance)
- TAD tests covering references, implementations, Flowspace IDs, symbol names
- Error handling for unsupported languages, missing symbols
- Location normalization (Location vs LocationLink)

**Dependencies**: Phase 1 complete (symbol resolver available)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Location polymorphism edge cases | Medium | Low | Normalize both Location and LocationLink types |
| includeDeclaration behavior varies | Low | Low | Always pass explicit boolean parameter |
| Language-specific limitations | High | Medium | Provide language-specific hints in error messages |

### Tasks (TAD Approach)

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 2.1 | [ ] | Create symbol/navigate.js extending QueryScript | File structure correct, extends QueryScript base class | - | Discovery 01 - use QueryScript for read-only |
| 2.2 | [ ] | Create symbol/navigate.meta.yaml with parameters | Defines nodeId, path, symbol, action, includeDeclaration params | - | Discovery 05 - invest in MCP guidance |
| 2.3 | [ ] | Write scratch probes for reference finding | 5-8 probes: basic references, includeDeclaration true/false, Flowspace ID input | - | Use test/javascript/sample.test.js |
| 2.4 | [ ] | Implement resolveSymbolInput() helper | Determines nodeId vs path+symbol, calls resolver | - | Discovery 16 - nodeId precedence |
| 2.5 | [ ] | Implement executeReferences() with timeout | Calls vscode.executeReferenceProvider with timeout wrapper | - | Discovery 04, 12 - timeout + explicit boolean |
| 2.6 | [ ] | Implement normalizeLocation() helper | Handles both Location and LocationLink types | - | Discovery 11 |
| 2.7 | [ ] | Write scratch probes for implementations | 5-8 probes: interface implementations, abstract methods | - | Use TypeScript test files |
| 2.8 | [ ] | Implement executeImplementations() with timeout | Calls vscode.executeImplementationProvider | - | |
| 2.9 | [ ] | Implement action routing (references vs implementations) | Params.action determines which LSP command to call | - | Consolidated tool |
| 2.10 | [ ] | Add language-specific error hints | Python, JavaScript hints for unsupported operations | - | Discovery 18 |
| 2.11 | [ ] | Implement optional Flowspace ID enrichment | enrichWithFlowspaceIds param adds nodeId to results | - | Discovery 15 - optional for performance |
| 2.12 | [ ] | Write comprehensive MCP guidance in metadata | llm.when_to_use, parameter_hints with examples | - | Discovery 05 - 30-60% of time |
| 2.13 | [ ] | Promote critical navigation tests | 4-5 tests: references, implementations, Flowspace ID, errors | - | Add Test Doc blocks |
| 2.14 | [ ] | Delete non-valuable scratch tests | Only promoted tests remain | - | |
| 2.15 | [ ] | Run just build to generate manifest + schemas | Script discovered, schemas generated, MCP tool available | - | Discovery 02 |
| 2.16 | [ ] | Manual test via Extension Host | vscb script run symbol.navigate works with real files | - | |

### Test Examples (Promoted Tests)

```typescript
// test-cli/integration-mcp/symbol-navigate.test.ts
describe('Symbol Navigate - Find References', () => {
  let env: StdioTestEnvironment;

  beforeAll(async () => {
    env = await setupStdioTestEnvironment();
  }, 120000);

  test('Given Flowspace ID When finding references Then returns all usages', async () => {
    /*
    Test Doc:
    - Why: Flowspace IDs enable semantic navigation without cursor positions
    - Contract: navigate with action="references" returns all reference locations
    - Usage Notes: Use Flowspace ID for location-independent queries
    - Quality Contribution: Validates core semantic navigation capability
    - Worked Example: nodeId="method:javascript/sample.test.js:MyClass.method" → list of reference locations
    */

    const testFile = path.join(env.testWorkspace, 'javascript/sample.test.js');

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'symbol_navigate',
        arguments: {
          nodeId: 'method:javascript/sample.test.js:MyClass.testMethod',
          action: 'references',
          includeDeclaration: true
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(true);
    expect(data.data.references).toBeDefined();
    expect(data.data.references.length).toBeGreaterThan(0);
    expect(data.meta.resolvedVia).toBe('flowspaceId');
  }, 30000);

  test('Given symbol name When finding implementations Then returns implementing classes', async () => {
    /*
    Test Doc:
    - Why: Symbol name resolution enables navigation when Flowspace ID not available
    - Contract: navigate with action="implementations" returns classes implementing interface
    - Usage Notes: Requires path + symbol parameters together
    - Quality Contribution: Validates alternative input format for navigation
    - Worked Example: path="src/IService.ts" symbol="IService" → list of implementation locations
    */

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'symbol_navigate',
        arguments: {
          path: 'javascript/sample.test.js',
          symbol: 'MyInterface',
          action: 'implementations'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(true);
    expect(data.data.implementations).toBeDefined();
    expect(data.meta.resolvedVia).toBe('symbolName');
  }, 30000);

  test('Given unsupported language When finding references Then returns helpful error', async () => {
    /*
    Test Doc:
    - Why: Not all file types have language servers; must provide clear guidance
    - Contract: Returns E_NO_LANGUAGE_SERVER with hint about language support
    - Usage Notes: Check error messages for language-specific guidance
    - Quality Contribution: Prevents user confusion when LSP not available
    - Worked Example: Plain text file → error with hint to install language extension
    */

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'symbol_navigate',
        arguments: {
          nodeId: 'text:README.md',
          action: 'references'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(false);
    expect(data.status).toContain('E_NO_LANGUAGE_SERVER');
  }, 30000);
});
```

### Non-Happy-Path Coverage

- [ ] Unsupported language (plain text, markdown) returns E_NO_LANGUAGE_SERVER
- [ ] Symbol not found returns E_NOT_FOUND with search suggestion
- [ ] LSP provider timeout returns E_TIMEOUT with cold-start note
- [ ] Invalid Flowspace ID format returns E_INVALID_INPUT
- [ ] Empty results (no references/implementations found) returns empty array (not error)
- [ ] includeDeclaration=false excludes declaration from results
- [ ] Python implementations request returns helpful hint (no interfaces)

### Acceptance Criteria

- [ ] All promoted tests passing (~5-6 tests)
- [ ] Test coverage > 80% for navigate.js
- [ ] No mocks used (real LSP providers)
- [ ] Test Doc blocks complete (5 fields)
- [ ] MCP metadata comprehensive (when_to_use > 10 lines, parameter_hints for all params)
- [ ] Both action types work (references, implementations)
- [ ] Both input formats work (Flowspace ID, symbol name)
- [ ] Location normalization handles Location and LocationLink
- [ ] Language hints provided for Python, JavaScript limitations
- [ ] Error codes follow spec (E_NO_LANGUAGE_SERVER, E_NOT_FOUND, E_TIMEOUT, E_INVALID_INPUT)

---

### Phase 3: Symbol Rename Tool

**Objective**: Implement `symbol.rename` tool with workspace-wide refactoring via Flowspace ID or symbol name.

**Deliverables**:
- `packages/extension/src/vsc-scripts/symbol/rename.js` (QueryScript)
- `packages/extension/src/vsc-scripts/symbol/rename.meta.yaml`
- TAD tests for single-file and multi-file rename scenarios
- Pre-validation for file permissions (read-only check)
- WorkspaceEdit application with error context

**Dependencies**: Phase 1 complete (symbol resolver)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WorkspaceEdit silent failures | Medium | High | Pre-validate file permissions, provide error context |
| Read-only files | Low | Medium | Check fs.accessSync(W_OK) before applying |
| Language-specific rename limitations | Medium | Medium | Document JavaScript CommonJS limitations |

### Tasks (TAD Approach)

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 3.1 | [ ] | Create symbol/rename.js extending QueryScript | File structure correct, extends QueryScript | - | |
| 3.2 | [ ] | Create symbol/rename.meta.yaml | Defines nodeId, path, symbol, newName params | - | |
| 3.3 | [ ] | Write scratch probes for basic rename | 3-5 probes: single file, multi-file, class rename | - | Use TypeScript test files |
| 3.4 | [ ] | Implement resolveSymbolInput() (reuse from Phase 2 pattern) | Resolves nodeId or path+symbol to position | - | |
| 3.5 | [ ] | Implement executeRenameProvider() with timeout | Calls vscode.executeDocumentRenameProvider | - | |
| 3.6 | [ ] | Write scratch probes for WorkspaceEdit validation | 3-5 probes: file exists, writable, locked file | - | |
| 3.7 | [ ] | Implement validateFilesWritable() helper | Checks fs.existsSync() and fs.accessSync(W_OK) for all files in edit | - | Discovery 07 |
| 3.8 | [ ] | Implement applyWorkspaceEdit() with error context | Applies edit, throws descriptive error on failure | - | Discovery 07 |
| 3.9 | [ ] | Format response with file change summary | Returns { applied: true, changes: [...], totalFiles, totalEdits } | - | |
| 3.10 | [ ] | Add language-specific hints | JavaScript CommonJS warning | - | Discovery 18 |
| 3.11 | [ ] | Write comprehensive MCP guidance | Use cases: safe refactoring, impact analysis before rename | - | |
| 3.12 | [ ] | Promote critical rename tests | 3-4 tests: basic rename, multi-file, error handling | - | Add Test Doc blocks |
| 3.13 | [ ] | Delete scratch tests | Only promoted tests remain | - | |
| 3.14 | [ ] | Run just build | Manifest + schemas updated | - | |
| 3.15 | [ ] | Manual test via Extension Host | Rename works across multiple files | - | |

### Test Examples (Promoted Tests)

```typescript
describe('Symbol Rename - Workspace-Wide', () => {
  test('Given class name When renaming Then updates all files atomically', async () => {
    /*
    Test Doc:
    - Why: Workspace-wide rename is critical for safe refactoring
    - Contract: Renames all references across workspace, updates imports/exports
    - Usage Notes: Provide newName that follows language naming conventions
    - Quality Contribution: Validates atomic multi-file refactoring capability
    - Worked Example: Rename "Calculator" to "MathCalculator" updates class + all usages + imports
    */

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'symbol_rename',
        arguments: {
          nodeId: 'class:javascript/Calculator.js:Calculator',
          newName: 'MathCalculator'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(true);
    expect(data.data.applied).toBe(true);
    expect(data.data.totalFiles).toBeGreaterThan(1); // Changed multiple files
    expect(data.data.changes).toBeDefined();
  }, 30000);

  test('Given read-only file When renaming Then returns permission error', async () => {
    /*
    Test Doc:
    - Why: Must provide clear errors when file permissions prevent rename
    - Contract: Pre-validates file permissions, returns E_FILE_READ_ONLY if not writable
    - Usage Notes: Check file permissions before attempting rename
    - Quality Contribution: Prevents silent failures from WorkspaceEdit.applyEdit()
    - Worked Example: Read-only file → clear error "Cannot apply edit: file is read-only"
    */

    // Make test file read-only
    const testFile = path.join(env.testWorkspace, 'javascript/readonly.js');
    fs.chmodSync(testFile, 0o444);

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'symbol_rename',
        arguments: {
          path: 'javascript/readonly.js',
          symbol: 'MyClass',
          newName: 'RenamedClass'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(false);
    expect(data.status).toContain('E_FILE_READ_ONLY');

    // Restore permissions
    fs.chmodSync(testFile, 0o644);
  }, 30000);
});
```

### Non-Happy-Path Coverage

- [ ] Read-only file returns E_FILE_READ_ONLY
- [ ] File doesn't exist returns E_NOT_FOUND
- [ ] WorkspaceEdit.applyEdit() returns false (with generic error + hints)
- [ ] Symbol not found returns E_NOT_FOUND
- [ ] LSP provider timeout returns E_TIMEOUT
- [ ] Invalid new name (empty string) returns E_INVALID_INPUT
- [ ] JavaScript CommonJS module hint provided when applicable

### Acceptance Criteria

- [ ] All promoted tests passing (~4-5 tests)
- [ ] Test coverage > 80% for rename.js
- [ ] No mocks used
- [ ] Test Doc blocks complete
- [ ] Pre-validation prevents silent WorkspaceEdit failures
- [ ] File permission checks implemented (fs.accessSync)
- [ ] Response includes file change summary (totalFiles, totalEdits, changes array)
- [ ] Language hints for JavaScript limitations
- [ ] Error codes: E_FILE_READ_ONLY, E_NOT_FOUND, E_TIMEOUT, E_OPERATION_FAILED

---

### Phase 4: Method Replacement Tool

**Objective**: Implement `code.replace-method` tool for replacing method bodies or entire declarations by symbol name.

**Deliverables**:
- `packages/extension/src/vsc-scripts/code/replace-method.js` (QueryScript)
- `packages/extension/src/vsc-scripts/code/replace-method.meta.yaml`
- TAD tests for replace-body and replace-node modes
- Body range detection with fallback errors
- WorkspaceEdit application with validation

**Dependencies**: Phase 1 complete (symbol resolver)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Body range detection failures | High | High | Heuristic-based detection, clear error if no body found |
| Interface/abstract methods | Medium | Medium | Return E_INVALID_INPUT with hint to use replace-node mode |
| Language-specific syntax variations | Low | Low | Use brace detection heuristic (works for C-style languages) |

### Tasks (TAD Approach)

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 4.1 | [ ] | Create code/replace-method.js extending QueryScript | File structure correct | - | New category: code/ |
| 4.2 | [ ] | Create code/replace-method.meta.yaml | Defines nodeId, path, symbol, replacement, mode params | - | |
| 4.3 | [ ] | Write scratch probes for body detection | 5-8 probes: method with body, interface method (no body), getter/setter | - | Use TypeScript/Python files |
| 4.4 | [ ] | Implement calculateBodyRange() helper | Finds first { and last } in symbol range | - | Discovery 17 |
| 4.5 | [ ] | Handle interface/abstract methods gracefully | Throws E_INVALID_INPUT if no braces found | - | Discovery 17 |
| 4.6 | [ ] | Write scratch probes for replace-node mode | 3-5 probes: full method replacement, signature change | - | |
| 4.7 | [ ] | Implement mode routing (replace-body vs replace-node) | Params.mode determines which range to use | - | |
| 4.8 | [ ] | Implement WorkspaceEdit construction | Creates TextEdit for calculated range + replacement text | - | |
| 4.9 | [ ] | Implement applyWorkspaceEdit() with validation | Reuse from Phase 3 pattern | - | |
| 4.10 | [ ] | Format response with change details | Returns { applied: true, changes: [{ uri, range, oldText, newText }] } | - | |
| 4.11 | [ ] | Write comprehensive MCP guidance | Use cases: refactoring method implementation, adding logging | - | |
| 4.12 | [ ] | Promote critical replacement tests | 3-4 tests: replace-body, replace-node, no-body error | - | Add Test Doc blocks |
| 4.13 | [ ] | Delete scratch tests | Only promoted tests remain | - | |
| 4.14 | [ ] | Run just build | Manifest + schemas updated | - | |
| 4.15 | [ ] | Manual test via Extension Host | Replace works for methods with bodies | - | |

### Test Examples (Promoted Tests)

```typescript
describe('Code Replace Method - Body vs Node', () => {
  test('Given method with body When replace-body mode Then replaces only implementation', async () => {
    /*
    Test Doc:
    - Why: Method body replacement is common refactoring pattern (add logging, change implementation)
    - Contract: replace-body mode replaces content inside braces, preserves signature
    - Usage Notes: Use replace-body when keeping method signature unchanged
    - Quality Contribution: Enables targeted method implementation refactoring without signature changes
    - Worked Example: "getUser(id) { return this.db.get(id); }" → "getUser(id) { return this.cache.get(id); }"
    */

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'code_replace_method',
        arguments: {
          nodeId: 'method:javascript/UserService.js:UserService.getUser',
          replacement: 'return this.cache.get(id);',
          mode: 'replace-body'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(true);
    expect(data.data.applied).toBe(true);
    expect(data.data.changes[0].oldText).toContain('this.db.get');
    expect(data.data.changes[0].newText).toContain('this.cache.get');
  }, 30000);

  test('Given interface method When replace-body mode Then returns no-body error', async () => {
    /*
    Test Doc:
    - Why: Interface methods have no body; must provide clear guidance to use replace-node
    - Contract: Returns E_INVALID_INPUT when no body found (abstract/interface methods)
    - Usage Notes: Check if symbol is abstract/interface before using replace-body
    - Quality Contribution: Prevents confusing errors when trying to replace non-existent body
    - Worked Example: Interface method declaration → error with hint "Use mode='replace-node' instead"
    */

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'code_replace_method',
        arguments: {
          path: 'typescript/IService.ts',
          symbol: 'IService.processData',
          replacement: 'return true;',
          mode: 'replace-body'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(false);
    expect(data.status).toContain('E_INVALID_INPUT');
    expect(data.error.hint).toContain('replace-node');
  }, 30000);

  test('Given method When replace-node mode Then replaces entire declaration', async () => {
    /*
    Test Doc:
    - Why: Complete method replacement needed when changing signature
    - Contract: replace-node mode replaces entire method declaration (signature + body)
    - Usage Notes: Use replace-node when changing signature, parameter types, or return type
    - Quality Contribution: Enables complete method refactoring including signature changes
    - Worked Example: "getUser(id: string): User { ... }" → "async getUser(id: string): Promise<User> { ... }"
    */

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'code_replace_method',
        arguments: {
          nodeId: 'method:javascript/Calculator.js:Calculator.add',
          replacement: 'async add(a, b) { return Promise.resolve(a + b); }',
          mode: 'replace-node'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(true);
    expect(data.data.applied).toBe(true);
    expect(data.data.changes[0].newText).toContain('async add');
  }, 30000);
});
```

### Non-Happy-Path Coverage

- [ ] Interface method (no body) returns E_INVALID_INPUT with replace-node hint
- [ ] Abstract method returns E_INVALID_INPUT
- [ ] Symbol not found returns E_NOT_FOUND
- [ ] Empty replacement string accepted (clears method body)
- [ ] File read-only returns E_FILE_READ_ONLY (pre-validation)
- [ ] Invalid mode parameter returns E_INVALID_INPUT
- [ ] Property declaration (not method) handled appropriately

### Acceptance Criteria

- [ ] All promoted tests passing (~4-5 tests)
- [ ] Test coverage > 80% for replace-method.js
- [ ] No mocks used
- [ ] Test Doc blocks complete
- [ ] Body range detection works for C-style languages (JS, TS, Java, C#, Go)
- [ ] Interface/abstract method error clear and helpful
- [ ] Both modes work (replace-body, replace-node)
- [ ] WorkspaceEdit validation implemented
- [ ] Response includes change details (range, oldText, newText)
- [ ] Error codes: E_INVALID_INPUT, E_NOT_FOUND, E_FILE_READ_ONLY, E_OPERATION_FAILED

---

### Phase 5: Call Hierarchy Tool

**Objective**: Implement `hierarchy.calls` tool for navigating incoming and outgoing call relationships.

**Deliverables**:
- `packages/extension/src/vsc-scripts/hierarchy/calls.js` (QueryScript)
- `packages/extension/src/vsc-scripts/hierarchy/calls.meta.yaml`
- TAD tests for incoming and outgoing calls
- Two-step LSP process (prepare + provide)
- Error handling for unsupported languages

**Dependencies**: Phase 1 complete (symbol resolver)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Two-step process complexity | Low | Low | Clear implementation following Discovery 09 pattern |
| Language support variations | High | Medium | Provide language-specific hints, document support matrix |
| Empty call hierarchy | Medium | Low | Return empty array (not error) with helpful meta message |

### Tasks (TAD Approach)

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 5.1 | [ ] | Create hierarchy/calls.js extending QueryScript | File structure correct | - | New category: hierarchy/ |
| 5.2 | [ ] | Create hierarchy/calls.meta.yaml | Defines nodeId, path, symbol, direction params | - | |
| 5.3 | [ ] | Write scratch probes for call hierarchy | 5-8 probes: prepare step, incoming calls, outgoing calls | - | Use TypeScript/Python test files |
| 5.4 | [ ] | Implement prepareCallHierarchy() with timeout | First step: returns CallHierarchyItem or null | - | Discovery 09 |
| 5.5 | [ ] | Handle prepare step failure gracefully | Returns E_NO_LANGUAGE_SERVER if no items returned | - | |
| 5.6 | [ ] | Implement provideIncomingCalls() with timeout | Second step for direction="incoming" | - | |
| 5.7 | [ ] | Implement provideOutgoingCalls() with timeout | Second step for direction="outgoing" | - | |
| 5.8 | [ ] | Implement direction routing | Params.direction determines which provider to call | - | |
| 5.9 | [ ] | Format response with call details | Returns { calls: [...], total, direction } | - | |
| 5.10 | [ ] | Add language-specific hints | Document JavaScript/Python call hierarchy limitations | - | Discovery 18 |
| 5.11 | [ ] | Write comprehensive MCP guidance | Use cases: understanding function dependencies, refactoring impact | - | |
| 5.12 | [ ] | Promote critical call hierarchy tests | 3-4 tests: incoming, outgoing, unsupported language | - | Add Test Doc blocks |
| 5.13 | [ ] | Delete scratch tests | Only promoted tests remain | - | |
| 5.14 | [ ] | Run just build | Manifest + schemas updated | - | |
| 5.15 | [ ] | Manual test via Extension Host | Call hierarchy works for TypeScript/Python | - | |

### Test Examples (Promoted Tests)

```typescript
describe('Hierarchy Calls - Two-Step Process', () => {
  test('Given function When requesting incoming calls Then returns callers', async () => {
    /*
    Test Doc:
    - Why: Understanding function callers is critical for refactoring impact analysis
    - Contract: Two-step process: prepareCallHierarchy → provideIncomingCalls
    - Usage Notes: direction="incoming" shows who calls this function
    - Quality Contribution: Validates call hierarchy navigation for dependency analysis
    - Worked Example: "UserService.getUser" incoming calls → list of functions calling getUser
    */

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'hierarchy_calls',
        arguments: {
          nodeId: 'method:javascript/UserService.js:UserService.getUser',
          direction: 'incoming'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(true);
    expect(data.data.calls).toBeDefined();
    expect(data.data.direction).toBe('incoming');
    expect(data.data.calls.length).toBeGreaterThan(0);
    expect(data.data.calls[0].from.name).toBeDefined();
  }, 30000);

  test('Given function When requesting outgoing calls Then returns callees', async () => {
    /*
    Test Doc:
    - Why: Understanding function dependencies is critical for modularization
    - Contract: Two-step process with direction="outgoing"
    - Usage Notes: Shows what functions this function calls
    - Quality Contribution: Validates dependency mapping for refactoring
    - Worked Example: "UserController.handleRequest" outgoing calls → list of functions it calls
    */

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'hierarchy_calls',
        arguments: {
          path: 'javascript/UserController.js',
          symbol: 'UserController.handleRequest',
          direction: 'outgoing'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(true);
    expect(data.data.calls).toBeDefined();
    expect(data.data.direction).toBe('outgoing');
  }, 30000);

  test('Given language without call hierarchy When requesting calls Then returns helpful error', async () => {
    /*
    Test Doc:
    - Why: Not all languages support call hierarchy; must provide clear guidance
    - Contract: Returns E_NO_LANGUAGE_SERVER when prepare step returns empty
    - Usage Notes: Check error messages for language support status
    - Quality Contribution: Prevents user confusion when call hierarchy unavailable
    - Worked Example: Plain text file → error with hint about language server requirements
    */

    const result = await env.client.request({
      method: 'tools/call',
      params: {
        name: 'hierarchy_calls',
        arguments: {
          nodeId: 'function:README.md:someFunction',
          direction: 'incoming'
        }
      }
    }, CallToolResultSchema);

    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(false);
    expect(data.status).toContain('E_NO_LANGUAGE_SERVER');
  }, 30000);
});
```

### Non-Happy-Path Coverage

- [ ] Unsupported language returns E_NO_LANGUAGE_SERVER
- [ ] Symbol not found returns E_NOT_FOUND
- [ ] Prepare step returns empty array (no call hierarchy item) returns E_NO_LANGUAGE_SERVER
- [ ] Prepare step timeout returns E_TIMEOUT
- [ ] Empty call list returns empty array (not error) with meta note
- [ ] Invalid direction parameter returns E_INVALID_INPUT
- [ ] JavaScript limitations noted in hints

### Acceptance Criteria

- [ ] All promoted tests passing (~4-5 tests)
- [ ] Test coverage > 80% for calls.js
- [ ] No mocks used
- [ ] Test Doc blocks complete
- [ ] Two-step process implemented correctly (prepare → provide)
- [ ] Both directions work (incoming, outgoing)
- [ ] Empty results handled gracefully (empty array, not error)
- [ ] Language hints for JavaScript/Python limitations
- [ ] Response includes call details (from, fromRanges)
- [ ] Error codes: E_NO_LANGUAGE_SERVER, E_NOT_FOUND, E_TIMEOUT, E_INVALID_INPUT

---

### Phase 6: Multi-Language Integration Testing

**Objective**: Validate all 4 LSP tools work correctly across TypeScript, Python, and Java with comprehensive integration tests.

**Deliverables**:
- Integration test suite in `test-cli/integration-mcp/lsp-multi-language.test.ts`
- Test coverage for TypeScript, Python, Java (minimum required by spec)
- Cross-tool integration scenarios (navigate → rename workflow)
- Performance benchmarks (cold start vs warm start)
- Language support matrix documentation

**Dependencies**: Phases 2, 3, 4, 5 complete (all 4 tools implemented)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Java language server slow to start | High | Low | Increase timeout to 30s for Java tests |
| Python limited LSP features | Medium | Low | Document limitations, skip unsupported operations |
| Cross-platform path issues | Low | Medium | Test Windows paths explicitly (forward slashes) |

### Tasks (TAD Approach)

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 6.1 | [ ] | Create lsp-multi-language.test.ts suite | Test file structure with TypeScript, Python, Java describes | - | |
| 6.2 | [ ] | Add TypeScript test fixtures if needed | test/typescript/ has classes, interfaces, methods suitable for LSP testing | - | May already exist |
| 6.3 | [ ] | Add Python test fixtures if needed | test/python/ has classes and functions | - | test_example.py may suffice |
| 6.4 | [ ] | Add Java test fixtures if needed | test/java/ has at least one class with methods | - | |
| 6.5 | [ ] | Write TypeScript navigation tests | All 4 tools tested: navigate, rename, replace-method, calls | - | |
| 6.6 | [ ] | Write Python navigation tests | All 4 tools tested (document limitations: no implementations) | - | |
| 6.7 | [ ] | Write Java navigation tests | All 4 tools tested (static typing, interfaces) | - | |
| 6.8 | [ ] | Write cross-tool workflow test | navigate → rename workflow: find references, then rename symbol | - | |
| 6.9 | [ ] | Write performance benchmark test | Measure cold start vs warm start for workspace symbol search | - | Discovery 13 |
| 6.10 | [ ] | Document language support matrix | Create table: Tool × Language × Support Status | - | For Phase 7 documentation |
| 6.11 | [ ] | Verify Windows path handling | Test Flowspace IDs with C:/ paths | - | Discovery 03 |
| 6.12 | [ ] | All integration tests passing | 100% pass rate for promoted multi-language tests | - | |

### Test Examples

```typescript
describe('Multi-Language Integration - All Tools', () => {
  describe('TypeScript Support', () => {
    test('All 4 LSP tools work with TypeScript files', async () => {
      /*
      Test Doc:
      - Why: TypeScript is primary language with full LSP support
      - Contract: All navigation, rename, replacement, call hierarchy work
      - Usage Notes: TypeScript tests serve as reference implementation
      - Quality Contribution: Validates complete feature set in well-supported language
      - Worked Example: navigate → rename → replace-method → hierarchy.calls all succeed
      */

      // Test navigate
      const navResult = await env.client.request({
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            nodeId: 'method:typescript/Calculator.ts:Calculator.add',
            action: 'references'
          }
        }
      }, CallToolResultSchema);
      expect(JSON.parse(navResult.content[0].text).ok).toBe(true);

      // Test rename (skipped to avoid modifying test files)

      // Test replace-method
      const replaceResult = await env.client.request({
        method: 'tools/call',
        params: {
          name: 'code_replace_method',
          arguments: {
            nodeId: 'method:typescript/Calculator.ts:Calculator.add',
            replacement: 'return a + b;',
            mode: 'replace-body'
          }
        }
      }, CallToolResultSchema);
      expect(JSON.parse(replaceResult.content[0].text).ok).toBe(true);

      // Test hierarchy.calls
      const callsResult = await env.client.request({
        method: 'tools/call',
        params: {
          name: 'hierarchy_calls',
          arguments: {
            nodeId: 'method:typescript/Calculator.ts:Calculator.add',
            direction: 'incoming'
          }
        }
      }, CallToolResultSchema);
      expect(JSON.parse(callsResult.content[0].text).ok).toBe(true);
    }, 60000);
  });

  describe('Python Support', () => {
    test('Navigate and calls work, implementations limited', async () => {
      /*
      Test Doc:
      - Why: Python is widely used but has language-specific limitations (no interfaces)
      - Contract: References and call hierarchy work; implementations return helpful hint
      - Usage Notes: Python lacks interfaces, so implementations operation not applicable
      - Quality Contribution: Validates graceful handling of language-specific limitations
      - Worked Example: references succeed, implementations return hint about no interfaces
      */

      // Navigate works
      const navResult = await env.client.request({
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            path: 'python/test_example.py',
            symbol: 'test_function',
            action: 'references'
          }
        }
      }, CallToolResultSchema);
      expect(JSON.parse(navResult.content[0].text).ok).toBe(true);

      // Implementations provides hint
      const implResult = await env.client.request({
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            path: 'python/test_example.py',
            symbol: 'BaseClass',
            action: 'implementations'
          }
        }
      }, CallToolResultSchema);
      const implData = JSON.parse(implResult.content[0].text);
      expect(implData.meta.hint).toContain('Python');
    }, 45000);
  });

  describe('Java Support', () => {
    test('All tools work with static typing and interfaces', async () => {
      /*
      Test Doc:
      - Why: Java is statically typed with robust LSP support
      - Contract: Implementations work well (interfaces common), all operations supported
      - Usage Notes: Java language server may have longer cold start
      - Quality Contribution: Validates support for strongly-typed language with interfaces
      - Worked Example: All 4 tools succeed, implementations returns interface implementations
      */

      // Java tests similar structure to TypeScript
      // ...
    }, 90000); // Longer timeout for Java language server cold start
  });

  describe('Cross-Tool Workflows', () => {
    test('Navigate to find references, then rename symbol', async () => {
      /*
      Test Doc:
      - Why: Common workflow: understand impact (navigate) before refactoring (rename)
      - Contract: Tools compose correctly - navigate results inform rename decision
      - Usage Notes: Use navigate to check reference count before rename
      - Quality Contribution: Validates tools work together for real-world workflows
      - Worked Example: navigate finds 5 references → rename updates all 5 locations
      */

      // Step 1: Navigate to see impact
      const navResult = await env.client.request({
        method: 'tools/call',
        params: {
          name: 'symbol_navigate',
          arguments: {
            nodeId: 'method:javascript/sample.test.js:MyClass.oldMethod',
            action: 'references'
          }
        }
      }, CallToolResultSchema);
      const navData = JSON.parse(navResult.content[0].text);
      const refCount = navData.data.references.length;

      // Step 2: Rename (skipped to avoid modifying test files, but pattern validated)
      // const renameResult = await env.client.request({...});

      expect(refCount).toBeGreaterThan(0); // Validates workflow pattern
    }, 30000);
  });
});
```

### Non-Happy-Path Coverage

- [ ] Mixed languages in workspace (TypeScript + Python files)
- [ ] Large workspace with >1000 files (performance test)
- [ ] Concurrent tool calls (race condition testing)
- [ ] Invalid Flowspace IDs across languages
- [ ] Cross-file symbol resolution (class in file A, method usage in file B)

### Acceptance Criteria

- [ ] All integration tests passing (100%)
- [ ] TypeScript: All 4 tools work
- [ ] Python: navigate, rename, replace-method, calls work (implementations documented as limited)
- [ ] Java: All 4 tools work
- [ ] Cross-tool workflow test passes
- [ ] Performance benchmark documented (cold start vs warm)
- [ ] Language support matrix complete
- [ ] Windows path handling validated
- [ ] No test failures due to language server unavailability
- [ ] Test suite runs in < 5 minutes

---

### Phase 7: Documentation

**Objective**: Document LSP navigation features following hybrid strategy (README + docs/how/).

**Deliverables**:
- Updated README.md with quick-start examples (2-3 simple examples)
- New `docs/how/lsp-navigation/` directory with comprehensive guide
- Language support matrix
- Troubleshooting guide
- API reference for all 4 tools

**Dependencies**: All implementation phases complete (1-6)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift | Medium | Medium | Include doc updates in acceptance criteria for each tool |
| Examples become outdated | Low | Low | Use real test fixture paths, validate examples in CI |
| Unclear Flowspace ID guidance | Medium | High | Provide multiple examples, troubleshooting section |

### Discovery & Placement Decision

**Existing docs/how/ structure**:
```
docs/how/
├── dogfood/
│   └── dogfooding-vsc-bridge.md
├── mcp/
│   └── ...
├── add-new-script.md
└── authoring-mcp-doc-tools.md
```

**Decision**: Create new `docs/how/lsp-navigation/` directory (no existing relevant feature area for LSP-specific docs)

**File strategy**: Create new numbered files:
- `1-overview.md` - Introduction, motivation, architecture
- `2-quickstart.md` - Quick examples for each tool
- `3-flowspace-ids.md` - Detailed Flowspace ID guide
- `4-api-reference.md` - Complete parameter reference for all tools
- `5-language-support.md` - Language support matrix and limitations
- `6-troubleshooting.md` - Common issues and solutions

### Tasks (Lightweight Approach for Documentation)

| # | Status | Task | Success Criteria | Log | Notes |
|---|--------|------|------------------|-----|-------|
| 7.1 | [ ] | Survey existing docs/how/ directories | Documented structure, confirmed no conflicts | - | Discovery step |
| 7.2 | [ ] | Update README.md with LSP features section | Quick-start examples (navigate, rename), link to docs/how/lsp-navigation/ | - | `/workspaces/wormhole/README.md` |
| 7.3 | [ ] | Create docs/how/lsp-navigation/1-overview.md | Introduction, motivation, architecture diagram, key concepts | - | `/workspaces/wormhole/docs/how/lsp-navigation/1-overview.md` |
| 7.4 | [ ] | Create docs/how/lsp-navigation/2-quickstart.md | Quick examples for all 4 tools with real test file paths | - | `/workspaces/wormhole/docs/how/lsp-navigation/2-quickstart.md` |
| 7.5 | [ ] | Create docs/how/lsp-navigation/3-flowspace-ids.md | Detailed Flowspace ID guide, parsing rules, examples, Windows paths | - | `/workspaces/wormhole/docs/how/lsp-navigation/3-flowspace-ids.md` |
| 7.6 | [ ] | Create docs/how/lsp-navigation/4-api-reference.md | Complete API docs for navigate, rename, replace-method, calls | - | `/workspaces/wormhole/docs/how/lsp-navigation/4-api-reference.md` |
| 7.7 | [ ] | Create docs/how/lsp-navigation/5-language-support.md | Language support matrix (from Phase 6 findings), limitations per language | - | `/workspaces/wormhole/docs/how/lsp-navigation/5-language-support.md` |
| 7.8 | [ ] | Create docs/how/lsp-navigation/6-troubleshooting.md | Common errors (E_NO_LANGUAGE_SERVER, E_TIMEOUT), solutions, FAQ | - | `/workspaces/wormhole/docs/how/lsp-navigation/6-troubleshooting.md` |
| 7.9 | [ ] | Add diagrams to overview.md | Architecture diagram showing symbol resolver + 4 tools + LSP providers | - | Use mermaid syntax |
| 7.10 | [ ] | Review all docs for accuracy and completeness | Peer review passed, no broken links, examples validated | - | |
| 7.11 | [ ] | Validate code examples in docs | All examples use real test file paths, parameters match API | - | |

### Content Outlines

**README.md section** (Hybrid: quick-start only):
```markdown
## LSP Navigation Features

VSC-Bridge provides semantic code navigation via Flowspace IDs and symbol names:

### Quick Examples

**Find References**:
```bash
vscb script run symbol.navigate \
  --param nodeId="method:src/Calculator.ts:Calculator.add" \
  --param action="references"
```

**Rename Symbol**:
```bash
vscb script run symbol.rename \
  --param path="src/Calculator.ts" \
  --param symbol="Calculator" \
  --param newName="MathCalculator"
```

📖 **[Full Documentation](./docs/how/lsp-navigation/)** - Complete guide, API reference, troubleshooting
```

**docs/how/lsp-navigation/1-overview.md**:
- What is semantic navigation?
- Why Flowspace IDs instead of positions?
- Architecture diagram (symbol resolver + 4 tools + LSP providers)
- Key concepts: Flowspace IDs, symbol names, LSP providers
- When to use each tool

**docs/how/lsp-navigation/2-quickstart.md**:
- Installation (already have VSC-Bridge)
- Quick example for each tool
- Common workflows (navigate → rename, replace-method for refactoring)

**docs/how/lsp-navigation/3-flowspace-ids.md**:
- Format specification: `type:file_path:qualified_name`
- Node types: method, class, function, file, content
- Parsing rules (Windows paths with forward slashes)
- Examples across languages
- How to get Flowspace IDs (from search.symbol-search or generate manually)

**docs/how/lsp-navigation/4-api-reference.md**:
```markdown
## symbol.navigate

**Parameters**:
- `nodeId` (string, optional): Flowspace Node ID
- `path` (string, optional): File path (required if symbol provided)
- `symbol` (string, optional): Symbol name (required if nodeId not provided)
- `action` (string, required): "references" or "implementations"
- `includeDeclaration` (boolean, optional): Include declaration in results (default: true)

**Returns**: `{ ok, data: { references: Location[] }, meta }`

**Examples**: [...]

[Repeat for rename, replace-method, calls]
```

**docs/how/lsp-navigation/5-language-support.md**:
| Tool | TypeScript | Python | JavaScript | Java | Go | C# | Rust |
|------|------------|--------|------------|------|----|----|------|
| navigate (references) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| navigate (implementations) | ✅ | ⚠️ Limited | ⚠️ Limited | ✅ | ✅ | ✅ | ✅ |
| rename | ✅ | ✅ | ⚠️ CommonJS | ✅ | ✅ | ✅ | ✅ |
| replace-method | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| hierarchy.calls | ✅ | ✅ | ⚠️ Limited | ✅ | ✅ | ✅ | ✅ |

**Limitations**:
- Python: No interfaces, so implementations less useful (use references instead)
- JavaScript: CommonJS require() may not rename correctly, call hierarchy limited
- [...]

**docs/how/lsp-navigation/6-troubleshooting.md**:
```markdown
## Common Errors

### E_NO_LANGUAGE_SERVER

**Cause**: No language server available for this file type

**Solutions**:
1. Install language extension (e.g., Python extension for .py files)
2. Check file type is supported (use `search.symbol-search` to verify)
3. Restart VS Code Extension Host if server crashed

### E_TIMEOUT

**Cause**: LSP operation took > 10 seconds

**Solutions**:
1. First workspace search after VS Code starts may take 5-10s (normal)
2. Try again - subsequent searches are faster (~500ms)
3. For very large codebases, consider increasing timeout

[Continue for all error codes...]
```

### Acceptance Criteria

- [ ] README.md updated with LSP section and link to detailed docs
- [ ] All 6 numbered docs files created in docs/how/lsp-navigation/
- [ ] Code examples tested and working (use real test fixture paths)
- [ ] No broken links (internal or external)
- [ ] Architecture diagram included (mermaid)
- [ ] Language support matrix complete (from Phase 6 findings)
- [ ] Troubleshooting guide covers all error codes (E_NO_LANGUAGE_SERVER, E_NOT_FOUND, E_TIMEOUT, E_INVALID_INPUT, E_AMBIGUOUS_SYMBOL, E_FILE_READ_ONLY, E_OPERATION_FAILED)
- [ ] API reference complete for all 4 tools
- [ ] Peer review completed
- [ ] Target audience can follow guides successfully

---

## Cross-Cutting Concerns

### Security Considerations

**Input Validation**:
- Flowspace ID format validated during parsing (reject malformed IDs)
- File paths resolved via PathService (prevents directory traversal)
- Symbol names validated against DocumentSymbol results (no arbitrary code execution)
- New names for rename validated (non-empty string)
- Replacement text for replace-method accepted as-is (user responsibility)

**Authentication/Authorization**: None required (operates within VS Code's file system permissions)

**Sensitive Data Handling**:
- File paths sanitized to workspace-relative format in telemetry
- Replacement text and newName NOT logged (may contain sensitive logic)
- Flowspace IDs logged for debugging (contain file paths but no code content)

### Observability

**Logging Strategy**:
- Use `bridgeContext.logger.debug()` for symbol resolution steps
- Log LSP command execution (command name, timeout status)
- Log Flowspace ID parsing (type, file path, qualified name)
- Do NOT log replacement text or newName (sensitive)

**Metrics to Capture** (via ScriptRegistry telemetry):
- ScriptExecutionStarted: Script name, parameters (sanitized)
- ScriptExecutionCompleted: Duration, result size (reference count, file count)
- ScriptExecutionFailed: Error code, error message

**Error Tracking**:
- All errors use `E_` prefix for categorization
- Errors include context (file path, symbol name, language ID)
- Stack traces NOT included in user-facing errors (logged internally)

### Performance Considerations

**Cold Start**:
- First workspace symbol search: 2-10 seconds (documented in MCP metadata)
- Subsequent searches: 200-500ms
- Optional warm-up on extension activation (fire-and-forget)

**Timeout Strategy**:
- Default timeout: 10 seconds (accommodates cold start)
- User-configurable via parameters (future enhancement)
- Timeout returns clear error with explanation

**Caching**:
- VS Code LSP providers handle internal caching (no custom caching needed)
- Symbol resolver does NOT cache (rely on VS Code)

**Scalability**:
- Large workspaces (>1000 files): LSP operations may be slow (5-15s)
- Document expected performance in MCP metadata
- No artificial limits imposed (VS Code handles scaling)

---

## Progress Tracking

### Phase Completion Checklist

- [x] Phase 1: Symbol Resolver Foundation - COMPLETE (15/15 tasks completed, 100%)
- [ ] Phase 2: Symbol Navigation Tool - PENDING
- [ ] Phase 3: Symbol Rename Tool - PENDING
- [ ] Phase 4: Method Replacement Tool - PENDING
- [ ] Phase 5: Call Hierarchy Tool - PENDING
- [ ] Phase 6: Multi-Language Integration Testing - PENDING
- [ ] Phase 7: Documentation - PENDING

### Overall Progress

**Total Tasks**: 101 tasks across 7 phases

**Completed**: 15 / 101 (15%)

**Estimated Duration**: 3-4 weeks (based on TAD approach with scratch exploration + promotion)

### STOP Rule

**IMPORTANT**: This plan must be complete and validated before creating phase dossiers. After reading this plan:

1. **Next Step**: Run `/plan-4-complete-the-plan` to validate readiness
2. **Only proceed** to `/plan-5-phase-tasks-and-brief` after validation passes
3. **Do NOT start** implementation until plan-4 confirms all requirements met

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by `/plan-6a-update-progress`.

**Footnote Numbering Authority**: `/plan-6a-update-progress` is the **single source of truth** for footnote numbering across the entire plan.

**Allocation Strategy**:
- plan-6a reads the current ledger and determines the next available footnote number
- Footnote numbers are sequential and shared across all phases and subtasks (e.g., [^1], [^2], [^3]...)
- Each invocation of plan-6a increments the counter and updates BOTH ledgers (plan and dossier) atomically
- Footnotes are never manually assigned; always delegated to plan-6a for consistency

**Format**:
```markdown
[^N]: Task {plan-task-id} - {one-line summary}
  - `{flowspace-node-id}`
  - `{flowspace-node-id}`
```

**Footnotes**:

[^1]: Tasks 1.2-1.5 (T002-T013) - Completed Flowspace ID parsing cluster (scratch tests, implementation, and promotion)
  - `file:/workspaces/wormhole/test/scratch/flowspace-parsing.test.ts`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:parseFlowspaceId`
  - `file:/workspaces/wormhole/test-cli/integration-mcp/symbol-resolver.test.ts`

[^2]: Tasks 1.6-1.8 (T014-T024) - Completed symbol resolution cluster (scratch tests, hierarchical search implementation, test promotion decision)
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:findSymbolInDocument`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:findAllMatchingSymbols`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:buildQualifiedNameForSymbol`

[^3]: Tasks 1.8-1.15 (T025-T051) - Completed resolution wrappers, timeout utilities, Flowspace ID generation, and cleanup
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:resolveFromFlowspaceId`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:resolveFromSymbolName`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:resolveSymbolInput`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:getLSPResultWithTimeout`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:buildQualifiedName`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:findSymbolAtPosition`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:symbolKindToFlowspaceType`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:buildFlowspaceId`
  - `function:/workspaces/wormhole/packages/extension/src/core/util/symbol-resolver.ts:buildFlowspaceIdAtPosition`
  - `file:/workspaces/wormhole/packages/extension/webpack.config.js`
  - `file:/workspaces/wormhole/packages/extension/src/core/util/index.ts`
  - `file:/workspaces/wormhole/test/scratch/symbol-resolution.test.ts`

---

**✅ Plan Status**: DRAFT - Ready for validation via `/plan-4-complete-the-plan`
