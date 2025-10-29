# Deprecated Integration Tests

This directory contains integration tests that have been deprecated as of 2025-10-08.

## Status

These tests are **DEPRECATED** and are not run as part of the standard test suite. They have been moved here to preserve them for reference while a new comprehensive cross-language integration test is being developed.

## Contents

- `param-validation.test.ts` - Parameter validation tests for CLI commands

## Running These Tests

These tests are excluded from the main test runner. If you need to run them for reference:

```bash
# Run directly with vitest
npx vitest run test/integration/old/param-validation.test.ts

# Or if a script is added to package.json
npm run test:integration:old
```

## Why Deprecated?

These tests are being replaced by a comprehensive cross-language integration test that will:
- Test all 4 supported language debuggers (Python, JavaScript, C#, Java)
- Run real end-to-end tests against the actual Extension Host
- Use the actual CLI commands without mocking
- Provide better coverage of the debugging workflow

See `/docs/plans/11-cross-language-integration-test/` for details on the new test suite.

## Note

These tests may not currently pass as they haven't been maintained. They are preserved here for reference only.