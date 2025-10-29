# Phase 6: Documentation Authoring Guide

**Project**: MCP Documentation Tools
**Plan**: [mcp-doc-tools-plan.md](../../mcp-doc-tools-plan.md)
**Spec**: [SPEC-MCP-Doc-Tools.md](../../SPEC-MCP-Doc-Tools.md)
**Phase Slug**: `phase-6-documentation-authoring-guide`
**Date Created**: 2025-10-27
**Status**: PENDING

---

## Tasks

| Status | ID | Task | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|----|----|------|--------------|------------------|------------|----------|-------|
| [x] | T001 | Create authoring guide file structure | Setup | – | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | File exists with complete markdown headings structure | – | Completed with full content (T002-T018 consolidated) · log#t001-create-authoring-guide-file-structure [^9] |
| [ ] | T002 | Write Overview section | Doc | T001 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Explains what unified docs system is, when to create docs, agent discovery workflow | – | Concise (2-3 paragraphs), links to Phase 5 deliverables |
| [ ] | T003 | Write Unified Docs API section | Doc | T001 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Documents docs_list (catalog) and docs_get (retrieval) patterns with examples | – | Include curl/MCP client examples; explain why better than per-doc tools |
| [ ] | T004 | Create Front Matter Schema Reference table | Doc | T001 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Table with columns: Field, Type, Required/Optional, Constraints, Description | – | Source from `/workspaces/wormhole/src/lib/mcp/doc-tools/types.ts` DocFrontMatterSchema; include all enrichment fields |
| [ ] | T005 | Document required fields (tool_name, summary, description) | Doc | T004 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Explains each required field with constraints and examples | – | summary is REQUIRED (breaking change in Phase 5); tool_name regex `^docs_[a-z0-9_]+$`; description 10-500 chars |
| [ ] | T006 | Document optional metadata fields (category, tags) | Doc | T004 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Explains category and tags with filtering examples | – | Show how agents use category/tags in docs_list filtering |
| [ ] | T007 | Document enrichment fields (agentHelp, examples, outputSchema) | Doc | T004 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Explains ALL enrichment fields with full structure and examples | – | agentHelp has 6 sub-fields (whenToUse, whatToDoNext, useCases, paramsNotes, limits, fallbacks); examples array structure; outputSchema JSON Schema |
| [ ] | T008 | Write File Naming Convention section | Doc | T001 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Documents kebab-case → snake_case transformation with examples | – | debugging-guide.md → docs_debugging_guide; explain `docs_` prefix requirement |
| [ ] | T009 | Write Step-by-Step Workflow section (<10 steps) | Doc | T001, T008 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Numbered workflow from create file to commit, <10 steps | – | Must reference actual paths: `docs/mcp-prompts/*.md` (source), `src/lib/mcp/docs/` (intermediate), `dist/lib/mcp/docs/` (final) |
| [ ] | T010 | Write Build Process section | Doc | T001 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Documents `just build-docs`, `npm run copy-mcp-docs`, verification steps | – | Reference justfile lines 48-54; explain source → intermediate → dist flow |
| [ ] | T011 | Create Validation Errors and Solutions section | Doc | T001 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Lists ALL error codes with recovery hints | – | Must include: E_INVALID_DOC_YAML, E_MISSING_FRONT_MATTER, E_MISSING_DOC_FIELD (Phase 2 errors), Zod validation errors (Phase 1), DocNotFoundError, InvalidDocIdError (Phase 5) |
| [ ] | T012 | Write minimal valid template (no enrichment) | Doc | T001, T005 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | YAML code block with tool_name, summary, description only | – | Must be copy-pasteable and syntactically correct |
| [ ] | T013 | Write typical valid template (with enrichment) | Doc | T001, T005, T006, T007 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | YAML code block with all common fields including agentHelp | – | Include category, tags, agentHelp with 2-3 sub-fields; must be copy-pasteable |
| [ ] | T014 | Write maximal valid template (all fields) | Doc | T001, T005, T006, T007 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | YAML code block with ALL possible fields | – | Include agentHelp (all 6 sub-fields), examples array, outputSchema; must be copy-pasteable |
| [ ] | T015 | Write invalid example: missing summary | Doc | T001, T005 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | YAML code block + explanation of Zod validation error | – | Show exact error message: "Required"; explain summary is REQUIRED (Phase 5 breaking change) |
| [ ] | T016 | Write invalid example: wrong prefix | Doc | T001, T005 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | YAML code block + explanation of validation error | – | tool_name without `docs_` prefix; show validation error; explain fix |
| [ ] | T017 | Write invalid example: summary too short | Doc | T001, T005 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | YAML code block + explanation of length constraint | – | summary with <10 chars; show Zod error "Summary too short"; explain 10-200 char constraint |
| [ ] | T018 | Write Testing Approach section | Doc | T001 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Documents how to verify doc via docs_list and docs_get | – | Include MCP client examples (curl or Inspector); explain ID normalization (hyphens → underscores) |
| [ ] | T019 | Add visual diagrams (optional but recommended) | Doc | T001, T009, T010 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Mermaid diagram showing workflow or build process | – | [P] Can be done in parallel with other doc sections; adds visual clarity |
| [x] | T020 | Verify all examples are syntactically correct | Validation | T012, T013, T014, T015, T016, T017 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Copy-paste each example into temp file, parse with DocFrontMatterSchema, verify expected outcome | – | Completed with validation scripts (T020-T023 consolidated) · log#t020-validate-examples-and-cross-references [^10] |
| [ ] | T021 | Cross-reference all error codes with Phase 1-2 tests | Validation | T011 | `/workspaces/wormhole/test-cli/lib/mcp/doc-tools/validator.test.ts`, `/workspaces/wormhole/test-cli/lib/mcp/doc-tools/parser.test.ts` | All error codes mentioned in troubleshooting section exist in tests | – | Grep test files for error codes; ensure complete coverage |
| [ ] | T022 | Validate schema constraints match types.ts | Validation | T004, T005, T006, T007 | `/workspaces/wormhole/src/lib/mcp/doc-tools/types.ts` | All field constraints in guide match DocFrontMatterSchema definition | – | Check min/max lengths, regex patterns, required vs optional |
| [ ] | T023 | Verify build process commands are accurate | Validation | T010 | `/workspaces/wormhole/justfile`, `/workspaces/wormhole/package.json` | All npm scripts and justfile targets exist and are correct | – | Test `just build-docs` actually works; verify paths in guide match reality |
| [ ] | T024 | Proofread guide for clarity and grammar | Validation | T001-T018 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | No typos, clear language, consistent terminology | – | Check for: consistent naming (docs_list vs docs-list), correct paths, clear instructions |
| [ ] | T025 | Create example doc using guide (dogfooding) | Integration | T001-T018 | `/workspaces/wormhole/docs/mcp-prompts/docs_example_for_guide.md` | Successfully create new doc by following guide steps 1-10 | – | Creates real doc as proof guide works; delete afterward or keep as additional example |
| [ ] | T026 | Verify example doc appears in docs_list | Integration | T025 | MCP client (Claude Desktop or Inspector) | Call docs_list, verify new doc in catalog with correct summary | – | Validates end-to-end workflow from guide |
| [ ] | T027 | Verify example doc retrievable via docs_get | Integration | T025, T026 | MCP client (Claude Desktop or Inspector) | Call docs_get with ID, verify full content returned | – | Validates retrieval step in guide |
| [ ] | T028 | Manual review by another developer (user acceptance test) | Validation | T001-T027 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | Another developer successfully follows guide to add doc | – | Ultimate validation - guide must be clear enough for external user |
| [ ] | T029 | Address manual review feedback | Doc | T028 | `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md` | All feedback items incorporated, guide updated | – | May add missing steps, clarify confusing sections, add more examples |
| [ ] | T030 | Final validation: Acceptance criteria checklist | Validation | T001-T029 | All Phase 6 deliverables | All 9 acceptance criteria (AC1-AC9) from plan met | – | Final gate before marking phase complete |

**Phase Progress**: 0/30 tasks complete (0%)

---

## Alignment Brief

### Prior Phases Review: Cross-Phase Synthesis

This section synthesizes the complete implementation landscape from Phases 1-5, providing essential context for Phase 6 documentation authoring.

#### Phase 1: Type Definitions and Interfaces (Foundation Layer)

**What was built**:
- **`/workspaces/wormhole/src/lib/mcp/doc-tools/types.ts`** (183 lines): Core type system with Zod schemas
  - `DocFrontMatterSchema`: Required fields (tool_name, description, **summary**), optional fields (category, tags, title), enrichment fields (agentHelp, examples, outputSchema)
  - Type-first pattern: All interfaces defined before implementation to prevent circular dependencies
  - `z.infer<typeof DocFrontMatterSchema>` for automatic TypeScript type derivation
- **`/workspaces/wormhole/src/lib/mcp/doc-tools/validator.ts`** (70 lines): Dual validation (Zod schema + filename matching)
- **12 comprehensive tests** in `validator.test.ts` (Critical Contracts, Edge Cases, Additional Coverage)

**Key architectural patterns established**:
- **Type-first design**: Interfaces before implementation (Discovery 02)
- **Zod-first validation**: Schema as single source of truth
- **Lowercase normalization**: Cross-platform filename matching (macOS case-insensitive)
- **Extensible schema**: No `.strict()` mode allows future enrichment without breaking changes

**Critical discoveries**:
- ESM import paths require `.js` extension even for `.ts` source files
- Zod `safeParse()` provides structured error messages with field paths
- Optional fields default to `undefined` (not empty arrays/objects)

**Dependencies exported to later phases**:
- `DocFrontMatterSchema`, `validateFrontMatter()`, `DocEntry` interface
- Constraint enforcement: tool_name pattern `^docs_[a-z0-9_]+$`, description 10-500 chars, **summary 10-200 chars** (added in Phase 5)

#### Phase 2: YAML Parser and Front Matter Extraction (Safety Layer)

**What was built**:
- **`/workspaces/wormhole/src/lib/mcp/doc-tools/parser.ts`** (105 lines): Three-layer parsing pipeline
  - `extractFrontMatter()`: Regex-based extraction `^---\n([\s\S]*?)\n---\n([\s\S]*)$`
  - `parseYaml()`: YAML parsing with DEFAULT_SCHEMA (blocks `!!js/function`, `!!python/object` injection)
  - `parseDocument()`: Public API integrating extraction → parsing → validation
- **7 comprehensive tests** in `parser.test.ts` (Critical Contracts, Security, Edge Cases)
- Security test fixture: `docs_test_injection.md` with `!!python/object` payload (rejected)

**Key architectural patterns**:
- **Three-layer pipeline**: Separation of extraction, parsing, validation
- **Security-first**: YAML injection protection (Discovery 03 - CVE-2013-4660)
- **Structured error codes**: `E_MISSING_FRONT_MATTER`, `E_INVALID_DOC_YAML` with recovery hints

**Critical discoveries**:
- `js-yaml` v4.x defaults to DEFAULT_SCHEMA (safe, but not as strict as SAFE_SCHEMA)
- Regex anchoring (`^---`) prevents horizontal rules in content from being confused with front matter
- UTF-8 characters (emoji, international) preserved correctly

**Dependencies exported**:
- `parseDocument(markdown: string, filePath: string): DocEntry` - complete parsing pipeline

**Edge cases handled**:
- Horizontal rules in content don't trigger false matches
- Empty front matter throws helpful error with example
- Invalid YAML syntax includes original error message

#### Phase 3: Documentation Loader and Caching (Performance Layer)

**What was built**:
- **`/workspaces/wormhole/src/lib/mcp/doc-tools/loader.ts`** (95 lines): Singleton loader with private cache
  - `DocLoader` class with `load()`, `clearCache()` methods
  - `docLoader` singleton export for production use
  - ESM path resolution: `join(__dirname, '../docs')` for sibling directory
- **8 comprehensive tests** in `loader.test.ts` (Discovery, Caching, Error Resilience, Edge Cases)
- Performance baseline: **20ms for 7 files** (2200% under 500ms budget)

**Key architectural patterns**:
- **Singleton with lazy loading**: Private cache checked first, populated on first call
- **Error resilience**: Try-catch per file, log warnings, continue processing (graceful degradation)
- **Performance monitoring**: Warning logged if >500ms (operational visibility)
- **ESM `__dirname` workaround**: `fileURLToPath(import.meta.url)` + `dirname()` pattern

**Critical discoveries**:
- Docs directory is **sibling** to `doc-tools/` in dist/, not child (must use `../docs`)
- Linear search acceptable for <100 docs (YAGNI principle - 2200% performance headroom)
- Empty directory returns `[]` (no error), invalid docs logged but don't prevent server startup

**Dependencies exported**:
- `docLoader` singleton, `DocLoader` class, `DocEntry[]` array
- Contract: `load()` never throws for invalid docs (resilience)

**Patterns for Phase 6 guide**:
- Document `clearCache()` for testing isolation
- Explain error resilience: partial docs loaded if some invalid

#### Phase 4: MCP Server Integration - Per-Doc Tools (Deprecated Layer)

**What was built**:
- **`/workspaces/wormhole/src/lib/mcp/doc-tools/tool-generator.ts`** (54 lines): **DEPRECATED** - per-doc tool pattern
  - `generateDocTools(entries: DocEntry[]): McpTool[]` - creates N tools for N docs
- **Server integration** in `server.ts`: doc tool merge, `docContentMap` for O(1) lookup, handler before `findBridgeRoot()`
- **6 unit tests** in `tool-generator.test.ts` (Critical Contracts, Edge Cases)

**Key architectural patterns** (deprecated but informative):
- **Manifest-driven tool generation**: Transform array pattern from existing codebase
- **O(1) lookup optimization**: `Map(entries.map(e => [name, content]))` for fast retrieval
- **Conditional field assignment**: Only create `_meta` if optional fields present

**Why deprecated immediately after completion**:
- **Tool count bloat**: Each doc became separate MCP tool (hit 50-tool performance threshold)
- **Poor discoverability**: Agents must guess tool names (`docs_debugging_guide`)
- **Replaced by**: Phase 5 unified API (2 tools: `docs_list` + `docs_get`)

**Status**: ⚠️ **Technical debt** - `tool-generator.ts` NOT deleted despite plan (Phase 5 T023 incomplete), both systems coexist

**Lessons for Phase 6 guide**:
- **Do NOT document per-doc tool pattern** - it's deprecated
- Focus solely on unified API (docs_list + docs_get)
- Mention historical pattern only as "why unified API is better"

#### Phase 5: Unified Documentation System + Metadata Enrichment (Current Production Layer)

**What was built**:
- **`/workspaces/wormhole/src/lib/mcp/doc-tools/registry.ts`** (211 lines): Central document management
  - `DocRegistry` class with `getAllSummaries(filter?)`, `getDocById(id)` methods
  - ID normalization: "debugging-guide" ↔ "docs_debugging_guide" bidirectional mapping
  - Custom errors: `DocNotFoundError` (with available IDs), `InvalidDocIdError` (with format requirements)
- **`/workspaces/wormhole/src/lib/mcp/doc-tools/unified-tools.ts`** (179 lines): Tool generators
  - `createDocsListTool(registry)`: Catalog browsing with optional category/tags filters
  - `createDocsGetTool(registry)`: Document retrieval by ID
  - **Strong agent guidance**: "Call docs_list FIRST" to prevent guessing behavior
- **Extended schema** in `types.ts`:
  - **`summary` field: REQUIRED** (10-200 chars) - **BREAKING CHANGE**
  - `title` field: Optional (max 100 chars) for UI-friendly names
  - `agentHelp` object: Optional structured guidance with **ALL 6 sub-fields** (whenToUse, whatToDoNext, useCases, paramsNotes, limits, fallbacks)
  - `examples` array: Optional with `{input, output, description}` structure
  - `outputSchema` object: Optional JSON Schema for structured output docs
- **Handler fixes** in `server.ts`:
  - **ListToolsRequestSchema handler fix** (lines 186-200): Include `title`, `annotations`, `outputSchema` (was stripping all optional MCP fields) - **CRITICAL LINCHPIN**
  - `docs_list` handler (lines 195-208): Catalog with filtering
  - `docs_get` handler (lines 211-240): Retrieval with error handling
- **40 comprehensive tests** across 3 files:
  - `registry.test.ts` (12 tests): Critical contracts, ID normalization, error handling, edge cases
  - `unified-tools.test.ts` (13 tests): Tool structure, agent guidance quality
  - `schema-enrichment.test.ts` (15 tests): Required summary, optional title/agentHelp/examples/outputSchema

**Key architectural patterns**:
- **Unified API pattern**: 2 tools (catalog + fetch) vs N tools (per-doc pattern)
- **YAGNI principle**: O(N) linear search acceptable (2200% performance headroom from Phase 3)
- **Type-first + implementation-then-test**: Pragmatic approach when type system enforces correctness
- **Strong agent guidance**: Annotations shape behavior proactively (preventing mistakes > explaining mistakes)
- **ID normalization**: Support user-friendly IDs while maintaining internal consistency

**Critical discoveries**:
- **Annotations handler bug**: MCP SDK handler was stripping `title`, `annotations`, `outputSchema` - fixed in T003 (DE-RISK FIRST)
- **Breaking change execution incomplete**: T023 (delete old per-doc tools) NOT completed, causing coexistence debt
- **Enrichment migration incomplete**: `debugging-guide.md` has `summary` but lacks `title`, `agentHelp`, `examples`, `outputSchema` (T025 incomplete)

**Dependencies exported to Phase 6**:
- `DocRegistry`, `createDocsListTool`, `createDocsGetTool`
- `DocSummary`, `DocContent`, `DocMetadata`, `AgentHelp` types
- Error classes: `DocNotFoundError`, `InvalidDocIdError`
- **REQUIRED** frontmatter schema: `summary` field now mandatory

**Incomplete work requiring Phase 6 attention**:
- ❌ **Deprecated tool-generator.ts NOT deleted** (coexistence debt)
- ❌ **debugging-guide.md enrichment partial** (missing title, full agentHelp, examples, outputSchema)
- ❌ **Migration guide NOT created** (T027 incomplete)
- ❌ **Integration tests missing** (MCP protocol validation gap)

**Phase 6 must document**:
- Unified API as **THE** production pattern (not per-doc tools)
- **summary field is REQUIRED** (breaking change from Phases 1-4)
- All enrichment fields (agentHelp with 6 sub-fields, examples, outputSchema)
- ID normalization rules (kebab-case → snake_case with `docs_` prefix)
- Testing via docs_list (discovery) → docs_get (retrieval) workflow

#### Cumulative Deliverables Available to Phase 6

**Type System** (Phase 1):
- `/workspaces/wormhole/src/lib/mcp/doc-tools/types.ts` - Complete schema with enrichment

**Parsing & Validation** (Phases 1-2):
- `/workspaces/wormhole/src/lib/mcp/doc-tools/validator.ts` - Dual validation
- `/workspaces/wormhole/src/lib/mcp/doc-tools/parser.ts` - Three-layer pipeline with security

**Loading & Caching** (Phase 3):
- `/workspaces/wormhole/src/lib/mcp/doc-tools/loader.ts` - Singleton with performance monitoring

**Unified API** (Phase 5):
- `/workspaces/wormhole/src/lib/mcp/doc-tools/registry.ts` - DocRegistry with filtering
- `/workspaces/wormhole/src/lib/mcp/doc-tools/unified-tools.ts` - Tool generators
- `/workspaces/wormhole/src/lib/mcp/server.ts` - Handlers for docs_list/docs_get

**Test Infrastructure** (All phases):
- **73 tests total** across validator, parser, loader, tool-generator, registry, unified-tools, schema-enrichment
- Fixtures in `/workspaces/wormhole/test-cli/fixtures/mcp-docs/` (8 files)
- Patterns: Given-When-Then naming, Test Doc blocks (What/Why/How), no mocks

**Build System** (Phase 0 + updates):
- `just build-docs`: Copies `docs/mcp-prompts/*.md` → `src/lib/mcp/docs/` → `dist/lib/mcp/docs/`
- Source of truth: `/workspaces/wormhole/docs/mcp-prompts/` (edit here, NOT `src/lib/mcp/docs/`)

#### Pattern Evolution Across Phases

**Phase 1-2**: Simple validation → parsing pipeline (security-first)
**Phase 3**: Add caching + performance monitoring (resilience + speed)
**Phase 4**: Per-doc tool pattern (deprecated - tool count bloat)
**Phase 5**: **Unified API pattern** (production standard - catalog + fetch)

**Consistent patterns across all phases**:
- Type-first design (interfaces before implementation)
- Structured error codes with recovery hints
- TAD/implementation-then-test workflow with Test Doc blocks
- No mocks (real fixtures, real implementations)
- CLI boundary respect (no extension imports)

#### Recurring Technical Debt

**ESM import extensions**: `.js` imports for `.ts` source files cause IDE warnings (expected, no fix needed)
**Scratch tests abandoned**: Some phases lack execution logs (Phase 2 completely empty)
**Phase 5 incomplete tasks**: Deprecated tools not deleted, enrichment migration partial

#### Architectural Continuity for Phase 6

**Patterns to maintain**:
- Document the unified API (docs_list + docs_get) as THE production pattern
- Explain type-first validation with Zod schemas
- Show structured error codes with recovery hints
- Emphasize security (YAML injection protection)

**Anti-patterns to avoid**:
- **Do NOT document per-doc tool pattern** (Phase 4 deprecated)
- **Do NOT suggest creating N tools for N docs** (causes tool count bloat)
- **Do NOT skip summary field** (REQUIRED in Phase 5)

**Critical foundations to reference**:
- Phase 1 validator tests show all error scenarios
- Phase 2 parser tests show security edge cases
- Phase 5 schema-enrichment tests show all enrichment field structures

---

### Objective Recap

**Goal**: Create a comprehensive authoring guide (`/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md`) that enables future documentation authors to add new MCP documentation files successfully.

**Behavior checklist tied to acceptance criteria**:
- ✅ **AC1**: Guide explains unified docs API (docs_list catalog + docs_get retrieval) with examples
- ✅ **AC2**: Guide documents **summary field as REQUIRED** (breaking change), plus tool_name and description
- ✅ **AC3**: Guide documents ALL enrichment fields (agentHelp with 6 sub-fields, examples, outputSchema) with complete examples
- ✅ **AC4**: Guide shows Zod schema constraints (tool_name regex, lengths) in plain English
- ✅ **AC5**: Step-by-step workflow <10 steps from blank file to docs_list visibility
- ✅ **AC6**: Guide explains `just build-docs` and `npm run copy-mcp-docs` with verification steps
- ✅ **AC7**: Guide lists ALL validation error codes (E_INVALID_DOC_YAML, E_MISSING_FRONT_MATTER, Zod errors, DocNotFoundError, InvalidDocIdError) with recovery hints
- ✅ **AC8**: Guide provides 3 valid templates (minimal, typical with enrichment, maximal) + 3 invalid examples
- ✅ **AC9**: Guide explains docs_list discovery → docs_get retrieval testing workflow

---

### Non-Goals (Scope Boundaries)

❌ **NOT doing in Phase 6**:

**Code implementation**:
- No code changes to types.ts, parser.ts, loader.ts, or server.ts (Phase 5 complete)
- No new Zod schema fields (enrichment complete)
- No new MCP tools (docs_list + docs_get sufficient)

**Infrastructure work**:
- No new build scripts (copy-mcp-docs already exists in justfile)
- No CI/CD changes (Phase 5 tests cover validation)
- No performance optimizations (2200% headroom proven)

**Testing**:
- No new unit tests (73 tests already cover all scenarios)
- No integration tests (deferred from Phase 5, out of scope for documentation phase)

**Technical debt resolution**:
- NOT deleting deprecated `tool-generator.ts` (Phase 5 T023 - deferred to future maintenance)
- NOT completing debugging-guide.md enrichment (T025 - can use synthetic examples instead)
- NOT creating migration guide for deprecated per-doc tools (T027 - deferred)

**Advanced features**:
- No fuzzy ID matching for docs_get (YAGNI - error message with suggestions sufficient)
- No hot reloading for documentation updates (server restart acceptable per Assumption A4)
- No subdirectory support (flat `docs/mcp-prompts/` structure sufficient per Assumption A2)
- No internationalization (English-only per Assumption A5)

**Scope focus**: Phase 6 is **pure documentation** - writing the guide, providing examples, validating clarity. No code changes, no infrastructure work, no advanced features.

---

### Critical Findings Affecting This Phase

#### Discovery 02: Type-First Design ✅
**Impact on guide**: Document that types.ts must be read to understand schema constraints.
**Tasks affected**: T004 (schema reference table must match types.ts exactly)
**Validation**: T022 verifies all constraints in guide match DocFrontMatterSchema definition

#### Discovery 03: YAML Security (CVE-2013-4660) ✅
**Impact on guide**: Explain YAML injection protection in troubleshooting section.
**Tasks affected**: T011 (validation errors section includes security context)
**Reference**: Phase 2 security test (`docs_test_injection.md`) shows `!!python/object` rejection

#### Discovery 04: Architectural Boundary ✅
**Impact on guide**: Authors should know docs live in `src/lib/mcp/` (CLI side), not extension.
**Tasks affected**: T009 (step-by-step workflow uses CLI paths only)
**Validation**: No extension paths referenced in guide

#### Discovery 05: Build Process Integration ✅
**Impact on guide**: **CRITICAL** - Explain source → intermediate → dist flow.
**Tasks affected**: T010 (build process section), T009 (workflow step 5: `just build-docs`)
**Paths to document**:
- **Source**: `/workspaces/wormhole/docs/mcp-prompts/*.md` (edit here)
- **Intermediate**: `/workspaces/wormhole/src/lib/mcp/docs/` (build artifact, auto-generated)
- **Final**: `/workspaces/wormhole/dist/lib/mcp/docs/` (packaged, auto-generated)

**Justfile command** (lines 48-54):
```bash
just build-docs
# Copies docs/mcp-prompts/*.md → src/lib/mcp/docs/ → dist/lib/mcp/docs/
```

**Critical warning for guide**: Authors must edit `docs/mcp-prompts/*.md` (source), NOT `src/lib/mcp/docs/` (will be overwritten).

#### Discovery 06: Front Matter Type Validation ✅
**Impact on guide**: Explain Zod schema validation with field-specific error messages.
**Tasks affected**: T005-T007 (document field constraints), T011 (validation errors)
**Examples to include**:
- `tool_name: 12345` → "Expected string, received number"
- `summary: "short"` → "Summary too short (min 10 chars)"
- `description: "A".repeat(501)` → "String must contain at most 500 character(s)"

#### Discovery 07: Tool Name Collision Risk ✅
**Impact on guide**: Explain `docs_` prefix requirement and why it prevents collisions.
**Tasks affected**: T005 (tool_name field docs), T008 (file naming conventions), T016 (invalid example without prefix)
**Validation**: T016 shows error for `test_missing_prefix`

#### Phase 5 Discovery: ListToolsRequestSchema Handler Fix (Linchpin) ✅
**Impact on guide**: Authors can now use `title`, `annotations` - these ARE visible to AI agents.
**Tasks affected**: T007 (enrichment fields documentation)
**Before fix**: `title` and `outputSchema` invisible to MCP clients
**After fix**: Full MCP spec compliance - all optional fields visible

#### Phase 5 Discovery: Unified API Trades Discoverability for Scalability ✅
**Impact on guide**: **Explain WHY unified API exists** - tool count threshold, better UX.
**Tasks affected**: T003 (unified docs API section)
**Content**: Explain per-doc tools (`docs_debugging_guide`) → unified tools (`docs_list` + `docs_get`) transition; emphasize discoverability via catalog browsing

#### Phase 5 Breaking Change: summary Field Now REQUIRED ✅
**Impact on guide**: **CRITICAL** - Must be crystal clear summary is REQUIRED (not optional).
**Tasks affected**: T005 (required fields section), T015 (invalid example: missing summary)
**Validation**: T015 shows exact Zod error: "Required"
**Migration note**: Docs from Phases 0-4 broke when this was added - guide must prevent this for future authors

---

### Test Plan: Manual Review and Validation

**Approach**: Phase 6 is documentation-only, so testing focuses on **clarity, completeness, and usability** rather than code functionality.

**Named tests with rationale**:

1. **Copy-Paste Validation Test**
   - **What**: Copy each YAML example (T012-T017) into temp file, parse with DocFrontMatterSchema
   - **Why**: Ensures all examples are syntactically correct and produce expected outcomes
   - **Fixtures**: Create 6 temp files (`valid-minimal.md`, `valid-typical.md`, `valid-maximal.md`, `invalid-no-summary.md`, `invalid-wrong-prefix.md`, `invalid-short-summary.md`)
   - **Expected outputs**:
     - Valid examples: `safeParse()` returns `success: true`
     - Invalid examples: `safeParse()` returns `success: false` with documented error message
   - **Task**: T020

2. **Error Code Coverage Test**
   - **What**: Grep Phase 1-2 test files for all error codes, verify each has troubleshooting entry
   - **Why**: Ensures troubleshooting section is complete (no orphaned error codes)
   - **Fixtures**: `/workspaces/wormhole/test-cli/lib/mcp/doc-tools/validator.test.ts`, `parser.test.ts`, `registry.test.ts`
   - **Expected outputs**: Every error code (`E_INVALID_DOC_YAML`, `E_MISSING_FRONT_MATTER`, `DocNotFoundError`, `InvalidDocIdError`, Zod errors) has entry in T011 troubleshooting section
   - **Task**: T021

3. **Schema Constraint Verification Test**
   - **What**: Read types.ts DocFrontMatterSchema, verify every constraint mentioned in guide
   - **Why**: Prevents documentation drift (guide must match reality)
   - **Fixtures**: `/workspaces/wormhole/src/lib/mcp/doc-tools/types.ts` lines 14-95
   - **Expected outputs**: Table in T004 matches:
     - tool_name: `z.string().regex(/^docs_[a-z0-9_]+$/)`
     - summary: `z.string().min(10).max(200)` **REQUIRED**
     - description: `z.string().min(10).max(500)`
     - title: `z.string().max(100).optional()`
     - agentHelp: All 6 sub-fields documented
   - **Task**: T022

4. **Build Command Verification Test**
   - **What**: Execute `just build-docs`, verify paths in guide match actual behavior
   - **Why**: Ensures build process documentation is accurate
   - **Fixtures**: `/workspaces/wormhole/justfile` lines 48-54
   - **Expected outputs**:
     - Files copied from `docs/mcp-prompts/` to `src/lib/mcp/docs/`
     - Files copied from `src/lib/mcp/docs/` to `dist/lib/mcp/docs/`
     - All paths in guide (T010) match this flow
   - **Task**: T023

5. **Dogfooding Integration Test**
   - **What**: Create new doc (`docs_example_for_guide.md`) by following guide steps 1-10
   - **Why**: Proves guide workflow is complete and correct (ultimate validation)
   - **Fixtures**: Create `/workspaces/wormhole/docs/mcp-prompts/docs_example_for_guide.md` using minimal template from T012
   - **Expected outputs**:
     - Step 1-4: File created with valid frontmatter
     - Step 5: `just build-docs` succeeds
     - Step 6: `docs_list` includes new doc in catalog
     - Step 7: `docs_get({id: "example-for-guide"})` returns full content
   - **Tasks**: T025-T027

6. **User Acceptance Test (External Developer)**
   - **What**: Another developer (not author) follows guide to add doc
   - **Why**: Validates guide clarity for external audience (gold standard)
   - **Fixtures**: Fresh developer account or colleague
   - **Expected outputs**:
     - Developer successfully adds new doc without asking questions
     - Developer can verify doc appears in docs_list
     - Developer can retrieve doc via docs_get
   - **Tasks**: T028 (execution), T029 (feedback incorporation)

**Test execution environment**: Development devcontainer with access to:
- MCP server (vscb MCP tools)
- Build system (just, npm)
- Test fixtures (Phase 0-5 docs)

**Acceptance gate**: All 6 tests must pass + all 9 acceptance criteria met (T030) before marking phase complete.

---

### Step-by-Step Implementation Outline

**Mapped 1:1 to task IDs**:

**Setup** (T001):
1. Create `/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md`
2. Add complete markdown structure with 9 major sections

**Content Writing** (T002-T018):
3. Write Overview section (T002): What/When/How of unified docs system
4. Write Unified Docs API section (T003): docs_list + docs_get patterns with curl examples
5. Create Front Matter Schema Reference table (T004): Field | Type | Required | Constraints | Description
6. Document required fields (T005): tool_name (regex), summary (10-200 chars, **REQUIRED**), description (10-500 chars)
7. Document optional metadata (T006): category (filtering), tags (OR logic filtering)
8. Document enrichment fields (T007): agentHelp (ALL 6 sub-fields), examples, outputSchema
9. Write File Naming Convention section (T008): kebab-case → snake_case transformation
10. Write Step-by-Step Workflow (T009): <10 steps from create to commit
11. Write Build Process section (T010): Source → intermediate → dist flow with justfile commands
12. Create Troubleshooting section (T011): All error codes with recovery hints
13. Write minimal template (T012): YAML with tool_name, summary, description only
14. Write typical template (T013): YAML with category, tags, agentHelp (2-3 sub-fields)
15. Write maximal template (T014): YAML with ALL fields (agentHelp all 6 sub-fields, examples, outputSchema)
16. Write invalid example: missing summary (T015): Show Zod "Required" error
17. Write invalid example: wrong prefix (T016): Show validation error for missing `docs_`
18. Write invalid example: summary too short (T017): Show "Summary too short" error
19. Write Testing Approach section (T018): Verify via docs_list → docs_get workflow
20. Add visual diagrams (T019): Optional Mermaid flowchart for workflow/build

**Validation Phase** (T020-T024):
21. Copy-paste test: Parse all 6 examples (T020)
22. Error code coverage: Cross-reference Phase 1-2 tests (T021)
23. Schema constraint verification: Match types.ts (T022)
24. Build command verification: Test `just build-docs` (T023)
25. Proofread: Clarity, grammar, consistency (T024)

**Integration Phase** (T025-T027):
26. Dogfooding: Create example doc using guide (T025)
27. Verify in docs_list: New doc appears in catalog (T026)
28. Verify in docs_get: Retrieve full content (T027)

**User Acceptance** (T028-T029):
29. External developer test: Another dev follows guide (T028)
30. Incorporate feedback: Update guide based on UAT (T029)

**Final Gate** (T030):
31. Acceptance criteria checklist: Verify all 9 ACs met (T030)

---

### Commands to Run

**Setup (once)**:
```bash
# Navigate to docs/how directory
cd /workspaces/wormhole/docs/how

# Create guide file
touch authoring-mcp-doc-tools.md
```

**Content writing (iterative)**:
```bash
# Edit guide
code authoring-mcp-doc-tools.md

# Preview markdown (if extension installed)
# Cmd+Shift+V (VS Code)
```

**Validation (T020-T024)**:
```bash
# Test copy-paste examples
cd /workspaces/wormhole
node --loader tsx <<'EOF'
import { DocFrontMatterSchema } from './src/lib/mcp/doc-tools/types.js';
const yaml = require('js-yaml');

// Copy example from guide, test parsing
const example = `
tool_name: docs_example
summary: "Quick example for testing"
description: "Example documentation for testing"
`;

const result = DocFrontMatterSchema.safeParse(yaml.load(example));
console.log('Valid:', result.success);
if (!result.success) console.log('Errors:', result.error.issues);
EOF

# Verify error codes covered
grep -r "E_INVALID_DOC_YAML\|E_MISSING_FRONT_MATTER\|DocNotFoundError\|InvalidDocIdError" test-cli/lib/mcp/doc-tools/*.test.ts
# Compare against T011 troubleshooting section

# Verify schema constraints match types.ts
grep -A 50 "export const DocFrontMatterSchema" src/lib/mcp/doc-tools/types.ts
# Compare against T004 table

# Test build process
just build-docs
ls -la dist/lib/mcp/docs/  # Verify files copied
```

**Integration testing (T025-T027)**:
```bash
# Create example doc using guide
cd /workspaces/wormhole/docs/mcp-prompts
cat > docs_example_for_guide.md <<'EOF'
---
tool_name: docs_example_for_guide
summary: "Example doc created by following the authoring guide"
description: "This document was created by following the step-by-step workflow in authoring-mcp-doc-tools.md to validate the guide's completeness."
---

# Example Documentation

This is test content created to verify the authoring guide workflow.
EOF

# Build
just build-docs

# Start MCP server (in separate terminal)
npx @modelcontextprotocol/inspector

# Test docs_list (via Inspector)
# Call tools/call: docs_list
# Verify response includes "example-for-guide" in catalog

# Test docs_get (via Inspector)
# Call tools/call: docs_get with args {"id": "example-for-guide"}
# Verify response includes full content
```

**User acceptance test (T028)**:
```bash
# Provide guide to external developer
# Observe developer following steps without assistance
# Note any questions/confusion points for T029 feedback
```

**Final validation (T030)**:
```bash
# Checklist - verify all 9 acceptance criteria
grep -c "docs_list" docs/how/authoring-mcp-doc-tools.md  # AC1
grep -c "summary.*REQUIRED" docs/how/authoring-mcp-doc-tools.md  # AC2
grep -c "agentHelp" docs/how/authoring-mcp-doc-tools.md  # AC3
# ... continue for all 9 ACs
```

---

### Risks/Unknowns

#### R1: Documentation Drift (Schema Evolution)
**Severity**: Medium
**Description**: Guide may become outdated if schema changes in future phases.
**Mitigation**:
- Include version number in guide header: "Version: Phase 5 (2025-10-27)"
- Add maintenance note: "If schema changes, update this guide AND all examples"
- T022 validates guide matches current types.ts (snapshot in time)

**Trigger for update**: Any Zod schema change in types.ts

#### R2: Schema Complexity for Non-Developers
**Severity**: Medium
**Description**: Zod schema details (regex, min/max) may be too technical for documentation authors without dev background.
**Mitigation**:
- Provide plain English explanations alongside schema code in T004 table
- Focus on examples (T012-T017) over theory
- T005-T007 explain constraints in simple terms ("summary must be 10-200 characters")

**Validation**: T028 user acceptance test with non-dev audience (if available)

#### R3: Incomplete Error Code Coverage
**Severity**: Low
**Description**: Guide may miss edge cases or error codes not covered in Phase 1-5 tests.
**Mitigation**:
- T021 cross-references ALL error codes from test files
- T011 troubleshooting section includes every error from validator, parser, registry
- If new error found during dogfooding (T025), add to T011

**Trigger for concern**: T025 dogfooding reveals error not in T011

#### R4: Build Process Path Confusion
**Severity**: High
**Description**: Authors may edit `src/lib/mcp/docs/` (intermediate, auto-generated) instead of `docs/mcp-prompts/` (source).
**Mitigation**:
- **CRITICAL**: T010 build process section uses **bold warnings**
- T009 workflow step 1 explicitly states: "Create file in `docs/mcp-prompts/` (source)"
- Add visual diagram (T019) showing source → intermediate → dist flow

**Validation**: T025 dogfooding test edits source directory correctly

#### R5: External Developer Availability for UAT
**Severity**: Low
**Description**: May not have another developer available for T028 user acceptance test.
**Mitigation**:
- T025 dogfooding test provides 80% validation (guide author following own guide)
- If external dev unavailable, simulate by waiting 24 hours then re-reading guide "fresh"
- Phase 6 can complete without T028, but quality reduced

**Fallback**: Skip T028, rely on T025 dogfooding + T030 AC checklist

---

### Ready Check

Before starting implementation, verify:

- [ ] **Prior phases complete**: Phases 1-5 all marked COMPLETE in plan.md § 8
- [ ] **Phase 5 deliverables accessible**: DocRegistry, unified-tools, types.ts with enrichment all exist
- [ ] **Build system functional**: `just build-docs` command works, copies files correctly
- [ ] **MCP server operational**: Can call docs_list and docs_get via MCP Inspector or Claude Desktop
- [ ] **Test fixtures available**: Phase 0-5 fixtures in `test-cli/fixtures/mcp-docs/` for reference
- [ ] **Spec and plan reviewed**: Read SPEC-MCP-Doc-Tools.md and mcp-doc-tools-plan.md § 6
- [ ] **Critical findings understood**: Discoveries 02-07 and Phase 5 findings inform guide content
- [ ] **Acceptance criteria clear**: All 9 ACs (AC1-AC9) understood and achievable

**GO/NO-GO Decision**:
- **GO** if all checkboxes ticked
- **NO-GO** if Phase 5 incomplete (missing DocRegistry, unified-tools, or enrichment fields)

---

## Phase Footnote Stubs

This section is populated during `/plan-6-implement-phase` as implementation progresses. Each code change receives a footnote tag linking to specific file paths and line numbers.

### Phase 6 Footnotes

[^9]: **Task 6.1 (T001)** - Created comprehensive authoring guide
  - [`file:docs/how/authoring-mcp-doc-tools.md`](/workspaces/wormhole/docs/how/authoring-mcp-doc-tools.md) - Comprehensive guide (31KB) with 9 major sections covering unified docs API, schema reference, workflows, examples, and troubleshooting

[^10]: **Task 6.10 (T020-T023)** - Validation scripts for authoring guide
  - [`file:scratch/validate-authoring-guide-examples.ts`](scratch/validate-authoring-guide-examples.ts) - YAML example validation (6 examples: 3 valid, 3 invalid)
  - [`file:scratch/validate-error-codes-cross-ref.ts`](scratch/validate-error-codes-cross-ref.ts) - Error code cross-reference validation (4 error codes verified)
  - [`file:scratch/validate-schema-constraints.ts`](scratch/validate-schema-constraints.ts) - Schema constraints validation (9 fields verified)

---

## Evidence Artifacts

**Execution Log**: `/workspaces/wormhole/docs/plans/23-mcp-doc-tools/tasks/phase-6-documentation-authoring-guide/execution.log.md`
- Created by `/plan-6-implement-phase`
- Format: Markdown with timestamped entries per task
- Includes: Commands run, outputs, decisions, debugging steps, test results

**Dogfooding Example**: `/workspaces/wormhole/docs/mcp-prompts/docs_example_for_guide.md`
- Created during T025 integration test
- Demonstrates guide workflow end-to-end
- Can be kept as additional example or deleted after validation

**User Acceptance Test Notes** (if T028 executed):
- Inline in execution log under T028 section
- Format: Observer notes of developer experience
- Feedback items extracted for T029

---

## Directory Layout

```
docs/plans/23-mcp-doc-tools/
├── mcp-doc-tools-plan.md                       # Main plan with Phase 6 tasks 6.1-6.10
└── tasks/
    └── phase-6-documentation-authoring-guide/
        ├── tasks.md                             # This file (dossier)
        └── execution.log.md                     # Created by /plan-6
```

**Note**: `/plan-6-implement-phase` writes execution log directly into phase directory. No subdirectories needed for Phase 6 (documentation-only phase).

**Main deliverable location**:
```
docs/
└── how/
    └── authoring-mcp-doc-tools.md              # The guide (T001-T018)
```

**Dogfooding test artifact** (temporary):
```
docs/
└── mcp-prompts/
    └── docs_example_for_guide.md               # Created in T025, deleted after T030
```
