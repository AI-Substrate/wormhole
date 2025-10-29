# MCP Server Implementation

## Summary

**What:** A Model Context Protocol (MCP) server that exposes VSC-Bridge's debugging and development tools to AI coding agents through a standardized protocol.

**Why:** Enable AI agents (like Claude) to programmatically control debugging sessions, set breakpoints, evaluate expressions, and interact with VS Code debugging features. This transforms VSC-Bridge from a CLI-only tool into an AI-accessible debugging platform, allowing agents to autonomously debug code, investigate issues, and understand program state.

## Goals

- **AI Agent Access**: AI agents can discover and invoke all VSC-Bridge debugging and development tools through a standard protocol
- **Zero Manual Maintenance**: Tool definitions are automatically generated from existing script metadata files, requiring no manual synchronization
- **Intelligent Tool Selection**: LLM agents receive rich guidance (descriptions, examples, prerequisites, workflows) to make correct tool choices
- **Automated Debugging Workflows**: Complex debugging sequences can be orchestrated by AI agents (e.g., set breakpoints → start debug session → inspect variables → evaluate expressions)
- **Schema Synchronization**: Tool parameter schemas automatically stay in sync with script implementations through build-time generation
- **Local Integration**: MCP server runs as `vscb mcp` CLI subcommand, communicating with VS Code extension via filesystem-based IPC
- **Consistent Naming**: Tools follow predictable naming conventions that LLMs can understand and reason about
- **Error Recovery**: Agents receive structured, actionable error information with recovery hints

## Non-Goals

- **Manual Tool Registration**: No hand-written tool definitions or handlers (100% generated)
- **HTTP Communication**: Using file-based IPC only (not HTTP API)
- **Remote/Cloud Deployment**: Local-only operation (MCP server runs on same machine as VS Code)
- **Real-Time Streaming**: Using polling-based communication (not WebSockets or event streams)
- **Non-Debugging Tools Initially**: Focus on debugging/development scripts; other tool categories are future work
- **Custom MCP Protocol**: Using standard MCP specification as-is (no protocol extensions)
- **Backward Compatibility with Old MCP Server**: Complete replacement of existing manually-coded server

## Acceptance Criteria

The following scenarios must be observable and testable:

1. **Agent Tool Discovery**
   - An AI agent connects to the MCP server via stdio transport
   - Agent receives complete list of available tools with names, descriptions, and parameter schemas
   - Tool list includes all enabled scripts from manifest (35+ tools)
   - Each tool includes category, parameter types, and usage guidance

2. **Basic Tool Execution**
   - Agent invokes `breakpoint_add` with valid parameters (file path, line number)
   - MCP server writes command to `.vsc-bridge/execute/<jobId>/command.json`
   - VS Code extension processes command and writes response
   - Agent receives success response with breakpoint details
   - Entire round-trip completes within reasonable timeout (< 5 seconds for simple operations)

3. **Parameter Validation**
   - Agent invokes tool with missing required parameter
   - MCP server rejects request with clear error message identifying missing parameter
   - Agent invokes tool with wrong parameter type (e.g., string instead of number)
   - MCP server rejects request with type validation error
   - Error messages are actionable and help agent correct the request

4. **Multi-Tool Workflow**
   - Agent executes sequence: `breakpoint_add` → `debug_start` → `debug_evaluate`
   - Each tool succeeds and returns expected data
   - Later tools can use data from earlier tools (e.g., frameId from debug session)
   - Agent can determine when prerequisites are missing (e.g., debug session not active)

5. **Error Recovery**
   - Agent invokes `debug_evaluate` without active debug session
   - MCP server returns structured error with code `E_NO_SESSION`
   - Error includes recovery hint: "Start debug session first using debug_start"
   - Agent can programmatically parse error code and take corrective action

6. **Automatic Metadata Sync**
   - Developer adds new script with `*.meta.yaml` file
   - Build process regenerates MCP tool definitions
   - New tool appears in agent's tool list on next MCP server restart
   - Tool parameters match YAML metadata exactly

7. **Consistent Tool Naming**
   - All tools follow `thing_action` naming pattern (e.g., `breakpoint_add`, `debug_evaluate`, `variable_list`)
   - Tools are grouped by category prefix (e.g., all breakpoint tools start with `breakpoint_`)
   - Agent can infer related tools from naming pattern
   - Tool names use snake_case consistently

8. **Prerequisites Communication**
   - Tool metadata indicates when other tools must run first
   - Agent attempting `debug_continue` without `debug_start` receives prerequisite error
   - Tool descriptions include workflow guidance (e.g., "Use after debug_start")
   - Agent can discover correct tool sequences from metadata

9. **Timeout Handling**
   - Agent invokes long-running operation (e.g., `debug_wait_for_hit`)
   - Operation times out after configured duration
   - Agent receives timeout error with code `E_TIMEOUT`
   - Agent can configure tool-specific timeouts via metadata

10. **Cancellation Support**
    - Agent starts long-running operation
    - Agent sends cancellation signal via MCP protocol
    - MCP server stops polling and returns cancellation error
    - Filesystem job directory is cleaned up

## Risks & Assumptions

### Risks

1. **Filesystem Polling Latency**
   - File-based IPC with polling may introduce 50-150ms latency per operation
   - Cumulative latency in multi-tool workflows could frustrate agents
   - Mitigation: Optimize poll intervals, use efficient file watching

2. **Tool Selection Overload**
   - 35+ tools may overwhelm some LLM agents' tool selection capabilities
   - Agents may struggle to choose correct tool without sufficient guidance
   - Mitigation: Rich metadata with examples, categories, and workflow hints

3. **IPC Race Conditions**
   - Concurrent tool invocations may conflict in filesystem
   - Job directory cleanup may fail under error conditions
   - Extension crash during job processing leaves orphaned files
   - Mitigation: Unique job IDs, robust cleanup, health monitoring

4. **Metadata Quality**
   - Incomplete or unclear tool descriptions reduce agent effectiveness
   - Missing examples lead to incorrect parameter usage
   - Outdated descriptions cause agent confusion
   - Mitigation: Metadata validation, documentation standards, review process

5. **Breaking Changes**
   - Script parameter changes break agent workflows
   - Tool renames confuse agents that learned old names
   - Response format changes require agent adaptation
   - Mitigation: Versioning strategy, deprecation process, migration guides

### Assumptions

1. **VS Code Extension Running**
   - Extension is active and has initialized `.vsc-bridge` directory structure
   - Extension is watching execute directory for new commands
   - Extension responds to commands within reasonable time

2. **Complete Metadata**
   - All scripts have valid `*.meta.yaml` files with complete parameter definitions
   - Metadata includes required MCP sections (tool name, description, parameters)
   - YAML is syntactically correct and semantically complete

3. **MCP Protocol Support**
   - Target AI agents support MCP protocol specification (stdio transport minimum)
   - Agents can parse JSON Schema for tool parameters
   - Agents respect tool metadata and annotations

4. **Filesystem Reliability**
   - Local filesystem operations are atomic and reliable
   - File watching mechanisms work correctly on target platforms (macOS, Linux, Windows)
   - Filesystem performance is sufficient for sub-second operations

5. **TypeScript Build Environment**
   - Node.js and TypeScript toolchain available for build-time code generation
   - Build process can read manifest.json and write generated TypeScript files
   - Generated code can import existing Zod schemas and IPC utilities

## Testing Strategy

**Approach:** Hybrid - Integration tests with in-memory MCP transport for core functionality, no strict TDD

**Rationale:** Need test harness using `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk/inMemory.js` to verify MCP server works correctly. Integration tests validate end-to-end tool execution without requiring VS Code extension or real LLM agents.

**Focus Areas:**
- **Tool generation** from manifest.json (correct naming, schemas, metadata)
- **Bridge adapter** execution via fs-bridge IPC (command writing, response polling, timeout handling)
- **MCP server integration** using in-memory transport (tool discovery, parameter validation, error handling)
- **End-to-end workflows** with multiple tool calls (breakpoint → debug → evaluate)

**Excluded:**
- Strict TDD (write tests first) - we'll write integration tests alongside implementation
- Unit tests for every small function - focus on integration over granular units
- Real LLM agent testing initially - start with programmatic SDK client tests

**Mock Usage:** Targeted mocks for external systems

Use real fs-bridge IPC where possible, mock only the VS Code extension responses by writing synthetic `response.json` files. Avoid mocking SDK components or internal MCP server logic.

**Test Structure:**
```
cli/test/integration-mcp/
├── mcp-server.test.ts          # In-memory transport tests (tool listing, execution)
├── tool-generator.test.ts      # Manifest → MCP tool definitions
├── bridge-adapter.test.ts      # MCP tools → fs-bridge commands
└── fixtures/
    ├── mock-responses/         # Synthetic extension responses
    └── test-manifest.json      # Subset of tools for testing
```

## Documentation Strategy

**Location:** Hybrid (README.md + docs/how/)

**Rationale:** Need both quick-start for users and detailed implementation guide for contributors. MCP server setup is important enough to highlight in README, but architecture and testing patterns belong in docs/how/.

**Content Split:**
- **README.md**: Installation, basic usage (`vscb mcp`), configuration (workspace flag, timeout), agent setup (Claude Desktop config), troubleshooting
- **docs/how/**: MCP server architecture, tool generation process, testing with InMemoryTransport, adding new tools, metadata schema extensions

**Target Audience:**
- README: AI agent users, VS Code extension users wanting MCP access
- docs/how/: Contributors extending MCP functionality, debugging integration issues

**Maintenance:**
- Update README when command flags or setup process changes
- Update docs/how/ when internal architecture evolves
- Regenerate tool list examples when new tools added

## Open Questions

1. **Phased Rollout** ✅ RESOLVED
   - **Decision:** Expose all 35 tools immediately with `mcp.enabled` flag for opt-out control
   - All tools get proper MCP metadata even if initially disabled
   - See Clarifications Q3 for details

2. **Description Detail Level** ✅ RESOLVED
   - **Decision:** P0+P1 metadata (tool basics + when_to_use + parameter examples)
   - See Clarifications Q8 for field breakdown

3. **Long-Running Operations**
   - How should we handle operations that may take minutes (e.g., waiting for test completion)?
   - Should we implement progress reporting or just rely on timeouts?
   - Can agents effectively use polling-based "wait" tools?

4. **Destructive Operations**
   - Should destructive tools (e.g., `debug_restart`, `variable_set`) require confirmation?
   - How do we communicate "danger level" to agents?
   - Should some tools be excluded from MCP exposure entirely?

5. **Timeout Configuration** ✅ RESOLVED
   - **Decision:** 30s default with per-tool metadata overrides, server-wide flag for CLI
   - See Clarifications Q5 for details

6. **Versioning Strategy**
   - How do we version the MCP server as tool definitions evolve?
   - Should we support multiple API versions simultaneously?
   - How do agents discover which version they're using?

7. **Tool Naming and Script Refactoring** ✅ RESOLVED
   - **Decision:** Refactor script aliases to hierarchical naming (bp.* → breakpoint.*), auto-generate MCP tool names with override option
   - See Clarifications Q4 for details

8. **Tool Categories**
   - Should we expose category metadata beyond naming prefixes?
   - Could hierarchical categories improve tool discovery?
   - Do agents benefit from explicit tool groupings?

9. **Response Normalization** ✅ RESOLVED
   - **Decision:** Wrap all responses in MCP envelope, preserve original fs-bridge response in structuredContent
   - See Clarifications Q6 for format details

10. **Error Code Standards**
    - Should we standardize error codes across all tools or allow script-specific codes?
    - How detailed should error codes be (high-level categories vs specific failures)?
    - Should error codes follow a naming convention that agents can parse?

## Clarifications

### Session 2025-10-10

**Q1: Testing Strategy**

Answer: **D (Hybrid)** - Integration tests with in-memory MCP transport, no strict TDD

Rationale: Use `InMemoryTransport.createLinkedPair()` from MCP SDK to create test harness that validates tool execution without requiring VS Code or real agents. Write integration tests alongside implementation rather than strict TDD.

**Recorded in:** Testing Strategy section

---

**Q2: Documentation Strategy**

Answer: **C (Hybrid)** - README.md for quick-start, docs/how/ for architecture

Rationale: Users need quick setup instructions in README (install, vscb mcp command, agent config). Contributors need detailed architecture and testing patterns in docs/how/.

**Content Split:**
- README: Installation, basic usage, configuration, agent setup, troubleshooting
- docs/how/: Architecture, tool generation, testing guide, extension patterns

**Recorded in:** Documentation Strategy section

---

**Q3: Tool Rollout Strategy**

Answer: **A (All 35 tools immediately)** with opt-out capability

Rationale: Expose all tools from the start but ensure metadata includes `mcp.enabled` flag to control which tools are exposed. Need all tools "worked in" with proper metadata even if some are initially disabled for testing.

**Implementation:**
- Add `mcp.enabled: boolean` (default true) to `*.meta.yaml` files
- Tool generator filters out tools where `mcp.enabled === false`
- Can selectively enable/disable tools without removing metadata
- All 35 tools get proper MCP metadata, descriptions, and schemas

**Recorded in:** Open Questions #1 (Phased Rollout) - RESOLVED

---

**Q4: Tool Naming Convention**

Answer: **B (Auto-generate with override)** + **Script Alias Refactoring**

Rationale: Auto-generate MCP tool names from script aliases using hierarchical naming (thing_action pattern). Allows manual override via `mcp.tool` when needed. As part of this work, refactor script aliases to use hierarchical naming.

**Script Alias Refactoring (prerequisite):**
- Current: `bp.set`, `bp.clear.file` (category.action pattern)
- New: `breakpoint.set`, `breakpoint.clear.file` (thing.action pattern)
- Mapping:
  - `bp.*` → `breakpoint.*`
  - `debug.*` → `debug.*` (already correct)
  - `dap.*` → `dap.*` (keep as-is, debugging protocol tools)
  - `tests.*` → `test.*` (singular)
  - `diag.*` → `diagnostic.*`
  - `utils.*` → `util.*`

**MCP Tool Name Generation:**
- Rule: `alias.replace('.', '_')` → `breakpoint.set` → `breakpoint_set`
- Allow `mcp.tool` override in `*.meta.yaml` for exceptions
- Examples:
  - `breakpoint.set` → `breakpoint_set` (auto)
  - `breakpoint.clear.file` → `breakpoint_clear_file` (auto)
  - `debug.evaluate` → `debug_evaluate` (auto)

**Recorded in:** Open Questions #7 (renamed from Tool Categories) - RESOLVED

---

**Q5: Timeout Configuration**

Answer: **A (Single default) + D (Per-tool metadata overrides)**

Rationale: Use 30s default (matches CLI) for simplicity, but allow individual tools to specify custom timeouts in `*.meta.yaml` when needed (e.g., long-running test operations).

**Implementation:**
- Default: 30000ms (30 seconds) for all tools
- Override: Tools can specify `mcp.timeout: number` in metadata
- Command flag: `vscb mcp --timeout 60000` sets server-wide default
- Examples of tools needing overrides:
  - `test.debug_single`: 60000ms (test discovery + debug startup)
  - `debug.wait_for_hit`: 90000ms (waiting for breakpoint)
  - `dap.*` tools: 90000ms (complex DAP operations)

**Recorded in:** Open Questions #5 (Timeout Configuration) - RESOLVED

---

**Q6: Response Normalization**

Answer: **C (Hybrid - wrap in MCP envelope, preserve original in structuredContent)**

Rationale: Use standard MCP response format (`{content, structuredContent}`) for consistency, but preserve original script response shape (action/query/waitable) inside `structuredContent` for rich data access.

**Implementation:**
```typescript
// Success response
{
  content: [{ type: 'text', text: 'Breakpoint added successfully' }],
  structuredContent: {
    ok: true,              // from fs-bridge envelope
    type: 'success',
    data: {                // original script response
      success: true,
      details: { breakpoint: {...} }
    },
    meta: { requestId, timestamp, duration }
  }
}

// Error response
{
  isError: true,
  content: [{ type: 'text', text: '[E_NO_SESSION] No active debug session' }],
  structuredContent: {
    ok: false,
    type: 'error',
    error: { code: 'E_NO_SESSION', message: '...', details: {...} },
    meta: { requestId, timestamp }
  }
}
```

**Recorded in:** Open Questions #9 (Response Normalization) - RESOLVED

---

**Q7: CLI Integration Approach**

Answer: **A (Subcommand)** with internal factory pattern for testing

Rationale: Simple `vscb mcp` command runs MCP server in foreground using stdio transport. Internally uses factory pattern for testability with InMemoryTransport, but external interface is straightforward subcommand.

**Implementation:**
```typescript
// cli/src/commands/mcp.ts (oclif command)
export default class Mcp extends Command {
  static description = 'Start MCP server for AI agent access';
  static flags = {
    workspace: Flags.string({ description: 'Workspace directory' }),
    timeout: Flags.integer({ default: 30000 }),
  };

  async run() {
    const { flags } = await this.parse(Mcp);
    const server = createMcpServer({ workspace: flags.workspace, timeout: flags.timeout });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Blocks here, server runs until stdin closes
  }
}

// cli/src/lib/mcp/server.ts (factory for testing)
export function createMcpServer(opts) {
  // Returns configured Server instance
  // Used by both CLI command and tests
}
```

**User Experience:**
- Agents spawn: `vscb mcp` (stdio transport)
- Runs in foreground, logs to stderr
- Ctrl+C or stdin close stops server
- No daemon management needed

**Recorded in:** Goals section (updated to include CLI integration)

---

**Q8: Metadata Enhancement Priority**

Answer: **P0 + P1 (Must-Have + Important)** for initial release

Rationale: Focus on fields that directly improve agent tool selection and parameter usage. P0 enables basic discovery, P1 provides critical guidance for correct usage. P2 (workflows, prerequisites) can be added iteratively based on real agent behavior.

**Initial Release Metadata (P0 - Must-Have):**
- `mcp.enabled: boolean` (default true) - Control tool exposure
- `mcp.tool: string` (optional) - Override auto-generated name
- `mcp.description: string` (required) - Tool purpose and usage
- `mcp.timeout: number` (optional) - Override default timeout

**Initial Release Metadata (P1 - Important):**
- `mcp.llm.when_to_use: string` - Clear guidance on when to invoke this tool
- `mcp.llm.parameter_hints: object` - Per-parameter examples and guidance
  ```yaml
  parameter_hints:
    expression:
      examples: ["x * 2", "user.name", "items[0]"]
      note: "Use language-appropriate syntax"
  ```

**Deferred to Future Iterations (P2+):**
- `mcp.llm.workflows` - Multi-tool sequence patterns
- `mcp.llm.requires` - Prerequisite tools
- `mcp.llm.error_recovery` - Per-error-code recovery hints
- `mcp.llm.cost_level`, `latency_estimate` - Optimization hints

**Recorded in:** Open Questions #2 (Description Detail Level) - RESOLVED

---

## Clarification Summary

**Session 2025-10-10 Coverage:**

| Category | Questions Resolved | Status |
|----------|-------------------|--------|
| **Testing & Quality** | Q1 (Testing Strategy), Q2 (Documentation) | ✅ Complete |
| **Rollout & Scope** | Q3 (Tool Exposure), Q8 (Metadata Priority) | ✅ Complete |
| **Architecture** | Q4 (Naming Convention), Q7 (CLI Integration) | ✅ Complete |
| **Configuration** | Q5 (Timeouts), Q6 (Response Format) | ✅ Complete |

**Resolved Issues (8/10 open questions):**
1. ✅ Phased Rollout → All 35 tools with opt-out flag
2. ✅ Description Detail Level → P0+P1 metadata fields
3. ⏭️ Long-Running Operations → Deferred (use timeouts)
4. ⏭️ Destructive Operations → Deferred (no special handling initially)
5. ✅ Timeout Configuration → 30s default + per-tool overrides
6. ⏭️ Versioning Strategy → Deferred (v1 only initially)
7. ✅ Tool Naming → Auto-generate from refactored aliases
8. ⏭️ Tool Categories → Deferred (use naming prefixes)
9. ✅ Response Normalization → MCP envelope + preserve original
10. ⏭️ Error Code Standards → Deferred (preserve existing codes)

**Deferred Items (address in future phases):**
- Long-running operation progress reporting
- Destructive operation confirmation mechanisms
- Multi-version API support
- Explicit tool category hierarchy
- Standardized error code taxonomy

**Ready for Architecture Phase:**
All critical design decisions resolved. Can proceed to `/plan-3-architect` for detailed phase-based implementation plan.
