# MCP Tool Visibility Control

## Summary

Reduce the number of VSC-Bridge MCP tools visible to LLM clients (from 36 to ~22-25 tools) by hiding non-essential, redundant, or verbose tools while keeping them available via the CLI. This approach uses the existing `mcp.enabled` metadata field to control which tools appear in MCP tool lists, without deleting any code or breaking existing CLI workflows.

The primary goal is to reduce LLM context usage and improve tool discoverability by hiding DAP (Debug Adapter Protocol) analysis tools, developer-only utilities, and redundant operations from MCP clients, while preserving full CLI functionality for power users.

## Goals

1. **Reduce LLM context usage** - Hide verbose DAP analysis tools (8 tools) that return large outputs and are rarely needed by LLMs
2. **Improve tool discoverability** - Make the MCP tool list more focused on essential debugging operations
3. **Preserve CLI functionality** - All hidden tools remain accessible via `vscb script run` commands
4. **Use existing infrastructure** - Leverage the already-implemented `mcp.enabled` field in manifest metadata
5. **Enable user customization** - Add environment variable support for users to override visibility defaults
6. **Maintain test compatibility** - Ensure all 13 critical tools used in integration tests remain visible
7. **Zero breaking changes** - No code deletion, no API changes, purely visibility control

## Non-Goals

1. **Tool consolidation** - Not merging similar tools into consolidated commands (separate effort)
2. **Code deletion** - Not removing any tool implementations from codebase
3. **CLI changes** - Not modifying CLI behavior or available commands
4. **Functional changes** - Not altering tool behavior, parameters, or responses
5. **Breaking changes** - Not deprecating or removing any existing functionality
6. **DAP protocol changes** - Not modifying underlying Debug Adapter Protocol integration
7. **Extension UI** - Not adding VS Code settings UI for tool visibility (using env vars only)

## Acceptance Criteria

### 1. Tool Visibility Configuration

**AC1.1** - The following tools are hidden from MCP by setting `mcp.enabled: false` in their `.meta.yaml` files:
- `dap_summary` - Redundant with dap_logs + dap_exceptions
- `dap_timeline` - Low-value visualization tool
- `dap_filter` - Overlaps with dap_search
- `dap_logs` - Verbose output (thousands of lines)
- `dap_exceptions` - Can be verbose
- `dap_search` - Advanced search (rarely needed)
- `dap_stats` - Statistical analysis (rarely needed)
- `dap_compare` - Session comparison (extremely rare)
- `debug_tracker` - Developer-only DAP protocol debugging
- `breakpoint_remove` - To be merged into breakpoint_set in future consolidation

**AC1.2** - The following tools remain visible in MCP (essential for integration tests and core workflows):
- All breakpoint tools: `breakpoint_set`, `breakpoint_clear_project`, `breakpoint_clear_file`, `breakpoint_list`
- All session tools: `debug_start`, `debug_stop`, `debug_status`
- All stepping tools: `debug_step_into`, `debug_step_over`, `debug_step_out`, `debug_continue`
- All variable tools: `debug_list_variables`, `debug_get_variable`, `debug_set_variable`, `debug_evaluate`
- All context tools: `debug_stack`, `debug_scopes`, `debug_threads`
- Testing tools: `test_debug_single`, `editor_show_testing_ui` (migrated from `test_show_testing_ui` on 2025-10-20)
- Utility tools: `bridge_status`, `diagnostic_collect`, `util_restart_vscode`, `debug_save_variable`

**AC1.3** - All hidden tools remain fully functional via CLI:
- `vscb script run dap.summary` works correctly
- `vscb script run dap.logs` works correctly
- All other hidden tools accessible via their CLI aliases

### 2. Environment Variable Override

**AC2.1** - Users can hide additional tools at runtime via `MCP_HIDDEN_TOOLS` environment variable:
```json
{
  "mcpServers": {
    "vsc-bridge": {
      "env": {
        "MCP_HIDDEN_TOOLS": "debug_scopes,debug_threads"
      }
    }
  }
}
```

**AC2.2** - Users can show hidden tools by setting `MCP_SHOW_ALL_TOOLS=true`:
```json
{
  "env": {
    "MCP_SHOW_ALL_TOOLS": "true"
  }
}
```

**AC2.3** - Environment variable filtering is validated:
- Invalid tool names are logged but don't cause errors
- Comma-separated list parsing handles whitespace correctly
- Exact name matching only (wildcard patterns deferred to Phase 2)

### 3. Integration Test Compatibility

**AC3.1** - All 13 Tier 1 critical tools (used in integration tests) remain visible by default:
- `breakpoint_set`, `breakpoint_clear_project`
- `debug_start`, `debug_stop`, `debug_status`
- `test_debug_single`, `editor_show_testing_ui` (migrated from `test_show_testing_ui` on 2025-10-20)
- `debug_step_into`, `debug_step_over`, `debug_step_out`, `debug_continue`
- `debug_list_variables`
- `bridge_status`

**AC3.2** - Integration tests continue to pass without modifications:
- `just test-integration` passes (unified-debug.test.ts)
- `just test-integration-mcp` passes (stdio-e2e.test.ts)
- All language workflow tests pass (Python, C#, Java, TypeScript)

**AC3.3** - Test infrastructure tools remain accessible:
- Runner implementations (MCPRunner.ts, CLIRunner.ts) work unchanged
- All workflow files execute successfully
- Smoke tests verify bridge health

### 4. Documentation

**AC4.1** - New documentation file `docs/mcp-tool-visibility.md` exists with:
- Explanation of `mcp.enabled` field in metadata
- List of hidden vs visible tools with rationale
- Instructions for using `MCP_HIDDEN_TOOLS` environment variable
- Examples of common customization scenarios
- Migration guide for users who relied on hidden tools

**AC4.2** - Each hidden tool's `.meta.yaml` file includes comment explaining why it's hidden:
```yaml
# Hidden from MCP by default - verbose output with thousands of lines
# Still available via CLI: vscb script run dap.logs
mcp:
  enabled: false
```

### 5. Observable Outcomes

**AC5.1** - When an LLM queries MCP tools via `tools/list`, it sees ~22-25 tools instead of 36

**AC5.2** - Hidden tools are filtered from `tools/list` so MCP clients never see them:
- If a hidden tool is somehow called directly (edge case), return actionable error:
- Error message: "Tool 'dap_summary' is disabled. Access via CLI: vscb script run dap.summary"
- Normal operation: Hidden tools simply don't appear in tool list

**AC5.3** - When calling a hidden tool via CLI, it works normally:
- `vscb script run dap.summary` returns expected results
- No warnings or deprecation notices

**AC5.4** - Tool count is reduced in MCP tool list:
- Default: ~22-25 tools visible (36 - 11-14 hidden)
- With `MCP_SHOW_ALL_TOOLS=true`: 36 tools visible

## Risks & Assumptions

### Risks

1. **User confusion** - Users who relied on hidden tools may be confused when they disappear from MCP
   - *Mitigation*: Clear error messages with workarounds, documentation, `MCP_SHOW_ALL_TOOLS` override

2. **Discoverability loss** - Users may not know hidden tools exist
   - *Mitigation*: Document all tools (hidden and visible) with CLI usage examples

3. **Integration test brittleness** - Tests might implicitly depend on hidden tools
   - *Mitigation*: Comprehensive test suite analysis (completed) ensures all critical tools remain visible

4. **Environment variable complexity** - Users may struggle with env var configuration
   - *Mitigation*: Clear examples in documentation, validation with helpful error messages

5. **Inconsistent behavior** - Different MCP configurations may expose different tools
   - *Mitigation*: Document defaults clearly, recommend standard configurations

### Assumptions

1. **Existing `mcp.enabled` field works** - The `shouldIncludeTool()` function correctly filters tools
   - *Validation*: Code review shows this is already implemented (tool-generator.ts lines 220-233)

2. **DAP tools are rarely needed by LLMs** - LLMs don't typically analyze debug logs in detail
   - *Validation needed*: [NEEDS CLARIFICATION: Have we observed LLM usage patterns? Are DAP tools actually used?]

3. **13 Tier 1 tools are sufficient** - Core debugging workflows only need the essential tools
   - *Validation*: Integration tests confirm these 13 tools cover all automated workflows

4. **CLI users know tool aliases** - Power users can find hidden tools via `vscb script list`
   - *Validation needed*: Documentation must include `script list` command

5. **No MCP protocol limitations** - MCP supports dynamic tool lists based on configuration
   - *Validation needed*: Verify MCP spec allows variable tool counts per server instance

6. **Environment variables work in .mcp.json** - Claude Desktop supports env vars in MCP config
   - *Validation*: Confirmed by MCP documentation and existing usage patterns

## Open Questions

### Resolved (from Clarification Session)

1. ✅ **Visibility level** - **RESOLVED**: Moderate (hide 10 tools: 8 DAP + debug_tracker + breakpoint_remove), keep user-requested tools visible
2. ✅ **Default visibility for new tools** - **RESOLVED**: Visible by default (omit `mcp.enabled` field unless hiding)
3. ✅ **Wildcard support priority** - **RESOLVED**: Defer to Phase 2 (Phase 1 uses comma-separated exact names only)
4. ✅ **Error message format** - **RESOLVED**: Actionable error with CLI instructions if hidden tool somehow called directly
5. ✅ **Visibility tracking/logging** - **RESOLVED**: Log hidden tool count at MCP server startup, log when env vars override defaults
6. ✅ **Documentation location** - **RESOLVED**: `docs/how/mcp-tool-visibility.md` (comprehensive guide, no README changes)
7. ✅ **Testing approach** - **RESOLVED**: Existing integration tests must pass, no new test infrastructure needed
8. ✅ **Mock usage** - **RESOLVED**: Avoid mocks entirely, use real MCP server and manifest

### Outstanding (for Architecture Phase)

1. **Future consolidation compatibility** - Will hidden tools affect future consolidation plans?
   - If we consolidate `debug_execute` (5 tools → 1), do hidden flags transfer?
   - Should we coordinate hiding with consolidation roadmap?
   - *Strategic decision for architecture phase*

2. **Build vs runtime filtering** - Should `mcp.enabled: false` filter at build-time or runtime?
   - **Build-time**: Modify `build-manifest.ts` to exclude tools from `manifest.json`
   - **Runtime**: Keep in manifest but filter in `shouldIncludeTool()` (current behavior)
   - *Technical decision for architecture phase*

3. **Environment variable naming** - Are `MCP_HIDDEN_TOOLS` and `MCP_SHOW_ALL_TOOLS` the best names?
   - Alternative: `VSC_BRIDGE_HIDDEN_TOOLS` (more specific namespace)
   - Alternative: `MCP_TOOL_FILTER` (single consolidated var)
   - *Design decision for architecture phase*

## Reference Materials

- Detailed removal analysis: `scratch/removal-analysis.md`
- Integration test tool usage: `scratch/integration-test-tools.md` (to be created)
- MCP visibility research: `scratch/mcp-visibility-investigation.md` (to be created)
- Consolidation analysis: `scratch/consolidation-analysis.md`

## Success Metrics

1. **Visibility reduction**: 36 → 22-25 tools visible in MCP (31-39% reduction)
2. **Zero test failures**: 100% of integration tests pass after hiding tools
3. **CLI preservation**: 100% of tools accessible via `vscb script run`
4. **User adoption**: >0 users configure `MCP_HIDDEN_TOOLS` within 1 month (indicates feature is used)
5. **Error rate**: <1% of tool calls fail due to visibility errors (indicates good defaults)
6. **Documentation clarity**: <5 user questions about hidden tools in first month (indicates clear docs)

## Tools to Hide (Initial Plan)

### Category A: DAP Analysis Tools (8 tools) - High Confidence

**Rationale**: Verbose output, rarely needed by LLMs, advanced use cases

1. **dap_summary** - Redundant with calling dap_logs + dap_exceptions manually
2. **dap_timeline** - Chronological visualization, low value for automated analysis
3. **dap_filter** - Complex filtering overlaps with dap_search
4. **dap_logs** - Can return thousands of lines, overwhelming for LLM context
5. **dap_exceptions** - Can be verbose, specialized error analysis
6. **dap_search** - Advanced pattern search, power user feature
7. **dap_stats** - Statistical aggregation, specialized analysis
8. **dap_compare** - Session comparison, extremely rare use case

### Category B: Developer Tools (1 tool) - High Confidence

**Rationale**: Debugging the debugger, not for end users

9. **debug_tracker** - Captures raw DAP protocol messages, developer-only

### Category C: Consolidation Candidates (1 tool) - High Confidence

**Rationale**: Will be merged into other tools in future consolidation

10. **breakpoint_remove** - Will merge into `breakpoint_set` with action parameter

### Category D: Advanced Debug (4 tools) - Medium Confidence

**Rationale**: Not used in integration tests, specialized use cases

11. **debug_wait_for_hit** - Rarely needed, blocking operation
12. **debug_restart** - Can use stop + start sequence
13. **debug_set_variable** - Specialized debugging technique
14. **debug_scopes** - Partially redundant with debug_list_variables

**Note**: User requested to keep debug_save_variable, editor_show_testing_ui (formerly test_show_testing_ui, migrated 2025-10-20), util_restart_vscode, debug_threads - these will remain visible.

## Tools to Keep Visible (Essential Set)

### Tier 1: Critical for Integration Tests (13 tools)

1. `breakpoint_set`
2. `breakpoint_clear_project`
3. `debug_start`
4. `debug_stop`
5. `debug_status`
6. `test_debug_single`
7. `debug_step_into`
8. `debug_step_over`
9. `debug_step_out`
10. `debug_continue`
11. `debug_list_variables`
12. `editor_show_testing_ui` (formerly `test_show_testing_ui`, migrated 2025-10-20)
13. `bridge_status`

### Tier 2: Supporting Tools (9 tools)

14. `breakpoint_list`
15. `breakpoint_clear_file`
16. `debug_stack`
17. `debug_evaluate`
18. `debug_get_variable`
19. `debug_threads` (user requested)
20. `debug_save_variable` (user requested)
21. `util_restart_vscode` (user requested)
22. `diagnostic_collect`

**Total Visible**: 22 tools (13 Tier 1 + 9 Tier 2)
**Total Hidden**: 14 tools (10 high-confidence + 4 medium-confidence)

---

## Testing Strategy

**Approach**: Integration Test Focused (Lightweight + Existing Test Suite)

**Rationale**: The `just test-integration` tests must pass (or close to it, some can be fidgety which is fine). This feature only modifies metadata (`mcp.enabled: false` in `.meta.yaml` files) and adds simple environment variable filtering logic. The existing integration test suite provides comprehensive coverage of the MCP tool workflow.

**Focus Areas**:
1. **Integration test compatibility** - All 13 Tier 1 critical tools must remain visible and functional
2. **Environment variable parsing** - `MCP_HIDDEN_TOOLS` and `MCP_SHOW_ALL_TOOLS` correctly filter tools
3. **MCP tool list verification** - `tools/list` returns correct count (22 visible, 14 hidden by default)
4. **CLI preservation** - Hidden tools still work via `vscb script run` commands

**Excluded** (no new tests needed):
- Individual tool functionality (already tested)
- DAP protocol behavior (unchanged)
- VS Code extension integration (no changes)
- Error handling for individual tools (existing coverage)

**Mock Usage**: Avoid mocks entirely

**Rationale**: Use real MCP server, actual manifest, and genuine integration tests. No mocking needed since we're only changing metadata and adding simple filtering logic.

**Test Execution**:
- Run `just test-integration` to verify unified-debug.test.ts passes
- Run `just test-integration-mcp` to verify stdio-e2e.test.ts passes
- All language workflows (Python, C#, Java, TypeScript) must execute successfully
- Verify tool count via MCP `tools/list` request

---

## Documentation Strategy

**Location**: docs/how/ only

**Rationale**: This is a detailed configuration feature that needs comprehensive documentation with examples, troubleshooting, and architectural explanation. Users need to understand:
- Why tools are hidden
- Which tools are hidden/visible
- How to customize via environment variables
- How to access hidden tools via CLI
- Build-time vs runtime filtering mechanisms

**Target Audience**:
1. **LLM users** - Understanding which tools are available in MCP
2. **Power users** - Customizing tool visibility for their workflow
3. **Contributors** - Understanding how to set `mcp.enabled` field in new tools
4. **Troubleshooters** - Diagnosing why a tool isn't visible in MCP

**Content Structure** (`docs/how/mcp-tool-visibility.md`):
1. **Overview** - What is tool visibility control and why it exists
2. **Architecture** - How filtering works (build-time `.meta.yaml` + runtime env vars)
3. **Hidden Tools List** - Complete list with rationale for each
4. **Visible Tools List** - Essential tools that remain available
5. **Customization Guide** - How to use `MCP_HIDDEN_TOOLS` and `MCP_SHOW_ALL_TOOLS`
6. **CLI Access** - How to use hidden tools via `vscb script run`
7. **Troubleshooting** - Common issues and solutions
8. **For Contributors** - How to set visibility when creating new tools

**Maintenance**:
- Update when new tools are added (document default visibility)
- Update when tools are hidden/shown by default
- Update if env var format changes

---

## Clarifications

### Session 2025-01-19

**Q1: What testing approach best fits this feature's complexity and risk profile?**
- **Answer**: "The `just test-integration` tests need to pass (or close to it, some can be fidgety which is fine)."
- **Impact**: Use existing integration test suite as primary validation. No need for extensive new tests since we're only modifying metadata and adding simple filtering logic.

**Q2: How should mocks/stubs/fakes be used during implementation?**
- **Answer**: "Avoid mocks entirely"
- **Impact**: Use real MCP server, actual manifest files, and genuine integration tests. No test mocking infrastructure needed.

**Q3: Where should this feature's documentation live?**
- **Answer**: "docs/how/ only"
- **Impact**: Create comprehensive documentation at `docs/how/mcp-tool-visibility.md` with detailed explanations, examples, and troubleshooting. No README.md changes needed.

**Q4: What visibility level should we use for hiding tools?**
- **Answer**: "Moderate, but debug_save_variable must stay, editor_show_testing_ui must stay (formerly test_show_testing_ui, migrated 2025-10-20), util_restart_vscode must stay, debug_threads must stay"
- **Impact**: Hide 10 tools (8 DAP tools + debug_tracker + breakpoint_remove). Keep the 4 user-requested tools visible plus all integration test tools.

**Q5: Should Phase 1 include wildcard support for MCP_HIDDEN_TOOLS?**
- **Answer**: "No, defer to Phase 2"
- **Impact**: Phase 1 implements comma-separated exact name matching only. Wildcard patterns (e.g., `dap_*`) deferred to Phase 2 based on user feedback.

**Q6: When a hidden tool is called via MCP, what error should be returned?**
- **Answer**: "The system wont even see it? but if they do then they can use 2, make it actionable."
- **Impact**: Hidden tools are filtered from `tools/list` so clients never see them. If somehow called directly, return actionable error: "Tool disabled. Access via CLI: vscb script run <alias>". Update AC5.2 to clarify this.

**Q7: Should we log when tools are hidden/shown for debugging?**
- **Answer**: "The filtering will happen when the scripts are built right? do you know what actually generates these names and how filtering works? Maybe its me who doesnt know that."
- **Clarification Provided**: Filtering happens at **two points**:
  1. **Build-time**: `mcp.enabled: false` in `.meta.yaml` prevents tool from being added to `manifest.json`
  2. **Runtime**: `shouldIncludeTool()` in `tool-generator.ts` checks `mcp.enabled` when generating MCP tool list
  3. **Env vars**: `MCP_HIDDEN_TOOLS` adds additional runtime filtering on top of manifest
- **Impact**: Add logging at runtime when `MCP_HIDDEN_TOOLS` or `MCP_SHOW_ALL_TOOLS` env vars are used. Log hidden tool count during MCP server startup for debugging.

**Q8: Should new tools be visible or hidden by default in the future?**
- **Answer**: "Visible by default"
- **Impact**: When creating new tools, omit `mcp.enabled` field (defaults to visible). Only add `mcp.enabled: false` for tools that should be hidden. Update contributor documentation accordingly.
