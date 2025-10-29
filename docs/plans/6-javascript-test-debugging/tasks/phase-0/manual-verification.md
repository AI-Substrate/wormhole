# Phase 0: Manual Verification Checklist

**Date**: 2025-01-29
**Phase**: Phase 0: Environment Preparation
**Purpose**: Verify vscode-jest extension can discover and debug JavaScript tests

## Prerequisites Completed ✅

- [x] Node.js v24.7.0 available
- [x] Jest dependencies installed in test/javascript
- [x] Jest CLI verified working (43 tests passing)
- [x] VS Code settings.json configured with Jest settings
- [x] Launch.json configured with vscode-jest-tests.v2 debug config
- [x] vscode-jest extension installed (Orta.vscode-jest)

## Manual Verification Steps

### Step 1: Activate vscode-jest Extension (T007)

- [ ] Open VS Code in the project: `code /Users/jordanknight/github/vsc-bridge`
- [ ] Open Command Palette (Cmd+Shift+P)
- [ ] Run command: "Jest: Start All Runners"
- [ ] **Expected**: "Jest" appears in the status bar at the bottom
- [ ] **Actual**: _________________

### Step 2: Verify Test Discovery (T008)

- [ ] Click Testing icon in Activity Bar (beaker icon) or View > Testing
- [ ] Expand the test tree
- [ ] **Expected**: See "example.test.js" with nested structure:
  - Basic Math Operations (4 tests)
  - String Operations > Uppercase (3 tests)
  - String Operations > Lowercase (3 tests)
  - String Operations > String Length (3 tests)
  - Array Operations (5 tests)
  - Object Operations (3 tests)
  - Async Operations (4 tests)
  - Parameterized Tests (8 tests)
  - Mock Functions (3 tests)
  - Error Handling (2 tests)
  - Snapshot Tests (2 tests)
  - Conditional Tests (1 test + 1 skipped)
  - Timeout Tests (2 tests)
- [ ] **Actual**: _________________

### Step 3: Test Running via UI (T009)

- [ ] In Testing sidebar, find "Basic Math Operations"
- [ ] Click the play icon (▶) next to it
- [ ] **Expected**: Tests run, green checkmarks appear for passed tests
- [ ] **Actual**: _________________

- [ ] Try running an individual test
- [ ] Click play icon next to "should add two numbers correctly"
- [ ] **Expected**: Single test runs and passes
- [ ] **Actual**: _________________

### Step 4: Test Debugging with Breakpoints (T010)

- [ ] Open `/Users/jordanknight/github/vsc-bridge/test/javascript/example.test.js`
- [ ] Set breakpoint on line 8: `expect(2 + 2).toBe(4);`
- [ ] In Testing sidebar, find "should add two numbers correctly"
- [ ] Right-click and select "Debug Test" (or click debug icon)
- [ ] **Expected**: Debugger stops at breakpoint
- [ ] **Actual**: _________________

- [ ] While stopped at breakpoint:
  - [ ] Check Variables panel shows local scope
  - [ ] Try Step Over (F10)
  - [ ] Try Continue (F5)
- [ ] **Expected**: Standard debugging features work
- [ ] **Actual**: _________________

### Step 5: Verify Jest Output Channel (T011)

- [ ] Open Output panel (View > Output)
- [ ] Select "Jest" from dropdown
- [ ] **Expected**: See test execution logs and results
- [ ] **Actual**: _________________

## Additional Verification

### Test Different Test Types

- [ ] Run async test: "should resolve with data"
- [ ] Debug parameterized test: "add(1, 1) should return 2"
- [ ] Run test with mock: "should call mock function"
- [ ] All work correctly: Yes / No

### Check Error Reporting

- [ ] Temporarily break a test (change `expect(2 + 2).toBe(4)` to `.toBe(5)`)
- [ ] Run the test
- [ ] **Expected**: Red X appears, error message shows in Testing panel
- [ ] **Actual**: _________________
- [ ] Revert the change

## Troubleshooting Notes

If tests don't appear in Testing UI:
1. Check Jest output channel for errors
2. Try: Developer > Reload Window
3. Verify .vscode-jest marker file exists
4. Check jest.rootPath in settings points to correct directory

If breakpoints don't work:
1. Ensure source maps are enabled
2. Check launch.json has disableOptimisticBPs: true
3. Try setting breakpoint after debugger starts
4. Verify Node.js debugger is attaching

## Sign-off

- [ ] All verification steps completed successfully
- [ ] Screenshots captured (if needed for documentation)
- [ ] Any issues encountered have been documented

**Verified by**: _________________
**Date**: _________________
**Notes**: _________________

## Next Steps

Once all items are verified:
1. This phase is complete
2. Ready to proceed with Phase 1: Test Environment Service Layer Refactoring
3. Run: `/plan-6-implement-phase --phase "Phase 1: Test Environment Service Layer Refactoring"`