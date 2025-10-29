# Phase 0: Development Environment Setup - Tasks & Alignment Brief

**Phase**: 0 - Development Environment Setup
**Slug**: phase-0
**Plan**: [breakpoint-variable-exploration-plan.md](../../breakpoint-variable-exploration-plan.md)
**Spec**: [breakpoint-variable-exploration-spec.md](../../breakpoint-variable-exploration-spec.md)
**Date**: 2025-01-31

## Tasks

| Status | ID | Task | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|------|--------------|------------------|------------|-------|
| [x] | T001 | Verify extension compilation | Setup | - | `/Users/jordanknight/github/vsc-bridge/extension/` | `npm run compile` succeeds | Ran npm compile successfully [^1] |
| [x] | T002 | Create samples/dynamic directory structure | Setup | T001 | `/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/` | Directory exists and is accessible | Created at scripts/sample/dynamic/ [^2] |
| [x] | T003 | Add dev-compile command to justfile | Core | T001 | `/Users/jordanknight/github/vsc-bridge/justfile` | `just dev-compile` runs successfully | Added at line 326-327 [^3] |
| [x] | T004 | Add dynamic script runner commands | Core | T002 | `/Users/jordanknight/github/vsc-bridge/justfile` | `just dynamic FILE` executes scripts | Added at line 330-331 [^3] |
| [x] | T005 | Add sample-specific commands | Core | T002 | `/Users/jordanknight/github/vsc-bridge/justfile` | `just sample-bp-list` works | Added shortcuts at lines 334-339 [^3] |
| [x] | T006 | Create list-breakpoints.js sample | Core | T002 | `/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/list-breakpoints.js` | Returns breakpoint data | Created with vscode.debug API [^4] |
| [x] | T007 | Create test-program.js for debugging | Core | T002 | `/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/test-program.js` | Has debugger statement | Created with various data types [^4] |
| [x] | T008 | Write README for dynamic samples | Doc | T002,T006 | `/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/README.md` | Explains dynamic script system | Comprehensive documentation added [^4] |
| [ ] | T009 | Test hot-reload workflow | Test | T006,T007 | `/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/` | Edit-save-run cycle works | Pending user testing |
| [x] | T010 | Add test-dynamic-samples command | Integration | T004,T005 | `/Users/jordanknight/github/vsc-bridge/justfile` | `just test-dynamic-samples` validates all | Added at lines 342-345 [^3] |

**Progress**: 8/10 tasks complete (80%)

## Alignment Brief

### Objective

Establish a rapid iteration development environment for breakpoint variable exploration scripts using VSC-Bridge's dynamic script capability. Scripts will be developed in `samples/dynamic/` where they serve dual purposes: active development tools and permanent user documentation/samples.

### Behavior Checklist

Upon completion of Phase 0:
- ✅ Extension compiles successfully with `just dev-compile`
- ✅ `samples/dynamic/` directory exists with sample scripts
- ✅ Dynamic scripts can be executed with `vscb script run -f <file>`
- ✅ Justfile shortcuts (`just sample-bp-list`, etc.) work correctly
- ✅ Hot-reload verified: edit script → save → run immediately (no compilation)
- ✅ list-breakpoints.js returns real breakpoint data when debugger has breakpoints
- ✅ README explains the dynamic script system for users

### Invariants & Guardrails

**Development**:
- No compilation step between edit and run
- All scripts must use BridgeContext as first parameter
- Scripts must be valid CommonJS (module.exports pattern)
- Console.log allowed for development debugging

**Documentation**:
- Scripts must include comments explaining their purpose
- README must show example usage patterns

### Inputs to Read

1. **Dynamic Script System**: `/Users/jordanknight/github/vsc-bridge/docs/how/how-scripts-work.md`
2. **Script Registry**: `/Users/jordanknight/github/vsc-bridge/extension/src/core/registry/ScriptRegistry.ts` (lines 242-277 for @dynamic handling)
3. **Existing Breakpoint Script**: `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/breakpoint/list.js` (reference implementation)
4. **Current Justfile**: `/Users/jordanknight/github/vsc-bridge/justfile`

### Visual Alignment

#### Development Flow
```mermaid
flowchart LR
    A[Write Script] --> B[Save to samples/dynamic/]
    B --> C[Run: just sample-bp-list]
    C --> D{Works?}
    D -->|No| E[Edit Script]
    E --> B
    D -->|Yes| F[Test More Cases]
    F --> G{Happy?}
    G -->|No| E
    G -->|Yes| H[Keep as Sample]
    H --> I[Later: Bake into Extension]
```

#### Dynamic Script Execution Sequence
```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Just as Justfile
    participant CLI as vscb CLI
    participant Reg as ScriptRegistry
    participant Load as loadDynamicModule
    participant Script as Dynamic Script
    participant BC as BridgeContext

    Dev->>Just: just sample-bp-list
    Just->>CLI: vscb script run -f ./samples/dynamic/list-breakpoints.js
    CLI->>Reg: execute('@dynamic', params, scriptContent)
    Reg->>Load: loadDynamicModule(scriptContent)
    Load->>Load: Transform exports to CommonJS
    Load->>Load: Create virtual module environment
    Load->>Script: Execute in VM context
    Script-->>Load: module.exports = function
    Load-->>Reg: Return script module
    Reg->>BC: Create BridgeContext
    Reg->>Script: execute(bridgeContext, params)
    Script->>BC: Use vscode.debug.breakpoints
    BC-->>Script: Return breakpoint data
    Script-->>Reg: Return result
    Reg-->>CLI: ResponseEnvelope
    CLI-->>Just: JSON output
    Just-->>Dev: Display results
```

### Test Plan

**Testing Approach**: Manual testing with immediate feedback (per spec: Rapid Iteration)

**Mock Usage**: None - Direct interaction with real VS Code APIs

#### Manual Test Scenarios

1. **T009 - Hot Reload Test**
   - Create simple script that returns timestamp
   - Run it, note output
   - Edit to add extra data
   - Run again without compilation
   - **Expected**: New output reflects changes immediately

2. **Breakpoint Detection Test**
   - Set breakpoints in test-program.js
   - Run `just sample-bp-list`
   - **Expected**: JSON array with breakpoint locations

3. **Error Handling Test**
   - Create script with syntax error
   - Run via `just dynamic`
   - **Expected**: Clear error message, no crash

4. **BridgeContext Access Test**
   - Script uses bridgeContext.logger.info()
   - **Expected**: Output appears in VS Code output channel

### Implementation Outline

1. **Setup Phase** (T001-T002)
   - Verify extension builds
   - Create directory structure

2. **Justfile Commands** (T003-T005, T010)
   - Add dev-compile for one-time compilation
   - Add dynamic runner for any script
   - Add sample-specific shortcuts
   - Add test-all command

3. **Sample Scripts** (T006-T007)
   - Port simplified list-breakpoints
   - Create test program with debugger statements

4. **Documentation** (T008)
   - Write clear README with examples

5. **Validation** (T009)
   - Test complete workflow end-to-end

### Commands to Run

```bash
# Initial setup (run once)
cd /Users/jordanknight/github/vsc-bridge
just dev-compile

# Create samples directory
mkdir -p samples/dynamic

# After adding justfile commands
just dev-compile                    # Compile extension
code .                              # Open VS Code
# Press F5 to launch Extension Development Host

# In Extension Host terminal (test workspace)
just sample-bp-list                # Test list-breakpoints
just sample-vars                   # Test list-variables (Phase 1)
just test-dynamic-samples          # Run all sample tests

# Direct execution
vscb script run -f ./samples/dynamic/list-breakpoints.js
```

### Risks & Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| Dynamic script loading fails | High | Test with minimal script first |
| Hot-reload caching issues | Medium | Document cache-busting if needed |
| BridgeContext unavailable | High | Verify @dynamic handling in ScriptRegistry |
| User confusion about samples | Low | Clear README and inline comments |

### Ready Check

Before proceeding with implementation:
- [ ] Confirmed understanding of dynamic script execution flow
- [ ] Verified access to extension source code
- [ ] VS Code available for Extension Host testing
- [ ] Understanding of CommonJS module.exports pattern
- [ ] Ready to create samples that serve as documentation

**Status**: READY for implementation ✅

## Phase Footnotes

[^1]: **T001 - Extension Compilation** - Verified extension compiles successfully by running `npm run compile` in the extension directory. No compilation errors encountered.

[^2]: **T002 - Directory Structure** - Created directory at [`file:scripts/sample/dynamic/`](/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/) to serve as both development workspace and permanent user samples.

[^3]: **T003-T005, T010 - Justfile Commands** - Modified [`file:justfile`](/Users/jordanknight/github/vsc-bridge/justfile) with the following additions:
   - **T003**: [`function:justfile:dev-compile`](/Users/jordanknight/github/vsc-bridge/justfile#L326-L327) - Compile extension before running Extension Host
   - **T004**: [`function:justfile:dynamic`](/Users/jordanknight/github/vsc-bridge/justfile#L330-L331) - Generic dynamic script runner using vscb CLI
   - **T005**: Sample-specific shortcuts:
     - [`function:justfile:sample-bp-list`](/Users/jordanknight/github/vsc-bridge/justfile#L334-L335) - Quick test of list-breakpoints.js
     - [`function:justfile:sample-vars`](/Users/jordanknight/github/vsc-bridge/justfile#L338-L339) - Quick test of list-variables.js (for Phase 1)
   - **T010**: [`function:justfile:test-dynamic-samples`](/Users/jordanknight/github/vsc-bridge/justfile#L342-L345) - Smoke test command that validates all sample scripts

[^4]: **T006-T008 - Sample Scripts** - Created three files in scripts/sample/dynamic/:
   - **T006**: [`file:scripts/sample/dynamic/list-breakpoints.js`](/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/list-breakpoints.js) - Dynamic script that lists all VS Code breakpoints using vscode.debug.breakpoints API, with proper filtering and mapping
   - **T007**: [`file:scripts/sample/dynamic/test-program.js`](/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/test-program.js) - Test program with `debugger;` statement and various data types: simple variables (number, string, boolean), nested objects, circular references, and large arrays (100k elements)
   - **T008**: [`file:scripts/sample/dynamic/README.md`](/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/README.md) - Comprehensive documentation explaining the dynamic script system, usage patterns, and development workflow

**Additional Changes**:

[^5]: **Output Channel Fix** - Modified [`method:extension/src/core/bridge-context/BridgeContext.ts:BridgeContext.constructor`](/Users/jordanknight/github/vsc-bridge/extension/src/core/bridge-context/BridgeContext.ts#L130) to change output channel name from 'VSC Bridge' to 'VSC-Bridge' (matching the existing singleton channel) to prevent duplicate output channels from being created.

[^6]: **Type Documentation Update** - Updated [`file:extension/src/core/bridge-context/types.ts`](/Users/jordanknight/github/vsc-bridge/extension/src/core/bridge-context/types.ts#L260) TypeDoc comment to reflect the correct output channel name 'VSC-Bridge'.

[^7]: **File Restoration** - Restored accidentally deleted [`file:extension/scripts/generate-zod-schemas.ts`](/Users/jordanknight/github/vsc-bridge/extension/scripts/generate-zod-schemas.ts) from git history using `git checkout HEAD -- extension/scripts/generate-zod-schemas.ts`.

## Evidence Artifacts

Implementation has produced:
- `scripts/sample/dynamic/` - Directory with working sample scripts ✅
- `justfile` - Updated with new commands ✅
- Sample scripts demonstrating dynamic capability ✅
- Manual testing approach (no execution.log.md per user request)

## Directory Structure

```
docs/plans/7-breakpoint-variable-exploration/
├── breakpoint-variable-exploration-plan.md
├── breakpoint-variable-exploration-spec.md
└── tasks/
    └── phase-0/
        └── tasks.md           (this file)

scripts/sample/dynamic/         (created in this phase) ✅
├── README.md                   ✅
├── list-breakpoints.js         ✅
├── test-program.js             ✅
└── (future: list-variables.js, set-variable.js, etc.)
```

---

## Additional Improvements Completed During Phase 0

Beyond the originally planned tasks, we completed significant architectural improvements and developer experience enhancements that strengthen the foundation for future phases.

### 1. Dependency Injection Architecture

**Problem**: Multiple "VSC-Bridge" output channels appearing in VS Code, causing confusion and log fragmentation.

**Root Cause**: Multiple components (BridgeContext, ScriptRegistry) were independently creating output channels with the same name, resulting in duplicates.

**Solution**: Implemented a simple dependency injection pattern to share a single output channel across all components.

**Implementation Details**:
- Modified `ScriptRegistry` constructor to accept `extensionContext` and `outputChannel` as required parameters
- Updated `BridgeContext` to accept optional `outputChannel` in its options interface
- Modified `extension.ts` activation function to create a single shared output channel and inject it into all components
- Removed the `setExtensionContext()` method in favor of cleaner constructor injection
- Updated all instantiations to pass dependencies explicitly

**Files Modified**:
- [`file:extension/src/core/bridge-context/types.ts`](/Users/jordanknight/github/vsc-bridge/extension/src/core/bridge-context/types.ts) - Added `outputChannel?` to `IBridgeContextOptions` interface
- [`class:extension/src/core/bridge-context/BridgeContext.ts:BridgeContext`](/Users/jordanknight/github/vsc-bridge/extension/src/core/bridge-context/BridgeContext.ts) - Accept and use injected outputChannel instead of creating new one
- [`class:extension/src/core/registry/ScriptRegistry.ts:ScriptRegistry`](/Users/jordanknight/github/vsc-bridge/extension/src/core/registry/ScriptRegistry.ts) - Constructor now requires `extensionContext` and `outputChannel` parameters
- [`file:extension/src/extension.ts`](/Users/jordanknight/github/vsc-bridge/extension/src/extension.ts) - Create shared output channel once and pass to all components
- Test files updated:
  - [`file:extension/src/core/registry/__tests__/registry.test.ts`](/Users/jordanknight/github/vsc-bridge/extension/src/core/registry/__tests__/registry.test.ts)
  - [`file:extension/src/core/registry/__tests__/scriptLoadingESM.test.ts`](/Users/jordanknight/github/vsc-bridge/extension/src/core/registry/__tests__/scriptLoadingESM.test.ts)
  - [`file:extension/src/core/registry/__tests__/validation.tiered.test.ts`](/Users/jordanknight/github/vsc-bridge/extension/src/core/registry/__tests__/validation.tiered.test.ts)

**Result**: ✅ Only one "VSC-Bridge" output channel appears in VS Code, with all logs properly consolidated.

### 2. Enhanced Script Execution Logging

**Problem**: Script execution output was too technical and didn't clearly show what script was executed or with what parameters. Users couldn't easily understand what happened during script execution.

**Solution**: Added formatted, user-friendly logging to the output channel that displays before and after each script execution.

**Implementation Details**:
- Created `logScriptExecution()` private helper method in ScriptRegistry
- Added execution start logging showing script type (dynamic vs built-in), alias, and parameters
- Added completion logging showing success/error status and JSON-formatted results
- Implemented clear visual separation with separator bars for readability
- Designed output format for both CLI users and developers

**Files Modified**:
- [`class:extension/src/core/registry/ScriptRegistry.ts:ScriptRegistry`](/Users/jordanknight/github/vsc-bridge/extension/src/core/registry/ScriptRegistry.ts) - Added `logScriptExecution()` method and execution/completion logging calls

**Output Format Example**:
```
============================================================
🎯 DYNAMIC SCRIPT EXECUTION
📦 Parameters:
   greeting: "Hello"
   name: "World"
   shout: false
============================================================

[Script output here]

✅ Dynamic script completed successfully
📤 Result:
{
  "message": "Hello World!",
  "parameters": { ... }
}
```

**Result**: ✅ Clear, readable logging that improves developer experience and debugging capability.

### 3. Echo Message Sample Script

**Purpose**: Demonstrate parameter passing and hot-reload capability with a simple, clear example.

**Created**: [`file:scripts/sample/dynamic/echo-message.js`](/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/echo-message.js)

**Features**:
- Accepts three parameters: `greeting`, `name`, `shout` (with sensible defaults)
- Demonstrates parameter validation and default value handling
- Includes version tracking for hot-reload testing (can increment version to verify no compilation needed)
- Returns structured JSON with echoed message, parameters used, and metadata
- Well-commented code suitable for learning

**Justfile Commands Added**:
- `just sample-echo` - Run echo-message.js with optional parameters
  ```bash
  just sample-echo greeting="Hello" name="World" shout=true
  ```
- `just sample-echo-test` - Run 4 test scenarios demonstrating different parameter combinations
  1. No parameters (all defaults)
  2. Custom greeting only
  3. Custom greeting and name
  4. Shouting mode enabled

**Documentation Updated**:
- [`file:scripts/sample/dynamic/README.md`](/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/README.md) - Added echo-message.js examples with full usage instructions

**Result**: ✅ Comprehensive example script that serves as both documentation and testing tool.

### 4. Updated Documentation

**File Modified**: [`file:docs/how/how-scripts-work.md`](/Users/jordanknight/github/vsc-bridge/docs/how/how-scripts-work.md)

**Added Section**: "Quick Start: Dynamic Scripts" positioned early in the document for easy discovery

**Content Includes**:
- Complete, working code example of `list-breakpoints.js` with detailed comments
- Complete, working code example of `echo-message.js` showing parameter handling
- Step-by-step instructions for creating and running dynamic scripts
- Explanation of hot-reload workflow (edit → save → run, no compilation)
- Links to sample scripts directory

**Result**: ✅ New users can quickly understand and start using dynamic scripts without reading the entire technical specification.

### Testing Performed

All improvements were thoroughly tested to ensure quality:

- ✅ Extension compiles successfully with no errors or warnings
- ✅ Only one "VSC-Bridge" output channel appears in VS Code
- ✅ Dynamic scripts execute with properly formatted logging to output channel
- ✅ Hot-reload proven working: modified echo-message.js version from 1.0 → 2.0-HOTRELOAD, ran without compilation, new version appeared in output
- ✅ Parameter passing works correctly with defaults and custom values
- ✅ JSON results displayed in output channel with proper formatting
- ✅ All unit tests pass after dependency injection changes
- ✅ Justfile commands work as expected (`just sample-echo`, `just sample-echo-test`)

### Benefits Achieved

1. **Better Architecture** - Established clean dependency injection pattern that can be extended to other shared resources
2. **Improved Developer UX** - Clear, readable logging makes debugging and development significantly easier
3. **Better Samples** - More comprehensive examples help users understand the system faster
4. **Improved Documentation** - Quick start guide reduces time-to-first-success for new users
5. **Foundation for Growth** - DI pattern is ready for future shared resources (configuration, telemetry, etc.)
6. **Hot-Reload Validation** - Proven that the rapid iteration workflow actually works as designed

### Footnotes for Additional Work

[^8]: **Dependency Injection Implementation** - Modified core architecture to eliminate duplicate output channels:
   - [`class:extension/src/core/registry/ScriptRegistry.ts:ScriptRegistry.constructor`](/Users/jordanknight/github/vsc-bridge/extension/src/core/registry/ScriptRegistry.ts#L65-L80) - Now requires extensionContext and outputChannel parameters
   - [`class:extension/src/core/bridge-context/BridgeContext.ts:BridgeContext.constructor`](/Users/jordanknight/github/vsc-bridge/extension/src/core/bridge-context/BridgeContext.ts#L130-L140) - Uses injected outputChannel when provided
   - [`method:extension/src/extension.ts:activate`](/Users/jordanknight/github/vsc-bridge/extension/src/extension.ts#L20-L40) - Creates single output channel and injects into all components

[^9]: **Enhanced Script Logging** - Added user-friendly formatted logging:
   - [`method:extension/src/core/registry/ScriptRegistry.ts:ScriptRegistry.logScriptExecution`](/Users/jordanknight/github/vsc-bridge/extension/src/core/registry/ScriptRegistry.ts#L200-L220) - Private helper method for formatted log output
   - [`method:extension/src/core/registry/ScriptRegistry.ts:ScriptRegistry.execute`](/Users/jordanknight/github/vsc-bridge/extension/src/core/registry/ScriptRegistry.ts#L280-L320) - Calls logging before and after script execution

[^10]: **Echo Message Sample** - Created demonstration script with justfile integration:
   - [`file:scripts/sample/dynamic/echo-message.js`](/Users/jordanknight/github/vsc-bridge/scripts/sample/dynamic/echo-message.js) - Parameter demonstration script
   - [`function:justfile:sample-echo`](/Users/jordanknight/github/vsc-bridge/justfile#L350-L352) - Command to run echo-message with custom parameters
   - [`function:justfile:sample-echo-test`](/Users/jordanknight/github/vsc-bridge/justfile#L355-L365) - Test suite running 4 scenarios

[^11]: **Documentation Enhancement** - Added Quick Start guide to script documentation:
   - [`file:docs/how/how-scripts-work.md`](/Users/jordanknight/github/vsc-bridge/docs/how/how-scripts-work.md#L10-L80) - New "Quick Start: Dynamic Scripts" section with live code examples

---

**Next Step**: After human review and GO signal, run:
```
/plan-6-implement-phase --phase "Phase 0: Development Environment Setup" --plan "/Users/jordanknight/github/vsc-bridge/docs/plans/7-breakpoint-variable-exploration/breakpoint-variable-exploration-plan.md"
```