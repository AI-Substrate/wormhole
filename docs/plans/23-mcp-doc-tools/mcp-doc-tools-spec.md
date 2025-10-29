# MCP Documentation Tools

**Feature Slug**: `mcp-doc-tools`
**Ordinal**: 23
**Created**: 2025-10-24
**Status**: SPECIFICATION

---

## Summary

Enable AI agents using VSC-Bridge MCP tools to discover and access comprehensive usage documentation through the standard MCP tool interface. Documentation is authored as markdown files with structured metadata and automatically exposed as callable tools, allowing agents to request guidance on debugging workflows, best practices, and tool usage patterns without requiring external documentation sources.

**What**: Documentation files are transformed into callable MCP tools that return guidance content when invoked.

**Why**: AI agents need contextual help to use VSC-Bridge effectively. By exposing documentation through the tool interface, agents can self-serve guidance at the moment they need it, improving debugging success rates and reducing trial-and-error.

---

## Goals

- **Self-Service Guidance**: AI agents can discover available documentation through standard tool listing and request guidance when needed
- **Seamless Integration**: Documentation tools appear alongside functional tools in the tool catalog with clear naming conventions
- **Easy Authoring**: Documentation authors can create new guides by writing markdown files with minimal structured metadata
- **Zero-Friction Distribution**: Documentation is automatically packaged and distributed with the MCP server, requiring no separate installation or configuration
- **Consistent Experience**: Documentation tools follow the same invocation patterns as functional tools, maintaining a unified agent experience

---

## Non-Goals

**Version 1 Explicitly Excludes**:

- **Interactive Tutorials**: No step-by-step wizards or multi-turn conversational guidance
- **Parameterized Content**: Documentation tools return full content; section filtering or targeted retrieval is out of scope
- **Version Tracking**: No version comparison, change tracking, or update notifications for documentation
- **Multi-Language Support**: English-only documentation in initial release
- **Rich Media**: No embedded images, videos, or interactive diagrams (markdown text only)
- **Search Functionality**: No cross-document search or semantic retrieval; agents receive full document content
- **Dynamic Updates**: Documentation is fixed at server start; no runtime updates or hot-reloading

---

## Acceptance Criteria

**AC1: Documentation Discoverability**
- When an agent lists available tools, documentation tools appear with a consistent naming prefix
- Documentation tool descriptions clearly indicate they provide guidance (not functional operations)
- Agents can distinguish documentation tools from functional tools by naming convention alone

**AC2: Documentation Accessibility**
- When an agent invokes a documentation tool, the tool returns the complete guide content
- Returned content does not include metadata or formatting artifacts from the source file
- Content is readable markdown that agents can parse and use for decision-making

**AC3: Authoring Simplicity**
- A documentation author can create a new guide by writing a markdown file with a standard metadata header
- Required metadata fields are minimal (tool name and description only)
- Authors receive clear error messages if metadata is invalid or incomplete

**AC4: Automatic Packaging**
- When the MCP server is built, documentation files are automatically included in the distribution
- No manual steps are required to package documentation with the server
- Missing or invalid documentation files do not prevent server startup

**AC5: First Guide Available**
- The debugging guide (`docs_debugging_guide`) is available immediately after implementation
- Invoking `docs_debugging_guide` returns the comprehensive debugging workflow documentation
- Content includes the 5-step debug pattern, tool selection guidance, and language-specific syntax

**AC6: Error Resilience**
- If a documentation file has invalid metadata, the server starts successfully and logs a warning
- Other valid documentation tools remain available when one file fails to load
- Agents receive actionable error messages when attempting to invoke failed documentation tools

---

## Testing Strategy

**Approach**: TAD (Test-Assisted Development)

**Rationale**: This feature has clear contracts (YAML parsing, tool generation, MCP response format) that benefit from test-as-documentation. The parser and validator logic needs thorough testing with edge cases, while tests double as executable examples showing valid front matter formats and expected tool structures.

**Focus Areas**:
- **Front matter parsing**: Valid YAML, invalid YAML, missing required fields, malformed markdown
- **Validation logic**: Required field checking, type validation, default value application
- **Tool generation**: Correct McpTool structure, annotations, metadata mapping
- **Integration**: Doc tools appear in `tools/list`, content returned correctly via `tools/call`
- **Error resilience**: Server starts with invalid docs, warnings logged, graceful degradation

**Excluded from Testing**:
- Build script execution (manual verification sufficient)
- Documentation content quality (authoring concern, not infrastructure)
- Performance benchmarks (doc loading is I/O bound, not computationally complex)

**Mock Usage**: Avoid mocks entirely

Use real fixtures (markdown files with front matter) and real implementations. This feature's logic is deterministic (parsing, validation, transformation) with no external dependencies requiring mocking. Test files in `test-cli/fixtures/mcp-docs/` provide realistic test data.

**Documentation Strategy**:
- **Location**: `docs/how/` only (no README changes)
- **Target Audience**: Documentation authors adding new MCP guide tools
- **Content**: Comprehensive guide covering front matter schema, validation rules, build process, testing fixtures
- **Maintenance**: Update when schema or build process changes; include examples of valid/invalid front matter

**TAD-Specific Guidelines**:
- **Scratch→Promote Workflow**: Write initial tests in `scratch/`, promote to `test-cli/` when stable
- **Test Doc Comment Blocks**: All test files must include:
  ```typescript
  /**
   * TEST DOCUMENTATION
   *
   * What: [Brief description of what this test validates]
   * Why: [Why this behavior matters / what could break]
   * How: [Key testing approach or edge cases covered]
   */
  ```
- **Promotion Heuristic** - Promote when test meets ANY:
  - **Critical**: Validates core contract (parsing, validation, tool generation)
  - **Opaque**: Behavior not obvious from code (YAML edge cases, default handling)
  - **Regression**: Prevents known failure mode (invalid metadata crashing server)
  - **Edge**: Covers important edge case (empty docs dir, all docs invalid)

---

## Risks & Assumptions

### Risks

**R1: Documentation Size Impact on LLM Context**
- **Risk**: Large documentation files may consume significant LLM context window when invoked
- **Impact**: Medium - Could limit agent's ability to process results alongside other information
- **Mitigation**: **No enforced size limits in v1**. Trust documentation authors to keep content focused and reasonable. If context issues emerge in practice, can add soft warnings in v2. Existing HOW-TO-DEBUG.md (~10KB) is well within acceptable range.

**R2: Metadata Format Fragility**
- **Risk**: Authors may write invalid YAML front matter, causing parsing failures
- **Impact**: Medium - Individual docs fail to load but don't block server
- **Mitigation**: **Fail-fast validation** - Reject invalid docs immediately during load with detailed error messages. Required fields (`tool_name`, `description`) must be present and valid. Server logs errors clearly and continues startup with valid docs only.

**R3: Documentation Maintenance Burden**
- **Risk**: Documentation may become outdated as features evolve
- **Impact**: Medium - Stale guidance misleads agents, reducing trust
- **Mitigation**: **No explicit version tagging in v1**. Documentation is bundled with server during build, so docs are implicitly versioned with the package. Update docs when features change as part of normal development workflow. Can add version tracking in v2 if staleness becomes a problem.

**R4: Tool Namespace Collision**
- **Risk**: Future functional tools might conflict with `docs_*` naming convention
- **Impact**: Low - Unlikely given explicit prefix, but could cause confusion
- **Mitigation**: Document reserved `docs_*` prefix clearly; enforce at code level

### Assumptions

**A1: Single Language Sufficiency**
- Assumption: English documentation is sufficient for initial adoption
- Validation: Monitor user requests for multi-language support

**A2: Full-Document Retrieval Acceptable**
- Assumption: Agents can handle full document content and extract relevant sections themselves
- Validation: Monitor feedback on documentation tool usage patterns

**A3: Static Content Model**
- Assumption: Documentation doesn't need to update while server is running
- Validation: Server restart for doc updates is acceptable in v1

**A4: Build-Time Packaging Viable**
- Assumption: Documentation can be packaged during build without dynamic loading
- Validation: npm package includes docs correctly; distribution works in all environments

---

## Open Questions

**Q1: Document Size Limits**
- Should we enforce maximum file size for documentation (e.g., 50KB, 100KB)?
- Should we truncate large documents or reject them during loading?
- How do we communicate size limits to authors?

**Q2: Metadata Validation Strictness**
- Should we fail fast (reject invalid docs) or fail gracefully (warn and skip)?
- What's the minimum viable metadata set (tool name + description only, or more)?
- Should we validate metadata schema at build time or runtime?

**Q3: Documentation Organization**
- Should documentation files be organized by category in subdirectories?
- How do we handle naming conflicts if multiple docs want the same tool name?
- Should we support hierarchical documentation (e.g., `docs_debug_breakpoints_guide`)?

**Q4: Tool Response Format** ✅ RESOLVED
- ✅ Return markdown text in `content` field (primary agent-readable format)
- ✅ Use standard MCP response structure (`content` array with text type)
- ✅ Metadata (tool name, type) can be in optional `structuredContent` envelope if beneficial

**Q5: Future Parameterization Strategy**
- If we add parameters in v2 (e.g., section filtering), how do we maintain backward compatibility?
- Should we design the metadata schema now to support future parameters?
- What parameter patterns would be most valuable (sections, topics, keywords)?

---

## Success Metrics

- ✅ `docs_debugging_guide` tool appears in MCP tool listings
- ✅ Invoking `docs_debugging_guide` returns complete HOW-TO-DEBUG.md content
- ✅ New documentation can be added by creating a markdown file and running build
- ✅ Server starts successfully even with missing or invalid documentation files
- ✅ No performance degradation on server startup (documentation loading is fast)

---

## Clarifications

### Session 2025-10-24

**Q1: What testing approach best fits this feature's complexity and risk profile?**
- **Answer**: TAD (Test-Assisted Development)
- **Rationale**: Feature has clear contracts (YAML parsing, tool generation) that benefit from tests-as-documentation. Parser and validator logic needs thorough testing with edge cases, while tests serve as executable examples of valid front matter formats.
- **Impact**: Added `## Testing Strategy` section with TAD-specific guidelines (scratch→promote workflow, test doc blocks, promotion heuristic).

### Session 2025-10-25

**Q8: What testing approach should guide implementation of phases 1-6?**
- **Answer**: TAD (Test-Assisted Development) with single integration test
- **Rationale**: Follow spec's TAD approach for unit tests (parser, validator, tool generator) using scratch→promote workflow. Add ONE integration test to existing `just test-integration` suite to validate end-to-end: (1) MCP tool appears in `tools/list`, (2) `tools/call` returns correct documentation content.
- **Impact**:
  - **Unit tests**: Use TAD workflow for parser/validator logic (scratch → test-cli promotion)
  - **Integration test**: Single test in existing integration suite validates MCP protocol integration
  - **Fixtures**: Leverage existing `test-cli/fixtures/mcp-docs/` for both unit and integration tests
  - **Test scope**: Unit tests cover parsing/validation edge cases; integration test covers E2E happy path only

**Q9: Type system and validation strategy for YAML front matter schema?**
- **Answer**: A - Zod schemas only (with TypeScript type inference)
- **Rationale**: VSC-Bridge uses Zod-first pattern throughout (see `vsc-scripts/generated/schemas.ts`). All scripts define Zod schemas and infer TypeScript types using `z.infer<>`. This provides single source of truth for validation + types, consistent with existing codebase patterns.
- **Impact**:
  - **Phase 1**: Define Zod schema for front matter fields (`tool_name`, `description`, `category`, `tags`, `timeout`)
  - **Phase 2**: Use Zod's `safeParse()` for YAML validation with structured error messages
  - **Type inference**: Extract TypeScript types from Zod schema (no manual interface definitions)
  - **Pattern consistency**: Matches existing `ScriptMetadataSchema` and `scriptSchemas` patterns
  - **Error handling**: Leverage existing Zod error formatting in response envelopes

**Q10: Which YAML parsing library for front matter extraction?**
- **Answer**: Use existing `yaml` package (v2.8.1, eemeli/yaml)
- **Rationale**: Already installed as dependency in `packages/extension/package.json`. Safe by default (`yaml.parse()` doesn't execute code). Modern TypeScript-native library with excellent error messages. Codebase also has `gray-matter` (v4.0.3) for front matter extraction which could simplify parsing.
- **Impact**:
  - **Phase 2**: Use `yaml.parse()` for safe YAML parsing or `gray-matter` for combined front matter extraction + content splitting
  - **Security**: `yaml.parse()` is safe by default (no arbitrary code execution risk)
  - **Error messages**: TypeScript-native library provides structured errors matching Zod validation pattern
  - **No new dependencies**: Leverage existing packages already in package.json

**Q2: How should mocks/stubs/fakes be used during implementation?**
- **Answer**: Avoid mocks entirely
- **Rationale**: Feature logic is deterministic (parsing, validation, transformation) with no external dependencies. Real markdown fixtures provide realistic test data without complexity of mocking.
- **Impact**: Updated `## Testing Strategy` to specify use of real fixtures in `test-cli/fixtures/mcp-docs/`.

**Q3: Where should this feature's documentation live?**
- **Answer**: `docs/how/` only
- **Rationale**: This is infrastructure for doc authors, requiring comprehensive guide on front matter schema, validation rules, and build process. Too detailed for README.
- **Impact**: Added documentation strategy to `## Testing Strategy` section. Will create `docs/how/authoring-mcp-doc-tools.md` during implementation.

**Q4: How should invalid documentation metadata be handled?**
- **Answer**: Fail fast (reject invalid docs)
- **Rationale**: Strict validation ensures quality and prevents runtime surprises. Invalid docs rejected during load with clear error messages; server continues with valid docs only.
- **Impact**: Updated R2 mitigation to specify fail-fast validation. Required fields (`tool_name`, `description`) must be present. Invalid YAML or missing required fields cause doc to be skipped with logged error, but server starts successfully.

**Q5: Should we enforce maximum file size limits for documentation files?**
- **Answer**: No limits
- **Rationale**: Trust authors to keep docs focused and reasonable. Simplifies implementation. Existing HOW-TO-DEBUG.md (~10KB) is well within acceptable range for LLM context.
- **Impact**: Updated R1 mitigation. No size enforcement in v1; can add soft warnings in v2 if needed.

**Q6: Should documentation be version-tagged to match server releases?**
- **Answer**: No versioning
- **Rationale**: Documentation is bundled with server during build, so implicitly versioned with package. Explicit versioning adds complexity without clear v1 benefit.
- **Impact**: Updated R3 mitigation. Docs updated as part of feature development workflow; can add version tracking in v2 if needed.

**Q7: What format should documentation tools return?**
- **Answer**: Markdown text only
- **Rationale**: Keep response simple - return markdown content in `content` field. Agents can parse markdown if needed. Avoids complexity of HTML rendering or structured formats.
- **Impact**: Updated Q4 in Open Questions. Response uses standard MCP `content` array with text type. Optional `structuredContent` envelope for metadata (tool name, type) is acceptable but content itself is markdown.

### Coverage Summary

| Category | Status | Notes |
|----------|--------|-------|
| **Testing Strategy** | ✅ Resolved | TAD with scratch→promote workflow, no mocks, real fixtures |
| **Documentation Strategy** | ✅ Resolved | `docs/how/authoring-mcp-doc-tools.md` for author guide |
| **Validation Strictness** | ✅ Resolved | Fail-fast: reject invalid docs, log errors, continue server startup |
| **Size Limits** | ✅ Resolved | No limits in v1; trust authors to keep docs reasonable |
| **Version Tagging** | ✅ Resolved | No explicit versioning; docs bundled with server package |
| **Response Format** | ✅ Resolved | Markdown text in `content` field, optional `structuredContent` envelope |
| **Documentation Org** | ⏸️ Deferred | Q3: Low priority for v1 (only 1 doc); revisit when adding more docs |
| **Future Params** | ⏸️ Deferred | Q5: Out of scope for v1; design when needed in v2 |

**High-Impact Questions Resolved**: 10/10 (100%)
**Low-Impact Questions Deferred**: 2 (Q3, Q5) - Can be addressed in future iterations

**Implementation Decisions Confirmed**:
- ✅ **Testing**: TAD with scratch→promote workflow + single integration test
- ✅ **Type System**: Zod schemas with TypeScript inference (matches existing pattern)
- ✅ **YAML Parser**: Use existing `yaml` package (v2.8.1) + optional `gray-matter` for front matter

**Ready for Phase Planning**: ✅ All critical ambiguities resolved. Ready for `/plan-5-phase-tasks-and-brief` to generate detailed phase task breakdowns.

---

## Notes

- This specification focuses on **infrastructure** for exposing documentation as tools
- The quality and comprehensiveness of individual guides is a separate content authoring concern
- All implementation choices (YAML vs JSON front matter, file locations, parser libraries) are deferred to the plan phase
- Tool naming convention (`docs_*` prefix) is established to avoid namespace pollution

---

**Next Step**: Run `/plan-2-clarify` to resolve open questions (Q1-Q5) and clarify risks (R1, R3) before creating implementation plan.
