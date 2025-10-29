# Jest Test Discovery Fix

## Problem Summary

The TypeScript Jest tests in `test/integration-simple/typescript/` were not being discovered by VS Code's Jest extension, even though:
- The test file had valid Jest syntax
- Jest configuration was present
- Dependencies were installed
- Running `npm test` manually worked

## Root Cause Analysis

### Issue 1: Conflicting Test Runners
The workspace root's `package.json` defines `npm test` as running `vscode-test` (Mocha for extension testing), NOT Jest. The Jest extension was configured to run `npm test --` from the workspace root, which ran the wrong test framework entirely.

### Issue 2: Path Scanning Collision
When Jest was run from the workspace root with a relative path to the test subdirectory, it scanned the entire workspace including `.vscode-test/` containing multiple VS Code installations. This caused hundreds of "Haste module naming collision" errors, preventing test discovery.

Example error:
```
jest-haste-map: Haste module naming collision: Code
  The following files share their name; please adjust your hasteImpl:
    * <rootDir>/.vscode-test/vscode-darwin-arm64-1.104.0/Visual Studio Code.app/Contents/Resources/app/package.json
    * <rootDir>/.vscode-test/vscode-darwin-arm64-1.104.2/Visual Studio Code.app/Contents/Resources/app/package.json
```

### Issue 3: Extension Auto-Activation
The Jest extension (`orta.vscode-jest`) has limited auto-activation for tests in deep subdirectories ([GitHub issue #897](https://github.com/jest-community/vscode-jest/issues/897)). When tests are multiple levels deep and the workspace root doesn't have Jest, the extension may not activate automatically.

## Solution

### Changes Made

1. **Removed conflicting root Jest configuration**
   - File: `.vscode/settings.json`
   - Removed: `jest.jestCommandLine`, `jest.rootPath`, `jest.enable`, `jest.autoRun`
   - Why: These settings pointed to the wrong test runner and caused path scanning issues

2. **Created jest.config.js in test directory**
   - File: `test/integration-simple/typescript/jest.config.js`
   - Purpose: Explicit configuration with ignore patterns to prevent scanning parent directories
   - Key settings: `modulePathIgnorePatterns`, `testPathIgnorePatterns`

3. **Updated package.json**
   - File: `test/integration-simple/typescript/package.json`
   - Removed: Inline `jest` configuration
   - Why: Jest doesn't allow multiple configuration sources; jest.config.js takes precedence

4. **Configured local .vscode/settings.json**
   - File: `test/integration-simple/typescript/.vscode/settings.json`
   - Settings:
     ```json
     {
       "jest.enable": true,
       "jest.jestCommandLine": "npm test --",
       "jest.autoRun": {
         "watch": false,
         "onSave": "test-file"
       },
       "jest.debugMode": true
     }
     ```

5. **Created multi-root workspace (RECOMMENDED)**
   - File: `vsc-bridge.code-workspace`
   - Adds test directory as separate workspace root
   - Allows Jest extension to properly discover tests

## How to Use

### Option 1: Multi-Root Workspace (RECOMMENDED)

1. Open the workspace file: `File > Open Workspace from File...`
2. Select `/Users/jordanknight/github/vsc-bridge/vsc-bridge.code-workspace`
3. Navigate to the "TypeScript Integration Tests" folder in the Explorer
4. The Jest extension should auto-discover tests

### Option 2: Open Test Directory Directly

1. Close the current VS Code window
2. Open the test directory: `code test/integration-simple/typescript`
3. The Jest extension will auto-discover tests in this focused workspace

### Option 3: Manual Extension Activation

If tests still don't appear:

1. Open Command Palette (`Cmd+Shift+P`)
2. Run: `Jest: Start All Runners`
3. Check the Jest output panel for errors

## Verification

Test that Jest works correctly:

```bash
cd test/integration-simple/typescript
npm test
```

Expected output:
```
PASS ./debug.test.ts
  Unified Integration Test
    ✓ should debug simple arithmetic (1 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

## Key Learnings

1. **Workspace structure matters**: Jest extensions have difficulty with deeply nested test directories
2. **Configuration hierarchy**: Root settings can conflict with subdirectory settings
3. **Test runner isolation**: Keep different test frameworks (Mocha vs Jest) in separate directories
4. **Path scanning**: Jest's module resolution can scan unintended directories, causing collisions
5. **Multi-root workspaces**: Best practice for monorepo-style projects with multiple test suites

## Related Files

- Test file: `/Users/jordanknight/github/vsc-bridge/test/integration-simple/typescript/debug.test.ts`
- Jest config: `/Users/jordanknight/github/vsc-bridge/test/integration-simple/typescript/jest.config.js`
- Local settings: `/Users/jordanknight/github/vsc-bridge/test/integration-simple/typescript/.vscode/settings.json`
- Workspace file: `/Users/jordanknight/github/vsc-bridge/vsc-bridge.code-workspace`
- Package.json: `/Users/jordanknight/github/vsc-bridge/test/integration-simple/typescript/package.json`

## References

- [vscode-jest GitHub Issue #897 - Auto-activation with rootPath](https://github.com/jest-community/vscode-jest/issues/897)
- [vscode-jest Setup Wizard Documentation](https://github.com/jest-community/vscode-jest/blob/master/setup-wizard.md)
- [VS Code Multi-Root Workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces)
