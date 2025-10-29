# Privacy Validation Checklist - Application Insights Telemetry

This checklist provides manual verification steps to confirm PII sanitization is working correctly in Azure Application Insights.

**Purpose**: Ensure no Personally Identifiable Information (PII) leaks into telemetry data.

**When to Use**: After Phase 3 implementation, before production release, and periodically as a compliance audit.

---

## Prerequisites

- [ ] Extension built with `just build`
- [ ] Extension loaded in VS Code Extension Host
- [ ] Azure Application Insights resource created
- [ ] Connection string configured in `packages/extension/src/core/telemetry/client.ts`
- [ ] Test workspace open with sample files (Python, JS, TypeScript, etc.)

---

## 1. Path Sanitization Validation

### 1.1 Workspace Files
- [ ] **Action**: Trigger telemetry event with workspace file path (e.g., run a debug session on `/workspaces/wormhole/test/python/test_example.py`)
- [ ] **Verify in Azure Portal**: Search for custom events, confirm path appears as `<ws:0>/test/python/test_example.py`
- [ ] **Critical**: Confirm workspace name "wormhole" does NOT appear in raw telemetry data
- [ ] **Success Criteria**: Only workspace index visible, no workspace name leak

### 1.2 Home Directory Files
- [ ] **Action**: Trigger event with home directory file (e.g., open `~/Documents/test.py` and debug)
- [ ] **Verify in Azure Portal**: Path appears as `~/Documents/test.py`
- [ ] **Critical**: Confirm username (e.g., "node", "user", real username) does NOT appear
- [ ] **Success Criteria**: Tilde format used, no username leak

### 1.3 Remote URIs (SSH/WSL/Codespaces)
- [ ] **Action**: If testing in remote environment, trigger event with remote file
- [ ] **Verify in Azure Portal**: Path appears as `<remoteName:hash>/hash.ext`
- [ ] **Critical**: Confirm hostname/authority does NOT appear in plaintext
- [ ] **Critical**: Confirm filename is hashed but extension preserved (e.g., `.ts`, `.py`)
- [ ] **Success Criteria**: Authority hashed, filename hashed, extension preserved

### 1.4 Absolute Paths (Non-workspace)
- [ ] **Action**: Open a file outside workspace/home (e.g., `/tmp/test.js`) and trigger event
- [ ] **Verify in Azure Portal**: Path appears as `<abs:hash>/hash.js`
- [ ] **Critical**: Confirm directory path is hashed
- [ ] **Critical**: Confirm filename is hashed but extension preserved (Insight #1)
- [ ] **Success Criteria**: `<abs:hash>/hash.ext` format, no plaintext directory/filename

---

## 2. PII Pattern Sanitization Validation

### 2.1 Email Addresses
- [ ] **Action**: Trigger error with email in message (e.g., add `throw new Error('Contact admin@example.com')` to test file)
- [ ] **Verify in Azure Portal**: Email appears as `<email>` in error message
- [ ] **Critical**: Confirm actual email address does NOT appear
- [ ] **Success Criteria**: `<email>` placeholder used

### 2.2 GitHub Tokens
- [ ] **Action**: Trigger error with GitHub token in message (e.g., `ghp_1234567890abcdefghijklmnopqrst`)
- [ ] **Verify in Azure Portal**: Token appears as `<github_token>`
- [ ] **Critical**: Confirm actual token does NOT appear
- [ ] **Success Criteria**: `<github_token>` placeholder used

### 2.3 AWS Access Keys
- [ ] **Action**: Trigger error with AWS key in message (e.g., `AKIAIOSFODNN7EXAMPLE`)
- [ ] **Verify in Azure Portal**: Key appears as `<aws_access_key_id>`
- [ ] **Critical**: Confirm actual key does NOT appear
- [ ] **Success Criteria**: `<aws_access_key_id>` placeholder used

### 2.4 JWTs
- [ ] **Action**: Trigger error with JWT in message (e.g., `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123`)
- [ ] **Verify in Azure Portal**: JWT appears as `<jwt>`
- [ ] **Critical**: Confirm actual JWT does NOT appear
- [ ] **Success Criteria**: `<jwt>` placeholder used

---

## 3. Secret Key Detection (SECRET_KEY_NAMES)

### 3.1 Parameter Sanitization
- [ ] **Action**: Trigger event with sensitive parameter key (e.g., script with `--param password=secret123`)
- [ ] **Verify in Azure Portal**: Parameter value appears as `<redacted>`
- [ ] **Critical**: Confirm actual password does NOT appear
- [ ] **Success Criteria**: SECRET_KEY_NAMES pattern detected, value redacted

### 3.2 Common Secret Keys
Test these parameter names trigger redaction:
- [ ] `password` → `<redacted>`
- [ ] `token` → `<redacted>`
- [ ] `apiKey` → `<redacted>`
- [ ] `accessToken` → `<redacted>`
- [ ] `clientSecret` → `<redacted>`

---

## 4. Integration Testing (Two-Pass Sanitization - Insight #3)

### 4.1 Nested Objects with Paths and Secrets
- [ ] **Action**: Trigger event with complex parameter object containing both path and secret:
  ```typescript
  {
    config: {
      filePath: '/workspaces/wormhole/src/test.ts',
      apiKey: 'secret123'
    }
  }
  ```
- [ ] **Verify in Azure Portal**: Both sanitization passes worked:
  - `filePath` → `<ws:0>/src/test.ts` (path sanitized)
  - `apiKey` → `<redacted>` (secret key detected)
- [ ] **Success Criteria**: Two-pass sanitization correctly applied

### 4.2 Error Messages with Multiple PII Types
- [ ] **Action**: Trigger error with multiple PII patterns:
  ```
  Error: User john@example.com failed auth with token ghp_abc123 at /home/user/file.ts
  ```
- [ ] **Verify in Azure Portal**: All patterns scrubbed:
  - `john@example.com` → `<email>`
  - `ghp_abc123...` → `<github_token>`
  - `/home/user/file.ts` → `~/file.ts`
- [ ] **Success Criteria**: Multiple PII patterns in single string all detected

---

## 5. Edge Cases and Regression Tests

### 5.1 Long Strings (Truncation)
- [ ] **Action**: Trigger event with very long parameter value (>2048 chars)
- [ ] **Verify in Azure Portal**: String truncated with `…<truncated>` marker
- [ ] **Success Criteria**: Telemetry payload size controlled

### 5.2 Primitives (Numbers, Booleans)
- [ ] **Action**: Trigger event with numeric/boolean parameters
- [ ] **Verify in Azure Portal**: Values appear as strings (e.g., `"42"`, `"true"`)
- [ ] **Success Criteria**: Type conversion works, no data loss

### 5.3 Empty/Null Values
- [ ] **Action**: Trigger event with empty string, null, undefined parameters
- [ ] **Verify in Azure Portal**: Values handled gracefully (no crashes)
- [ ] **Success Criteria**: No errors, graceful handling

---

## 6. Azure Portal Navigation

### How to Access Telemetry Data

1. **Navigate to Azure Portal**: https://portal.azure.com
2. **Find Application Insights Resource**: Search for your resource name
3. **View Custom Events**:
   - Left sidebar → **Monitoring** → **Logs**
   - Query: `customEvents | where timestamp > ago(1h) | order by timestamp desc`
4. **Inspect Event Properties**:
   - Click on event row
   - Expand **customDimensions** to see sanitized parameters
   - Check **message** field for error messages
5. **Search for PII**:
   - Use queries like: `customEvents | where customDimensions contains "workspace-bridge"` (should return 0 results)
   - Use queries like: `customEvents | where message contains "@"` (should only find `<email>` placeholder)

---

## 7. Compliance Sign-Off

After completing all validation steps:

- [ ] **All path sanitization checks passed** (workspace, home, remote, absolute)
- [ ] **All PII pattern checks passed** (emails, tokens, keys, JWTs)
- [ ] **All SECRET_KEY_NAMES checks passed** (password, token, apiKey, etc.)
- [ ] **Integration tests passed** (two-pass sanitization works)
- [ ] **Edge cases handled** (truncation, primitives, empty values)
- [ ] **No PII found in Azure Portal** (manual search for known PII returned 0 results)

**Compliance Statement**:
```
I, [NAME], have manually verified that PII sanitization is working correctly
in the VSC-Bridge Application Insights telemetry integration. No personally
identifiable information was found in the telemetry data stored in Azure.

Date: [DATE]
Signature: [SIGNATURE]
```

---

## 8. Troubleshooting

### If PII is Found in Azure Portal:

1. **Stop telemetry immediately**: Set `APPLICATIONINSIGHTS_ENABLED=false` in environment
2. **Identify the leak source**:
   - Which event type? (scriptExecuted, debugSessionStarted, etc.)
   - Which parameter/field contains PII?
3. **Check sanitization logic**:
   - Is the PII pattern in `PII_PATTERNS` regex?
   - Is the parameter key in `SECRET_KEY_NAMES`?
4. **Add test case**: Create unit test reproducing the leak in `privacy.test.ts`
5. **Fix and re-verify**: Update privacy.ts, run unit tests, re-deploy, re-check Azure Portal

### Common False Positives:

- **Generic words**: "password" as part of normal text (e.g., "password reset feature") - this is acceptable
- **Public URLs**: `https://github.com/owner/repo` - public repo URLs are not PII
- **Extension names**: "wormhole" in extension metadata - this is public information

Only actual user-specific PII (usernames, real email addresses, tokens with real credentials) constitutes a compliance violation.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-25
**Owner**: VSC-Bridge Team
