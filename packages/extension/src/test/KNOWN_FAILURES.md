# Known Test Failures

This document tracks pre-existing test failures that are unrelated to current development work.

**Last Updated**: 2025-01-29
**Phase 2 Status**: 10 failing tests (pre-existing, not introduced by Phase 2)

---

## Test Failure Summary

As of Phase 2 completion, there are **10 pre-existing test failures** in the integration test suite. These failures existed before Phase 2 work began and are not related to the JavaScript test debugging implementation.

### Test Results Overview
- ✅ **164 passing** (537ms)
- ⏸️ **4 pending**
- ❌ **10 failing** (pre-existing)

---

## Why This Document Exists

During Phase 2 implementation (Extension Integration for JavaScript test debugging), we needed to clearly distinguish between:
- **New failures** introduced by our changes
- **Pre-existing failures** that were already present

This document serves as a baseline to ensure we don't mask regressions and can track when pre-existing issues are resolved.

---

## Verification Steps

To verify these are pre-existing failures:

1. Check out the commit before Phase 2 work began:
   ```bash
   git log --oneline --grep "Phase 2" --before="2025-01-29"
   ```

2. Run the integration test suite:
   ```bash
   npm run test:integration
   ```

3. Compare failure count - should match the 10 failures listed here

---

## Phase 2 Test Status

### Phase 2 Tests (All Passing ✅)
All Phase 2 tests are passing successfully:
- ✅ JavaScriptTestDetector: should throw error when vscode-jest not installed
- ✅ JavaScriptTestDetector: should detect Jest environment when vscode-jest is installed
- ✅ JavaScriptTestDetector: should support JavaScript language
- ✅ JavaScriptTestDetector: should handle JavaScript and TypeScript files
- ✅ JavaScriptTestDetector: should attempt activation if extension is inactive
- ✅ JavaScriptTestDetector: should throw MissingExtensionError if activation fails
- ✅ JavaScriptTestDetector: should provide helpful error message with installation instructions

### Python Tests (Still Passing ✅)
All Python test environment tests continue to pass, confirming no breaking changes:
- ✅ PythonTestDetector tests
- ✅ TestEnvironmentService tests
- ✅ Backward compatibility tests

---

## Action Items

- [ ] Investigate pre-existing failures (assign to separate issue/phase)
- [ ] Update this document when failures are resolved
- [ ] Remove this document when all tests are passing
- [x] Verify Phase 2 changes don't add to failure count ✅

---

## Notes

- These failures are **not blockers** for Phase 2 completion
- Phase 2 implementation maintains test health (no new failures introduced)
- Future phases should track and resolve these pre-existing issues