# Subagent S3: Spec Implications & Edge Case Analysis

**Generated**: 2025-10-19
**Focus**: Analyzing dart-flutter-support-spec.md and flutter-research.md for ambiguities, implementation implications, and edge cases

---

## Discovery S3-01: Lazy Getter Evaluation Scope Ambiguity
**Category**: Ambiguity
**Impact**: High
**Spec Reference**:
> **Q5: Getter Evaluation Default**
> Answer: B (Lazy - don't evaluate by default)
> Rationale: Safer approach avoiding side effects; matches Python debugpy; expose both `evaluateGettersInDebugViews` (eager) and `showGettersInDebugViews` (lazy) as user-configurable launch args
> **Resolved**: Default to **lazy evaluation** (`evaluateGettersInDebugViews: false`, `showGettersInDebugViews: true`); users can opt-in to eager

**Issue**: The spec states "lazy evaluation" means `showGettersInDebugViews: true`, but the research shows this setting controls whether getters **appear at all** (as lazy items), not whether they're evaluated. The actual evaluation control is `evaluateGettersInDebugViews`. There's ambiguity about what happens when *both* are false.

**Design Decision Required**: What variable tree behavior occurs for each combination of these two settings?

**Recommendation**: Define explicit behavior matrix:
- `evaluateGettersInDebugViews: false, showGettersInDebugViews: false` → Getters hidden completely
- `evaluateGettersInDebugViews: false, showGettersInDebugViews: true` → Getters shown as lazy (must expand to see value) [DEFAULT]
- `evaluateGettersInDebugViews: true, showGettersInDebugViews: false` → Invalid/ignore showGettersInDebugViews
- `evaluateGettersInDebugViews: true, showGettersInDebugViews: true` → Getters shown eagerly with values

**Example**:
```dart
class Person {
  String name;
  int _age;
  int get age => _age;  // Simple getter
  int get ageInMonths => performExpensiveCalculation();  // Side-effect getter
}

void main() {
  var person = Person('Alice', 30);
  // BREAKPOINT HERE
}
```

**Safe approach** (default: lazy):
```json
{
  "variables": [
    {
      "name": "person",
      "variablesReference": 6101,
      "children": [
        {"name": "name", "value": "\"Alice\""},
        {"name": "_age", "value": "30"},
        {"name": "age", "presentationHint": {"lazy": true}, "variablesReference": 6102},
        {"name": "ageInMonths", "presentationHint": {"lazy": true}, "variablesReference": 6103}
      ]
    }
  ]
}
```

**Unsafe approach** (eager):
```json
{
  "variables": [
    {
      "name": "person",
      "children": [
        {"name": "age", "value": "30"},
        {"name": "ageInMonths", "value": "360"}  // Side effect executed!
      ]
    }
  ]
}
```

---

## Discovery S3-02: Multi-Isolate Pause Semantics Contradiction
**Category**: Implication
**Impact**: Critical
**Spec Reference**:
> **Q6: Multi-Isolate Debugging Scope**
> Answer: A (Support all isolates - scan and select)
> Rationale: Complete functionality matching Java/C# multi-thread handling; scan all isolates to find active source; matches **the research** guidance
> **Resolved**: Implement **isolate scanning** with smart selection (prefer workspace source over SDK/external), cache last active isolate, expose all isolates as DAP threads

**Issue**: The research states "when a breakpoint is hit, **only the isolate that hit the break** is paused" (from flutter-research.md line 240), contradicting the spec's claim that we can treat isolates "similarly to thread-based languages for debugging purposes" (spec line 76). Java/C# pause **all threads** on breakpoint; Dart pauses **one isolate**.

**Design Decision Required**: How does DartDebugAdapter's `findActiveIsolate()` behave differently from `JavaAdapter.findActiveThread()`?

**Recommendation**: Implement Dart-specific isolate selection that DOES NOT assume `allThreadsStopped: true`:
1. On `stopped` event, capture `threadId` from event body (the paused isolate)
2. Use this thread ID directly (it's guaranteed to be paused)
3. Only fall back to scanning if `threadId` is missing from event
4. Do NOT expect other isolates to be paused

**Example** (critical difference from Java):

**Java** (all threads paused):
```typescript
// JavaAdapter.findActiveThread() - scan ALL threads
for (const thread of threads) {
  const stack = await getStackFrames(thread.id);
  if (hasWorkspaceSource(stack[0])) return thread.id;
}
```

**Dart** (only one isolate paused):
```typescript
// DartDebugAdapter.findActiveIsolate() - use stopped event thread
async listVariables() {
  // CRITICAL: Use threadId from stopped event, not scan
  const isolateId = this.lastStoppedIsolateId;  // From stopped event
  if (!isolateId) throw new Error('No stopped isolate');

  // This isolate is guaranteed paused; others may be running
  const stack = await getStackFrames(isolateId);
  // ...
}
```

**Edge case**: Spawned isolates hit concurrent breakpoints:
- Dart DAP sends multiple `stopped` events sequentially
- Extension must handle race: which isolate should `debug.list-variables` target?
- Recommendation: Track **most recent stopped event** timestamp; use newest

---

## Discovery S3-03: Headless Flutter Testing Implementation Gap
**Category**: Implication
**Impact**: High
**Spec Reference**:
> **Q7: Flutter Integration Test Environment**
> Answer: B (Headless only)
> Rationale: Must work like other integration tests (Python, C#, Java, TypeScript); fast, CI-friendly, automated; consistent with existing test infrastructure
> **Resolved**: Use **headless testing** for Flutter integration tests; no device/emulator required for CI; manual device testing documented separately

And:
> **Acceptance Criteria #7**: A developer can debug a Flutter application (`lib/main.dart`) and hit breakpoints in widget build methods, inspecting widget state

**Issue**: The spec says "headless testing" for integration tests but ALSO requires debugging "Flutter applications" with widget build methods. The research indicates `runTestsOnDevice` for device-hosted tests. What does "headless" mean for Flutter app debugging (not widget tests)?

**Design Decision Required**: Are we testing Flutter **apps** (requires device/simulator) or Flutter **widget tests** (headless via `flutter test`)?

**Recommendation**: Clarify acceptance criteria split:
- **Acceptance #7** should read: "A developer can debug a Flutter **widget test** and hit breakpoints in widget build methods"
- **Acceptance #8** already covers widget tests correctly
- Document that debugging live Flutter **apps** (not tests) requires device/emulator and is outside automated integration test scope
- Integration tests use `flutter test` (headless), NOT `flutter run` (requires device)

**Example** (safe headless workflow):
```typescript
// Integration test: Flutter widget test debugging (headless)
const testFile = 'test/widget_test.dart';

// Launch config for headless widget test
const launchConfig = {
  type: 'dart',
  request: 'launch',
  program: testFile,  // Points to test file
  // NO deviceId, NO flutterMode - runs headless via flutter test
};

await runner.debugSingle(testFile, breakpointLine);
// This works in CI without device/emulator
```

**Unsafe** (requires device):
```typescript
// Would fail in CI: Flutter app debugging
const launchConfig = {
  type: 'dart',
  request: 'launch',
  program: 'lib/main.dart',  // App entry point
  deviceId: 'chrome',  // Requires browser or emulator
};
```

---

## Discovery S3-04: Variable Pagination Start Index Ambiguity
**Category**: Edge Case
**Impact**: Medium
**Spec Reference**:
> **Acceptance Criteria #4**: When inspecting a `List<int> numbers = [1, 2, 3]` or `Map<String, int> ages = {'Alice': 30}`, the developer can expand the collection and see all elements

And from research (flutter-research.md lines 154-183):
> **Lists / typed_data (Uint8List, etc.)**
> **Paging**: supported via `variablesRequest` `start` and `count`. Tests fetch subsets successfully.

**Issue**: The research shows `start` and `count` parameters for pagination but doesn't specify whether `start` is 0-indexed or 1-indexed. DAP spec says `start` is the "index of the first variable to return" but Dart collections are 0-indexed while DAP frames are sometimes 1-indexed.

**Design Decision Required**: When fetching `numbers[1]` through `numbers[2]`, is `start=1, count=2` or `start=0, count=3`?

**Recommendation**: Follow DAP convention - `start` is **0-indexed** offset into the collection:
- To fetch elements `[1, 2]` from a 5-element list: `start=1, count=2`
- To fetch first 3 elements: `start=0, count=3`
- To fetch last element: `start=4, count=1`

**Example** (correct pagination):
```typescript
// Fetch middle portion of large list
const children = await adapter.getVariableChildren(
  listVarRef,
  {
    filter: 'indexed',
    start: 1000,  // Start at index 1000 (0-indexed)
    count: 100    // Fetch 100 elements
  }
);

// children[0].name === "[1000]"
// children[99].name === "[1099]"
```

**Edge case**: Map pagination uses **association indices**, not key indices:
```dart
Map<String, int> ages = {'Alice': 30, 'Bob': 25, 'Charlie': 20};
```

Associations (0-indexed):
```json
[
  {"name": "0", "value": "\"Alice\" -> 30"},
  {"name": "1", "value": "\"Bob\" -> 25"},
  {"name": "2", "value": "\"Charlie\" -> 20"}
]
```

Fetching `start=1, count=1` returns association `"1"` (Bob), NOT key at index 1.

---

## Discovery S3-05: Null Safety Sentinel Handling Edge Cases
**Category**: Edge Case
**Impact**: Medium
**Spec Reference**:
> **Acceptance Criteria #3**: When paused at a breakpoint with variables `int x = 5; String name = "test";`, the developer can see both variables and their correct types and values

And from research (flutter-research.md line 233):
> **Sentinel / uninitialized values**
> `late` uninitialized fields/locals render as **`<not initialized>`**; present both for fields and locals.

**Issue**: Dart has multiple "absent value" states that look similar but have different semantics:
- `null` (explicit null value)
- `<not initialized>` (late variable not yet assigned)
- Uninitialized nullable variables (default to `null`)
- Nullable variables explicitly set to `null`

How do we distinguish these in variable inspection?

**Design Decision Required**: Should DartDebugAdapter expose sentinel state vs null state differently? Does DDS provide type information to distinguish `int? x;` (nullable, defaults to null) from `late int x;` (non-nullable, uninitialized)?

**Recommendation**: Rely on DDS sentinel values and preserve type information:
- `null` → `{"name": "x", "value": "null", "type": "Null"}`
- `<not initialized>` → `{"name": "x", "value": "<not initialized>", "type": "int"}` (note: type is int, not Null)
- Do NOT attempt to normalize these; preserve exact DDS output

**Example** (edge cases):
```dart
void main() {
  int? nullableInt;           // Defaults to null
  int? explicitNull = null;   // Explicitly null
  late int lateInt;           // Uninitialized, will throw if accessed
  late int? lateNullable;     // Uninitialized nullable

  // BREAKPOINT HERE
}
```

Expected variables:
```json
{
  "variables": [
    {"name": "nullableInt", "value": "null", "type": "int?", "variablesReference": 0},
    {"name": "explicitNull", "value": "null", "type": "int?", "variablesReference": 0},
    {"name": "lateInt", "value": "<not initialized>", "type": "int", "variablesReference": 0},
    {"name": "lateNullable", "value": "<not initialized>", "type": "int?", "variablesReference": 0}
  ]
}
```

**Critical**: Do NOT evaluate `lateInt` - it will throw `LateInitializationError`. Trust sentinel value.

---

## Discovery S3-06: Large Collection Performance Budget Limits
**Category**: Edge Case
**Impact**: High
**Spec Reference**:
> **Risks & Assumptions**
> **Large Collection Performance**: Dart applications may have very large Lists/Maps; inspecting these could be slow or cause memory issues

And from research (flutter-research.md line 688):
> **Budgeting**: apply your existing 5MB/20k nodes guard; lists and maps can be very large (DDS tests include 10k list).

**Issue**: The spec mentions "very large Lists/Maps" but doesn't define what "large" means or how DartDebugAdapter should handle collections exceeding the 5MB/20k node budget. Should we fail hard, truncate, or paginate automatically?

**Design Decision Required**: What happens when a Dart variable tree expansion hits memory budget?

**Recommendation**: Apply same budget enforcement as Java/C# adapters with Dart-specific messaging:
1. Track cumulative nodes expanded (not just per-variable)
2. When budget exceeded, stop expansion and return budget error
3. Include helpful message suggesting pagination or file streaming
4. For very large collections (>10k items), recommend streaming instead of tree expansion

**Example** (budget enforcement):
```typescript
async listVariables(options) {
  this.memoryBudget.reset();
  const visited = new Set<number>();

  const expandVariable = async (variable, depth) => {
    // Check budget before expanding
    if (this.memoryBudget.wouldExceed(variable)) {
      return {
        ...variable,
        error: 'Memory budget exceeded',
        value: `[Collection too large: ${variable.indexedVariables} items. Use pagination or debug.save-variable]`,
        expandable: false
      };
    }

    // Track memory usage
    this.memoryBudget.track(variable);
    // ...
  };
}
```

**Edge case**: 10k+ element List:
```dart
void main() {
  List<int> hugeList = List.generate(50000, (i) => i);
  // BREAKPOINT
}
```

Without pagination:
```json
{
  "error": {
    "code": "E_BUDGET_EXCEEDED",
    "message": "Variable tree expansion exceeded 20000 node limit. Collection has 50000 items. Use pagination with start/count or debug.save-variable for large datasets."
  }
}
```

With pagination (safe):
```typescript
// Fetch first 100 items only
const children = await getVariableChildren(hugeListRef, {
  filter: 'indexed',
  start: 0,
  count: 100
});
// Returns 100 variables, under budget
```

---

## Discovery S3-07: Test Session Detection Without `purpose` Field
**Category**: Implication
**Impact**: Medium
**Spec Reference**:
> **Acceptance Criteria #2**: When a developer opens a Dart test file (`test/*_test.dart`) and runs `vscb script run tests.debug-single`, the test executes and pauses at the specified line

And from research (flutter-research.md lines 262-267):
> **Detection in your extension**: Dart Code does **not** use VS Code's `"purpose": ["debug-test"]` pattern. Instead, it relies on **templates**:
> * `templateFor: "test"` to apply to test files, or CodeLens templates `"for": ["debug-test", "debug-test-file", "run-test", …]`.
> You can reliably detect **test sessions** by (a) `program` pointing at `test` or a `_test.dart`, (b) `templateFor`/`codeLens.for` including `*-test*`, and/or (c) presence of **`dart.testNotification`** events during the session.

**Issue**: The spec says to support `tests.debug-single` workflow but doesn't specify how DartDebugAdapter detects test sessions without `purpose` field. Other language adapters (Python, Java, C#, TypeScript) use standardized test detection. How do we implement test discovery for Dart?

**Design Decision Required**: Should DartDebugAdapter implement test discovery similar to PythonTestDetector, or rely solely on file path heuristics?

**Recommendation**: Implement **hybrid detection** combining file heuristics and DAP events:

**Phase 1 - Pre-launch detection** (for test.debug-single):
```typescript
class DartTestDetector {
  async detectTests(filePath: string): Promise<TestLocation[]> {
    // Heuristic 1: File path pattern
    if (!filePath.match(/test\/.*_test\.dart$/)) {
      return [];
    }

    // Heuristic 2: Scan file for test() and testWidgets() calls
    const content = await fs.readFile(filePath, 'utf-8');
    const testMatches = content.matchAll(/\b(test|testWidgets)\s*\(\s*['"](.+?)['"]/g);

    return Array.from(testMatches).map(match => ({
      name: match[2],
      file: filePath,
      line: getLineNumber(match.index)
    }));
  }
}
```

**Phase 2 - Runtime detection** (during debug session):
```typescript
// Listen for Dart test events
onCustomEvent((event) => {
  if (event.event === 'dart.testNotification') {
    // Confirmed: this is a test session
    this.isTestSession = true;
  }
});
```

**Example** (test file):
```dart
import 'package:test/test.dart';

void main() {
  test('addition test', () {  // ← Detected by regex
    int sum = 5 + 3;
    expect(sum, equals(8));   // ← Breakpoint here
  });

  testWidgets('widget test', (tester) async {  // ← Also detected
    // ...
  });
}
```

Detection result:
```json
{
  "tests": [
    {"name": "addition test", "file": "test/example_test.dart", "line": 4},
    {"name": "widget test", "file": "test/example_test.dart", "line": 9}
  ]
}
```

**Edge case**: Test file without `test()` calls:
```dart
// test/helper_test.dart
void helperFunction() {
  // Not a test, just a helper
}
```
Should NOT be detected as test session.

---

## Discovery S3-08: Integration Test Pass Criteria Ambiguity
**Category**: Ambiguity
**Impact**: Critical
**Spec Reference**:
> **Acceptance Criteria #10**: The `just test-integration` command includes and passes Dart debugging tests using both CLI and MCP runners, validating the complete workflow

And:
> **Testing Strategy - Focus Areas**:
> - DartDebugAdapter core functionality (variable inspection, isolate management, cycle detection)
> - Integration with enhanced coverage workflow (6-stage pattern)
> - Dart-specific features: getter evaluation, collection pagination, isolate detection

**Issue**: The spec says integration tests must "pass" but doesn't define what "pass" means quantitatively. The enhanced coverage workflow (from java-workflow.ts) has 6 stages with specific variable assertions. Should DartDebugAdapter match all 6 stages, or is a subset acceptable?

**Design Decision Required**: What is the minimum viable test coverage for "passing" Dart integration tests?

**Recommendation**: Define **tiered acceptance** based on enhanced workflow stages:

**Tier 1 - Critical (Must Pass)**:
- Stage 1: Hit breakpoint, list local variables (primitives)
- Stage 3: Step over, verify variable changes
- Stage 6: Hit second breakpoint, verify all variables present

**Tier 2 - High Priority (Should Pass)**:
- Stage 2: Step into function (if Dart supports frame switching)
- Collection expansion (List, Map, Set)
- Getter lazy evaluation

**Tier 3 - Nice to Have (May Defer)**:
- Multi-isolate variable inspection
- Very large collection pagination (10k+ items)
- Circular reference detection

**Example** (minimal passing test):
```typescript
export async function dartEnhancedDebugWorkflow(runner: DebugRunner) {
  const config: EnhancedWorkflowConfig = {
    language: 'Dart',
    sessionType: 'dart',
    testFile: DART_TEST_FILE,

    // CRITICAL: These must work
    expectedVars: {
      stage1: ['x', 'y'],           // Primitives
      stage3: ['x', 'y', 'sum'],    // After step over
      stage6: ['x', 'y', 'sum', 'diff']  // All vars
    },

    // Dart-specific
    variableNameMatcher: undefined,  // Exact match (no type prefix)
    scopeExtractor: scopeExtractors.flat,  // Locals/Globals/Exceptions
    requiresStepOverAfterStepOut: false,  // No known quirk

    // Dart MAY need retry for isolate selection
    retryTestDiscovery: false,  // Start optimistic
  };

  return enhancedCoverageWorkflow(runner, config);
}
```

**Acceptance bar**:
- ✅ PASS: All Tier 1 stages pass for both CLI and MCP runners
- ✅ PASS: No crashes or hangs during test execution
- ✅ PASS: Session cleanup (no orphaned processes)
- ⚠️  DEFER: Tier 2/3 failures documented as known issues, not blockers

**Edge case**: Isolate spawn during test execution:
```dart
test('multi-isolate test', () async {
  await Isolate.spawn(workerFunction, sendPort);
  int x = 5;  // BREAKPOINT - which isolate are we inspecting?
});
```

If this fails due to isolate selection ambiguity, document as **known limitation** and defer fix to post-MVP.

---

## Summary: Critical Decisions Required Before Implementation

1. **S3-01**: Define getter evaluation behavior matrix (4 combinations of two boolean flags)
2. **S3-02**: Implement Dart-specific isolate selection (NOT scan all threads like Java)
3. **S3-03**: Clarify "headless" means widget tests only, NOT Flutter apps
4. **S3-04**: Confirm 0-indexed pagination for lists and association-indexed pagination for maps
5. **S3-05**: Preserve DDS sentinel values exactly; do NOT normalize null states
6. **S3-06**: Apply 5MB/20k budget with Dart-specific error messages recommending pagination
7. **S3-07**: Implement hybrid test detection (file path + regex + dart.testNotification events)
8. **S3-08**: Define tiered acceptance criteria; Tier 1 must pass, Tier 2/3 may defer

**Recommendation**: Address S3-02 (isolate pause semantics) and S3-03 (headless scope) FIRST in architecture phase, as they fundamentally affect adapter design.
