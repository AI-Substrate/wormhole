# Utility Architecture Analysis - Executive Summary

**Full Report**: `/workspaces/wormhole/docs/research/utility-architecture-analysis.md` (934 lines, 13 sections)

---

## Quick Findings

### Current Plan Problem
The planned monolithic `EditorContextProvider` class will create:
- **300-400 lines of duplication** across 11+ future MCP tools
- **7 different timeout implementations** (no shared pattern)
- **14 different serialization implementations** (no shared utility)
- **High maintenance cost**: Bug in serialization must be fixed in 14 tools

### Critical Reuse Matrix
Based on docs/research/more-features.md (15 proposed tools):

| Need | Tool Count | Impact |
|------|-----------|--------|
| **Position/Range Serialization** | 14 tools | VERY HIGH - UNIVERSAL |
| **Symbol Provider + Timeout** | 8 tools | VERY HIGH |
| **Symbol Tree Traversal** | 1-2 tools | MEDIUM |
| **File/Cursor/Selection Info** | 7-8 tools | MEDIUM |

---

## Three Architecture Options Analyzed

### Option A: Monolithic (Current Plan)
```
✅ Fastest Phase 1 (2-3 hours)
❌ 300-400 lines duplication in future tools
❌ 11 places to fix serialization bugs
❌ Poor discoverability
```

### Option B: Layered Utilities (RECOMMENDED) ⭐
```
✅ 50-75 lines duplication (vs 300-400)
✅ 1 place to fix serialization bugs
✅ High discoverability
✅ Only 30min extra Phase 1 work
✅ Consistent error handling (100ms timeout everywhere)
```

**Structure**:
```
src/core/util/
├── EditorUtils.ts         (file/cursor/selection)
├── SymbolUtils.ts         (symbols + timeout)
├── SerializationUtils.ts  (→ POJO - shared!)
└── index.ts
```

### Option C: Balanced (Partial)
```
✅ Fast Phase 1 (2.5 hours)
✅ SerializationUtils shared (11 tools benefit)
❌ Symbol logic still duplicated (7 tools)
```

---

## Key Recommendation

**Implement Option B Lite**: EditorContextProvider + SerializationUtils

### Why?
1. **Highest Value**: SerializationUtils prevents most critical bug (circular refs) from spreading to 14 tools
2. **Minimal Overhead**: 30 minutes extra Phase 1 work
3. **Future-Proof**: Clear path to extract SymbolUtils in Phase 3 if duplication detected
4. **Developer Experience**: Utilities discoverable in `src/core/util/`

### Impact
- **Phase 1**: EditorContextProvider works as planned + SerializationUtils extracted
- **Phase 3**: code.replaceMethod imports SymbolUtils (no duplication needed)
- **Future**: All symbol/serialization tools reuse tested patterns

---

## Current Architecture Findings

**Existing Patterns**:
- `src/core/util/uuid.ts` - Single function export (no class)
- `src/core/bridge-context/services/` - Instance classes with DI (not used by scripts)
- **NO barrel exports** in core/util or core/context (poor discoverability)
- **NO VS Code API wrappers** (each script re-implements patterns)
- **NO serialization utilities** (each tool will implement independently)

**Risk**: Without shared utilities, 16 MCP tools will independently duplicate:
- Symbol provider calls with different timeout values
- Serialization logic (potential circular ref bugs)
- Position/Range conversion (off-by-one indexing errors)

---

## Method-by-Method Reuse Likelihood

| Method | Reuse | Recommendation |
|--------|-------|-----------------|
| `getFileInfo()` | MEDIUM (1-2 tools) | EditorUtils |
| `getCursorInfo()` | HIGH (7+ tools) | EditorUtils |
| `getSelectionInfo()` | HIGH (7+ tools) | EditorUtils |
| `getSymbols() + timeout` | VERY HIGH (8 tools) | SymbolUtils |
| `findContainingScopes()` | MEDIUM (1-2 tools) | SymbolUtils |
| `serializeToPlainObject()` | **VERY HIGH (14 tools)** | **SerializationUtils** |

**Most Critical**: `serializeToPlainObject()` - present in almost every future tool's response

---

## Migration Path (If Needed)

If implemented as Option A first, refactoring to Option B takes 3 days:

1. **Day 1**: Extract SerializationUtils (1 day, high value)
2. **Day 2**: Extract SymbolUtils (1-2 days, if duplication detected)
3. **Day 0.5**: Extract EditorUtils (0.5 day, if needed)

**Cost**: 3 days refactoring in Phase 3+  
**Prevention**: 30 min extra work in Phase 1

---

## Next Steps

1. **Review** `/workspaces/wormhole/docs/research/utility-architecture-analysis.md` sections:
   - Section 4: Three options detailed comparison
   - Section 5: Method-by-method analysis
   - Section 11: Decision criteria table

2. **Decide**: Option B (Recommended) or Option C (Balanced)?

3. **Implement Phase 1** with chosen option:
   - Create EditorContextProvider as planned
   - Additionally create SerializationUtils (Option B/C)
   - Optionally create EditorUtils + SymbolUtils (Option B full)

4. **Phase 2**: Inject EditorContextProvider into response envelope pipeline

5. **Phase 3**: Create editor.get-context script (can now reuse SymbolUtils without duplication)

---

## Decision Table (Copy/Paste for Your Decision)

| Question | Answer for Option B |
|----------|-------------------|
| **Planning 15+ MCP tools?** | YES → Choose B |
| **Value 3-year maintainability?** | YES → Choose B |
| **OK with 30min extra Phase 1 work?** | YES → Choose B |
| **Want consistent serialization pattern?** | YES → Choose B |

**If all YES**: Proceed with **Option B** recommendation

---

**Document**: `/workspaces/wormhole/docs/research/utility-architecture-analysis.md`  
**Status**: Ready for implementation planning  
**Prepared**: 2025-10-23
