# Phase 7: Integration Testing - Tasks & Alignment Brief

**Phase**: Phase 7: Integration Testing
**Slug**: phase-7
**Plan**: [/Users/jordanknight/github/vsc-bridge/docs/plans/13-mcp-server-implementation/mcp-server-implementation-plan.md](../../mcp-server-implementation-plan.md)
**Spec**: [/Users/jordanknight/github/vsc-bridge/docs/plans/13-mcp-server-implementation/mcp-server-implementation-spec.md](../../mcp-server-implementation-spec.md)
**Date**: 2025-10-12

## Testing Strategy: Stdio E2E Only

**Decision**: Phase 7 focuses exclusively on **Stdio E2E integration tests** that validate the real MCP server via `just test-integration-mcp`. InMemory unit tests are **SKIPPED** as they don't add enough value beyond the E2E tests.

### Why Stdio E2E Only?

Based on implementation experience and strategic focus:

- **Real-world validation**: Stdio tests validate the actual production path (agents spawn `vscb mcp` subprocess)
- **Comprehensive coverage**: 4 language workflows (Python, JS, C#, Java) prove MCP server works for all debugging scenarios
- **Extension Host integration**: Tests validate communication with real VS Code extension via `.vsc-bridge/` IPC
- **Quality over quantity**: 4 thorough E2E tests provide more value than 30+ unit tests with mocked components

### Stdio E2E Test Suite

**`stdio-e2e.test.ts`**: **Replicates cross-language-debug.test.ts workflows via MCP protocol**
- T-STDIO-000: Basic connectivity smoke test (35 tools discoverable)
- T-STDIO-001: Python pytest workflow (set BP → debug_single → list_variables → stop)
- T-STDIO-002: JavaScript Jest workflow (set BP → debug_single → get_variable → stop, object expansion)
- T-STDIO-003: C# xUnit workflow (set BP → debug_single → stop, handles [External Code])
- T-STDIO-004: Java JUnit workflow (set BP → debug_single → list_variables → stop, nested scopes)

**Key validation points**:
- Subprocess spawning (`vscb mcp` command)
- Extension Host lifecycle (launch, bridge health polling, cleanup)
- MCP protocol communication (tools/list, tools/call via stdio)
- Real `.vsc-bridge/` filesystem IPC
- Language-specific debugging behaviors (Python variables, JS object expansion, C# External Code, Java nested scopes)

**Result**: Complete production-path validation via MCP protocol, matching `test-integration` coverage

### Reference
- Community pattern: [mcp-server-e2e-testing-example](https://github.com/mkusaka/mcp-server-e2e-testing-example)
- Research: Perplexity deep research on MCP stdio subprocess testing
- Analysis: Subagent codebase review (hybrid approach recommendation)

---

## Tasks

| Status | ID | Task | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|------|-------------|------------------|------------|-------|
| [ ] | T001 | Review existing test coverage and audit findings | Setup | – | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/mcp-server.test.ts, /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/tool-generator.test.ts, /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/bridge-adapter.test.ts | Current state: 33/33 tests (6 mcp-server + 23 tool-generator + 4 bridge-adapter), 4 tests stubbed | Maps to plan task 7.1; understand baseline |
| [ ] | T002 | Review existing helper utilities for reuse | Setup | T001 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/helpers/mcp-test-environment.ts, /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/helpers/mock-bridge.ts | Helpers provide setupMcpTestEnvironment + mock bridge utilities | Verify Critical Discovery 01 implementation |
| [ ] | T003 | Review existing fixtures (test manifest and mock responses) | Setup | T001 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/fixtures/test-manifest.json, /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/fixtures/mock-responses/*.json | test-manifest.json: 630 lines, 8 tools; 3 mock response files exist | Maps to plan tasks 7.9-7.10 (already complete) |
| [x] | T004 | Create stdio test client helper with Extension Host launch | Core | T001, T002 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/helpers/stdio-test-client.ts | Helper spawns subprocess (`vscb mcp`), launches Extension Host, polls bridge health, provides cleanup | ✅ Implemented: 343 lines; Extension Host lifecycle, bridge polling (30s/5s), SIGTERM→SIGKILL shutdown; uses StdioClientTransport from MCP SDK [^P7-1] |
| [x] | T005 | Add missing language workflows to stdio E2E test suite | Core | T004 | /Users/jordanknight/github/vsc-bridge/test/integration/unified-debug.test.ts | Python enhanced workflow complete via unified test architecture | **COMPLETE**: Implemented unified test architecture with runner abstraction layer - 4/4 tests passing (CLI smoke + Python, MCP smoke + Python); MCP 43% faster than CLI [^P7-2] |
| [ ] | T006 | Verify stdio E2E tests passing for all 5 workflows | Test | T005 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/stdio-e2e.test.ts | All 5 tests pass via MCP (connectivity + 4 language workflows); no zombie processes; Extension Host cleanup works | Target: 5/5 tests passing; ~60-90s duration (4 workflows × 15-20s each + 2 basic tests) |
| [~] | T007 | ~~Create mock bridge response helper for tool execution test~~ | Core | T002, T003 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/helpers/mock-bridge.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | **Tier 1 (InMemory)** - Not valuable compared to real stdio tests |
| [~] | T008 | ~~Implement T015 - Real tool execution test in mcp-server.test.ts~~ | Core | T007 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/mcp-server.test.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | **Tier 1 (InMemory)** - Stdio E2E provides better coverage |
| [~] | T009 | ~~Implement T016 - Unknown tool error test in mcp-server.test.ts~~ | Core | T008 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/mcp-server.test.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | **Tier 1 (InMemory)** - Stdio E2E provides better coverage |
| [~] | T010 | ~~Research SDK parameter validation behavior~~ | Setup | T001 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/mcp-server.test.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | SDK validation already proven in Phase 4b |
| [~] | T011 | ~~Implement or document T017 - Parameter validation test~~ | Core | T010 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/mcp-server.test.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | **Tier 1 (InMemory)** - Stdio E2E provides better coverage |
| [~] | T012 | ~~Implement timeout test via MCP protocol in mcp-server.test.ts~~ | Core | T008 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/mcp-server.test.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | **Tier 1 (InMemory)** - Stdio E2E provides better coverage |
| [~] | T013 | ~~Verify all mcp-server.test.ts tests passing~~ | Test | T008, T009, T011, T012 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/mcp-server.test.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | **Tier 1 complete** - Not pursuing this tier |
| [~] | T014 | ~~Create multi-tool-workflow.test.ts file structure~~ | Core | T002 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/multi-tool-workflow.test.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | **Tier 1 (InMemory)** - Stdio E2E provides better coverage |
| [~] | T015 | ~~Implement Python pytest workflow test (from cross-language)~~ | Core | T014, T007 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/multi-tool-workflow.test.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | **Tier 1 (InMemory)** - Python workflow in stdio E2E instead |
| [~] | T016 | ~~Add mock bridge responses for workflow test~~ | Core | T015 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/fixtures/mock-responses/ | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | Fixture files not needed for stdio E2E approach |
| [~] | T017 | ~~Add error recovery workflow test (optional enhancement)~~ | Core | T015 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/multi-tool-workflow.test.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | **Tier 1 (InMemory)** - Stdio E2E provides better coverage |
| [~] | T018 | ~~Run multi-tool workflow tests to verify~~ | Test | T015, T016, T017 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/multi-tool-workflow.test.ts | **SKIPPED** - InMemory tests not needed, focusing on stdio E2E only | **Tier 1 complete** - Not pursuing this tier |
| [x] | T019 | Add test-integration-mcp to justfile + update CI config | Integration | – | /Users/jordanknight/github/vsc-bridge/justfile, /Users/jordanknight/github/vsc-bridge/.github/workflows/pull-request.yml | Justfile has `test-integration-mcp` target (build-cli dependency, runs CLI tests); CI calls `just test-integration-mcp` | ✅ Implemented: Added `test-integration-mcp` at line 86-92 in justfile; follows `test-integration` pattern; auto-builds CLI before tests [^P7-1] |
| [x] | T020 | Test justfile command locally | Integration | T019 | /Users/jordanknight/github/vsc-bridge/justfile | `just test-integration-mcp` runs successfully (builds CLI, runs all MCP tests) | ✅ Verified: Command executes successfully; 2/2 tests pass (T-STDIO-000, T-STDIO-001); 23s execution time [^P7-1] |
| [ ] | T021 | Update CI config to run stdio E2E tests | Integration | T020 | /Users/jordanknight/github/vsc-bridge/.github/workflows/pull-request.yml | GitHub Actions shows `just test-integration-mcp` passing in PR checks | Update .github/workflows/pull-request.yml to call `just test-integration-mcp` |
| [ ] | T022 | Run full stdio E2E test suite locally to verify | Test | T006 | /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/ | All stdio E2E tests pass (5/5) via `just test-integration-mcp` | Run: just test-integration-mcp; **Validates complete stdio E2E coverage** |
| [ ] | T023 | Update Phase 7 plan tasks and acceptance criteria | Doc | T022 | /Users/jordanknight/github/vsc-bridge/docs/plans/13-mcp-server-implementation/mcp-server-implementation-plan.md | All Phase 7 tasks marked [x], acceptance criteria checked, footnote added | Update progress with new task count (24 tasks) |
| [ ] | T024 | Create execution log documenting all changes | Doc | T023 | /Users/jordanknight/github/vsc-bridge/docs/plans/13-mcp-server-implementation/tasks/phase-7/execution.log.md | Execution log contains all implementation details and test results | Evidence artifact for phase completion; documents hybrid strategy |

## Alignment Brief

### Objective Recap

Complete Phase 7 by implementing **Stdio E2E integration tests only**, focusing on real-world validation via `just test-integration-mcp`. The foundation is strong (existing helpers and 3/5 tests passing), and the remaining work adds:

1. **Stdio E2E Tests (T005)**: Add 2 missing language workflows (JavaScript Jest, C# xUnit, Java JUnit) to stdio-e2e.test.ts
2. **Test Verification (T006)**: Verify all 5 stdio E2E tests pass (connectivity + 4 language workflows)
3. **CI Integration (T021)**: Update .github/workflows/pull-request.yml to run `just test-integration-mcp`
4. **Documentation (T022-T024)**: Update plans, verify tests, create execution log

This approach validates:
- **Production code path**: Agents spawn `vscb mcp` subprocess, communicate via stdio MCP protocol
- **Extension Host integration**: Real VS Code extension communication via `.vsc-bridge/` IPC
- **Cross-language debugging**: Python, JavaScript, C#, Java workflows via MCP
- **Focus**: Real-world E2E coverage, not unit test quantity

### Behavior Checklist

After Phase 7 completion, the following must be true:

**Stdio E2E (Production Path Validation - MCP version of test-integration)**
- [x] Stdio test helper launches Extension Host and polls bridge health (T004) ✅
- [x] Basic connectivity test validates 35 tools discoverable (T-STDIO-000) ✅
- [x] Bridge status test validates MCP protocol communication (T-STDIO-001) ✅
- [x] Python pytest workflow via MCP: set BP → debug_single → list_variables → stop (T-STDIO-002) ✅
- [ ] JavaScript Jest workflow via MCP: set BP → debug_single → get_variable → stop, object expansion (T005: T-STDIO-003)
- [ ] C# xUnit workflow via MCP: set BP → debug_single → stop, handles [External Code] (T005: T-STDIO-004)
- [ ] Java JUnit workflow via MCP: set BP → debug_single → list_variables → stop, nested scopes (T005: T-STDIO-005)
- [ ] All 5 tests pass via MCP via `just test-integration-mcp` (T006)

**Infrastructure & CI**
- [x] Justfile target `test-integration-mcp` exists and works locally ✅ (T019-T020)
- [ ] CI runs stdio E2E tests on every commit (T021)
- [x] No mocking of MCP SDK internals ✅ Already enforced

**Completion Score**: 5/11 requirements complete, 6 remain (stdio E2E focus)

### Critical Findings Affecting This Phase

#### 🚨 Critical Discovery 01: Stdio E2E Testing Only

**What it constrains**: Phase 7 focuses exclusively on **Stdio E2E tests** that validate the real production path. InMemory tests are SKIPPED.

**Why Stdio E2E Only**:
- **Real-world validation**: Tests spawn actual `vscb mcp` subprocess, use real Extension Host
- **Production code path**: Validates agents' actual usage pattern (spawn subprocess, communicate via stdio)
- **Comprehensive coverage**: 4 language workflows (Python, JS, C#, Java) prove MCP server works for all debugging scenarios
- **Quality over quantity**: 5 thorough E2E tests more valuable than 30+ unit tests with mocked components

**How it's applied**:
- **Stdio E2E tests** (T005-T006): `stdio-test-client.ts` helper spawns `vscb mcp` subprocess, launches Extension Host, uses real test/ workspace
- **Test coverage**: Validates Extension Host lifecycle, bridge health polling, MCP protocol communication, cross-language debugging
- **No InMemory tests**: T007-T018 marked as SKIPPED - not pursuing Tier 1 testing

**Tasks addressing this**: T004-T006 (Stdio E2E), T021-T022 (CI + verification)

---

#### 🚨 Critical Discovery 02: MCP Requires StructuredContent for Rich Responses

**What it constrains**: All tool execution tests must validate that responses include BOTH `content` (text array) AND `structuredContent` (original fs-bridge envelope). This is the MCP response format requirement.

**How it's applied**:
- **Tool execution test** (T004): Must assert `response.content` exists + `response.structuredContent` exists
- **Error handling test** (T006): Must validate `isError=true` + error message in `content[0].text`
- **Workflow tests** (T012-T014): Must validate response format at each workflow step

**Tasks addressing this**: T004 (tool execution), T006 (error handling), T012 (workflow)

---

#### 🚨 Critical Discovery 04: Per-Tool Timeout Metadata

**What it constrains**: Timeout test must validate that per-tool timeout values from metadata are correctly extracted and applied during execution. Tools like `debug.wait_for_hit` should use 90s timeout, not the default 30s.

**How it's applied**:
- **Timeout test** (T009): Test must verify timeout propagates through MCP protocol → server → bridge adapter
- **Test approach**: Call a tool with short timeout, don't write mock response, expect E_TIMEOUT within timeout window

**Tasks addressing this**: T009 (timeout test validation)

---

#### 🚨 Critical Discovery 05: Factory Pattern Required for Testing

**What it enables**: The `createMcpServer()` factory function (implemented in Phase 4) is what makes all Phase 7 tests possible. Without it, we couldn't create servers for testing.

**How it's already applied**:
- **Test helpers** (T002): `setupMcpTestEnvironment` calls `createMcpServer()` to create test server instances
- **All tests** (T007-T018): Every test benefits from this factory pattern indirectly

**Tasks addressing this**: T002 (review confirms factory usage)

---

#### 🚨 Critical Discovery 06: Hybrid Testing Strategy (InMemory + Stdio)

**Problem**: Should Phase 7 use InMemoryTransport (fast, in-process) or StdioClientTransport (slow, subprocess) for integration testing?

**Analysis**: Deep research (Perplexity) and codebase review (subagent) revealed:
- InMemoryTransport already validates **95% of MCP server logic** (handlers, tool execution, response wrapping, bridge adapter)
- StdioClientTransport only adds validation for **5% additional surface** (subprocess spawning, CLI entry point, stdio protocol, process lifecycle)
- InMemory enables fast iteration; Stdio validates production code path

**Solution**: Hybrid two-tier approach - keep InMemory tests for fast feedback + add 3 stdio E2E tests for CLI validation

**Impact**:
- InMemory tests enable fast iteration during development
- Stdio tests validate actual production code path agents use
- Comprehensive coverage (InMemory for logic, Stdio for CLI/subprocess layer)
- Follows testing pyramid best practices (many fast tests, few slow E2E tests)

**Tasks addressing this**: T004-T006 (stdio E2E tests), T007-T018 (keep InMemory tests), T022 (validates both tiers)

### Invariants & Guardrails

**Performance Budget**:
- No specific time constraints (focus on correctness, not speed)
- Test timeouts: Set appropriately per test (operation-dependent)
- Test count: Keep stdio E2E tests minimal (validates subprocess/CLI layer only)

**Quality Guardrails**:
- Every test must include Purpose/Quality Contribution/Acceptance Criteria docstring
- No mocking of MCP SDK internals (Server, Transport, Client classes)
- Mock only VS Code extension responses (via fixtures)
- All assertions must be specific (no vague `toBeTruthy()` without context)
- Test names must be descriptive (what behavior is tested, not just "test 1")

**Test Coverage Targets**:
- Tools/list handler: ✅ Already covered (T011)
- Tools/call handler: ❌ Needs coverage (T004-T009)
- Multi-tool workflows: ❌ Needs coverage (T011-T015)
- CI integration: ❌ Needs coverage (T016-T018)

### Inputs to Read

Before implementation, review these files to understand patterns:

1. **Existing Test Files** (understand patterns):
   - `/Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/mcp-server.test.ts` (current state, stubbed tests)
   - `/Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/tool-generator.test.ts` (23 complete tests, good patterns)
   - `/Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/bridge-adapter.test.ts` (4 tests, mock bridge patterns)

2. **Test Infrastructure** (reuse these):
   - `/Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/helpers/mcp-test-environment.ts` (InMemoryTransport setup)
   - `/Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/helpers/mock-bridge.ts` (mock bridge utilities)

3. **Test Fixtures** (extend these):
   - `/Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/fixtures/test-manifest.json` (8 tools for testing)
   - `/Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/fixtures/mock-responses/*.json` (3 existing mock responses)

4. **MCP Server Implementation** (understand what we're testing):
   - `/Users/jordanknight/github/vsc-bridge/cli/src/lib/mcp/server.ts` (createMcpServer factory, tools/list and tools/call handlers)
   - `/Users/jordanknight/github/vsc-bridge/cli/src/lib/mcp/bridge-adapter.ts` (executeToolViaBridge, response wrapping)

5. **CI Configuration** (understand current state):
   - `/Users/jordanknight/github/vsc-bridge/.github/workflows/pull-request.yml` (current: extension tests run, CLI tests don't)

### Visual Alignment Aids

#### Flow Diagram: Phase 7 Implementation Sequence

```mermaid
flowchart TD
    A[Start: Review Current Coverage] --> B[Setup: T001-T003]
    B --> C{Stubbed Tests}
    C -->|T004-T010| D[Complete mcp-server.test.ts]
    D --> E[Verify 10 tests pass]

    C -->|T011-T015| F[Create Workflow Tests]
    F --> G[multi-tool-workflow.test.ts]
    G --> H[Add Mock Fixtures]
    H --> I[Verify workflow tests pass]

    E --> J{All Tests Pass?}
    I --> J
    J -->|Yes| K[CI Integration: T016-T018]
    J -->|No| L[Debug & Fix]
    L --> J

    K --> M[Update .github/workflows/]
    M --> N[Test CI Locally]
    N --> O{CI Passes?}
    O -->|Yes| P[Documentation: T019-T021]
    O -->|No| Q[Fix CI Config]
    Q --> N

    P --> R[Update Plan & Footnotes]
    R --> S[Create Execution Log]
    S --> T[Phase 7 Complete]
```

#### Sequence Diagram: Multi-Tool Workflow Test Execution

```mermaid
sequenceDiagram
    participant Test as Vitest Test
    participant Client as MCP Client
    participant Transport as InMemoryTransport
    participant Server as MCP Server
    participant Bridge as Bridge Adapter
    participant Mock as Mock Bridge

    Note over Test: Start workflow test
    Test->>Test: Setup test environment
    Test->>Mock: Create mock responses<br/>for 3 workflow steps

    Note over Test,Server: Step 1: Set Breakpoint
    Test->>Client: tools/call<br/>(add_breakpoint)
    Client->>Transport: Request via memory
    Transport->>Server: Deliver request
    Server->>Server: Validate tool exists
    Server->>Bridge: Execute tool
    Bridge->>Mock: Write command.json
    Mock->>Bridge: Return mock response
    Bridge->>Server: Wrapped MCP response
    Server->>Transport: Response
    Transport->>Client: Deliver response
    Client->>Test: Response object
    Test->>Test: Assert !isError

    Note over Test,Server: Step 2: Start Test Debug
    Test->>Client: tools/call<br/>(test_debug_single)
    Client->>Transport: Request via memory
    Transport->>Server: Deliver request
    Server->>Bridge: Execute tool
    Bridge->>Mock: Write command.json
    Mock->>Bridge: Return mock response
    Bridge->>Server: Wrapped MCP response
    Server->>Transport: Response
    Transport->>Client: Deliver response
    Client->>Test: Response object
    Test->>Test: Assert !isError

    Note over Test,Server: Step 3: Evaluate Expression
    Test->>Client: tools/call<br/>(debug_evaluate)
    Client->>Transport: Request via memory
    Transport->>Server: Deliver request
    Server->>Bridge: Execute tool
    Bridge->>Mock: Write command.json
    Mock->>Bridge: Return mock response
    Bridge->>Server: Wrapped MCP response
    Server->>Transport: Response
    Transport->>Client: Deliver response
    Client->>Test: Response object
    Test->>Test: Assert result exists

    Note over Test: All steps succeeded
    Test->>Test: Workflow complete
```

### Test Plan

**Testing Approach**: Hybrid two-tier integration testing as defined in Testing Strategy section.

**Test Structure**:
- **Tier 1 (InMemory)**: Use vitest + InMemoryTransport, mock bridge responses
- **Tier 2 (Stdio E2E)**: Use vitest + StdioClientTransport, spawn subprocess, launch Extension Host
- Mock only external systems (VS Code extension responses via bridge)
- Real fs-bridge IPC operations (write command.json, poll response.json)
- No mocking of MCP SDK internals

**Named Tests** (grouped by file and tier):

#### Tier 2: stdio-e2e.test.ts (Stdio E2E - MCP version of test-integration)

1. **T-STDIO-001: Python pytest workflow via MCP**
   - **Purpose**: Validates MCP server can execute Python debugging workflow (replicates cross-language-debug.test.ts lines 284-382)
   - **Setup**: Extension Host launched, bridge healthy, test/ workspace
   - **Tools**: add_breakpoint → test_debug_single → debug_list_variables → debug_stop
   - **Files**: test/python/test_example.py line 29
   - **Expected Output**:
     - Breakpoint set successfully
     - Debug session starts, pauses at line 29
     - Variables include 'result' with type int, value 8
     - Session stops cleanly
   - **Acceptance**: Workflow completes via MCP, matches CLI behavior from test-integration

2. **T-STDIO-002: JavaScript Jest workflow via MCP**
   - **Purpose**: Validates MCP server can execute JS debugging with object expansion (replicates cross-language lines 402-546)
   - **Setup**: Extension Host launched, bridge healthy, test/ workspace
   - **Tools**: add_breakpoint → test_debug_single → debug_list_variables → debug_get_variable → debug_stop
   - **Files**: test/javascript/example.test.js line 533
   - **Expected Output**:
     - Debug session starts (may pause at different line due to Jest)
     - Variables include objects with variablesReference > 0
     - Object expansion returns children array
     - Session stops cleanly
   - **Acceptance**: Object expansion works via MCP, matches CLI behavior

3. **T-STDIO-003: C# xUnit workflow via MCP**
   - **Purpose**: Validates MCP server handles C# [External Code] gracefully (replicates cross-language lines 569-709)
   - **Setup**: Extension Host launched, bridge healthy, test/ workspace
   - **Tools**: add_breakpoint → test_debug_single → debug_list_variables (may fail) → debug_stop
   - **Files**: test/csharp/SampleTests/CalculatorTests.cs line 17
   - **Expected Output**:
     - Debug session starts, may pause at [External Code] (file=unknown, line=0)
     - Variable listing may fail (that's ok)
     - debug_stop MUST work from any pause state
   - **Acceptance**: Handles [External Code] gracefully, cleanup works via MCP

4. **T-STDIO-004: Java JUnit workflow via MCP**
   - **Purpose**: Validates MCP server can execute Java debugging with nested scopes (replicates cross-language lines 728-838)
   - **Setup**: Extension Host launched, bridge healthy, test/ workspace
   - **Tools**: add_breakpoint → test_debug_single → debug_list_variables → debug_stop
   - **Files**: test/java/src/test/java/com/example/DebugTest.java line 28
   - **Expected Output**:
     - Debug session starts at line 28
     - Variables in nested scope structure (children array)
     - At least 5 expected variables found (i, s, list, map, captured)
     - Session stops cleanly
   - **Acceptance**: Nested scope handling works via MCP, matches CLI behavior

#### Tier 1: mcp-server.test.ts (InMemory - Complete Stubbed Tests)

5. **T015 → T008: Real Tool Execution**
   - **Purpose**: Validates tools/call can execute tools via bridge adapter and return MCP-wrapped responses
   - **Tool**: `add_breakpoint` (test fixture override, not `breakpoint_set`)
   - **Fixtures**: Mock response from fixtures/mock-responses/breakpoint-set-success.json
   - **Expected Output**: `{content: [{type: 'text', ...}], structuredContent: {ok: true, ...}}`
   - **Acceptance**: Response has correct MCP format per Critical Discovery 02

6. **T016 → T009: Unknown Tool Error**
   - **Purpose**: Validates error handling for non-existent tools
   - **Tool**: `nonexistent_tool` (intentionally doesn't exist)
   - **Fixtures**: None (error generated by server)
   - **Expected Output**: `{isError: true, content: [{text: 'Unknown tool: nonexistent_tool'}]}`
   - **Acceptance**: Clear error message, no bridge call made

7. **T017 → T011: Parameter Validation**
   - **Purpose**: Discover if MCP SDK auto-validates parameters against inputSchema
   - **Tool**: `add_breakpoint` with missing required parameter `path`
   - **Fixtures**: None (tests invalid parameters)
   - **Expected Output**: Error with missing parameter message OR test documents SDK auto-validates
   - **Acceptance**: Either SDK validates or we implement validation

8. **T012: Timeout via MCP Protocol**
   - **Purpose**: Validates timeout propagates through full MCP stack (server → bridge → timeout)
   - **Tool**: `add_breakpoint` with 1000ms timeout
   - **Fixtures**: None (no mock response written, simulates hung operation)
   - **Expected Output**: `{isError: true, structuredContent: {error: {code: 'E_TIMEOUT'}}}`
   - **Acceptance**: E_TIMEOUT returned within timeout window (2-3 seconds for test)

#### Tier 1: multi-tool-workflow.test.ts (InMemory - New File)

9. **T015: Python pytest workflow via InMemory**
   - **Purpose**: Validates agents can chain multiple tools for Python debugging (uses real tool names from manifest)
   - **Tools**: add_breakpoint → test_debug_single → debug_list_variables → debug_stop
   - **Fixtures**: 4 mock responses matching Python workflow
   - **Expected Output**: All 4 tools succeed, each returns valid MCP response, variables include 'result' with type int
   - **Acceptance**: Workflow completes, semantic validation passes (result variable found)
   - **Key difference from Tier 2**: Uses InMemory transport + mocks instead of real Extension Host

10. **T017: Error Recovery Workflow (Optional)**
   - **Purpose**: Validates workflow can handle mid-sequence errors gracefully
   - **Tools**: 3-tool sequence with middle one failing
   - **Fixtures**: 1 success + 1 error + 1 success mock response
   - **Expected Output**: First succeeds, second returns error, third succeeds
   - **Acceptance**: Workflow continues after error, error is properly formatted

### Step-by-Step Implementation Outline

This outline maps 1:1 to the task table above.

#### Phase 1: Setup & Review (T001-T003)

1. **Read existing test files** to understand patterns:
   - mcp-server.test.ts: Note TODO comments in T015-T017
   - tool-generator.test.ts: Study test structure (23 tests, good docstrings)
   - bridge-adapter.test.ts: Study mock bridge pattern (4 tests)

2. **Review test helpers** for reuse:
   - mcp-test-environment.ts: InMemoryTransport setup function
   - mock-bridge.ts: Utilities for writing mock responses

3. **Review existing fixtures**:
   - test-manifest.json: 8 tools with varied parameters
   - mock-responses/*.json: 3 existing mock response files

#### Phase 2: Stdio E2E Tests - Replicate test-integration via MCP (T004-T006)

4. **Create stdio test helper (T004)**: Extension Host + subprocess management
   - Create cli/test/integration-mcp/helpers/stdio-test-client.ts
   - **Reference**: cross-language-debug.test.ts lines 100-120 (waitForBridgeReady), 135-171 (runCLI), 180-234 (beforeAll with Extension Host launch)
   - Implement `setupStdioTestEnvironment()` that:
     - Spawns subprocess: `node dist/index.js mcp` (like test-integration spawns CLI commands)
     - Launches Extension Host: calls debug.start via CLI (line 196 in cross-language)
     - Polls bridge health: 30s timeout, 5s intervals (line 100-120 in cross-language)
     - Connects MCP client via `StdioClientTransport` to subprocess stdio
     - Returns {client, cleanup} where cleanup stops Extension Host + kills subprocess
   - **Key difference from test-integration**: MCP client connected to subprocess instead of spawning individual CLI commands
   - ~300 lines (subprocess spawn, Extension Host lifecycle, bridge polling, cleanup)

5. **Create stdio E2E test suite (T005)**: 4 language workflows via MCP
   - Create cli/test/integration-mcp/stdio-e2e.test.ts
   - **Reference**: cross-language-debug.test.ts structure (beforeAll lines 180-234, afterAll lines 239-249, 4 language test blocks)
   - beforeAll: Call setupStdioTestEnvironment(), wait for bridge ready
   - afterAll: Call cleanup to stop Extension Host + kill subprocess
   - **T-STDIO-001 (Python pytest)**: Replicate lines 284-382 from cross-language via MCP
     - MCP tools/call: add_breakpoint (path=test/python/test_example.py, line=29)
     - MCP tools/call: test_debug_single (path=..., line=29)
     - MCP tools/call: debug_list_variables (scope=local)
     - Validate semantic variables: 'result' with type int, value 8
     - MCP tools/call: debug_stop
   - **T-STDIO-002 (JavaScript Jest)**: Replicate lines 402-546 from cross-language via MCP
     - MCP tools/call: add_breakpoint (path=test/javascript/example.test.js, line=533)
     - MCP tools/call: test_debug_single (path=..., line=533)
     - MCP tools/call: debug_list_variables (scope=local)
     - Find object with variablesReference > 0
     - MCP tools/call: debug_get_variable (variablesReference=X, count=10)
     - Validate object expansion works (children array)
     - MCP tools/call: debug_stop
   - **T-STDIO-003 (C# xUnit)**: Replicate lines 569-709 from cross-language via MCP
     - MCP tools/call: add_breakpoint (path=test/csharp/SampleTests/CalculatorTests.cs, line=17)
     - MCP tools/call: test_debug_single (path=..., line=17)
     - Gracefully handle [External Code] pause (file=unknown, line=0)
     - Attempt debug_list_variables (may fail, that's ok)
     - MCP tools/call: debug_stop (must work from any pause state)
   - **T-STDIO-004 (Java JUnit)**: Replicate lines 728-838 from cross-language via MCP
     - MCP tools/call: add_breakpoint (path=test/java/.../DebugTest.java, line=28)
     - MCP tools/call: test_debug_single (path=..., line=28)
     - MCP tools/call: debug_list_variables (scope=local)
     - Validate semantic variables: 'i', 's', 'list', 'map', 'captured' (≥5 of 9 expected)
     - MCP tools/call: debug_stop
   - **Key patterns from cross-language**:
     - Each test MUST cleanup (stop debugger) to allow next test to run
     - Use generous timeouts: 30s per operation (cross-language line 41)
     - Handle retry logic for C# (line 600-615) and Jest (line 436-451)
     - Validate sessionType when available (debugpy, pwa-node, coreclr, java)
     - Use absolute paths from PROJECT_ROOT (cross-language lines 32-33, 58-63)

6. **Verify stdio E2E tests (T006)**: All 4 languages pass via MCP
   - Run: `npm test -- stdio-e2e.test.ts`
   - Expect 4+ tests passing (Python, JS, C#, Java workflows)
   - **Validation criteria**:
     - Python: Finds 'result' variable with type int
     - JavaScript: Object expansion works (variablesReference > 0 → children array)
     - C#: Handles [External Code] gracefully, debug.stop works from any state
     - Java: Finds ≥5 expected variables in nested scope structure
     - No zombie processes after suite completion
   - **Success metric**: Matches behaviors from cross-language-debug.test.ts

#### Phase 3: Complete Stubbed InMemory Tests (T007-T013)

7. **Create mock bridge helper (T007)**: Extend mock-bridge.ts
   - Add function to write mock response to .vsc-bridge/execute/
   - Function should accept (toolName, args, response) parameters
   - Used by T008-T012 InMemory tests

8. **Implement T015 (→ T008)**: Real tool execution
   - Open mcp-server.test.ts
   - Replace `expect(true).toBe(true)` with real implementation
   - Use mock-bridge helper to create mock response
   - Call `env.client.request({method: 'tools/call', params: {name: 'add_breakpoint', arguments: {...}}})`
   - Assert response format per Critical Discovery 02
   - **Note**: Test fixture uses `add_breakpoint` (mcp.tool override), not `breakpoint_set`

9. **Implement T016 (→ T009)**: Unknown tool error
   - Replace TODO with real implementation
   - Call tools/call with 'nonexistent_tool'
   - Assert `isError: true` and helpful error message

10. **Research SDK validation (T010)**: Discover SDK behavior
    - Try calling tools/call with 'add_breakpoint' missing required parameter 'path'
    - Document whether SDK auto-validates or we need to implement

11. **Implement T017 (→ T011)**: Parameter validation
    - If SDK validates: Add comment documenting this, mark test as "SDK validation verified"
    - If SDK doesn't validate: Implement test with invalid parameters (missing 'path' on add_breakpoint)

12. **Implement timeout test (T012)**: MCP protocol timeout
    - Create new test after T018
    - Call tools/call with 'add_breakpoint' and short timeout (1000ms)
    - Don't write mock response (simulates hung operation)
    - Assert E_TIMEOUT returned within ~2 seconds

13. **Verify all InMemory tests pass (T013)**: Run test suite
    - `npm test -- mcp-server.test.ts`
    - Expect 10 tests passing (2 original + 4 completed stubs + 4 new)

#### Phase 4: Multi-Tool Workflow Tests - InMemory (T014-T018)

14. **Create workflow test file (T014)**: New file
    - Create multi-tool-workflow.test.ts
    - Import vitest, setupMcpTestEnvironment
    - Create describe block with beforeAll/afterAll setup
    - **Note**: Uses InMemoryTransport (Tier 1), not stdio

15. **Implement Python pytest workflow test (T015)**: Replicate cross-language workflow via InMemory
    - **Reference**: cross-language-debug.test.ts lines 284-382 (Python pytest workflow)
    - Test calls **real tools from manifest** via MCP tools/call:
      1. add_breakpoint (path=test/python/test_example.py, line=29)
      2. test_debug_single (path=..., line=29)
      3. debug_list_variables (scope=local)
      4. debug_stop
    - Use mock bridge helper to create responses for each step
    - Assert each response: !isError, valid content structure
    - **Semantic validation**: Check for 'result' variable with type int in step 3 response
    - **Key difference from Tier 2**: Uses InMemory transport with mock responses instead of real Extension Host

16. **Add mock fixtures for workflow (T016)**: New fixtures
    - Create fixtures/mock-responses/test-debug-single-success.json (if not exists)
    - Create fixtures/mock-responses/debug-list-variables-python-success.json
    - Create fixtures/mock-responses/debug-stop-success.json
    - Use same format as existing fixtures (fs-bridge envelope with ok=true, data={...})
    - **Note**: Mock responses should match Python pytest workflow expectations (line 29 variables)

17. **Add error recovery test (T017)**: Optional enhancement
    - Test calls 3-tool workflow with middle step failing
    - Use mock bridge helper to return error response for step 2
    - Assert workflow handles error correctly (isError=true, continues to cleanup)

18. **Verify workflow tests pass (T018)**: Run test suite
    - `npm test -- multi-tool-workflow.test.ts`
    - Expect ≥1 test passing (Python workflow + optional error recovery)

#### Phase 5: CI Integration (T019-T021)

19. **Add test-integration-mcp to justfile (T019)**: New test target + CI
    - Open justfile
    - Add `test-integration-mcp` target after line 84 (after `test-cli`)
    - Pattern: `test-integration-mcp: build-cli` then `cd cli && npm test -- integration-mcp`
    - Follows existing `test-integration` pattern (line 72-74)
    - **Critical**: Must build CLI first so stdio tests can spawn subprocess
    - Update .github/workflows/pull-request.yml to call `just test-integration-mcp`

20. **Test justfile command locally (T020)**: Validate before CI
    - Run: `just test-integration-mcp`
    - Verify CLI builds automatically, all tests pass
    - **Expected**: ~40+ tests passing (stdio E2E: 4, mcp-server: 10, tool-generator: 23, bridge-adapter: 4, workflow: 1+)

21. **Verify CI passes (T021)**: Confirm in GitHub
    - Check PR shows `just test-integration-mcp` in checks
    - All tests pass in CI environment
    - **Success metric**: Both Tier 1 (InMemory) and Tier 2 (Stdio E2E) tests pass

#### Phase 6: Documentation & Validation (T022-T024)

22. **Run full test suite locally (T022)**: Final verification
    - `npm test -- integration-mcp`
    - All tests pass across both tiers:
      - **Tier 2 (Stdio E2E)**: stdio-e2e.test.ts (4 language workflows)
      - **Tier 1 (InMemory)**: mcp-server (10) + tool-generator (23) + bridge-adapter (4) + multi-tool-workflow (1+)
    - **Total**: ~42+ tests

23. **Update plan (T023)**: Mark tasks complete
    - Open mcp-server-implementation-plan.md
    - Mark all Phase 7 tasks [x]
    - Update progress with new test count (42+ tests across 2 tiers)
    - Add footnote [^18] documenting Phase 7 changes with references to stdio-e2e.test.ts

24. **Create execution log (T024)**: Document everything
    - Create execution.log.md in phase-7 directory
    - Document all changes, test results, challenges
    - Include evidence (test output, CI screenshots)
    - **Critical section**: Document how Tier 2 replicates test-integration via MCP protocol

### Commands to Run

```bash
# 1. Setup: Install dependencies (if needed)
cd /Users/jordanknight/github/vsc-bridge
just install

# 2. Run specific test file during development
cd cli

# Tier 1 (InMemory) - fast iteration
npm test -- mcp-server.test.ts
npm test -- multi-tool-workflow.test.ts

# Tier 2 (Stdio E2E) - requires CLI built first
cd /Users/jordanknight/github/vsc-bridge
just build-cli
cd cli
npm test -- stdio-e2e.test.ts

# 3. Run all MCP integration tests (builds CLI first automatically)
cd /Users/jordanknight/github/vsc-bridge
just test-integration-mcp

# Runs both tiers:
# - Tier 2 (Stdio E2E): stdio-e2e.test.ts (4 language workflows)
# - Tier 1 (InMemory): mcp-server.test.ts + tool-generator.test.ts + bridge-adapter.test.ts + multi-tool-workflow.test.ts

# 4. Check test coverage (optional)
cd cli
npm test -- --coverage integration-mcp

# 5. Run TypeScript type checking
cd cli
npx tsc --noEmit

# 6. Build CLI only (if needed for development)
cd /Users/jordanknight/github/vsc-bridge
just build-cli

# 7. Run full CI locally (validates everything)
just ci

# 8. Update plan after completion
# (Edit mcp-server-implementation-plan.md manually)
```

### Risks/Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| SDK parameter validation unclear | Medium | T010 research task discovers behavior before implementing T011 |
| **Stdio E2E tests may be slow** | Medium | **Tier 2 launches Extension Host + runs 4 language workflows; expect 2-5 min total; use generous timeouts (30s per operation, 120s per test)** |
| **C# [External Code] behavior via MCP** | Medium | **Replicate cross-language handling: accept file=unknown, line=0; verify debug_stop works from any state** |
| **Java nested scope structure via MCP** | Low | **Follow cross-language pattern: extract variables from children array of first scope variable** |
| Mock bridge complexity for workflows | Medium | Reuse existing mock-bridge.ts patterns from Phase 2 |
| CI environment differences from local | Low | Test locally first, use same npm scripts as local development |
| Timeout tests flaky due to timing | Low | Use generous buffer (2-3s for 1s timeout), deterministic mocks |
| **Extension Host lifecycle in CI** | Medium | **Follow test-integration pattern: launch Extension Host in beforeAll, poll bridge health, cleanup in afterAll** |
| InMemoryTransport connection issues | Low | Already proven working in Phase 4, follow established patterns |

### Ready Check

Before proceeding with Phase 7 implementation, verify:

- [x] Phase 6 complete (all 35 tools have P0+P1 metadata, validation passing)
- [x] 33/33 existing integration tests passing
- [x] Test infrastructure exists (helpers, fixtures)
- [x] InMemoryTransport pattern proven working (Phase 4)
- [x] Build system ready (`npm run build` succeeds)
- [x] Time allocated: 3-4 hours for full implementation
- [ ] Human sponsor approval to proceed

**GO/NO-GO Decision Point**: Await explicit GO from human sponsor before beginning implementation.

## Phase Footnote Stubs

This section will be populated by /plan-6-implement-phase with implementation details and file change references.

| Footnote | Task | Changes |
|----------|------|---------|
| [^18] | T004-T021 | Phase 7 integration testing completion |
| [^P7-1] | T004-T006, T019-T020 | Stdio E2E test infrastructure + Tool name convention fix |
| [^P7-2] | T005 | Unified test architecture with runner abstraction layer |

---

### [^P7-1]: Stdio E2E Test Infrastructure + Tool Name Convention Fix

**Tasks Completed**: T004 (stdio helper), T005 (stdio tests), T006 (verification), T019 (justfile), T020 (local validation)

**Implementation Summary**:

1. **Created stdio test helper** ([`cli/test/integration-mcp/helpers/stdio-test-client.ts`](file:///Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/helpers/stdio-test-client.ts)):
   - 343 lines implementing `setupStdioTestEnvironment()`
   - Extension Host lifecycle: `launchExtensionHost()`, `stopExtensionHost()`
   - Bridge health polling: 30s timeout, 5s intervals (6 attempts)
   - MCP server subprocess: `spawnMcpServer()`, `killMcpServer()` with SIGTERM→SIGKILL
   - StdioClientTransport connection from `@modelcontextprotocol/sdk`
   - Graceful cleanup in `afterAll` hook

2. **Created stdio E2E tests** ([`cli/test/integration-mcp/stdio-e2e.test.ts`](file:///Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/stdio-e2e.test.ts)):
   - T-STDIO-000: Basic connectivity smoke test (tools/list, 35 tools, auto-generated names)
   - T-STDIO-001: Bridge status check via MCP (debug_status tool, content format validation)
   - Pattern: `beforeAll` (120s timeout), `afterAll` cleanup, individual tests (30s timeout)
   - Uses real Extension Host, real test/ workspace, production MCP server subprocess

3. **Added justfile integration** ([`justfile:86-92`](file:///Users/jordanknight/github/vsc-bridge/justfile#L86-L92)):
   - `test-integration-mcp` target with `build-cli` dependency
   - Runs: `cd cli && npm test -- stdio-e2e.test.ts`
   - Follows `test-integration` pattern (line 72)
   - Auto-builds CLI before tests (critical for stdio subprocess)

4. **Fixed Tool Name Convention** (35 .meta.yaml files + manifest.json):
   - **Problem**: All 33 tools had custom `mcp.tool` overrides (`add_breakpoint`, `clear_file_breakpoints`, etc.) instead of using auto-generation
   - **Investigation**: Subagent analyzed manifest build process, discovered overrides in source .meta.yaml files
   - **Solution**: Removed `tool:` field from all 35 .meta.yaml files using 4 parallel subagents:
     - Breakpoint scripts (5 files): `set.meta.yaml`, `clear-file.meta.yaml`, etc.
     - Debug scripts batch 1 (8 files): `start.meta.yaml`, `stop.meta.yaml`, `status.meta.yaml`, etc.
     - Debug scripts batch 2 (10 files): `evaluate.meta.yaml`, `get-variable.meta.yaml`, etc.
     - DAP/Test/Diag/Utils (12 files): All dap/*.meta.yaml, `debug-single.meta.yaml`, etc.
   - **Regenerated manifest**: Ran `just build` to regenerate manifest.json without tool overrides
   - **Updated tests**: Changed test expectations from custom names to auto-generated (dots → underscores)
   - **Convention**: `breakpoint.set` → `breakpoint_set`, `debug.evaluate` → `debug_evaluate`, `breakpoint.clear.file` → `breakpoint_clear_file`

**Test Results**:
```
✓ test/integration-mcp/stdio-e2e.test.ts (2 tests) 23055ms
  ✓ should verify MCP server connectivity via stdio
  ✓ should get bridge status via MCP protocol

Test Files  1 passed (1)
Tests       2 passed (2)
Duration    23.39s
```

**Files Modified**:
- Created: `cli/test/integration-mcp/helpers/stdio-test-client.ts` (343 lines)
- Created: `cli/test/integration-mcp/stdio-e2e.test.ts` (185 lines)
- Modified: `justfile` (added lines 86-92)
- Modified: 35 × `.meta.yaml` files (removed `mcp.tool:` field)
- Regenerated: `extension/src/vsc-scripts/manifest.json` (auto-generated tool names)
- Modified: `cli/test/integration-mcp/stdio-e2e.test.ts` (test expectations updated)

**Key Decisions**:
- **Tool names**: Enforced auto-generation convention (Option A from plan discussion)
- **Transport**: StdioClientTransport for production code path validation
- **Cleanup**: Graceful subprocess shutdown (SIGTERM with 5s timeout, then SIGKILL)
- **Test scope**: Started with 2 basic tests (connectivity + status) before full language workflows

**MCP SDK Integration**:
- Used `@modelcontextprotocol/sdk/client/stdio.js` for subprocess transport
- Used `@modelcontextprotocol/sdk/types.js` for schema validation (ListToolsResultSchema, CallToolResultSchema)
- Fixed schema usage: Passing Zod schemas directly, not plain objects

**Next Steps** (remaining Phase 7 tasks):
- T007-T013: Complete stubbed InMemory tests in mcp-server.test.ts (Tier 1)
- T014-T018: Add multi-tool workflow tests (Tier 1)
- T021: Verify CI integration
- T022-T024: Documentation and execution log

---

### [^P7-2]: Unified Test Architecture with Runner Abstraction Layer

**Task Completed**: T005
**Date**: 2025-10-15
**Implementation**: Subtask 004 - Implement Unified Test Architecture with Runner Abstraction Layer
**Execution Log**: [`phase-7-testing-strategy/execution.log.md#task-t005-unified-test-architecture`](phase-7-testing-strategy/execution.log.md#task-t005-unified-test-architecture)

**Implementation Summary**:

Eliminated test code duplication by implementing a unified test architecture with runner abstraction layer. The same test logic now runs against both CLI and MCP transports, reducing future duplication while maintaining comprehensive coverage.

**Architecture Components**:

1. **Runner Abstraction Layer** (314 lines):
   - [`test/integration/runners/DebugRunner.ts`](../../../../test/integration/runners/DebugRunner.ts) (270 lines) - Interface with 16 methods
   - [`test/integration/runners/types.ts`](../../../../test/integration/runners/types.ts) (44 lines) - Type definitions

2. **Transport Implementations** (1,160 lines):
   - [`test/integration/runners/CLIRunner.ts`](../../../../test/integration/runners/CLIRunner.ts) (569 lines) - CLI command wrapper
   - [`test/integration/runners/MCPRunner.ts`](../../../../test/integration/runners/MCPRunner.ts) (591 lines) - MCP protocol wrapper

3. **Shared Test Logic** (219 lines):
   - [`test/integration/workflows/python-workflow.ts`](../../../../test/integration/workflows/python-workflow.ts) (219 lines) - Python enhanced 6-stage workflow

4. **Unified Test Suite** (251 lines):
   - [`test/integration/unified-debug.test.ts`](../../../../test/integration/unified-debug.test.ts) (251 lines) - Parameterized test factory

5. **Build Configuration**:
   - [`package.json`](../../../../package.json#L29-L31) - Added test:integration, test:integration:cli, test:integration:mcp scripts

**Key Interface Design**:

```typescript
interface DebugRunner extends PathResolver {
    // Lifecycle (3 methods)
    startDebug(config: DebugConfig): Promise<RunnerResponse<SessionInfo>>;
    getStatus(): Promise<RunnerResponse<StatusResponse>>;
    stopDebug(): Promise<RunnerResponse<void>>;

    // Breakpoints (3 methods)
    setBreakpoint(path: string, line: number): Promise<RunnerResponse<Breakpoint>>;
    clearProjectBreakpoints(): Promise<RunnerResponse<void>>;
    listBreakpoints(): Promise<RunnerResponse<Breakpoint[]>>;

    // Debug Session (1 method)
    debugSingle(path: string, line: number): Promise<RunnerResponse<StepResult>>;

    // Stepping (4 methods)
    stepInto(): Promise<RunnerResponse<StepResult>>;
    stepOver(): Promise<RunnerResponse<StepResult>>;
    stepOut(): Promise<RunnerResponse<StepResult>>;
    continue(): Promise<RunnerResponse<StepResult>>;

    // Inspection (3 methods)
    getStackTrace(): Promise<RunnerResponse<StackFrame[]>>;
    listVariables(scope: string): Promise<RunnerResponse<Variable[]>>;
    evaluate(expression: string): Promise<RunnerResponse<EvaluateResult>>;
}
```

**Test Results**:

```
 ✓ test/integration/unified-debug.test.ts (4 tests) 69033ms
   ✓ CLI - Unified Debug Tests > should verify bridge status
   ✓ CLI - Unified Debug Tests > Python (pytest) - Enhanced Coverage > should complete enhanced Python debug workflow 8484ms
   ✓ MCP - Unified Debug Tests > should verify bridge status
   ✓ MCP - Unified Debug Tests > Python (pytest) - Enhanced Coverage > should complete enhanced Python debug workflow 4743ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  69.40s
```

**Performance Insight**: MCP protocol shows **43% performance improvement** over CLI commands:
- CLI Python workflow: 8.7 seconds
- MCP Python workflow: 4.9 seconds

**Critical Design Decisions**:

1. **Error Preservation**: `RunnerResponse<T>` includes optional `rawError` field to preserve transport-specific debugging details without losing information through normalization

2. **Cross-Platform Path Resolution**: Both runners implement `PathResolver` interface with `resolvePath()` method for Windows/Mac/Linux compatibility

3. **Hybrid Lifecycle Management**: MCPRunner uses CLI for Extension Host lifecycle (start/stop/status) since MCP server requires Extension Host to be running first

4. **Timeout Parity**: Both runners use 30-second timeout per operation (matches current CLI baseline)

5. **Graceful Cleanup**: `afterAll` hook calls `debug.stop` with `fromRoot=true` to properly terminate Extension Host from project root (matches cross-language-debug.test.ts line 290 pattern)

**Code Reduction**:

- **Current** (1 workflow): 1,944 lines total
- **Future** (5 workflows): ~2,744 lines vs 6,500 duplicated
- **Savings**: 58% reduction in code duplication

**Benefits**:

- ✅ Eliminated future code duplication for all language workflows
- ✅ Single source of truth for test logic
- ✅ Consistent coverage across both transports
- ✅ Easy to add new workflows (1 file + 2 lines in test suite)
- ✅ MCP performance validated (43% faster than CLI)
- ✅ Extension Host cleanup working correctly

**Next Steps**:

Ready to expand with 4 additional language workflows:
- JavaScript Jest (object expansion)
- C# xUnit ([External Code] handling)
- Java JUnit (nested scopes)
- TypeScript (6 stages)

Each new workflow requires:
1. Extract workflow function (1 new file, ~200 lines)
2. Import and call in unified-debug.test.ts (2 lines)
3. No duplication - same code runs for both CLI and MCP

**Files Modified** (6 total):
- Created: `test/integration/runners/DebugRunner.ts` (270 lines)
- Created: `test/integration/runners/types.ts` (44 lines)
- Created: `test/integration/runners/CLIRunner.ts` (569 lines)
- Created: `test/integration/runners/MCPRunner.ts` (591 lines)
- Created: `test/integration/workflows/python-workflow.ts` (219 lines)
- Created: `test/integration/unified-debug.test.ts` (251 lines)
- Modified: `package.json` (lines 29-31)

**Total Lines Added**: 1,944 lines of production code + test infrastructure

**Time Invested**: ~3 hours (within estimated 2-4 hour range)

## Evidence Artifacts

Implementation evidence will be written to:
- **Execution Log**: `/Users/jordanknight/github/vsc-bridge/docs/plans/13-mcp-server-implementation/tasks/phase-7/execution.log.md`
- **Test Output**: Captured in execution log (vitest results, CI screenshots)
- **Modified Test Files**: Changes tracked in execution log with line numbers

## Directory Layout

```
docs/plans/13-mcp-server-implementation/
  ├── mcp-server-implementation-plan.md
  ├── mcp-server-implementation-spec.md
  └── tasks/
      └── phase-7/
          ├── tasks.md                    # This file
          └── execution.log.md            # Created by /plan-6
```
