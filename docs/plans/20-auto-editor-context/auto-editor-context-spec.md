# Auto-Include Editor Context in All Responses

## Summary

Automatically enrich every MCP tool and CLI command response with the current editor context—including file path, cursor position, selected text, and containing symbol hierarchy (method/class/markdown section). Additionally, provide a standalone `editor.get-context` tool that LLMs can explicitly call to query current context without performing any other operation.

**What**: Add an `editorContext` field to all response envelopes containing real-time editor state, plus a dedicated MCP tool for explicit context queries.

**Why**: LLMs currently operate blind to where users are positioned in their code. This forces users to repeatedly explain "I'm in file X, line Y, inside method Z," wasting time and breaking flow. With automatic context enrichment, every tool interaction includes spatial awareness, enabling context-aware suggestions, scoped operations, and reduced cognitive overhead.

## Goals

1. **Automatic context in all responses**: Every MCP tool and CLI command response includes `editorContext` field when a file is open
2. **Standalone context query tool**: Dedicated `editor.get-context` MCP tool for explicit context requests
3. **Rich, actionable context data**:
   - File path, language ID, total line count, isDirty (unsaved changes)
   - Cursor position (1-indexed line/character)
   - Selection state (isEmpty, selected text, range)
   - Symbol hierarchy (containing scopes from outermost class to innermost variable)
   - Immediate scope (innermost symbol user is currently inside)
   - Human-readable scope hierarchy string (e.g., `Class:Foo > Method:bar > Variable:baz`)
4. **Universal language support**: Works across all languages with VS Code language servers (JavaScript, TypeScript, Python, Dart, Java, C#, Go, Rust, etc.)
5. **Markdown section awareness**: Detects nested header hierarchy in Markdown files (H1 > H2 > H3, etc.)
6. **Performance constraint**: Context enrichment adds <100ms overhead per request
7. **Graceful degradation**: Missing context (no active editor, no language server) doesn't break tool responses

## Non-Goals

1. **Method signature extraction**: Not parsing/extracting full method signatures from source code (future enhancement)
2. **Multiple cursor support**: Only tracks primary cursor position, ignoring multi-cursor scenarios
3. **Context for inactive editors**: Only reports currently active/focused editor, not background tabs
4. **Historical context tracking**: No session history, previous positions, or navigation breadcrumbs
5. **Performance optimization beyond basic implementation**: No caching, throttling, or incremental updates initially
6. **Custom context providers**: No plugin system for extending context data with user-defined fields
7. **Context diff detection**: Not tracking what changed between requests
8. **Editor configuration**: Not including VS Code settings, theme, or layout information

## Acceptance Criteria

### AC1: Auto-Context in All MCP Tool Responses
**Given** I am an LLM calling any MCP tool (e.g., `breakpoint.set`, `debug.step-over`, `search.symbol-search`)
**And** a file is currently open and focused in the VS Code editor
**When** the MCP tool returns its response
**Then** the response envelope includes an `editorContext` field containing:
- `file.path` (absolute path), `file.languageId` (e.g., "javascript"), `file.lineCount`, `file.isDirty` (boolean)
- `cursor.line` (1-indexed), `cursor.character` (1-indexed)
- `selection.isEmpty` (boolean), `selection.text` (string if selected, null otherwise), `selection.range` (start/end positions if selected)
- `symbols.totalInDocument` (total symbol count)
- `symbols.containingScopes` (array from outermost to innermost scope, each with name/kind/range)
- `symbols.immediateScope` (innermost scope object or null)
- `symbols.scopeHierarchy` (human-readable string like "Class:UserService > Method:findUser")

### AC2: Auto-Context in All CLI Command Responses
**Given** I run any CLI command (`vscb script run breakpoint.set --param path=... --param line=...`)
**And** a file is open in VS Code
**When** the command completes and returns JSON
**Then** the JSON response includes the `editorContext` field with all context data (same structure as AC1)

### AC3: Standalone Context Query Tool Exists
**Given** I am an LLM
**When** I call the MCP tool `mcp__vsc_bridge__editor_get_context()` with no parameters
**Then** I receive a success response where:
- `ok: true`
- `data` is an empty object `{}`
- `editorContext` is populated with full context (file, cursor, selection, symbols)
**And** the tool's MCP schema description clearly states its purpose: "Get current editor cursor position, selection, and containing symbol context"

### AC4: No Active Editor Gracefully Handled
**Given** no file is currently open/focused in VS Code (all tabs closed or focus elsewhere)
**When** any MCP/CLI tool is called
**Then** the tool response succeeds normally
**And** the `editorContext` field is **omitted** (not present, not `null`)
**And** no error is logged or reported

### AC5: Nested Symbol Detection in Code Files
**Given** my cursor is positioned inside a method which is inside a class
**When** I invoke any tool (or call `editor.get-context`)
**Then** `editorContext.symbols.containingScopes` is an array showing the hierarchy:
- First element: class symbol with `kind: "Class"`, `name: "UserService"`, `range: { start: 10, end: 200, length: 191 }`
- Second element: method symbol with `kind: "Method"`, `name: "findUser"`, `range: { start: 45, end: 75, length: 31 }`
**And** `editorContext.symbols.immediateScope` equals the innermost (method) symbol
**And** `editorContext.symbols.scopeHierarchy` equals `"Class:UserService > Method:findUser"`

### AC6: Variable Scope Detection
**Given** my cursor is inside a variable declaration block inside a method
**When** context is fetched
**Then** `containingScopes` shows three levels: Class > Method > Variable
**And** `immediateScope` is the variable symbol
**And** all ranges are accurate (1-indexed start/end lines with correct length)

### AC7: Markdown Header Hierarchy Detection
**Given** my cursor is in a Markdown file under a level-4 header (`#### Subsection`)
**And** that header is nested under `### Section`, which is under `## Chapter`, which is under `# Document Title`
**When** context is enriched
**Then** `containingScopes` shows four levels of headers (H1 > H2 > H3 > H4)
**And** each scope has `kind: "String"` (Markdown headers use String kind)
**And** `name` includes full header text with emojis/formatting preserved (e.g., `"## 🚀 Getting Started"`)
**And** `range` accurately reflects the section extent (from header line to next header or EOF)

### AC8: Top-Level Code Gracefully Handled
**Given** my cursor is at module level in a code file (e.g., in a `require()` statement at top of file)
**When** context is fetched
**Then** `containingScopes` is an empty array `[]`
**And** `immediateScope` is `null`
**And** file and cursor information is still provided normally

### AC9: Performance Requirement Met
**Given** any MCP/CLI tool is invoked
**When** the response includes editor context enrichment
**Then** the **context fetching overhead** is measured at less than 100 milliseconds
**And** the total tool response time remains within existing timeout limits (no timeouts caused by context enrichment)
**And** performance is consistent across files up to 1,000 lines with up to 500 symbols

### AC10: Symbol Provider Errors Don't Break Responses
**Given** I have a file open with no language server registered (e.g., `.txt` file, unsupported language)
**When** context enrichment attempts to fetch document symbols
**Then** the API call fails gracefully
**And** the tool response still succeeds (not blocked by context fetch failure)
**And** `editorContext.symbols` includes a `warning` field: `"No symbol provider registered for this language"`
**And** `containingScopes` is empty array, `immediateScope` is null
**And** file and cursor information is still provided

### AC11: Symbol Provider Crashes Don't Break Responses
**Given** a language server is registered but crashes when queried
**When** context enrichment calls `executeDocumentSymbolProvider`
**Then** the exception is caught
**And** the tool response still succeeds
**And** `editorContext` is **omitted** (or includes minimal info with error field)
**And** an error is logged to the output channel but not surfaced to user

### AC12: Context Reflects Call Time Snapshot
**Given** I invoke a long-running operation (e.g., `debug.continue` that runs for 5 seconds)
**And** I move my cursor to a different location while it's running
**When** the operation completes and returns
**Then** `editorContext` reflects the editor state **at the time the operation was invoked**, not the current state
**Rationale**: Context is captured once at request start, not re-queried at response time

### AC13: Standalone Tool Listed in MCP Manifest
**Given** the extension is installed and MCP server is running
**When** an MCP client queries available tools
**Then** `editor_get_context` appears in the tool list
**And** its schema shows:
- No required parameters
- Description: "Get current editor cursor position, selection, and containing symbol context"
- Returns empty object (context in envelope)

### AC14: LLM Usage Documentation
**Given** an LLM is examining the `editor.get-context` tool metadata
**Then** the `llm.when_to_use` section clearly states:
- **USE FOR**: Understanding where user is currently working, getting method/class context before making edits
- **DON'T USE FOR**: Navigating to different files (use goto-line), searching code (use symbol-search)
- **PATTERNS**: Call at start of editing workflows, check context before scoped operations

### AC15: System Tools Auto-Excluded
**Given** I call a system/meta tool (e.g., `bridge_status`, `mcp_list_tools`, `diagnostic_collect`)
**When** the tool returns its response
**Then** the `editorContext` field is **omitted** (not present)
**Rationale**: System tools don't benefit from editor state; excluding context reduces payload size for meta-operations

## Risks & Assumptions

### Risks

1. **Performance degradation on every request**
   - Adding 50-100ms to every tool call could accumulate and become noticeable
   - *Mitigation*: Benchmark with real workflows, add caching layer if needed, consider making opt-out per tool

2. **Symbol provider unavailability**
   - Not all file types have language servers (plain text, config files, binary files)
   - *Mitigation*: Graceful degradation with warnings, not errors; file/cursor info still provided

3. **Large file performance impact**
   - Files with 10,000+ lines and thousands of symbols could slow symbol fetching
   - Recursive tree traversal could degrade with deep nesting
   - *Mitigation*: Document known limitations, add symbol count warnings, test with large files in Python/TypeScript

4. **Breaking changes to response schema**
   - Adding a new field to response envelope could break strict consumers expecting exact schema
   - *Mitigation*: Field is optional (omitted when no editor), additive only, versioned envelope format

5. **Context staleness during async operations**
   - User might move cursor/change files while a tool is executing
   - Context reflects start time, not completion time
   - *Mitigation*: Accept eventual consistency, document behavior clearly

6. **MCP transport payload size increase**
   - Every response gains 1-5KB of context data
   - Could impact network-constrained scenarios or high-frequency tool calls
   - *Mitigation*: Monitor payload sizes, consider compression if needed

### Assumptions

1. **VS Code API stability**: `vscode.window.activeTextEditor` and `vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider')` remain stable APIs across VS Code versions
2. **Well-formed DocumentSymbol trees**: Language servers return non-overlapping, correctly nested symbol hierarchies (standard for official language extensions)
3. **Single cursor dominates usage**: Multi-cursor editing is rare enough to defer support to future enhancement
4. **JSON serialization compatibility**: All context objects (Position, Range, etc.) serialize cleanly to JSON without circular references
5. **MCP client robustness**: Claude and other MCP clients gracefully handle additional envelope fields they don't recognize
6. **Extension Host stability**: Fetching editor state doesn't trigger race conditions or deadlocks in VS Code's extension host
7. **TypeScript compilation compatibility**: Code can be compiled to JavaScript for webpack bundling without runtime errors

## Testing Strategy

**Approach**: Implement-first with integration testing validation

**Rationale**: Following project conventions, we implement the feature using real VS Code Extension Host testing rather than heavy mocking or TDD. The integration test framework (Vitest with InMemoryTransport and real Extension Host) provides comprehensive validation of the auto-enrichment behavior.

**Focus Areas**:
- Response envelope structure validation (editorContext field present/absent)
- Editor state detection (file path, language ID, cursor position)
- Symbol hierarchy detection (nested scopes, Markdown headers, top-level code)
- Error handling (no active editor, no language server, provider crash)
- Performance validation (<100ms overhead)
- Backward compatibility (existing tools work unchanged)

**Testing Approach**:
1. **Unit-style tests** using InMemoryTransport (fast, isolated):
   - Response structure validation
   - Symbol detection logic
   - Error handling paths
2. **Integration tests** with real Extension Host (comprehensive):
   - Full editor context enrichment workflow
   - Multi-language support validation
   - Real-world debugging scenarios

**Test Location**: `test-cli/integration-mcp/editor-context.test.ts` (following `search-symbol-search.test.ts` pattern)

**Mock Usage**: Minimal mocking - use real VS Code APIs via Extension Host for authentic validation

**Excluded from Testing**:
- Signature extraction (not implemented in this phase)
- Multiple cursor scenarios (deferred)
- Historical context tracking (not in scope)

## Documentation Strategy

**Location**: Hybrid (README.md + docs/how/)

**Rationale**: Feature impacts both quick-start users (who need to know context is auto-included) and developers building integrations (who need detailed schema documentation).

**Content Split**:
- **README.md**: Brief mention in "Features" section that responses include auto-context, link to detailed docs
- **docs/how/**: Comprehensive guide covering:
  - Response envelope schema with editorContext field
  - What context data is included and when
  - How to use standalone `editor.get-context` tool
  - Examples of context-aware LLM workflows
  - Performance characteristics and limitations

**Target Audience**:
- LLM developers building on top of vsc-bridge MCP server
- Users debugging why responses include editor state
- Contributors extending context enrichment

**Maintenance**: Update when editorContext schema changes or new context fields added

## Clarifications

### Session 2025-10-20

**Q1: Testing Strategy**
**Answer**: Implement-first with integration testing validation (Hybrid approach)
**Rationale**: Follow project's existing integration test framework using Vitest with InMemoryTransport for fast tests and real Extension Host for E2E validation. No heavy TDD or mocking; validate with real VS Code APIs.

**Q2: Documentation Strategy**
**Answer**: Hybrid (README.md + docs/how/)
**Rationale**: Quick-start users need awareness that context is auto-included. Integration developers need detailed schema documentation and usage examples.

**Q3: Context Enrichment Opt-Out**
**Answer**: C - Auto-exclude system tools
**Rationale**: Smart defaults - exclude context for meta-tools like `bridge_status`, `mcp_list_tools`, `diagnostic_collect` that don't benefit from editor state. All user-facing debugging/editing tools get context automatically.
**Impact**: Reduces payload size for system queries while keeping context where it's valuable.

**Q4: Standalone Tool Return Format**
**Answer**: A - Empty object `{}`
**Rationale**: Clean separation of concerns. The tool is just a trigger; actual context lives in envelope's `editorContext` field. Consistent with design where context is envelope-level metadata, not tool-specific data.
**Implementation**: `editor.get-context` script returns `{}`, wrapper adds context to envelope.

**Q5: File Dirty State**
**Answer**: A - Yes, include `isDirty` boolean
**Rationale**: Useful for LLMs to know if file has unsaved changes before suggesting operations. Simple boolean flag from `document.isDirty`, no change counting needed initially.
**Schema Addition**: `file.isDirty: boolean` in editorContext

**Q6: Signature Extraction**
**Answer**: B - Defer to later
**Rationale**: Simplifies initial implementation. Symbol names and kinds provide sufficient context for v1. Signature parsing adds complexity without clear MVP requirement.
**Future Enhancement**: Can add in v2 if LLM feedback indicates need.

**Q7: Performance Caching**
**Answer**: A - No caching
**Rationale**: Research showed 50ms average fetch time - well under 100ms budget without caching. Ship simple implementation first, optimize only if real-world performance issues arise.
**Monitoring**: Track actual overhead in production; add caching if needed.

## Open Questions Resolved

All high-impact questions resolved during clarification session.

### Deferred to Future Enhancement (Not Blocking MVP)
- **Recently opened files list**: Just active editor for v1, workspace awareness in v2 if needed
- **Multi-line selection breakdown**: Single string format sufficient for MVP
- **Context updates for long operations**: Snapshot approach (captured at invocation) for v1
- **Workspace folder context**: Active editor only for MVP

### Moved to Non-Goals
- **Method signature extraction**: Explicitly deferred to future enhancement (confirmed in Q6)
- **Symbol tree caching**: Not needed for MVP - 50ms fetch meets performance target (confirmed in Q7)

---

## Next Steps

1. **Run `/plan-2-clarify`** to resolve open questions (≤8 high-impact questions)
2. **Capture clarifications** in spec and update as needed
3. **Proceed to `/plan-3-architect`** for technical design once requirements are stable
