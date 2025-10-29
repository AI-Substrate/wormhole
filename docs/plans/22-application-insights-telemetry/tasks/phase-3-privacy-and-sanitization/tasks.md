# Phase 3: Privacy and Sanitization — Tasks & Alignment Brief

**Phase**: Phase 3: Privacy and Sanitization
**Slug**: `phase-3-privacy-and-sanitization`
**Date Created**: 2025-01-24
**Spec**: [application-insights-telemetry-spec.md](/workspaces/wormhole/docs/plans/22-application-insights-telemetry/application-insights-telemetry-spec.md)
**Plan**: [application-insights-telemetry-plan.md](/workspaces/wormhole/docs/plans/22-application-insights-telemetry/application-insights-telemetry-plan.md)
**Deep Research**: [Deep Research Output - PII Sanitization Best Practices](/workspaces/wormhole/docs/plans/22-application-insights-telemetry/deep-research.md)

---

## Tasks

| Status | ID | Task | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|----|----- |------|--------------|------------------|------------|----------|-------|
| [x] | T001 | Review existing privacy.ts implementation and current regex patterns | Setup | – | `/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.ts` | Understand current sanitizePath(), scrubPII(), sanitizeParams() implementations | – | Baseline understanding before enhancement. Completed in previous session. log#t001-review-existing-privacy-implementation |
| [x] | T002 | Enhance scrubPII() with comprehensive secret patterns from deep research | Core | T001 | `/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.ts` | Patterns added for: GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_), AWS keys (AKIA*/ASIA* prefixes + 40-char secrets), JWT (3-part base64url), UUID v4, IPv4, URL credentials, Windows/Unix user paths. **Critical**: Add path detection regex that captures `vscode-*://` URIs for integration with sanitizePath() (Insight #3) | – | Completed with T003-T004 as combined implementation. log#t002-t004-enhanced-privacy-utilities-implementation |
| [x] | T003 | Add recursive object handling to scrubPII() with SECRET_KEY_NAMES detection | Core | T002, T004 | `/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.ts` | Function handles objects/arrays recursively, redacts keys matching /password\|token\|secret\|auth/i, caps arrays at 50 items, strings at 2048 chars. **Critical**: Use overloaded signatures for backward compatibility (Insight #2) AND integrate sanitizePath() call for path handling (Insight #3) - paths detected by regex then passed to sanitizePath() for full treatment | – | Completed with T002, T004 as combined implementation. log#t002-t004-enhanced-privacy-utilities-implementation |
| [x] | T004 | Enhance sanitizePath() with remote URI handling (vscode-remote://, untitled) | Core | T001 | `/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.ts` | Remote URIs return `<remote:hash>/<hash>.ext`, untitled returns `<untitled>`, vscode-* schemes handled. **Critical**: Hash filename, preserve extension only (e.g., `ClientABC.ts` → `a7b3c2d1.ts`) to prevent PII leak via basenames | – | Completed with T002-T003 as combined implementation. log#t002-t004-enhanced-privacy-utilities-implementation |
| [x] | T005 | Verify ExtensionActivated event properties are PII-safe | Test | – | `/workspaces/wormhole/packages/extension/src/extension.ts` | Review properties: sessionId (UUID), vscodeVersion (safe), extensionVersion (safe), platform (safe), remoteName (safe) | – | ✅ Verified lines 38-45: All properties safe (UUIDs, version strings, platform names). No PII found. |
| [x] | T006 | Verify ExtensionDeactivated event properties are PII-safe | Test | – | `/workspaces/wormhole/packages/extension/src/extension.ts` | Confirm no properties, only sessionDuration measurement (safe) | – | ✅ Verified lines 317-321: Only telemetrySchemaVersion property + sessionDuration measurement. No PII found. |
| [x] | T007 | Add telemetrySchemaVersion property to lifecycle events | Core | T005, T006 | `/workspaces/wormhole/packages/extension/src/extension.ts` | Both ExtensionActivated and ExtensionDeactivated include `telemetrySchemaVersion: '2'` property | – | Completed in previous session. log#t007-add-telemetryschemaversion-to-lifecycle-events |
| [x] | T008 | Apply scrubPII() to ScriptExecutionFailed errorMessage property | Core | T002, T003 | `/workspaces/wormhole/packages/extension/src/core/registry/ScriptRegistry.ts` | errorMessage property scrubbed before sending in both ActionScript failure path (line ~470) and exception path (line ~550) | – | ✅ Verified: ActionScript path (line 469-484) sends no errorMessage (safe by design). Exception path (line 559) uses scrubPII() with enhanced patterns. |
| [x] | T009 | Apply scrubPII() to ScriptExecutionFailed stackPreview property | Core | T002, T003 | `/workspaces/wormhole/packages/extension/src/core/registry/ScriptRegistry.ts` | stackPreview property scrubbed before sending in exception path (line ~550) | – | ✅ Verified line 560: stackPreview uses scrubPII(error.stack.split('\n')[0]) with enhanced Phase 3 patterns. |
| [x] | T010 | Add telemetrySchemaVersion to all ScriptExecution events | Core | T008, T009 | `/workspaces/wormhole/packages/extension/src/core/registry/ScriptRegistry.ts` | ScriptExecutionStarted, Completed, Failed all include `telemetrySchemaVersion: '2'` | – | Completed in previous session. log#t010-add-telemetryschemaversion-to-scriptregistry-events |
| [x] | T011 | Verify ScriptExecutionStarted/Completed properties are PII-safe | Test | – | `/workspaces/wormhole/packages/extension/src/core/registry/ScriptRegistry.ts` | Review properties: sessionId (UUID), alias (script name, safe), mode (safe), requestId (UUID), success (boolean), durationMs (number) | – | ✅ Verified: Started (lines 279-285) and Completed (lines 510-517) only send UUIDs, script names (e.g. "bp.set"), mode strings, booleans, numbers. No PII found. |
| [x] | T012 | Verify processor event properties are PII-safe | Test | – | `/workspaces/wormhole/packages/extension/src/core/fs-bridge/processor.ts` | Review properties: JobCapacityReached (reason, inFlightCount, maxConcurrent - all safe), JobFloodDetected (reason, failureCount, retryAfterSeconds - all safe), CommandProcessingCompleted (scriptName, success, cancelled - all safe) | – | ✅ Verified: JobFloodDetected (lines 237-244), JobCapacityReached (lines 277-284), CommandProcessingCompleted (lines 535-543) only send string literals, counts, measurements. No PII found. |
| [x] | T013 | Add telemetrySchemaVersion to all processor events | Core | T012 | `/workspaces/wormhole/packages/extension/src/core/fs-bridge/processor.ts` | JobCapacityReached, JobFloodDetected, CommandProcessingCompleted all include `telemetrySchemaVersion: '2'` | – | Completed in previous session. log#t013-add-telemetryschemaversion-to-processor-events |
| [ ] | T014 | Create test infrastructure for privacy utilities | Test | T002, T003, T004 | `/workspaces/wormhole/packages/extension/test/core/telemetry/` | Vitest configured, test directory created, VS Code APIs mocked (workspace.workspaceFolders, Uri.parse, env.remoteName), Node APIs mocked (os.homedir) | – | Foundation for privacy unit tests. Creates /test/core/telemetry/ directory. Keep fixtures simple - inline test data is fine. [P] (new directory, parallel with other setup tasks) |
| [ ] | T015 | Implement privacy unit tests (~25 tests) | Test | T014 | `/workspaces/wormhole/packages/extension/test/core/telemetry/privacy.test.ts` | ~25 tests pass: sanitizePath (8 tests: workspace, home, remote, untitled, absolute), scrubPII (12 tests: emails, GitHub token example, AWS key example, JWT, path integration, objects with SECRET_KEY_NAMES, arrays, truncation), sanitizeParams (5 tests: path params, primitives, strings). **Critical**: Validate no raw PII in output (negative assertions), test Insight #3 integration (two-pass sanitization) | – | Pragmatic test coverage focusing on realistic PII scenarios that could leak in production. See test-plan.md for complete test list. Sequential after T014 |
| [ ] | T016 | Verify coverage metrics | Test | T015 | – | Run `npm test -- --coverage test/core/telemetry/privacy.test.ts`, verify 85%+ line coverage on privacy.ts. **Integration**: Confirm Insight #3 validation passes (two-pass sanitization in nested objects with paths + secrets) | – | Validation checkpoint: coverage target met, integration test proves two-pass works. Uses Vitest coverage reporter. Sequential after tests written |
| [x] | T019 | Create manual privacy validation checklist for Azure Portal verification | Doc | – | `/workspaces/wormhole/docs/plans/22-application-insights-telemetry/tasks/phase-3-privacy-and-sanitization/privacy-validation-checklist.md` | Comprehensive 8-section checklist created with path sanitization validation (workspace/home/remote/absolute), PII pattern checks (emails/tokens/keys/JWTs), SECRET_KEY_NAMES testing, integration validation (two-pass), Azure Portal navigation guide, compliance sign-off template, troubleshooting guide. **Deliverable**: 300+ line checklist document ready for Phase 3 smoke testing [^phase3-t019] | – | Supports plan task 3.4. Provides manual E2E validation procedures for privacy compliance. [P] with T014-T018 (different file, independent) |
| [x] | T020 | Add JSDoc comments explaining sanitization approach to all privacy utilities | Doc | T002, T003, T004 | `/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.ts` | All three functions already have comprehensive JSDoc: sanitizePath() documents transformation rules with Insight #1 (basename hashing), scrubPII() documents comprehensive patterns with Insight #2/#3 (overloads, two-pass), sanitizeParams() documents sanitization rules. Each has @param, @returns, @example tags. **Verified**: Complete JSDoc coverage exists from Phase 3 T002-T004 implementation [^phase3-t020] | – | Supports plan task 3.5. Documentation already complete from core implementation tasks. Sequential (documentation pass on same file) |
| [x] | T021 | Build and verify compilation with enhanced privacy utilities | Setup | T002, T003, T004, T007, T010, T013 | `/workspaces/wormhole` | Extension builds successfully with `just build`, no TypeScript errors, webpack bundle size acceptable (<10KB increase) | – | Completed in previous session (logged as T018). log#t018-build-and-verify-compilation |
| [ ] | T022 | Manual smoke test with enhanced privacy patterns | Test | T021 | – | Install extension, trigger events, verify OutputChannel shows sanitized property keys, check Azure Portal for telemetrySchemaVersion='2' events within 5 minutes | – | End-to-end validation per deep research smoke test guidance. Requires `VSCBRIDGE_TELEMETRY_IN_DEV=1` set. [P] (manual verification step) |

---

## Alignment Brief

### Previous Phase Review (Phase 2: Core Event Instrumentation)

#### A. Completed Deliverables

**Core Service Files** (from Phase 1, used in Phase 2):

1. **`/workspaces/wormhole/packages/extension/src/core/telemetry/TelemetryService.ts`**
   - `TelemetryService` singleton class with methods: `initialize()`, `sendEvent()`, `sendErrorEvent()`, `sendException()`, `isEnabled()`, `getSessionId()`, `dispose()`
   - Session ID generation via `crypto.randomUUID()`
   - 3-second dispose timeout (prevents deactivation deadlock)
   - Respects `vscode.env.isTelemetryEnabled` API
   - Development mode gating (requires `VSCBRIDGE_TELEMETRY_IN_DEV=1`)

2. **`/workspaces/wormhole/packages/extension/src/core/telemetry/types.ts`**
   - `ITelemetry` interface (dependency injection contract)
   - `TelemetryInitializeOptions` interface (options object pattern)

3. **`/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.ts`**
   - **Current Functions**:
     - `sanitizePath(filePath: string, workspaceFolders?): string` - Returns `<ws:0>/path`, `~/path`, or `<abs#hash>`
     - `scrubPII(input: string): string` - Replaces emails with `<email>`, tokens with `<token>`, limits to 2048 chars
     - `sanitizeParams(params: Record<string, unknown>): Record<string, string>` - Keeps primitives, removes objects/arrays
   - **Limitations (Phase 3 will enhance)**:
     - Basic email regex (no RFC 5322 edge cases)
     - Generic token detection (length-based, no service-specific prefixes)
     - No GitHub/AWS/JWT/UUID patterns
     - No remote URI handling (vscode-remote://, untitled)
     - No recursive object scrubbing
     - No SECRET_KEY_NAMES detection

**Phase 2 Instrumentation** (events currently sending **raw data**):

4. **`/workspaces/wormhole/packages/extension/src/extension.ts`**
   - ExtensionActivated event (properties: sessionId, vscodeVersion, extensionVersion, platform, remoteName)
   - ExtensionDeactivated event (measurements: sessionDuration)
   - TelemetryService initialization after OutputChannel creation
   - Telemetry passed to ScriptRegistry and initializeFileSystemBridge

5. **`/workspaces/wormhole/packages/extension/src/core/registry/ScriptRegistry.ts`**
   - ScriptExecutionStarted event (properties: sessionId, alias, mode, requestId)
   - ScriptExecutionCompleted event (properties: sessionId, alias, success; measurements: durationMs)
   - ScriptExecutionFailed event (properties: sessionId, alias, errorCode, success, **errorMessage**, **stackPreview**; measurements: durationMs)
   - **⚠️ errorMessage and stackPreview use basic scrubPII() - need enhancement**

6. **`/workspaces/wormhole/packages/extension/src/core/fs-bridge/processor.ts`**
   - JobCapacityReached event (properties: sessionId, reason; measurements: inFlightCount, maxConcurrent)
   - JobFloodDetected event (properties: sessionId, reason; measurements: failureCount, retryAfterSeconds)
   - CommandProcessingCompleted event (properties: sessionId, scriptName, success, cancelled; measurements: durationMs)

7. **`/workspaces/wormhole/packages/extension/src/core/fs-bridge/index.ts`**
   - BridgeManager wires telemetry through filesystem bridge
   - initializeFileSystemBridge() accepts telemetry parameter

#### B. Lessons Learned

**Approaches That Worked**:
1. **Options object pattern** (TelemetryInitializeOptions) - cleaner API, extensible
2. **SessionId correlation** via `getSessionId()` - perfect event correlation in Application Insights
3. **Fire-and-forget pattern** with try-catch - zero reliability impact, < 5ms overhead
4. **Property-keys-only OutputChannel logging** - prevents PII leaks in local logs
5. **3-second dispose timeout** - prevents VS Code shutdown hang

**Complexity Discovered**:
1. **Processor layer cannot access BridgeContext** - required direct telemetry injection via function parameters
2. **ErrorCode extraction** from ActionScript failures - fallback chain for StructuredError taxonomy
3. **TypeScript type mismatches** - `retryAfter || 0` fallback needed for undefined handling
4. **Nested try-catch for exception paths** - telemetry errors must not mask script errors

**Deviations from Plan**:
1. **Task T006A added** - getSessionId() method for consistent session correlation (Insight #3)
2. **Test 7 enhanced** - added Azure Portal verification with Kusto queries (Insight #5)
3. **Privacy risk accepted** - Phase 2 sends raw PII in dev environment only (deferred to Phase 3)
4. **Event volume optimization deferred** - kept all events without sampling (observe first)

#### C. Technical Discoveries

**Framework Constraints**:
1. **Discovery 01**: `Promise.race([dispose(), timeout(3000)])` required to prevent deactivation deadlock
2. **Discovery 02**: ALWAYS use `vscode.env.isTelemetryEnabled` API, never config setting directly
3. **Discovery 03**: Singleton pattern with `static get instance()` and nullish coalescing
4. **Discovery 04**: ScriptRegistry.execute() is single instrumentation point for 86+ scripts
5. **Discovery 06**: Processor capacity/flood events need direct telemetry injection
6. **Discovery 07**: StructuredError as ErrorCode taxonomy source
7. **Discovery 08**: Use workspace index `<ws:N>` not folder name to avoid PII
8. **Discovery 09**: 4-tier precedence chain (VS Code global > ext setting > dev mode > env var)
9. **Discovery 10**: OutputChannel logging with `[Telemetry]` prefix, property-keys-only

**Anti-Patterns to Avoid**:
- ❌ Awaiting telemetry calls (fire-and-forget only)
- ❌ Logging property values to OutputChannel (keys only)
- ❌ Throwing errors from telemetry code (wrap in try-catch)
- ❌ Skipping sessionId in events (breaks correlation)
- ❌ Using workspace folder name (use index)
- ❌ Blocking on dispose() (always race with timeout)

#### D. Dependencies for Phase 3

**Available APIs**:
```typescript
import { TelemetryService, ITelemetry, sanitizePath, scrubPII, sanitizeParams } from './core/telemetry';

// Singleton access
const telemetry = TelemetryService.instance;
const sessionId = telemetry.getSessionId(); // UUID v4

// Privacy utilities (Phase 3 will enhance these)
sanitizePath('/workspaces/wormhole/test.ts'); // "<ws:0>/test.ts"
scrubPII('User email@example.com has token abc123...'); // "User <email> has <token>"
sanitizeParams({ path: '/file.ts', line: 42 }); // { path: '<ws:0>/file.ts', line: '42' }
```

**Events Currently Sending**:
| Event | Properties | Measurements | PII Status |
|-------|-----------|--------------|------------|
| ExtensionActivated | sessionId, vscodeVersion, extensionVersion, platform, remoteName | – | ✅ Safe |
| ExtensionDeactivated | – | sessionDuration | ✅ Safe |
| ScriptExecutionStarted | sessionId, alias, mode, requestId | – | ✅ Safe |
| ScriptExecutionCompleted | sessionId, alias, success | durationMs | ✅ Safe |
| ScriptExecutionFailed | sessionId, alias, errorCode, success, **errorMessage**, **stackPreview** | durationMs | ⚠️ **Needs enhanced scrubPII()** |
| JobCapacityReached | sessionId, reason | inFlightCount, maxConcurrent | ✅ Safe |
| JobFloodDetected | sessionId, reason | failureCount, retryAfterSeconds | ✅ Safe |
| CommandProcessingCompleted | sessionId, scriptName, success, cancelled | durationMs | ✅ Safe |

#### E. Critical Findings Applied in Phase 2

**✅ Discovery 01**: Deactivation flush deadlock - fixed with 3s timeout race
**✅ Discovery 02**: `vscode.env.isTelemetryEnabled` API - correctly used
**✅ Discovery 03**: Singleton pattern - matches codebase conventions
**✅ Discovery 04**: ScriptRegistry single instrumentation point - three strategic telemetry calls
**✅ Discovery 06**: Processor telemetry injection - wired through initializeFileSystemBridge
**✅ Discovery 07**: ErrorCode taxonomy - extracted from ActionScript failures
**✅ Discovery 08**: Workspace index - `sanitizePath()` ready but not yet applied
**✅ Discovery 09**: Dev mode precedence - 4-tier chain enforced
**✅ Discovery 10**: OutputChannel logging - property-keys-only pattern

#### F. Blocked/Incomplete Items from Phase 2

**⚠️ Privacy Sanitization NOT YET APPLIED** (Intentional - Phase 3 Scope):
- Raw file paths: Not currently sent in events, but infrastructure needs readiness
- Raw error messages: errorMessage property in ScriptExecutionFailed uses basic scrubPII()
- Raw stack traces: stackPreview property uses basic scrubPII()
- Script parameters: Not yet tracked in events

**Implications**:
- Cannot deploy to production before Phase 3 complete
- Acceptable for development environment (team confirmed in Insight #1)
- Privacy utilities exist but need enhancement (GitHub/AWS/JWT patterns missing)

#### G. Test Infrastructure

**Testing Approach**: Manual Verification Only (no automated tests per spec)

**Available Test Procedures** (from Phase 2 tasks.md):
- Test 1-6: Extension lifecycle, script execution, processor events (OutputChannel verification)
- Test 7: End-to-End Smoke Test with Azure Portal verification (Kusto queries, 9-item checklist)

**Test Execution Environment**:
- Set `VSCBRIDGE_TELEMETRY_IN_DEV=1` environment variable
- Launch Extension Host via F5 or code command
- OutputChannel "VSC-Bridge" shows `[Telemetry]` logs
- Application Insights portal (3-5 minute delay for ingestion)

#### H. Technical Debt & Workarounds

1. **Hardcoded connection string** - Acceptable per Microsoft guidance, env var override available
2. **Privacy utilities not applied** - Phase 3 primary deliverable
3. **Extension config not wired** - Phase 4 will read `vscBridge.telemetry.enabled`
4. **No BridgeContext integration** - Phase 4 will add telemetry to IBridgeContext
5. **Throttling only for JobFloodDetected** - Monitor in Phase 6, add if needed

**Patterns Established (Phase 3 Must Follow)**:
- Fire-and-forget with try-catch wrapping
- SessionId correlation in all events
- Property-keys-only OutputChannel logging
- Options object pattern for APIs
- Dependency injection via constructor parameters

#### I. Scope Changes from Phase 2

**Tasks Added**:
- T006A: `getSessionId()` method for session correlation (Insight #3)
- Updated T008-T011: Added sessionId to ScriptExecution events
- Updated T014-T016: Added sessionId to processor events
- Enhanced Test 7: Added Azure Portal verification with Kusto queries

**Requirements Clarified**:
- Privacy risk window accepted for dev-only deployment
- Event volume optimization deferred (observe first)
- Manual testing approach confirmed (no automated tests)

#### J. Key References - Important Decisions

1. **Session Correlation Architecture**: Single sessionId for all events via `getSessionId()` getter
2. **Fire-and-Forget Event Pattern**: All telemetry void-returning, non-blocking
3. **Processor Event Throttling**: JobFloodDetected max 1/60s, capacity events not throttled
4. **Property-Keys-Only Logging**: Never log values to OutputChannel
5. **Exception Handling**: Use `sendErrorEvent()` with metadata (no `sendTelemetryException()` method exists)
6. **Privacy Utilities Ready**: Implemented but NOT applied in Phase 2 events
7. **Development Mode Gating**: Explicit opt-in via `VSCBRIDGE_TELEMETRY_IN_DEV=1`

---

### Objective

**Phase 3 Goal**: Enhance privacy utilities with comprehensive secret detection patterns and ensure all telemetry events are privacy-safe before production deployment.

**Behavior Checklist** (maps to plan acceptance criteria):
- [ ] No raw file paths in any telemetry event (all transformed to `<ws:N>/path`, `~/path`, or `<abs#hash>.<ext>`)
- [ ] No email addresses, tokens, or usernames in event properties
- [ ] Enhanced `scrubPII()` detects GitHub tokens (6 prefixes), AWS keys, JWTs, UUIDs, IPv4 addresses, URL credentials
- [ ] Remote URIs (vscode-remote://, untitled) handled correctly with authority hashing
- [ ] Recursive object scrubbing with SECRET_KEY_NAMES detection
- [ ] All events include `telemetrySchemaVersion: '2'` for migration tracking
- [ ] Unit tests cover all new patterns (no performance benchmarking per Insight #5)
- [ ] Manual inspection confirms privacy compliance (Test 7 with Azure Portal verification)

---

### Non-Goals (Scope Boundaries)

❌ **NOT doing in Phase 3**:
- **External PII libraries** - Using custom regex pipeline per deep research recommendation (§1)
- **Telemetry initializer** - Defense-in-depth hook deferred (could be added later if needed)
- **Automated test suite** - Manual testing approach per spec, only unit tests for privacy utilities
- **Credit card/SSN/medical data detection** - Not in scope (developer tool, not handling regulated PII)
- **ML/NLP-based detection** - Regex patterns sufficient for our narrow PII surface
- **Configuration wiring** - Phase 4 will read `vscBridge.telemetry.enabled` setting
- **BridgeContext integration** - Phase 4 scope
- **Documentation** - Phase 5 will create docs/telemetry.md
- **Performance benchmarking** - Fire-and-forget on error paths, even 10ms wouldn't be noticeable (Insight #5)
- **Event volume optimization** - Event volume monitoring deferred to Phase 6
- **Sampling/filtering** - Keeping all events for now (observe patterns first)
- **Production deployment** - Phase 6 verification required before marketplace release

---

### Critical Findings Affecting Phase 3

From plan § 3 Critical Research Findings:

**🚨 Discovery 08: Path Sanitization for Multi-Root Workspaces** (applies to Phase 3)
- **Constraint**: Use workspace index `<ws:0>` not workspace name (avoids client names in folder names)
- **Implementation**: `sanitizePath()` already follows this pattern (Phase 1), verify in tests
- **Tasks Affected**: T004, T015 (remote URI handling), T017 (validation checklist)

**🟡 Deep Research Findings** (new inputs from PII sanitization research):

**Finding DR-01: Service-Specific Token Prefixes Reduce False Positives**
- **Recommendation**: Use GitHub (ghp_, gho_, etc.), AWS (AKIA*, ASIA*), JWT (ey...) prefixes instead of generic "20+ random chars"
- **Impact**: More accurate secret detection, fewer false matches on hashes/UUIDs
- **Tasks Affected**: T002 (regex pattern implementation)

**Finding DR-02: Recursive Object Scrubbing with Key Name Detection**
- **Recommendation**: Scrub object properties recursively, redact keys matching /password|token|secret|auth/i
- **Impact**: Handles nested telemetry properties, catches secrets in complex objects
- **Tasks Affected**: T003 (recursive scrubPII implementation)

**Finding DR-03: Remote URI Hashing for Privacy**
- **Recommendation**: Hash authority in vscode-remote URIs to avoid host disclosure (SSH, WSL, Codespaces)
- **Impact**: Prevents leaking remote host identifiers while preserving debuggability
- **Tasks Affected**: T004 (sanitizePath enhancement)

**Finding DR-04: Performance Budget < 5ms per Event**
- **Recommendation**: Precompile regex patterns at module level, add performance benchmark test
- **Impact**: Ensures telemetry doesn't block extension operations
- **Tasks Affected**: T002 (pattern precompilation), T016 (performance test)

**Finding DR-05: Migration Schema Versioning**
- **Recommendation**: Add `telemetrySchemaVersion: '2'` to mark privacy-sanitized events
- **Impact**: Enables before/after comparison in Application Insights queries
- **Tasks Affected**: T007, T010, T013 (schema version property addition)

---

### Invariants & Guardrails

**Performance Budget**:
- Sanitization must complete in **< 5ms per event** (per deep research § 7)
- Regex patterns precompiled at module level (no runtime compilation)
- String truncation at 2048 chars, arrays at 50 items, objects at 50 keys

**Privacy Requirements**:
- **Zero tolerance for PII leaks** - all paths, emails, tokens must be sanitized
- **Graceful degradation** - sanitization errors logged to OutputChannel, never crash extension
- **Property-keys-only logging** - never log sanitized values to OutputChannel (maintain Phase 2 pattern)

**Security Constraints**:
- **No external API calls** for sanitization (offline-first, works in air-gapped environments)
- **No file system access** during sanitization (runs in VS Code extension sandbox)
- **Catastrophic backtracking protection** - use simple regex patterns, test with safe-regex linters if adding complex patterns

**Bundle Size**:
- Privacy utility enhancements should add **< 10 KB** to extension bundle
- No external PII detection libraries (custom regex only per deep research § 1)

---

### Inputs to Read

**Phase 1 Deliverables**:
- `/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.ts` (current utilities)
- `/workspaces/wormhole/packages/extension/src/core/telemetry/TelemetryService.ts` (sendEvent methods)
- `/workspaces/wormhole/packages/extension/src/core/telemetry/types.ts` (ITelemetry interface)

**Phase 2 Deliverables**:
- `/workspaces/wormhole/packages/extension/src/extension.ts` (lifecycle events)
- `/workspaces/wormhole/packages/extension/src/core/registry/ScriptRegistry.ts` (script execution events)
- `/workspaces/wormhole/packages/extension/src/core/fs-bridge/processor.ts` (processor events)

**Deep Research Outputs**:
- Deep research findings (§ 4.1 patterns, § 6 path sanitization, § 8.1 unit tests)
- Production-ready code snippets for regex patterns and recursive scrubbing

**Testing Resources**:
- `/workspaces/wormhole/docs/plans/22-application-insights-telemetry/tasks/phase-2-core-event-instrumentation/tasks.md` (Test 7 procedure)

---

### Visual Alignment Aids

#### System Flow Diagram: Privacy Sanitization Pipeline

```mermaid
flowchart TD
    Start([Extension Code Calls sendEvent]) --> Check{Is Telemetry Enabled?}
    Check -->|No| Skip[Return void]
    Check -->|Yes| EnhanceScrub[Enhanced scrubPII Pipeline]

    EnhanceScrub --> PathScan[Path Detection & Sanitization]
    PathScan --> WS{Workspace-relative?}
    WS -->|Yes| WSFormat["<ws:N>/path"]
    WS -->|No| Home{Home directory?}
    Home -->|Yes| HomeFormat["~/path"]
    Home -->|No| Remote{Remote/Untitled?}
    Remote -->|Yes| RemoteFormat["<remote:hash>/basename"]
    Remote -->|No| AbsFormat["<abs:hash>/basename"]

    WSFormat --> SecretScan
    HomeFormat --> SecretScan
    RemoteFormat --> SecretScan
    AbsFormat --> SecretScan

    SecretScan[Secret Pattern Matching] --> GitHub{GitHub token?}
    GitHub -->|Yes| GitHubReplace["<github_token>"]
    GitHub -->|No| AWS{AWS key?}
    AWS -->|Yes| AWSReplace["<aws_key>"]
    AWS -->|No| JWT{JWT?}
    JWT -->|Yes| JWTReplace["<jwt>"]
    JWT -->|No| Email{Email?}
    Email -->|Yes| EmailReplace["<email>"]
    Email -->|No| UUID{UUID?}
    UUID -->|Yes| UUIDReplace["<uuid>"]
    UUID -->|No| IP{IPv4?}
    IP -->|Yes| IPReplace["<ip>"]
    IP -->|No| URLCreds{URL creds?}
    URLCreds -->|Yes| URLReplace["://<user>:<pass>@"]
    URLCreds -->|No| UserPath{User path?}
    UserPath -->|Yes| UserReplace["~/"]

    GitHubReplace --> RecursiveScrub
    AWSReplace --> RecursiveScrub
    JWTReplace --> RecursiveScrub
    EmailReplace --> RecursiveScrub
    UUIDReplace --> RecursiveScrub
    IPReplace --> RecursiveScrub
    URLReplace --> RecursiveScrub
    UserReplace --> RecursiveScrub
    UserPath -->|No| RecursiveScrub

    RecursiveScrub[Recursive Object Scrubbing] --> ObjType{Value Type?}
    ObjType -->|String| Truncate[Truncate > 2048 chars]
    ObjType -->|Object| KeyCheck{Key matches SECRET_KEY_NAMES?}
    KeyCheck -->|Yes| Redact["<redacted>"]
    KeyCheck -->|No| RecurseObj[Scrub nested values]
    ObjType -->|Array| ArrayLimit[Limit 50 items, scrub each]
    ObjType -->|Primitive| Keep[Keep as-is]

    Truncate --> AddSchema
    Redact --> AddSchema
    RecurseObj --> AddSchema
    ArrayLimit --> AddSchema
    Keep --> AddSchema

    AddSchema[Add telemetrySchemaVersion: '2'] --> SendAI[Send to Application Insights]
    SendAI --> End([Return void])
    Skip --> End
```

#### Sequence Diagram: Privacy-Safe Event Sending

```mermaid
sequenceDiagram
    participant Ext as Extension Code<br/>(ScriptRegistry, processor, etc.)
    participant Tel as TelemetryService
    participant Priv as Privacy Utilities<br/>(sanitizePath, scrubPII)
    participant Rep as TelemetryReporter<br/>(@vscode/extension-telemetry)
    participant AI as Application Insights

    Note over Ext,AI: Phase 2: Basic Sanitization (Current State)
    Ext->>Tel: sendErrorEvent('ScriptExecutionFailed',<br/>{ errorMessage: 'Error at /home/user/proj/file.ts:42' })
    Tel->>Tel: Check isEnabled()
    Tel->>Priv: scrubPII(errorMessage) [basic patterns]
    Priv-->>Tel: "Error at <email> <token> ..."
    Tel->>Rep: sendTelemetryErrorEvent(name, props, measurements)
    Rep->>AI: Fire-and-forget (void return)
    Note right of AI: ⚠️ Some PII may leak<br/>(no GitHub/AWS/JWT patterns)

    Note over Ext,AI: Phase 3: Enhanced Sanitization (Target State)
    Ext->>Tel: sendErrorEvent('ScriptExecutionFailed',<br/>{ errorMessage: 'ghp_abc123... at /ws/file:42' })
    Tel->>Tel: Check isEnabled()
    Tel->>Priv: scrubPII(errorMessage) [enhanced patterns]

    Note over Priv: Pattern matching:<br/>1. GitHub token → <github_token><br/>2. Path → <ws:0>/file<br/>3. Recursive object scrub<br/>4. SECRET_KEY_NAMES check<br/>5. Truncate > 2048 chars

    Priv-->>Tel: "<github_token> at <ws:0>/file:42"
    Tel->>Tel: Add telemetrySchemaVersion: '2'
    Tel->>Rep: sendTelemetryErrorEvent(name, scrubbedProps, measurements)
    Rep->>AI: Fire-and-forget (void return)
    Note right of AI: ✅ Privacy-safe event<br/>No PII leaked

    Note over Ext,AI: Graceful Degradation Pattern
    Ext->>Tel: sendEvent('EventName', { key: complexObject })
    Tel->>Tel: Check isEnabled()
    Tel->>Priv: scrubPII(complexObject)
    Priv->>Priv: try { recursiveScrub }
    Priv-xPriv: catch (error)
    Note over Priv: Sanitization error!<br/>Log to OutputChannel
    Priv-->>Tel: Return best-effort result
    Tel->>Rep: sendTelemetryEvent(name, partialProps)
    Rep->>AI: Partial event sent
    Note right of AI: Extension never crashes<br/>due to sanitization
```

---

### Test Plan

**Testing Approach**: Manual Verification + Unit Tests (hybrid per deep research § 8)

#### Unit Tests (Vitest - new file)

**Test File**: `/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.test.ts`

1. **Test: scrubPII() redacts email addresses**
   - Input: `'Contact admin@example.com for help'`
   - Expected: `'Contact <email> for help'`
   - Rationale: Verify email detection including subdomains, plus tags

2. **Test: scrubPII() redacts GitHub tokens (all 6 prefixes)**
   - Inputs: `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_` followed by 20+ chars
   - Expected: All replaced with `<github_token>`
   - Rationale: Service-specific prefix detection per deep research

3. **Test: scrubPII() redacts AWS Access Key IDs**
   - Input: `'AKIA1234567890ABCDEF'` (AKIA + 16 chars)
   - Expected: `'<aws_access_key_id>'`
   - Rationale: AWS key format detection

4. **Test: scrubPII() redacts AWS Secret Access Keys**
   - Input: 40-character base64-like string
   - Expected: `'<aws_secret_key>'`
   - Rationale: Length + character set detection

5. **Test: scrubPII() redacts JWTs**
   - Input: `'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.XmY2-1vZ5Nc4b6dWQ'`
   - Expected: `'<jwt>'`
   - Rationale: 3-part base64url structure detection

6. **Test: scrubPII() redacts UUID v4**
   - Input: `'550e8400-e29b-41d4-a716-446655440000'`
   - Expected: `'<uuid>'`
   - Rationale: UUID v4 format (4 in 3rd segment)

7. **Test: scrubPII() redacts IPv4 addresses**
   - Input: `'Connection to 192.168.1.100 failed'`
   - Expected: `'Connection to <ip> failed'`
   - Rationale: IP address detection

8. **Test: scrubPII() masks URL credentials**
   - Input: `'https://user:pass@example.com/path'`
   - Expected: `'https://<user>:<pass>@example.com/path'`
   - Rationale: URL credential masking

9. **Test: scrubPII() normalizes Windows user paths**
   - Input: `'C:\\Users\\JohnDoe\\project\\file.ts'`
   - Expected: `'C:\\Users\\<user>\\project\\file.ts'`
   - Rationale: Windows user directory obfuscation

10. **Test: scrubPII() normalizes Unix user paths**
    - Input: `'/home/jane/project/file.ts'`, `'/Users/jane/project/file.ts'`
    - Expected: `'/home/<user>/project/file.ts'`, `'/Users/<user>/project/file.ts'`
    - Rationale: Unix/macOS user directory obfuscation

11. **Test: scrubPII() handles recursive objects**
    - Input: `{ config: { apiKey: 'secret123', timeout: 5000 } }`
    - Expected: `{ config: { apiKey: '<redacted>', timeout: 5000 } }`
    - Rationale: Recursive scrubbing with SECRET_KEY_NAMES detection

12. **Test: scrubPII() truncates long strings**
    - Input: String with 3000 characters
    - Expected: First 2048 chars + `'…<truncated>'`
    - Rationale: Bundle size protection

13. **Test: scrubPII() limits array length**
    - Input: Array with 100 items
    - Expected: First 50 items (scrubbed) + truncation marker
    - Rationale: Performance protection

14. **Test: sanitizePath() handles workspace-relative paths**
    - Input: `/workspaces/wormhole/test/python/test.py` with mock workspaceFolders
    - Expected: `'<ws:0>/test/python/test.py'`
    - Rationale: Workspace index format

15. **Test: sanitizePath() handles home-relative paths**
    - Input: `/home/user/project/file.ts`, `C:\\Users\\JohnDoe\\file.ts`
    - Expected: `'~/project/file.ts'`, `'~\\file.ts'`
    - Rationale: Home directory elision

16. **Test: sanitizePath() handles untitled URIs**
    - Input: `vscode.Uri.parse('untitled:Untitled-1')`
    - Expected: `'<untitled>'`
    - Rationale: Virtual file handling

17. **Test: sanitizePath() handles vscode-remote URIs**
    - Input: `vscode.Uri.parse('vscode-remote://ssh-remote+host/home/user/file.ts')`
    - Expected: `'<ssh:hash>/file.ts'` (hash authority, preserve basename)
    - Rationale: Remote URI privacy per deep research § 6

18. **Test: sanitizePath() hashes absolute paths with basename**
    - Input: `/random/absolute/path/file.ts`
    - Expected: `'<abs:hash>/file.ts'` (SHA1 hash of full path, preserve basename)
    - Rationale: Debugging context preserved while hiding full path

19. **Test: Performance benchmark - scrubPII() under 5ms**
    - Input: 1000-line error string with mixed PII
    - Expected: Sanitization completes in < 5ms
    - Rationale: Performance budget per deep research § 7

#### Manual Tests (from Phase 2 Test 7, enhanced)

**Test 7: End-to-End Privacy Smoke Test**

**Prerequisites**:
- `VSCBRIDGE_TELEMETRY_IN_DEV=1` set
- Extension built with `just build`
- Extension Host launched (F5 or code command)

**Steps**:
1. Open OutputChannel "VSC-Bridge"
2. Trigger extension activation (automatic on launch)
3. Run a script: `cd /workspaces/wormhole/test && vscb script run bp.list`
4. Trigger a script failure: `vscb script run bp.set` (missing params)
5. Wait 3-5 minutes for Application Insights ingestion
6. Open Azure Portal → Application Insights → Logs

**Kusto Queries**:

```kql
// Query 1: Verify telemetrySchemaVersion='2' for all Phase 3 events
customEvents
| where timestamp > ago(10m)
| extend schemaVersion = tostring(customDimensions.telemetrySchemaVersion)
| where schemaVersion == '2'
| summarize count() by name
| order by name asc

// Query 2: Check for any raw file paths (should be zero results)
customEvents
| where timestamp > ago(10m)
| extend props = todynamic(customDimensions)
| mvexpand props
| where props contains '/workspaces/' or props contains '/Users/' or props contains 'C:\\'
| project timestamp, name, props

// Query 3: Check for email addresses (should be zero results)
customEvents
| where timestamp > ago(10m)
| extend props = todynamic(customDimensions)
| mvexpand props
| where props matches regex @'[\w.-]+@[\w.-]+\.\w+'
| project timestamp, name, props

// Query 4: Verify GitHub tokens redacted (should be zero ghp_, gho_, etc.)
customEvents
| where timestamp > ago(10m)
| extend props = todynamic(customDimensions)
| mvexpand props
| where props matches regex @'\bgh[pours]_|github_pat_'
| project timestamp, name, props

// Query 5: Verify session correlation with new schema
customEvents
| where timestamp > ago(10m)
| extend sessionId = tostring(customDimensions.sessionId), schemaVersion = tostring(customDimensions.telemetrySchemaVersion)
| where schemaVersion == '2'
| summarize EventCount = count() by sessionId, schemaVersion
| order by EventCount desc
```

**Validation Checklist**:
- [ ] Query 1 returns events for all 9 types with telemetrySchemaVersion='2'
- [ ] Query 2 returns **zero results** (no raw paths)
- [ ] Query 3 returns **zero results** (no email addresses)
- [ ] Query 4 returns **zero results** (no GitHub tokens)
- [ ] Query 5 shows sessionId correlation across events
- [ ] errorMessage properties show `<github_token>`, `<email>`, `<ws:0>/path` patterns
- [ ] stackPreview properties show sanitized paths
- [ ] OutputChannel logs still show property keys only (no values)
- [ ] Extension operates normally (no crashes, no blocking)

---

### Implementation Outline

**Step-by-Step** (mapped 1:1 to tasks):

1. **Review Existing Privacy Utilities** (T001)
   - Read `/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.ts`
   - Understand current `sanitizePath()`, `scrubPII()`, `sanitizeParams()` implementations
   - Note current regex patterns: basic email (`[\w.-]+@[\w.-]+\.\w+`), basic token (20+ chars)
   - Identify gaps: no GitHub/AWS/JWT/UUID patterns, no remote URI handling, no recursive object scrubbing

2. **Enhance scrubPII() with Comprehensive Patterns** (T002)
   - Add precompiled regex constants at module level (per deep research § 4.1):
     - `reGitHubToken`: `/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,255}\b|\bgithub_pat_[A-Za-z0-9_]{20,255}\b/gi`
     - `reAwsAccessKeyId`: `/\b(?:AKIA|ASIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/g`
     - `reAwsSecretKey`: `/(?<![A-Za-z0-9\/+=])[A-Za-z0-9\/+=]{40}(?![A-Za-z0-9\/+=])/g`
     - `reJwt`: `/\bey[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\b/g`
     - `reUuidV4`: `/\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi`
     - `reIPv4`: `/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g`
     - `reUrlCreds`: `/\b([a-z]+):\/\/([^:\s\/]+):([^@\s\/]+)@/gi`
     - `reWinUser`: `/([A-Za-z]:\\Users\\)([^\\]+)\\/g`
     - `reUnixUser`: `/(\/home\/|\/Users\/)([^\/]+)\//g`
   - Update `scrubPII()` to apply all patterns in sequence
   - Test with examples from deep research § 8.1

3. **Add Recursive Object Handling to scrubPII()** (T003)
   - Add `SECRET_KEY_NAMES` regex: `/password|passphrase|authorization|auth[_-]?token|token|secret|apikey|api[_-]?key|bearer/i`
   - **Use overloaded signatures for type safety** (Insight #2):
     ```typescript
     // Overload declarations
     function scrubPII(input: string): string;
     function scrubPII(value: unknown): unknown;

     // Implementation
     function scrubPII(value: unknown): unknown {
       if (typeof value === 'string') {
         let s = value;
         // First pass: Detect and sanitize paths (Insight #3)
         s = s.replace(/[A-Za-z]:\\[^ \n\r\t]+|\/[^ \n\r\t]+|vscode-[^:]+:\/\/[^ \n\r\t]+/g,
                       (p) => sanitizePath(p, vscode.workspace.workspaceFolders ?? []));
         // Second pass: Apply secret patterns (GitHub, AWS, JWT, etc.)
         for (const [re, repl] of replacements) {
           s = s.replace(re, repl as any);
         }
         return s.length > 2048 ? s.slice(0, 2048) + '…<truncated>' : s;
       }
       // Recursive object/array handling...
     }
     ```
   - Implement type checks: string (overload preserves type), number, boolean, array, object, null/undefined
   - Recursive handling:
     - Strings: **Path sanitization first** (call sanitizePath on detected paths), then secret patterns, truncate at 2048 chars
     - Arrays: Scrub first 50 items recursively
     - Objects: Check keys against SECRET_KEY_NAMES, scrub values recursively, limit 50 keys
     - Primitives: Return as-is
   - Return `'<unsupported>'` for functions, buffers, etc.

4. **Enhance sanitizePath() with Remote URI Handling** (T004)
   - Accept `string | vscode.Uri` parameter
   - Parse URI and check scheme:
     - `untitled` → return `'<untitled>'`
     - `vscode-*` (remote, codespaces, etc.) → return `'<remoteName:hash>/<basename>'` using `vscode.env.remoteName` and SHA1 hash of authority
   - Maintain existing workspace-relative, home-relative, absolute hashing logic
   - Test with `vscode.Uri.parse()` examples

5. **Verify Lifecycle Event Safety** (T005-T006)
   - Read `extension.ts` ExtensionActivated/Deactivated event properties
   - Confirm: sessionId (UUID), vscodeVersion (safe), extensionVersion (safe), platform (safe), remoteName (safe), sessionDuration (number)
   - No code changes needed - properties already safe

6. **Add telemetrySchemaVersion to Lifecycle Events** (T007)
   - Edit `extension.ts` around lines 38-44 (ExtensionActivated) and 316-324 (ExtensionDeactivated)
   - Add property: `telemetrySchemaVersion: '2'` to both events
   - Wrap in try-catch (follow Phase 2 pattern)

7. **Apply Enhanced scrubPII() to ScriptExecutionFailed Events** (T008-T009)
   - Edit `ScriptRegistry.ts` around lines 468-482 (ActionScript failure path) and 527-545 (exception path)
   - Verify `scrubPII()` is already applied to `errorMessage` and `stackPreview`
   - Test that enhanced patterns (GitHub tokens, AWS keys, etc.) are now redacted
   - No code changes needed if already applied - verify in manual test

8. **Add telemetrySchemaVersion to ScriptRegistry Events** (T010)
   - Edit `ScriptRegistry.ts` around lines 276-288 (Started), 505-518 (Completed), 468-482 (Failed ActionScript), 527-545 (Failed exception)
   - Add property: `telemetrySchemaVersion: '2'` to all four events
   - Wrap in existing try-catch blocks

9. **Verify ScriptExecution and Processor Event Safety** (T011-T012)
   - Read properties for ScriptExecutionStarted/Completed, JobCapacityReached, JobFloodDetected, CommandProcessingCompleted
   - Confirm: alias (script name, safe), scriptName (internal identifier, safe), mode/reason/success/cancelled (enums/booleans, safe)
   - No code changes needed

10. **Add telemetrySchemaVersion to Processor Events** (T013)
    - Edit `processor.ts` around lines 233-244 (JobFloodDetected), 273-283 (JobCapacityReached), 530-544/596-610 (CommandProcessingCompleted)
    - Add property: `telemetrySchemaVersion: '2'` to all three events
    - Wrap in existing try-catch blocks

11. **Write Unit Tests for Enhanced scrubPII()** (T014)
    - Create `/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.test.ts`
    - Import `describe`, `it`, `expect` from `vitest`
    - Write test cases for all patterns (GitHub tokens, AWS keys, JWT, UUID, IPv4, URL creds, user paths, recursive objects, SECRET_KEY_NAMES)
    - Test both overloaded signatures and stack trace with remote URI
    - Run with `npx vitest privacy.test.ts`

12. **Write Unit Tests for Enhanced sanitizePath()** (T015)
    - Add to `privacy.test.ts`
    - Test workspace-relative, home-relative, absolute, untitled, vscode-remote cases
    - Verify filename hashing with extension preservation
    - Mock `vscode.workspace.workspaceFolders` for workspace tests

13. **Create Manual Privacy Validation Checklist** (T016)
    - Update `/workspaces/wormhole/docs/plans/22-application-insights-telemetry/tasks/phase-2-core-event-instrumentation/tasks.md` Test 7
    - Add Kusto queries (5 queries from Test Plan above)
    - Add validation checklist (9 items)
    - Add troubleshooting guide

14. **Add JSDoc Comments to Privacy Utilities** (T017)
    - Edit `privacy.ts`
    - Add comprehensive JSDoc to `sanitizePath()`, `scrubPII()`, `sanitizeParams()`
    - Include `@param`, `@returns`, `@example` tags
    - Explain privacy rationale, pattern list, and basename hashing decision

15. **Build and Verify** (T018)
    - Run `just build` from `/workspaces/wormhole`
    - Verify no TypeScript errors
    - Check webpack bundle size increase (should be < 10KB)

16. **Manual Smoke Test** (T019)
    - Set `VSCBRIDGE_TELEMETRY_IN_DEV=1`
    - Launch Extension Host
    - Trigger events, verify OutputChannel logs
    - Check Azure Portal for telemetrySchemaVersion='2' events
    - Run privacy validation queries from Test 7

---

### Commands to Run

```bash
# Build extension
cd /workspaces/wormhole
just build

# Run unit tests
cd /workspaces/wormhole/packages/extension
npx vitest src/core/telemetry/privacy.test.ts

# Run all tests (if adding more test files later)
npx vitest

# Check TypeScript types
npx tsc --noEmit

# Check bundle size
ls -lh dist/extension.js

# Manual smoke test (from test workspace)
export VSCBRIDGE_TELEMETRY_IN_DEV=1
cd /workspaces/wormhole/test
vscb script run bp.list
vscb script run bp.set  # Trigger failure

# Verify in Azure Portal
# (Use Kusto queries from Test 7 checklist)
```

---

### Risks & Unknowns

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **False positives in secret detection** | Medium | Medium | Test with real error messages from Phase 2 logs; add exclusions if needed (e.g., exclude code snippets in test files) |
| **Regex catastrophic backtracking** | High | Low | Use simple patterns without nested quantifiers; test with safe-regex linter if adding complex patterns |
| **Performance regression (> 5ms)** | High | Low | Precompile patterns at module level; add performance benchmark test (T016); use LRU cache if repeated strings |
| **Over-sanitization breaks debugging** | Medium | Medium | Preserve basename in absolute paths (`<abs:hash>/<basename>`); test with real error scenarios |
| **Under-sanitization misses new secret types** | Critical | Low | Follow deep research curated patterns from Gitleaks/TruffleHog; add patterns quarterly as needed |
| **Bundle size bloat (> 10KB increase)** | Low | Low | Custom regex only (no external libraries); patterns are small strings |
| **Remote URI authority disclosure** | Medium | Low | Hash authority with SHA1 (`<remote:hash>`); test with SSH/WSL/Codespaces URIs |
| **Unicode/IDN domain handling** | Low | Low | Email regex treats ASCII only; expand pattern if IDN domains appear (trade-off: more false positives) |
| **Telemetry errors mask extension errors** | High | Very Low | Nested try-catch in exception paths (established in Phase 2); never re-throw telemetry errors |
| **Schema version migration confusion** | Low | Low | Document in comments that `telemetrySchemaVersion: '2'` marks privacy-enhanced events; query both versions in portal |

---

### Ready Check

**Pre-Implementation Checklist**:
- [ ] Phase 2 complete and verified (all events instrumented)
- [ ] Privacy utilities from Phase 1 reviewed (sanitizePath, scrubPII, sanitizeParams)
- [ ] Deep research recommendations understood (custom regex, no external libs, < 5ms budget)
- [ ] Test environment ready (`VSCBRIDGE_TELEMETRY_IN_DEV=1`, Azure Portal access)
- [ ] Unit test framework available (Vitest)
- [ ] Manual test procedures reviewed (Test 7 from Phase 2)

**Post-Implementation Validation**:
- [ ] Unit tests pass (19 test cases for scrubPII/sanitizePath, performance < 5ms)
- [ ] Build successful (no TypeScript errors, bundle size acceptable)
- [ ] Manual smoke test passes (OutputChannel logs correct, Azure Portal shows telemetrySchemaVersion='2')
- [ ] Privacy validation queries pass (zero raw paths, zero emails, zero tokens)
- [ ] Session correlation works (all events share same sessionId)
- [ ] Extension operates normally (no crashes, no blocking, graceful degradation)

**Acceptance Criteria (from plan)**:
- [ ] No raw file paths in any telemetry event (all transformed to `<ws:N>/path`, `~/path`, or `<abs#hash>.<ext>`)
- [ ] No email addresses, tokens, or usernames in event properties
- [ ] Script parameters sanitized (no user data transmitted) - not currently sent, utilities ready if needed
- [ ] Manual inspection confirms privacy compliance (Test 7 validation checklist complete)

---

**GO/NO-GO**: Phase 3 ready to begin implementation when checklist above is complete.

---

## Critical Insights Discussion

**Session**: 2025-01-24
**Context**: Phase 3: Privacy and Sanitization - Tasks & Alignment Brief v1.0
**Analyst**: AI Clarity Agent
**Reviewer**: Development Team
**Format**: Water Cooler Conversation (5 Critical Insights)

### Insight 1: Remote URI Basename PII Leak

**Did you know**: Our current sanitizePath() enhancement for remote URIs preserves the basename, which could itself contain PII or sensitive client information (e.g., `ClientABC-Internal-Secret.ts` revealing client names, project nature, confidential status).

**Implications**:
- Client names could leak through file basenames in remote development scenarios
- Project nature revealed (Internal, Confidential, Draft keywords)
- Same issue affects workspace-relative paths (`<ws:0>/ClientABC-secret.txt`)
- Hash-only paths lose debugging value vs. preserving full basename

**Options Considered**:
- Option A: Hash Basename Too - Maximum privacy, loses debugging context
- Option B: Preserve Extension Only - `<hash>.ts` format, balances privacy and utility
- Option C: Use Generic Placeholder - `<file>.ts` format
- Option D: Truncate + Hash - `Cli-a7b3.ts` hybrid
- Option E: Accept Risk - Keep full basename, document as known limitation

**AI Recommendation**: Option B (Preserve Extension Only)
- Reasoning: Balances privacy (no client names) with utility (can see file types for debugging)

**Discussion Summary**: Team agreed extension-only preservation prevents client name leaks while maintaining minimal debugging context (knowing it's a TypeScript vs Python file helps troubleshooting).

**Decision**: Preserve extension only, hash the filename (`ClientABC-Secret.ts` → `<hash>.ts`)

**Action Items**:
- [x] Updated T004 to specify extension-only preservation
- [x] Updated T015 test to verify filename hashing
- [x] Updated T017 to document basename hashing decision in JSDoc

**Affects**: T004 (sanitizePath enhancement), T015 (unit tests), T017 (JSDoc documentation)

---

### Insight 2: Deep Research Pattern Incompatibility

**Did you know**: The deep research code snippets use `scrubPII(value: unknown): unknown` signature, but Phase 1 implemented `scrubPII(input: string): string`, and blindly adopting deep research code will break all Phase 2 instrumentation with TypeScript errors at every call site.

**Implications**:
- Breaking change across ScriptRegistry and processor telemetry calls
- TypeScript compilation errors if signature changed without updating call sites
- Risk of runtime errors if type coercion happens silently
- Need migration strategy for 4+ existing call sites

**Options Considered**:
- Option A: Overloaded Signatures - `scrubPII(string): string` AND `scrubPII(unknown): unknown`
- Option B: Single Generic Signature - Update all call sites with type assertions
- Option C: Separate Functions - `scrubString()` vs `scrubValue()`
- Option D: Generic with Type Narrowing - `scrubPII<T>(value: T): T`

**AI Recommendation**: Option A (Overloaded Signatures)
- Reasoning: Zero breaking changes to Phase 2, type-safe, allows gradual migration, future-proof for complex objects in Phase 4

**Discussion Summary**: Team chose overloads to maintain backward compatibility with Phase 2 without requiring call site updates, keeping implementation clean and type-safe.

**Decision**: Use overloaded function signatures for scrubPII()

**Action Items**:
- [x] Updated T003 to specify overloaded signatures
- [x] Added overload example to Implementation Outline step 3
- [x] Updated T014 unit tests to cover both string and object inputs

**Affects**: T003 (scrubPII implementation), T014 (unit tests), Implementation Outline

---

### Insight 3: Path Sanitization Recursion Gap in Stack Traces

**Did you know**: The current plan applies scrubPII() to stack traces, but scrubPII() only detects paths via simple regex patterns—and Phase 3's path sanitization enhancement is in sanitizePath(), which won't be called on stack trace strings unless explicitly integrated.

**Implications**:
- Remote development users leak PII (SSH hostnames, WSL paths in stack traces)
- Basename PII still leaks (client names in filenames appear in errors)
- Inconsistent sanitization (paths in properties get full treatment, stack traces don't)
- Deep research code assumes local-only (regex doesn't handle `vscode-remote://` scheme)

**Options Considered**:
- Option A: Make scrubPII() Call sanitizePath() - Regex detects paths, delegates to sanitizePath()
- Option B: Enhance Inline Path Regex - Extend regex for remote URIs and basename hashing
- Option C: Pre-Process Stack Traces - Explicit sanitizePath() call before scrubPII()
- Option D: Create Dedicated scrubStackTrace() - Purpose-built function

**AI Recommendation**: Option A (scrubPII Calls sanitizePath)
- Reasoning: Consistent sanitization, DRY principle, extensible, correct layering, performance acceptable for error paths

**Discussion Summary**: Team agreed consistent path handling across all strings (including stack traces) prevents remote URI leaks and ensures basename hashing applies everywhere.

**Decision**: scrubPII() calls sanitizePath() for path detection and sanitization (two-pass: paths first, then secrets)

**Action Items**:
- [x] Updated T002 to include path detection regex capturing vscode-* URIs
- [x] Updated T003 to specify sanitizePath() integration in string handling
- [x] Added test case to T014 for stack trace with remote URI
- [x] Updated Implementation Outline step 3 with path sanitization integration

**Affects**: T002 (regex patterns), T003 (scrubPII implementation), T014 (unit tests), Implementation Outline

---

### Insight 4: Missing Dependency Chain - T004 Must Complete Before T003

**Did you know**: The current task dependency chain allows T003 (implement scrubPII recursion) to start before T004 (implement sanitizePath remote URI handling) completes, but T003's implementation now depends on T004's enhancements being finished first.

**Implications**:
- Task ordering matters but isn't enforced in dependency graph
- Parallel execution risk (T003 could call incomplete sanitizePath())
- Test failures possible if T003 implemented before T004
- Silent degradation (code compiles but doesn't sanitize remote URIs correctly)

**Options Considered**:
- Option A: Update T003 Dependencies - Add T004 to T003's dependencies
- Option B: Implement Path Call as Stub - T003 calls sanitizePath() but incomplete until T004
- Option C: Split T003 Into Two Tasks - T003a (recursion), T003b (path integration)
- Option D: Make T004 Depend on T002 - Fully serialize the chain

**AI Recommendation**: Option A (Update T003 Dependencies)
- Reasoning: Correctness over parallelism, simple fix, clear intent, prevents race condition entirely

**Discussion Summary**: Team agreed enforcing correct ordering prevents subtle bugs where remote URIs fall through to incorrect sanitization logic.

**Decision**: Update T003 dependencies to include T004 (now: T001 → T002 → T004 → T003)

**Action Items**:
- [x] Updated T003 Dependencies from "T002" to "T002, T004"
- [x] Updated T003 Notes to explain why T004 is required

**Affects**: T003 (task dependencies)

---

### Insight 5: Performance Benchmark Test Uses Wrong Baseline

**Did you know**: T016's performance benchmark test validates scrubPII() completes in <5ms, but the deep research's <5ms requirement is for the entire telemetry event send operation, not just scrubPII() alone—and testing the wrong metric could allow 10ms total overhead even if unit tests pass.

**Implications**:
- Test passes but performance requirement violated (testing wrong metric)
- Cascading slowdown in high-frequency events (step-over debugging)
- User-visible lag possible (10ms blocks accumulate)
- Misleading confidence (green tests don't guarantee total overhead <5ms)

**Options Considered**:
- Option A: Split Budget - Sub-targets for each operation (scrubPII <2ms, etc.)
- Option B: Keep T016 + Add Integration Benchmark - Test both unit and integration
- Option C: Replace T016 with Integration Test - Full event send cycle
- Option D: Lower scrubPII() Target to <2ms - Leaves headroom
- Option E: Document As-Is - Accept risk, monitor in production

**AI Recommendation**: Option B (Keep T016 + Add Integration Benchmark)
- Reasoning: Tests both levels, debugging-friendly, realistic validation, prevents regressions

**Discussion Summary**: Team correctly noted fire-and-forget telemetry on error paths means even 10ms wouldn't be noticeable—performance benchmarking is premature optimization.

**Decision**: Remove performance benchmark test (T016) - not needed

**Action Items**:
- [x] Removed T016 from task table
- [x] Renumbered T017-T020 to T016-T019 (19 tasks total)
- [x] Updated Behavior Checklist to remove performance requirement
- [x] Added performance benchmarking to Non-Goals section
- [x] Updated Implementation Outline to remove performance test step

**Affects**: Tasks table (now 19 tasks), T016-T019 (renumbered), Behavior Checklist, Non-Goals, Implementation Outline

---

## Session Summary

**Insights Surfaced**: 5 critical insights identified and discussed
**Decisions Made**: 5 decisions reached through collaborative discussion
**Action Items Created**: 15 documentation/task updates completed during session
**Areas Requiring Updates**: Tasks table, Implementation Outline, Behavior Checklist, Non-Goals section

**Shared Understanding Achieved**: ✓

**Confidence Level**: High - We have high confidence about proceeding with Phase 3 implementation

**Next Steps**: Proceed with `/plan-6-implement-phase --phase "Phase 3: Privacy and Sanitization"` using updated tasks.md

**Notes**: All 5 insights resulted in immediate task updates to prevent implementation issues. Key privacy decisions (basename hashing, path sanitization integration, dependency ordering) now explicitly documented in task notes for implementer clarity.

---

## Phase Footnote Stubs

*This section will be populated by `/plan-6-implement-phase` during implementation.*

**Structure**:
- Footnotes will reference specific code changes (file:line)
- Each footnote will document: what was modified, why, and which task(s) it addresses
- Footnotes will be added to plan.md § 12 Footnote Ledger atomically during implementation

**Example format** (for reference, not created until plan-6):
```markdown
[^phase3-1]: **Enhanced Privacy Utilities** (Tasks T002-T004)
Modified [`privacy.ts`](../../../packages/extension/src/core/telemetry/privacy.ts) to add comprehensive secret patterns:
- Added GitHub token regex (6 prefixes), AWS key detection, JWT/UUID/IPv4 patterns
- Implemented recursive object scrubbing with SECRET_KEY_NAMES detection
- Enhanced sanitizePath() with remote URI handling (vscode-remote://, untitled)
```

---

## Phase 3 Documentation Tasks Footnotes

[^phase3-t019]: **Manual Privacy Validation Checklist Created** (Task T019)
Created [`privacy-validation-checklist.md`](privacy-validation-checklist.md) - comprehensive 8-section manual test checklist for Azure Portal verification:
- Section 1: Path Sanitization Validation (workspace/home/remote/absolute files)
- Section 2: PII Pattern Sanitization (emails, GitHub tokens, AWS keys, JWTs)
- Section 3: SECRET_KEY_NAMES Detection (password, token, apiKey, etc.)
- Section 4: Integration Testing (two-pass sanitization with paths + secrets)
- Section 5: Edge Cases (truncation, primitives, empty values)
- Section 6: Azure Portal Navigation (Kusto query guide)
- Section 7: Compliance Sign-Off (template for privacy verification)
- Section 8: Troubleshooting (what to do if PII found)
**Purpose**: Provides step-by-step manual validation procedures to ensure no PII leaks into Application Insights telemetry data. Ready for use in T022 (manual smoke test).

[^phase3-t020]: **JSDoc Comments Verification** (Task T020)
Verified comprehensive JSDoc coverage already exists in [`privacy.ts`](../../../../packages/extension/src/core/telemetry/privacy.ts) from T002-T004 implementation:
- `sanitizePath()` (lines 74-111): Documents transformation rules, rationale, Insight #1 (basename hashing + extension preservation), 5 @example cases
- `scrubPII()` (lines 194-247): Documents comprehensive replacement patterns, recursive handling, Insight #2 (overloaded signatures), Insight #3 (path sanitization integration), 4 @example cases
- `sanitizeParams()` (lines 347-379): Documents sanitization rules, rationale, @example with object/array omission
**Result**: All privacy utilities have complete JSDoc with @param, @returns, @example tags, privacy rationale explanations, and cross-references to Critical Insights. No additional documentation needed.

---

## Evidence Artifacts

**Execution Log**: `/workspaces/wormhole/docs/plans/22-application-insights-telemetry/tasks/phase-3-privacy-and-sanitization/execution.log.md`

This file will be created by `/plan-6-implement-phase` and will contain:
- Chronological implementation log
- Code diffs for each task
- Build verification output
- Test results (unit tests + manual smoke test)
- Azure Portal verification screenshots/query results
- Lessons learned and deviations from plan

---

## Directory Layout

```
docs/plans/22-application-insights-telemetry/
├── application-insights-telemetry-plan.md          # Master plan
├── application-insights-telemetry-spec.md          # Specification
├── deep-research.md                                # Deep research outputs
└── tasks/
    ├── phase-1-foundation-and-infrastructure/
    │   └── tasks.md                                # Phase 1 dossier (completed)
    ├── phase-2-core-event-instrumentation/
    │   └── tasks.md                                # Phase 2 dossier (completed)
    └── phase-3-privacy-and-sanitization/
        ├── tasks.md                                # This file (Phase 3 dossier)
        └── execution.log.md                        # Created by plan-6 during implementation
```

---

**Version**: 1.0
**Status**: READY - Awaiting GO from user to proceed with `/plan-6-implement-phase`
