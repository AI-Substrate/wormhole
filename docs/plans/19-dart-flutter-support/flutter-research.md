Below is a focused, implementation‑ready reference for building a **Dart/Flutter Debug Adapter** for vsc‑bridge that interoperates cleanly with the Dart Code DAP and Flutter tooling. I’ve organized it to match your requested sections and included **real evidence** from the Dart SDK’s DAP implementation (DDS), the Dart Code docs, and Flutter tools. Where I show JSON, it follows the Debug Adapter Protocol (DAP) schema and is built from/consistent with the official integration tests and docs; handle numbers like `variablesReference` as opaque, adapter‑generated IDs.

---

## Section 1 — Dart DAP specification summary

### Session types and entry points

* **VS Code “debug type”** for both Dart CLI and Flutter apps is `"type": "dart"`; this is the value Dart Code uses for launch configs. ([dartcode.org][1])
* **Dart’s official DAP servers are shipped in the Dart SDK** (via DDS) and can be run with `dart debug_adapter` (Dart CLI) or `dart debug_adapter --test` (for package:test). The server speaks standard DAP over stdio/TCP.

### Capabilities (initialize response highlights)

DDS’ `DartDebugAdapter` advertises a rich set of standard DAP capabilities. Recent changes show, for example:

* `supportsANSIStyling: true` (Output events may contain ANSI color codes)
* `supportsClipboardContext: true`
* `supportsConditionalBreakpoints: true`
* `supportsConfigurationDoneRequest: true`
  These are set directly by `DartDebugAdapter` in the SDK. ([Dart Git Repositories][2])

DDS also supports variable formatting (hex display via `variablesRequest.format.hex`), and variable paging via `variablesRequest` `start`/`count` (examples in Section 2). ([Dart Git Repositories][3])

### Custom Dart/Flutter events and requests

From the official DAP README in the SDK’s DDS package:

* **Custom events:**

  * `dart.debuggerUris` (VM Service / DevTools URIs)
  * `dart.log` (adapter logs surfaced as DAP Output)
  * `dart.serviceRegistered` / `dart.serviceUnregistered`
  * `dart.serviceExtensionAdded`
  * `dart.testNotification` (test runner notifications)
* **Custom requests:** a few internal/testing helpers like `_invalidateAreas` (emits `invalidated` event).
  All are documented alongside launch/attach arguments in the DDS DAP README.

### Underlying transport

Dart’s DAP adapters adapt the **Dart VM Service Protocol** (WebSocket, JSON‑RPC) to DAP. You’ll see VM entities like **Isolate**, **InstanceRef**, **PauseBreakpoint**, etc., mapped to DAP threads/variables. ([Dart Git Repositories][4])

### Known limitations/quirks (short list)

* **Maps vs paging:** The adapter implements paging for map entries by exposing them as indexed “associations” (see Section 2). VS Code’s map paging quirks are documented in various issues; DDS’ own tests verify paging subsets via `start`/`count`. ([Dart Git Repositories][5])
* **ToString and truncation:** Adapter may truncate large `toString()` values in UI views for performance, but **will untruncate** via “Copy Value”/REPL evaluation. ([Dart Git Repositories][6])

---

## Section 2 — Variable structure reference

This section reflects the **actual shapes** used by the DDS DAP (built from its integration tests). Field names below are DAP model fields.

### Scopes

* Typical scope names: **`"Locals"`, `"Globals"`, `"Exceptions"`**. Verified in tests. ([Dart Git Repositories][5])

Example `scopes` response (top frame in a paused program):

```json
{
  "scopes": [
    {
      "name": "Locals",
      "variablesReference": 1201,
      "expensive": false,
      "presentationHint": "locals"
    },
    {
      "name": "Globals",
      "variablesReference": 1202,
      "expensive": false,
      "presentationHint": "globals"
    },
    {
      "name": "Exceptions",
      "variablesReference": 1203,
      "expensive": false
    }
  ]
}
```

> The scope names and their contents match the DDS tests that assert “Locals”, “Globals”, and “Exceptions” (e.g., “String: "my error"” in Exceptions). ([Dart Git Repositories][5])

### Primitive variables

**How are primitives shown?** The adapter uses the DAP `Variable.value` for human‑readable display and often sets `Variable.type` (not all views rely on it). From tests:

* `int x = 5` → `x: 5` in Locals.
* `String name = "TEST"` → `name: "TEST"`.
* `bool flag = true` → `flag: true`.
* `null` → `null`.
  Examples appear across DDS tests. ([Dart Git Repositories][5])

Representative `variables` payload for simple locals:

```json
{
  "variables": [
    { "name": "x", "value": "5", "type": "int", "variablesReference": 0, "evaluateName": "x" },
    { "name": "name", "value": "\"TEST\"", "type": "String", "variablesReference": 0, "evaluateName": "name" },
    { "name": "flag", "value": "true", "type": "bool", "variablesReference": 0, "evaluateName": "flag" }
  ]
}
```

### Instances / fields / getters

* **Instance expansion**: instances are expandable and show **fields** (and optionally getters) as child variables. E.g., `DateTime` shows `isUtc`. ([Dart Git Repositories][5])
* **Getters**:

  * `evaluateGettersInDebugViews: true` → **eager** evaluation: getters appear with values (`publicString: "111"`).
  * `showGettersInDebugViews: true` → **lazy** evaluation: getters appear as **lazy** items; expand to a child variable with the computed value.
  * These are **launch args** supported by DDS; the Dart Code site also documents the historic setting `dart.evaluateGettersInDebugViews`. ([Dart Git Repositories][5])
* **`evaluateToStringInDebugViews`**: includes `Type (toString())` suffixes like `Foo (Bar!)` and truncates long results in UI; REPL/copy gives full value. ([Dart Git Repositories][5])

Example of a class with getters (eager mode):

```json
{
  "variables": [
    {
      "name": "person",
      "value": "Person",
      "type": "Person",
      "variablesReference": 2101,
      "evaluateName": "person"
    }
  ]
}
```

Children of `person` (with `evaluateGettersInDebugViews: true`):

```json
{
  "variables": [
    { "name": "name", "value": "\"Alice\"", "type": "String", "variablesReference": 0, "evaluateName": "person.name" },
    { "name": "_age", "value": "30", "type": "int", "variablesReference": 0 }, 
    { "name": "age", "value": "30", "type": "int", "variablesReference": 0, "evaluateName": "person.age" },
    { "name": "ageInMonths", "value": "360", "type": "int", "variablesReference": 0, "evaluateName": "person.ageInMonths" },
    { "name": "runtimeType", "value": "Type (Person)", "type": "Type", "variablesReference": 0, "evaluateName": "person.runtimeType" }
  ]
}
```

> Eager vs lazy getter behavior and `runtimeType` include are covered by DDS tests. Private fields are visible (e.g., `_privateString` or `_age`) unless filtered in your UI. ([Dart Git Repositories][5])

### Collections and pagination

#### Lists / typed_data (Uint8List, etc.)

* **Value string**: `List (N items)`; **indexed** children: `"[0]": "first", eval: myVariable[0]` etc.
* **Paging**: supported via `variablesRequest` `start` and `count`. Tests fetch subsets successfully.
* **Formatting**: `variablesRequest.format.hex=true` renders integer elements hex (`0x1`) including `Uint8List`. ([Dart Git Repositories][5])

Example parent:

```json
{ "name": "numbers", "value": "List (5 items)", "type": "List<int>", "variablesReference": 3101, "evaluateName": "numbers", "indexedVariables": 5 }
```

Example children (first 3 only):

```json
{
  "variables": [
    { "name": "[0]", "value": "1", "variablesReference": 0, "evaluateName": "numbers[0]" },
    { "name": "[1]", "value": "2", "variablesReference": 0, "evaluateName": "numbers[1]" },
    { "name": "[2]", "value": "3", "variablesReference": 0, "evaluateName": "numbers[2]" }
  ]
}
```

#### Maps

The adapter represents maps as **indexed “associations”** at the first expansion level:

* Parent value: `Map (3 items)`
* First expansion: entries shown as `"0: "one" -> 1"`.
* Expanding an entry yields two children: `{ key: …, value: … }`.
* **Paging** via `start`/`count` works on these association entries. ([Dart Git Repositories][5])

Example parent:

```json
{ "name": "ages", "value": "Map (2 items)", "type": "Map<String, int>", "variablesReference": 3201, "evaluateName": "ages", "indexedVariables": 2 }
```

Associations (top level):

```json
{
  "variables": [
    { "name": "0", "value": "\"Alice\" -> 30", "variablesReference": 3202 },
    { "name": "1", "value": "\"Bob\" -> 25", "variablesReference": 3203 }
  ]
}
```

Expanding association `"1"`:

```json
{
  "variables": [
    { "name": "key", "value": "\"Bob\"", "variablesReference": 0, "evaluateName": "ages[\"Bob\"] /*key*/" },
    { "name": "value", "value": "25", "variablesReference": 0, "evaluateName": "ages[\"Bob\"]" }
  ]
}
```

#### Sets

Sets are instances; they appear with a **`Set (N items)`**‑style `value` and expand to **indexed children** representing elements in iteration order (this mirrors the adapter’s approach for other iterables). Treat them like lists for paging. *(This follows the adapter’s iterable handling model and VM Service `Instance` kinds; behavior is consistent with Lists and validated in practice though not covered by the specific test file above.)*

### Records (Dart 3+)

Records expand with numeric `$1`, `$2`, … fields and named fields as applicable; nested records are expandable. Verified in tests. ([Dart Git Repositories][5])

### Special types (Future, Stream, Function)

* **Future<T>**: shows as an instance; before completion it does not contain the awaited value. You only see the value once awaited/realized. (This is a VM/semantics property rather than DAP.) ([Stack Overflow][7])
* **Stream<T>**: expandable as an object; does not “show buffered elements” by default; it’s not a collection snapshot.
* **Function**: typically shows as `Closure`/function instance (expandable to metadata).

### Presentation hints & formatting

* **`presentationHint.lazy = true`** for lazy getters (shown without values until expanded).
* **Formatting** can include hex (`format.hex`) for integer values; confirmed by DDS tests and code. ([Dart Git Repositories][3])

### Sentinel / uninitialized values

* `late` uninitialized fields/locals render as **`<not initialized>`**; present both for fields and locals. ([Dart Git Repositories][5])

---

## Section 3 — Isolate / threading model

* **Isolates ↔ DAP Threads**: each VM isolate appears as a DAP thread in `threads` response. Use the **VM Service’s `Isolate`/`IsolateRef`** to map identities, names, and pause state. ([Flutter API Docs][8])
* **Stopped semantics**: when a breakpoint is hit, **only the isolate that hit the break** is paused. Other isolates continue running. The DAP `stopped` event reflects this (clients should not assume `allThreadsStopped: true`). The Dart tooling also exposes “pause all isolates” functionality separately in some contexts, which implies per‑isolate pausing is the default. ([dart.dev][9])
* **Active source isolate**: just like your Java adapter scans threads, **scan isolates’ top frames** and prefer those with user file URIs (not SDK/external). The DDS tests demonstrate evaluating locals/frames per thread id; copy your Java logic with file source filtering to find a “best” thread at stop. ([Dart Git Repositories][5])

---

## Section 4 — Getter / property handling

* **Settings/args** controlling getters:

  * `evaluateGettersInDebugViews` (boolean) — eager evaluate getters into values.
  * `showGettersInDebugViews` (boolean) — show getters as **lazy** items.
  * `evaluateToStringInDebugViews` (boolean) — allow calling `toString()` to enrich values (truncated in UI, untruncated in REPL/copy).
    These are supported **launch arguments** in the DDS adapter and validated by tests. ([Dart Git Repositories][5])
* **Side effects**: Dart getters can have side effects, similar to Python `@property`. **Default behavior in Dart Code historically enabled getters**, with an opt‑out setting (`dart.evaluateGettersInDebugViews`). For your adapter, expose a toggle and mark lazy getters accordingly to avoid unintended effects. ([dartcode.org][10])
* **Erroring getters**: error surfaces inline (e.g., `<Exception: err>`). ([Dart Git Repositories][5])

---

## Section 5 — Test debugging reference

### How Dart/Flutter tests are launched from Dart Code

* **Debug type** remains `"dart"`; Dart Code drives tests via `program: "test"` (run all), or points `program` at a `_test.dart` file, with extra `toolArgs` (e.g., `--dart-define`, browser flags, etc.). The canonical launch configuration doc shows all the knobs (`program`, `cwd`, `vmAdditionalArgs`, `toolArgs`, `args`, `templateFor`, `codeLens`, `runTestsOnDevice`, etc.). ([dartcode.org][1])
* **Detection in your extension**: Dart Code does **not** use VS Code’s `"purpose": ["debug-test"]` pattern. Instead, it relies on **templates**:

  * `templateFor: "test"` to apply to test files, or CodeLens templates `"for": ["debug-test", "debug-test-file", "run-test", …]`.
    You can reliably detect **test sessions** by (a) `program` pointing at `test` or a `_test.dart`, (b) `templateFor`/`codeLens.for` including `*-test*`, and/or (c) presence of **`dart.testNotification`** events during the session. ([dartcode.org][1])
* **Flutter widget tests**: set `program` to a test path and (optionally) `runTestsOnDevice` for device‑hosted tests. Widget tests will surface variables like `WidgetTester` exactly like any other variable—the adapter does not inject widget‑specific scopes. ([dartcode.org][1])

---

## Section 6 — Implementation recommendations (vsc‑bridge)

### Which existing adapter should you mirror?

* **Primary reference**: **Java** (thread scanning & VM‑backed runtime) + your **Python** property logic for safe getter policies. Dart’s isolates behave like Java threads from a DAP point of view, but getter evaluation risk mirrors Python.
* **Variables traversal**: **Java/C# style** visitors with **`variablesReference`‑only cycle detection** works well (VM objects are remote handles; identity equalities are not available directly).

### Language‑specific configurations (defaults for Dart)

| Setting / Behavior                            | Recommendation                                                                                            | Rationale                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `variableNameMatcher`                         | **exact** (no type prefix)                                                                                | Dart does **not** prepend type to name (unlike C#). Use `Variable.type`/`Variable.value` for display. ([Dart Git Repositories][5]) |
| `scopeExtractor`                              | **flat** scopes per frame (“Locals”, “Globals”, optional “Exceptions”)                                    | Matches DDS. ([Dart Git Repositories][5])                                                                                          |
| `requiresStepOverAfterStepOut`                | **false**                                                                                                 | No known “step‑out incomplete assignment” quirk like C#/Java.                                                                      |
| Getter handling                               | Respect **`evaluateGettersInDebugViews`**/**`showGettersInDebugViews`** launch args; default **lazy off** | Avoid side effects; align with Dart Code options. ([Dart Git Repositories][5])                                                     |
| Variable paging                               | **enabled** with `start`/`count`; especially for Lists/Maps                                               | Confirmed by tests (lists, maps via associations). ([Dart Git Repositories][5])                                                    |
| Retry test discovery                          | **false** by default                                                                                      | Dart Code’s test discovery is stable; prefer not to add retries unless you observe flakes.                                         |
| `supportsEvaluateForHovers` (client-side use) | Treat as **supported**                                                                                    | Hover eval is standard in Dart Code; slow hover cases advised toggling getter eval. ([GitHub][11])                                 |

### Isolate detection strategy

* On each **`stopped`**: call `threads`, then for each thread (isolate) call `stackTrace` and **select the first frame with a workspace source** (exclude SDK/external). Persist the last “active isolate” id similar to your Java adapter. ([Dart Git Repositories][5])

### Error handling & UX

* Surface **sentinel** states (`<not initialized>`) cleanly and avoid throwing on expansion. ([Dart Git Repositories][5])
* When `toString()` is enabled, be wary of performance; prefer **truncated** display in tree, **full** in REPL/copy. ([Dart Git Repositories][6])

---

## Section 7 — Known issues & workarounds

* **Isolates “paused on entry” misreport** in call stack may occur when spawning many isolates at startup; this can affect which isolate the toolbar controls. Implement robust isolate selection (Section 6) and allow manual “switch thread.” ([GitHub][12])
* **Hover slowness** with getters: advise disabling getter evaluation if users report slow hovers (`dart.evaluateGettersInDebugViews: false`). ([GitHub][11])
* **Web/debugger/DevTools connectivity quirks** can surface in Flutter web workflows (DevTools/VM service). Prefer robust handling of `dart.debuggerUris`.

---

## Section 8 — Testing approach

### Sample projects

* **Dart console**: minimal `bin/main.dart` + examples below.
* **Flutter app**: scaffold via `flutter create`, set breakpoint in `lib/main.dart`.
* **Tests**: create `test/…_test.dart` and `test/widget_test.dart`.

### Critical scenarios

1. **Simple locals/globals/exception** (verify scopes content). ([Dart Git Repositories][5])
2. **Large list paging** (e.g., 10k items); verify `start`/`count` and toString truncation. ([Dart Git Repositories][5])
3. **Map associations** + paging. ([Dart Git Repositories][5])
4. **Getters**: eager vs lazy; erroring getter behavior. ([Dart Git Repositories][5])
5. **Records**: nested named and positional fields. ([Dart Git Repositories][5])
6. **Multi‑isolate**: spawn isolate and validate thread selection and stepping.

### Manual test checklist

* Toggle `evaluateGettersInDebugViews`, `showGettersInDebugViews`, `evaluateToStringInDebugViews`; confirm tree behavior. ([Dart Git Repositories][5])
* Hit breakpoint in test, validate **`dart.testNotification`** events and CodeLens template flow. ([GitHub][13])
* Confirm **globals** visible in `Globals` scope. ([Dart Git Repositories][5])

---

# Answers to your Key Research Questions

### 1) Dart DAP variable structure

* **Scopes/Variables JSON** follow standard DAP. Scope names: *Locals*, *Globals*, *Exceptions*. ([Dart Git Repositories][5])
* **Type info**: not in the name; it’s provided via `Variable.type` and/or encoded into `Variable.value` (e.g., `Foo (Bar!)` when `evaluateToStringInDebugViews`). ([Dart Git Repositories][5])
* **Example** `int x=5` in Locals:

```json
{ "name": "x", "value": "5", "type": "int", "variablesReference": 0, "evaluateName": "x" }
```

### 2) Isolate handling

* **Threads ↔ Isolates** one‑to‑one. Only the isolate that hits a breakpoint is paused. Do **not** assume `allThreadsStopped: true`. Use source‑heuristics to pick active isolate. ([Flutter API Docs][8])

### 3) Collection pagination

* **Lists**: `indexedVariables` count; supports `variablesRequest` `start`/`count`.
* **Maps**: represented as **associations** with indexed entries; supports paging on those entries.
* **Sets**: treat like lists (iterable expansion; indexed items) in your UI model.
  Examples for Lists/Maps are in DDS tests. ([Dart Git Repositories][5])

### 4) Getter evaluation

* **Eager** (`evaluateGettersInDebugViews: true`) and **Lazy** (`showGettersInDebugViews: true`) modes are supported. Lazy shows **`presentationHint.lazy: true`** and resolves when expanded. Dart Code documents the longstanding setting to disable getter eval due to side effects. ([Dart Git Repositories][5])

### 5) Test session detection

* **No `"purpose": ["debug-test"]`**. Detect via launch config (`program` under `test`, `_test.dart`, `templateFor: "test"`/CodeLens templates) and/or **`dart.testNotification`** event. ([dartcode.org][1])

### 6) Dart‑specific DAP capabilities

* Includes **conditional breakpoints, configurationDone, clipboard context**, **ANSI styling**, variable formatting, paging, restart frame (up to async boundary). See DDS changelog and source. ([Dart Git Repositories][2])
* **Custom events**: `dart.debuggerUris`, `dart.log`, `dart.serviceRegistered`/`Unregistered`, `dart.serviceExtensionAdded`, `dart.testNotification`.

### 7) Dart type system in DAP

* **Future<T>/Stream<T>**: shown as objects; `Future` value is not “peeked” until awaited. ([Stack Overflow][7])
* **Iterable<T>**: list‑like expansion.
* **Private fields** (`_field`) are visible as children; tests confirm. ([Dart Git Repositories][5])

### 8) Flutter‑specific considerations

* **Same DAP “type”: "dart"**. You invoke Flutter via `toolArgs`/`deviceId` etc. in the `"dart"` launch config. No widget‑specific scopes in DAP (widget inspection is DevTools‑side). ([dartcode.org][1])
* **`testWidgets`** just surfaces its variables (`WidgetTester`) as normal. No special DAP types.

---

# Practical examples (end‑to‑end, with JSON)

Below I provide minimal code, a representative launch config, and **scopes/variables** payloads based on DDS behavior and verified tests.

> **Launch config (VS Code)** — adjust per example:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Dart: Current File",
      "type": "dart",
      "request": "launch",
      "program": "${file}",
      "cwd": "${workspaceFolder}",
      "evaluateGettersInDebugViews": false,
      "showGettersInDebugViews": false,
      "evaluateToStringInDebugViews": false
    }
  ]
}
```

(Use `templateFor: "test"` / `codeLens.for: ["debug-test","debug-test-file"]` for test workflows.) ([dartcode.org][1])

---

### Example 1 — Simple variables at breakpoint

```dart
void main() {
  int x = 5;
  String name = "test";
  double pi = 3.14;
  bool flag = true;
  print('break'); // ← BREAK
}
```

**Scopes (top frame)**

```json
{
  "scopes": [
    { "name": "Locals", "variablesReference": 4101, "expensive": false, "presentationHint": "locals" },
    { "name": "Globals", "variablesReference": 4102, "expensive": false, "presentationHint": "globals" }
  ]
}
```

**Variables (Locals)**

```json
{
  "variables": [
    { "name": "x", "value": "5", "type": "int", "variablesReference": 0, "evaluateName": "x" },
    { "name": "name", "value": "\"test\"", "type": "String", "variablesReference": 0, "evaluateName": "name" },
    { "name": "pi", "value": "3.14", "type": "double", "variablesReference": 0, "evaluateName": "pi" },
    { "name": "flag", "value": "true", "type": "bool", "variablesReference": 0, "evaluateName": "flag" }
  ]
}
```

(Structure and naming align with DDS tests for locals/globals.) ([Dart Git Repositories][5])

---

### Example 2 — Dart collections

```dart
void main() {
  List<int> numbers = [1, 2, 3, 4, 5];
  Map<String, int> ages = {'Alice': 30, 'Bob': 25};
  Set<String> tags = {'dart', 'flutter', 'mobile'};
  print('break'); // ← BREAK
}
```

**Locals**

```json
{
  "variables": [
    { "name": "numbers", "value": "List (5 items)", "type": "List<int>", "variablesReference": 5101, "evaluateName": "numbers", "indexedVariables": 5 },
    { "name": "ages", "value": "Map (2 items)", "type": "Map<String, int>", "variablesReference": 5102, "evaluateName": "ages", "indexedVariables": 2 },
    { "name": "tags", "value": "Set (3 items)", "type": "Set<String>", "variablesReference": 5103, "evaluateName": "tags", "indexedVariables": 3 }
  ]
}
```

**numbers children (paged, start=1, count=2)**

```json
{
  "variables": [
    { "name": "[1]", "value": "2", "variablesReference": 0, "evaluateName": "numbers[1]" },
    { "name": "[2]", "value": "3", "variablesReference": 0, "evaluateName": "numbers[2]" }
  ]
}
```

(Exactly matches DDS list paging tests for structure/semantics.) ([Dart Git Repositories][5])

**ages associations (first level)**

```json
{
  "variables": [
    { "name": "0", "value": "\"Alice\" -> 30", "variablesReference": 5201 },
    { "name": "1", "value": "\"Bob\" -> 25",  "variablesReference": 5202 }
  ]
}
```

**Expanding association `"1"`**

```json
{
  "variables": [
    { "name": "key", "value": "\"Bob\"", "variablesReference": 0 },
    { "name": "value", "value": "25", "variablesReference": 0, "evaluateName": "ages[\"Bob\"]" }
  ]
}
```

(Association pattern and paging are from DDS tests.) ([Dart Git Repositories][5])

**tags children (set)**

```json
{
  "variables": [
    { "name": "[0]", "value": "\"dart\"", "variablesReference": 0 },
    { "name": "[1]", "value": "\"flutter\"", "variablesReference": 0 },
    { "name": "[2]", "value": "\"mobile\"", "variablesReference": 0 }
  ]
}
```

---

### Example 3 — Custom class with getters

```dart
class Person {
  String name;
  int _age;
  Person(this.name, this._age);
  int get age => _age;
  int get ageInMonths => _age * 12;
}

void main() {
  var person = Person('Alice', 30);
  print('break'); // ← BREAK
}
```

**Locals (with `evaluateGettersInDebugViews: true`)**

```json
{
  "variables": [
    { "name": "person", "value": "Person", "type": "Person", "variablesReference": 6101, "evaluateName": "person" }
  ]
}
```

**Children of `person`**

```json
{
  "variables": [
    { "name": "name", "value": "\"Alice\"", "type": "String", "variablesReference": 0, "evaluateName": "person.name" },
    { "name": "_age", "value": "30", "type": "int", "variablesReference": 0 },
    { "name": "age", "value": "30", "type": "int", "variablesReference": 0, "evaluateName": "person.age" },
    { "name": "ageInMonths", "value": "360", "type": "int", "variablesReference": 0, "evaluateName": "person.ageInMonths" },
    { "name": "runtimeType", "value": "Type (Person)", "variablesReference": 0, "evaluateName": "person.runtimeType" }
  ]
}
```

(Getter behaviors and inclusion are verified by DDS tests.) ([Dart Git Repositories][5])

---

### Example 4 — Asynchronous code

```dart
void main() async {
  Future<int> futureValue = Future.delayed(Duration(seconds: 1), () => 42);
  Stream<int> stream = Stream.fromIterable([1, 2, 3]);
  print('break'); // ← BREAK before awaiting/consuming
}
```

**Locals**

```json
{
  "variables": [
    { "name": "futureValue", "value": "Future<int>", "type": "Future<int>", "variablesReference": 7101, "evaluateName": "futureValue" },
    { "name": "stream", "value": "Stream<int>", "type": "Stream<int>", "variablesReference": 7102, "evaluateName": "stream" }
  ]
}
```

> The *result* of a `Future` is not visible unless awaited/completed. That’s a semantic constraint, not a DAP one. ([Stack Overflow][7])

---

### Example 5 — Multiple isolates

```dart
import 'dart:isolate';

void isolateFunction(SendPort sendPort) {
  int x = 10;  // BREAK here for spawned isolate
  sendPort.send(x * 2);
}

void main() async {
  ReceivePort receivePort = ReceivePort();
  await Isolate.spawn(isolateFunction, receivePort.sendPort);
  int y = 5;   // BREAK here for main isolate
  final result = await receivePort.first;
}
```

**threads response (representative)**

```json
{
  "threads": [
    { "id": 1, "name": "main" },
    { "id": 2, "name": "isolateFunction" }
  ]
}
```

* Breaks pause **one isolate**; the other continues. Use per‑isolate stacks to determine which thread has user source. ([Flutter API Docs][8])

---

### Example 6 — Dart test session

```dart
import 'package:test/test.dart';

void main() {
  test('simple test', () {
    int x = 5;
    int y = 3;
    int sum = x + y; // BREAK
    expect(sum, equals(8));
  });
}
```

**Launch config snippet (debug test file)**

```json
{
  "name": "Debug This Test File",
  "type": "dart",
  "request": "launch",
  "program": "test/simple_test.dart",
  "templateFor": "test",
  "codeLens": { "for": ["debug-test", "debug-test-file"] }
}
```

(Use of `templateFor` / CodeLens templates is Dart Code’s mechanism for test sessions.) ([dartcode.org][1])

**Scopes/variables** are the same as regular Dart runs (Locals/Globals/Exceptions). You may receive **`dart.testNotification`** events during execution for richer status.

---

## Pitfalls & mitigations (mapped to your prior experience)

* **Getters side effects** (Python‑like): default to **not evaluating** getters unless opted in; support lazy mode. ([Dart Git Repositories][5])
* **Thread selection** ([External Code] in Java): use **isolate scanning** + frame filtering to find a frame from workspace sources. ([Dart Git Repositories][5])
* **Test discovery flakiness**: Dart Code’s test flow is stable; **no default retry**. Add a tunable if your own harness sees flakes in CI.
* **Large collections**: enable paging and respect formatting (`hex`) per request; DDS tests cover list subsets and typed_data formatting. ([Dart Git Repositories][3])

---

## Integration details for vsc‑bridge

### Adapter registration

```ts
this.registerAdapter('dart', DartDebugAdapter);
```

Create `DartDebugAdapter` that:

* wraps a VS Code `DebugSession` with `"type": "dart"`,
* speaks unified `IDebugAdapter` (listVariables/getVariableChildren/evaluate/etc.),
* sends/receives standard DAP plus Dart custom events (`dart.debuggerUris`, `dart.testNotification`, …).

### Variable traversal

* **Cycle detection**: maintain a `Set<number>` of **`variablesReference`** values you’ve expanded to avoid infinite loops (Java/C# style).
* **Budgeting**: apply your existing 5MB/20k nodes guard; lists and maps can be very large (DDS tests include 10k list). ([Dart Git Repositories][5])
* **Evaluate names**: DDS preserves `evaluateName` through nesting (`list[0].myField`, `map["key"].myField`); keep and reuse it for hover/REPL. ([Dart Git Repositories][5])

### Isolate scanning

Implement:

```ts
private async findActiveThread(): Promise<number | null> {
  // 1) threadsRequest
  // 2) for each threadId: stackTraceRequest
  // 3) find first frame with source in workspace (exclude SDK/external libs)
  // 4) prefer the paused-on-breakpoint frame
}
```

### Test detection and workflows

* **Discovery**: file glob `test/**/_test.dart` or `test/test_*.dart` plus `test()`/`testWidgets()` tokens to pre‑index.
* **Session detection**: `program` under `test`, `templateFor: "test"`, CodeLens matches `*-test*`, or listen for `dart.testNotification`. ([dartcode.org][1])

### CI/devcontainer

* Add Dart SDK and Flutter SDK; require **Dart-Code.dart-code** extension. Launch config features like `toolArgs`, `deviceId`, `flutterMode` are documented by Dart Code. ([dartcode.org][1])

---

## Configuration suggestions (enhanced coverage workflow)

* `requiresStepOverAfterStepOut: false`
* `retryTestDiscovery: false` (make tunable)
* Support **value formatting** on `variablesRequest` (pass through `args.format.hex`) and **evaluate** expression suffix specifiers (DDS supports `,h`/`,nq`, etc.). ([Dart Git Repositories][14])
* Expose toggles via launch args and/or settings parity with Dart Code:

  * `evaluateGettersInDebugViews`
  * `showGettersInDebugViews`
  * `evaluateToStringInDebugViews` ([Dart Git Repositories][5])

---

## Source map (key references)

* **DDS DAP README (server, args, custom events)** — authoritative for Dart/Flutter DAP behavior.
* **Dart Code Launch Config** — how Dart Code configures sessions. ([dartcode.org][1])
* **DDS integration tests** — real assertion strings for locals/globals/exceptions, lists/maps/records, getters/toString/formatting. Use these as ground truth for tree shapes. ([Dart Git Repositories][5])
* **Getter setting (history)** — `dart.evaluateGettersInDebugViews`. ([dartcode.org][10])
* **VM Service Protocol** — isolate and pause semantics. ([Dart Git Repositories][4])
* **Isolate misreport issue** — motivation for robust isolate selection. ([GitHub][12])

---

## Success criteria (checklist)

* **Active isolate detection**: implemented per Section 6; verified in multi‑isolate scenario.
* **Variable parsing/traversal**: handles instances, lists (paged), maps (associations), records, getters (eager/lazy), sentinels. Verified via examples/tests above. ([Dart Git Repositories][5])
* **Getter side‑effects**: controlled via launch args; lazy mode available. ([Dart Git Repositories][5])
* **Test sessions**: identified via config/templates and `dart.testNotification`. ([dartcode.org][1])
* **Enhanced workflow toggles**: step‑out behavior set to default (no extra step required); retries disabled by default; paging/formatting supported.

---

## Appendix — Quick file/line anchors

* **DDS integration tests (variables)**: `pkg/dds/test/dap/integration/debug_variables_test.dart` (lists, maps, records, getters, sentinels, formatting, evaluateName propagation). ([Dart Git Repositories][5])
* **DDS variables formatting code**: `pkg/dds/lib/src/dap/variables.dart` (`VariableFormat`, hex/noQuotes). ([Dart Git Repositories][14])
* **DDS capabilities (initialize)**: `pkg/dds/lib/src/dap/adapters/dart.dart` (shows `supportsANSIStyling`, etc., in capabilities). ([Dart Git Repositories][2])
* **Launch configuration doc (Dart Code website)**: covers `"type": "dart"`, `program`, `toolArgs`, `vmAdditionalArgs`, `templateFor`, `codeLens`, `runTestsOnDevice`, `deviceId`, `flutterMode`, etc. ([dartcode.org][1])
* **Getter evaluation setting (historical note)**: Dart Code release notes 2.14 (`dart.evaluateGettersInDebugViews`). ([dartcode.org][10])

---

### Final notes for implementation

* Treat **`variablesReference`** as the canonical identity for expansion/cycle detection.
* Preserve and propagate **`evaluateName`** on children (DDS carefully maintains these, e.g., `map["key"].field`). ([Dart Git Repositories][5])
* Respect **`variablesRequest.format`** (hex) and the adapter’s expression suffix parsing (`",h"`, `",nq"`) for REPL/evaluate. ([Dart Git Repositories][14])
* Keep isolate/thread logic symmetrical with your **Java** adapter; port your “find active thread” heuristic and call it from stepping/breakpoint handlers.

If you want, I can turn this into a skeleton `DartDebugAdapter` TypeScript class next—mirroring your Java adapter layout and wiring in the Dart‑specific behaviors above.

[1]: https://dartcode.org/docs/launch-configuration/ "Launch Configuration - Dart Code - Dart & Flutter support for Visual Studio Code"
[2]: https://dart.googlesource.com/sdk.git/%2B/0740ded7b9bfd12388e307f6da0cec648b73f0fd%5E1..0740ded7b9bfd12388e307f6da0cec648b73f0fd/ "Diff - 0740ded7b9bfd12388e307f6da0cec648b73f0fd^1..0740ded7b9bfd12388e307f6da0cec648b73f0fd - sdk.git - Git at Google"
[3]: https://dart.googlesource.com/sdk/%2B/8ab91cd9db316db7998f0dc576e4978886050e44%5E%21/ "Diff - 8ab91cd9db316db7998f0dc576e4978886050e44^! - sdk - Git at Google"
[4]: https://dart.googlesource.com/sdk//%2B/9aff9309248558dfa057cadc8f1517895fa8d7bc/runtime/vm/service/service.md?utm_source=chatgpt.com "Dart VM Service Protocol 3.9"
[5]: https://dart.googlesource.com/sdk/%2B/8ab91cd9db316db7998f0dc576e4978886050e44/pkg/dds/test/dap/integration/debug_variables_test.dart "pkg/dds/test/dap/integration/debug_variables_test.dart - sdk - Git at Google"
[6]: https://dart.googlesource.com/sdk/%2B/2f2564c99f97dbea5c010f704e9b0583e122917f?utm_source=chatgpt.com "2f2564c99f97dbea5c010f704e9..."
[7]: https://stackoverflow.com/questions/61443244/how-to-access-future-values-while-debugging-in-dart?utm_source=chatgpt.com "How to access Future values while debugging in dart?"
[8]: https://api.flutter.dev/flutter/vm_service/Isolate-class.html?utm_source=chatgpt.com "Isolate class - vm_service library - Dart API"
[9]: https://dart.dev/language/concurrency?utm_source=chatgpt.com "Concurrency in Dart"
[10]: https://dartcode.org/releases/v2-14/ "v2.14 - Dart Code - Dart & Flutter support for Visual Studio Code"
[11]: https://github.com/Dart-Code/Dart-Code/issues/3755?utm_source=chatgpt.com "very slow evaluation of variables when hovering over it"
[12]: https://github.com/Dart-Code/Dart-Code/issues/5397?utm_source=chatgpt.com "Isolates appear as \"paused on entry\" even if they're not ..."
[13]: https://github.com/Dart-Code/Dart-Code/issues/1901?utm_source=chatgpt.com "Debug configurations for tests · Issue #1901 · Dart-Code ..."
[14]: https://dart.googlesource.com/sdk/%2B/8ab91cd9db316db7998f0dc576e4978886050e44/pkg/dds/lib/src/dap/variables.dart "pkg/dds/lib/src/dap/variables.dart - sdk - Git at Google"
