# Dynamic ESM Import Issue Analysis

## Problem Summary
VS Code extension tests are failing when trying to dynamically load JavaScript modules using ESM dynamic imports with file:// URLs. The ScriptRegistry uses dynamic imports to load scripts at runtime, which works in production (webpack-bundled) but fails in the test environment.

## Error Pattern
```
[ScriptRegistry] Failed to load script bp.clear.file: Cannot find module 'file:///Users/jordanknight/github/vsc-bridge/extension/out/vsc-scripts/breakpoint/clear-file.js'
```

## Current Implementation 
```typescript
// In ScriptRegistry.ts - loadScript method
const { pathToFileURL } = await import('node:url');
const href = pathToFileURL(scriptPath).href;
const module = await import(/* webpackIgnore: true */ href);
```

## Environment Context
- **Production**: Webpack-bundled extension where dynamic imports work
- **Tests**: VS Code extension host with @vscode/test-cli where file:// URLs fail
- **Scripts**: Exist at specified paths (verified), but import() cannot resolve them
- **Module Format**: Scripts use CommonJS (module.exports) but loaded via ESM import()

## Root Cause
The VS Code extension test environment has different module resolution behavior than the production webpack environment. File:// URLs may not resolve correctly in the extension host's Node.js context during testing.

## Key Constraints
- Must work in both webpack (production) and non-webpack (test) environments
- Cannot bundle scripts (they must be loaded dynamically at runtime)
- Scripts are TypeScript classes extending ScriptBase
- webpackIgnore comment is needed to prevent webpack from bundling scripts