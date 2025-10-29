# Breakpoint Variable Exploration

## Summary

Enable comprehensive exploration and manipulation of variables when execution is paused at breakpoints, providing developers with deep insight into program state through the VSC Bridge debugging interface. This feature transforms the current placeholder implementations into a full-featured variable inspection system that leverages the Debug Adapter Protocol (DAP) to expose runtime values, scopes, and expressions to external tools and AI assistants.

## Goals

- Provide complete visibility into all variables accessible at the current execution point
- Enable evaluation of arbitrary expressions in the paused execution context
- Support inspection of complex data structures with configurable depth per request
- Allow modification of variable values during debugging sessions
- Expose variable type information and metadata for better understanding
- Enable copying of variable values in JSON format
- Support dumping large variable data to files when too large for CLI response
- Provide scope differentiation (local, closure, global, module, class)
- Support special runtime variables in a language-agnostic way via DAP
- **Prioritize rapid iteration using dynamic JavaScript scripts (hot-reload capable)**
- **Start with Node.js (pwa-node) as primary implementation target**

## Non-Goals

- Building a visual UI for variable display (this is an API/bridge feature)
- Implementing custom debug adapters (leverage existing DAP implementations)
- Supporting variable exploration outside of active debug sessions
- Providing memory profiling or heap analysis capabilities
- Supporting time-travel debugging or historical variable states
- Implementing language-specific formatters (rely on debug adapter formatters)
- Creating variable visualization graphs or charts
- Implementing watch expressions (deferred to maintain cross-language compatibility)

## Acceptance Criteria

1. When a debugger is paused at a breakpoint, the `debug.list-variables` script returns all variables in the requested scope (local/global/all) with their current values
2. When requesting variable details for a complex object, the system returns nested properties up to a configurable depth
3. When evaluating an expression via `debug.evaluate`, the expression executes in the current frame context and returns the result
4. When modifying a variable value through the API, the change reflects immediately in the running program when execution continues
5. When requesting variables from different stack frames, each frame shows its appropriate local scope
6. When inspecting an array or collection, the system provides indexed access to elements with pagination for large collections
7. When requesting variable information, the response includes type information, value representation, and whether it's expandable
8. When copying a variable value, the system provides it in JSON format
9. When variable data exceeds a size threshold, the system can dump it to a specified file instead of returning via CLI
10. When the debugger is not paused, appropriate error messages indicate that variable exploration requires a paused state
11. When debugging different languages (Python, JavaScript, .NET, Go, Dart), all variable operations work consistently through DAP

## Risks & Assumptions

- **Risk**: Different debug adapters may provide varying levels of variable information → Mitigation: Define minimum required fields and handle optional data gracefully
- **Risk**: Large data structures could cause performance issues → Mitigation: Implement pagination and depth limits
- **Risk**: Variable modification might destabilize the debugged program → Mitigation: Validate modifications and provide clear warnings
- **Assumption**: Debug adapters properly implement DAP's variables, scopes, and evaluate requests
- **Assumption**: Users understand the difference between variable scopes and stack frames
- **Assumption**: JSON serialization is sufficient for most variable value representations
- **Risk**: Circular references in objects could cause infinite loops → Mitigation: Track visited objects and implement cycle detection

## Testing Strategy

**Approach**: Rapid Iteration with Manual Testing
**Rationale**: Dynamic scripts allow immediate feedback without compilation. Real usage drives feature development. Hot-reload capability enables instant testing of changes.
**Mock Usage**: None - Direct DAP calls to real Node.js debugger
**Testing Method**:
- Manual testing with real debug sessions
- Test programs with known variable states
- Console logging for debugging within scripts
- Progressive refinement based on actual usage
- Immediate feedback via `vscb script run` commands
**Focus Areas**:
- DAP protocol integration (scopes, variables, evaluate requests)
- Complex object traversal with cycle detection
- Variable modification and its effect on program state
- Expression evaluation in different contexts
- Error handling for edge cases (null values, circular references, large collections)
**Development Cycle**:
- Edit JavaScript directly → Save → Test immediately
- No compilation or build step required
- Iterate based on real debugger responses
**Excluded**:
- Visual representation (this is an API feature)
- Debug adapter internals (test against DAP interface)

## Clarifications

### Session 2025-01-30

**Q1: Testing Strategy**
- Selected: Full TDD approach
- Rationale: Core debugging feature with complex DAP interactions requiring comprehensive test coverage

**Q2: Mock Usage Policy**
- Selected: Avoid mocks entirely
- Rationale: Real debug sessions with test programs provide accurate DAP behavior validation

**Q3: Object Expansion Depth**
- Selected: Per-request parameter with default
- Rationale: Clients can specify depth for each request, with a sensible default (e.g., depth=2) when not specified

**Q4: Watch Expressions**
- Decision: Deferred/excluded from scope
- Rationale: Maintaining cross-language compatibility (Python, JS, .NET, Go, Dart) is priority; watch expressions vary significantly across languages

**Q5: Value Copy Formats**
- Selected: JSON only with file dump option
- Rationale: JSON is universal; large data can be written to files when too big for CLI responses

### Session 2025-01-31

**Q6: Implementation Approach**
- Selected: Rapid iteration with dynamic scripts
- Rationale: Hot-reload capability enables immediate feedback without compilation, accelerating development

**Q7: Primary Language Target**
- Selected: Node.js (pwa-node) first
- Rationale: Superior DAP support, built into VS Code, excellent variable modification capabilities

**Q8: Architecture Pattern**
- Selected: Direct implementation first, extract interfaces later
- Rationale: Get working solution quickly, refactor to clean architecture once patterns emerge

## Open Questions

All critical questions have been resolved.