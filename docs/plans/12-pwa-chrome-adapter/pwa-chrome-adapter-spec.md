# Chrome Debug Adapter (pwa-chrome)

## Summary

VSC Bridge needs to support the Chrome/Chromium debugger protocol (pwa-chrome) to enable full variable inspection and evaluation capabilities when dogfooding—debugging the extension's own code in the VS Code Extension Host. Currently, while breakpoints and call stack inspection work during dogfooding, variable inspection fails because the Extension Host uses the `pwa-chrome` debug adapter type, which VSC Bridge doesn't support.

## Goals

- Enable variable inspection during dogfooding sessions (debugging extension code in Extension Host)
- Support the pwa-chrome debug adapter protocol for Chrome/Chromium debugging scenarios
- Complete the dogfooding workflow with full debugging capabilities: breakpoints, stepping, call stack, AND variable inspection
- Provide consistent adapter behavior with existing adapters (node, debugpy, coreclr, java)
- Allow LLM agents to fully inspect extension state during autonomous debugging workflows

## Non-Goals

- Supporting general browser-based JavaScript debugging (focus is Extension Host debugging)
- Replacing or modifying the existing pwa-node adapter
- Adding UI debugging capabilities for web applications
- Supporting Chrome DevTools Protocol features beyond core debugging (e.g., performance profiling, network inspection)
- Debugging web views or embedded browsers within VS Code extensions

## Acceptance Criteria

1. When debugging extension code in Extension Host, `vscb script run debug.variables` returns variable values instead of "Debug adapter 'pwa-chrome' is not currently supported" error
2. When setting a breakpoint in extension TypeScript code and triggering it, the debugger can inspect local variables, function parameters, and closure variables through the CLI
3. When evaluating expressions using `vscb script run debug.evaluate --param expression="someVar"` during an active Extension Host debug session, the expression evaluates correctly and returns the variable's value
4. The pwa-chrome adapter follows the same architectural patterns and interfaces as existing adapters (node-adapter.ts, debugpy-adapter.ts, etc.)
5. The adapter is automatically detected and selected when VS Code's debug session reports `type: "pwa-chrome"`
6. All existing debug commands (variables, scopes, evaluate, stacktrace) work correctly with pwa-chrome sessions

## Risks & Assumptions

- **Assumption**: The Chrome DevTools Protocol (CDP) messages exposed through VS Code's DAP for pwa-chrome are similar enough to pwa-node that we can reuse core adapter patterns
- **Assumption**: VS Code Extension Host debugging fully supports CDP for variable inspection via the Debug Adapter Protocol
- **Risk**: CDP may have different message formats, evaluation contexts, or scope handling compared to Node.js debugging
- **Risk**: Extension Host may have security restrictions or sandboxing that limits debugging capabilities for certain variables or scopes
- **Assumption**: We can access the same DAP session information and capabilities for pwa-chrome that we currently utilize for pwa-node
- **Risk**: TypeScript/JavaScript variable inspection may behave differently in the V8 engine context used by Extension Host

## Testing Strategy

- **Approach**: Manual Only
- **Rationale**: We'll validate by launching Extension Host and testing variable inspection works. Two validation modes: (1) test extension features from test/ directory, (2) dogfood extension debugging from project root.
- **Validation Steps**:
  1. Launch Extension Host: `vscb script run debug.start --param launch="Run Extension" --param timeoutMs=60000`
  2. Set breakpoint in extension code: `vscb script run bp.set --param path="..." --param line=N`
  3. Verify variable inspection: `vscb script run debug.list-variables`
  4. Verify expression evaluation: `vscb script run debug.evaluate --param expression="someVar"`
  5. Test from test/ directory (testing features) and project root (dogfooding)
- **Focus Areas**: Variable inspection, expression evaluation, scope handling
- **Excluded**: Automated unit/integration tests (will validate manually via CLI)

## Documentation Strategy

- **Location**: docs/how/ only
- **Target Audience**: Developers working on VSC Bridge, LLM agents
- **Updates Required**:
  - Update `docs/how/dogfood/dogfooding-vsc-bridge.md` to remove "Variable inspection limited" note
  - Add working examples showing variable inspection during dogfooding
  - Document any pwa-chrome-specific behaviors or limitations discovered
- **Maintenance**: Update when adapter capabilities change or new edge cases discovered

## Implementation Architecture

- **Approach**: Extract CDPCommon base class, both NodeDebugAdapter and ChromeDebugAdapter extend it
- **Rationale**: Do this properly with clean architecture, even though it requires refactoring node-adapter. Better long-term maintainability.
- **Structure**:
  ```
  BaseDebugAdapter (existing)
    └── CDPCommonAdapter (new - shared V8/CDP logic)
          ├── NodeDebugAdapter (refactored to extend CDPCommon)
          └── ChromeDebugAdapter (new)
  ```
- **CDPCommon responsibilities**:
  - Variable retrieval with depth control and cycle detection (Object.is() + variablesReference)
  - Expression evaluation (hover, repl, watch contexts)
  - Scope filtering and pagination
  - Memory budget tracking
  - setVariable with dual strategy (DAP setVariable → evaluate fallback)
- **Adapter-specific overrides**:
  - Scope type mapping (CDP scope types → DAP names)
  - Target/thread detection
  - Adapter-specific capabilities or restrictions
- **Migration Strategy**: Incremental validation
  1. Create CDPCommonAdapter with extracted logic
  2. Refactor NodeDebugAdapter to extend CDPCommon
  3. Validate node-adapter thoroughly (test pwa-node sessions)
  4. Only then create ChromeDebugAdapter
  5. Validate chrome-adapter (test pwa-chrome/Extension Host sessions)

## Scope Type Handling

- **Approach**: Hard-code mappings for known CDP scope types
- **Known Mappings**:
  - `local` → "Local" (writable via setVariable)
  - `closure` → "Closure" (writable via setVariable)
  - `catch` → "Catch" (writable via setVariable)
  - `block` → "Block" (read-only)
  - `with` → "With" (read-only)
  - `script` → "Script" (read-only, mark as expensive)
  - `module` → "Module" (read-only, mark as expensive)
  - `global` → "Global" (read-only, mark as expensive)
  - `eval` → "Eval" (read-only)
- **Unknown Type Handling**: Log helpful warning with scope type name and context, use scope type as-is for display, mark as read-only for safety
- **Future Improvement**: Warnings allow us to discover new scope types in real usage and add proper mappings

## Expression Evaluation

- **Support Level**: Full JavaScript expressions (matching pwa-node behavior)
- **Safety Model**: Context-based evaluation
  - `hover` context: Side-effect-free evaluation using CDP `throwOnSideEffect: true`
  - `repl`/`watch` contexts: Unrestricted JavaScript evaluation
- **Supported Expressions**:
  - Simple access: `someVar`, `obj.prop`, `arr[0]`
  - Arithmetic/comparisons: `x + y`, `a > b`
  - Function calls: `Object.is(a, b)`, `someFunc()`
  - Assignments: `x = 5` (in repl/watch contexts only)
  - Any valid JavaScript expression
- **Error Handling**: Gracefully handle "side effects not allowed" errors in hover context and fall back to previews

## Error Handling Strategy

- **Approach**: Best effort - collect errors, return partial data + error summary
- **Behavior**:
  - Variable inspection: Return successfully retrieved variables, include error summary for failed scopes/variables
  - Expression evaluation: Return result if successful, descriptive error if failed
  - setVariable: Try DAP setVariable first, fallback to evaluate, return clear error if both fail (with reason: read-only scope, security restriction, etc.)
  - Unknown scope types: Log warning, continue with read-only assumption
- **Error Context**: Include enough detail to diagnose issues (scope type, variable path, operation attempted)
- **Benefits**: User sees what works during manual testing, error summaries help improve the adapter

## Feature Scope

- **Primary Focus**: Extension Host debugging (dogfooding use case)
- **Architecture**: Design for extensibility to support general browser debugging in future
- **Current Implementation**:
  - Single-target model (Extension Host)
  - Core variable inspection and evaluation
  - Standard scope handling (Local, Closure, Block, Global, etc.)
- **Future Extensibility** (not implemented now, but designed for):
  - Multi-target support (pages, iframes, workers, service workers)
  - Browser-only features (event listener breakpoints, network view)
  - Dynamic target creation/destruction
- **Code Documentation**: Add comments in implementation noting where browser support would be added
  - Target/thread management: "// NOTE: Browser support would add multi-target handling here"
  - Capabilities: "// NOTE: Browser-only features (instrumentation breakpoints) would be added here"
  - Target discovery: "// NOTE: Extension Host uses single target; browser would listen for targetCreated/Destroyed events"

## Open Questions

- Are there any Extension Host-specific debugging limitations or security boundaries we need to work around?

## Clarifications

### Session 2025-10-08

**Q1: Testing Strategy**
- Answer: C (Manual Only)
- Rationale: We'll validate by launching Extension Host and testing variable inspection works. Two validation modes: (1) test extension features from test/ directory, (2) dogfood extension debugging from project root.

**Q2: Documentation Strategy**
- Answer: B (docs/how/ only)
- Rationale: Update existing dogfooding documentation to remove limitations note and add working examples. Audience is developers and LLM agents working on the extension.

**Q3: Implementation Architecture**
- Answer: B (Extract CDPCommon base, both extend it)
- Rationale: Do this properly with clean architecture, even though it requires refactoring node-adapter. Better long-term maintainability.

**Q4: Expression Evaluation Scope**
- Answer: C (Full JavaScript expressions)
- Rationale: Match pwa-node behavior for consistency. Use context-based safety: 'hover' = side-effect-free, 'repl'/'watch' = unrestricted.

**Q5: Backwards Compatibility**
- Answer: B (Create CDPCommon first, validate with node-adapter, then add chrome-adapter)
- Rationale: Incremental validation reduces risk. Test node-adapter thoroughly after refactoring before adding chrome-adapter.

**Q6: Scope Type Handling**
- Answer: A (Hard-code mappings for known types only)
- Rationale: Start simple with known types. Include helpful error/warning when unknown scope type encountered so we can improve vsc-bridge later based on real usage.

**Q7: Error Handling Strategy**
- Answer: B (Collect errors, return partial data + error summary)
- Rationale: Best effort approach - user sees what's working. Error summary helps us identify issues during manual testing and improve the adapter.

**Q8: Feature Scope - Extension Host vs General Browser**
- Answer: C (Build for Extension Host, design for extensibility)
- Rationale: Validate with Extension Host use case, but architecture supports browser later. Add comments in code to facilitate future extension when needed.
