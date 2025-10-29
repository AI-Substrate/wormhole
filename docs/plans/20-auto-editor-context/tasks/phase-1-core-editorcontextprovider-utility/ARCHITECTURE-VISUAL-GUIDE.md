# Visual Architecture Guide - EditorContextProvider Utilities

Quick visual reference for the three architectural options.

---

## Option A: Monolithic (Current Plan)

```
┌─────────────────────────────────────────────┐
│ src/core/context/                           │
│                                             │
│ EditorContextProvider.ts                    │
│ ├── static capture()                        │
│ ├── private getFileInfo()                   │
│ ├── private getCursorInfo()                 │
│ ├── private getSelectionInfo()              │
│ ├── private getSymbols()                    │
│ ├── private findContainingScopes()          │
│ └── private serializeToPlainObject()        │
│                                             │
│ ⚠️  400-500 lines, everything together      │
└─────────────────────────────────────────────┘

                    ↓

┌─────────────────────────────────────────────┐
│ Future Phase 3+ Tools                       │
│                                             │
│ Each tool implements own serialization:     │
│ ❌ convertPosition()                        │
│ ❌ convertRange()                           │
│ ❌ convertSymbol()                          │
│ ❌ (duplicated logic 14 times)              │
└─────────────────────────────────────────────┘

COST: 14 tools × 30-40 lines = 420-560 lines duplication
BUG IMPACT: Fix serialization? Update 14 tools.
```

---

## Option B: Layered Utilities (RECOMMENDED)

```
┌────────────────────────────────────────────────────┐
│ src/core/util/                                     │
│                                                    │
│ ┌─────────────────────────┐                        │
│ │ EditorUtils.ts          │  file/cursor/selection │
│ └─────────────────────────┘                        │
│          ↓                                          │
│ ┌─────────────────────────┐                        │
│ │ SymbolUtils.ts          │  symbols + timeout    │
│ │ - getDocumentSymbols()  │  + tree traversal     │
│ │ - findContainingScopes()│                        │
│ └─────────────────────────┘                        │
│          ↓                                          │
│ ┌─────────────────────────┐                        │
│ │ SerializationUtils.ts   │  UNIVERSAL - used     │
│ │ - convertPosition()     │  by ALL future tools  │
│ │ - convertRange()        │  (14+ tools)          │
│ │ - convertSymbol()       │                        │
│ └─────────────────────────┘                        │
│          ↑                                          │
│ ┌─────────────────────────┐                        │
│ │ index.ts (barrel)       │  export all 3         │
│ └─────────────────────────┘                        │
└────────────────────────────────────────────────────┘

        ↓           ↓                    ↓

┌──────────────────────────────────────────────────────────┐
│ src/core/context/EditorContextProvider.ts               │
│ ~200 lines - composition only                           │
│                                                         │
│ static async capture() {                                │
│   const file = EditorUtils.getFileInfo(editor);        │
│   const cursor = EditorUtils.getCursorInfo(editor);    │
│   const symbols = await SymbolUtils.getSymbols(uri);   │
│   const containing = SymbolUtils.findContaining...();  │
│   return SerializationUtils.createContext(...);        │
│ }                                                       │
└──────────────────────────────────────────────────────────┘

        ↓           ↓                    ↓

┌──────────────────────────────────────────────────────────┐
│ Future Phase 3+ Tools                                    │
│                                                         │
│ // code.replaceMethod (tool 9)                         │
│ const { SymbolUtils, SerializationUtils } = require(..);
│ const symbols = await SymbolUtils.getSymbols(uri);     │
│ const containing = SymbolUtils.findContaining...();    │
│ const pojo = SerializationUtils.convertSymbols(...);   │
│                                                         │
│ // workspace.symbols.search (tool 1)                   │
│ const { SerializationUtils } = require(...);           │
│ const pojo = SerializationUtils.convertSymbols(...);   │
│ (14 tools total use SerializationUtils)                │
└──────────────────────────────────────────────────────────┘

COST: 14 tools × 5-10 lines = 70-140 lines duplication (vs 420-560)
BUG IMPACT: Fix serialization? Update 1 utility = FIXES 14 tools.
```

---

## Option C: Mixed (SerializationUtils Only)

```
┌─────────────────────────────────────┐
│ src/core/context/                   │
│ EditorContextProvider.ts            │
│ ├── static capture()                │
│ ├── private getFileInfo()           │
│ ├── private getCursorInfo()         │
│ ├── private getSelectionInfo()      │
│ ├── private getSymbols()            │
│ ├── private findContainingScopes()  │
│ └── private serializeToPlainObject()│ (delegated)
└─────────────────────────────────────┘
        ↓
┌──────────────────────────────────────┐
│ src/core/util/                       │
│ SerializationUtils.ts (only this)    │
│ - convertPosition()                  │
│ - convertRange()                     │
│ - convertSymbol()                    │
└──────────────────────────────────────┘

        ↓

┌──────────────────────────────────────────┐
│ Future Phase 3+ Tools                    │
│                                          │
│ (11 tools use SerializationUtils) ✓      │
│ (7 tools still duplicate getSymbols) ❌  │
│ (1 tool still duplicate traversal) ❌    │
└──────────────────────────────────────────┘

COST: 50% reduction in duplication (vs Option A)
BUG IMPACT: Serialization bugs fixed in 1 place, symbol bugs in 7 places
```

---

## Dependency Graph Comparison

### Option A: No Dependencies (Isolated)
```
vscode API
    ↓
EditorContextProvider (self-contained)
    ↓
ResponseEnvelope
```

### Option B: Clear Layers (Recommended)
```
vscode API
    ↓
┌─────────────────────────┐
│ SerializationUtils      │ ← Can be used by ALL future tools
│ SymbolUtils             │ ← Can be used by symbol-heavy tools
│ EditorUtils             │ ← Can be used by editor position tools
└─────────────────────────┘
    ↓
EditorContextProvider (composition)
    ↓
ResponseEnvelope
```

### Option C: Partial Layers (Balanced)
```
vscode API
    ↓
┌─────────────────────┐
│ SerializationUtils  │ ← Only this shared
└─────────────────────┘
    ↓
EditorContextProvider (monolithic + uses SerializationUtils)
    ↓
ResponseEnvelope
```

---

## Reuse Scenarios - Which Option Wins?

### Scenario 1: Fix Position Serialization Bug
**Problem**: Off-by-one error in `convertPosition()` (line vs character indexing)

| Option A | Option B | Option C |
|----------|----------|----------|
| ❌ Fix in EditorContextProvider | ✅ Fix SerializationUtils | ✅ Fix SerializationUtils |
| ❌ Fix in tool 1 | 📈 Automatically fixes 14 tools | 📈 Automatically fixes 14 tools |
| ❌ Fix in tool 2 | | |
| ... (14 locations) | | |
| **Time**: 4 hours | **Time**: 15 min | **Time**: 15 min |

### Scenario 2: Add New Tool - code.replaceMethod (tool 9)

#### Option A (Monolithic)
```typescript
// Must implement all from scratch
async findMethodByName(uri, methodName) {
    const symbols = await vscode.commands.executeCommand(...);
    if (!symbols) return null;
    const found = this.findSymbolByName(symbols, methodName);
    return this.serializeSymbol(found);
}
```
**Time**: 3 hours (rewriting everything)

#### Option B (Layered)
```typescript
// Reuse utilities
const symbols = await SymbolUtils.getSymbols(uri);
const method = SymbolUtils.findSymbolByName(symbols, methodName);
const pojo = SerializationUtils.convertSymbol(method);
```
**Time**: 30 minutes (just composition)

#### Option C (Balanced)
```typescript
// Reuse only serialization, rewrite symbol logic
const symbols = await vscode.commands.executeCommand(...);
const found = this.findSymbolByName(symbols, methodName); // Duplicate
const pojo = SerializationUtils.convertSymbol(found); // Reuse
```
**Time**: 2 hours (half-reuse)

---

## Implementation Time Estimates

| Option | Phase 1 | Phase 3 (tool 9) | Phase 4 (tool 1) | Total |
|--------|---------|-----------------|-----------------|-------|
| **A** | 3 hours | 3 hours | 3 hours | 9 hours |
| **B** | 3.5 hours | 0.5 hours | 0.5 hours | 4.5 hours |
| **C** | 3 hours | 1.5 hours | 1.5 hours | 6 hours |

**B Wins**: 9 - 4.5 = 4.5 hours saved (= $450-900 in engineering time)

---

## File Structure Final Comparison

### Option A
```
packages/extension/src/core/
├── context/
│   ├── EditorContextProvider.ts    (400-500 lines)
│   └── index.ts
├── response/
│   └── envelope.ts
└── util/
    └── uuid.ts
```

### Option B (Recommended)
```
packages/extension/src/core/
├── context/
│   ├── EditorContextProvider.ts    (200 lines)
│   ├── types.ts                    (types)
│   └── index.ts
├── util/
│   ├── EditorUtils.ts
│   ├── SymbolUtils.ts
│   ├── SerializationUtils.ts
│   ├── index.ts                    (barrel export)
│   └── uuid.ts
├── response/
│   └── envelope.ts
└── ...
```

### Option C
```
packages/extension/src/core/
├── context/
│   ├── EditorContextProvider.ts    (350-400 lines)
│   └── index.ts
├── util/
│   ├── SerializationUtils.ts
│   ├── index.ts                    (barrel export)
│   └── uuid.ts
├── response/
│   └── envelope.ts
└── ...
```

---

## Decision Flow Chart

```
START: Should we extract utilities?
    ↓
Planning 15+ MCP tools in next 2 years?
    ↓
    YES → Value consistent bug fixes? → YES → Option B (RECOMMENDED)
    NO  → Quick Phase 1 only?         → YES → Option A
    │                                   NO  → Option C
    └─ Not sure yet?                       → Option C (hedge)
```

---

## Bottom Line

| Factor | A | B | C |
|--------|---|---|---|
| **Phase 1 Speed** | Fast | Slow | Medium |
| **Total Project Cost** | HIGH | MEDIUM | MEDIUM-HIGH |
| **Code Quality** | LOW (duplication) | HIGH | MEDIUM |
| **Future Maintainability** | BAD | EXCELLENT | OK |
| **For 15+ tools** | ❌ | ✅ | ⚠️ |

**Recommendation**: **Option B** - 30 minutes extra work in Phase 1, saves 4+ hours across Phases 2-5.

---

**Last Updated**: 2025-10-23
