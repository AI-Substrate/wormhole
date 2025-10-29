# Dart and Flutter Debugging Support

## Summary

Enable vsc-bridge to debug Dart console applications and Flutter mobile/web applications with the same capabilities available for Python, C#, Java, and TypeScript. This allows Dart and Flutter developers to leverage vsc-bridge's CLI debugging tools, MCP integration for AI-assisted debugging, and automated debugging workflows.

**What**: Add Dart and Flutter as fully supported languages in vsc-bridge's debugging ecosystem, enabling breakpoints, variable inspection, test debugging, and stepping through Dart/Flutter code.

**Why**: Dart and Flutter represent a significant developer community (mobile, web, desktop development) that currently cannot use vsc-bridge's debugging automation and AI-assisted debugging features. Adding this support provides feature parity across major development platforms and unlocks vsc-bridge for the Dart/Flutter ecosystem.

## Goals

- **Dart Console App Debugging**: Developers can debug Dart console applications using vsc-bridge CLI commands and MCP tools
- **Dart Test Debugging**: Developers can debug individual Dart tests (using package:test) with the `tests.debug-single` workflow
- **Variable Inspection**: Developers can inspect Dart-specific types including primitives (int, double, String), collections (List, Map, Set), and custom classes
- **Flutter App Debugging**: Flutter developers can debug Flutter applications (mobile, web, desktop) through vsc-bridge
- **Flutter Widget Testing**: Developers can debug Flutter widget tests with WidgetTester integration
- **Stepping Controls**: Full debugging workflow support including step-in, step-out, step-over, continue, and breakpoint management
- **Feature Parity**: Dart/Flutter debugging capabilities match those available for Python, C#, Java, and TypeScript
- **AI-Assisted Debugging**: MCP tools enable AI assistants (like Claude) to help debug Dart/Flutter code through variable inspection and debugging commands
- **Integration Testing**: Automated tests validate Dart/Flutter debugging workflows work correctly with both CLI and MCP runners
- **Developer Experience**: Clear documentation and examples enable developers to quickly set up and use Dart/Flutter debugging

## Non-Goals

- **Custom Dart Debugger**: We are not building a new Dart debugger; we integrate with the existing Dart Code VS Code extension's DAP implementation
- **Dart 1.x and 2.x Support**: Only Dart 3.0+ is supported; legacy Dart versions are out of scope
- **Custom Test Runners**: We rely on package:test (Dart's standard test framework); alternative frameworks (testability, given_when_then) are out of scope
- **Hot Reload Implementation**: Flutter's hot reload feature is provided by the Dart Code extension; we do not reimplement this
- **DartPad Integration**: Online Dart playground debugging is out of scope
- **Dart Web Debugging**: Only VM-based debugging (Dart console, Flutter mobile/desktop); web applications are out of scope
- **Flutter DevTools Integration**: Deep integration with Flutter DevTools (widget inspector, performance profiling) is out of scope; basic DAP debugging suffices
- **Multi-Platform Build Systems**: We do not manage iOS/Android build toolchains; developers must have Flutter configured
- **Dart Package Development**: Focus is on application debugging, not library/package development workflows
- **Profile/Release Build Modes**: Only Flutter debug mode is supported; profile and release modes are out of scope
- **Device/Emulator Requirements**: Integration tests use headless mode; physical devices/emulators are not required for CI

## Acceptance Criteria

The feature is complete when all of the following scenarios are demonstrably true:

1. **Dart Console Debugging**: A developer can launch a Dart console application (`bin/main.dart`) in debug mode, hit a breakpoint, and inspect variables using `vscb script run debug.list-variables`

2. **Dart Test Discovery**: When a developer opens a Dart test file (`test/*_test.dart`) and runs `vscb script run tests.debug-single`, the test executes and pauses at the specified line

3. **Variable Inspection - Primitives**: When paused at a breakpoint with variables `int x = 5; String name = "test";`, the developer can see both variables and their correct types and values

4. **Variable Inspection - Collections**: When inspecting a `List<int> numbers = [1, 2, 3]` or `Map<String, int> ages = {'Alice': 30}`, the developer can expand the collection and see all elements

5. **Stepping Through Code**: A developer can step into a Dart function (`step-in`), step over a line (`step-over`), and step out of a function (`step-out`) without errors

6. **Dynamic Breakpoints**: While a Dart debug session is active, a developer can add a new breakpoint and continue execution until hitting the new breakpoint

7. **Flutter App Debugging**: A developer can debug a Flutter application (`lib/main.dart`) and hit breakpoints in widget build methods, inspecting widget state

8. **Flutter Widget Test Debugging**: When debugging a Flutter widget test (`test/widget_test.dart`), the developer can pause execution and inspect `WidgetTester` state and widget properties

9. **MCP Integration**: An AI assistant using MCP can call `breakpoint_set`, `debug_start`, and `debug_list_variables` tools to help debug a Dart application

10. **Integration Tests Pass**: The `just test-integration` command includes and passes Dart debugging tests using both CLI and MCP runners, validating the complete workflow

11. **Session Cleanup**: After debugging completes or is stopped, the Dart debug session terminates cleanly without leaving orphaned processes

12. **Documentation Available**: Developers can find setup instructions for Dart SDK, required VS Code extensions, and example debugging workflows in project documentation

13. **Error Handling**: When debugging fails (e.g., missing Dart SDK, extension not installed), developers receive clear error messages explaining what is missing

## Risks & Assumptions

### Assumptions
- **Dart Code Extension Stability**: We assume the Dart Code VS Code extension (`Dart-Code.dart-code`) provides a stable and feature-complete DAP implementation
- **Dart SDK Availability**: We assume developers have Dart SDK installed and accessible in their PATH, or can install it via devcontainer
- **package:test Standard**: We assume package:test is the de facto standard for Dart testing and covers the majority of use cases
- **Flutter SDK Availability**: For Flutter support, we assume developers have Flutter SDK installed with device/emulator configured
- **VM Service Protocol**: We assume Dart's VM Service protocol (underlying DAP) provides sufficient capabilities for variable inspection and debugging control
- **Isolate Similarity to Threads**: We assume Dart's isolate concurrency model can be treated similarly to thread-based languages for debugging purposes

### Risks
- **Dart DAP Unique Behaviors**: Dart's DAP implementation may have unique features, limitations, or quirks not present in other language debuggers, requiring special handling [NEEDS CLARIFICATION: What are known Dart DAP limitations we should be aware of?]
- **Flutter Environment Complexity**: Flutter debugging requires emulators/simulators or physical devices, adding setup complexity that may frustrate users
- **Hot Reload State Management**: Flutter's hot reload may interact unexpectedly with breakpoint state or variable inspection
- **Getter Side Effects**: Dart getters can execute arbitrary code (like Python @property), potentially causing issues during variable inspection if evaluated automatically
- **Large Collection Performance**: Dart applications may have very large Lists/Maps; inspecting these could be slow or cause memory issues
- **Cross-Platform Testing**: Dart/Flutter code may behave differently on different platforms (iOS, Android, web, desktop), but our testing may only cover one platform initially
- **Version Compatibility**: Dart 2.x and Dart 3.x may have different debugging behaviors; we need to test across versions [NEEDS CLARIFICATION: Which Dart versions should we officially support?]
- **Flutter Web Debugging**: Web-based Flutter debugging may use a different debug adapter (Chrome DevTools Protocol) than VM-based debugging

## Testing Strategy

**Approach**: TAD (Test-Assisted Development)

**Rationale**: Dart/Flutter debugging involves complex DAP protocol interactions, language-specific quirks (isolates, getters, collections), and integration with existing test infrastructure. TAD provides executable documentation that serves as both specification and validation, with iterative refinement as we discover Dart-specific behaviors.

**Focus Areas**:
- DartDebugAdapter core functionality (variable inspection, isolate management, cycle detection)
- Integration with enhanced coverage workflow (6-stage pattern)
- Dart-specific features: getter evaluation, collection pagination, isolate detection
- Test debugging with package:test integration
- Flutter-specific scenarios (widget tests, WidgetTester)

**Excluded**:
- Dart Code extension internals (we integrate, not replace)
- Low-level VM Service protocol details (abstracted by DAP)
- Flutter build toolchain (developers configure externally)

**Mock Usage**: Targeted mocks - Limited to external systems (VS Code DAP session) when needed; prefer real fixtures from **the research** examples

**TAD-Specific**:
- **Scratch→Promote workflow**: Develop tests in `scratch/dart-adapter/` first, promote to `test/integration/` when stable
- **Test Doc comment blocks**: Each test includes structured comments explaining DAP behavior, referencing **the research** sections
- **Promotion heuristic**: Promote tests that cover Critical (core adapter methods), Opaque (isolate selection), Regression (getter side effects), or Edge cases (large collections, circular references)

## Documentation Strategy

**Location**: Hybrid (README + docs/how/)

**Rationale**: Dart/Flutter is a major new language requiring both quick-start guidance (README) and detailed implementation documentation (docs/how/)

**Content Split**:
- **README.md**: Add Dart/Flutter to supported languages list, basic setup (Dart SDK, extension), quick example of debugging a Dart test
- **docs/how/**: Detailed guides for Dart console debugging, Flutter app debugging, widget testing, isolate management, getter configuration, troubleshooting

**Target Audience**:
- Dart/Flutter developers new to vsc-bridge (quick-start)
- Contributors implementing or extending Dart support (detailed docs)
- AI assistants using MCP tools for Dart debugging (reference examples)

**Maintenance**: Update docs when adding new Dart-specific features or discovering quirks; keep **the research** as canonical technical reference

## Clarifications

### Session 2025-10-19

**Q1: Testing Strategy**
- Answer: B (TAD - Test-Assisted Development)
- Rationale: Complex adapter with DAP protocol interaction needs executable documentation

**Q2: Dart Version Support**
- Answer: A (Dart 3.0+ only)
- Rationale: Focus on latest SDK with null safety, records, patterns; simpler testing and modern feature set
- **Resolved**: Minimum Dart SDK version is **3.0.0**; Flutter SDK 3.x includes compatible Dart 3.x

**Q3: Flutter Implementation Phasing**
- Answer: A (Together - same phase)
- Rationale: Same adapter handles both via session type `"dart"`; achieve feature parity from start; simpler architecture
- **Resolved**: DartDebugAdapter supports both Dart console apps and Flutter apps in initial implementation

**Q4: Web vs VM Debugging**
- Answer: A (VM only - Dart console, Flutter mobile/desktop)
- Rationale: Focus on VM Service protocol; simpler implementation; defer web complexity and connectivity quirks
- **Resolved**: Initial scope is **VM-based debugging** (Dart console apps, Flutter mobile/desktop); web debugging is out of scope

**Q5: Getter Evaluation Default**
- Answer: B (Lazy - don't evaluate by default)
- Rationale: Safer approach avoiding side effects; matches Python debugpy; expose both `evaluateGettersInDebugViews` (eager) and `showGettersInDebugViews` (lazy) as user-configurable launch args
- **Resolved**: Default to **lazy evaluation** (`evaluateGettersInDebugViews: false`, `showGettersInDebugViews: true`); users can opt-in to eager

**Q6: Multi-Isolate Debugging Scope**
- Answer: A (Support all isolates - scan and select)
- Rationale: Complete functionality matching Java/C# multi-thread handling; scan all isolates to find active source; matches **the research** guidance
- **Resolved**: Implement **isolate scanning** with smart selection (prefer workspace source over SDK/external), cache last active isolate, expose all isolates as DAP threads

**Q7: Flutter Integration Test Environment**
- Answer: B (Headless only)
- Rationale: Must work like other integration tests (Python, C#, Java, TypeScript); fast, CI-friendly, automated; consistent with existing test infrastructure
- **Resolved**: Use **headless testing** for Flutter integration tests; no device/emulator required for CI; manual device testing documented separately

**Q8: Scope - Advanced Features**
- Answer: A (Core only - KISS)
- Rationale: Focus on application debugging with package:test in debug mode; avoid scope creep; match existing language patterns
- **Resolved**:
  - **Package/library debugging**: Applications only (not pub package development)
  - **Flutter DevTools**: No integration; rely on basic DAP debugging only
  - **Test frameworks**: package:test only (standard framework)
  - **Flutter build modes**: Debug mode only (profile/release out of scope)

## Open Questions

1. ~~**Dart Version Support**~~: ✅ **RESOLVED** - Dart 3.0+ only

2. ~~**Flutter Phasing**~~: ✅ **RESOLVED** - Implement together in same phase

3. ~~**Web vs VM Debugging**~~: ✅ **RESOLVED** - VM only (console + mobile/desktop Flutter)

4. ~~**Getter Evaluation**~~: ✅ **RESOLVED** - Default to lazy, expose both options via launch args

5. ~~**Dart Isolates**~~: ✅ **RESOLVED** - Support all isolates with smart selection

6. ~~**Multi-Device Testing**~~: ✅ **RESOLVED** - Headless only for integration tests

7. ~~**Package/Library Debugging**~~: ✅ **RESOLVED** - Applications only (KISS)

8. ~~**Flutter DevTools**~~: ✅ **RESOLVED** - No integration (basic DAP only)

9. ~~**Test Framework Support**~~: ✅ **RESOLVED** - package:test only

10. ~~**Flutter Build Modes**~~: ✅ **RESOLVED** - Debug mode only

**All open questions resolved!**
