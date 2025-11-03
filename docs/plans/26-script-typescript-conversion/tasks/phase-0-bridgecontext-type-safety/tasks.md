# Phase 0: BridgeContext Type Safety - Tasks & Alignment Brief

**Phase**: Phase 0: BridgeContext Type Safety
**Phase Slug**: phase-0-bridgecontext-type-safety
**Plan**: [Script TypeScript Conversion Implementation Plan](../../script-typescript-conversion-plan.md)
**Spec**: [Script TypeScript Conversion Spec](../../script-typescript-conversion-spec.md)
**Created**: 2025-11-02
**Status**: READY FOR GO

---

## Tasks

| Status | ID | Task | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|-----|------|------|--------------|------------------|------------|----------|-------|
| [x] | T001 | Add getJavaScriptEnv to IBridgeContext interface | Core | – | /workspaces/vscode-bridge/packages/extension/src/core/bridge-context/types.ts | Interface includes getJavaScriptEnv method | – | Add only `getJavaScriptEnv?(file: vscode.Uri): Promise<ITestEnvironment \| null>` - NOT extensionRoot (already in paths.extensionRoot); scripts should use debug.getSession() for sessions [^1] |
| [x] | T002 | Update base.ts to use IBridgeContext interface | Core | T001 | /workspaces/vscode-bridge/packages/extension/src/core/scripts/base.ts | All bridgeContext parameters use IBridgeContext type instead of concrete class | – | Change imports from BridgeContext to IBridgeContext in all signatures (execute, wait, waitForDebugEvent); enables type safety [^2] |
| [x] | T003 | Create TypeScript example with proper test | Test | T002 | /workspaces/vscode-bridge/packages/extension/test/core/bridge-context/example-typed.test.ts | Example script compiles, Vitest test validates type safety | – | Create Vitest test (not scratch) showing TypeScript type enforcement works; use existing test patterns from ScriptRegistry.test.ts [^3] |
| [x] | T004 | Test JavaScript compatibility | Test | T002 | /workspaces/vscode-bridge/packages/extension/test/core/scripts/js-compat.test.js | JavaScript file can extend typed base class without errors | – | Create .js test extending QueryScript to verify TypeScript structural typing allows JS scripts [^4] |
| [x] | T005 | Add minimal JSDoc to IBridgeContext | Doc | T001 | /workspaces/vscode-bridge/packages/extension/src/core/bridge-context/types.ts | Interface has JSDoc explaining usage of debug.getSession() pattern | – | Document that scripts should use `bridgeContext.debug.getSession()` for debug sessions, NOT a custom helper [^5] |
| [x] | T006 | Final validation including dynamic script | Integration | T003, T004, T005 | /workspaces/vscode-bridge/packages/extension/src/core/scripts/base.ts, /workspaces/vscode-bridge/scripts/sample/dynamic/test-editor-context.js | base.ts compiles, type safety works, JS compat OK, dynamic script runs | – | Run tsc --strict on base.ts, run tests, then `vscb script run -f ./scripts/sample/dynamic/test-editor-context.js` to verify paths.extensionRoot works [^6] |

---

## Alignment Brief

### Objective

**Prepare type foundation** for future script conversion by making base script classes use IBridgeContext interface. This is groundwork only - actual script debugging becomes possible in Phases 3-5 when scripts are converted to TypeScript and loaded statically.

**Important**: Phase 0 does NOT enable debugging yet. Scripts remain as .js files loaded via `eval('require')` until Phase 3-4 (conversion) and Phase 5 (static loading). This phase only prepares the type system.

**Key Insight**: Maximum reuse of existing functionality. TypeScript strict mode + existing services already provide everything needed:
1. Add only missing getJavaScriptEnv to interface
2. Use existing debug.getSession() (no new helpers needed!)
3. Base classes using the interface
4. Proper Vitest test (not scratch throwaway)

**Behavior Checklist** (from plan acceptance criteria):
- [ ] IBridgeContext has getJavaScriptEnv method added
- [ ] Scripts use existing debug.getSession() (no redundant helpers)
- [ ] Base script classes use IBridgeContext instead of concrete BridgeContext
- [ ] Scripts inherit type safety automatically (no manual annotations needed)
- [ ] Example TypeScript test validates type enforcement
- [ ] JavaScript scripts can still extend typed base classes
- [ ] JSDoc documents existing patterns (debug.getSession(), paths.extensionRoot)

### Prior Phases Review

**N/A** - This is Phase 0, the foundational phase. No prior phases exist.

### Non-Goals (Scope Boundaries)

❌ **NOT doing in this phase**:
- Converting any scripts to TypeScript (Phase 3-4)
- Complex generic types or assertion functions
- Extensive type system exploration
- Creating comprehensive usage guides (just basic JSDoc)
- Refactoring BridgeContext implementation (only typing)
- Performance optimization

**Rationale**: Keep Phase 0 minimal. TypeScript strict mode + IBridgeContext interface is enough.

### Invariants & Guardrails

**Type Safety**:
- IBridgeContext properties have explicit types (no `any`)
- Optional properties use `?` syntax

**Backward Compatibility**:
- No behavior changes to existing BridgeContext
- JavaScript scripts continue working
- Only additive changes (getDebugSession helper)

### Inputs to Read

**Files to Review**:
- `/workspaces/vscode-bridge/packages/extension/src/core/bridge-context/BridgeContext.ts` - Implementation
- `/workspaces/vscode-bridge/packages/extension/src/core/bridge-context/types.ts` - Interface
- `/workspaces/vscode-bridge/packages/extension/src/core/scripts/base.ts` - Base classes

### Visual Alignment Aids

#### Task Flow

```
T001 (Verify interface)
  → T002 (Add getDebugSession helper)
    → T003 (Update base.ts)
      → T004 (Example TS script)
      → T005 (JS compat test)
      → T006 (JSDoc)
      → T007 (Final validation)
```

### Test Plan

**Validation using existing patterns**:
- T003: Vitest test validates TypeScript type enforcement (uses existing test patterns)
- T004: JavaScript compatibility test verifies backward compatibility
- T006: Final validation with tsc --strict + dynamic script test

Using existing test infrastructure - no new patterns or scratch directories.

### Implementation Outline

1. **T001**: Add only getJavaScriptEnv to IBridgeContext (NOT extensionRoot - use paths.extensionRoot)
2. **T002**: Update base.ts to import and use IBridgeContext in all signatures
3. **T003**: Create proper Vitest test showing type enforcement works
4. **T004**: Create JavaScript compatibility test
5. **T005**: Add JSDoc documenting use of debug.getSession() and paths.extensionRoot
6. **T006**: Final validation - tsc --strict + dynamic script test

### Commands to Run

```bash
# T006: Final validation
cd /workspaces/vscode-bridge
npx tsc --noEmit --strict packages/extension/src/core/scripts/base.ts
npm test -- test/core/bridge-context/example-typed.test.ts
npm test -- test/core/scripts/js-compat.test.js

# Test dynamic script uses paths.extensionRoot correctly
vscb script run -f ./scripts/sample/dynamic/test-editor-context.js
```

### Risks/Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| Interface missing properties | Low | T001 verifies completeness |
| JS compatibility breaks | Low | T005 tests .js script extending typed class |

### Ready Check

- [ ] **Scope clear**: Make base classes use IBridgeContext, add simple helper, prove it works
- [ ] **No over-engineering**: No generics, no assertion functions, no extensive docs
- [ ] **Tools ready**: TypeScript compiler available
- [ ] **Success criteria**: Example script compiles with IntelliSense, JS compat works, tsc passes

---

## Phase Footnote Stubs

**NOTE**: This section will be populated during implementation by `/plan-6-implement-phase` and `/plan-6a-update-progress`.

Footnotes will reference specific code changes (methods, classes, files) with Flowspace IDs in the format:
```
[^1]: Modified [`method:path/to/file:methodName`](path/to/file#L123) – Description of change
[^2]: Created [`interface:path/to/file:InterfaceName`](path/to/file#L45) – Description of addition
```

[^1]: Task 0.1 (T001) - Added getJavaScriptEnv to IBridgeContext interface
  - [`interface:packages/extension/src/core/bridge-context/types.ts:IBridgeContext`](../../../packages/extension/src/core/bridge-context/types.ts#L85)

[^2]: Task 0.2 (T002) - Updated base script classes to use IBridgeContext
  - [`class:packages/extension/src/core/scripts/base.ts:ScriptBase`](../../../packages/extension/src/core/scripts/base.ts#L9)
  - [`class:packages/extension/src/core/scripts/base.ts:WaitableScript`](../../../packages/extension/src/core/scripts/base.ts#L115)
  - [`class:packages/extension/src/core/scripts/base.ts:StreamScript`](../../../packages/extension/src/core/scripts/base.ts#L243)

[^3]: Task 0.3 (T003) - Created TypeScript example test with type enforcement
  - [`file:packages/extension/test/core/bridge-context/example-typed.test.ts`](../../../packages/extension/test/core/bridge-context/example-typed.test.ts)

[^4]: Task 0.4 (T004) - Created JavaScript compatibility test
  - [`file:packages/extension/test/core/scripts/js-compat.test.js`](../../../packages/extension/test/core/scripts/js-compat.test.js)

[^5]: Task 0.5 (T005) - Added minimal JSDoc to IBridgeContext
  - [`interface:packages/extension/src/core/bridge-context/types.ts:IDebugService`](../../../packages/extension/src/core/bridge-context/types.ts#L198)
  - [`interface:packages/extension/src/core/bridge-context/types.ts:IPathService`](../../../packages/extension/src/core/bridge-context/types.ts#L251)

[^6]: Task 0.6 (T006) - Final validation including dynamic script
  - [`file:packages/extension/src/core/scripts/base.ts`](../../../packages/extension/src/core/scripts/base.ts)
  - [`file:scripts/sample/dynamic/test-editor-context.js`](../../../scripts/sample/dynamic/test-editor-context.js)

---

## Evidence Artifacts

During implementation (via `/plan-6-implement-phase`), the following artifacts will be created:

**Primary Artifacts**:
- **execution.log.md** - Detailed implementation log capturing:
  - Each task execution with timestamps
  - Code changes made with file:line references
  - Test results and validation outputs
  - Issues encountered and resolutions
  - Cross-references to plan tasks

**Supporting Artifacts**:
- **tests/scratch/example-typed-script.ts** - T004 example script
- **tests/scratch/js-compat-test.js** - T005 JS compatibility test

All artifacts stored in: `/workspaces/vscode-bridge/docs/plans/26-script-typescript-conversion/tasks/phase-0-bridgecontext-type-safety/`

---

## Directory Layout

```
docs/plans/26-script-typescript-conversion/
├── script-typescript-conversion-plan.md          # Main plan document
├── script-typescript-conversion-spec.md          # Feature specification
└── tasks/
    └── phase-0-bridgecontext-type-safety/
        ├── tasks.md                               # THIS FILE - Phase 0 task dossier
        ├── execution.log.md                       # Created by /plan-6-implement-phase
        └── evidence/                              # Supporting artifacts (if needed)
            └── bridgecontext-usage-analysis.txt   # T001 output (optional)
```

**Note**: Scratch tests and example scripts live in `/workspaces/vscode-bridge/packages/extension/tests/scratch/` per project conventions, not in the plan directory.

---

## Next Steps

When you receive **GO** approval:

1. Run `/plan-6-implement-phase --phase "Phase 0: BridgeContext Type Safety" --plan "/workspaces/vscode-bridge/docs/plans/26-script-typescript-conversion/script-typescript-conversion-plan.md"`
2. Work through tasks T001-T007 sequentially
3. Update execution log after each task

**Estimated effort**: < 1 hour (6 simple tasks, maximum reuse of existing functionality)

**Success marker**: Type foundation ready - base classes use IBridgeContext, example script proves types work, JS compatibility verified. (Note: Actual script debugging enabled in Phases 3-5)

---

## Critical Insights Discussion

**Session**: 2025-11-02
**Context**: Phase 0 BridgeContext Type Safety - Simplified Tasks
**Analyst**: AI Clarity Agent
**Reviewer**: Development Team
**Format**: Water Cooler Conversation (5 Critical Insights)

### Insight 1: Phase 0 Won't Actually Enable Script Debugging

**Did you know**: After completing Phase 0, scripts still won't be debuggable because they remain .js files loaded via eval('require') until Phases 3-5.

**Implications**:
- Phase 0 is purely preparatory groundwork
- Still 5 phases away from debugging code.replace-method
- No immediate debugging benefit

**Options Considered**:
- Option A: Set Clearer Expectations - Document that debugging comes later
- Option B: Proof-of-Concept Script - Convert one script in Phase 0
- Option C: Fast-Track - Combine phases
- Option D: Accept Long Path - Stay the course

**AI Recommendation**: Option A - Set Clearer Expectations
- Reasoning: Maintains clean architecture, prevents scope creep

**Decision**: Set clearer expectations about Phase 0's role

**Action Items**:
- [x] Updated Phase 0 objective to clarify it's groundwork only
- [x] Added note that debugging happens in Phases 3-5
- [x] Updated success marker

**Affects**: Phase 0 documentation

---

### Insight 2: Example Script Can't Validate Runtime Behavior

**Did you know**: The example TypeScript script in T004 only proves compilation works, not that scripts actually get proper typed BridgeContext at runtime.

**Implications**:
- Only validates TypeScript syntax, not runtime behavior
- Can't test if IBridgeContext is actually passed to execute()
- Could have runtime issues not discovered until Phase 3

**Options Considered**:
- Option A: Accept Limited Validation
- Option B: Create Integration Test
- Option C: Skip Example Script
- Option D: Add Mini Runtime Test

**AI Recommendation**: Option D - Add Mini Runtime Test
- Reasoning: Validates helper behavior, low effort, catches obvious issues

**Decision**: Add mini runtime test as throwaway scratch test

**Action Items**:
- [x] Updated T004 to include runtime test
- [x] Test will instantiate BridgeContext and verify behavior
- [x] Marked as TAD scratch test that may not be promoted

**Affects**: T004 task description

---

### Insight 3: T003 Might Break Dynamic Scripts

**Did you know**: Changing base.ts to use IBridgeContext could break dynamic user scripts if the interface is incomplete.

**Implications**:
- Dynamic scripts in scripts/sample/dynamic/ might fail
- Found 27 dynamic scripts using bridgeContext
- Two critical gaps: extensionRoot and workspaceFolder properties

**Options Considered**:
- Option A: Verify Interface Completeness - Ensure ALL methods included
- Option B: Test Sample Dynamic Scripts
- Option C: Keep Concrete Class
- Option D: Document as Breaking Change

**AI Recommendation**: Option A - Verify Interface Completeness
- Reasoning: Maintains compatibility, honors backward compatibility goal

**Decision**: Verify interface completeness + test dynamic script

**Action Items**:
- [x] T001 now adds getJavaScriptEnv to interface
- [x] Clarified extensionRoot accessible via paths.extensionRoot
- [x] T007 includes testing test-editor-context.js dynamic script

**Affects**: T001, T007

---

### Insight 4: getDebugSession() Helper Duplicates Existing Functionality

**Did you know**: The planned getDebugSession() helper duplicates existing bridgeContext.debug.getSession() functionality.

**Implications**:
- Adding redundant API surface area
- Scripts can already use debug.getSession()
- More methods to maintain for no benefit

**Options Considered**:
- Option A: Skip the Helper - Use existing functionality
- Option B: Keep as Convenience
- Option C: Enhanced Helper
- Option D: Document Pattern

**AI Recommendation**: Option A - Skip the Helper
- Reasoning: Uses existing API, avoids duplication, cleaner interface

**Decision**: Remove redundant helper, use existing debug.getSession()

**Action Items**:
- [x] Removed T002 (getDebugSession helper) entirely
- [x] Renumbered subsequent tasks
- [x] Updated to document existing pattern

**Affects**: Task removal, renumbering

---

### Insight 5: The Ultimate Goal is Still 5+ Phases Away

**Did you know**: Even after Phase 0, you're still 15-24 hours and 5 phases away from debugging code.replace-method.

**Implications**:
- Original problem remains unsolved for weeks
- High risk of losing momentum
- Could discover blocking issues in any phase
- Bug might be simple and findable with console.log

**Options Considered**:
- Option A: Continue with Full Conversion - Complete all phases as planned
- Option B: Tactical Debugging First - Use console.log now
- Option C: Single Script POC - Convert only code.replace-method
- Option D: Hybrid Approach - Add logging now, continue conversion

**AI Recommendation**: Option D - Hybrid Approach
- Reasoning: Pragmatic, solves immediate problem while maintaining long-term goal

**Decision**: Continue with full conversion as planned (Option A)

**Action Items**: None - staying the course

**Affects**: None - commitment to full implementation

---

## Session Summary

**Insights Surfaced**: 5 critical insights identified and discussed
**Decisions Made**: 5 decisions reached
**Action Items Completed**: Multiple task updates and simplifications
**Final Task Count**: 6 tasks (down from original 22)

**Shared Understanding Achieved**: ✓

**Confidence Level**: High - Phase 0 maximally simplified through reuse

**Next Steps**:
Proceed with `/plan-6-implement-phase --phase "Phase 0: BridgeContext Type Safety"` to implement the 6 simplified tasks

**Notes**:
- Phase 0 dramatically simplified from 22 → 7 → 6 tasks
- Removed all redundant helpers and duplication
- Maximum reuse of existing functionality
- Clear expectations about when debugging becomes available
- Estimated effort now < 1 hour
