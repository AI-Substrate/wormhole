# Debug Script Bake-In

## Summary

Transform the dynamic debug scripts developed for variable exploration into permanently integrated extension scripts with a robust architecture supporting language-specific debugging features. This feature takes the proven dynamic scripts from the rapid iteration development phase and bakes them into the main VSC Bridge extension, establishing a proper service layer with base classes, interfaces, and language-specific implementations. Node.js debugging capabilities are fully implemented based on our dynamic scripts, while other language adapters (Python, C#, Go, Dart, Java) are scaffolded with NOT_IMPLEMENTED placeholders for future development.

## Goals

- Convert all dynamic debug scripts into permanent extension scripts with proper class structure
- Establish RuntimeInspectionService as the central coordinator for debug variable operations
- Create IDebugAdapter interface hierarchy supporting language-specific features
- Implement BaseDebugAdapter with common DAP functionality for all languages
- Provide full NodeDebugAdapter implementation using proven dynamic script logic
- Support variable listing with depth control and cycle detection across all languages
- Enable variable modification through setVariable and evaluate operations
- Implement optional file streaming for large data structures with helpful suggestions when thresholds are exceeded
- Provide enhanced, actionable error messages and warnings with clear recovery steps and alternative options
- Implement standardized error codes (E_NO_SESSION, E_NOT_PAUSED, E_INVALID_PARAMS, etc.) in a central location for consistency across all scripts
- Support pagination for large arrays and collections through get-variable operations
- Expose debug session status and capability tracking through dedicated scripts
- Enable proper scope differentiation (local, closure, global) in variable exploration
- Create language-specific adapter stubs for Python, C#, Go, Dart, and Java
- Preserve original dynamic scripts as user samples and documentation
- Generate proper Zod schemas for all baked-in script parameters

## Non-Goals

- Implementing full functionality for languages other than Node.js in this phase
- Removing or modifying the dynamic script development workflow
- Creating new debugging features beyond what was prototyped in dynamic scripts
- Building visual UI components for variable display
- Implementing custom debug adapters (continue using existing DAP implementations)
- Supporting multiple concurrent debug sessions in the same adapter instance
- Providing language-specific formatters beyond what DAP adapters supply
- Creating automated migration tools for dynamic to baked-in scripts
- Implementing performance profiling or memory analysis features
- Supporting remote debugging scenarios beyond local VS Code sessions

## Acceptance Criteria

1. When the extension loads, all debug scripts from dynamic development are available as permanent commands: `debug.list-variables`, `debug.set-variable`, `debug.get-variable`, `debug.save-variable`, `debug.status`, and `debug.tracker`
2. When debugging Node.js applications, all variable exploration features work identically to their dynamic script counterparts with full depth control, cycle detection, and memory budgets
3. When requesting the RuntimeInspectionService for a debug session, it auto-detects the language type from session.type and returns the appropriate adapter (NodeDebugAdapter for 'pwa-node', stubs for others), or returns a clear status indicating the language is unsupported or could not be detected
4. When calling enhanced features on non-Node adapters, they return clear NOT_IMPLEMENTED errors with suggestions to use base DAP functionality
5. When variable data exceeds the hard-coded thresholds (5MB or 20,000 nodes), the response includes a helpful status message suggesting the use of file streaming mode, allowing the caller to choose whether to retry with the streaming option
6. When errors occur (no session, not paused, invalid params), users receive actionable error messages with specific recovery steps (e.g., "No active debug session. Start debugging with F5" or "Debugger not paused. Set a breakpoint and wait for execution to stop")
7. When the BaseDebugAdapter processes variables, it respects scope.expensive flags and implements proper pagination
8. When detecting cycles in object graphs, the adapter uses language-appropriate strategies (Object.is for JavaScript, id() for Python, memoryReference for compiled languages)
9. When capabilities change mid-session, the DAP tracker updates cached capabilities through the capabilities event
10. When converting dynamic scripts to baked-in format, they maintain identical functionality while using QueryScript/MutateScript base classes
11. When language-specific features are requested (Python exec, JavaScript console), the appropriate adapter interface methods are invoked
12. When building variable trees, memory budgets are enforced to prevent extension host crashes with massive data structures
13. When original dynamic scripts remain in samples/dynamic/, they continue to function as user documentation and examples
14. When manifest.json is updated, all new scripts appear with proper aliases and parameter schemas
15. When running `just test-dynamic-samples`, the original dynamic scripts still pass validation

## Risks & Assumptions

- **Risk**: Breaking changes when converting dynamic scripts to class-based structure → Mitigation: Maintain identical logic, only change module structure
- **Risk**: Adapter detection might fail for uncommon debuggers → Mitigation: GenericDebugAdapter as fallback
- **Risk**: Language-specific cycle detection strategies may not work → Mitigation: Fallback to variablesReference tracking
- **Risk**: File streaming might fail on read-only filesystems → Mitigation: Provide clear error message with alternative approaches (reduce depth, use pagination)
- **Assumption**: All debug adapters implement core DAP specification correctly
- **Assumption**: Extension compilation process handles new script locations properly
- **Assumption**: Users understand NOT_IMPLEMENTED responses for unfinished adapters
- **Assumption**: Zod schema generation works for all parameter types used
- **Risk**: Memory budget calculations might be inaccurate → Mitigation: Conservative thresholds with telemetry
- **Risk**: Capability detection via DebugAdapterTracker might miss events → Mitigation: Handle both initialize response and capabilities events

## Testing Strategy

**Approach**: Manual Only
**Rationale**: The dynamic scripts are already proven and working; this is primarily a structural refactoring. Manual testing with real debugging sessions will validate the conversion.
**Focus Areas**:
- Verify each converted script maintains identical functionality to its dynamic counterpart
- Test adapter selection logic for different language debuggers
- Validate error messages are actionable and helpful
- Ensure memory thresholds trigger appropriate suggestions
**Excluded**: Automated unit tests, as the logic has been validated through dynamic script usage

## Open Questions

- [NEEDS CLARIFICATION: Should we implement telemetry for adapter usage patterns?]

## Clarifications

### Session 2025-01-31

**Q1: Testing Strategy**
- Selected: Manual Only
- Rationale: Will fire it up and check things in conjunction with assistant; dynamic scripts already proven

**Q2: Error Code Standardization**
- Selected: Standardized codes (A)
- Rationale: Keep all codes in central location across the app for consistency

**Q3: Language Adapter Detection**
- Selected: Auto-detect only (A)
- Rationale: We will only support certain languages anyway; should return clear result JSON showing unsupported or undetected languages

**Q4: Memory Threshold Configuration**
- Selected: Hard-coded values (A)
- Rationale: Simple and consistent; most users won't need to change the 5MB/20,000 nodes defaults

**Q5: Interface Versioning**
- Selected: No versioning (A)
- Rationale: Keep it simple; will handle any future breaking changes when needed