# Phase 5: Call Hierarchy Tool - Tasks & Alignment Brief

**Phase**: Phase 5 of 7
**Slug**: `phase-5-call-hierarchy-tool`
**Created**: 2025-11-05
**Spec**: [lsp-features-spec.md](../../lsp-features-spec.md)
**Plan**: [lsp-features-plan.md](../../lsp-features-plan.md#phase-5-call-hierarchy-tool)
**Status**: ✅ COMPLETED

> **Note**: Call hierarchy placed in `symbol` category alongside `navigate` and `rename` since finding callers/callees is fundamentally symbol navigation.

---

## Summary

**Implementation Approach**: This phase used a **simplified approach** (Option B) instead of the full 44-task TAD workflow:

- ✅ **Consolidated**: 44 tasks → 7 focused tasks
- ✅ **Completed**: 6/7 tasks (85%) - 1 optional task skipped
- ✅ **Duration**: ~1 day implementation
- ✅ **Validation**: Dynamic script + CLI testing (Python + TypeScript)
- ⏸️ **Skipped**: Integration test suite (T034-T038) per simplified approach

### What Was Consolidated

| Original Tasks | Consolidated Into | Status |
|----------------|-------------------|--------|
| T004-T039 (36 tasks) | T004 (Dynamic validation script) | [x] Completed |
| T017-T029 (13 tasks) | T002 (Core implementation) | [x] Completed |
| T030-T033 (4 tasks) | T003 (MCP metadata) | [x] Completed |
| T042-T043 (2 tasks) | T006 (CLI testing) | [x] Completed |

### Key Deliverables

1. **Production TypeScript Script** (372 lines)
   - Two-step LSP workflow (prepare → provide)
   - Direction routing (incoming/outgoing)
   - Error handling with proper error codes
   - Optional Flowspace ID enrichment

2. **Comprehensive MCP Metadata** (143 lines)
   - Language support matrix
   - Parameter hints with examples
   - Error contract documentation

3. **Dynamic Validation Script**
   - Critical fix: Use `selectionRange.start` not `range.start`
   - Validated on Python and TypeScript

4. **CLI Testing**
   - Tested incoming/outgoing calls
   - Validated across Python and TypeScript
   - Confirmed cross-language support

See execution log for details: [`log#phase-5-implementation-simplified-approach`](./execution.log.md#phase-5-implementation-simplified-approach)

---

## Tasks

| Status | ID | Task | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|----|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Verify symbol/ directory exists | Setup | – | `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/symbol/` | Directory exists (created in Phase 2) | Reusing existing symbol category · log#phase-5-implementation-simplified-approach |
| [x] | T002 | Create calls.ts extending QueryScript | Core | T001 | `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/symbol/calls.ts` | File exists, implements two-step LSP workflow | Consolidated T002+T004-T029 (exploration + implementation) · log#phase-5-implementation-simplified-approach [^9] |
| [x] | T003 | Create calls.meta.yaml with comprehensive MCP metadata | Core | T001 | `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/symbol/calls.meta.yaml` | File exists, defines all parameters and guidance | Consolidated T003+T030-T033 (metadata + documentation) · log#phase-5-implementation-simplified-approach [^10] |
| [x] | T004 | Create dynamic validation script | Test | T002, T003 | `/workspaces/vscode-bridge/scripts/sample/dynamic/test-call-hierarchy.js` | Script validates two-step LSP workflow (prepare → provide) | Consolidated T004-T039 (all exploration, validation, and test promotion tasks) · log#phase-5-implementation-simplified-approach [^12] |
| [x] | T005 | Run `just build` to generate manifest and schemas | Integration | T004 | `/workspaces/vscode-bridge/` | Build succeeds, manifest.json updated with symbol.calls | Build completed successfully · log#phase-5-implementation-simplified-approach [^11] |
| [x] | T006 | CLI testing: incoming and outgoing calls (Python + TypeScript) | Integration | T005 | – | Commands return correct call hierarchies for both directions | Validated across Python and TypeScript · log#task-514-cli-testing-and-validation |
| [ ] | T007 | Optional: MCP tool call via stdio client | Integration | T006 | – | MCP client can call symbol_calls and receive results | Optional integration validation (skipped) |

---

## Alignment Brief

### Prior Phases Review

This section synthesizes findings from Phases 1-4 execution that directly inform Phase 5 implementation.

#### Phase 1: Symbol Resolver Foundation - Core Infrastructure

**Key Deliverable**: `/workspaces/vscode-bridge/packages/extension/src/core/util/symbol-resolver.ts` (749 lines, 13 exported functions)

**Phase 5 Dependencies**:
- **`resolveSymbolInput(params)`** - Primary entry point for symbol resolution
  - Handles both Flowspace ID (`nodeId`) and symbol name (`path + symbol`) inputs
  - Returns `{ uri, position, symbol, meta: { resolvedVia } }`
  - **Phase 5 Usage**: Resolve target function/method for symbol.calls before calling prepareCallHierarchy

- **`getLSPResultWithTimeout(lspPromise, timeoutMs)`** - Timeout protection wrapper
  - Returns: `result | null | 'timeout'` (three-state handling)
  - Default 10s timeout prevents hanging on unresponsive language servers
  - **Phase 5 Usage**: Wrap BOTH prepareCallHierarchy AND provide{Incoming|Outgoing}Calls operations

- **`buildFlowspaceIdAtPosition(uri, position)`** - Optional response enrichment
  - Generates Flowspace IDs for call hierarchy items (caller/callee metadata)
  - **Phase 5 Usage**: When `enrichWithFlowspaceIds=true`, add nodeId to from/to items

**Critical Patterns Established**:
1. **Windows Path Handling**: Forward slashes required in Flowspace IDs (`C:/` not `C:\`)
2. **Hierarchical Search**: Three fallback strategies (exact match → hierarchical split → deep traversal)
3. **Ambiguity Detection**: Throw E_AMBIGUOUS_SYMBOL if multiple symbols match qualified name
4. **Webpack Alias**: `@core/util/symbol-resolver` available for imports

**Testing Approach**: TAD with scratch tests promoted to integration suite (9 promoted tests, >80% coverage)

---

#### Phase 2: Symbol Navigation Tool - LSP Integration Patterns

**Key Deliverable**: `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/symbol/navigate.js` (references + implementations)

**Phase 5 Learnings**:
- **Dynamic Script Workflow**: 0s rebuild time enables fast iteration on LSP behavior exploration
  - Pattern: Create `explore-*.js` → iterate with hot-reload → document findings → implement core logic → validate with dynamic scripts → promote tests
  - **Phase 5 Application**: Use 3 dynamic scripts (prepare, incoming, outgoing) to explore two-step process

- **Location Polymorphism**: LSP returns `Location[]` OR `LocationLink[]`
  - **Phase 5 Note**: CallHierarchy returns `CallHierarchyItem` (different structure) - no polymorphism expected
  - Normalization still needed: Convert `CallHierarchyIncomingCall`/`CallHierarchyOutgoingCall` to standard response format

- **Empty Results Handling**: Return empty array (not error) when no references/implementations found
  - **Phase 5 Application**: Empty incoming/outgoing calls should return `{ calls: [], total: 0 }` with meta note (not E_NOT_FOUND)

- **MCP Guidance Investment**: `navigate.meta.yaml` llm.when_to_use section was 40+ lines with concrete examples
  - **Phase 5 Requirement**: Explain two-step process in llm.when_to_use (prepare → provide workflow)

**Testing Outcomes**: 7 promoted tests covering critical path, alternative inputs, tri-state parameters, edge cases

---

#### Phase 3: Symbol Rename Tool - WorkspaceEdit Patterns

**Key Deliverable**: `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/symbol/rename.js` (workspace-wide refactoring)

**Phase 5 Learnings**:
- **Pre-validation Strategy**: Check file exists/writable BEFORE applying WorkspaceEdit
  - Discovery 07: `vscode.workspace.applyEdit()` returns boolean with no failure details
  - **Phase 5 Note**: Call hierarchy is read-only (no WorkspaceEdit) - pre-validation NOT needed

- **Error Context Enrichment**: Return file-level details when operations fail
  - Pattern: `{ succeeded: [...], failed: [...] }` for batch operations
  - **Phase 5 Application**: No batch operations, but apply pattern to multi-call results (incoming/outgoing calls array)

- **Language Hints**: Document Python/JavaScript rename limitations in MCP metadata
  - **Phase 5 Requirement**: Document JavaScript call hierarchy limitations (less reliable than TypeScript)

**Testing Outcomes**: 6 promoted tests including error handling, multi-file scenarios

---

#### Phase 4: Method Replacement Tool - ActionScript Transition

**Key Deliverable**: `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/code/replace-method.js` (whole-symbol replacement)

**Phase 5 Learnings**:
- **QueryScript vs ActionScript**: Phase 4 used ActionScript (state-changing operation)
  - `execute()` returns `ActionResult` with `success` boolean + `details`
  - **Phase 5 Confirmation**: Call hierarchy is read-only → extend QueryScript (like Phase 2)

- **DocumentSymbol Traversal**: Used `findSymbolInDocument` to locate method by qualified name
  - **Phase 5 Application**: Same traversal needed to find target function before prepareCallHierarchy

- **Response Format Consistency**: All tools return standard envelope (ok, status, type, data, meta)
  - **Phase 5 Requirement**: Match envelope pattern, add call hierarchy-specific meta fields (direction, targetSymbol, totalCalls)

**Testing Outcomes**: 5 promoted tests including signature changes, async conversion, deletion via empty string

---

### Cross-Phase Synthesis: Implications for Phase 5

**Cumulative Pattern Convergence**:
1. **Symbol Resolution Pipeline** (Phases 1-4): `resolveSymbolInput` → position → LSP operation
   - **Phase 5 Unique Twist**: Two LSP operations in sequence (prepare → provide)
2. **Timeout Protection** (Phases 1-4): Wrap all LSP commands with `getLSPResultWithTimeout`
   - **Phase 5 Application**: Wrap BOTH steps (prepare AND provide calls)
3. **Dynamic Scripts for Exploration** (Phases 2-4): Hot-reload testing before core implementation
   - **Phase 5 Strategy**: 3 scripts (prepare, incoming, outgoing) to understand two-step workflow
4. **MCP Metadata Investment** (Phases 2-4): 40+ line llm.when_to_use sections
   - **Phase 5 Requirement**: Explain prepare→provide workflow clearly for AI agents

**Divergence Points**:
1. **Two-Step LSP Process** (Phase 5 Only): No prior phase required intermediate LSP result
   - prepareCallHierarchy returns `CallHierarchyItem[]` → use first item for provide calls
   - Must validate prepare result before calling provide (null/empty check)
2. **Directional Operations** (Phase 5 Only): Phase 2 had "action" (references/implementations), Phase 5 has "direction" (incoming/outgoing)
   - Similar routing pattern, different semantic (who calls this vs what this calls)
3. **Language Support Variance** (Phase 5 Higher Risk): JavaScript call hierarchy less reliable than TypeScript
   - Phase 2-4: Most LSP features work across languages with minor limitations
   - Phase 5: Call hierarchy may return empty results even when calls exist (JavaScript limitation)

**Risk Amplification**:
- **Timeout Risk**: Two LSP calls = 2x timeout exposure (prepare 10s + provide 10s = 20s max)
  - Mitigation: Document expected latency, consider progressive timeout (5s prepare, 10s provide)
- **Empty Results Ambiguity**: Did prepare fail, or does function truly have no callers?
  - Mitigation: Return meta field: `{ prepareSuccess: true, callsFound: 0 }` for clarity

---

### Objective Recap

**Phase Goal**: Implement `symbol.calls` tool for navigating incoming and outgoing call relationships using semantic identifiers (Flowspace IDs or symbol names).

**Behavior Checklist** (from plan acceptance criteria):
- [x] Two-step process implemented correctly (prepare → provide{Incoming|Outgoing}Calls)
- [x] Both directions work (incoming shows callers, outgoing shows callees)
- [x] Empty results handled gracefully (empty array with meta note, not error)
- [x] Language hints document JavaScript/Python call hierarchy limitations
- [x] Response includes hierarchical call details (from/to with CallHierarchyItem properties, fromRanges)
- [x] Error codes: E_NO_LANGUAGE_SERVER (prepare returns null/empty), E_NOT_FOUND (symbol not found), E_TIMEOUT (LSP timeout), E_INVALID_INPUT (bad direction parameter)
- [x] Dynamic validation script confirms implementation correctness
- [x] CLI testing validates both directions across multiple languages
- [ ] ~~All promoted tests passing~~ (Skipped per simplified approach - no integration tests)
- [ ] ~~Test coverage > 80%~~ (Skipped per simplified approach)
- [ ] ~~No mocks used~~ (Skipped per simplified approach)
- [ ] ~~Test Doc blocks complete~~ (Skipped per simplified approach)

---

### Non-Goals (Scope Boundaries)

**NOT doing in this phase**:
- **Transitive call graphs**: No recursive call hierarchy traversal (only direct callers/callees)
- **Call graph visualization**: Return data structure only, no diagram generation
- **Performance optimization**: Accept sequential prepare→provide timing, no caching of CallHierarchyItem
- **Custom call hierarchy providers**: Use VS Code's built-in LSP providers only
- **Peek/preview UI**: No editor integration, CLI/MCP tool only
- **Call site filtering**: Return all calls, no filtering by file/module

**Why these boundaries matter**: Phase 5 delivers semantic call navigation infrastructure. Graph traversal, visualization, and optimization are future enhancements requiring separate design.

---

### Critical Findings Affecting This Phase

This phase addresses **7 critical discoveries** from the plan:

#### 🚨 Critical Discovery 01: Three-Tier Base Class Architecture
- **Constraint**: Call hierarchy is read-only query → extend QueryScript (not ActionScript)
- **Requirement**: `execute()` returns data object directly (e.g., `{ calls: [...], direction, total }`)
- **Implementation**: `class CallsScript extends QueryScript` in symbol/calls.js
- **Tasks**: T002 (base class selection)

#### 🚨 Critical Discovery 02: Dual-File Registration Pattern
- **Constraint**: Requires both `.js` AND `.meta.yaml` files with identical base names
- **Requirement**: Create `symbol/calls.js` + `symbol/calls.meta.yaml`
- **Validation**: `just build` must succeed, manifest.json updated
- **Tasks**: T002, T003, T040 (file creation + build validation)

#### 🚨 Critical Discovery 04: Language Server Timeout/Unavailability
- **Constraint**: LSP commands can hang or return undefined
- **Requirement**: Wrap BOTH prepare and provide operations with `getLSPResultWithTimeout()`
- **Implementation**: Two timeout wrappers (prepare step + provide step)
- **Tasks**: T019, T021, T022, T028 (timeout protection for both LSP calls)

#### 🔴 High Discovery 05: MCP Metadata Drives AI Agent Behavior
- **Constraint**: AI agents learn from `llm.when_to_use` and `parameter_hints`
- **Requirement**: Explain two-step process clearly (prepare → provide workflow)
- **Investment**: Write 50+ line guidance with concrete examples showing both directions
- **Tasks**: T030, T031, T032 (comprehensive MCP metadata)

#### 🔴 High Discovery 08: Hybrid Error Code Strategy
- **Constraint**: Use LSP-specific codes (E_NO_LANGUAGE_SERVER) + generic codes (E_NOT_FOUND, E_TIMEOUT, E_INVALID_INPUT)
- **Requirement**: Prepare step failure returns E_NO_LANGUAGE_SERVER (not E_NOT_FOUND)
- **Context**: Distinguish between "symbol not found" (E_NOT_FOUND) and "language doesn't support call hierarchy" (E_NO_LANGUAGE_SERVER)
- **Tasks**: T020, T028, T032 (error handling + documentation)

#### 🟡 Medium Discovery 09: Call Hierarchy Two-Step LSP Process (CRITICAL FOR PHASE 5)
- **Constraint**: Cannot call provideIncomingCalls/provideOutgoingCalls directly
- **Requirement**: Always call prepareCallHierarchy first, use returned CallHierarchyItem for provide calls
- **Flow**:
  1. `prepareCallHierarchy(uri, position)` → `CallHierarchyItem[] | null`
  2. Validate items exist (throw E_NO_LANGUAGE_SERVER if null/empty)
  3. `provide{Incoming|Outgoing}Calls(items[0])` → `CallHierarchy{Incoming|Outgoing}Call[]`
- **Implementation**: Two private methods (`_prepareCallHierarchy`, `_executeIncomingCalls`, `_executeOutgoingCalls`)
- **Tasks**: T004-T008 (explore prepare step), T009-T012 (explore incoming), T013-T016 (explore outgoing), T019-T023 (core implementation)

#### 🟡 Medium Discovery 11: Location/LocationLink Polymorphism
- **Context**: Phase 2 handled Location[] OR LocationLink[] polymorphism
- **Phase 5 Note**: CallHierarchy returns structured items (CallHierarchyItem with name, kind, uri, range) - no polymorphism expected
- **Requirement**: Normalize CallHierarchyIncomingCall and CallHierarchyOutgoingCall to standard response format
- **Implementation**: Separate normalization for incoming vs outgoing (different structures: `from` vs `to`)
- **Tasks**: T025, T026 (normalization functions)

---

### Invariants & Constraints

**Invariants** (must always be true):
1. **Two-step sequence**: ALWAYS call prepareCallHierarchy before provide{Incoming|Outgoing}Calls
2. **Prepare validation**: MUST check prepare result is non-null and non-empty before proceeding
3. **Timeout protection**: BOTH steps wrapped with `getLSPResultWithTimeout()` (10s each)
4. **Empty array success**: Empty call results return `{ calls: [], total: 0 }` (not error)
5. **Direction parameter**: MUST be exactly "incoming" or "outgoing" (throw E_INVALID_INPUT otherwise)
6. **QueryScript return**: Return data object directly (no ActionResult wrapper)

**Constraints**:
1. **Language server support**: Call hierarchy requires LSP support (TypeScript, Python, Java, Go, C#; limited JavaScript)
2. **CallHierarchyItem structure**: First item from prepare step used (ignore subsequent items if multiple returned)
3. **Response format**: Match standard envelope (ok, status, type, data, meta) with call hierarchy-specific fields
4. **Flowspace ID enrichment**: Optional (performance cost); requires additional symbol lookup per call item

---

### Inputs to Read

**Primary Dependencies** (Phase 1 APIs):
- `/workspaces/vscode-bridge/packages/extension/src/core/util/symbol-resolver.ts`
  - `resolveSymbolInput(params)` - Lines 600-650 (dispatcher logic)
  - `getLSPResultWithTimeout(lspPromise, timeoutMs)` - Lines 100-150 (timeout wrapper)
  - `buildFlowspaceIdAtPosition(uri, position)` - Lines 400-450 (optional enrichment)

**Reference Implementations** (Phase 2-4 patterns):
- `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/symbol/navigate.js` - QueryScript pattern, action routing
- `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/symbol/navigate.meta.yaml` - MCP metadata examples

**VS Code LSP Documentation**:
- [Call Hierarchy API](https://code.visualstudio.com/api/references/vscode-api#languages.prepareCallHierarchy) - prepareCallHierarchy behavior
- [CallHierarchyItem](https://code.visualstudio.com/api/references/vscode-api#CallHierarchyItem) - Item structure
- [CallHierarchyIncomingCall](https://code.visualstudio.com/api/references/vscode-api#CallHierarchyIncomingCall) - Incoming call structure
- [CallHierarchyOutgoingCall](https://code.visualstudio.com/api/references/vscode-api#CallHierarchyOutgoingCall) - Outgoing call structure

---

### Visual Alignment

#### Two-Step Call Hierarchy Flow

```mermaid
flowchart TD
    Start([User/Agent Request]) --> Resolve[Resolve Symbol Input<br/>nodeId OR path+symbol]
    Resolve --> Prepare[Step 1: prepareCallHierarchy<br/>uri, position]
    Prepare -->|success| ValidateItems{Items exist?}
    Prepare -->|timeout| TimeoutError[E_TIMEOUT]
    Prepare -->|null/undefined| NoLSP[E_NO_LANGUAGE_SERVER]

    ValidateItems -->|empty array| NoLSP
    ValidateItems -->|has items| Direction{params.direction}

    Direction -->|incoming| Incoming[Step 2: provideIncomingCalls<br/>items[0]]
    Direction -->|outgoing| Outgoing[Step 2: provideOutgoingCalls<br/>items[0]]
    Direction -->|invalid| InvalidDir[E_INVALID_INPUT]

    Incoming -->|success| NormalizeIn[Normalize IncomingCall[]]
    Incoming -->|timeout| TimeoutError
    Incoming -->|empty| EmptyIn[Return calls: []]

    Outgoing -->|success| NormalizeOut[Normalize OutgoingCall[]]
    Outgoing -->|timeout| TimeoutError
    Outgoing -->|empty| EmptyOut[Return calls: []]

    NormalizeIn --> Response[Response with calls array]
    NormalizeOut --> Response
    EmptyIn --> Response
    EmptyOut --> Response

    Response --> End([Return to User/Agent])
    TimeoutError --> End
    NoLSP --> End
    InvalidDir --> End
```

#### Sequence Diagram: Full Call Hierarchy Workflow

```mermaid
sequenceDiagram
    participant User as User/AI Agent
    participant Script as symbol.calls
    participant Resolver as Symbol Resolver<br/>(Phase 1)
    participant LSP as VS Code LSP<br/>(Language Server)

    User->>Script: Call symbol.calls<br/>nodeId="method:src/UserService.ts:getUser"<br/>direction="incoming"

    Script->>Resolver: resolveSymbolInput(params)
    Resolver->>Resolver: Parse Flowspace ID
    Resolver->>LSP: executeDocumentSymbolProvider(uri)
    LSP-->>Resolver: DocumentSymbol[]
    Resolver->>Resolver: Find symbol "getUser"
    Resolver-->>Script: { uri, position, symbol }

    Note over Script,LSP: STEP 1: Prepare Call Hierarchy
    Script->>LSP: prepareCallHierarchy(uri, position)<br/>with 10s timeout
    LSP-->>Script: CallHierarchyItem[]<br/>or null/empty

    alt Prepare returns null/empty
        Script-->>User: E_NO_LANGUAGE_SERVER<br/>"Call hierarchy not supported"
    else Prepare succeeds
        Script->>Script: Validate items[0] exists

        Note over Script,LSP: STEP 2: Provide Calls
        alt direction="incoming"
            Script->>LSP: provideIncomingCalls(items[0])<br/>with 10s timeout
            LSP-->>Script: CallHierarchyIncomingCall[]
            Script->>Script: Normalize incoming calls<br/>{ from, fromRanges }
        else direction="outgoing"
            Script->>LSP: provideOutgoingCalls(items[0])<br/>with 10s timeout
            LSP-->>Script: CallHierarchyOutgoingCall[]
            Script->>Script: Normalize outgoing calls<br/>{ to, fromRanges }
        end

        opt enrichWithFlowspaceIds=true
            Script->>Resolver: buildFlowspaceIdAtPosition<br/>for each call item
            Resolver-->>Script: Flowspace IDs
        end

        Script-->>User: Success response<br/>{ calls: [...], direction, total }
    end
```

---

### Test Plan

**Approach**: TAD (Test-Assisted Development) with dynamic scripts for hot-reload exploration, then promote critical tests to integration suite.

**Dynamic Script Exploration** (T004-T016):
1. **explore-call-hierarchy-prepare.js**: Understand prepareCallHierarchy behavior
   - CallHierarchyItem structure (name, kind, uri, range, selectionRange)
   - Language support validation (TypeScript ✓, JavaScript limited, Python ✓)
   - Null/empty responses for unsupported operations
   - Symbol resolution integration

2. **explore-incoming-calls.js**: Understand provideIncomingCalls behavior
   - CallHierarchyIncomingCall structure (from: CallHierarchyItem, fromRanges: Range[])
   - Empty array for functions with no callers
   - Multiple callers aggregation

3. **explore-outgoing-calls.js**: Understand provideOutgoingCalls behavior
   - CallHierarchyOutgoingCall structure (to: CallHierarchyItem, fromRanges: Range[])
   - Empty array for leaf functions (no callees)
   - Multiple callees aggregation

**Promoted Integration Tests** (T034-T038):
1. **T034 - Incoming calls with Flowspace ID** (Critical Path)
   - Test Doc: Why (understanding callers for refactoring), Contract (two-step process), Usage Notes (direction="incoming"), Quality (validates caller navigation), Example ("UserService.getUser" → list of callers)

2. **T035 - Outgoing calls with symbol name** (Alternative Input)
   - Test Doc: Why (understanding dependencies), Contract (direction="outgoing" + symbol name input), Usage Notes (what this function calls), Quality (validates callee navigation), Example ("UserController.handleRequest" → list of callees)

3. **T036 - Empty incoming calls** (Opaque Behavior)
   - Test Doc: Why (unused function detection), Contract (empty array not error), Usage Notes (return { calls: [], total: 0 }), Quality (validates edge case), Example (unused helper function → empty array)

4. **T037 - Unsupported language error** (Edge Case)
   - Test Doc: Why (language support varies), Contract (E_NO_LANGUAGE_SERVER when prepare fails), Usage Notes (prepare returns null/empty), Quality (validates error contract), Example (plain text file → error with hint)

5. **T038 - Invalid direction parameter** (Edge Case)
   - Test Doc: Why (input validation), Contract (E_INVALID_INPUT for bad direction), Usage Notes (must be "incoming" or "outgoing"), Quality (validates parameter contract), Example (direction="both" → error)

**Coverage Target**: >80% for calls.js (covering prepare, incoming, outgoing, error paths)

**No Mocks**: All tests use real VS Code LSP providers with test workspace fixtures

---

### Implementation Outline

**Step-by-step mapped to tasks**:

#### 1. Setup & Skeleton (T001-T003)
- Verify `symbol/` directory exists (created in Phase 2)
- Create `calls.js` extending QueryScript in symbol/ category
- Create `calls.meta.yaml` with parameters (nodeId, path, symbol, direction, enrichWithFlowspaceIds)

#### 2. TAD Exploration (T004-T016)
- **Prepare Step Exploration** (T004-T008):
  - Create `explore-call-hierarchy-prepare.js` dynamic script
  - Iterate to understand CallHierarchyItem structure
  - Test symbol resolution integration
  - Test unsupported language behavior (null/empty returns)
  - Document findings in execution.log.md

- **Incoming Calls Exploration** (T009-T012):
  - Create `explore-incoming-calls.js` dynamic script
  - Iterate to understand CallHierarchyIncomingCall structure
  - Test empty results for unused functions
  - Document findings in execution.log.md

- **Outgoing Calls Exploration** (T013-T016):
  - Create `explore-outgoing-calls.js` dynamic script
  - Iterate to understand CallHierarchyOutgoingCall structure
  - Test empty results for leaf functions
  - Document findings in execution.log.md

#### 3. Core Implementation (T017-T029)
- **Symbol Resolution** (T017-T018):
  - Implement `execute()` method skeleton
  - Call `resolveSymbolInput()` from Phase 1 symbol-resolver

- **Prepare Step** (T019-T020):
  - Implement `_prepareCallHierarchy()` with timeout protection
  - Validate items exist (throw E_NO_LANGUAGE_SERVER if null/empty)

- **Provide Calls** (T021-T023):
  - Implement `_executeIncomingCalls()` with timeout protection
  - Implement `_executeOutgoingCalls()` with timeout protection
  - Implement direction routing (params.direction determines which to call)

- **Validation with Dynamic Scripts** (T024):
  - Run all 3 dynamic scripts to confirm symbol/calls.js matches explored behavior
  - Instant feedback loop (0s rebuild)

- **Response Normalization** (T025-T027):
  - Implement `normalizeCallHierarchyResult()` for incoming calls (from + fromRanges)
  - Implement `normalizeCallHierarchyResult()` for outgoing calls (to + fromRanges)
  - Optional Flowspace ID enrichment (use Phase 1 buildFlowspaceIdAtPosition)

- **Error Handling** (T028-T029):
  - Three-state handling for timeouts/undefined/exceptions
  - Language-specific hints for JavaScript/Python limitations

#### 4. MCP Metadata (T030-T033)
- Write comprehensive `llm.when_to_use` (50+ lines)
  - Explain two-step process clearly
  - Provide USE FOR examples (understanding callers, refactoring impact analysis, dependency mapping)
  - Provide DON'T USE FOR examples (finding definitions, text search)
  - Document PREREQUISITES (LSP support required)
  - Show PATTERNS (Flowspace ID vs symbol name examples for both directions)

- Write detailed `parameter_hints`
  - direction: "Must be 'incoming' (who calls this) or 'outgoing' (what this calls)"
  - enrichWithFlowspaceIds: Performance note about additional lookups

- Document error contract
  - E_NO_LANGUAGE_SERVER: When prepare returns null/empty
  - E_NOT_FOUND: When symbol not found
  - E_TIMEOUT: When LSP operation times out (prepare or provide)
  - E_INVALID_INPUT: When direction parameter invalid

- Add relationships and safety flags
  - Requires: Phase 1 symbol-resolver APIs
  - idempotent: true
  - read_only: true

#### 5. Test Promotion (T034-T039)
- Promote 5 critical tests with complete Test Doc blocks
- Keep 3 dynamic scripts as permanent samples (not deleted like scratch tests)

#### 6. Build & Validation (T040-T044)
- Run `just build` to generate manifest and schemas
- Verify schema includes all parameters
- Manual tests via `vscb script run symbol.calls`
- MCP integration test via stdio client

---

### Commands to Run

**Dynamic Script Exploration** (0s rebuild, instant iteration):
```bash
cd /workspaces/vscode-bridge/test

# Explore prepare step
vscb script run -f ../scripts/sample/dynamic/explore-call-hierarchy-prepare.js

# Test with different symbols
vscb script run -f ../scripts/sample/dynamic/explore-call-hierarchy-prepare.js \
  --param path=javascript/UserService.js \
  --param symbol=UserService.getUser

# Explore incoming calls
vscb script run -f ../scripts/sample/dynamic/explore-incoming-calls.js \
  --param nodeId="method:javascript/UserService.js:UserService.getUser"

# Explore outgoing calls
vscb script run -f ../scripts/sample/dynamic/explore-outgoing-calls.js \
  --param nodeId="method:javascript/UserController.js:UserController.handleRequest"
```

**Build & Validation**:
```bash
# From project root
just build

# Verify manifest
cat packages/extension/src/vsc-scripts/manifest.json | jq '.scripts["symbol.calls"]'

# Manual test (from test/ workspace)
cd /workspaces/vscode-bridge/test
vscb script run symbol.calls \
  --param nodeId="method:javascript/UserService.js:UserService.getUser" \
  --param direction=incoming
```

**Integration Tests**:
```bash
# From project root
npm run test:integration -- symbol-calls.test.ts

# Or via Vitest UI
npm run test:integration:ui
```

---

### Risks & Mitigations

**Phase-Specific Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Two-step coordination complexity** | Medium | Medium | TAD exploration with 3 dynamic scripts (prepare, incoming, outgoing) to understand workflow before implementation |
| **Language support matrix unclear** | High | Medium | Document support in MCP metadata, provide language-specific hints, test TypeScript/Python/JavaScript in integration tests |
| **Prepare returns null ambiguity** | Medium | Low | Clear error message: "Call hierarchy not supported for this language" with E_NO_LANGUAGE_SERVER code |
| **Empty results vs. unsupported** | Medium | Low | Return empty array with meta field `{ prepareSuccess: true, callsFound: 0 }` for clarity |
| **Timeout accumulation** (prepare + provide) | Low | Medium | 10s timeout per step (20s max); document expected latency in MCP metadata |
| **JavaScript call hierarchy unreliable** | High | Low | Document limitation in language hints, test with TypeScript fixtures primarily |

**Cross-Phase Risks** (from prior phases):
- **Windows path handling**: Already solved in Phase 1 (forward slashes required)
- **Nested class ambiguity**: Already solved in Phase 1 (hierarchical search)
- **LSP timeout/unavailability**: Already solved in Phase 1 (getLSPResultWithTimeout wrapper)

---

### Ready Check

**Implementation understanding verified**:

- [x] **Two-step LSP process**: prepareCallHierarchy must be called before provideIncomingCalls/provideOutgoingCalls
- [x] **Prepare validation**: prepare can return null/empty and must throw E_NO_LANGUAGE_SERVER before proceeding
- [x] **Direction routing**: params.direction determines which provide command to call (incoming vs outgoing)
- [x] **CallHierarchy structures**: Difference between CallHierarchyIncomingCall (from + fromRanges) and CallHierarchyOutgoingCall (to + fromRanges)
- [x] **Phase 1 API dependencies**: Used resolveSymbolInput, getLSPResultWithTimeout, buildFlowspaceIdAtPosition
- [x] **QueryScript pattern**: execute() returns data object directly (not ActionResult)
- [x] **Dynamic script workflow**: Used hot-reload scripts for validation
- [x] **Error code strategy**: E_NO_LANGUAGE_SERVER (prepare fails) vs E_NOT_FOUND (symbol not found)
- [x] **Empty results handling**: Return empty array (not error) for functions with no callers/callees
- [x] **Critical Position Fix**: Use selectionRange.start (identifier token) not range.start (declaration span) for position-sensitive LSPs

---

## Phase Footnote Stubs

[^9]: Phase 5 - CallHierarchyScript implementation (T002 consolidated tasks T017-T029)
  - [class:packages/extension/src/vsc-scripts/symbol/calls.ts:CallHierarchyScript](packages/extension/src/vsc-scripts/symbol/calls.ts#L21)
  - [method:packages/extension/src/vsc-scripts/symbol/calls.ts:CallHierarchyScript.execute](packages/extension/src/vsc-scripts/symbol/calls.ts#L28)
  - [method:packages/extension/src/vsc-scripts/symbol/calls.ts:CallHierarchyScript._prepareCallHierarchy](packages/extension/src/vsc-scripts/symbol/calls.ts#L67)
  - [method:packages/extension/src/vsc-scripts/symbol/calls.ts:CallHierarchyScript._provideCalls](packages/extension/src/vsc-scripts/symbol/calls.ts#L94)
  - [method:packages/extension/src/vsc-scripts/symbol/calls.ts:CallHierarchyScript._formatCalls](packages/extension/src/vsc-scripts/symbol/calls.ts#L129)
  - [method:packages/extension/src/vsc-scripts/symbol/calls.ts:CallHierarchyScript._findSymbolAtPosition](packages/extension/src/vsc-scripts/symbol/calls.ts#L165)
  - [method:packages/extension/src/vsc-scripts/symbol/calls.ts:CallHierarchyScript._handleError](packages/extension/src/vsc-scripts/symbol/calls.ts#L187)
  - Simplified approach: Consolidated symbol resolution, two-step LSP workflow (prepare → provide), direction routing, response normalization, and error handling into unified implementation

[^10]: Phase 5 - MCP metadata (T003 consolidated tasks T030-T033)
  - [file:packages/extension/src/vsc-scripts/symbol/calls.meta.yaml](packages/extension/src/vsc-scripts/symbol/calls.meta.yaml)
  - Comprehensive MCP guidance including two-step process explanation, parameter hints for all fields, error contract (E_NO_LANGUAGE_SERVER, E_NOT_FOUND, E_TIMEOUT, E_INVALID_INPUT), relationships, and safety flags

[^11]: Phase 5 - Registry integration and build validation (T040-T041)
  - [file:packages/extension/src/vsc-scripts/index.ts](packages/extension/src/vsc-scripts/index.ts)
  - Build system successfully registered symbol.calls script, generated manifest.json schema with all parameters

[^12]: Phase 5 - Dynamic validation script (kept as permanent sample)
  - [file:scripts/sample/dynamic/test-call-hierarchy.js](scripts/sample/dynamic/test-call-hierarchy.js)
  - Unified exploration script for testing prepare → provide workflow with real LSP; demonstrates both incoming and outgoing directions

---

## Evidence Artifacts

**Execution Log Location**: `/workspaces/vscode-bridge/docs/plans/25-lsp-features/tasks/phase-5-call-hierarchy-tool/execution.log.md`

**Expected Contents** (created during plan-6 implementation):
- Dynamic script exploration findings (prepare, incoming, outgoing LSP behavior)
- CallHierarchyItem structure documentation
- Language support matrix observations (TypeScript vs JavaScript vs Python)
- Timeout behavior under different conditions
- Edge case handling decisions (empty results, prepare failures)
- Test promotion rationale
- Manual test results
- Build validation outputs

**Format**: Markdown with timestamped entries, code snippets, LSP response examples, screenshots of MCP tool calls

---

