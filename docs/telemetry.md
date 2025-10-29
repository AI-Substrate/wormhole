# Telemetry Documentation

## Introduction

VSC-Bridge collects anonymous usage metrics to improve reliability and performance. This telemetry system uses Microsoft Application Insights to track extension lifecycle events, script execution patterns, and error occurrences. **No personally identifiable information (PII) is collected.**

All telemetry respects VS Code's global telemetry settings, enterprise policies, and provides extension-specific opt-out controls.

---

## Event Catalog

VSC-Bridge emits 9 event types to track extension lifecycle, script execution, and processor capacity. All events include `telemetrySchemaVersion: '2'` for privacy-enhanced tracking.

### Event Types

| Event Name | Properties | Measurements | When Sent |
|------------|-----------|--------------|-----------|
| **ExtensionActivated** | sessionId, vscodeVersion, extensionVersion, platform, remoteName, telemetrySchemaVersion | – | Extension activation in `activate()` |
| **ExtensionDeactivated** | telemetrySchemaVersion | sessionDuration | Extension deactivation in `deactivate()` |
| **ScriptExecutionStarted** | sessionId, alias, mode, requestId, telemetrySchemaVersion | – | Script entry (after createMeta) |
| **ScriptExecutionCompleted** | sessionId, alias, success='true', telemetrySchemaVersion | durationMs | Script success (before ok()) |
| **ScriptExecutionFailed** | sessionId, alias, errorCode, success='false', errorMessage, stackPreview, telemetrySchemaVersion | durationMs | ActionScript failure or exception |
| **JobCapacityReached** | sessionId, reason='capacity_exceeded', telemetrySchemaVersion | inFlightCount, maxConcurrent | Processor capacity limit (≥10 jobs) |
| **JobFloodDetected** | sessionId, reason='flood_protection', telemetrySchemaVersion | failureCount, retryAfterSeconds | Flood protection (max 1 event/60s) |
| **CommandProcessingCompleted** | sessionId, scriptName, success, cancelled, telemetrySchemaVersion | durationMs | Processor completion (success/error/cancelled) |

### Property Details

**Common Properties**:
- `sessionId`: UUID v4 generated at extension activation, used to correlate events within a single VS Code session
- `telemetrySchemaVersion`: Version identifier (currently `'2'`) for privacy-enhanced events

**Platform Information**:
- `platform`: Operating system (e.g., `'linux'`, `'darwin'`, `'win32'`)
- `remoteName`: Remote environment type (e.g., `'ssh-remote'`, `'wsl'`, `'codespaces'`, or `undefined` for local)
- `vscodeVersion`: VS Code version (e.g., `'1.85.0'`)
- `extensionVersion`: VSC-Bridge version (e.g., `'0.1.0'`)

**Script Execution**:
- `alias`: Script name (e.g., `'bp.set'`, `'debug.step-over'`)
- `mode`: Execution mode (`'http-api'` or `'cli'`)
- `requestId`: UUID v4 for single request correlation
- `errorCode`: Error taxonomy (e.g., `'InvalidInput'`, `'ExecutionTimeout'`, `'NoActiveSession'`)
- `errorMessage`: Sanitized error message (PII scrubbed)
- `stackPreview`: First line of stack trace (PII scrubbed)

**Measurements**:
- `durationMs`: Execution duration in milliseconds
- `sessionDuration`: Time from activation to deactivation in milliseconds
- `inFlightCount`: Number of concurrent jobs when capacity reached
- `maxConcurrent`: Maximum allowed concurrent jobs (typically 10)
- `failureCount`: Number of failures triggering flood protection
- `retryAfterSeconds`: Recommended retry delay (typically 60)

### Example Events

**ExtensionActivated**:
```json
{
  "name": "ExtensionActivated",
  "properties": {
    "sessionId": "a7b3c2d1-e4f5-6789-0abc-def123456789",
    "vscodeVersion": "1.85.0",
    "extensionVersion": "0.1.0",
    "platform": "linux",
    "remoteName": "ssh-remote",
    "telemetrySchemaVersion": "2"
  }
}
```

**ScriptExecutionCompleted**:
```json
{
  "name": "ScriptExecutionCompleted",
  "properties": {
    "sessionId": "a7b3c2d1-e4f5-6789-0abc-def123456789",
    "alias": "debug.step-over",
    "success": "true",
    "telemetrySchemaVersion": "2"
  },
  "measurements": {
    "durationMs": 245
  }
}
```

**ScriptExecutionFailed**:
```json
{
  "name": "ScriptExecutionFailed",
  "properties": {
    "sessionId": "a7b3c2d1-e4f5-6789-0abc-def123456789",
    "alias": "bp.set",
    "errorCode": "InvalidInput",
    "success": "false",
    "errorMessage": "Missing required parameter: path",
    "telemetrySchemaVersion": "2"
  },
  "measurements": {
    "durationMs": 15
  }
}
```

---

## Privacy Policy

### What's NOT Collected

**VSC-Bridge does NOT collect any of the following:**

- ❌ **Source code** - File contents, code snippets, or any programming logic
- ❌ **Variable values** - Debug variable values, stack frame locals, or runtime data
- ❌ **Raw file paths** - Absolute paths, workspace folder names, or directory structures
- ❌ **Usernames** - Windows usernames, Unix usernames, or account identifiers
- ❌ **Email addresses** - No email patterns collected in any form
- ❌ **Credentials** - GitHub tokens, AWS keys, JWTs, API keys, passwords, or any authentication secrets
- ❌ **Network information** - IPv4 addresses, remote hostnames, or SSH connection strings
- ❌ **Console output** - Debug console logs, terminal output, or program stdout/stderr

### What IS Collected

**VSC-Bridge collects only these anonymous metrics:**

- ✅ **Session ID** - Random UUID v4 for correlating events within a single VS Code session
- ✅ **Version information** - VS Code version, extension version
- ✅ **Platform metadata** - Operating system, remote environment type
- ✅ **Script execution metrics** - Script alias, success/failure status, execution duration
- ✅ **Error codes** - Structured error taxonomy (e.g., `InvalidInput`, `ExecutionTimeout`)
- ✅ **Sanitized error messages** - Error messages with all PII scrubbed
- ✅ **Workspace-relative paths** - File paths transformed to `<ws:0>/file.ts` format
- ✅ **File extensions** - File type (e.g., `.ts`, `.py`, `.js`) for debugging context

### Sanitization Rules

All data passes through comprehensive sanitization before transmission:

#### 1. Path Sanitization

| Input | Output | Rule |
|-------|--------|------|
| `/workspaces/myproject/src/file.ts` | `<ws:0>/src/file.ts` | Workspace-relative transformation |
| `/home/user/project/file.ts` | `~/project/file.ts` | Home directory-relative |
| `vscode-remote://ssh-remote+hostname/file.ts` | `<ssh:a7b3c2d1>/d9e4f5a6.ts` | Remote URI with authority + basename hashing |
| `/random/absolute/path/file.ts` | `<abs:hash>/hash.ts` | Absolute path with directory + basename hashing |
| `untitled:Untitled-1` | `<untitled>` | Untitled files |

**Key Privacy Features**:
- Workspace folder names removed (use index `<ws:0>` instead)
- Remote hostnames hashed with SHA1 (8-char hash)
- File basenames hashed with extension preserved (e.g., `ClientABC.ts` → `a7b3c2d1.ts`)

#### 2. PII Pattern Scrubbing

| Pattern | Example | Replacement |
|---------|---------|-------------|
| Email addresses | `user@example.com` | `<email>` |
| GitHub tokens | `ghp_1234567890abcdefg` | `<github_token>` |
| AWS Access Keys | `AKIAIOSFODNN7EXAMPLE` | `<aws_access_key_id>` |
| AWS Secret Keys | `wJalrXUtnFEMI/K7MDENG/bPx...` | `<aws_secret_key>` |
| JWTs | `eyJhbGc...e30.abc123` | `<jwt>` |
| UUIDs | `550e8400-e29b-41d4-a716-446655440000` | `<uuid>` |
| IPv4 addresses | `192.168.1.100` | `<ip>` |
| URL credentials | `https://user:pass@example.com` | `https://<user>:<pass>@example.com` |

**Regex Patterns Used**:
- **Email**: `/[\w.+-]+@[\w.-]+\.\w+/g`
- **GitHub tokens**: `/\b(ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9]{36,255}\b/g`
- **AWS Access Keys**: `/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g`
- **JWTs**: `/\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g`

#### 3. SECRET_KEY_NAMES Detection

Object properties matching sensitive patterns are automatically redacted:

```javascript
// Pattern: /password|passphrase|authorization|auth[_-]?token|token|secret|apikey|api[_-]?key|bearer/i

// Before sanitization:
{ config: { apiKey: 'secret123', endpoint: 'https://api.example.com' } }

// After sanitization:
{ config: { apiKey: '<redacted>', endpoint: 'https://api.example.com' } }
```

#### 4. String Truncation

| Content Type | Limit | Result |
|--------------|-------|--------|
| Strings | 2048 characters | First 2048 chars + `'…<truncated>'` |
| Arrays | 50 items | First 50 items + truncation marker |
| Objects | 50 keys | First 50 keys + truncation marker |

### Data Retention

- **Application Insights default retention**: 90 days
- **No long-term storage**: Events automatically deleted after 90 days
- **No backups or archives**: Telemetry data is transient

### GDPR/CCPA Compliance

**Privacy-first design**:
- No PII collection by design (not just policy)
- All paths sanitized to workspace-relative or hashed format
- All error messages scrubbed with comprehensive regex patterns
- Opt-out available at any time (no restart required)

**User Rights**:
- **Right to opt-out**: Disable via VS Code settings (instant effect)
- **Right to transparency**: Complete event catalog documented above
- **Right to data deletion**: Events auto-deleted after 90 days (no manual request needed)

**Compliance Note**: VSC-Bridge is designed to comply with GDPR and CCPA privacy requirements through privacy-by-design principles. However, users should consult legal counsel for specific compliance questions.

---

## Configuration

### Extension Setting

**Setting**: `vscBridge.telemetry.enabled`
- **Type**: Boolean
- **Default**: `true` (opt-out model)
- **Location**: VS Code Settings → Extensions → VSC-Bridge

**How to disable**:
1. Open VS Code Settings (`Cmd+,` / `Ctrl+,`)
2. Search for "telemetry"
3. Locate **"Vsc Bridge: Telemetry Enabled"**
4. Uncheck the checkbox

Changes take effect **immediately** (no restart required).

### VS Code Global Setting

VSC-Bridge respects VS Code's global telemetry setting via the `vscode.env.isTelemetryEnabled` API.

**What this means**:
- If you've disabled telemetry globally in VS Code, VSC-Bridge telemetry is also disabled
- Enterprise policies (Group Policy, MDM) that disable telemetry are automatically respected
- CLI flags (`--disable-telemetry`) are honored
- Remote contexts (SSH, WSL, Codespaces) with telemetry restrictions are respected

**Important**: VSC-Bridge uses the **API** (`vscode.env.isTelemetryEnabled`), not the configuration setting, to ensure enterprise policies and CLI flags are properly respected.

### Development Mode

**Requirement**: Telemetry is **disabled by default** in development mode (when debugging the extension).

**To enable in dev mode**:
```bash
export VSCBRIDGE_TELEMETRY_IN_DEV=1
```

This prevents accidental telemetry collection during local debugging and testing.

### Configuration Precedence Chain

Telemetry is enabled **only when ALL conditions are met** (highest to lowest priority):

1. **VS Code Global**: `vscode.env.isTelemetryEnabled === true`
   - Accounts for enterprise policies, CLI flags, remote contexts
   - **Always disables** if `false`

2. **Extension Setting**: `vscBridge.telemetry.enabled === true` (default)
   - User-level control for VSC-Bridge only
   - **Always disables** if `false`

3. **Development Mode**: `extensionMode !== Development` OR `VSCBRIDGE_TELEMETRY_IN_DEV=1`
   - Development mode requires explicit opt-in
   - Prevents accidental telemetry during debugging

4. **Environment Variable** (optional): `APPLICATIONINSIGHTS_CONNECTION_STRING`
   - Overrides default connection string for testing
   - Used for testing with alternate Azure resources

**Rationale**: System-level settings (enterprise) override user-level, user-level overrides developer-level, developer-level overrides defaults.

### Dynamic Changes

**Dispose/Recreate Pattern**: When you toggle the `vscBridge.telemetry.enabled` setting:

- **Disabled**: TelemetryReporter is disposed and set to `undefined`, freeing memory and resources
- **Re-enabled**: New TelemetryReporter instance created
- **No restart required**: Changes take effect immediately

**User Feedback**: OutputChannel logs show enable/disable events:
```
[Telemetry] ✅ Enabled per user setting
[Telemetry] ⚠️  Disabled per user setting
```

---

## KQL Queries

Use these Kusto Query Language (KQL) examples in Azure Portal → Application Insights → Logs to analyze VSC-Bridge telemetry data.

### Session Correlation

Find all events for a specific session:

```kql
customEvents
| where timestamp > ago(7d)
| where tostring(customDimensions.sessionId) == "YOUR-SESSION-ID-HERE"
| project timestamp, name, customDimensions, customMeasurements
| order by timestamp asc
```

### Script Success Rate

Calculate success rate by script alias:

```kql
customEvents
| where timestamp > ago(7d)
| where name startsWith "ScriptExecution"
| extend alias = tostring(customDimensions.alias)
| extend success = tostring(customDimensions.success)
| summarize
    total = count(),
    successful = countif(success == "true"),
    failed = countif(success == "false")
    by alias
| extend success_rate = round(100.0 * successful / total, 2)
| project alias, total, successful, failed, success_rate
| order by total desc
```

### P95 Duration by Script

Identify slow scripts using percentile analysis:

```kql
customEvents
| where timestamp > ago(7d)
| where name == "ScriptExecutionCompleted"
| extend alias = tostring(customDimensions.alias)
| extend durationMs = todouble(customMeasurements.durationMs)
| summarize
    count = count(),
    p50 = percentile(durationMs, 50),
    p95 = percentile(durationMs, 95),
    p99 = percentile(durationMs, 99)
    by alias
| project alias, count, p50, p95, p99
| order by p95 desc
```

### Error Categorization

Group errors by error code:

```kql
customEvents
| where timestamp > ago(7d)
| where name == "ScriptExecutionFailed"
| extend errorCode = tostring(customDimensions.errorCode)
| extend alias = tostring(customDimensions.alias)
| summarize count = count() by errorCode, alias
| order by count desc
```

### Capacity Events

Monitor capacity limit hits over time:

```kql
customEvents
| where timestamp > ago(7d)
| where name in ("JobCapacityReached", "JobFloodDetected")
| extend reason = tostring(customDimensions.reason)
| extend inFlightCount = toint(customMeasurements.inFlightCount)
| extend failureCount = toint(customMeasurements.failureCount)
| project timestamp, name, reason, inFlightCount, failureCount
| order by timestamp desc
```

### Privacy Verification - No Raw Paths

Verify no raw file paths are leaking (should return 0 results):

```kql
customEvents
| where timestamp > ago(7d)
| extend props = todynamic(customDimensions)
| mvexpand props
| where props contains '/workspaces/' or props contains '/Users/' or props contains 'C:\\'
| project timestamp, name, props
```

### Privacy Verification - No Emails

Verify no email addresses are leaking (should return 0 results):

```kql
customEvents
| where timestamp > ago(7d)
| extend props = todynamic(customDimensions)
| mvexpand props
| where props matches regex @'[\w.+-]+@[\w.-]+\.\w+'
| project timestamp, name, props
```

### Privacy Verification - No GitHub Tokens

Verify GitHub tokens are redacted (should return 0 results):

```kql
customEvents
| where timestamp > ago(7d)
| extend props = todynamic(customDimensions)
| mvexpand props
| where props matches regex @'\b(ghp|gho|ghu|ghs|ghr|github_pat)_'
| project timestamp, name, props
```

---

## Contributor Guide

Information for contributors extending or debugging the telemetry system.

### Connection String Management

**Default Connection String**: Hardcoded in `TelemetryService.ts` (safe per Microsoft guidance):
```typescript
const DEFAULT_CONNECTION_STRING =
  'InstrumentationKey=64d866ab-b513-4527-b9e3-5ad505d5fe61;' +
  'IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;' +
  'LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/;' +
  'ApplicationId=80548c1f-e94b-4ef8-b9cf-3b1c999f05d9';
```

**Environment Variable Override**:
```bash
export APPLICATIONINSIGHTS_CONNECTION_STRING="YOUR-CONNECTION-STRING-HERE"
```

Use this for testing with alternate Azure resources without modifying code.

### Azure Portal Access

**Location**: Azure Portal → Application Insights → `vsc-bridge-telemetry`

**Navigation**:
1. Open [Azure Portal](https://portal.azure.com)
2. Navigate to Application Insights resource
3. Click "Logs" in left sidebar
4. Use KQL queries from above section

**Ingestion Delay**: Events appear in portal **2-5 minutes** after transmission.

### Development Mode Opt-In

**Requirement**: Telemetry is **disabled by default** when debugging the extension (development mode).

**To enable for testing**:
```bash
# Export environment variable
export VSCBRIDGE_TELEMETRY_IN_DEV=1

# Launch Extension Host (F5 in VS Code)
# Telemetry will now be sent from dev environment
```

**Verify enabled**:
- Check OutputChannel: `[Telemetry] ✅ Initialized`
- Events should appear in Azure Portal after 2-5 minutes

### Adding New Events

When adding new telemetry events:

1. **Define event in appropriate file**:
   - Lifecycle events → `extension.ts`
   - Script events → `ScriptRegistry.ts`
   - Processor events → `processor.ts`

2. **Use privacy utilities**:
   ```typescript
   import { sanitizePath, scrubPII } from './core/telemetry/privacy';

   // Always sanitize paths
   const safePath = sanitizePath(filePath, vscode.workspace.workspaceFolders);

   // Always scrub error messages
   const safeMessage = scrubPII(error.message);
   ```

3. **Include telemetrySchemaVersion**:
   ```typescript
   telemetry?.sendEvent('NewEventName', {
     sessionId: telemetry.getSessionId(),
     someProperty: 'value',
     telemetrySchemaVersion: '2'  // Required for privacy-enhanced events
   }, {
     someMeasurement: 123
   });
   ```

4. **Update documentation**:
   - Add event to Event Catalog table above
   - Document all properties and measurements
   - Provide example JSON

---

## Troubleshooting

### Events Not Appearing in Azure Portal

**Symptom**: You're sending events but they don't appear in Application Insights.

**Possible Causes**:

1. **Ingestion delay**: Wait 2-5 minutes after event transmission
2. **Telemetry disabled globally**: Check VS Code Settings → "Telemetry: Telemetry Level" is not "off"
3. **Telemetry disabled for extension**: Check VS Code Settings → "Vsc Bridge: Telemetry Enabled" is checked
4. **Development mode**: Verify `VSCBRIDGE_TELEMETRY_IN_DEV=1` is set if debugging extension
5. **Connection string invalid**: Check OutputChannel for errors

**Debugging Steps**:

```bash
# 1. Check OutputChannel logs
# Open VS Code → View → Output → Select "VSC-Bridge"
# Look for [Telemetry] prefix messages:
[Telemetry] ✅ Initialized  # Good
[Telemetry] ⚠️  Disabled per VS Code setting  # Telemetry off
[Telemetry] ⚠️  Failed to initialize: <reason>  # Error occurred

# 2. Verify environment variable (if testing in dev)
echo $VSCBRIDGE_TELEMETRY_IN_DEV
# Should output: 1

# 3. Check extension mode
# If extensionMode === Development (debugging), telemetry requires env var
```

### Telemetry Disabled

**Symptom**: OutputChannel shows `[Telemetry] ⚠️  Disabled per user setting`

**Cause**: Either VS Code global telemetry is disabled, or extension-specific setting is disabled.

**Fix**:

1. **Check VS Code global setting**:
   - Open Settings (`Cmd+,` / `Ctrl+,`)
   - Search "Telemetry: Telemetry Level"
   - Ensure not set to "off"

2. **Check extension setting**:
   - Open Settings
   - Search "Vsc Bridge: Telemetry Enabled"
   - Ensure checkbox is checked

3. **Verify change took effect**:
   - Changes are immediate (no restart)
   - OutputChannel should show: `[Telemetry] ✅ Enabled per user setting`

### Connection String Invalid

**Symptom**: OutputChannel shows `[Telemetry] ⚠️  Failed to initialize: <connection string error>`

**Cause**: Invalid `APPLICATIONINSIGHTS_CONNECTION_STRING` environment variable.

**Fix**:

```bash
# Unset invalid connection string
unset APPLICATIONINSIGHTS_CONNECTION_STRING

# Restart VS Code / Extension Host
# Extension will use default connection string
```

### Development Mode Disabled

**Symptom**: Telemetry not sent when debugging extension (F5 launch).

**Cause**: Development mode requires explicit opt-in via environment variable.

**Fix**:

```bash
# Set environment variable
export VSCBRIDGE_TELEMETRY_IN_DEV=1

# Reload VS Code window
# Cmd+Shift+P / Ctrl+Shift+P → "Developer: Reload Window"

# Re-launch Extension Host (F5)
# OutputChannel should show: [Telemetry] ✅ Initialized
```

### Privacy Verification Failed

**Symptom**: Privacy verification KQL queries return results (indicating PII leaks).

**Action**: **Immediately investigate**. PII leaks are a critical privacy violation.

**Debug Steps**:

1. **Identify leaked property**:
   - Run privacy verification queries above
   - Note which property contains PII

2. **Check sanitization**:
   - Verify `sanitizePath()` called for file paths
   - Verify `scrubPII()` called for error messages
   - Check that property is not bypassing privacy utilities

3. **Fix and re-verify**:
   - Update code to use privacy utilities
   - Re-deploy and wait 5-10 minutes
   - Re-run privacy verification queries
   - Confirm 0 results

4. **Report to team**: If PII leak found, report immediately so production data can be investigated.

