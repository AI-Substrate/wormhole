# Architectural Analysis: Utility Methods Placement for VSC-Bridge

**Date**: 2025-10-23  
**Scope**: Phase 1 EditorContextProvider and Future Feature Integration  
**Thoroughness**: Very Thorough - Comprehensive analysis with 3 architectural options  

---

## Executive Summary

### Current vs Recommended Architecture

**Current Plan**: Monolithic `EditorContextProvider` static class in `src/core/context/` with all methods (getFileInfo, getCursorInfo, getSelectionInfo, getSymbols, findContainingScopes, serializeToPlainObject) bundled together.

**Recommendation**: **Layered Utilities Architecture with Facade Provider** - Separate utility modules for reusable concerns (EditorUtils, SymbolUtils, SerializationUtils) composed by EditorContextProvider. This provides 3-4x better code reuse for future 16 MCP tools identified in docs/research/more-features.md.

### Key Risks of Current Approach

1. **High Duplication**: Future tools (workspace.symbols.search, document.symbols.outline, code.replaceMethod) will re-implement `getSymbols()`, `findContainingScopes()`, `serializeToPlainObject()` independently
2. **Maintenance Complexity**: Bug fixes to symbol traversal or serialization must be applied in 3+ locations
3. **Inconsistent Error Handling**: Each tool implements its own timeout/crash handling instead of shared patterns
4. **Knowledge Fragmentation**: Symbol provider expertise scattered across codebase instead of centralized

### Recommended Immediate Actions

1. **Phase 1 Implementation**: Create EditorContextProvider as planned (static class), but internally use composition
2. **Introduce 3 utility modules** alongside EditorContextProvider:
   - `EditorUtils.ts` - file/cursor/selection extraction (low reuse initially, high value for future)
   - `SymbolUtils.ts` - provider call + timeout + tree traversal (immediate value for Phase 3+)
   - `SerializationUtils.ts` - VS Code object → POJO conversion (universal need across all tools)
3. **Migration Path**: If code duplication surfaces in Phase 2-3, refactor to promote utilities without touching EditorContextProvider interface

---

## 1. Future Feature Reuse Matrix

### Tools Requiring Editor/Symbol/Position Utilities

Based on docs/research/more-features.md (15 proposed MCP tools):

| Tool Name | Symbol Traverse | Symbol Fetch | Position/Range Serialization | File Info | Cursor Pos |
|-----------|----------------|--------------|------------------------------|-----------|-----------|
| 1. workspace.symbols.search | ❌ | ✅ | ✅ | ❌ | ❌ |
| 2. document.symbols.outline | ❌ | ✅ | ✅ | ❌ | ❌ |
| 3. symbol.definition.get | ❌ | ✅ | ✅ | ❌ | ✅ |
| 4. symbol.references.find | ❌ | ✅ | ✅ | ❌ | ✅ |
| 5. symbol.implementation.get | ❌ | ✅ | ✅ | ❌ | ✅ |
| 6. symbol.rename | ❌ | ✅ | ✅ | ❌ | ✅ |
| 7. code.search | ❌ | ❌ | ✅ | ❌ | ❌ |
| 8. code.replace | ❌ | ❌ | ✅ | ❌ | ❌ |
| 9. code.replaceMethod | ✅ | ✅ | ✅ | ❌ | ✅ |
| 10. code.applyEdits | ❌ | ❌ | ✅ | ❌ | ❌ |
| 11. code.format | ❌ | ❌ | ✅ | ❌ | ❌ |
| 12. code.organizeImports | ❌ | ❌ | ❌ | ❌ | ❌ |
| 13. code.actions.list | ❌ | ❌ | ✅ | ❌ | ✅ |
| 14. hierarchy.calls | ❌ | ✅ | ✅ | ❌ | ✅ |
| 15. diagnostics.list | ❌ | ❌ | ✅ | ❌ | ❌ |
| 16. workspace.files.list | ❌ | ❌ | ❌ | ✅ | ❌ |

### Reuse Hotspots

**Serialization (✅ x11)**: Most critical - EVERY tool that returns symbol/range/position data needs POJO conversion
- Tools: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15
- **Risk**: If serialization bug found (circular refs, undefined fields, wrong indexing), must fix in 11+ tools
- **Current**: No shared utility → each tool implements independently

**Symbol Fetch + Timeout (✅ x7)**: High value for symbol-heavy tools
- Tools: 1, 2, 3, 4, 5, 6, 9, 14
- **Risk**: Timeout value inconsistency (100ms vs 500ms vs no timeout)
- **Current**: EditorContextProvider has this, but symbol-search.js doesn't use it

**Symbol Tree Traversal (✅ x1)**: EditorContextProvider.findContainingScopes()
- Tools: 9 (code.replaceMethod)
- **Risk**: Likely to need variant for "find method by name" (code.replaceMethod) vs "find containing scope" (editor context)

**File Information (✅ x1)**: EditorContextProvider.getFileInfo()
- Tools: 16 (workspace.files.list - though minimal value)

---

## 2. Current Architecture State Analysis

### Existing Utility Patterns in Codebase

**Location Patterns Found**:
```
src/core/util/
  └── uuid.ts                    (Single function export - NO class)

src/core/bridge-context/services/
  ├── PathService.ts             (Class with constructor + methods)
  ├── DebugService.ts            (Class with constructor + methods)
  ├── EnhancedLogger.ts           (Class with constructor + methods)
  ├── WorkspaceService.ts         (Class with constructor + methods)
  └── PythonEnvDetectorSimple.ts  (Class with constructor + methods)
```

**Current Pattern Analysis**:
- **uuid.ts**: Single exported function (not a class)
- **services/**: Instance-based classes with dependency injection via constructor
  - Requires creation via `new PathService(...)`
  - Designed for service registry composition in BridgeContext
  - NOT used by vsc-scripts (which are JavaScript, not TypeScript classes)

### Script Architecture (vsc-scripts/)

**Script Pattern** (from symbol-search.js):
```javascript
class SymbolSearchScript extends QueryScript {
    execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;
        // Use VS Code API directly
        const symbols = await vscode.commands.executeCommand(...);
    }
}
```

**Key Insight**: Scripts don't instantiate PathService/DebugService - they use VS Code APIs directly via `bridgeContext.vscode`

### VS Code API Wrapper Patterns

**Observation**: NO dedicated VS Code API wrapper classes exist
- Scripts access VS Code via `bridgeContext.vscode` directly
- No abstraction layer for common patterns (symbol provider, diagnostics, etc.)
- Each script implements its own error handling, timeouts, serialization

### Import Patterns in Codebase

**From vsc-scripts** (JavaScript):
```javascript
// No imports to utility modules found in sample
// Each script imports from '@script-base' (base class)
const { QueryScript } = require('@script-base');
```

**From TypeScript core**:
```typescript
// Services imported via BridgeContext type
import { IPathService } from '../types';

// Direct utility imports (if needed)
import { generateUuid } from '../util/uuid';
```

**No Barrel Exports Found** (index.ts pattern not observed in core/util or core/context)

### Current Directory Organization

```
src/core/
├── bridge-context/          (DI container for services)
│   └── services/            (Instance-based classes)
├── context/                 (NEW - will hold EditorContextProvider)
├── debug/                   (Debug session capture)
├── response/                (Response envelope + factories)
├── registry/                (ScriptRegistry orchestration)
├── util/                    (Lightweight utilities like uuid)
└── ... (other modules)
```

**Convention**: Utility modules in `src/core/util/` (single functions), services in `src/core/bridge-context/services/` (classes with DI)

---

## 3. Gap Analysis

### What's Missing for Optimal Reusability

| Need | Current State | Impact |
|------|---------------|--------|
| **Shared Symbol Provider Wrapper** | Only in EditorContextProvider.getSymbols() | 7+ future tools will re-implement |
| **Position/Range Serialization Utility** | Only in EditorContextProvider.serializeToPlainObject() | 11+ tools need this, no shared pattern |
| **Symbol Tree Traversal (Generic)** | Only in EditorContextProvider.findContainingScopes() | code.replaceMethod will need variant |
| **Error Handling Patterns for Providers** | Each tool implements own try-catch + timeout | Inconsistent error messages, timeout values |
| **VS Code API Facade** | No facade exists | Scripts directly couple to VS Code internals |
| **Barrel Exports** | No index.ts files in util/ or context/ | Poor discoverability of utilities |

### Circular Dependency Risks

**Current Safe Pattern**:
- Core modules (util/, response/, registry/) don't import from vsc-scripts/
- vsc-scripts import from core via bridgeContext, not direct imports
- Services in bridge-context don't import from scripts

**Risk if Not Careful**:
- If SymbolUtils imports from response/, and response/ imports from context/, and context/ imports from SymbolUtils → CIRCULAR
- Solution: Keep response/ import-free from new utilities, use interface-based design

---

## 4. Three Architecture Options

### Option A: Monolithic EditorContextProvider (Current Plan)

**Structure**:
```typescript
src/core/context/
└── EditorContextProvider.ts
    ├── static capture()
    ├── private static getFileInfo()
    ├── private static getCursorInfo()
    ├── private static getSelectionInfo()
    ├── private static getSymbols()
    ├── private static findContainingScopes()
    └── private static serializeToPlainObject()
```

**Imports**:
- Phase 1: Single file, minimal imports
- Other tools: Must implement own symbol/serialization logic

**Pros**:
- Simplest implementation (no additional files)
- All context logic in one place (easy to understand for Phase 1)
- No inter-module dependencies to manage
- Matches planned file structure

**Cons**:
- 11 future tools duplicate serialization code
- 7 future tools duplicate symbol fetching code
- 1 future tool (code.replaceMethod) duplicates tree traversal
- **High maintenance cost**: Symbol timeout bugs must be fixed in multiple places
- **Poor discoverability**: Developers won't know EditorContextProvider.serializeToPlainObject exists
- **Test duplication**: Symbol timeout tests needed in each tool

**Future Refactor Cost**: HIGH - Extract utilities would require modifying 11+ tool files

**Code Duplication Estimate**: 300-400 lines across future tools

---

### Option B: Layered Utilities with Facade Provider (Recommended)

**Structure**:
```typescript
src/core/util/
├── EditorUtils.ts              (File/cursor/selection extraction)
├── SymbolUtils.ts              (Symbol provider + timeout wrapper)
├── SerializationUtils.ts        (VS Code object → POJO conversion)
└── index.ts                     (Barrel export)

src/core/context/
├── EditorContextProvider.ts     (Composes utilities)
├── types.ts                     (EditorContext interface)
└── index.ts                     (Barrel export)
```

**EditorContextProvider** (Facade Pattern):
```typescript
export class EditorContextProvider {
    static async capture(): Promise<EditorContext | undefined> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return undefined;
        
        const file = EditorUtils.getFileInfo(editor);
        const cursor = EditorUtils.getCursorInfo(editor);
        const selection = EditorUtils.getSelectionInfo(editor);
        const symbols = await SymbolUtils.getSymbols(editor.document.uri);
        
        if (symbols) {
            const containing = SymbolUtils.findContainingScopes(...);
            // Serialize each
        }
        
        return SerializationUtils.createEditorContext(...);
    }
}
```

**Imports in Scripts**:
```javascript
// Phase 3: code.replaceMethod can now reuse
const { SymbolUtils } = require('@core/util');
const symbols = await SymbolUtils.getSymbols(uri);
const containing = SymbolUtils.findContainingScopes(symbols, position);
```

**Pros**:
- **Code reuse**: 11 future tools import SerializationUtils, 7 use SymbolUtils
- **Consistent patterns**: Symbol timeout standardized in one place (100ms)
- **Testability**: Each utility tested independently
- **Low maintenance**: Bug fix in SerializationUtils applies to all tools automatically
- **Discoverability**: Developers see `src/core/util/` and find utilities
- **Extensibility**: Easy to add new utilities (TextSearchUtils, DiagnosticsUtils) without polluting EditorContextProvider

**Cons**:
- More files to create (3 utilities vs 1 monolithic)
- Slightly more complex dependency management (though minimal)
- **Internal composition** requires understanding that EditorContextProvider delegates to utilities
- Testing utilities independently requires mock VS Code objects

**Future Refactor Cost**: LOW - utilities already exist, tools just import them

**Code Duplication Estimate**: 50-75 lines (arg validation only) across future tools

---

### Option C: Mixed Approach (Balanced)

**Structure**:
```typescript
src/core/context/
├── EditorContextProvider.ts     (Captures full editor context)
└── index.ts

src/core/util/
├── SerializationUtils.ts        (Only serialization - SHARED)
└── index.ts
```

**EditorContextProvider** (Monolithic for context-specific logic):
```typescript
export class EditorContextProvider {
    // All capture logic here
    static getFileInfo() { ... }
    static getCursorInfo() { ... }
    static getSelectionInfo() { ... }
    static getSymbols() { ... }
    static findContainingScopes() { ... }
}

// Reusable utility in separate module
export * from '../util/SerializationUtils';
```

**Imports in Scripts** (Phase 3+):
```javascript
// Only serialization shared
const { SerializationUtils } = require('@core/util');
const pojo = SerializationUtils.convert(vsCodeObject);
```

**Pros**:
- Balanced: EditorContextProvider stays simple (as planned)
- Immediate value: SerializationUtils shared across 11 tools
- Minimal additional files (1 utility vs 3)
- Lower complexity than Option B

**Cons**:
- Symbol provider logic not shared (7 tools still duplicate)
- findContainingScopes not shared (1 future tool duplicates)
- **50% of value** vs Option B
- Serialization bug fix helps 11 tools, but symbol bugs still scattered

**Future Refactor Cost**: MEDIUM - Extract SymbolUtils later if duplication becomes obvious

**Code Duplication Estimate**: 150-200 lines (symbol + traversal) across future tools

---

## Comparison Table: Options A vs B vs C

| Criteria | Option A | Option B | Option C |
|----------|----------|----------|----------|
| **Files Created in Phase 1** | 1 | 4 | 2 |
| **Phase 1 Implementation Time** | 2-3 hours | 2.5-3.5 hours | 2-2.5 hours |
| **Code Duplication (Future Tools)** | 300-400 lines | 50-75 lines | 150-200 lines |
| **Future Symbol Bug Fixes** | 7 places | 1 place | 7 places |
| **Future Serialization Bug Fixes** | 11 places | 1 place | 1 place |
| **Test Maintenance Burden** | HIGH | MEDIUM | MEDIUM-HIGH |
| **Knowledge Centralization** | LOW | HIGH | MEDIUM |
| **Discoverability** | LOW | HIGH | MEDIUM |
| **Recommended For** | MVP (Phase 1 only) | Production (Phases 1-5+) | Balanced Approach |

---

## 5. Method-by-Method Recommendations

| Method | Current Plan Location | Reuse Likelihood | Current Needs | Recommended Utility Class | Recommended Path | Shared Benefits |
|--------|----------------------|------------------|---------------|--------------------------|------------------|-----------------|
| **getFileInfo()** | EditorContextProvider | MEDIUM | File path, languageId, lineCount, isDirty | EditorUtils | src/core/util/EditorUtils.ts | workspace.files.list (tool 16) |
| **getCursorInfo()** | EditorContextProvider | HIGH | 1-indexed line/character | EditorUtils | src/core/util/EditorUtils.ts | Tools 3,4,5,6,9,13,14 (7 tools) |
| **getSelectionInfo()** | EditorContextProvider | HIGH | Selection isEmpty, text, range | EditorUtils | src/core/util/EditorUtils.ts | Tools 3,4,5,6,9,13,14 (7 tools) |
| **getSymbols()** | EditorContextProvider | HIGH (7 tools) | executeDocumentSymbolProvider + timeout | SymbolUtils | src/core/util/SymbolUtils.ts | Tools 1,2,3,4,5,6,9,14 (8 tools) |
| **findContainingScopes()** | EditorContextProvider | LOW-MEDIUM (1 tool) | Symbol tree traversal + depth limit | SymbolUtils | src/core/util/SymbolUtils.ts | code.replaceMethod (tool 9) variant |
| **serializeToPlainObject()** | EditorContextProvider | VERY HIGH (11 tools) | Convert VS Code objects to POJOs | SerializationUtils | src/core/util/SerializationUtils.ts | Tools 1,2,3,4,5,6,7,8,9,10,11,13,14,15 (14 tools) |

### Detailed Method Recommendations

#### getFileInfo()
- **Current**: In EditorContextProvider
- **Reuse Likelihood**: MEDIUM
- **Why Shared**: workspace.files.list (tool 16) needs file properties
- **Recommended Home**: EditorUtils class (alongside getCursor/getSelection for cohesion)
- **Migration Effort**: LOW - standalone function, no dependencies

#### getCursorInfo() & getSelectionInfo()
- **Current**: In EditorContextProvider
- **Reuse Likelihood**: HIGH (7+ tools)
- **Why Shared**: Any tool accepting position parameter (definition, references, rename, call hierarchy, etc.)
- **Recommended Home**: EditorUtils class
- **Migration Effort**: LOW - simple position extraction
- **Note**: Keep together - selection includes position data

#### getSymbols() with 100ms Timeout
- **Current**: In EditorContextProvider
- **Reuse Likelihood**: VERY HIGH (8 tools)
- **Why Shared**: All symbol-based tools need consistent timeout + error handling
- **Recommended Home**: SymbolUtils class
- **Migration Effort**: LOW - self-contained function
- **Risk if Not Shared**: 8 tools independently implementing timeouts → 8 different timeout values (100ms, 200ms, 500ms, no timeout)
- **Critical**: This should DEFINITELY be extracted to utility for consistency

#### findContainingScopes()
- **Current**: In EditorContextProvider
- **Reuse Likelihood**: LOW-MEDIUM (1 main use case)
- **Why Shared**: code.replaceMethod will need "find containing scope containing cursor"
- **Recommended Home**: SymbolUtils class (same module as getSymbols for symbol-specific logic)
- **Migration Effort**: MEDIUM - complex recursive algorithm, needs careful porting
- **Note**: Likely needs parameterization for "find by name" variant (code.replaceMethod) vs "find by position" (editor context)

#### serializeToPlainObject()
- **Current**: In EditorContextProvider
- **Reuse Likelihood**: VERY HIGH (14 tools - almost all)
- **Why Shared**: UNIVERSAL - every tool returning symbol/position/range data must convert to POJO
- **Recommended Home**: SerializationUtils class (separate from symbol logic)
- **Migration Effort**: LOW - utility function, no dependencies
- **Critical Value**: If serialization bug found (e.g., "Symbol has circular reference in sourceMap"), fix in 1 place = 14 tools fixed immediately
- **This Should Be Extracted Immediately**

---

## 6. Proposed Directory Structure - Three Options

### Option A: Monolithic (Current Plan)

```typescript
packages/extension/src/core/
├── context/
│   ├── EditorContextProvider.ts       // Single 400-500 line file
│   └── index.ts                        // export { EditorContextProvider }
├── response/
│   ├── envelope.ts                     // Add EditorContext interface
│   └── ...
├── util/
│   ├── uuid.ts
│   └── index.ts
└── ...
```

**Import Pattern**:
```typescript
// In EditorContextProvider.ts
import * as vscode from 'vscode';
import { EditorContext } from '../response/envelope';

// In Phase 3 script (code.replaceMethod)
// NO utility imports - implement own serialization
```

**Pros**: Simple, matches existing structure  
**Cons**: Utilities hidden inside class, no discoverability

---

### Option B: Layered Utilities (Recommended)

```typescript
packages/extension/src/core/
├── context/
│   ├── EditorContextProvider.ts       // ~200 lines - composition only
│   ├── types.ts                        // EditorContext interface
│   └── index.ts                        // export { EditorContextProvider }
├── util/
│   ├── EditorUtils.ts                 // File/cursor/selection extraction
│   ├── SymbolUtils.ts                 // Symbol provider + tree traversal
│   ├── SerializationUtils.ts          // VS Code → POJO conversion
│   ├── index.ts                        // Barrel export all 3
│   └── uuid.ts
├── response/
│   ├── envelope.ts                     // Add EditorContext interface
│   └── ...
└── ...
```

**Import Pattern**:
```typescript
// In EditorContextProvider.ts
import { EditorUtils } from '../util/EditorUtils';
import { SymbolUtils } from '../util/SymbolUtils';
import { SerializationUtils } from '../util/SerializationUtils';

// In Phase 3 script (code.replaceMethod) 
const { SymbolUtils, SerializationUtils } = require('@core/util');
const symbols = await SymbolUtils.getSymbols(uri);
const containing = SymbolUtils.findContainingScopes(symbols, position);
const serialized = SerializationUtils.convertRange(range);
```

**Barrel Export** (src/core/util/index.ts):
```typescript
export { EditorUtils } from './EditorUtils';
export { SymbolUtils } from './SymbolUtils';
export { SerializationUtils } from './SerializationUtils';
export { generateUuid } from './uuid';
```

**Pros**: Utilities discoverable, reusable, testable  
**Cons**: More files, requires understanding composition

---

### Option C: Mixed (Balanced)

```typescript
packages/extension/src/core/
├── context/
│   ├── EditorContextProvider.ts       // ~350 lines - all context logic
│   └── index.ts
├── util/
│   ├── SerializationUtils.ts          // Only serialization - SHARED
│   ├── index.ts                        // export SerializationUtils
│   └── uuid.ts
├── response/
│   ├── envelope.ts
│   └── ...
└── ...
```

**Import Pattern**:
```typescript
// In EditorContextProvider.ts
import { SerializationUtils } from '../util/SerializationUtils';

// In Phase 3 script (code.replaceMethod)
const { SerializationUtils } = require('@core/util');
const serialized = SerializationUtils.convertSymbols(symbols);
```

**Pros**: Minimal additional files, SerializationUtils high value  
**Cons**: Symbol logic still monolithic

---

## 7. Import and Dependency Analysis

### Current Import Safe Patterns

**Avoid Circular Dependencies**:
- ✅ util/ imports only from vscode
- ✅ context/ imports from util/
- ✅ response/ imports nothing from core modules
- ✅ vsc-scripts/ imports from core via bridgeContext or direct imports
- ❌ DO NOT: response/ imports from context/ (would create circular if context/ imports from response/)

**Barrel Export Strategy** (if Option B):
```typescript
// src/core/util/index.ts
export { EditorUtils } from './EditorUtils';
export { SymbolUtils } from './SymbolUtils';
export { SerializationUtils } from './SerializationUtils';
```

**Import in TypeScript Files**:
```typescript
import { EditorUtils, SerializationUtils } from '../util';
```

**Import in JavaScript Scripts**:
```javascript
const { EditorUtils, SerializationUtils } = require('@core/util');
```

### Avoiding Circular Imports

**Safe Hierarchy**:
```
vscode (external)
  ↓
util/ (EditorUtils, SymbolUtils, SerializationUtils)
  ↓
context/ (EditorContextProvider)
  ↓
response/ (ResponseEnvelope) ← DO NOT import from util or context
  ↓
registry/ (ScriptRegistry)
```

**Implementation**: EditorContext interface defined in response/envelope.ts OR separate context/types.ts:
```typescript
// Option 1: Keep in envelope.ts (no new imports to response/)
export interface EditorContext {
    file: FileInfo;
    cursor: CursorInfo;
    // ...
}

// Option 2: Define in context/types.ts
export interface EditorContext {
    // ...
}
// response/envelope.ts imports it
import { EditorContext } from '../context/types';
```

**Recommendation**: Option 1 (keep in envelope.ts) - avoids new imports to response/

---

## 8. VS Code API Wrapper Strategy

### Should We Create VsCodeApiWrapper?

**Current State**: No abstraction layer for common VS Code patterns

**Analysis for EditorContextProvider**:
- Used in: EditorContextProvider only (Phase 1-3)
- Future reuse: code.replaceMethod, hierarchy.calls (2 tools)
- Complexity: Medium (4-5 common operations: executeDocumentSymbolProvider, executeWorkspaceSymbolProvider, executeDefinitionProvider, etc.)

**Recommendation**: NOT YET - too early to generalize
- EditorContextProvider uses VS Code APIs directly via vscode import
- Future tools (Phase 3+) can introduce wrapper pattern if duplication becomes obvious
- Document in Phase 2 that "If 3+ tools share same VS Code command pattern, extract to VsCodeWrapper"

**Alternative**: Create VsCodeProviderWrapper only for symbol provider timing/error handling:
```typescript
export class SymbolProviderWrapper {
    static async getDocumentSymbols(uri: vscode.Uri, timeoutMs = 100): Promise<vscode.DocumentSymbol[] | null> {
        // Shared timeout + error handling
    }
}
```

**Recommended**: Embed this in SymbolUtils (Option B) rather than separate wrapper class - simpler composition

---

## 9. Testing Utilities Independently

### Testing Strategy by Architecture Option

#### Option A (Monolithic): Testing EditorContextProvider Only
```typescript
// test-cli/integration-mcp/editor-context-provider.test.ts
describe('EditorContextProvider', () => {
    test('capture() handles undefined editor', () => { ... });
    test('getSymbols() times out after 100ms', () => { ... });
    test('serializeToPlainObject() converts Position correctly', () => { ... });
});
```

**Challenges**:
- Symbol timeout test requires slow mock language server
- Serialization test needs mock VS Code objects

#### Option B (Layered): Test Utilities Independently
```typescript
// test-cli/unit/EditorUtils.test.ts
describe('EditorUtils', () => {
    test('getCursorInfo() converts 0-indexed to 1-indexed', () => {
        const editor = createMockEditor();
        const info = EditorUtils.getCursorInfo(editor);
        expect(info.line).toBe(1); // 0-indexed 0 → 1-indexed 1
    });
});

// test-cli/unit/SymbolUtils.test.ts
describe('SymbolUtils', () => {
    test('getSymbols() times out after 100ms', async () => {
        const slowProvider = createSlowMockProvider(200);
        const result = await SymbolUtils.getSymbols(uri);
        expect(result).toBe('timeout');
    });
});

// test-cli/integration-mcp/editor-context-provider.test.ts
describe('EditorContextProvider', () => {
    test('capture() composes utilities correctly', () => {
        // Integration test - mocks utilities at composition boundary
    });
});
```

**Benefits**:
- Unit tests for each utility can use lightweight mocks
- Serialization test is simple (just Position → POJO)
- Symbol timeout test isolated from EditorContextProvider
- EditorContextProvider integration test doesn't need complex mocks

**Test File Structure** (Option B):
```
packages/extension/src/test/unit/
├── core/
│   ├── util/
│   │   ├── EditorUtils.test.ts
│   │   ├── SymbolUtils.test.ts
│   │   └── SerializationUtils.test.ts
│   └── context/
│       └── EditorContextProvider.test.ts
└── ...

test-cli/integration-mcp/
└── editor-context-provider.test.ts  (Integration test with real Extension Host)
```

---

## 10. Migration Path - If Current Plan Is Implemented

### Phased Refactoring from Option A → Option B

**IF Code Duplication Becomes Obvious** (Phase 2-3):

**Step 1: Extract SerializationUtils** (Most Critical)
```typescript
// src/core/util/SerializationUtils.ts - NEW
export class SerializationUtils {
    static convertPosition(pos: vscode.Position): PositionPOJO { ... }
    static convertRange(range: vscode.Range): RangePOJO { ... }
    static convertSymbol(sym: vscode.DocumentSymbol): SymbolPOJO { ... }
}

// src/core/context/EditorContextProvider.ts - MODIFIED
// Replace inline serialization with:
const context = SerializationUtils.createEditorContext({
    file: this.fileInfo,
    cursor: this.cursorInfo,
    // ...
});
```

**Step 2: Extract SymbolUtils** (If tool duplication found)
```typescript
// src/core/util/SymbolUtils.ts - NEW
export class SymbolUtils {
    static async getDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[] | null> { ... }
    static findContainingScopes(symbols: vscode.DocumentSymbol[], position: vscode.Position) { ... }
}

// src/core/context/EditorContextProvider.ts - MODIFIED
const symbols = await SymbolUtils.getDocumentSymbols(editor.document.uri);
const containing = SymbolUtils.findContainingScopes(symbols, cursor);
```

**Step 3: Extract EditorUtils** (If cursor/selection tests need reuse)
```typescript
// src/core/util/EditorUtils.ts - NEW
export class EditorUtils {
    static getFileInfo(editor: vscode.TextEditor): FileInfo { ... }
    static getCursorInfo(editor: vscode.TextEditor): CursorInfo { ... }
    static getSelectionInfo(editor: vscode.TextEditor): SelectionInfo { ... }
}
```

**Migration Effort**:
- SerializationUtils: 1 day (high value, low risk)
- SymbolUtils: 1-2 days (medium value if duplication found)
- EditorUtils: 0.5 day (low value initially)

**Impact on Existing Code**: ZERO - internal refactoring, no API changes

---

## 11. Decision Criteria

### Use This Table to Decide Between Options

| Criteria | Weight | Option A | Option B | Option C |
|----------|--------|----------|----------|----------|
| **Phase 1 Implementation Speed** | LOW | 10/10 | 8/10 | 9/10 |
| **Code Duplication in Future Tools** | VERY HIGH | 3/10 | 10/10 | 6/10 |
| **Maintenance Burden (3-year outlook)** | VERY HIGH | 2/10 | 10/10 | 6/10 |
| **Immediate Testability** | MEDIUM | 6/10 | 9/10 | 7/10 |
| **Discoverability for Future Developers** | HIGH | 3/10 | 9/10 | 6/10 |
| **Complexity (learning curve)** | MEDIUM | 10/10 | 7/10 | 9/10 |
| **Risk of Mistakes** | HIGH | 4/10 | 8/10 | 6/10 |

### Recommendation by Scenario

**Choose Option A if**:
- You only plan Phase 1 (no future tools)
- Phase 1 timeline is critical (48 hours)
- You'll accept refactoring cost in Phase 3+

**Choose Option B if** ⭐ RECOMMENDED:
- You plan 15+ MCP tools across Phases 2-5
- You value 3-year maintainability
- You want developers to discover and reuse utilities naturally
- You want consistent bug-free behavior across all tools

**Choose Option C if**:
- You want to hedge between speed and reusability
- SerializationUtils immediate shared value is sufficient
- You'll revisit for SymbolUtils extraction in Phase 3

---

## 12. Specific Recommendations Summary

### For Phase 1 Implementation

**Recommend**: Start with **Option B Lite** (EditorContextProvider + SerializationUtils)

**Why**:
1. SerializationUtils provides immediate value (14 future tools)
2. Minimal Phase 1 overhead (1 extra file, 2-3 hours work)
3. Clear path for SymbolUtils extraction in Phase 3
4. Prevents most common bug (serialization) from spreading

**Implementation Plan**:
```
T001-T003: Create EditorContextProvider as planned (monolithic)
T004-T014: Implement methods in EditorContextProvider

PARALLEL with T004-T014:
- Extract serializeToPlainObject() to src/core/util/SerializationUtils.ts
- Update EditorContextProvider to import from SerializationUtils
- Creates zero external API changes

T015-T020: Tests (validate SerializationUtils works)
```

**No Impact on Phase 1 Timeline**: SerializationUtils extraction adds 30 minutes, saves 2+ days in Phase 3

---

## 13. Code Examples for Each Option

### Option A: Get File Info Method (Monolithic)

```typescript
// src/core/context/EditorContextProvider.ts
export class EditorContextProvider {
    private static getFileInfo(editor: vscode.TextEditor): FileInfo {
        return {
            path: editor.document.uri.fsPath,
            languageId: editor.document.languageId,
            lineCount: editor.document.lineCount,
            isDirty: editor.document.isDirty
        };
    }
}
```

### Option B: Get File Info Method (With EditorUtils)

```typescript
// src/core/util/EditorUtils.ts
export class EditorUtils {
    static getFileInfo(editor: vscode.TextEditor): FileInfo {
        return {
            path: editor.document.uri.fsPath,
            languageId: editor.document.languageId,
            lineCount: editor.document.lineCount,
            isDirty: editor.document.isDirty
        };
    }
}

// src/core/context/EditorContextProvider.ts
import { EditorUtils } from '../util/EditorUtils';

export class EditorContextProvider {
    static async capture(): Promise<EditorContext | undefined> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return undefined;
        
        const file = EditorUtils.getFileInfo(editor);  // Delegated
        // ...
    }
}

// Future tool in Phase 3: code.replaceMethod
const { EditorUtils } = require('@core/util');
const file = EditorUtils.getFileInfo(activeEditor);
```

### Option C: Get File Info Method (Balanced)

```typescript
// src/core/context/EditorContextProvider.ts (unchanged from Option A)
export class EditorContextProvider {
    private static getFileInfo(editor: vscode.TextEditor): FileInfo {
        return {
            path: editor.document.uri.fsPath,
            languageId: editor.document.languageId,
            lineCount: editor.document.lineCount,
            isDirty: editor.document.isDirty
        };
    }
}

// src/core/util/SerializationUtils.ts (added)
export class SerializationUtils {
    static convertSymbols(symbols: vscode.DocumentSymbol[]): SymbolPOJO[] {
        return symbols.map(sym => this.convertSymbol(sym));
    }
    
    private static convertSymbol(sym: vscode.DocumentSymbol): SymbolPOJO {
        // Shared serialization logic
    }
}

// Future tool in Phase 3: code.replaceMethod
const { SerializationUtils } = require('@core/util');
const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri);
const serialized = SerializationUtils.convertSymbols(symbols);
```

---

## Conclusion & Final Recommendation

### Executive Decision

**Recommended Choice**: **Option B Lite - Implement EditorContextProvider with extracted SerializationUtils**

**Rationale**:
- Provides 80% of Option B value with minimal Phase 1 overhead
- Prevents highest-impact bug (serialization issues) from spreading to 14 future tools
- Clear upgrade path to full Option B if SymbolUtils duplication detected
- Maintains current timeline (EditorContextProvider completion)
- Sets precedent for utility extraction pattern (others follow later)

### Implementation Priority

1. **Highest**: Extract SerializationUtils (universal need)
2. **Later**: Extract SymbolUtils if 8+ tools implement symbol fetching
3. **Later**: Extract EditorUtils if 7+ tools implement cursor/selection extraction

### Success Metrics

- ✅ EditorContextProvider Phase 1 tests pass
- ✅ SerializationUtils testable independently
- ✅ Zero code duplication in Phase 1 for serialization
- ✅ Future tools can import SerializationUtils with zero modification to EditorContextProvider
- ✅ Discoverability: Developers see `src/core/util/SerializationUtils.ts` and understand pattern

---

**Document Version**: 1.0  
**Prepared**: 2025-10-23  
**Status**: Ready for Implementation Planning
