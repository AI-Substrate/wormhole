# Privacy & PII Sanitization - Pragmatic Unit Test Plan

**File Under Test**: `/workspaces/wormhole/packages/extension/src/core/telemetry/privacy.ts`

**Testing Framework**: Vitest

**Estimated Test Count**: **~25 tests** (focused on critical PII scenarios)

**Estimated Coverage Target**: 85%+ line coverage (focus on critical paths)

**Philosophy**: Test the critical PII patterns that could actually leak in production. Skip exhaustive edge cases.

---

## Test Focus

**What We're Testing**:
1. Core PII patterns that actually appear in error messages (emails, tokens, paths)
2. Path sanitization for common scenarios (workspace, home, remote)
3. Integration between scrubPII and sanitizePath
4. Object/array recursion (SECRET_KEY_NAMES)

**What We're Skipping**:
- Exhaustive regex pattern variations (test 1-2 examples per pattern, not all 6 GitHub token types)
- Unicode edge cases (emoji, RTL, etc.) - low probability in error messages
- Performance benchmarks - regex is already precompiled
- Adversarial inputs - not a realistic threat vector for telemetry

---

## Simplified Test List (~25 tests total)

### 1. sanitizePath() - 8 tests

1. Workspace file → `<ws:0>/path` (prevents workspace name leak)
2. Multi-root workspace → `<ws:1>/path` (correct index)
3. Home directory → `~/path` (prevents username leak)
4. Windows home → `~/path` (cross-platform)
5. Remote SSH URI → `<ssh-remote:hash>/hash.ts` (authority + filename hashing, extension preserved)
6. Untitled file → `<untitled>` (generic marker)
7. Absolute path → `<abs:hash>/hash.ts` (Insight #1: filename hashed, extension preserved)
8. Empty string → `""` (graceful handling)

### 2. scrubPII() - 12 tests

**Strings (7 tests)**:
9. Email → `<email>` (basic email detection)
10. GitHub token (ghp_) → `<github_token>` (one example, not all 6 types)
11. AWS access key (AKIA) → `<aws_access_key_id>` (one example)
12. JWT → `<jwt>` (3-part base64url)
13. Path in string → sanitized via sanitizePath() (Insight #3: two-pass)
14. Multiple patterns in one string → all scrubbed
15. Truncation (>2048 chars) → `…<truncated>`

**Objects/Arrays (5 tests)**:
16. Object with SECRET_KEY_NAMES key (apiKey) → `<redacted>`
17. Nested object with secrets → recursive scrubbing works
18. Object with PII in values → PII scrubbed
19. Array with PII → elements scrubbed
20. Primitives (number, boolean) → returned as-is

### 3. sanitizeParams() - 5 tests

21. Path parameter (key="path") → sanitized
22. Number parameter → converted to string
23. Boolean parameter → converted to string
24. Short string (<50 chars) → scrubbed and kept
25. Long string (>50 chars) → `<value-too-long>`

---

## Implementation Timeline

**Estimated Time**: 2-3 hours total

**Approach**: Write all 25 tests, run them, fix any issues, verify 85%+ coverage

---

## Success Criteria

✅ **25 tests pass**
✅ **85%+ line coverage** on privacy.ts
✅ **Critical PII patterns validated**: paths, emails, tokens, secrets
✅ **Integration test passes**: Insight #3 two-pass sanitization works
✅ **No PII leaks in assertions**: negative assertions confirm scrubbing

---

This pragmatic plan focuses on the **realistic PII scenarios** that could actually leak in production telemetry, while skipping the exhaustive edge cases that add little value.
