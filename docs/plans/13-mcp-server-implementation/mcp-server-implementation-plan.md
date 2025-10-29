# MCP Server Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2025-10-10
**Spec**: [./mcp-server-implementation-spec.md](./mcp-server-implementation-spec.md)
**Status**: DRAFT

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 0: Script Alias Refactoring](#phase-0-script-alias-refactoring)
   - [Phase 1: MCP SDK Setup](#phase-1-mcp-sdk-setup)
   - [Phase 2: Filesystem Bridge Adapter](#phase-2-filesystem-bridge-adapter)
   - [Phase 3: Tool Generator](#phase-3-tool-generator)
   - [Phase 4: Server Factory & Registration](#phase-4-server-factory--registration)
   - [Phase 5: CLI Command Implementation](#phase-5-cli-command-implementation)
   - [Phase 6: Metadata Enhancement](#phase-6-metadata-enhancement)
   - [Phase 7: Integration Testing](#phase-7-integration-testing)
   - [Phase 8: Documentation](#phase-8-documentation)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Progress Tracking](#progress-tracking)
8. [Change Footnotes Ledger](#change-footnotes-ledger)

## Executive Summary

**Problem**: AI coding agents cannot programmatically access VSC-Bridge's debugging and development tools. Agents need a standardized protocol to discover tools, understand parameters, and execute debugging workflows autonomously.

**Solution Approach**:
- Integrate MCP server as `vscb mcp` CLI subcommand using `@modelcontextprotocol/sdk`
- Auto-generate MCP tool definitions from existing script metadata (35+ tools)
- Communicate with VS Code extension via existing filesystem-based IPC (`.vsc-bridge/execute/`)
- Provide rich LLM guidance through enhanced metadata (P0+P1 fields)
- Enable testing via `InMemoryTransport` without requiring VS Code

**Expected Outcomes**:
- AI agents can discover and invoke all VSC-Bridge tools through MCP protocol
- Zero manual maintenance (tool definitions auto-generated from YAML metadata)
- Consistent tool naming (auto-generated from refactored script aliases)
- Integration tests validate tool execution without real agents

**Success Metrics**:
- All 35 tools exposed with correct schemas
- Integration tests pass with InMemoryTransport
- Agents can execute multi-tool debugging workflows
- Response time < 5 seconds for simple operations

## Technical Context

### Current System State

**Existing Infrastructure**:
- **CLI**: `/Users/jordanknight/github/vsc-bridge/cli/` - oclif-based command-line interface
- **Filesystem Bridge**: `cli/src/lib/fs-bridge.ts` - IPC client that writes commands to `.vsc-bridge/execute/<jobId>/`
- **Manifest Loader**: `cli/src/lib/manifest-loader.ts` - Reads generated `manifest.json` with script metadata
- **Script Metadata**: 35 `*.meta.yaml` files in `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/`
- **Generated Manifest**: `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/manifest.json`
- **Zod Schemas**: `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/generated/schemas.ts`

**Script Aliases (Current)**:
```
bp.* (breakpoint operations)
debug.* (debug session control)
dap.* (DAP protocol inspection)
tests.* (test execution)
diag.* (diagnostics)
utils.* (utilities)
```

### Integration Requirements

1. **MCP SDK Integration**: Add `@modelcontextprotocol/sdk` to CLI package.json
2. **Stdio Transport**: Use `StdioServerTransport` for agent communication
3. **Filesystem IPC**: Reuse existing fs-bridge.ts for extension communication
4. **Tool Generation**: Generate MCP tools from manifest.json at build time
5. **Factory Pattern**: Enable testing with `InMemoryTransport.createLinkedPair()`

### Constraints and Limitations

- **File-Based IPC**: Polling adds 50-150ms latency per operation
- **Local Only**: MCP server runs on same machine as VS Code extension
- **Stdio Transport**: Agents spawn `vscb mcp` as subprocess
- **Build-Time Generation**: Tool definitions generated during CLI build, not runtime
- **No Breaking Changes**: Existing CLI commands must continue working

### Assumptions

1. VS Code extension is running and has initialized `.vsc-bridge/` directory
2. All 35 scripts have valid `*.meta.yaml` files with complete parameters
3. Agents support MCP protocol specification (stdio transport minimum)
4. Node.js v18+ available for building and running CLI
5. Filesystem operations are atomic and reliable on all target platforms

## Critical Research Findings

### 🚨 Critical Discovery 01: InMemoryTransport for Testing

**Problem**: Cannot easily test MCP server without spawning real stdio process and agent.

**Root Cause**: MCP SDK's stdio transport requires process spawning, making unit tests slow and complex.

**Solution**: Use `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk/inMemory.js` to create linked client/server transports in same process.

**Example**:
```typescript
// ✅ CORRECT - Fast in-memory testing
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const [clientTx, serverTx] = InMemoryTransport.createLinkedPair();

// Connect server
const server = createMcpServer({ workspace: '/test/workspace' });
await server.connect(serverTx);

// Connect client
const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
await client.connect(clientTx);

// Make requests
const tools = await client.request({ method: 'tools/list' }, ListToolsResultSchema);
```

**Impact**: Enables fast integration tests without subprocess spawning. Requires factory pattern for server creation.

---

### 🚨 Critical Discovery 02: MCP Requires StructuredContent for Rich Responses

**Problem**: MCP SDK expects specific response format; fs-bridge returns different envelope structure.

**Root Cause**: MCP tools return `{content: TextContent[], structuredContent?: any}` but fs-bridge returns `{ok: boolean, type: string, data: any, meta: any}`.

**Solution**: Wrap fs-bridge responses in MCP envelope while preserving original data in `structuredContent`.

**Example**:
```typescript
// ❌ WRONG - Returning raw fs-bridge response
async handle(args: any) {
  const response = await executeViaBridge(toolName, args, options);
  return response; // Not valid MCP format!
}

// ✅ CORRECT - Wrap in MCP envelope
async handle(args: any) {
  const response = await executeViaBridge(toolName, args, options);

  if (!response.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: `[${response.error.code}] ${response.error.message}` }],
      structuredContent: response, // Preserve full error envelope
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data) }],
    structuredContent: response, // Preserve full success envelope
  };
}
```

**Impact**: All tool handlers must wrap responses. Bridge adapter handles this transformation.

---

### 🚨 Critical Discovery 03: Auto-Generate Tool Names from Refactored Aliases

**Problem**: Current script aliases use abbreviated prefixes (`bp.*`, `tests.*`) which don't translate well to MCP tool names.

**Root Cause**: Aliases were designed for CLI brevity, not hierarchical naming.

**Solution**: Refactor all script aliases to use full names (`breakpoint.*`, `test.*`) BEFORE generating MCP tools. Auto-generate MCP tool names by replacing dots with underscores.

**Example**:
```typescript
// ❌ WRONG - Abbreviated aliases
bp.set → bp_set (unclear for LLMs)
tests.debug-single → tests_debug_single (inconsistent)

// ✅ CORRECT - Refactored aliases with auto-generation
breakpoint.set → breakpoint_set (clear hierarchy)
test.debug_single → test_debug_single (consistent)
debug.evaluate → debug_evaluate (intuitive)
```

**Mapping Rules**:
```
bp.*     → breakpoint.*
tests.*  → test.*
diag.*   → diagnostic.*
utils.*  → util.*
debug.*  → debug.* (unchanged)
dap.*    → dap.* (unchanged)
```

**Impact**: Phase 0 must refactor all script aliases before MCP implementation begins. This affects:
- `*.meta.yaml` files (alias field)
- `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/` directory structure
- Generated manifest.json
- Existing tests and documentation

---

### 🚨 Critical Discovery 04: Per-Tool Timeout Metadata

**Problem**: Some tools need much longer timeouts than others (test.debug_single can take 60s+).

**Root Cause**: Default 30s timeout too short for test discovery and debug session startup.

**Solution**: Add optional `mcp.timeout` field to `*.meta.yaml` files. Bridge adapter uses tool-specific timeout when executing.

**Example**:
```yaml
# breakpoint.set.meta.yaml - Quick operation
mcp:
  timeout: 5000  # 5 seconds for breakpoint operations

# test.debug_single.meta.yaml - Long operation
mcp:
  timeout: 60000  # 60 seconds for test discovery + debug startup

# debug.wait_for_hit.meta.yaml - Very long operation
mcp:
  timeout: 90000  # 90 seconds waiting for breakpoint
```

**Implementation**:
```typescript
async function executeToolViaBridge(toolName: string, args: any, options: any) {
  const meta = getToolMetadata(toolName);
  const timeout = meta.mcp?.timeout ?? options.defaultTimeout ?? 30000;

  return await executeViaBridge(
    { name: toolName, args },
    { ...options, timeout }
  );
}
```

**Impact**: Metadata enhancement phase must add `mcp.timeout` to tools needing non-default timeouts.

---

### 🚨 Critical Discovery 05: Factory Pattern Required for Testing

**Problem**: Cannot test MCP server creation without exposing internal wiring.

**Root Cause**: CLI command directly creates and connects server, making test harness impossible.

**Solution**: Extract server creation into factory function that both CLI command and tests can use.

**Example**:
```typescript
// ❌ WRONG - Server created inline in CLI command
export default class Mcp extends Command {
  async run() {
    const server = new Server({ name: 'vsc-bridge-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
    // ... register tools ...
    await server.connect(new StdioServerTransport());
  }
}

// ✅ CORRECT - Factory pattern enables testing
// cli/src/lib/mcp/server.ts
export function createMcpServer(opts: { workspace?: string; timeout?: number }) {
  const server = new Server({ name: 'vsc-bridge-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

  // Register tools (same code for CLI and tests)
  const tools = generateMcpTools(opts);
  for (const tool of tools) {
    server.setRequestHandler(CallToolRequestSchema, tool.handler);
  }

  return server;
}

// cli/src/commands/mcp.ts
export default class Mcp extends Command {
  async run() {
    const server = createMcpServer({ workspace: flags.workspace, timeout: flags.timeout });
    await server.connect(new StdioServerTransport());
  }
}

// cli/test/integration-mcp/server.test.ts
test('lists tools', async () => {
  const [clientTx, serverTx] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ workspace: '/test/ws' });
  await server.connect(serverTx);
  // ... test ...
});
```

**Impact**: Phase 4 must implement factory pattern. Phase 5 uses factory in CLI command.

## Testing Philosophy

### Testing Approach

**Selected Approach**: Hybrid - Integration tests with in-memory MCP transport for core functionality, no strict TDD

**Rationale** (from spec):
- Use `InMemoryTransport.createLinkedPair()` from MCP SDK to create test harness that validates tool execution without requiring VS Code or real agents
- Write integration tests alongside implementation rather than strict TDD workflow
- Focus on end-to-end tool execution over granular unit tests

**Focus Areas**:
- **Tool generation** from manifest.json (correct naming, schemas, metadata)
- **Bridge adapter** execution via fs-bridge IPC (command writing, response polling, timeout handling)
- **MCP server integration** using in-memory transport (tool discovery, parameter validation, error handling)
- **End-to-end workflows** with multiple tool calls (breakpoint → debug → evaluate)
- **Metadata quality** token budgets (250-450 tokens per tool), completeness validation

**Excluded**:
- Strict TDD (write tests first) - we'll write integration tests alongside implementation
- Unit tests for every small function - focus on integration over granular units
- Real LLM agent testing initially - start with programmatic SDK client tests

### Mock Usage

**Policy**: Targeted mocks for external systems

Use real fs-bridge IPC where possible, mock only the VS Code extension responses by writing synthetic `response.json` files. Avoid mocking SDK components or internal MCP server logic.

**Approach**:
- Real filesystem operations (write command.json, poll for response.json)
- Mock VS Code extension by creating synthetic response files in test fixtures
- No mocking of MCP SDK internals (Server, Transport classes)
- No mocking of tool generation logic (test with real manifest subset)

### Test Structure

```
/Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/
├── mcp-server.test.ts              # In-memory transport tests (tool listing, execution)
├── tool-generator.test.ts          # Manifest → MCP tool definitions
├── bridge-adapter.test.ts          # MCP tools → fs-bridge commands
├── multi-tool-workflow.test.ts     # Complex workflows (breakpoint → debug → evaluate)
└── fixtures/
    ├── mock-responses/             # Synthetic extension responses
    │   ├── breakpoint-set-success.json
    │   ├── debug-evaluate-no-session.json
    │   └── debug-start-success.json
    └── test-manifest.json          # Subset of tools for testing
```

### Test Documentation (when tests are written)

Every test must include:
```typescript
test('should [specific behavior]', () => {
  """
  Purpose: [what truth this test proves]
  Quality Contribution: [how this prevents bugs]
  Acceptance Criteria: [measurable assertions]
  """

  // Test implementation
});
```

## Implementation Phases

### Phase 0: Script Alias Refactoring

**Objective**: Refactor all script aliases from abbreviated prefixes to full hierarchical names as prerequisite for MCP tool generation.

**Deliverables**:
- All `*.meta.yaml` files updated with new aliases
- Directory structure reorganized to match new naming
- manifest.json regenerated with new aliases
- Existing tests updated for new names
- CLI still works with new aliases

**Dependencies**: None (prerequisite phase)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing scripts/tests | High | High | Update all references in same commit |
| User confusion from name changes | Medium | Low | Document migration in commit message |
| Incomplete refactoring | Medium | High | Validate all files changed via search |

#### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 0.1 | [x] | Create refactoring mapping document | Document all alias changes (bp.* → breakpoint.*) | [📋](tasks/phase-0/execution.log.md#task-01-complete-script-alias-refactoring) | Phase 0 complete - all tasks executed [^1] |
| 0.2 | [x] | Rename `bp.*` scripts to `breakpoint.*` in metadata | All 5 breakpoint `*.meta.yaml` files updated with new alias field | [📋](tasks/phase-0/execution.log.md#task-01-complete-script-alias-refactoring) | Completed [^1] |
| 0.3 | [x] | Rename `tests.*` scripts to `test.*` in metadata | All 2 test `*.meta.yaml` files updated | [📋](tasks/phase-0/execution.log.md#task-01-complete-script-alias-refactoring) | Completed [^1] |
| 0.4 | [x] | Rename `diag.*` scripts to `diagnostic.*` in metadata | diag.collect.meta.yaml updated to diagnostic.collect | [📋](tasks/phase-0/execution.log.md#task-01-complete-script-alias-refactoring) | Completed [^1] |
| 0.5 | [x] | Rename `utils.*` scripts to `util.*` in metadata | utils.restart-vscode.meta.yaml updated | [📋](tasks/phase-0/execution.log.md#task-01-complete-script-alias-refactoring) | Completed [^1] |
| 0.6 | [x] | Rebuild manifest.json with new aliases | Generated manifest contains new alias names | [📋](tasks/phase-0/execution.log.md#task-01-complete-script-alias-refactoring) | Completed [^1] |
| 0.7 | [x] | Update CLI script loader to handle new aliases | `vscb script run breakpoint.set` works | [📋](tasks/phase-0/execution.log.md#task-01-complete-script-alias-refactoring) | No changes needed - loader is generic [^1] |
| 0.8 | [x] | Update existing integration tests | All tests pass with new script names | [📋](tasks/phase-0/execution.log.md#task-01-complete-script-alias-refactoring) | 5/5 integration tests passing [^1] |
| 0.9 | [x] | Validate no references to old aliases remain | Search returns no results for `bp\.`, `tests\.`, etc | [📋](tasks/phase-0/execution.log.md#task-01-complete-script-alias-refactoring) | Validation complete [^1] |

#### Acceptance Criteria

- [x] All 35 script aliases follow hierarchical naming (breakpoint.*, test.*, diagnostic.*, util.*)
- [x] manifest.json regenerated successfully
- [x] Existing CLI commands work: `vscb script run breakpoint.set --param path=/tmp/test.js --param line=10`
- [x] All existing tests pass with new names
- [x] No references to old aliases in codebase

---

### Phase 1: MCP SDK Setup

**Objective**: Add MCP SDK dependency and create foundational types for MCP integration.

**Deliverables**:
- `@modelcontextprotocol/sdk` added to CLI dependencies
- TypeScript types for MCP server options
- Basic project structure for MCP code

**Dependencies**: Phase 0 complete (aliases refactored)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SDK version incompatibilities | Low | Medium | Pin to known working version |
| TypeScript compilation issues | Low | Low | Use SDK's TypeScript definitions |

#### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 1.1 | [x] | Add `@modelcontextprotocol/sdk` to CLI package.json | Package installed, appears in dependencies | [📋](tasks/phase-1/execution.log.md#t001-install-mcp-sdk-package-) | Installed v1.20.0 with 136 deps [^2] |
| 1.2 | [x] | Create `/Users/jordanknight/github/vsc-bridge/cli/src/lib/mcp/` directory | Directory exists | [📋](tasks/phase-1/execution.log.md#t002-create-mcp-directory-structure-) | Directory structure created [^3] |
| 1.3 | [x] | Create types file `/Users/jordanknight/github/vsc-bridge/cli/src/lib/mcp/types.ts` | File exists with MCP server options interface | [📋](tasks/phase-1/execution.log.md#t003-create-types-definition-file-) | Types defined with JSDoc [^4] |
| 1.4 | [x] | Create index barrel export `/Users/jordanknight/github/vsc-bridge/cli/src/lib/mcp/index.ts` | Can import from `lib/mcp` | [📋](tasks/phase-1/execution.log.md#t004-create-barrel-export-file-) | Barrel export created [^5] |
| 1.5 | [x] | Verify SDK imports work | TypeScript compiles without errors | [📋](tasks/phase-1/execution.log.md#t005-verify-sdk-imports-compile-) | SDK imports validated [^6] |
| 1.6 | [x] | Run CLI build successfully | `npm run build` succeeds | [📋](tasks/phase-1/execution.log.md#t006-build-cli-successfully-) | Build successful, CLI tested [^7] |

#### Acceptance Criteria

- [x] MCP SDK installed and importable
- [x] Directory structure created
- [x] TypeScript compilation successful
- [x] No new dependencies conflicts

---

### Phase 2: Filesystem Bridge Adapter

**Objective**: Create adapter layer that translates MCP tool calls into fs-bridge IPC commands and wraps responses in MCP format.

**Deliverables**:
- Bridge adapter module (`bridge-adapter.ts`)
- Response wrapper utility
- Integration test with mock responses

**Dependencies**: Phase 1 complete (SDK setup)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| IPC timeout handling complexity | Medium | Medium | Reuse existing fs-bridge timeout logic |
| Response format mismatches | Medium | High | Write comprehensive tests per Critical Discovery 02 |

#### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 2.1 | [x] | Create `/Users/jordanknight/github/vsc-bridge/cli/src/lib/mcp/bridge-adapter.ts` | File created with function signature | [📋](tasks/phase-2/execution.log.md#t003-t009-bridge-adapter-implementation-) | 239 lines, all interfaces [^8][^9] |
| 2.2 | [x] | Implement core bridge execution function | Function calls fs-bridge `runCommand`, handles timeouts | [📋](tasks/phase-2/execution.log.md#t003-t009-bridge-adapter-implementation-) | Cleanup in finally block [^9] |
| 2.3 | [x] | Implement response wrapper for success cases | Returns `{content, structuredContent}` format | [📋](tasks/phase-2/execution.log.md#t003-t009-bridge-adapter-implementation-) | Large payload placeholder [^9] |
| 2.4 | [x] | Implement response wrapper for error cases | Returns `{isError: true, content, structuredContent}` | [📋](tasks/phase-2/execution.log.md#t003-t009-bridge-adapter-implementation-) | Error code in text [^9] |
| 2.5 | [x] | Write integration test for bridge adapter | Test validates command writing and response parsing | [📋](tasks/phase-2/execution.log.md#t010-t014-test-infrastructure-and-integration-tests-) | 4/4 tests passing [^11] |
| 2.6 | [x] | Create test fixtures for mock responses | Success and error response JSON files created | [📋](tasks/phase-2/execution.log.md#t010-t014-test-infrastructure-and-integration-tests-) | 3 JSON fixtures [^10] |
| 2.7 | [x] | Test timeout scenarios | Adapter returns timeout error after configured duration | [📋](tasks/phase-2/execution.log.md#t010-t014-test-infrastructure-and-integration-tests-) | Timeout test passing [^11] |
| 2.8 | [x] | Test cancellation via AbortSignal | Adapter stops polling when signal aborted | [📋](tasks/phase-2/execution.log.md#t010-t014-test-infrastructure-and-integration-tests-) | Cancellation test passing [^11] |

#### Test Examples

```typescript
// /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/bridge-adapter.test.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { executeToolViaBridge } from '../../src/lib/mcp/bridge-adapter.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('Bridge Adapter', () => {
  let testBridgeRoot: string;

  beforeEach(async () => {
    """
    Purpose: Create isolated test environment for fs-bridge operations
    Quality Contribution: Prevents test pollution, enables parallel execution
    Acceptance Criteria: Clean .vsc-bridge directory for each test
    """
    testBridgeRoot = path.join('/tmp', `vsc-bridge-test-${Date.now()}`);
    await fs.mkdir(path.join(testBridgeRoot, 'execute'), { recursive: true });
    await fs.writeFile(
      path.join(testBridgeRoot, 'host.json'),
      JSON.stringify({ bridgeId: 'test', workspace: '/test/ws' })
    );
  });

  test('should execute tool and wrap success response', async () => {
    """
    Purpose: Validates bridge adapter correctly wraps fs-bridge success responses in MCP format
    Quality Contribution: Prevents response format errors that break MCP clients
    Acceptance Criteria:
    - Returns {content: [...], structuredContent: {...}}
    - Preserves original fs-bridge envelope in structuredContent
    - Text content includes success summary
    """

    // Arrange: Write mock response file
    const jobId = 'test-job-001';
    const jobDir = path.join(testBridgeRoot, 'execute', jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const mockResponse = {
      ok: true,
      type: 'success',
      data: { success: true, details: { breakpoint: { path: '/test.js', line: 10 } } },
      meta: { requestId: jobId, timestamp: new Date().toISOString() }
    };

    // Simulate extension writing response
    setTimeout(async () => {
      await fs.writeFile(path.join(jobDir, 'response.json'), JSON.stringify(mockResponse));
      await fs.writeFile(path.join(jobDir, 'done'), '');
    }, 100);

    // Act
    const result = await executeToolViaBridge(
      'breakpoint.set',
      { path: '/test.js', line: 10 },
      { bridgeRoot: testBridgeRoot, timeout: 5000 }
    );

    // Assert
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('structuredContent');
    expect(result.content).toBeArray();
    expect(result.content[0].type).toBe('text');
    expect(result.structuredContent).toEqual(mockResponse);
  });

  test('should handle timeout gracefully', async () => {
    """
    Purpose: Ensures adapter returns proper error when operation times out
    Quality Contribution: Prevents hanging clients, provides actionable feedback
    Acceptance Criteria: Returns E_TIMEOUT error in MCP format within timeout window
    """

    // Act: Execute with 1s timeout, no response written
    const result = await executeToolViaBridge(
      'debug.start',
      { launch: 'Python' },
      { bridgeRoot: testBridgeRoot, timeout: 1000 }
    );

    // Assert
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error.code).toBe('E_TIMEOUT');
    expect(result.content[0].text).toContain('E_TIMEOUT');
  });
});
```

#### Acceptance Criteria

- [ ] Bridge adapter executes tools via fs-bridge IPC
- [ ] Success responses wrapped in MCP format with preserved data
- [ ] Error responses wrapped with error code in text content
- [ ] Timeouts handled per Critical Discovery 04
- [ ] Integration tests pass with mock responses
- [ ] No mocking of fs-bridge internals (uses real file operations)

---

### Phase 3: Tool Generator

**Objective**: Generate MCP tool definitions from manifest.json, mapping YAML metadata to MCP schemas.

**Deliverables**:
- Tool generator module
- Alias → tool name mapping function
- Generated tool definitions with Zod schemas
- Unit tests for generator logic

**Dependencies**: Phase 0 complete (aliases refactored), Phase 2 complete (bridge adapter)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Schema mapping errors | Medium | High | Comprehensive test coverage with real manifest |
| Missing metadata fields | Low | Medium | Validation step in generator |

#### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 3.1 | [x] | Create `/Users/jordanknight/github/vsc-bridge/cli/src/lib/mcp/tool-generator.ts` | File created with generator function signature | [📋](tasks/phase-3/execution.log.md) | Export `generateMcpTools` - Complete [^1] |
| 3.2 | [x] | Implement alias → tool name mapping | `breakpoint.set` → `breakpoint_set`, `test.debug-single` → `test_debug_single` (replace dots and hyphens with underscores) | [📋](tasks/phase-3/execution.log.md) | Reference Critical Discovery 03 - Complete [^1]; Updated in Phase 7 Subtask 001 for bijective transformation |
| 3.3 | [x] | Implement YAML params → JSON Schema conversion | Convert type, required, min, max, enum to JSON Schema | [📋](tasks/phase-3/execution.log.md) | Map Zod schema types - Complete [^1] |
| 3.4 | [x] | Filter tools by `mcp.enabled` flag | Tools with `enabled: false` excluded from output | [📋](tasks/phase-3/execution.log.md) | Default true if not specified - Complete [^1] |
| 3.5 | [x] | Extract P0 metadata (tool, description, timeout) | Tool definitions include basic metadata | [📋](tasks/phase-3/execution.log.md) | Reference clarification Q8 - Complete [^1] |
| 3.6 | [x] | Extract P1 metadata (when_to_use, parameter_hints) | Tool definitions include LLM guidance | [📋](tasks/phase-3/execution.log.md) | From `mcp.llm.*` fields - Complete [^1] |
| 3.7 | [x] | Write unit tests for generator | Tests validate schema generation with fixture manifest | [📋](tasks/phase-3/execution.log.md) | 23/23 tests passing - Complete [^3] |
| 3.8 | [x] | Create test manifest fixture | Subset of 5-10 tools with varied parameter types | [📋](tasks/phase-3/execution.log.md) | 630-line comprehensive fixture - Complete [^2] |
| 3.9 | [x] | Test tool name generation | Verify all aliases map correctly to snake_case | [📋](tasks/phase-3/execution.log.md) | Test each category prefix - Complete [^3] |
| 3.10 | [x] | Test schema type mappings | Verify string, number, boolean, enum, object mappings | [📋](tasks/phase-3/execution.log.md) | Cover all YAML types - Complete [^3] |

#### Test Examples

```typescript
// /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/tool-generator.test.ts
import { describe, test, expect } from 'vitest';
import { generateMcpTools } from '../../src/lib/mcp/tool-generator.js';
import testManifest from './fixtures/test-manifest.json';

describe('Tool Generator', () => {
  test('should generate tool names from refactored aliases', () => {
    """
    Purpose: Validates auto-generation of MCP tool names from refactored script aliases
    Quality Contribution: Ensures consistent, predictable tool naming for LLMs
    Acceptance Criteria:
    - breakpoint.set → breakpoint_set
    - test.debug_single → test_debug_single
    - debug.evaluate → debug_evaluate
    """

    const tools = generateMcpTools(testManifest);

    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('breakpoint_set');
    expect(toolNames).toContain('test_debug_single');
    expect(toolNames).toContain('debug_evaluate');
    expect(toolNames).not.toContain('bp.set'); // Old alias
  });

  test('should convert YAML params to JSON Schema', () => {
    """
    Purpose: Proves parameter schema mapping preserves types and constraints
    Quality Contribution: Prevents parameter validation failures in MCP clients
    Acceptance Criteria:
    - Required fields mapped correctly
    - Type constraints preserved (min, max, enum)
    - Optional fields have default values
    """

    const tools = generateMcpTools(testManifest);
    const breakpointTool = tools.find(t => t.name === 'breakpoint_set');

    expect(breakpointTool.inputSchema.properties.path).toEqual({
      type: 'string',
      description: expect.stringContaining('path')
    });
    expect(breakpointTool.inputSchema.properties.line).toEqual({
      type: 'number',
      description: expect.stringContaining('line'),
      minimum: 1
    });
    expect(breakpointTool.inputSchema.required).toContain('path');
    expect(breakpointTool.inputSchema.required).toContain('line');
  });

  test('should filter tools by mcp.enabled flag', () => {
    """
    Purpose: Ensures tools can be selectively excluded from MCP exposure
    Quality Contribution: Allows gradual rollout and testing isolation
    Acceptance Criteria: Tools with enabled: false not in output
    """

    // Modify test manifest to have one disabled tool
    const manifest = {
      ...testManifest,
      scripts: {
        ...testManifest.scripts,
        'breakpoint.set': {
          ...testManifest.scripts['breakpoint.set'],
          metadata: {
            ...testManifest.scripts['breakpoint.set'].metadata,
            mcp: { ...testManifest.scripts['breakpoint.set'].metadata.mcp, enabled: false }
          }
        }
      }
    };

    const tools = generateMcpTools(manifest);
    expect(tools.find(t => t.name === 'breakpoint_set')).toBeUndefined();
  });

  test('should include P0+P1 metadata', () => {
    """
    Purpose: Validates LLM guidance metadata is included in tool definitions
    Quality Contribution: Improves agent tool selection and parameter usage
    Acceptance Criteria:
    - description present
    - when_to_use guidance included
    - parameter_hints with examples
    """

    const tools = generateMcpTools(testManifest);
    const evalTool = tools.find(t => t.name === 'debug_evaluate');

    expect(evalTool.description).toBeTruthy();
    expect(evalTool.annotations.when_to_use).toBeTruthy();
    expect(evalTool.annotations.parameter_hints).toBeTruthy();
    expect(evalTool.annotations.parameter_hints.expression.examples).toBeArray();
  });
});
```

#### Acceptance Criteria

- [x] Generator reads manifest.json and produces tool definitions
- [x] Tool names follow snake_case pattern (breakpoint_set, debug_evaluate)
- [x] All YAML parameter types map correctly to JSON Schema
- [x] P0+P1 metadata included in tool annotations
- [x] Tools with `mcp.enabled: false` excluded
- [x] Unit tests pass with 90%+ coverage (23/23 tests passing)

---

### Phase 4a: Server Factory & Basic Infrastructure

**Objective**: Create MCP server factory function, validate test infrastructure, and implement basic tool discovery (tools/list handler).

**Status**: ✅ COMPLETE (Checkpoint PASSED)

**Deliverables**:
- Server factory function (`createMcpServer`)
- Test helper utilities (mock bridge + InMemoryTransport setup)
- Tool registration logic (load manifest, generate tools)
- Request handler for tools/list
- Integration tests proving end-to-end InMemoryTransport works

**Dependencies**: Phase 2 (bridge adapter), Phase 3 (tool generator) complete

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Handler registration errors | Low | High | Test factory in isolation ✅ DONE |
| InMemoryTransport connection issues | Low | Medium | Robust test helpers ✅ DONE |

---

### Phase 4b: Tool Execution Handler

**Objective**: Implement tools/call handler for executing tools via bridge adapter.

**Status**: COMPLETE ✅

**Deliverables**:
- ✅ Request handler for tools/call
- ✅ Error handling for unknown tools
- ✅ Parameter validation (SKIPPED - SDK handles automatically)
- ✅ Timeout extraction from tool metadata
- Integration tests for tool execution

**Dependencies**: Phase 4a complete

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tool execution failures | Medium | High | Comprehensive error handling |
| Bridge adapter integration issues | Low | Low | Already validated in Phase 2 |

#### Phase 4a Tasks (COMPLETE)

| #    | Status | Task | Success Criteria | Log | Notes |
|------|--------|------|------------------|-----|-------|
| 4a.1 | [x] | Create `/Users/jordanknight/github/vsc-bridge/cli/src/lib/mcp/server.ts` | File with `createMcpServer` function | [📋](tasks/phase-4/tasks.md) | Reference Critical Discovery 05 [^14] |
| 4a.2 | [x] | Implement server creation with MCP SDK | Returns Server instance with capabilities | [📋](tasks/phase-4/tasks.md) | Import from @modelcontextprotocol/sdk [^14] |
| 4a.3 | [x] | Load manifest.json in factory | Read from CLI dist directory | [📋](tasks/phase-4/tasks.md) | Path: cli/dist/manifest.json [^14] |
| 4a.4 | [x] | Generate tools on server creation | Call tool generator with loaded manifest | [📋](tasks/phase-4/tasks.md) | Cache generated tools [^14] |
| 4a.5 | [x] | Implement tools/list handler | Returns all generated tool definitions | [📋](tasks/phase-4/tasks.md) | Use ListToolsRequestSchema [^14] |

#### Phase 4b Tasks (COMPLETE)

| #    | Status | Task | Success Criteria | Log | Notes |
|------|--------|------|------------------|-----|-------|
| 4b.1 | [x] | Implement tools/call handler | Executes tool via bridge adapter, returns response | [📋](tasks/phase-4/execution.log.md) | Use CallToolRequestSchema, tool name → alias conversion [^15] |
| 4b.2 | [x] | Add error handling for unknown tools | Returns clear error for invalid tool names | [📋](tasks/phase-4/execution.log.md) | Check tool exists before execution [^15] |
| 4b.3 | [x] | Add timeout extraction from metadata | Extracts timeout from tool.annotations | [📋](tasks/phase-4/execution.log.md) | SKIPPED parameter validation - SDK handles it [^15] |

#### Implementation Example

```typescript
// /Users/jordanknight/github/vsc-bridge/cli/src/lib/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { generateMcpTools } from './tool-generator.js';
import { executeToolViaBridge } from './bridge-adapter.js';
import { manifestLoader } from '../manifest-loader.js';
import { findBridgeRoot } from '../fs-bridge.js';

export interface McpServerOptions {
  workspace?: string;
  timeout?: number;
}

export function createMcpServer(opts: McpServerOptions = {}) {
  const server = new Server(
    { name: 'vsc-bridge-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Load manifest and generate tools
  const manifest = manifestLoader.getManifest();
  const tools = generateMcpTools(manifest);

  // Register tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
  });

  // Register tools/call handler
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;

    // Find tool definition
    const tool = tools.find(t => t.name === name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      };
    }

    // Execute via bridge adapter
    try {
      const bridgeRoot = await findBridgeRoot(opts.workspace);
      const timeout = tool.timeout ?? opts.timeout ?? 30000;

      return await executeToolViaBridge(
        tool.scriptAlias, // Map back to script alias (breakpoint_set → breakpoint.set)
        args,
        { bridgeRoot, timeout, signal: extra?.signal }
      );
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Tool execution failed: ${error.message}` }],
        structuredContent: { error: { code: 'E_EXECUTION_FAILED', message: error.message } }
      };
    }
  });

  return server;
}
```

#### Phase 4a Acceptance Criteria

- [x] Factory function creates and configures MCP Server instance (T010 test passing)
- [x] tools/list returns all generated tool definitions (T011 test passing - 35 tools)
- [x] Factory can be used in both CLI and tests (InMemoryTransport validated)
- [x] Test infrastructure works reliably (mock bridge + test environment helpers)
- [x] Server boots successfully and loads 35 tools from manifest
- [x] Integration tests pass with InMemoryTransport (2/2 passing)

#### Phase 4b Acceptance Criteria

- [x] tools/call executes tools via bridge adapter (Handler implemented with executeToolViaBridge)
- [x] Unknown tools return clear errors (T020 check with helpful error message)
- [x] Timeout configuration works (T022 extraction from metadata with fallback chain)
- [x] Parameter validation handled correctly (SKIPPED - SDK validates automatically)
- [x] Integration tests pass for tool execution scenarios (6/6 tests passing, 33/33 total suite)

---

### Phase 5: CLI Command Implementation

**Objective**: Implement `vscb mcp` oclif command that runs MCP server with stdio transport.

**Status**: COMPLETE ✅

**Deliverables**:
- ✅ `mcp.ts` oclif command file (167 lines)
- ✅ Command-line flags (workspace required, timeout with default)
- ✅ Stdio transport integration
- ✅ Version compatibility checking
- ✅ Enhanced error handling with troubleshooting guidance
- ✅ SIGINT/SIGTERM graceful shutdown handlers

**Dependencies**: Phase 4 complete (server factory)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Stdio transport issues | Low | High | ✅ Code review + Phase 4 test coverage |
| Workspace discovery failures | Medium | Medium | ✅ Made workspace required per Insight #2 |

#### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 5.1 | [x] | Create `/Users/jak/github/vsc-bridge/cli/src/commands/mcp.ts` | File created with oclif Command class | [📋](tasks/phase-5/execution.log.md#t004-t007-create-mcpts-command-structure-core) | 167 lines, incorporates all Critical Insights [^16] |
| 5.2 | [x] | Add workspace flag | `--workspace` accepts directory path | [📋](tasks/phase-5/execution.log.md#t004-t007-create-mcpts-command-structure-core) | **Changed to required: true** per Insight #2 [^16] |
| 5.3 | [x] | Add timeout flag | `--timeout` sets default timeout in ms | [📋](tasks/phase-5/execution.log.md#t004-t007-create-mcpts-command-structure-core) | Default 30000ms [^16] |
| 5.4 | [x] | Implement run() method using factory | Creates server with flags, connects stdio transport | [📋](tasks/phase-5/execution.log.md#t008-t010-implement-run-method-core-logic-core) | Uses createMcpServer from Phase 4 [^16] |
| 5.5 | [x] | Add command description and examples | Help text shows usage | [📋](tasks/phase-5/execution.log.md#t004-t007-create-mcpts-command-structure-core) | `vscb mcp --help` verified [^16] |
| 5.6 | [x] | Handle errors gracefully | Logs errors to stderr, exits with code 1 | [📋](tasks/phase-5/execution.log.md#t011-t014-logging-error-handling-version-checking-core) | Actionable error messages with troubleshooting [^16] |
| 5.7 | [x] | Test command invocation | `vscb mcp` starts server without errors | [📋](tasks/phase-5/execution.log.md#t017-basic-server-startup) | Manual test T017 passed [^16] |
| 5.8 | [x] | Verify stdio communication | Server responds to tools/list request | [📋](tasks/phase-5/execution.log.md#t021-stdio-communication) | Code review + Phase 4 coverage [^16] |

#### Implementation Example

```typescript
// /Users/jordanknight/github/vsc-bridge/cli/src/commands/mcp.ts
import { Command, Flags } from '@oclif/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../lib/mcp/server.js';

export default class Mcp extends Command {
  static description = 'Start MCP server for AI agent access to VSC-Bridge debugging tools';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --workspace /path/to/workspace',
    '<%= config.bin %> <%= command.id %> --timeout 60000',
  ];

  static flags = {
    workspace: Flags.string({
      description: 'Workspace directory (auto-detected if not specified)',
      required: false,
    }),
    timeout: Flags.integer({
      description: 'Default timeout for tool execution in milliseconds',
      default: 30000,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Mcp);

    try {
      // Create server using factory
      this.log('Starting VSC-Bridge MCP server...');
      const server = createMcpServer({
        workspace: flags.workspace,
        timeout: flags.timeout,
      });

      // Connect stdio transport
      const transport = new StdioServerTransport();
      await server.connect(transport);

      // Server runs until stdin closes (Ctrl+C or agent disconnect)
      this.log('MCP server running. Press Ctrl+C to stop.');
    } catch (error) {
      this.error(`Failed to start MCP server: ${error.message}`, { exit: 1 });
    }
  }
}
```

#### Acceptance Criteria

- [x] `vscb mcp` command starts MCP server
- [x] Server uses stdio transport for communication
- [x] Workspace flag works (now required for agents)
- [x] Timeout flag works (sets default timeout)
- [x] Server responds to tools/list requests
- [x] Logs to stderr (not stdout, reserved for MCP protocol)
- [x] Graceful shutdown on Ctrl+C
- [x] Version compatibility checking with directional guidance

---

### Phase 6: Metadata Enhancement

**Objective**: Update all 35 `*.meta.yaml` files with P0+P1 MCP metadata fields.

**Deliverables**:
- All meta.yaml files have enhanced mcp section
- P0 fields: enabled, tool, description, timeout, **relationships**, **error_contract**, **safety**
- P1 fields: when_to_use (4-part structure), parameter_hints (with pitfalls)
- Token budget: 250-450 tokens per tool
- Regenerated manifest.json

**Dependencies**: Phase 0 complete (aliases refactored)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Incomplete metadata | Medium | Medium | Validation script |
| Inconsistent descriptions | Medium | Low | Review process |

#### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 6.1 | [x] | Create comprehensive metadata template from research findings | Template with enhanced P0+P1 fields (relationships, error_contract, safety) | [📋](tasks/phase-6/tasks.md) | docs/rules/mcp-tool-prompting.md created [^17] |
| 6.2 | [x] | Enhance breakpoint.* scripts (5 tools) | All have enhanced metadata with token budget 250-450 | [📋](tasks/phase-6/tasks.md) | All 5 tools enhanced [^17] |
| 6.3 | [x] | Enhance debug.* scripts (13 tools) | All have enhanced P0+P1 metadata within token budget | [📋](tasks/phase-6/tasks.md) | All 13 tools enhanced [^17] |
| 6.4 | [x] | Enhance dap.* scripts (7 tools) | All have enhanced P0+P1 metadata, increased timeouts | [📋](tasks/phase-6/tasks.md) | All 8 DAP files (7 tools + filter) enhanced [^17] |
| 6.5 | [x] | Enhance test.* scripts (2 tools) | All have enhanced P0+P1 metadata with 60s+ timeout | [📋](tasks/phase-6/tasks.md) | Both test tools enhanced [^17] |
| 6.6 | [x] | Enhance diagnostic.* scripts (1 tool) | Has enhanced P0+P1 metadata | [📋](tasks/phase-6/tasks.md) | diagnostic.collect enhanced [^17] |
| 6.7 | [x] | Enhance util.* scripts (1 tool) | Has enhanced P0+P1 metadata | [📋](tasks/phase-6/tasks.md) | util.restart_vscode enhanced [^17] |
| 6.8 | [x] | Rebuild manifest.json | Generated manifest includes all enhanced MCP metadata | [📋](tasks/phase-6/tasks.md) | Build successful, 147 KiB manifest [^17] |
| 6.9 | [x] | Validate metadata completeness | All 35 tools have required P0+P1 fields, token counts | [📋](tasks/phase-6/tasks.md) | Validation script created, 0 errors [^17] |
| 6.10 | [x] | Review metadata for LLM clarity | Descriptions follow 4-part when_to_use pattern | [📋](tasks/phase-6/tasks.md) | Code review completed, F1-F4 findings addressed [^17] |

#### Enhanced Metadata Template (Based on Research)

**Token Budget**: 250-450 tokens per tool total

```yaml
# Example: breakpoint.set.meta.yaml (enhanced with research findings)
alias: breakpoint.set
name: Set Breakpoint
category: breakpoint
description: Set a breakpoint with optional conditions and log messages
dangerOnly: false

params:
  path:
    type: string
    required: true
    description: File path (absolute or relative to current directory)
    resolve: cwd-relative
  line:
    type: number
    required: true
    description: Line number (1-indexed)
    min: 1
  condition:
    type: string
    required: false
    description: Conditional expression for breakpoint

response: action
result:
  breakpoint:
    type: object
    description: Created breakpoint details

errors:
  - E_FILE_NOT_FOUND
  - E_INVALID_LINE
  - E_INVALID_PATH

cli:
  command: breakpoint set
  description: Set a breakpoint
  examples:
    - vscb script run breakpoint.set --param path=test.js --param line=42

# Enhanced P0+P1 MCP Metadata (Research-Based)
mcp:
  # P0: Must-Have Fields
  enabled: true
  tool: breakpoint_set  # Optional override (default: auto-generated from alias)
  description: "Set a line or conditional breakpoint in active debug session"  # Contrastive, one-line
  timeout: 5000  # 5 seconds (override default 30s)

  # P0: NEW - Tool Relationships (orchestration hints)
  relationships:
    requires: ["debug.start"]    # Prerequisites for execution (hard dependencies)
    recommended: []              # Helpful tools to run first (soft suggestions)
    provides: []                 # What this tool produces (identifiers)
    conflicts: []                # Incompatible tools

  # P0: NEW - Structured Error Contract
  error_contract:
    errors:
      - code: E_FILE_NOT_FOUND
        summary: "File path not found or not accessible"
        is_retryable: true
        user_fix_hint: "Check file path and ensure it exists in workspace"
      - code: E_INVALID_LINE
        summary: "Line number not executable or out of range"
        is_retryable: true
        user_fix_hint: "Verify line number exists and contains executable code"

  # P0: NEW - Safety Flags (MCP spec annotations)
  safety:
    idempotent: true      # Same inputs → same result
    read_only: true       # Doesn't modify program state (only debugger state)
    destructive: false    # Not destructive

  # P1: LLM Guidance (Enhanced Structure)
  llm:
    # 4-Part When-To-Use Pattern (Use/Don't/Prereqs/Safety)
    when_to_use: |
      USE FOR:
      - Pausing execution at a specific line
      - Setting conditional breakpoints (only pause when expression true)

      DON'T USE FOR:
      - Logging without pausing (use breakpoint.log instead)
      - Watch expressions (use debug.watch_add)

      PREREQUISITES:
      - Active debug session or planned session startup
      - Valid file path in workspace
      - Line must be executable code (not comments/blank)

      SAFETY:
      - Read-only to program state
      - Idempotent (setting same breakpoint twice is safe)

    # Enhanced Parameter Hints (with pitfalls)
    parameter_hints:
      path:
        description: "Absolute or workspace-relative file path"
        required: true
        examples:
          - "src/main.js"
          - "/absolute/path/to/file.py"
        note: "Prefer workspace-relative paths for portability"

      line:
        description: "1-indexed line number where breakpoint should be set"
        required: true
        examples: ["10", "42", "100"]
        note: "First line is 1, not 0"

      condition:
        description: "Language-specific boolean expression evaluated at breakpoint"
        required: false
        examples:
          - "x > 10"              # Python/JS/C#
          - "user === null"       # JavaScript
          - "len(items) > 0"      # Python
        language_specific:
          python: "Use Python syntax (e.g., 'len(items) > 0')"
          javascript: "Use JavaScript syntax (e.g., 'items.length > 0')"
          csharp: "Use C# syntax (e.g., 'items.Count > 0')"
        pitfalls:  # NEW - Common mistakes
          - "Don't mix Python syntax in JS sessions or vice-versa"
          - "Keep expressions side-effect free (no assignments)"
```

**Token Budget Breakdown** (for this example):
- Description: ~15 tokens
- when_to_use: ~100 tokens (4-part structure)
- parameter_hints: ~150 tokens (3 params with examples)
- relationships: ~10 tokens
- error_contract: ~60 tokens (2 errors)
- safety: ~10 tokens
- **Total: ~345 tokens** ✅ (within 250-450 range)

#### Acceptance Criteria

- [x] All 35 tools have mcp.enabled field (default true)
- [x] All tools have clear, contrastive mcp.description (one-line)
- [x] All tools have mcp.llm.when_to_use guidance following 4-part pattern (Use/Don't/Prereqs/Safety)
- [x] All tools have mcp.llm.parameter_hints with 2-3 examples per parameter and pitfalls array
- [x] All tools have mcp.relationships (requires/provides/conflicts)
- [x] All tools have mcp.error_contract with retryability and user_fix_hint
- [x] All tools have mcp.safety flags (idempotent/read_only/destructive)
- [x] Long-running tools have mcp.timeout overrides (test.* = 60s+)
- [x] All tools within token budget (250-450 tokens guideline; warnings for excess)
- [x] manifest.json regenerated with enhanced MCP metadata
- [x] Validation script confirms no missing fields and validates token counts

---

### Phase 7: Integration Testing

**Objective**: Implement Stdio E2E integration tests only, focusing on real-world validation via `just test-integration-mcp`. InMemory unit tests are SKIPPED.

**Status**: IN PROGRESS (3/5 stdio E2E tests complete)

**Deliverables**:
- **Stdio E2E Tests**: 5 comprehensive tests validating production code path (~60-90s total)
  - T-STDIO-000: Basic connectivity smoke test ✅
  - T-STDIO-001: Bridge status via MCP ✅
  - T-STDIO-002: Python pytest workflow ✅
  - T-STDIO-003: JavaScript Jest workflow (object expansion) ❌
  - T-STDIO-004: C# xUnit workflow ([External Code] handling) ❌
  - T-STDIO-005: Java JUnit workflow (nested scopes) ❌
- CI integration (`just test-integration-mcp` in GitHub Actions)

**Dependencies**: Phases 1-6 complete (full implementation)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Language workflow test timing | Medium | Medium | Use generous timeouts (30s per operation) |
| Extension Host lifecycle in CI | Low | Medium | Follow test-integration patterns (polling, cleanup) |

#### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 7.1 | [x] | Create stdio test helper with Extension Host launch | Helper spawns `vscb mcp`, launches Extension Host, polls bridge | [📋](tasks/phase-7-testing-strategy/tasks.md) | stdio-test-client.ts complete (343 lines) |
| 7.2 | [x] | Implement unified test architecture with runner abstraction | Python enhanced workflow complete via unified architecture | [📋](tasks/phase-7-testing-strategy/execution.log.md#task-t005-unified-test-architecture) | 4/4 tests passing (CLI & MCP × smoke + Python); MCP 43% faster [^18] |
| 7.3 | [ ] | Verify all 5 stdio E2E tests passing | All tests pass via `just test-integration-mcp` | [📋](tasks/phase-7/tasks.md) | Target: 5/5 tests, ~60-90s duration |
| 7.4 | [ ] | Update CI config to run stdio E2E tests | GitHub Actions runs `just test-integration-mcp` | [📋](tasks/phase-7/tasks.md) | Update .github/workflows/pull-request.yml |
| 7.5 | [ ] | Run full stdio E2E suite locally | All 5 tests pass | [📋](tasks/phase-7/tasks.md) | Final verification before CI |
| 7.6 | [ ] | Update Phase 7 plan and acceptance criteria | All tasks marked, criteria updated | [📋](tasks/phase-7/tasks.md) | Document stdio E2E only approach |
| 7.7 | [ ] | Create execution log | Document all changes and test results | [📋](tasks/phase-7/tasks.md) | Evidence artifact for completion |
| 7.8-7.10 | [~] | ~~InMemory tests~~ | **SKIPPED** - Not pursuing InMemory tests | - | **Focus on stdio E2E only** |

#### Test Examples

```typescript
// /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/mcp-server.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../../src/lib/mcp/server.js';

describe('MCP Server Integration', () => {
  let client: Client;
  let clientTx: InMemoryTransport;
  let serverTx: InMemoryTransport;

  beforeAll(async () => {
    """
    Purpose: Set up in-memory MCP client/server for integration testing
    Quality Contribution: Enables fast, deterministic testing without subprocess spawning
    Acceptance Criteria: Linked transports created, both sides connected
    """

    [clientTx, serverTx] = InMemoryTransport.createLinkedPair();

    // Create and connect server
    const server = createMcpServer({ workspace: '/test/workspace', timeout: 30000 });
    await server.connect(serverTx);

    // Create and connect client
    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(clientTx);
  });

  afterAll(async () => {
    await clientTx.close();
    await serverTx.close();
  });

  test('should list all enabled tools', async () => {
    """
    Purpose: Validates MCP server exposes all tools from manifest
    Quality Contribution: Ensures agents can discover available debugging capabilities
    Acceptance Criteria:
    - Returns list of tools
    - All enabled tools present (35 expected)
    - Each tool has name, description, inputSchema
    """

    const response = await client.request({ method: 'tools/list' }, ListToolsResultSchema);

    expect(response.tools).toBeArray();
    expect(response.tools.length).toBeGreaterThanOrEqual(35);

    // Check specific tools exist
    const toolNames = response.tools.map(t => t.name);
    expect(toolNames).toContain('breakpoint_set');
    expect(toolNames).toContain('debug_evaluate');
    expect(toolNames).toContain('test_debug_single');

    // Verify tool structure
    const breakpointTool = response.tools.find(t => t.name === 'breakpoint_set');
    expect(breakpointTool).toHaveProperty('description');
    expect(breakpointTool).toHaveProperty('inputSchema');
    expect(breakpointTool.inputSchema).toHaveProperty('properties');
    expect(breakpointTool.inputSchema).toHaveProperty('required');
  });

  test('should execute tool and return MCP-formatted response', async () => {
    """
    Purpose: Validates end-to-end tool execution through MCP protocol
    Quality Contribution: Ensures agents can successfully invoke debugging tools
    Acceptance Criteria:
    - Tool executes via fs-bridge IPC
    - Response wrapped in MCP format
    - Original data preserved in structuredContent
    """

    // Note: This test requires mock fs-bridge setup
    // Real implementation would write mock response.json file

    const response = await client.request({
      method: 'tools/call',
      params: {
        name: 'breakpoint_set',
        arguments: { path: '/test/file.js', line: 10 }
      }
    }, CallToolResultSchema);

    expect(response).toHaveProperty('content');
    expect(response.content).toBeArray();
    expect(response.content[0].type).toBe('text');

    if (!response.isError) {
      expect(response).toHaveProperty('structuredContent');
      expect(response.structuredContent).toHaveProperty('ok');
    }
  });

  test('should handle unknown tool gracefully', async () => {
    """
    Purpose: Ensures server returns clear error for invalid tool names
    Quality Contribution: Prevents confusing errors for agents
    Acceptance Criteria: Returns error with helpful message
    """

    const response = await client.request({
      method: 'tools/call',
      params: {
        name: 'nonexistent_tool',
        arguments: {}
      }
    }, CallToolResultSchema);

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Unknown tool');
  });
});

// /Users/jordanknight/github/vsc-bridge/cli/test/integration-mcp/multi-tool-workflow.test.ts
describe('Multi-Tool Workflows', () => {
  test('should execute breakpoint → debug → evaluate sequence', async () => {
    """
    Purpose: Validates agents can chain multiple tools for debugging workflows
    Quality Contribution: Ensures complex debugging scenarios work end-to-end
    Acceptance Criteria:
    - breakpoint_set succeeds
    - debug_start succeeds with breakpoint in place
    - debug_evaluate succeeds with active session
    """

    // 1. Set breakpoint
    const bp = await client.request({
      method: 'tools/call',
      params: {
        name: 'breakpoint_set',
        arguments: { path: '/test/file.js', line: 10 }
      }
    }, CallToolResultSchema);
    expect(bp.isError).toBeFalsy();

    // 2. Start debug session
    const debug = await client.request({
      method: 'tools/call',
      params: {
        name: 'debug_start',
        arguments: { launch: 'Node.js Test' }
      }
    }, CallToolResultSchema);
    expect(debug.isError).toBeFalsy();

    // 3. Evaluate expression
    const eval = await client.request({
      method: 'tools/call',
      params: {
        name: 'debug_evaluate',
        arguments: { expression: 'x + 1' }
      }
    }, CallToolResultSchema);
    expect(eval.isError).toBeFalsy();
    expect(eval.structuredContent.data).toHaveProperty('result');
  });
});
```

#### Acceptance Criteria

**Stdio E2E Tests**:
- [x] Stdio test helper launches Extension Host and polls bridge health ✅
- [x] Basic connectivity test validates 35 tools discoverable ✅
- [x] Bridge status test validates MCP protocol communication ✅
- [x] Python pytest workflow complete via MCP ✅
- [ ] JavaScript Jest workflow validates object expansion via MCP
- [ ] C# xUnit workflow handles [External Code] gracefully via MCP
- [ ] Java JUnit workflow validates nested scopes via MCP
- [ ] All 5 stdio E2E tests pass via `just test-integration-mcp`

**Infrastructure & CI**:
- [x] Justfile target `test-integration-mcp` exists and works ✅
- [ ] CI runs stdio E2E tests on every commit
- [x] No mocking of MCP SDK internals ✅

**Progress**: 5/11 requirements complete (stdio E2E focus)

---

### Phase 8: Documentation

**Objective**: Document MCP server setup and usage following hybrid approach (essentials in README, details in docs/how/).

**Deliverables**:
- Updated README.md with MCP quick-start
- Detailed guides in docs/how/mcp-server/ (numbered structure)

**Dependencies**: All implementation phases complete (Phases 0-7)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift from implementation | Medium | Medium | Include doc updates in phase acceptance criteria |
| Unclear agent setup instructions | Low | Medium | Test with real agent (Claude Desktop) |

#### Discovery & Placement Decision

**Existing docs/how/ structure survey**:
```
/Users/jordanknight/github/vsc-bridge/docs/how/
├── [to be discovered during implementation]
```

**Decision**: Will survey during implementation and either:
- Create new `docs/how/mcp-server/` if no existing MCP documentation
- Extend existing docs if relevant directory found

**File strategy**: Create new numbered files (1-overview.md, 2-usage.md, 3-testing.md)

#### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 8.1 | [ ] | Survey existing docs/how/ directories | Documented existing structure, decided on placement | - | Discovery step |
| 8.2 | [ ] | Update README.md with MCP quick-start section | Installation, basic usage, agent config, link to docs/how/ | - | `/Users/jordanknight/github/vsc-bridge/README.md` |
| 8.3 | [ ] | Create docs/how/mcp-server/1-overview.md | Introduction, architecture, motivation complete | - | High-level concepts |
| 8.4 | [ ] | Create docs/how/mcp-server/2-usage.md | Step-by-step setup, Claude Desktop config, troubleshooting | - | User-focused guide |
| 8.5 | [ ] | Create docs/how/mcp-server/3-testing.md | InMemoryTransport testing guide, examples | - | Contributor-focused |
| 8.6 | [ ] | Create docs/how/mcp-server/4-metadata.md | How to add/enhance tool metadata, P0+P1 fields | - | Contributor guide |
| 8.7 | [ ] | Review documentation for clarity | Peer review passed, no broken links | - | Test with fresh reader |
| 8.8 | [ ] | Test agent setup with real agent | Claude Desktop successfully connects and lists tools | - | Manual validation |

#### Content Outlines

**README.md section** (Hybrid: quick-start only):
- What is MCP server (1-2 sentences)
- Installation: `npm install -g @vsc-bridge/cli`
- Basic usage: `vscb mcp`
- Quick agent setup (Claude Desktop config snippet)
- Link to detailed docs: `docs/how/mcp-server/`

**docs/how/mcp-server/1-overview.md**:
- Introduction to MCP protocol
- VSC-Bridge MCP server architecture diagram
- How tools are generated from metadata
- When to use MCP vs CLI

**docs/how/mcp-server/2-usage.md**:
- Prerequisites (VS Code extension installed)
- Starting MCP server: `vscb mcp`
- Configuring Claude Desktop (full config example)
- Configuring other agents (generic instructions)
- Common troubleshooting issues

**docs/how/mcp-server/3-testing.md**:
- InMemoryTransport testing approach
- Writing integration tests for new tools
- Testing multi-tool workflows
- Mocking extension responses

**docs/how/mcp-server/4-metadata.md**:
- P0+P1 metadata field reference
- How to add new tool to MCP
- When to disable tool (mcp.enabled: false)
- Best practices for LLM guidance

#### Acceptance Criteria

- [ ] README.md updated with quick-start section
- [ ] All docs/how/mcp-server/*.md files created
- [ ] Code examples tested and working
- [ ] No broken links (internal or external)
- [ ] Peer review completed
- [ ] Real agent (Claude Desktop) setup validated
- [ ] Numbered file structure follows convention

## Cross-Cutting Concerns

### Security Considerations

**Input Validation**:
- All tool parameters validated via generated Zod schemas
- File paths resolved and validated before execution
- No direct eval() or code execution from agent input

**Authentication/Authorization**:
- Local-only operation (no network exposure)
- Agents spawn server as subprocess (inherits user permissions)
- Extension already has VS Code permissions

**Sensitive Data Handling**:
- Debug variables may contain sensitive data (logged to stderr)
- No data persistence beyond debug session
- Extension handles sensitive data per existing policies

### Observability

**Logging Strategy**:
- All MCP protocol messages logged to stderr (not stdout)
- Tool execution logged with timing information
- Errors logged with full context (tool name, params, error code)

**Metrics to Capture**:
- Tool invocation counts (future: analytics)
- Execution times per tool
- Error rates by tool

**Error Tracking**:
- Structured error codes (E_TIMEOUT, E_NO_SESSION, etc.)
- Full error context in structuredContent
- Stack traces for internal errors (development mode)

### Documentation

**Location** (per Documentation Strategy): Hybrid (README.md + docs/how/mcp-server/)

**Content Structure**:
- README.md: Quick-start, installation, basic usage, agent setup
- docs/how/mcp-server/: Architecture, detailed setup, testing, metadata reference

**Target Audience**:
- README: AI agent users, developers wanting quick setup
- docs/how/: Contributors, advanced users, integration developers

**Maintenance/Update Schedule**:
- Update README when CLI flags change
- Update docs/how/ when architecture evolves
- Regenerate tool examples when metadata changes

## Progress Tracking

### Phase Completion Checklist

- [x] Phase 0: Script Alias Refactoring - COMPLETE
- [x] Phase 1: MCP SDK Setup - COMPLETE
- [x] Phase 2: Filesystem Bridge Adapter - COMPLETE
- [x] Phase 3: Tool Generator - COMPLETE
- [x] Phase 4a: Server Factory & Basic Infrastructure - COMPLETE (Checkpoint PASSED ✅)
- [x] Phase 4b: Tool Execution Handler - COMPLETE ✅
- [x] Phase 5: CLI Command Implementation - COMPLETE ✅
- [x] Phase 6: Metadata Enhancement - COMPLETE ✅
- [ ] Phase 7: Integration Testing - NOT STARTED
- [ ] Phase 8: Documentation - NOT STARTED

### Overall Progress

**Total Tasks**: 99 (increased from 86 due to hybrid testing strategy)
**Completed**: 68 (Phase 0: 9/9, Phase 1: 6/6, Phase 2: 8/8, Phase 3: 19/19, Phase 4: 8/8, Phase 5: 8/8, Phase 6: 10/10)
**In Progress**: 0
**Remaining**: 31 (Phase 7: 24 tasks, Phase 8: 7 tasks)

**Progress**: 69% (6 phases complete, 2 remaining)

**Note**: Task count increased after deep research revealed need for hybrid testing strategy (InMemory + Stdio) instead of InMemory-only approach. Adds 13 new tasks to Phase 7 (3 stdio E2E tests + infrastructure).

### STOP Rule

**IMPORTANT**: This plan must be validated before creating tasks.

**Next Steps**:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

## Change Footnotes Ledger

**NOTE**: This section tracks all code changes made during implementation.

[^1]: Task 0.1 - Script alias refactoring (Phase 0 complete)
  - `file:extension/src/vsc-scripts/breakpoint/set.meta.yaml`
  - `file:extension/src/vsc-scripts/breakpoint/clear-file.meta.yaml`
  - `file:extension/src/vsc-scripts/breakpoint/clear-project.meta.yaml`
  - `file:extension/src/vsc-scripts/breakpoint/remove.meta.yaml`
  - `file:extension/src/vsc-scripts/breakpoint/list.meta.yaml`
  - `file:extension/src/vsc-scripts/tests/debug-single.meta.yaml`
  - `file:extension/src/vsc-scripts/tests/show-testing-ui.meta.yaml`
  - `file:extension/src/vsc-scripts/diag/collect.meta.yaml`
  - `file:extension/src/vsc-scripts/utils/restart-vscode.meta.yaml`
  - `file:extension/src/vsc-scripts/debug/step-over.meta.yaml`
  - `file:extension/src/vsc-scripts/debug/step-into.meta.yaml`
  - `file:extension/src/vsc-scripts/debug/step-out.meta.yaml`
  - `file:extension/src/vsc-scripts/debug/get-variable.meta.yaml`
  - `file:extension/src/vsc-scripts/debug/list-variables.meta.yaml`
  - `file:extension/src/vsc-scripts/debug/set-variable.meta.yaml`
  - `file:extension/src/vsc-scripts/debug/save-variable.meta.yaml`
  - `file:extension/src/vsc-scripts/debug/wait-for-hit.meta.yaml`
  - `file:extension/src/vsc-scripts/debug/start.meta.yaml`
  - `file:test/integration/old/param-validation.test.ts`
  - `file:test/integration/cross-language-debug.test.ts`
  - `file:cli/test/lib/param-validator.test.ts`
  - `file:cli/test/lib/manifest.test.ts`
  - `file:cli/test/lib/fs-bridge.test.ts`
  - `file:extension/src/test/integration/validation.tiered.test.ts`
  - `file:extension/src/test/unit/discovery/manifest.test.ts`
  - `file:extension/src/test/unit/schema/validate.test.ts`
  - `file:extension/src/vsc-scripts/manifest.json`
  - `file:extension/out/vsc-scripts/manifest.json`

[^2]: Task 1.1 - Added MCP SDK dependency
  - Modified [`cli/package.json`](../../../cli/package.json#L34) - Added `@modelcontextprotocol/sdk@^1.20.0` to dependencies
  - Modified `cli/package-lock.json` - Added SDK and 136 transitive dependencies

[^3]: Task 1.2 - Created MCP directory structure
  - Created [`cli/src/lib/mcp/`](../../../cli/src/lib/mcp/) - Directory for MCP integration code

[^4]: Task 1.3 - Created TypeScript types
  - Created [`cli/src/lib/mcp/types.ts`](../../../cli/src/lib/mcp/types.ts) - 125 lines with interfaces: `McpServerOptions`, `McpServerInfo`, and type guard function `isValidMcpServerOptions()`

[^5]: Task 1.4 - Created barrel export module
  - Created [`cli/src/lib/mcp/index.ts`](../../../cli/src/lib/mcp/index.ts) - 19 lines exporting types and validation function

[^6]: Task 1.5 - Verified SDK imports compile
  - Validated TypeScript compilation of SDK imports: `Server`, `StdioServerTransport`, `InMemoryTransport`, `CallToolRequest`, `ListToolsRequest`, `Tool`
  - No compilation errors with `tsc --noEmit`

[^7]: Task 1.6 - Built CLI successfully with new MCP module
  - Compiled output generated at `cli/dist/lib/mcp/` (6 files: .js, .d.ts, .map)
  - Validated existing CLI functionality with `vscb script list`

[^8]: Phase 2 Tasks 2.1-2.2 - Research and Setup (T001-T003)
  - Read [`file:cli/src/lib/fs-bridge.ts`](../../../cli/src/lib/fs-bridge.ts) - Documented runCommand(), CommandJson, envelopes, timeout handling
  - Verified MCP SDK types: TextContentSchema, CallToolResultSchema from `@modelcontextprotocol/sdk/types.js`
  - Created directory structure for integration tests

[^9]: Phase 2 Tasks 2.1-2.4 - Bridge Adapter Core Implementation (T003-T009)
  - Created [`file:cli/src/lib/mcp/bridge-adapter.ts`](../../../cli/src/lib/mcp/bridge-adapter.ts) - 239 lines implementing bridge adapter
  - Implemented [`function:cli/src/lib/mcp/bridge-adapter.ts:executeToolViaBridge`](../../../cli/src/lib/mcp/bridge-adapter.ts#L83) - Main execution function with cleanup in finally block (Insight #3)
  - Implemented [`function:cli/src/lib/mcp/bridge-adapter.ts:wrapSuccessResponse`](../../../cli/src/lib/mcp/bridge-adapter.ts#L149) - MCP success envelope wrapper with large payload detection placeholder (Insight #2)
  - Implemented [`function:cli/src/lib/mcp/bridge-adapter.ts:wrapErrorResponse`](../../../cli/src/lib/mcp/bridge-adapter.ts#L181) - MCP error envelope wrapper
  - Applied all 4 critical insights: same timeout value, large payload placeholder, cleanup in finally, simple AbortSignal pass-through

[^10]: Phase 2 Task 2.6 - Test Fixtures (T010)
  - Created [`file:cli/test/integration-mcp/fixtures/mock-responses/breakpoint-set-success.json`](../../../cli/test/integration-mcp/fixtures/mock-responses/breakpoint-set-success.json)
  - Created [`file:cli/test/integration-mcp/fixtures/mock-responses/debug-evaluate-no-session.json`](../../../cli/test/integration-mcp/fixtures/mock-responses/debug-evaluate-no-session.json)
  - Created [`file:cli/test/integration-mcp/fixtures/mock-responses/debug-start-success.json`](../../../cli/test/integration-mcp/fixtures/mock-responses/debug-start-success.json)

[^11]: Phase 2 Tasks 2.5, 2.7-2.8 - Integration Tests (T011-T015)
  - Created [`file:cli/test/integration-mcp/bridge-adapter.test.ts`](../../../cli/test/integration-mcp/bridge-adapter.test.ts) - 4 integration tests
  - Test results: 4/4 passing in 6.46s (success, error, timeout, cancellation scenarios)
  - Uses real fs-bridge IPC with mock extension responses
  - Validates job directory cleanup after execution

[^12]: Phase 2 Task 2.1 - Barrel Exports (T016)
  - Modified [`file:cli/src/lib/mcp/index.ts`](../../../cli/src/lib/mcp/index.ts#L15-L17) - Added exports for executeToolViaBridge, BridgeAdapterOptions, ToolResponse

[^13]: Phase 2 Task 2.1 - Build Validation (T017)
  - TypeScript compilation successful (`npx tsc --noEmit`)
  - CLI build successful (`npm run build`)
  - Generated artifacts: bridge-adapter.js, bridge-adapter.d.ts, bridge-adapter.js.map

[^14]: Phase 4a - Server Factory & Basic Infrastructure (COMPLETE - Checkpoint PASSED ✅)
  - Created [`file:cli/test/integration-mcp/helpers/mock-bridge.ts`](../../../cli/test/integration-mcp/helpers/mock-bridge.ts) - 185 lines: Mock bridge response utilities
  - Created [`file:cli/test/integration-mcp/helpers/mcp-test-environment.ts`](../../../cli/test/integration-mcp/helpers/mcp-test-environment.ts) - 176 lines: Reusable InMemoryTransport test setup
  - Created [`file:cli/src/lib/mcp/server.ts`](../../../cli/src/lib/mcp/server.ts) - 115 lines: MCP server factory with tools/list handler
  - Implemented [`function:cli/src/lib/mcp/server.ts:createMcpServer`](../../../cli/src/lib/mcp/server.ts#L74) - Factory function that loads manifest, generates tools, registers handlers
  - Created [`file:cli/test/integration-mcp/mcp-server.test.ts`](../../../cli/test/integration-mcp/mcp-server.test.ts) - 2 integration tests (T010, T011)
  - Modified [`file:cli/src/lib/mcp/index.ts`](../../../cli/src/lib/mcp/index.ts#L24) - Added createMcpServer export
  - Test results: 2/2 passing - validates server boots, tools/list returns 35 tools via InMemoryTransport
  - Build validation: TypeScript compiles cleanly, full build succeeds, all artifacts generated
  - **This completes the foundational infrastructure - Phase 4b will add tools/call handler**

[^15]: Phase 4b - Tool Execution Handler (COMPLETE ✅)
  - Modified [`file:cli/src/lib/mcp/server.ts`](../../../cli/src/lib/mcp/server.ts) - Added tools/call handler (47 lines)
  - Implemented [`function:cli/src/lib/mcp/server.ts:toolNameToAlias`](../../../cli/src/lib/mcp/server.ts#L40) - Tool name → script alias conversion
  - Implemented [`function:cli/src/lib/mcp/server.ts:CallToolRequestSchema handler`](../../../cli/src/lib/mcp/server.ts#L138-L184) - Tool execution with bridge integration
  - Added imports: CallToolRequestSchema, executeToolViaBridge, findBridgeRoot
  - Modified [`file:cli/test/integration-mcp/mcp-server.test.ts`](../../../cli/test/integration-mcp/mcp-server.test.ts#L86-L172) - Added 4 test stubs (T015-T018)
  - Test results: 6/6 Phase 4 tests passing, 33/33 total integration tests passing
  - Build validation: TypeScript compiles cleanly, full build succeeds
  - Handler implements: unknown tool errors (T020), timeout extraction (T022), bridge execution (T019)
  - Parameter validation SKIPPED - SDK handles automatically (Insight #2 confirmed)
  - Execution log: [`file:docs/plans/13-mcp-server-implementation/tasks/phase-4/execution.log.md`](execution.log.md)

[^16]: Phase 5 - CLI Command Implementation (COMPLETE ✅)
  - Created [`file:cli/src/commands/mcp.ts`](../../../cli/src/commands/mcp.ts) - 167 lines: Oclif command for `vscb mcp` with stdio transport
  - Implemented [`function:cli/src/commands/mcp.ts:run`](../../../cli/src/commands/mcp.ts#L43) - Main command logic: flags parsing, version check, server creation, stdio connection, SIGINT handlers
  - Implemented [`function:cli/src/commands/mcp.ts:checkVersionCompatibility`](../../../cli/src/commands/mcp.ts#L111) - CLI/extension version comparison with directional upgrade warnings
  - Implemented [`function:cli/src/commands/mcp.ts:compareVersions`](../../../cli/src/commands/mcp.ts#L148) - Semantic version comparison helper
  - Applied Critical Insights from /didyouknow session:
    * Insight #1: All logging to stderr via this.log(), no stdout contamination
    * Insight #2: Workspace flag changed to required (agents pass --workspace $(pwd))
    * Insight #3: SIGINT/SIGTERM handlers registered BEFORE server.connect() blocking call
    * Insight #4: Version compatibility checking with directional guidance
    * Insight #5: Manual testing acceptable, automation deferred to Phase 7
  - Enhanced error handling: Actionable messages for bridge not found, manifest missing, generic errors
  - Command flags: workspace (required), timeout (default 30000ms)
  - Manual test results: 11/11 validation tests passed (T017-T022)
  - Build validation: TypeScript compiles, CLI builds, command registered in help
  - Execution log: [`file:docs/plans/13-mcp-server-implementation/tasks/phase-5/execution.log.md`](tasks/phase-5/execution.log.md)

[^17]: Phase 6 - Metadata Enhancement (COMPLETE ✅)
  - Created [`file:docs/rules/mcp-tool-prompting.md`](../../rules/mcp-tool-prompting.md) - Comprehensive 7-page MCP tool metadata prompting guide
  - Enhanced 35 meta.yaml files across all tool categories with P0+P1 metadata:
    * 5 breakpoint tools: set, clear-file, clear-project, remove, list
    * 13 debug tools: evaluate, start, stop, continue, step-over, step-into, step-out, scopes, stack, list-variables, get-variable, set-variable, wait-for-hit
    * 8 DAP inspection tools (7 tools + filter): logs, search, summary, timeline, compare, exceptions, stats, filter
    * 2 test tools: debug-single, show-testing-ui
    * 1 diagnostic tool: collect
    * 1 utility tool: restart-vscode
  - Code review completed with 4 findings addressed:
    * F1 (CRITICAL): Added top-level errors arrays to 8 DAP files (logs, compare, exceptions, filter, search, stats, summary, timeline)
    * F2 (HIGH): Fixed debug.wait-for-hit.meta.yaml relationships (moved breakpoint.set from requires to recommended)
    * F3 (HIGH): Fixed debug.scopes.meta.yaml parameter hints (added 2 more examples to sessionId)
    * F4 (LOW): Populated footnote ledger in phase-6/tasks.md
  - Created [`file:extension/scripts/validate-mcp-metadata.js`](../../../extension/scripts/validate-mcp-metadata.js) - Validation script with token counting
  - Validation results: 0 errors, 0 warnings (all 35 tools pass validation)
  - Build successful: manifest.json generated (147 KiB)
  - Test results: 33/33 integration tests passing
  - Execution log: [`file:docs/plans/13-mcp-server-implementation/tasks/phase-6/tasks.md`](tasks/phase-6/tasks.md)

[^18]: Phase 7 Task 7.2 - Unified Test Architecture with Runner Abstraction Layer (COMPLETE ✅)
  - Created [`test/integration/runners/DebugRunner.ts`](../../test/integration/runners/DebugRunner.ts) - 270 lines: Interface with 16 methods (lifecycle, breakpoints, stepping, inspection)
  - Created [`test/integration/runners/types.ts`](../../test/integration/runners/types.ts) - 44 lines: Type definitions (DebugConfig, SessionInfo, StatusResponse, etc.)
  - Created [`test/integration/runners/CLIRunner.ts`](../../test/integration/runners/CLIRunner.ts) - 569 lines: CLI command wrapper implementation
  - Created [`test/integration/runners/MCPRunner.ts`](../../test/integration/runners/MCPRunner.ts) - 591 lines: MCP protocol wrapper implementation
  - Created [`test/integration/workflows/python-workflow.ts`](../../test/integration/workflows/python-workflow.ts) - 219 lines: Python enhanced 6-stage workflow
  - Created [`test/integration/unified-debug.test.ts`](../../test/integration/unified-debug.test.ts) - 251 lines: Parameterized test factory
  - Modified [`package.json`](../../package.json#L29-L31) - Added test:integration, test:integration:cli, test:integration:mcp scripts
  - Test results: 4/4 passing (2 CLI tests + 2 MCP tests) in 69.4 seconds
  - Performance: MCP 43% faster than CLI (Python workflow: 4.9s vs 8.7s)
  - Architecture: Strategy pattern with DebugRunner interface enables same workflow to run against both transports
  - Critical fix: afterAll calls debug.stop with fromRoot=true to properly terminate Extension Host
  - Code reduction: 1,944 lines current (1 workflow), projected 58% reduction with all 5 workflows (2,744 vs 6,500 duplicated)
  - Execution log: [`file:docs/plans/13-mcp-server-implementation/tasks/phase-7-testing-strategy/execution.log.md#task-t005-unified-test-architecture`](tasks/phase-7-testing-strategy/execution.log.md#task-t005-unified-test-architecture)

## Subtasks Registry

Mid-implementation detours requiring structured tracking.

| ID | Created | Phase | Parent Task | Reason | Status | Dossier |
|----|---------|-------|-------------|--------|--------|---------|
| 004-subtask-implement-unified-test-architecture-with-runner-abstraction-layer | 2025-10-13 | Phase 7: Integration Testing | Task 7.2 | Eliminate ~1,300 lines of duplicate test code between CLI and MCP implementations by creating runner abstraction layer | [ ] Pending | [Link](tasks/phase-7-integration-testing/004-subtask-implement-unified-test-architecture-with-runner-abstraction-layer.md) |
| 005-subtask-restructure-project-as-monorepo-workspace-to-enable-shared-test-infrastructure | 2025-10-14 | Phase 7: Integration Testing | Task 7.2 | Resolve package boundary problem blocking unified test architecture (Subtask 004) | [ ] Pending | [Link](tasks/phase-7-integration-testing/005-subtask-restructure-project-as-monorepo-workspace-to-enable-shared-test-infrastructure.md) |
