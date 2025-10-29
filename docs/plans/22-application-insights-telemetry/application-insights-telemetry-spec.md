# Application Insights Telemetry Integration

## Summary

Add production-grade observability to the VSC-Bridge extension by integrating Application Insights telemetry. This feature enables the development team to understand how users interact with the extension, identify reliability issues, track performance characteristics, and make data-driven decisions about feature prioritization and bug fixes. Users benefit from improved extension quality and faster resolution of issues they encounter in the field.

The telemetry system will collect anonymized usage data, error events, and performance metrics while respecting user privacy and VS Code's telemetry preferences. Data collection will be transparent, opt-out-able, and compliant with VS Code marketplace requirements.

## Goals

- **Operational visibility**: Understand extension activation patterns, command usage frequency, and debug session outcomes in production environments
- **Error tracking**: Automatically capture structured errors, unexpected exceptions, and failure patterns to prioritize bug fixes
- **Performance monitoring**: Track execution duration for scripts/commands, identify slow operations, and detect capacity issues
- **User privacy**: Ensure no personally identifiable information (PII) is collected; sanitize file paths, workspace names, and code content
- **Compliance**: Meet VS Code marketplace telemetry requirements (transparency, opt-out mechanism, respect for global telemetry settings)
- **Developer experience**: Provide actionable dashboards and alerts to quickly identify regressions or production issues
- **Minimal overhead**: Ensure telemetry does not degrade extension performance or block the extension host
- **Testability**: Allow unit and integration tests to run without sending telemetry to production systems

## Non-Goals

- **Real-time user support**: Telemetry is for aggregate analysis, not for providing live help to individual users
- **Code content collection**: No user code, debug variable values, or sensitive workspace information will be transmitted
- **Fine-grained user behavior tracking**: Not tracking individual keystrokes, cursor movements, or detailed IDE interactions beyond high-level command usage
- **Custom analytics UI**: Using Application Insights portal and KQL queries; not building a custom dashboard application
- **Telemetry for MCP server**: This phase focuses on the VS Code extension only; MCP server telemetry is future work
- **Advanced correlation**: Debug session correlation and distributed tracing are follow-on work; initial implementation uses simple event tracking
- **A/B testing framework**: Feature flag telemetry for experiments is not in scope

## Acceptance Criteria

### AC1: Telemetry Initialization and Lifecycle
**Given** the extension activates in a workspace
**When** activation completes successfully
**Then** Application Insights telemetry is initialized and an `ExtensionActivated` event is sent containing:
- Session ID (unique per activation)
- VS Code version
- Extension version
- Platform (Windows/macOS/Linux/WSL)
- Remote development indicator (SSH/container/codespace/local)

**And when** the extension deactivates or the window closes
**Then** an `ExtensionDeactivated` event is sent with session duration, and all buffered telemetry is flushed within 3 seconds

### AC2: Respect User Privacy Settings
**Given** a user has VS Code telemetry disabled (`telemetry.telemetryLevel` = "off")
**When** the extension activates
**Then** no telemetry events are sent to Application Insights

**And given** a user has the extension-specific setting `vscBridge.telemetry.enabled` = false
**When** the extension activates
**Then** no telemetry events are sent, even if VS Code's global telemetry is enabled

**And given** the user changes telemetry settings during an active session
**When** the setting is toggled from enabled to disabled
**Then** no further events are sent, and no buffered events are flushed

### AC3: Script Execution Tracking
**Given** a user executes a script via the CLI or MCP (e.g., `vscb script run bp.set`)
**When** script execution begins
**Then** a `ScriptExecutionStarted` event is sent with script alias (sanitized)

**And when** script execution completes successfully
**Then** a `ScriptExecutionCompleted` event is sent containing:
- Script alias
- Execution duration (milliseconds)
- Success indicator
- Sanitized parameters (no file paths, no user data)

**And when** script execution fails with a structured error
**Then** a `ScriptExecutionFailed` event is sent containing:
- Script alias
- Error code (e.g., `E_TIMEOUT`, `E_NO_SESSION`)
- Execution duration
- Sanitized error details (no stack traces for expected errors)

### AC4: Error and Exception Tracking
**Given** an unexpected exception occurs during extension operation
**When** the exception is caught
**Then** an exception telemetry event is sent containing:
- Error message (scrubbed of PII)
- Stack trace
- Context (which operation was being performed)
- Severity level

**And given** an operational error occurs (e.g., `E_TIMEOUT`, `E_CAPACITY`)
**When** the error is handled
**Then** an error event (not exception) is sent containing:
- Error code
- Error category (timeout/capacity/session/validation)
- Context
- No stack trace (expected operational error)

### AC5: Privacy and Sanitization
**Given** a telemetry event contains a file path (e.g., from a breakpoint command)
**When** the event is prepared for transmission
**Then** the file path is transformed to:
- Workspace-relative path if within a workspace (e.g., `<ws:myproject>/src/main.ts`)
- Home-relative path with `~` if outside workspace (e.g., `~/external/lib.ts`)
- Hashed identifier if no safe relative path is available (e.g., `<abs#a1b2c3d4>`)

**And given** an error message or parameter may contain usernames, emails, or tokens
**When** the event is prepared
**Then** PII patterns are scrubbed (emails → `<email>`, tokens → `<token>`)

**And given** debug variable values or code content are available
**When** preparing any telemetry event
**Then** variable values and code snippets are **never** included

### AC6: Capacity and Performance Tracking
**Given** the filesystem bridge is processing commands
**When** the capacity limit is reached (10 concurrent jobs)
**Then** a `JobCapacityReached` event is sent with:
- Current in-flight job count
- Queue depth (if applicable)

**And when** the flood protection circuit breaker triggers (10 failures in 60 seconds)
**Then** a `JobFloodDetected` event is sent with:
- Failure count in window
- Time until retry allowed

**And when** command processing completes
**Then** a `CommandProcessingCompleted` event is sent with:
- Command name
- Duration (milliseconds)
- Success/failure indicator
- Cancellation indicator (if applicable)

### AC7: Development Mode Behavior
**Given** the extension is running in development mode (`extensionMode === Development`)
**When** the extension activates
**Then** telemetry is **disabled by default** unless `VSCBRIDGE_TELEMETRY_IN_DEV=1` environment variable is set

**And given** unit tests are running
**When** services initialize
**Then** telemetry uses an in-memory mock that does not send events to Application Insights

### AC8: Configuration and Transparency
**Given** a user installs the extension from the marketplace
**When** they view the extension details
**Then** the README clearly explains:
- What telemetry is collected (event types and properties)
- How to opt out (VS Code setting + extension setting)
- Data retention and usage policies
- Link to detailed telemetry documentation

**And given** a user navigates to VS Code settings
**When** they search for "vscBridge telemetry"
**Then** they find the `vscBridge.telemetry.enabled` setting with clear description

### AC9: Graceful Degradation
**Given** the Application Insights connection string is missing or invalid
**When** the extension activates
**Then** telemetry initialization logs a warning but extension functionality is unaffected

**And given** a network issue prevents telemetry transmission
**When** events are sent
**Then** telemetry failures do not throw exceptions that interrupt script execution

**And given** the telemetry service encounters an error
**When** sending an event
**Then** the error is logged to the Output channel but does not crash the extension

### AC10: Performance Overhead
**Given** telemetry is enabled and events are being sent
**When** a script executes
**Then** telemetry calls do not block the script execution (fire-and-forget pattern)

**And when** measuring the overhead of telemetry instrumentation
**Then** the performance impact on script execution is < 5ms per operation

**And when** the extension runs for extended periods (hours/days)
**Then** telemetry does not cause memory leaks or unbounded memory growth

## Risks & Assumptions

### Risks

1. **PII leakage**: Accidental inclusion of sensitive data in telemetry events (file paths with usernames, debug variable values, tokens in error messages)
   - *Mitigation*: Mandatory sanitization layer; code review checklist; automated tests validating no raw paths are sent

2. **Performance degradation**: Telemetry instrumentation slows down critical paths (script execution, debug stepping)
   - *Mitigation*: Fire-and-forget async pattern; benchmarking tests; sampling for high-frequency events

3. **User backlash**: Users may perceive telemetry as invasive or unnecessary
   - *Mitigation*: Transparent documentation; respect VS Code's global setting; clear opt-out mechanism; no data collection in dev mode by default

4. **Cost overruns**: High telemetry volume leads to unexpected Application Insights billing
   - *Mitigation*: Focus on core events only; avoid high-frequency spam; set daily ingestion caps; monitor costs in Azure portal

5. **Compliance issues**: Violating VS Code marketplace policies or privacy regulations (GDPR, CCPA)
   - *Mitigation*: Follow VS Code's official telemetry guide; no PII collection; transparent disclosure; user control

6. **Testing blind spots**: Tests pass with mock telemetry but production integration fails
   - *Mitigation*: Separate dev Application Insights resource for manual validation; integration tests with in-memory telemetry inspection

### Assumptions

- **Connection string availability**: A valid Application Insights connection string will be available at build/release time (hardcoded default with environment override)
- **VS Code API stability**: The `@vscode/extension-telemetry` wrapper and VS Code's telemetry APIs remain stable across VS Code versions
- **Network connectivity**: Users have outbound HTTPS access to Application Insights endpoints (or are in environments that block telemetry, which is acceptable)
- **User consent**: By using the extension with telemetry enabled, users consent to anonymized data collection (disclosed in README)
- **Development environments**: Developers have access to a separate Application Insights resource for testing (not polluting production data)
- **Schema evolution**: Telemetry event schemas may change over time; we will version events or support multiple schema shapes during transitions

## Testing Strategy

**Approach**: Manual Verification Only

**Rationale**: This is primarily configuration and infrastructure wiring. The complexity doesn't justify extensive automated testing; manual verification during development and deployment is sufficient.

**Verification Steps**:
1. Manual smoke test with `VSCBRIDGE_TELEMETRY_IN_DEV=1` in development mode
2. Verify events appear in Application Insights portal after extension activation
3. Test opt-out mechanisms (VS Code global setting + extension-specific setting)
4. Verify privacy sanitization by inspecting transmitted events for PII
5. Test graceful degradation with invalid/missing connection string

**Focus Areas**: Privacy verification (no raw paths/PII in events), initialization/shutdown behavior, setting respect

**Excluded**: Automated unit tests, integration tests, mocks/stubs

## Documentation Strategy

**Location**: Hybrid (README + docs/)

**Rationale**: Users need quick overview and opt-out info in README; developers/curious users need detailed event catalog, privacy policy, and KQL queries in docs/.

**Content Split**:
- **README.md**:
  - Brief "Telemetry" section explaining what data is collected (high-level)
  - How to opt-out (link to VS Code telemetry setting + extension-specific setting)
  - Link to detailed documentation in docs/telemetry.md
  - Privacy statement summary (no PII, workspace-relative paths only)

- **docs/telemetry.md**:
  - Complete event catalog (event names, properties, measurements)
  - Detailed privacy policy (sanitization rules, data retention, GDPR compliance)
  - Example KQL queries for developers
  - Connection string management for contributors
  - Troubleshooting telemetry issues

**Target Audience**:
- README: End users installing from marketplace
- docs/: Extension contributors, power users, privacy-conscious users wanting details

**Maintenance**: Update docs/telemetry.md whenever new events are added; keep README section stable (high-level only)

## Open Questions

### Resolved

1. ✅ **Connection string management** → **RESOLVED**: Hardcoded connection string in code with clear TODO comment. `APPLICATIONINSIGHTS_CONNECTION_STRING` environment variable overrides if present. (2025-01-24)

2. ✅ **Retention policy** → **RESOLVED**: Use Application Insights default of 90 days. Sufficient for debugging and trend analysis without excessive cost. (2025-01-24)

3. ✅ **Opt-in vs. opt-out** → **RESOLVED**: Opt-out (enabled by default). Respects VS Code's global telemetry setting. User must explicitly disable in settings if they want no telemetry. Follows VS Code team best practices. (2025-01-24)

4. ✅ **Multi-workspace behavior** → **RESOLVED**: Single session per extension host (regardless of number of workspace folders). Simpler, matches extension lifecycle. (2025-01-24)

5. ✅ **Remote development nuances** → **RESOLVED**: Use `common.remotename` dimension provided by @vscode/extension-telemetry. No special handling needed; standard sanitization applies. (2025-01-24)

6. ✅ **Documentation location** → **RESOLVED**: Hybrid approach with overview in README.md and detailed docs in docs/telemetry.md. (2025-01-24)

### Deferred to Post-Deployment

7. **Event volume estimation**: What is the expected monthly telemetry volume (in GB) based on anticipated user base and event frequency? How does this translate to cost?
   - *Decision needed by*: After initial deployment (monitor for 2 weeks)
   - *Deferred*: Cannot estimate without baseline production data

8. **Sampling strategy**: Should high-frequency events (e.g., DAP output events, repeated errors) be sampled? If so, what sampling rates are appropriate?
   - *Decision needed by*: Phase 2 (follow-on work for debug session telemetry)
   - *Deferred*: Core events only in this phase; sampling decisions wait for high-frequency event implementation

9. **Alerting thresholds**: What error rates, latency percentiles, or capacity thresholds should trigger alerts to the development team?
   - *Decision needed by*: Post-deployment, after baseline established
   - *Deferred*: Requires at least 1 week of production data to set meaningful thresholds

### Deferred to Phase 2

10. **Correlation IDs**: How should debug session events be correlated (custom `corrId` dimension vs. Application Insights operation IDs)? Is there value in correlating across CLI invocations?
    - *Decision needed by*: Phase 2 (debug session correlation)
    - *Deferred*: Out of scope for initial implementation; simple event tracking only

## Clarifications

### Session 2025-01-24

**Q1: Testing Strategy**
- **Answer**: Manual verification only
- **Rationale**: Configuration/infrastructure wiring doesn't justify automated testing overhead
- **Updated**: Added `## Testing Strategy` section

**Q2: Documentation Strategy**
- **Answer**: Hybrid (README + docs/)
- **Rationale**: Users need quick overview; developers need detailed event catalog
- **Updated**: Added `## Documentation Strategy` section

**Q3: README vs docs/ Split**
- **Answer**: README gets overview + opt-out; docs/ gets comprehensive details
- **Rationale**: Keep README user-focused and concise; docs/ for deep dive
- **Updated**: Documented content split in Documentation Strategy

**Q4: Connection String Management**
- **Answer**: Hardcoded + environment override
- **Rationale**: Simple default with flexibility for different environments
- **Updated**: Resolved Open Question #1

**Q5: Opt-in vs Opt-out**
- **Answer**: Opt-out (default enabled)
- **Rationale**: Follows VS Code team best practices; respects global telemetry setting
- **Updated**: Resolved Open Question #7

**Q6: Multi-workspace Behavior**
- **Answer**: Single session per extension host
- **Rationale**: Simpler, matches extension lifecycle
- **Updated**: Resolved Open Question #8

**Q7: Data Retention**
- **Answer**: 90 days (default)
- **Rationale**: Sufficient for debugging; lower cost
- **Updated**: Resolved Open Question #6

**Q8: Remote Development Handling**
- **Answer**: Use common.remotename only
- **Rationale**: No special handling needed; standard sanitization applies
- **Updated**: Resolved Open Question #9

---

**Specification Version**: 1.1
**Created**: 2025-01-24
**Updated**: 2025-01-24 (clarifications added)
**Status**: Ready for architecture phase (`/plan-3-architect`)
