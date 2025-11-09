# Script TypeScript Conversion for Debugging Support

## Summary

Convert the VSC-Bridge extension's script system from dynamically-loaded CommonJS modules to statically-compiled TypeScript, enabling developers to debug scripts using standard VS Code debugging tools. Currently, scripts cannot be debugged because they are loaded at runtime using `eval('require')`, which bypasses source maps and prevents breakpoint setting. This conversion will make all 41 scripts fully debuggable while maintaining backward compatibility with the MCP server and CLI tools.

**Context**: This issue was discovered while debugging the `code.replace-method` script (Phase 4 of Plan 25-lsp-features). When attempting to debug why symbol resolution was failing, we found it impossible to set breakpoints or step through script code due to the dynamic loading architecture.

## Goals

- Enable full debugging capabilities for all VSC-Bridge scripts (breakpoints, stepping, variable inspection)
- Convert all 41 existing scripts from JavaScript to TypeScript for type safety and better IDE support
- Maintain 100% backward compatibility with existing MCP server tool discovery and CLI commands
- Preserve the metadata-driven discovery pattern using `.meta.yaml` files
- Improve developer experience when troubleshooting script issues
- Enable source map support for accurate stack traces and error reporting
- Support debugging of scripts in both development and production builds

## Non-Goals

- Changing the script discovery mechanism for MCP tools (still uses manifest.json)
- Modifying the script base class architecture (QueryScript/ActionScript/WaitableScript)
- Altering the parameter validation pattern (Zod schemas remain unchanged)
- Changing how scripts are exposed to users (vscb CLI interface unchanged)
- Refactoring script functionality (behavior must remain identical)
- Creating new scripts or removing existing ones
- Modifying the `.meta.yaml` format or structure
- Changing how dynamic user scripts work (scripts/sample/dynamic/* remain as-is)

## Acceptance Criteria

1. **All scripts are debuggable**: Developer can set breakpoints in any of the 41 scripts and hit them during execution
2. **TypeScript conversion complete**: All scripts in `src/vsc-scripts/**/*.js` are converted to TypeScript (`.ts` files)
3. **Backward compatibility maintained**: All existing CLI commands (`vscb script run`) continue to work identically
4. **MCP tools still discoverable**: MCP server continues to discover and expose all script-based tools
5. **Source maps functional**: Stack traces show correct line numbers in original TypeScript source files
6. **IDE support improved**: VS Code provides full IntelliSense, go-to-definition, and refactoring support for scripts
7. **Build process updated**: `just build` compiles all TypeScript scripts successfully
8. **No runtime performance degradation**: Script execution time remains within 10% of current performance
9. **Debugging works in Extension Host**: Scripts can be debugged when running in VS Code Extension Development Host
10. **Error messages preserve context**: Runtime errors show meaningful stack traces pointing to source files
11. **Dynamic scripts unaffected**: User-provided dynamic scripts in `scripts/sample/dynamic/` continue to work
12. **Script registration validated**: All 41 scripts appear in manifest.json after build

## Risks & Assumptions

**Risks:**
- Breaking changes to script loading could affect all VSC-Bridge functionality
- TypeScript conversion might introduce subtle behavioral changes
- Build time may increase significantly with 41 additional TypeScript files
- Memory usage might increase if scripts are all loaded at startup
- Circular dependencies between scripts and core modules could emerge

**Assumptions:**
- All existing scripts follow consistent patterns that can be converted systematically
- TypeScript's module resolution will work with existing webpack configuration
- The ScriptRegistry can be modified to accept statically-imported scripts
- Performance impact of loading all scripts at startup is acceptable
- Existing Zod schemas in scripts will work with TypeScript

## Architectural Decisions

**Script Registration via Decorators**: Scripts will use TypeScript decorators for registration, allowing easy enable/disable by commenting out decorators. The registry will maintain proper TypeScript linkage for full debugging support - no dynamic loading or eval.

Example:
```typescript
@RegisterScript('debug.status')
export class DebugStatusScript extends QueryScript {
  // Full debugging support with breakpoints, stepping, etc.
}
```

## Open Questions

1. ~~Should scripts be loaded lazily (on-demand) or all at startup?~~ Not applicable - scripts are compiled into bundle
2. How should we handle the migration period where some scripts are TS and others are still JS?
3. Should we preserve the current directory structure (`vsc-scripts/category/script.ts`) or reorganize?
4. What TypeScript strict settings should apply to converted scripts?
5. Should script base classes (QueryScript, ActionScript) be updated with generic types?
6. How do we ensure the conversion doesn't break existing user workflows?
7. Should we add script-specific tests as part of this conversion?
8. How do we validate that all scripts work correctly after conversion?

**Debug Context Link**: This conversion was identified as critical while investigating why the `code.replace-method` script (Plan 25-lsp-features, Phase 4, Task T027) could not be debugged to diagnose symbol resolution failures. See [Phase 4 Execution Log](/workspaces/vscode-bridge/docs/plans/25-lsp-features/tasks/phase-4-method-replacement-tool/execution.log.md) for the specific debugging session that revealed this limitation.

## Testing Strategy

**Approach**: TAD (Test-Assisted Development)
**Rationale**: We'll run tests in the Extension Host and do light testing; tests may not be promoted since we have integration tests to rely on, using them primarily for development.
**Focus Areas**: Script loading mechanism, TypeScript compilation, backward compatibility with CLI/MCP
**Excluded**: Individual script logic (already tested by existing integration tests)
**Mock Usage**: Avoid mocks entirely - use real Extension Host and actual script execution
**TAD-Specific**: Tests serve as development aids for verifying conversion correctness; promotion optional based on value

## Documentation Strategy

**Location**: docs/how/ only
**Rationale**: The architectural change should be documented alongside existing script documentation in docs/how/, updating how-scripts-work.md and adding a debugging guide.
**Content**: Update existing script documentation to explain TypeScript structure, add new debugging guide for baked-in scripts
**Target Audience**: VSC-Bridge developers and contributors who need to debug or modify scripts
**Maintenance**: Update when script architecture changes or new debugging techniques are discovered

## Clarifications

### Session 2025-10-31

**Q1: Testing Strategy**
- Answer: B (TAD)
- Rationale: "We will run it up and do some light testing in the Extension Host. Those tests may not be promoted as we have the integration tests to rely on, so just use them as development aids."

**Q2: Mock Usage**
- Answer: A (Avoid mocks entirely)
- Rationale: Real Extension Host and actual script execution provide the most confidence in the conversion.

**Q3: Documentation Strategy**
- Answer: B (docs/how/ only)
- Rationale: The architectural change should be documented alongside existing script documentation in docs/how/, updating how-scripts-work.md and adding a debugging guide.

**Q4: Script Registration Pattern**
- Answer: B (Decorator pattern)
- Rationale: "Decorators! Then we can comment out the decoration to remove them. As long as when ScriptHost/registry runs them is a proper TS linkage so the debugger works (not any dynamic craziness) then I'm happy."

**Q5: Migration Strategy**
- Answer: A (Big bang - convert all 41 scripts in one phase)
- Rationale: "Do it in one big hit!" - Complete conversion ensures consistent debugging experience across all scripts.