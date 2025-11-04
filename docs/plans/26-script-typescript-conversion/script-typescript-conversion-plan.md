# Script TypeScript Conversion Implementation Plan

**Plan Version**: 1.1.0
**Created**: 2025-10-31
**Updated**: 2025-11-01 (Post-validation remediations)
**Spec**: [./script-typescript-conversion-spec.md](./script-typescript-conversion-spec.md)
**Status**: READY

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Documentation Strategy](#documentation-strategy)
6. [Implementation Phases](#implementation-phases)
   - [Phase 0: BridgeContext Type Safety](#phase-0-bridgecontext-type-safety)
   - [Phase 1: TypeScript Infrastructure Setup](#phase-1-typescript-infrastructure-setup)
   - [Phase 2: Decorator System Implementation](#phase-2-decorator-system-implementation)
   - [Phase 3: Script Conversion (Batch 1)](#phase-3-script-conversion-batch-1)
   - [Phase 4: Script Conversion (Batch 2)](#phase-4-script-conversion-batch-2)
   - [Phase 5: Registry Integration](#phase-5-registry-integration)
   - [Phase 6: Validation & Testing](#phase-6-validation-testing)
   - [Phase 7: Documentation](#phase-7-documentation)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [Progress Tracking](#progress-tracking)
9. [Change Footnotes Ledger](#change-footnotes-ledger)

## Executive Summary

**Problem Statement**: VSC-Bridge scripts cannot be debugged because they are dynamically loaded at runtime using `eval('require')`, which bypasses source maps and prevents breakpoint setting. This was discovered while attempting to debug the `code.replace-method` script's symbol resolution issues.

**Solution Approach**:
- Convert all 40 JavaScript scripts to TypeScript
- Replace dynamic loading with static imports
- Implement decorator-based registration system
- Maintain full backward compatibility with CLI and MCP
- Enable complete debugging capabilities with breakpoints and stepping

**Expected Outcomes**:
- All scripts fully debuggable in VS Code Extension Host
- Type-safe script development with IntelliSense
- Improved developer experience and maintainability
- Zero breaking changes for users
- Ability to finally debug the `code.replace-method` issue

**Success Metrics**:
- 100% of scripts converted to TypeScript
- All CLI commands continue working identically
- MCP server discovers all tools
- Debugging works with breakpoints and source maps
- No performance degradation

## Technical Context

**Current System State**:
- 40 JavaScript scripts in `/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/`
- Scripts use CommonJS with `require()` for dependencies
- Webpack bundles scripts but they're loaded dynamically via `eval('require')`
- tsconfig.json explicitly excludes scripts from TypeScript compilation
- ScriptRegistry uses duck-typing to identify script classes
- Scripts organized in categories: breakpoint, code, dap, debug, diag, editor, search, symbol, tests, utils

**Integration Requirements**:
- Scripts must extend base classes: QueryScript, ActionScript, or WaitableScript
- Parameter validation via Zod schemas must continue working
- Manifest generation from .meta.yaml files must be preserved
- MCP server tool discovery must remain unchanged
- CLI tool `vscb script run` must work identically
- BridgeContext pattern must be maintained

**Constraints and Limitations**:
- Cannot break existing dynamic scripts in `scripts/sample/dynamic/`
- Must maintain CommonJS output for Node.js compatibility
- Webpack aliases must continue working
- TypeScript strict mode must be satisfied
- Decorator support requires TypeScript 5.0+ with experimentalDecorators

**Assumptions**:
- All scripts follow consistent patterns and can be systematically converted
- TypeScript decorators are stable enough for production use
- Performance impact of loading all scripts at startup is acceptable
- VS Code Extension Host supports TypeScript debugging
- Existing Zod schemas will work with TypeScript

## Critical Research Findings

### 🚨 Critical Discovery 01: Scripts Excluded from TypeScript Compilation
**Impact**: Critical
**Sources**: Direct code inspection
**Problem**: tsconfig.json explicitly excludes `src/vsc-scripts/**/*` from TypeScript compilation
**Root Cause**: Historical decision to keep scripts as JavaScript for dynamic loading
**Solution**: Remove exclusion and include scripts in TypeScript compilation
**Example**:
```json
// ❌ CURRENT - Scripts excluded
{
  "exclude": [
    "src/vsc-scripts/**/*",
    "test/**/*",
    "scripts/**/*"
  ]
}

// ✅ FIXED - Scripts included
{
  "exclude": [
    "test/**/*",
    "scripts/**/*"
  ]
}
```
**Action Required**: Modify tsconfig.json to include scripts
**Affects Phases**: Phase 1

---

### 🚨 Critical Discovery 02: Dynamic Loading Uses eval('require')
**Impact**: Critical
**Sources**: dynamicLoader.ts analysis
**Problem**: Scripts loaded via `eval('require')` which bypasses webpack and prevents debugging
**Root Cause**: Need to load scripts from disk without webpack interference
**Solution**: Replace with static imports and decorator registration
**Example**:
```javascript
// ❌ CURRENT - Dynamic loading prevents debugging
const module = await loadModuleFromDisk(scriptPath);
realRequire = eval('require');

// ✅ NEW - Static imports enable debugging
import { DebugStatusScript } from './vsc-scripts/debug/status';
@RegisterScript('debug.status')
export class DebugStatusScript extends QueryScript { }
```
**Action Required**: Replace loadModuleFromDisk with static registry
**Affects Phases**: Phase 2, Phase 5

---

### 🚨 Critical Discovery 03: Webpack Aliases Required for Script Dependencies
**Impact**: Critical
**Sources**: webpack.config.js analysis
**Problem**: Scripts use webpack aliases like `@script-base` that must work in TypeScript
**Root Cause**: Scripts need clean imports without relative paths
**Solution**: Configure TypeScript paths to match webpack aliases
**Example**:
```typescript
// Scripts use these aliases
import { ActionScript } from '@script-base';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';
```
**Action Required**: Add path mappings to tsconfig.json
**Affects Phases**: Phase 1, Phase 3-4

---

### 🔥 High Discovery 04: ScriptRegistry Uses Duck-Typing for Class Discovery
**Impact**: High
**Sources**: ScriptRegistry.ts lines 124-149
**Problem**: Registry identifies scripts by checking for execute() method and class name patterns
**Root Cause**: Dynamic loading makes instanceof checks unreliable
**Solution**: With static imports, use proper type checking and decorator metadata
**Example**:
```typescript
// ❌ CURRENT - Duck typing
if (proto.execute && proto.constructor.name.includes('Script')) {
  ScriptClass = exported;
}

// ✅ NEW - Type-safe registration
if (scriptMetadata.has(ScriptClass)) {
  registry.register(scriptMetadata.get(ScriptClass));
}
```
**Action Required**: Implement decorator-based metadata system
**Affects Phases**: Phase 2, Phase 5

---

### 🔥 High Discovery 05: Scripts Use CommonJS with Class Exports
**Impact**: High
**Sources**: Script file analysis
**Problem**: All scripts use `module.exports = { ClassName }` pattern
**Root Cause**: Historical CommonJS pattern
**Solution**: Convert to TypeScript ES6 exports
**Example**:
```javascript
// ❌ CURRENT - CommonJS
class SetBreakpointScript extends ActionScript { }
module.exports = { SetBreakpointScript };

// ✅ NEW - TypeScript
@RegisterScript('breakpoint.set')
export class SetBreakpointScript extends ActionScript { }
```
**Action Required**: Convert all module.exports to ES6 exports
**Affects Phases**: Phase 3-4

---

### 🔥 High Discovery 06: Manifest Generation Depends on File Discovery
**Impact**: High
**Sources**: build-manifest.cts analysis
**Problem**: Build process scans for .meta.yaml files and expects corresponding .js files
**Root Cause**: Manifest builder looks for .js extensions
**Solution**: Update manifest builder to handle .ts files during development
**Example**:
```javascript
// Build process needs to find both:
// - src/vsc-scripts/debug/status.ts (or .js for backward compat)
// - src/vsc-scripts/debug/status.meta.yaml
```
**Action Required**: Ensure manifest builder works with TypeScript files
**Affects Phases**: Phase 1, Phase 6

---

### 📊 Medium Discovery 07: 40 Scripts Organized in Categories
**Impact**: Medium
**Sources**: File system analysis (updated 2025-11-04 with actual counts)
**Problem**: Large number of scripts to convert in organized structure
**Root Cause**: Feature growth over time
**Solution**: Batch conversion by category to maintain organization
**Categories**:
- breakpoint (5 scripts)
- code (1 script - the problematic replace-method)
- dap (8 scripts)
- debug (17 scripts)
- diag (1 script)
- editor (3 scripts)
- search (1 script)
- symbol (2 scripts)
- tests (1 script)
- utils (1 script)
**Action Required**: Convert in two batches for manageable changes
**Affects Phases**: Phase 3-4

---

### 📊 Medium Discovery 08: TypeScript Decorator Support Configuration
**Impact**: Medium
**Sources**: TypeScript documentation
**Problem**: Decorators require specific TypeScript configuration
**Root Cause**: Decorators are still experimental in TypeScript
**Solution**: Enable experimentalDecorators in tsconfig.json
**Example**:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```
**Action Required**: Update TypeScript configuration
**Affects Phases**: Phase 1

## Testing Philosophy

### Testing Approach

**Selected Approach**: TAD (Test-Assisted Development)
**Rationale**: We'll run tests in the Extension Host and do light testing; tests may not be promoted since we have integration tests to rely on, using them primarily for development aids.
**Focus Areas**:
- Script loading mechanism
- TypeScript compilation
- Backward compatibility with CLI/MCP
- Debugging functionality

### Test-Assisted Development (TAD)

- Tests are executable documentation optimized for developer comprehension
- **Scratch → RUN → Promote workflow**:
  1. Write probe tests in tests/scratch/ to verify conversion works
  2. **RUN scratch tests repeatedly** in Extension Host
  3. Implement conversion iteratively, testing after each script
  4. Promote only critical tests that verify the conversion succeeded
  5. Delete scratch tests that were just for development validation
- **Test Doc comment block** (for promoted tests only):
  ```typescript
  /*
  Test Doc:
  - Why: Verify TypeScript scripts can be debugged
  - Contract: Breakpoints work in converted scripts
  - Usage Notes: Run in Extension Host with debugger attached
  - Quality Contribution: Ensures debugging capability is preserved
  - Worked Example: Set breakpoint in status.ts line 35, hits when executed
  */
  ```

### Mock Usage

**Policy**: Avoid mocks entirely - use real Extension Host and actual script execution

## Documentation Strategy

**Location**: docs/how/ only
**Rationale**: The architectural change should be documented alongside existing script documentation in docs/how/, updating how-scripts-work.md and adding a debugging guide.
**Content**: Update existing script documentation to explain TypeScript structure, add new debugging guide for baked-in scripts
**Target Audience**: VSC-Bridge developers and contributors who need to debug or modify scripts
**Maintenance**: Update when script architecture changes or new debugging techniques are discovered

## Implementation Phases

### Phase 0: Type Foundation Setup (Preparatory)

**Objective**: Create proper TypeScript interfaces for BridgeContext **and update base script classes** as groundwork for future script conversion. This phase prepares types but does NOT enable debugging yet (that happens in Phases 3-5).

**Deliverables**:
- TypeScript interface for BridgeContext with proper vscode types
- Assertion functions for session requirement enforcement (simpler than generics)
- Null-safety helpers for common patterns
- Type definitions that work with strict mode
- **Updated base classes (QueryScript, ActionScript, WaitableScript) using IBridgeContext interface**
- **Verified JS compatibility with typed base classes**

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing JS code | Low | Medium | Keep interfaces compatible, test JS compatibility explicitly |
| Complex generic types | Medium | Low | Start simple, add generics incrementally |
| Base class changes affect existing scripts | Low | Medium | Verify TypeScript structural typing allows JS to extend typed classes |

### Tasks (TAD Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 0.1 | [x] | Add getJavaScriptEnv to IBridgeContext interface | Interface compiles | [📋](tasks/phase-0-bridgecontext-type-safety/execution.log.md#task-t001-add-getjavascriptenv-to-ibridgecontext-interface) | Completed [^1] |
| 0.2 | [x] | Update base script classes to use IBridgeContext | Base classes use interface | [📋](tasks/phase-0-bridgecontext-type-safety/execution.log.md#task-t002-update-basetts-to-use-ibridgecontext-interface) | Completed [^2] |
| 0.3 | [x] | Create TypeScript example with proper test | Example script compiles and type checks | [📋](tasks/phase-0-bridgecontext-type-safety/execution.log.md#task-t003-create-typescript-example-with-proper-test) | Completed [^3] |
| 0.4 | [x] | Test JavaScript compatibility | JS files can extend typed base classes | [📋](tasks/phase-0-bridgecontext-type-safety/execution.log.md#task-t004-test-javascript-compatibility) | Completed [^4] |
| 0.5 | [x] | Add JSDoc documentation | Clarifies existing debug.getSession() pattern | [📋](tasks/phase-0-bridgecontext-type-safety/execution.log.md#task-t005-add-minimal-jsdoc-to-ibridgecontext) | Completed [^5] |
| 0.6 | [x] | Final validation with dynamic script | TypeScript compiles with strict mode | [📋](tasks/phase-0-bridgecontext-type-safety/execution.log.md#task-t006-final-validation-including-dynamic-script) | Completed [^6] |
| 0.7 | [ ] | Document BridgeContext typing patterns | Examples for common script patterns | - | In-code comments + docs |
| 0.8 | [ ] | Update base script classes to use IBridgeContext | ScriptBase, WaitableScript use interface in signatures | - | **Insight #1**: Ensures scripts inherit type safety automatically |
| 0.9 | [ ] | Verify JS compatibility with typed base classes | JS script extends typed base class successfully | - | Structural typing should allow this |

### Phase 1: TypeScript Infrastructure Setup

**Objective**: Configure TypeScript and webpack to support script compilation and decorators.

**Deliverables**:
- Updated tsconfig.json with script inclusion
- TypeScript path mappings for aliases
- Decorator support enabled
- Webpack configuration updated

**Dependencies**: Phase 0 complete (BridgeContext types must exist before compiling scripts)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing builds | Low | High | Test each config change incrementally |
| Path resolution issues | Medium | Medium | Verify all aliases work before proceeding |

### Tasks (TAD Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 1.1 | [x] | Create tests/scratch/ directory for conversion testing | Directory exists, excluded from CI | [📋](tasks/phase-1-typescript-infrastructure/execution.log.md#phase-summary) | Completed [^7] |
| 1.2 | [x] | Write scratch test to verify TypeScript compilation | Test compiles and runs a simple TS script | [📋](tasks/phase-1-typescript-infrastructure/execution.log.md#phase-summary) | Completed [^7] |
| 1.3 | [x] | Remove script exclusion from tsconfig.json | Scripts included in compilation | [📋](tasks/phase-1-typescript-infrastructure/execution.log.md#phase-summary) | Completed [^7] |
| 1.4 | [x] | Add experimentalDecorators to tsconfig.json | Decorator support enabled | [📋](tasks/phase-1-typescript-infrastructure/execution.log.md#phase-summary) | Completed [^7] |
| 1.5 | [x] | Add path mappings for webpack aliases | All @-prefixed imports resolve | [📋](tasks/phase-1-typescript-infrastructure/execution.log.md#phase-summary) | Completed [^7] |
| 1.6 | [x] | Add sideEffects config to package.json | Prevents webpack tree-shaking of decorated scripts | [📋](tasks/phase-1-typescript-infrastructure/execution.log.md#phase-summary) | Completed [^7] |
| 1.7 | [x] | Update webpack config for TypeScript scripts | Webpack handles .ts files in scripts | [📋](tasks/phase-1-typescript-infrastructure/execution.log.md#phase-summary) | Completed [^7] |
| 1.8 | [x] | Update build-manifest.cts to support .ts files | Manifest builder checks for both .ts and .js (prefers .ts) | [📋](tasks/phase-1-typescript-infrastructure/execution.log.md#phase-summary) | Completed [^7] |
| 1.9 | [x] | Verify build still works | `just build` completes successfully | [📋](tasks/phase-1-typescript-infrastructure/execution.log.md#phase-summary) | Completed [^7] |
| 1.10 | [x] | Test debugging with a simple TypeScript file | Can set breakpoint in .ts file | [📋](tasks/phase-1-typescript-infrastructure/execution.log.md#phase-summary) | Completed [^7] |

### Phase 2: Decorator System Implementation

**Objective**: Create the decorator-based registration system for scripts.

**Deliverables**:
- RegisterScript decorator implementation
- Script metadata storage
- Decorator usage examples
- Type definitions

**Dependencies**: Phase 1 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Decorator metadata loss | Low | High | Store metadata in WeakMap |
| Circular dependencies | Medium | Medium | Careful import ordering |

### Tasks (TAD Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 2.1 | [x] | Write scratch tests for decorator behavior | Tests verify metadata storage + import order independence | [📋](tasks/phase-2-decorator-system/execution.log.md#task-t005) | Completed · log#task-t005 [^8] |
| 2.2 | [x] | Create RegisterScript decorator with lazy init | Decorator stores script metadata, WeakMap initializes on first access | [📋](tasks/phase-2-decorator-system/execution.log.md#task-t001-t004) | Completed · log#task-t001-t004 [^8] |
| 2.3 | [x] | Create script metadata getter | Lazy initialization pattern for WeakMap | [📋](tasks/phase-2-decorator-system/execution.log.md#task-t001-t004) | Completed · log#task-t001-t004 [^8] |
| 2.4 | [x] | Add decorator to one test script | Script registers via decorator | [📋](tasks/phase-2-decorator-system/execution.log.md#task-t009) | Completed · log#task-t009 [^8] |
| 2.5 | [x] | Verify decorator metadata accessible | Can retrieve metadata at runtime | [📋](tasks/phase-2-decorator-system/execution.log.md#task-t010) | Completed · log#task-t010 [^8] |
| 2.6 | [x] | Create type definitions for decorators | TypeScript recognizes decorator types | [📋](tasks/phase-2-decorator-system/execution.log.md#task-t001-t004) | Completed · log#task-t001-t004 [^8] |
| 2.7 | [x] | Test decorator with all base classes | Works with QueryScript, ActionScript, WaitableScript | [📋](tasks/phase-2-decorator-system/execution.log.md#task-t006-t008) | Completed · log#task-t006-t008 [^8] |
| 2.8 | [x] | Document decorator usage pattern | Clear examples for conversion | [📋](tasks/phase-2-decorator-system/execution.log.md#task-t012) | Completed · log#task-t012 + log#task-t001-t004 [^8] |

### Phase 3: Script Conversion (Batch 1)

**Objective**: Convert first batch of scripts from JavaScript to TypeScript (20 scripts).

**Deliverables**:
- Converted scripts: breakpoint/*, code/*, dap/*, diag/*
- All scripts use decorators
- TypeScript types added
- Original functionality preserved

**Dependencies**: Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking script functionality | Medium | High | Test each script after conversion |
| Type errors | High | Low | Fix iteratively |

### Tasks (TAD Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 3.0 | [x] | Write scratch tests for script conversion | Tests verify converted scripts execute in Extension Host | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t001-write-scratch-tests) | Completed · log#task-t001 [^9] |
| 3.1 | [x] | Convert breakpoint/ scripts (5 files) | All 5 scripts in TypeScript with @RegisterScript decorators | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t003-t006-breakpoint-scripts) | All 5 scripts complete · [^11] [^12] [^13] [^14] |
| 3.2 | [x] | Convert code/ scripts (1 file) | replace-method.ts works with decorator | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t007-code-replace-method) | Completed · PRIMARY GOAL SCRIPT · [^15] |
| 3.3 | [x] | Convert dap/ scripts (8 files) | All 8 DAP scripts converted with decorators | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t008-t015-dap-scripts) | All 8 scripts complete · [^16] [^17] [^18] [^19] [^20] [^21] [^22] [^23] |
| 3.4 | [x] | Convert diag/ scripts (1 file) | diagnostic.collect.ts works with decorator | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t016-diag-collect) | Completed · [^24] |
| 3.5 | [x] | Test batch 1 scripts in Extension Host | All scripts execute correctly | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t017) | Tested via CLI - all work correctly |
| 3.6 | [x] | Verify debugging works for code.replace-method | Can set breakpoints in replace-method.ts | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t018) | **Primary goal achieved!** · [^25] |
| 3.7 | [x] | Verify ScriptResult pattern compliance | All scripts use ScriptResult.success/failure/fromError, no ActionResult | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t019) | 100% compliance verified |
| 3.8 | [x] | Fix any type errors | No TypeScript errors | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t020) | Clean compilation - 0 errors |
| 3.9 | [x] | Verify CLI commands still work | `vscb script list` shows all scripts | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t021) | No regression - all work identically |
| 3.10 | [x] | Fix manifest generation | Manifest references .js files correctly | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t022) | Fixed build-manifest.cts · [^26] [^27] |
| 3.11 | [x] | Fix source map configuration | Breakpoints bind to TypeScript source | [📋](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t023) | Added sourceMapPathOverrides · [^25] |

### Phase 4: Script Conversion (Batch 2)

**Objective**: Convert remaining scripts from JavaScript to TypeScript (25 scripts).

**Deliverables**:
- Converted scripts: debug/*, editor/*, search/*, symbol/*, tests/*, utils/*
- All scripts fully typed
- Complete conversion done

**Dependencies**: Phase 3 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cumulative issues | Low | Medium | Fix issues found in batch 1 first |

### Tasks (TAD Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 4.0 | [x] | Write scratch tests for batch 2 conversion | Tests verify remaining scripts execute in Extension Host | [📋](tasks/phase-4-script-conversion-batch-2/execution.log.md) | Extended tests/scratch/script-conversion.test.ts |
| 4.1 | [x] | Convert debug/ scripts (17 files) | All debug scripts in TypeScript with decorators | [📋](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-41-convert-debug-scripts-17-files) | All 17 scripts converted [^28] |
| 4.2 | [x] | Convert editor/ scripts (3 files) | Editor scripts converted with decorators | [📋](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-42-convert-editor-scripts-3-files) | All 3 scripts converted [^29] |
| 4.3 | [x] | Convert search/ scripts (1 file) | symbol-search.ts works with decorator | [📋](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-43-convert-search-scripts-1-file) | Script converted [^30] |
| 4.4 | [x] | Convert symbol/ scripts (2 files) | Symbol scripts converted with decorators | [📋](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-44-convert-symbol-scripts-2-files) | Both scripts converted [^31] |
| 4.5 | [x] | Convert tests/ scripts (1 file) | Test script converted with decorator | [📋](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-45-convert-tests-scripts-1-file) | Script converted [^32] |
| 4.6 | [x] | Convert utils/ scripts (1 file) | Utility script converted with decorator | [📋](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-46-convert-utils-scripts-1-file) | Script converted [^33] |
| 4.7 | [x] | Verify ScriptResult pattern compliance | All batch 2 scripts use ScriptResult factory | [📋](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-47-verify-scriptresult-pattern-compliance) | 100% compliance verified |
| 4.8 | [x] | Verify all 40 scripts converted | No .js files remain in vsc-scripts | [📋](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-48-verify-all-40-scripts-converted) | Complete conversion validated (15 Phase 3 + 25 Phase 4 = 40 total) |

### Phase 5: Registry Integration

**Objective**: Replace dynamic loading with static registration using decorators.

**Deliverables**:
- Updated ScriptRegistry using decorator metadata
- Static import registry file
- Removal of dynamicLoader usage
- Full debugging support enabled

**Dependencies**: Phase 4 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missing script registrations | Low | High | Automated verification |
| Memory usage increase | Medium | Low | Measure and optimize if needed |

### Tasks (TAD Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 5.0 | [ ] | Write scratch tests for decorator registration | Tests verify decorator metadata lookup works | - | Before removing loadModuleFromDisk |
| 5.1 | [ ] | Create central script import file | All scripts imported statically | - | /workspaces/vscode-bridge/packages/extension/src/vsc-scripts/index.ts |
| 5.2 | [ ] | Update ScriptRegistry to use decorators | Registry reads decorator metadata | - | Remove loadModuleFromDisk |
| 5.3 | [ ] | Remove dynamicLoader usage | No more eval('require') | - | Clean removal |
| 5.4 | [ ] | Verify all scripts register | 40 scripts in registry | - | Count at runtime |
| 5.4a | [ ] | Add manifest-decorator validation | Registry logs warnings for missing decorators or name mismatches | - | Compares manifest.json to decorator metadata, prevents "ghost scripts" (Insight #1 from Phase 2 /didyouknow) |
| 5.5 | [ ] | Test debugging across all scripts | Breakpoints work everywhere | - | Sample 5-10 scripts |
| 5.6 | [ ] | Remove old duck-typing code | Clean type-safe registration | - | Simplify ScriptRegistry |
| 5.6a | [ ] | Review: Verify no class.name dependencies | No code uses .constructor.name or .name for script identification | - | Search codebase for class name checks - minification mangles names in production (Insight #5 from Phase 2 /didyouknow). Registry must use decorator metadata only. |
| 5.7 | [ ] | Optimize import order if needed | No circular dependency issues | - | May need careful ordering |
| 5.8 | [ ] | Performance check | Startup time acceptable | - | Should be <1s overhead |

### Phase 6: Validation & Testing

**Objective**: Comprehensive validation that nothing broke and debugging works.

**Deliverables**:
- All CLI commands verified
- MCP tools verified
- Debugging validated
- Performance confirmed

**Dependencies**: Phase 5 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hidden regressions | Low | High | Thorough testing |

### Tasks (Lightweight Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 6.1 | [ ] | Test all CLI commands | Every `vscb script run` works | - | Spot check each category |
| 6.2 | [ ] | Verify MCP tool discovery | All tools exposed to MCP clients | - | Check manifest.json |
| 6.3 | [ ] | Debug code.replace-method issue | **Finally debug the original problem!** | - | Set breakpoints, find issue |
| 6.4 | [ ] | Performance validation | No significant slowdown | - | Measure startup time |
| 6.5 | [ ] | Test dynamic scripts unaffected | scripts/sample/dynamic/* still work | - | Backward compatibility |
| 6.6 | [ ] | Integration test suite passes | Existing tests still pass | - | Run full test suite |

### Phase 7: Documentation

**Objective**: Document the new TypeScript script architecture and debugging capabilities.

**Deliverables**:
- Updated docs/how/how-scripts-work.md
- New debugging guide
- Migration notes

**Dependencies**: Phase 6 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift | Low | Low | Keep it concise |

### Discovery & Placement Decision

**Existing docs/how/ structure**:
```
docs/how/
├── how-scripts-work.md
├── add-new-script.md
└── ...
```

**Decision**: Update existing files, add new debugging guide

### Tasks (Lightweight Approach)

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 7.1 | [ ] | Update how-scripts-work.md | Explains TypeScript scripts | - | Add "Baked-in Scripts" section |
| 7.2 | [ ] | Create debugging-scripts.md | Guide for debugging scripts | - | /workspaces/vscode-bridge/docs/how/debugging-scripts.md |
| 7.3 | [ ] | Update add-new-script.md | Covers TypeScript script creation | - | Add decorator examples + sideEffects pattern |
| 7.4 | [ ] | Add migration notes | Document what changed | - | For future reference |
| 7.5 | [ ] | Review and polish | Documentation is clear | - | Final review |

## Cross-Cutting Concerns

### Security Considerations
- No security impact - internal architecture change only
- Scripts still validate inputs via Zod
- No new external dependencies

### Observability
- Improved debugging is the main observability gain
- Stack traces will show real source locations
- Error messages will be more meaningful

### Performance
- Slight startup overhead from loading all scripts
- Mitigation: Scripts are small, impact should be <1s
- Benefit: No runtime loading overhead

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 0: BridgeContext Type Safety - COMPLETE
- [x] Phase 1: TypeScript Infrastructure Setup - COMPLETE
- [x] Phase 2: Decorator System Implementation - COMPLETE
- [x] Phase 3: Script Conversion (Batch 1) - COMPLETE (23/23 tasks - 100%)
- [x] Phase 4: Script Conversion (Batch 2) - COMPLETE (8/8 tasks - 100%)
- [ ] Phase 5: Registry Integration
- [ ] Phase 6: Validation & Testing
- [ ] Phase 7: Documentation

**Overall Progress**: 5/8 phases (62.5%)

**Script Conversion Progress**: 40/40 scripts (100%)

### Primary Goal
- [x] **Can debug code.replace-method to find symbol resolution issue** - ACHIEVED in Phase 3!

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

[^1]: Task 0.1 (T001) - Added getJavaScriptEnv to IBridgeContext interface
  - [`interface:packages/extension/src/core/bridge-context/types.ts:IBridgeContext`](packages/extension/src/core/bridge-context/types.ts#L85)

[^2]: Task 0.2 (T002) - Updated base script classes to use IBridgeContext
  - [`class:packages/extension/src/core/scripts/base.ts:ScriptBase`](packages/extension/src/core/scripts/base.ts#L9)
  - [`class:packages/extension/src/core/scripts/base.ts:WaitableScript`](packages/extension/src/core/scripts/base.ts#L115)
  - [`class:packages/extension/src/core/scripts/base.ts:StreamScript`](packages/extension/src/core/scripts/base.ts#L243)

[^3]: Task 0.3 (T003) - Created TypeScript example test with type enforcement
  - [`file:packages/extension/test/core/bridge-context/example-typed.test.ts`](packages/extension/test/core/bridge-context/example-typed.test.ts)

[^4]: Task 0.4 (T004) - Created JavaScript compatibility test
  - [`file:packages/extension/test/core/scripts/js-compat.test.js`](packages/extension/test/core/scripts/js-compat.test.js)

[^5]: Task 0.5 (T005) - Added minimal JSDoc to IBridgeContext
  - [`interface:packages/extension/src/core/bridge-context/types.ts:IDebugService`](packages/extension/src/core/bridge-context/types.ts#L198)
  - [`interface:packages/extension/src/core/bridge-context/types.ts:IPathService`](packages/extension/src/core/bridge-context/types.ts#L251)

[^6]: Task 0.6 (T006) - Final validation including dynamic script
  - [`file:packages/extension/src/core/scripts/base.ts`](packages/extension/src/core/scripts/base.ts)
  - [`file:scripts/sample/dynamic/test-editor-context.js`](scripts/sample/dynamic/test-editor-context.js)

[^7]: Phase 1 (Tasks 1.1-1.10) - TypeScript Infrastructure Setup completed as a batch
  - Created tests/scratch/ directory for conversion testing
  - Configured TypeScript compiler to include scripts and enable decorators
  - Set up webpack path mappings and sideEffects configuration
  - Updated build-manifest.cts to support TypeScript files during transition
  - Verified build and debugging with simple TypeScript files
  - All infrastructure in place for subsequent script conversion phases

[^8]: Phase 2 (Tasks 2.1-2.8) - Decorator System Implementation completed
  - [`file:packages/extension/src/core/scripts/decorators.ts`](packages/extension/src/core/scripts/decorators.ts) - RegisterScript decorator with lazy initialization
  - [`file:packages/extension/test/scratch/decorator-tests.test.ts`](packages/extension/test/scratch/decorator-tests.test.ts) - Comprehensive decorator behavior tests
  - Verified decorator metadata storage with QueryScript, ActionScript, and WaitableScript base classes
  - Created example script with decorator (debug.status-example.ts)
  - Documentation includes usage patterns and lazy init rationale
  - All decorator tests passing in Extension Host
  - See: [Execution Log](tasks/phase-2-decorator-system/execution.log.md) for detailed task breakdown

[^9]: Phase 3 Task 3.0 (T001) - Write scratch tests for script conversion
  - [`file:packages/extension/test/scratch/script-conversion.test.ts`](packages/extension/test/scratch/script-conversion.test.ts) - Tests verify converted scripts execute in Extension Host
  - Tests written to validate script conversion workflow using TAD approach
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t001-write-scratch-tests) for test details

[^10]: Phase 3 Task 3.1 (T002) - Convert breakpoint/ scripts (5 files, 1/5 complete)
  - [`file:packages/extension/src/vsc-scripts/breakpoint/set.ts`](packages/extension/src/vsc-scripts/breakpoint/set.ts) - breakpoint.set script converted to TypeScript with @RegisterScript decorator
  - Remaining scripts: list, clear-file, clear-project, remove (4/5 pending)
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t002-convert-breakpoint-set) for conversion details

[^11]: Phase 3 Task 3.1 (T003) - Convert breakpoint/clear-file.ts
  - [`file:packages/extension/src/vsc-scripts/breakpoint/clear-file.ts`](packages/extension/src/vsc-scripts/breakpoint/clear-file.ts) - breakpoint.clear-file script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t003-t006-breakpoint-scripts) for conversion details

[^12]: Phase 3 Task 3.1 (T004) - Convert breakpoint/clear-project.ts
  - [`file:packages/extension/src/vsc-scripts/breakpoint/clear-project.ts`](packages/extension/src/vsc-scripts/breakpoint/clear-project.ts) - breakpoint.clear-project script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t003-t006-breakpoint-scripts) for conversion details

[^13]: Phase 3 Task 3.1 (T005) - Convert breakpoint/list.ts
  - [`file:packages/extension/src/vsc-scripts/breakpoint/list.ts`](packages/extension/src/vsc-scripts/breakpoint/list.ts) - breakpoint.list script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t003-t006-breakpoint-scripts) for conversion details

[^14]: Phase 3 Task 3.1 (T006) - Convert breakpoint/remove.ts
  - [`file:packages/extension/src/vsc-scripts/breakpoint/remove.ts`](packages/extension/src/vsc-scripts/breakpoint/remove.ts) - breakpoint.remove script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t003-t006-breakpoint-scripts) for conversion details

[^15]: Phase 3 Task 3.2 (T007) - Convert code/replace-method.ts
  - [`file:packages/extension/src/vsc-scripts/code/replace-method.ts`](packages/extension/src/vsc-scripts/code/replace-method.ts) - code.replace-method script converted to TypeScript with @RegisterScript decorator
  - PRIMARY GOAL SCRIPT - enables debugging of symbol resolution issues
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t007-code-replace-method) for conversion details

[^16]: Phase 3 Task 3.3 (T008) - Convert dap/compare.ts
  - [`file:packages/extension/src/vsc-scripts/dap/compare.ts`](packages/extension/src/vsc-scripts/dap/compare.ts) - dap.compare script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t008-t015-dap-scripts) for conversion details

[^17]: Phase 3 Task 3.3 (T009) - Convert dap/exceptions.ts
  - [`file:packages/extension/src/vsc-scripts/dap/exceptions.ts`](packages/extension/src/vsc-scripts/dap/exceptions.ts) - dap.exceptions script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t008-t015-dap-scripts) for conversion details

[^18]: Phase 3 Task 3.3 (T010) - Convert dap/filter.ts
  - [`file:packages/extension/src/vsc-scripts/dap/filter.ts`](packages/extension/src/vsc-scripts/dap/filter.ts) - dap.filter script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t008-t015-dap-scripts) for conversion details

[^19]: Phase 3 Task 3.3 (T011) - Convert dap/logs.ts
  - [`file:packages/extension/src/vsc-scripts/dap/logs.ts`](packages/extension/src/vsc-scripts/dap/logs.ts) - dap.logs script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t008-t015-dap-scripts) for conversion details

[^20]: Phase 3 Task 3.3 (T012) - Convert dap/search.ts
  - [`file:packages/extension/src/vsc-scripts/dap/search.ts`](packages/extension/src/vsc-scripts/dap/search.ts) - dap.search script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t008-t015-dap-scripts) for conversion details

[^21]: Phase 3 Task 3.3 (T013) - Convert dap/stats.ts
  - [`file:packages/extension/src/vsc-scripts/dap/stats.ts`](packages/extension/src/vsc-scripts/dap/stats.ts) - dap.stats script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t008-t015-dap-scripts) for conversion details

[^22]: Phase 3 Task 3.3 (T014) - Convert dap/summary.ts
  - [`file:packages/extension/src/vsc-scripts/dap/summary.ts`](packages/extension/src/vsc-scripts/dap/summary.ts) - dap.summary script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t008-t015-dap-scripts) for conversion details

[^23]: Phase 3 Task 3.3 (T015) - Convert dap/timeline.ts
  - [`file:packages/extension/src/vsc-scripts/dap/timeline.ts`](packages/extension/src/vsc-scripts/dap/timeline.ts) - dap.timeline script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#tasks-t008-t015-dap-scripts) for conversion details

[^24]: Phase 3 Task 3.4 (T016) - Convert diag/collect.ts
  - [`file:packages/extension/src/vsc-scripts/diag/collect.ts`](packages/extension/src/vsc-scripts/diag/collect.ts) - diag.collect script converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t016-diag-collect) for conversion details

[^25]: Phase 3 Task 3.6 & 3.11 (T018 & T023) - Fix source map configuration for debugging
  - [`file:.vscode/launch.json`](.vscode/launch.json) - Added sourceMapPathOverrides for webpack path mapping
  - PRIMARY GOAL ACHIEVED: Breakpoints now work in TypeScript source files
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t018) for debugging validation details

[^26]: Phase 3 Task 3.10 (T022) - Fix manifest generation to use .js extensions
  - [`file:scripts/build-manifest.cts`](scripts/build-manifest.cts) - Updated to convert .ts to .js in manifest output
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t022) for fix details

[^27]: Phase 3 Task 3.10 (T022) - Fix package.json manifest:build script path
  - [`file:packages/extension/package.json`](packages/extension/package.json) - Corrected manifest:build script reference
  - See: [Execution Log](tasks/phase-3-script-conversion-batch-1/execution.log.md#task-t022) for fix details

[^28]: Phase 4 Task 4.1 - Convert debug/ scripts (17 files)
  - [`file:packages/extension/src/vsc-scripts/debug/continue.ts`](packages/extension/src/vsc-scripts/debug/continue.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/evaluate.ts`](packages/extension/src/vsc-scripts/debug/evaluate.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/get-variable.ts`](packages/extension/src/vsc-scripts/debug/get-variable.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/list-variables.ts`](packages/extension/src/vsc-scripts/debug/list-variables.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/restart.ts`](packages/extension/src/vsc-scripts/debug/restart.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/save-variable.ts`](packages/extension/src/vsc-scripts/debug/save-variable.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/scopes.ts`](packages/extension/src/vsc-scripts/debug/scopes.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/set-variable.ts`](packages/extension/src/vsc-scripts/debug/set-variable.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/stack.ts`](packages/extension/src/vsc-scripts/debug/stack.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/start.ts`](packages/extension/src/vsc-scripts/debug/start.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/step-into.ts`](packages/extension/src/vsc-scripts/debug/step-into.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/step-out.ts`](packages/extension/src/vsc-scripts/debug/step-out.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/step-over.ts`](packages/extension/src/vsc-scripts/debug/step-over.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/stop.ts`](packages/extension/src/vsc-scripts/debug/stop.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/threads.ts`](packages/extension/src/vsc-scripts/debug/threads.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/tracker.ts`](packages/extension/src/vsc-scripts/debug/tracker.ts)
  - [`file:packages/extension/src/vsc-scripts/debug/wait-for-hit.ts`](packages/extension/src/vsc-scripts/debug/wait-for-hit.ts)
  - All converted to TypeScript with @RegisterScript decorators
  - See: [Execution Log](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-41-convert-debug-scripts-17-files)

[^29]: Phase 4 Task 4.2 - Convert editor/ scripts (3 files)
  - [`file:packages/extension/src/vsc-scripts/editor/get-context.ts`](packages/extension/src/vsc-scripts/editor/get-context.ts)
  - [`file:packages/extension/src/vsc-scripts/editor/goto-line.ts`](packages/extension/src/vsc-scripts/editor/goto-line.ts)
  - [`file:packages/extension/src/vsc-scripts/editor/show-testing-ui.ts`](packages/extension/src/vsc-scripts/editor/show-testing-ui.ts)
  - All converted to TypeScript with @RegisterScript decorators
  - See: [Execution Log](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-42-convert-editor-scripts-3-files)

[^30]: Phase 4 Task 4.3 - Convert search/ scripts (1 file)
  - [`file:packages/extension/src/vsc-scripts/search/symbol-search.ts`](packages/extension/src/vsc-scripts/search/symbol-search.ts)
  - Converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-43-convert-search-scripts-1-file)

[^31]: Phase 4 Task 4.4 - Convert symbol/ scripts (2 files)
  - [`file:packages/extension/src/vsc-scripts/symbol/navigate.ts`](packages/extension/src/vsc-scripts/symbol/navigate.ts)
  - [`file:packages/extension/src/vsc-scripts/symbol/rename.ts`](packages/extension/src/vsc-scripts/symbol/rename.ts)
  - Both converted to TypeScript with @RegisterScript decorators
  - See: [Execution Log](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-44-convert-symbol-scripts-2-files)

[^32]: Phase 4 Task 4.5 - Convert tests/ scripts (1 file)
  - [`file:packages/extension/src/vsc-scripts/tests/debug-single.ts`](packages/extension/src/vsc-scripts/tests/debug-single.ts)
  - Converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-45-convert-tests-scripts-1-file)

[^33]: Phase 4 Task 4.6 - Convert utils/ scripts (1 file)
  - [`file:packages/extension/src/vsc-scripts/utils/restart-vscode.ts`](packages/extension/src/vsc-scripts/utils/restart-vscode.ts)
  - Converted to TypeScript with @RegisterScript decorator
  - See: [Execution Log](tasks/phase-4-script-conversion-batch-2/execution.log.md#task-46-convert-utils-scripts-1-file)

**Initial State**:
```markdown
[^3]: [To be added during implementation via plan-6a]
[^4]: [To be added during implementation via plan-6a]
...
```

---

## Critical Insights Discussion

**Session**: 2025-11-02 00:28
**Context**: Script TypeScript Conversion Implementation Plan v1.1.0
**Analyst**: AI Clarity Agent
**Reviewer**: Development Team
**Format**: Water Cooler Conversation (5 Critical Insights)

### Insight 1: Webpack Tree-Shaking Could Silently Remove Decorated Scripts

**Did you know**: Webpack's tree-shaking optimization might silently remove decorated scripts from the bundle, even though they're perfectly valid, because decorators don't create explicit usage references that webpack can detect.

**Implications**:
- Scripts disappear from production bundle without build errors
- Works in Extension Host dev mode, breaks in bundled VSIX
- Silent failures hard to diagnose (CLI returns "Unknown script" errors)

**Options Considered**:
- Option A: Side-Effect Imports with Magic Comments (package.json sideEffects config)
- Option B: Explicit Script Class References (manual registry array)
- Option C: Dynamic Import Pattern (defeats debugging purpose)
- Option D: Integration Test in Bundled Environment (detection only)

**AI Recommendation**: Option A + existing integration tests
- Reasoning: Industry-standard webpack pattern, existing `just test-integration` runs against built VSIX

**Discussion Summary**:
User correctly identified that existing integration tests already validate the built VSIX, eliminating need for special test infrastructure. Just need the sideEffects configuration.

**Decision**: Use `"sideEffects": ["src/vsc-scripts/**/*.ts"]` in package.json

**Action Items**:
- [x] Added Task 1.6: Add sideEffects config to package.json
- [x] Updated Task 7.3: Document sideEffects pattern in add-new-script.md

**Affects**: Phase 1 (Infrastructure), Phase 7 (Documentation)

---

### Insight 2: Decorator Execution Order Creates Registration Race Condition

**Did you know**: TypeScript decorators execute during module imports, creating a race condition where scripts try to register before the metadata storage WeakMap exists, causing "Cannot read property 'set' of undefined" runtime errors.

**Implications**:
- Timing-dependent bugs based on import order
- Works sometimes, fails others (webpack chunking affects order)
- Hard to debug (error during module initialization before logging starts)

**Options Considered**:
- Option A: Singleton Pattern with Lazy Initialization (getter creates WeakMap on first access)
- Option B: Explicit Initialization Export (manual initializeRegistry() call)
- Option C: Module-Level Initialization (trust ES6 guarantees)
- Option D: Two-Phase Registration (temporary array → finalize)

**AI Recommendation**: Option A (Lazy Initialization)
- Reasoning: Eliminates race condition entirely, webpack-proof, no manual initialization steps

**Discussion Summary**:
User agreed that lazy initialization provides the most robust solution without requiring discipline or manual steps.

**Decision**: Implement lazy initialization pattern for scriptMetadata WeakMap

**Action Items**:
- [x] Updated Task 2.1: Test import order independence
- [x] Updated Task 2.2: Specify lazy init requirement
- [x] Updated Task 2.3: Clarify lazy initialization pattern

**Affects**: Phase 2 (Decorator System)

---

### Insight 3: TypeScript Strict Mode Will Expose Untyped BridgeContext Usage

**Did you know**: Enabling TypeScript compilation for scripts will immediately expose 100+ type errors across all 41 scripts because they access untyped BridgeContext properties (vscode namespace, debug sessions without null checks), blocking Phase 1 before any conversion starts.

**Implications**:
- Build fails in Phase 1 before conversion can begin
- Can't convert scripts incrementally if they won't compile
- Scope creep: fixing type errors wasn't in original estimate
- Either fix types first or use `any` casts (defeats purpose)

**Options Considered**:
- Option A: Type BridgeContext Properly First (new Phase 0)
- Option B: Use TypeScript `any` Escape Hatches (defer type safety)
- Option C: Gradual Strict Mode (convert first, strict mode later)
- Option D: Fix Types During Conversion (per-script, unpredictable effort)

**AI Recommendation**: Option A (Type BridgeContext First)
- Reasoning: Enables primary goal (type safety + debugging), catches real bugs, makes all 41 conversions easier

**Discussion Summary**:
User chose to do the type safety work upfront rather than compromising with escape hatches or deferring to later.

**Decision**: Add Phase 0 to properly type BridgeContext interface before infrastructure setup

**Action Items**:
- [x] Created Phase 0: BridgeContext Type Safety (7 tasks)
- [x] Updated TOC and phase numbering
- [x] Set Phase 1 dependency on Phase 0 completion

**Affects**: All phases (new Phase 0 created, total phases: 7 → 8)

---

### Insight 4: Source Maps Break When Debugging Through Webpack DevServer

**Did you know**: ~~Source maps might break...~~ **Actually a non-issue** - user correctly identified that existing extension code already debugs successfully, meaning source map configuration is already correct.

**Implications**:
- None - scripts will use the same build configuration as other extension code

**Options Considered**:
- Not applicable

**AI Recommendation**: No changes needed
- Reasoning: Scripts will be compiled exactly like other extension TypeScript that already has working debugging

**Discussion Summary**:
User challenged the assumption by pointing out that other VSC-Bridge code already debugs fine. This revealed the insight was based on incorrect assumptions - removing scripts from tsconfig exclusion and replacing eval('require') with static imports gives scripts the same source map behavior as the rest of the extension.

**Decision**: No special source map configuration needed - use existing webpack setup

**Action Items**: None

**Affects**: None

---

### Insight 5: Manifest Generation Will Break During Transition Period

**Did you know**: The build-manifest.cts script expects to find `.js` files next to `.meta.yaml` files, meaning the build will fail as soon as you convert the first script to `.ts` in Phase 3, blocking all incremental testing.

**Implications**:
- Can't test scripts incrementally (convert one → build breaks)
- Forces "big bang" conversion of all 41 scripts without testing
- Violates TAD approach (can't run tests between conversions)

**Options Considered**:
- Option A: Update Manifest Builder First (check for both .ts and .js)
- Option B: Keep Both .js and .ts During Transition (confusing, risk editing wrong file)
- Option C: Convert All 41 Scripts in Single Session (extremely risky)
- Option D: Separate Build Configurations (complex, duplicate infrastructure)

**AI Recommendation**: Option A (Update Manifest Builder First)
- Reasoning: Enables TAD approach, low risk, clean transition, one-time effort benefits all conversions

**Discussion Summary**:
User agreed that updating the manifest builder first is the cleanest approach.

**Decision**: Update build-manifest.cts to check for both .ts and .js files (prefer .ts)

**Action Items**:
- [x] Added Task 1.8: Update build-manifest.cts to support TypeScript files

**Affects**: Phase 1 (Infrastructure Setup)

---

## Session Summary

**Insights Surfaced**: 5 critical insights identified and discussed
**Decisions Made**: 4 decisions reached (1 insight was a non-issue)
**Action Items Created**: 8 plan updates applied immediately during discussion
**Areas Requiring Updates**:
- Phase 0: Created entirely new phase for BridgeContext typing
- Phase 1: Added 2 new tasks (sideEffects, manifest builder)
- Phase 2: Enhanced 3 tasks for lazy initialization
- Phase 7: Enhanced documentation task

**Shared Understanding Achieved**: ✓

**Confidence Level**: High - Critical gaps identified and addressed

**Next Steps**:
Run `/plan-5-phase-tasks-and-brief` to generate Phase 0 task dossier and begin implementation

**Notes**:
- User's challenge on Insight #4 (source maps) revealed it was a non-issue - good critical thinking
- All insights led to immediate plan improvements, no deferred work
- Plan evolved from 62 → 70 tasks, 7 → 8 phases during session
- Core debugging goal remains achievable with stronger foundation

---

✅ **Plan validated and ready:**
- Location: /workspaces/vscode-bridge/docs/plans/26-script-typescript-conversion/script-typescript-conversion-plan.md
- Phases: 8 (added Phase 0 for BridgeContext typing)
- Total tasks: 70 (validation +5, webpack +1, Phase 0 +7, manifest +1)
- Validation: READY (all HIGH/MEDIUM violations resolved)
- Insights: 5 critical discoveries applied (tree-shaking, race conditions, type safety, manifest generation)
- Next step: Run `/plan-5-phase-tasks-and-brief` to generate Phase 0 task dossier