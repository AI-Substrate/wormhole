# Supplemental: Convert Vitest Tests to Mocha

**Phase**: 1 - Error Code Infrastructure (Supplemental)
**Parent Plan**: [../../debug-script-bake-in-plan.md](../../debug-script-bake-in-plan.md)
**Related Tasks**: [tasks.md](tasks.md)
**Created**: 2025-10-03
**Status**: PENDING

## Background

Phase 1 successfully implemented error code infrastructure with comprehensive automated tests. The tests were initially written using Vitest (`extension/test/core/errors/debug-errors.test.ts`) and all 33 tests are passing, validating:

- All error codes are defined correctly
- Error messages are actionable and helpful
- Helper functions work as expected
- Error formatting is consistent

**However**, the project's CI pipeline uses Mocha as its test runner:
- `npm test` runs Mocha tests from `out/test/unit/**/*.test.js`
- Vitest is installed but NOT integrated into the test pipeline
- `just test` only executes Mocha tests

This supplemental phase converts the existing passing Vitest tests to Mocha/Chai format to integrate them into the project's standard test pipeline.

## Objective

Convert the existing, passing Vitest test suite to Mocha/Chai format without changing any test logic or coverage. This is purely a framework conversion to match project standards.

## Prerequisites

✅ Phase 1 complete
✅ All code fixes applied (FT-003: byte formatting, FT-004: E_NOT_STOPPED wording)
✅ Vitest tests passing (33/33) as reference implementation
✅ Mocha/Chai already installed in project

## Tasks

| Status | Task | Success Criteria | Notes |
|--------|------|-----------------|-------|
| [ ] | Review existing Vitest test structure | Understand all 33 test cases and patterns | Map test groups and assertions |
| [ ] | Verify Mocha/Chai dependencies | `@types/mocha` and `chai` in package.json | Already installed, just verify |
| [ ] | Create target directory structure | `test/unit/core/errors/` directory exists | Matches Mocha test pattern |
| [ ] | Create new Mocha test file | `test/unit/core/errors/debug-errors.test.ts` created | In correct location for compilation |
| [ ] | Convert import statements | Mocha/Chai imports replace Vitest | See conversion reference below |
| [ ] | Convert test syntax | All `test()` → `it()`, assertions updated | Preserve test descriptions |
| [ ] | Convert assertion syntax | Vitest `expect()` → Chai `expect()` | See conversion reference below |
| [ ] | Compile TypeScript tests | `npm run compile-tests` succeeds | Tests compile to `out/test/unit/core/errors/` |
| [ ] | Run Mocha tests | All 33 tests pass with `npm test` | Tests integrated into pipeline |
| [ ] | Verify `just test` integration | Tests run as part of full test suite | CI pipeline ready |
| [ ] | Archive Vitest test file | Move original to `scratch/` or delete | Clean up obsolete test |
| [ ] | Document Mocha usage | Update any references to Vitest | Reflect current state |
| [ ] | Review vitest.config.ts | Note it's unused or remove if appropriate | Clean up configuration |

## Conversion Reference

### Import Statements

```typescript
// VITEST (OLD)
import { describe, test, expect } from 'vitest';

// MOCHA/CHAI (NEW)
import { describe, it } from 'mocha';
import { expect } from 'chai';
```

### Test Declaration

```typescript
// VITEST (OLD)
test('description', () => {
  // test body
});

// MOCHA/CHAI (NEW)
it('description', () => {
  // test body
});
```

### Assertion Syntax

```typescript
// VITEST (OLD)
expect(value).toBe(expected);
expect(value).toMatch(/pattern/i);
expect(value).toBeTruthy();
expect(array).toContain(item);
expect(array.length).toBeGreaterThan(0);
expect(value).not.toMatch(/pattern/);

// MOCHA/CHAI (NEW)
expect(value).to.equal(expected);
expect(value).to.match(/pattern/i);
expect(value).to.be.ok;
expect(array).to.include(item);
expect(array.length).to.be.greaterThan(0);
expect(value).to.not.match(/pattern/);
```

### Complete Example

```typescript
// VITEST (OLD)
import { describe, test, expect } from 'vitest';
import { DebugErrorCode, createDebugError } from '../../../src/core/errors/debug-errors';

describe('createDebugError', () => {
    test('E_NO_SESSION has actionable hint', () => {
        const error = createDebugError(DebugErrorCode.E_NO_SESSION);
        expect(error.code).toBe(DebugErrorCode.E_NO_SESSION);
        expect(error.message).toMatch(/No active debug session/i);
        expect(error.hint).toMatch(/Start debugging with F5/i);
    });
});

// MOCHA/CHAI (NEW)
import { describe, it } from 'mocha';
import { expect } from 'chai';
import { DebugErrorCode, createDebugError } from '../../../src/core/errors/debug-errors';

describe('createDebugError', () => {
    it('E_NO_SESSION has actionable hint', () => {
        const error = createDebugError(DebugErrorCode.E_NO_SESSION);
        expect(error.code).to.equal(DebugErrorCode.E_NO_SESSION);
        expect(error.message).to.match(/No active debug session/i);
        expect(error.hint).to.match(/Start debugging with F5/i);
    });
});
```

## File Locations

### Current (Vitest)
- **Location**: `/Users/jordanknight/github/vsc-bridge/extension/test/core/errors/debug-errors.test.ts`
- **Status**: Passing (33/33 tests)
- **Framework**: Vitest
- **Issue**: Not in Mocha pipeline

### Target (Mocha)
- **Location**: `/Users/jordanknight/github/vsc-bridge/extension/test/unit/core/errors/debug-errors.test.ts`
- **Compiled to**: `/Users/jordanknight/github/vsc-bridge/extension/out/test/unit/core/errors/debug-errors.test.js`
- **Framework**: Mocha/Chai
- **Integration**: Runs via `npm test` and `just test`

### Why This Location?

The Mocha test runner is configured to execute:
```bash
mocha "out/test/unit/**/*.test.js"
```

Therefore, tests must be in `test/unit/` to be compiled to `out/test/unit/` and picked up by the runner.

## Acceptance Criteria

✅ All 33 tests converted to Mocha/Chai syntax
✅ Tests pass when run with `npm test`
✅ Tests pass when run with `npm run test:unit`
✅ Tests run as part of `just test` pipeline
✅ No Vitest dependencies in production test pipeline
✅ Test coverage remains identical to Vitest version
✅ All test descriptions preserved exactly

## Commands to Run

```bash
# Navigate to extension directory
cd /Users/jordanknight/github/vsc-bridge/extension

# Compile TypeScript tests
npm run compile-tests

# Run unit tests only
npm run test:unit

# Run full test suite
npm test

# Run via justfile (includes all tests)
just test
```

## Verification Checklist

After conversion, verify:

- [ ] All 33 tests present in new Mocha file
- [ ] All describe blocks match original structure
- [ ] All it() descriptions match original test() descriptions
- [ ] All assertions produce same validation
- [ ] Imports reference correct source paths
- [ ] TypeScript compilation succeeds
- [ ] All tests pass in Mocha
- [ ] No Vitest dependencies imported
- [ ] Test output matches original coverage

## Implementation Notes

### This is a REFACTOR ONLY
- **NO logic changes** - tests validate the same behavior
- **NO new tests** - 33 tests in, 33 tests out
- **NO test modifications** - only framework syntax changes
- The Vitest tests serve as the **reference implementation**

### TDD Work Already Complete
- ✅ RED phase: Tests written first (manual checklist approach)
- ✅ GREEN phase: Implementation made tests pass
- ✅ REFACTOR phase: Code fixes applied (FT-003, FT-004)
- This is a **framework migration**, not new TDD work

### Reference Implementation
The Vitest test file at `/Users/jordanknight/github/vsc-bridge/extension/test/core/errors/debug-errors.test.ts` contains:
- 7 describe blocks (DebugErrorCode enum, createDebugError with 6 sub-groups, plus 5 more describe blocks for other functions)
- 33 it/test cases total
- Comprehensive coverage of all error codes
- Validation of all helper functions
- Tests for edge cases (byte formatting, custom errors, etc.)

Use this file as the authoritative source for test logic and structure.

## Expected Test Groups (from Vitest)

1. **DebugErrorCode enum** (1 test)
   - All error codes are defined

2. **createDebugError** (15 tests)
   - Session Errors (3 tests)
   - Parameter Errors (2 tests)
   - Data Size Errors (2 tests)
   - Language Support Errors (2 tests)
   - DAP Operation Errors (3 tests)
   - Detail parameter test (1 test)
   - Custom error test (2 tests)

3. **createLargeDataError** (4 tests)
   - KB formatting
   - MB formatting
   - Node count
   - Detail suggestion

4. **createUnsupportedLanguageError** (2 tests)
   - Session type in message
   - Supported types in detail

5. **formatDebugError** (5 tests)
   - Error code format
   - Message inclusion
   - Hint with emoji
   - Detail inclusion
   - Detail omission

6. **isDebuggerStateError** (3 tests)
   - Session state errors
   - DAP state errors
   - Non-state errors

7. **isReferenceError** (2 tests)
   - Reference errors
   - Non-reference errors

8. **getSupportedDebuggerTypes** (2 tests)
   - Returns array
   - Includes expected types

**Total: 33 tests** - all must be converted

## Post-Conversion Cleanup

After successful conversion and verification:

1. **Archive Vitest test**:
   ```bash
   mv /Users/jordanknight/github/vsc-bridge/extension/test/core/errors/debug-errors.test.ts \
      /Users/jordanknight/github/vsc-bridge/scratch/vitest-tests-archived/
   ```

2. **Review vitest.config.ts**:
   - Add comment noting it's not used in CI pipeline
   - Or remove if team decides Vitest is not needed

3. **Update documentation** (if any references exist):
   - Change "Vitest" to "Mocha/Chai" in any test documentation
   - Update this tasks.md with completion status

## Success Indicators

When this supplemental phase is complete:

✅ `npm test` runs and passes debug-errors tests
✅ `just test` includes debug-errors tests in output
✅ No Vitest tests in the pipeline
✅ Test coverage identical to Vitest version
✅ CI/CD pipeline ready for error code tests

## Related Files

- **Source**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/errors/debug-errors.ts`
- **Vitest tests**: `/Users/jordanknight/github/vsc-bridge/extension/test/core/errors/debug-errors.test.ts`
- **Mocha tests** (target): `/Users/jordanknight/github/vsc-bridge/extension/test/unit/core/errors/debug-errors.test.ts`
- **Example Mocha test**: `/Users/jordanknight/github/vsc-bridge/extension/test/unit/testing/cursorMapper.test.ts`
- **Package config**: `/Users/jordanknight/github/vsc-bridge/extension/package.json`
- **Test script**: `npm run test:unit` → `mocha "out/test/unit/**/*.test.js"`

---

**Next Steps**: Create the target directory, copy the Vitest test file as a starting point, then systematically convert syntax following the reference guide above.
