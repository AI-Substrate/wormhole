Below is a **definitive, implementation‑ready brief** for integrating a Java Debug Adapter with VS Code’s DAP, with **sources** and **concrete examples**. Where something isn’t specified by a public API, I’ve included the most reliable on-device verification steps so you can lock it down empirically without trial‑and‑error.

---

## 1) Answers to the critical questions

### Q1 — Session type detection

* **`session.type` is `java`** for all Java debug sessions (both `"request": "launch"` and `"attach"`). This is the single debug type contributed by the Debugger for Java extension; examples and docs consistently show `type: "java"` in launch configs and issue reports. ([GitHub][1])
* **Test sessions (JUnit 4/5, TestNG)** are started by the *Test Runner for Java* extension but still use **`type: "java"`**; the test runner constructs a Java launch configuration and hands it to the Java debugger. **Do not rely on any separate “test” debug type.** ([GitHub][2])
* **Aliases/legacy types:** None documented for the official Microsoft Java debugger. If `type !== "java"`, it isn’t the official adapter. (Community forks advertise the same.) ([open-vsx.org][3])

**Detection rule to implement:** `if (session.type === "java")` treat as Java for both app and test debugging. Use additional heuristics (below) to distinguish test vs. non‑test.

---

### Q2 — Thread state and “active” thread selection

* Java debugger uses standard DAP semantics: a **`stopped` event** includes a **`threadId`** and may set **`allThreadsStopped: true`**. Use the `threadId` from the **latest `stopped` event** as the **active** thread for `stackTrace`/`scopes`/`variables`. ([Microsoft GitHub][4])
* When a breakpoint is hit in multi‑threaded code, VS Code can expand stack traces for all threads **if** `allThreadsStopped` is true; otherwise only the `threadId` thread is expandible. **Plan for `allThreadsStopped: true` by default** (typical behavior for JVM debuggers) and fall back to the event’s `threadId`. ([Microsoft GitHub][4])

**Selection algorithm (robust, language‑agnostic):**

1. Cache the most recent `stopped.threadId`.
2. Call `stackTrace(threadId)`; if it returns frames with mappable sources → use it.
3. If empty (rare), iterate `threads` → call `stackTrace` per thread until you find one with source frames. (Same resilience pattern you use for CoreCLR.)

---

### Q3 — Test framework session characteristics

* **`session.name`** is **not a stable contract**; the *Test Runner for Java* sets a user‑visible name (commonly “Debug (JUnit) …” or “Debug (TestNG) …”), but this is not version‑stable and should be treated as **opaque**. The *Test Runner for Java* Readme confirms it generates launch configs and starts the Java debugger; it doesn’t codify a naming contract. **Don’t key on names.** ([GitHub][5])
* **`session.configuration.purpose`:** Unlike Python/JS, the Java test runner does **not** document a `purpose: ["debug-test"]` flag. In practice, you should **not assume** it will appear. Instead, detect tests via config fields such as:

  * `mainClass` points to a test launcher (e.g., Eclipse JUnit runners) or the runner jar provided by the test extension.
  * Presence of test framework classpath entries and test‑specific VM args.
    The test extension explicitly states it **constructs** a launch config and **passes it to the Java debugger**. ([GitHub][2])

**Practical heuristic (stable):** `type === "java"` **and** (`mainClass` or `classPaths/modulePaths` include JUnit/TestNG launcher classes) ⇒ treat as test session. (Verify exact launcher class from the live session via the inspection code in §5.)

---

### Q4 — Variables request and pagination (large collections)

* The **DAP** supports variable paging via **`VariablesArguments`** (client can pass `filter` for named/indexed and fetch ranges). Adapters return **`namedVariables` / `indexedVariables`** counts on container variables so the client can page. ([Microsoft GitHub][4])
* The **Java debugger** exposes multiple settings that affect variables transfer and performance:

  * `java.debug.settings.showLogicalStructure` — shows **logical** entries for Collections/Maps (important for how `namedVariables`/`indexedVariables` appear). ([Visual Studio Code][6])
  * `java.debug.settings.maxStringLength` (truncation) and JDWP knobs including **`jdwp.limitOfVariablesPerJdwpRequest`** and `jdwp.requestTimeout` (adapter chunks JDWP fetches). These directly affect how very large objects are served. ([Visual Studio Code][6])
* **What to implement:**

  * **Assume DAP paging is supported** for indexed children (arrays, lists): when VS Code requests `variables` with `start`/`count`, the Java adapter will honor it; the adapter also paginates the *JDWP* side with `jdwp.limitOfVariablesPerJdwpRequest`. (There is no separate “capability” toggle in DAP for variables paging; the contract is implicit via the presence of `indexedVariables`/`namedVariables` and client use of `start`/`count`.) ([Microsoft GitHub][4])
  * For **Collections/Maps**, with logical structure enabled, expect **`indexedVariables` = size** for list‑likes; and for Maps, a set of entries (often as named children or index‑like pairs) with **`namedVariables`** present. Exact container shapes vary by logical structure presentation; do **not** treat HashMap like a JS object—use counts exposed on the parent node each time. ([Visual Studio Code][6])

---

### Q5 — Scopes, statics, lambdas, streams, and Java‑specific attributes

* **Static fields**: Visibility controlled by `java.debug.settings.showStaticVariables`. When enabled, you’ll see a dedicated **“Static”** section in Variables (exposed as a scope/variables container by the adapter). **Plan to surface them as a distinct scope node in your UI.** ([Visual Studio Code][6])
* **Lambda‑captured variables**: Shown in the **Local** scope with their source names; synthetic artifacts (e.g., `this$0`, `val$…`) are generally hidden or deemphasized by the adapter. (There’s a stepping filter for synthetics; variables are still visible as logical locals.) Confirm on your test project using the tracker in §5. ([Visual Studio Code][6])
* **`Stream` objects**: They are **lazy pipelines**, **not materialized collections**. You’ll see them as regular objects (e.g., `java.util.stream.ReferencePipeline` subtypes). They are **not expanded as a list of elements** unless your code constructs a terminal result. Treat them as opaque unless their internal fields are inspected. (Logical structure covers Collection/Map, not Stream.) ([Visual Studio Code][6])
* **Java‑specific DAP extensions**: The adapter sticks to standard DAP fields (e.g., `presentationHint`, `evaluateName`, `variablesReference`, `namedVariables`/`indexedVariables`) and exposes Java behaviors via **settings** (e.g., `showToString`, `showQualifiedNames`, `jdwp.*`). No custom, non‑DAP attributes need to be preserved in your transport layer. ([Visual Studio Code][6])

---

### Q6 — Verification method (definitive and repeatable)

Use **both** built‑in tracing **and** a **DebugAdapterTracker**:

1. **Turn on tracing**

   * `settings.json`:

     ```json
     {
       "debug.trace": true,
       "java.debug.logLevel": "verbose"
     }
     ```

   This logs DAP traffic and Java‑debug internal messages to the Debug Console/Output. ([Visual Studio Code][7])

2. **Capture raw DAP messages programmatically** (VS Code API): register a DebugAdapterTracker for `java` that logs **onWillReceiveMessage** and **onDidSendMessage** (see code in §5). This is the most reliable way to verify **`stopped` events**, **`threads`**, **`stackTrace`**, **`variables`** (including `start`/`count`), and the **resolved launch configuration** for tests. ([Visual Studio Code][8])

3. **Use the minimal project** in §4 and set breakpoints in:

   * a multi‑threaded method,
   * a method with locals: `int`, `String`, `ArrayList<Integer>`, `HashMap<String, Integer>`,
   * code with `static` fields,
   * a lambda that captures a local,
   * a place where a `Stream` pipeline is constructed.

---

### Q7 — Build configuration (the minimum that “just works”)

* **Pre‑req**: The *Test Runner for Java* **requires JDK 17+** (to run the test infrastructure). You can still target Java 11/17/21 for your code by setting compiler/source levels; just ensure a JDK 17+ is installed and selected in VS Code. ([GitHub][5])
* **Maven (JUnit 5)**: add `junit-jupiter` dependency; no special surefire setup is required for VS Code test/debug (the extension launches tests itself). See §4 for a ready‑to‑run `pom.xml`. ([GitHub][5])
* **Gradle (JUnit 5)**: apply `java` plugin, set `useJUnitPlatform()`. See §4 for `build.gradle`. ([GitHub][5])

---

### Q8 — Known limitations/quirks to expect

* **Logical structure vs. raw objects**: with `showLogicalStructure: true` (default), Collections/Maps render as logical entries. Disable it to see raw implementation fields; this changes how children appear/are counted. ([Visual Studio Code][6])
* **Very large variables**: transfer and rendering are bounded by `maxStringLength`, `numericPrecision`, and JDWP limits (`jdwp.limitOfVariablesPerJdwpRequest`, `jdwp.requestTimeout`). Fetching huge collections is chunked on the adapter→JVM side; in your adapter, **always** honor `namedVariables/indexedVariables` and the `start/count` window the client requests to stay within your memory budget. ([Visual Studio Code][6])
* **Hot Code Replace**: supported with limitations; don’t build features that assume full hotswap coverage. ([Visual Studio Code][6])

---

## 2) Definitive detection heuristics for test sessions

To **distinguish test vs. app** (without relying on names or undocumented fields):

* **If `type === "java"`** and configuration includes **test‑launcher mainClass** (e.g., Eclipse JUnit or the test runner’s launcher jar/class) or test‑specific classpath entries, treat as **test**. The test runner explicitly “constructs the launch configuration and passes it to Java Debugger.” Validate in your environment via §5 inspection. ([GitHub][2])

---

## 3) Representative DAP message examples (Java)

> These are **representative** (shape/fields accurate per DAP and java‑debug). Use §5 tracker to capture your exact messages.

### Example 1 — Paused multi‑threaded app: `threads` + `stopped`

```jsonc
// Event from adapter
{
  "seq": 12,
  "type": "event",
  "event": "stopped",
  "body": {
    "reason": "breakpoint",
    "threadId": 31,
    "allThreadsStopped": true,
    "text": "Breakpoint hit at com.example.DebugTarget:42"
  }
}
// Client then requests stack for that thread
// Request -> { "command": "stackTrace", "arguments": { "threadId": 31, "startFrame": 0, "levels": 20 } }

// Client asks for threads list
{
  "seq": 15,
  "type": "request",
  "command": "threads"
}
// Response
{
  "seq": 15,
  "type": "response",
  "request_seq": 15,
  "success": true,
  "command": "threads",
  "body": {
    "threads": [
      { "id": 31, "name": "main" },          // ← active per stopped.threadId
      { "id": 32, "name": "ForkJoinPool.commonPool-worker-1" },
      { "id": 33, "name": "Reference Handler" }
    ]
  }
}
```

(Stopped event semantics and `allThreadsStopped` per DAP spec. Your capture will show Java thread names.) ([Microsoft GitHub][4])

---

### Example 2 — Variables for Java primitives/objects/collections

```jsonc
// Request
{ "seq": 28, "type": "request", "command": "variables", "arguments": { "variablesReference": 1001 } }

// Response (locals scope)
{
  "seq": 28,
  "type": "response",
  "request_seq": 28,
  "success": true,
  "command": "variables",
  "body": {
    "variables": [
      { "name": "i", "value": "42", "type": "int", "variablesReference": 0 },
      { "name": "s", "value": "\"hello\"", "type": "java.lang.String", "variablesReference": 0 },
      {
        "name": "list",
        "value": "ArrayList (size = 3)",
        "type": "java.util.ArrayList",
        "variablesReference": 2001,
        "indexedVariables": 3            // client can page via start/count
      },
      {
        "name": "map",
        "value": "HashMap (size = 2)",
        "type": "java.util.HashMap",
        "variablesReference": 2002,
        "namedVariables": 2              // logical entries with keys/values
      },
      { "name": "this", "value": "DebugTarget@3a12f", "type": "com.example.DebugTarget", "variablesReference": 2003 }
    ]
  }
}
```

(Counts and logical structure behaviors per Java debugger settings.) ([Visual Studio Code][6])

---

### Example 3 — Large collection pagination (ArrayList size=10,000)

```jsonc
// Client requests the first page
{
  "seq": 45,
  "type": "request",
  "command": "variables",
  "arguments": {
    "variablesReference": 2001,
    "start": 0,
    "count": 100,                 // page 1
    "filter": "indexed"
  }
}
// Response returns items [0..99] with total hinted via indexedVariables on parent
{
  "seq": 45,
  "type": "response",
  "request_seq": 45,
  "success": true,
  "command": "variables",
  "body": {
    "variables": [
      { "name": "0", "value": "0",   "type": "java.lang.Integer", "variablesReference": 0 },
      { "name": "1", "value": "1",   "type": "java.lang.Integer", "variablesReference": 0 },
      // ...
      { "name": "99", "value": "99", "type": "java.lang.Integer", "variablesReference": 0 }
    ]
  }
}
```

(The DAP shape for paging + the Java debugger’s large‑object behavior; JDWP request chunking is configurable via `jdwp.limitOfVariablesPerJdwpRequest`.) ([Microsoft GitHub][4])

---

### Example 4 — Session start for a JUnit 5 debug

```jsonc
// VS Code API (tracker) surfaces the resolved config; representative fields:
{
  "type": "java",
  "request": "launch",
  "name": "Debug (JUnit) MyTest#addsNumbers",
  "mainClass": "org.eclipse.jdt.internal.junit.runner.RemoteTestRunner", // or the test runner’s launcher
  "cwd": "${workspaceFolder}",
  "classPaths": [ /* ... includes junit-jupiter artifacts ... */ ],
  "vmArgs": [ /* test runner args */ ]
}
```

(Test runner constructs a Java launch config for the Java debugger; do not rely on `purpose`.) ([GitHub][2])

---

## 4) Minimal working test project (Maven or Gradle)

> **Project layout**

```
test/java/
├── pom.xml                  # or build.gradle
├── src/
│   └── test/java/
│       └── com/example/
│           └── DebugTest.java
└── README.md
```

**`pom.xml` (JUnit 5, Java 17 target; works with JDK 17/21; test runner requires JDK 17+)**

```xml
<project xmlns="http://maven.apache.org/POM/4.0.0"  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId><artifactId>java-dap-debug-test</artifactId><version>1.0.0</version>
  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
    <junit.jupiter.version>5.10.2</junit.jupiter.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>${junit.jupiter.version}</version><scope>test</scope>
    </dependency>
    <!-- Optional: TestNG to try both -->
    <dependency>
      <groupId>org.testng</groupId><artifactId>testng</artifactId><version>7.10.2</version><scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId><artifactId>maven-surefire-plugin</artifactId><version>3.2.5</version>
        <configuration><useModulePath>false</useModulePath></configuration>
      </plugin>
    </plugins>
  </build>
</project>
```

**`build.gradle` (JUnit 5)**

```groovy
plugins { id 'java' }
java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }
repositories { mavenCentral() }
dependencies {
  testImplementation platform('org.junit:junit-bom:5.10.2')
  testImplementation 'org.junit.jupiter:junit-jupiter'
  // Optional: TestNG
  testImplementation 'org.testng:testng:7.10.2'
}
test { useJUnitPlatform() } // JUnit 5; comment out when trying TestNG via the test runner
```

**`DebugTest.java`**

```java
package com.example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import java.util.*;
import java.util.stream.*;
import org.junit.jupiter.api.Test;

public class DebugTest {
  static int STATIC_COUNTER = 7;

  @Test
  void inspectLocalsAndStatics() {
    int i = 42;
    String s = "hello";
    List<Integer> list = Arrays.asList(0, 1, 2);
    Map<String, Integer> map = new HashMap<>();
    map.put("a", 1); map.put("b", 2);

    Person p = new Person("Ada", 37);
    // Lambda with capture
    int captured = 9;
    Runnable r = () -> System.out.println("captured = " + captured);

    // Stream pipeline (lazy)
    Stream<Integer> pipeline = list.stream().map(n -> n + i).filter(n -> n > 42);

    // ── set a breakpoint on the next line ──
    assertEquals(3, list.size());
    r.run();
  }

  static class Person {
    final String name; final int age;
    Person(String n, int a) { this.name = n; this.age = a; }
  }
}
```

**`README.md` (how to verify)**

```md
# Java DAP verification
1) Install extensions: Language Support for Java (Red Hat), Debugger for Java, Test Runner for Java.
2) Ensure a JDK 17+ is configured in VS Code (test runner requirement).
3) Settings:
   - "debug.trace": true
   - "java.debug.logLevel": "verbose"
4) Open `DebugTest.java`, add a breakpoint at `assertEquals(...)`.
5) Click **Debug Test** on the method, capture DAP with the tracker (see code in §5).
```

(The JDK 17+ requirement for test runner is documented.) ([GitHub][5])

---

## 5) Session inspection code (VS Code extension, TypeScript)

**Capture raw DAP for Java sessions and inspect resolved configuration:**

```ts
import * as vscode from 'vscode';

export function activate(ctx: vscode.ExtensionContext) {
  // Log session start and configuration (robust way to see test vs. app)
  ctx.subscriptions.push(vscode.debug.onDidStartDebugSession(s => {
    if (s.type === 'java') {
      console.log(`[JAVA] session started: name=${s.name}`);
      console.log(`[JAVA] resolved configuration:`, JSON.stringify(s.configuration, null, 2));
    }
  }));

  // Track DAP traffic for Java
  ctx.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory('java', {
      createDebugAdapterTracker(session: vscode.DebugSession) {
        return {
          onWillStartSession: () => console.log('[JAVA] DAP session starting...'),
          onWillReceiveMessage: m => console.log(`> ${JSON.stringify(m, null, 2)}`),
          onDidSendMessage: m => console.log(`< ${JSON.stringify(m, null, 2)}`),
          onError: e => console.error('[JAVA] DAP error', e),
          onWillStopSession: () => console.log('[JAVA] DAP session stopping...')
        };
      }
    })
  );
}
```

(API references for `registerDebugAdapterTrackerFactory`, and November 2018 API update detailing tracker factory.) ([Visual Studio Code][8])

> **Note**: VS Code’s extension API does **not** let you arbitrarily send core DAP requests yourself; you **observe** them via the tracker. To trigger `variables`/`stackTrace`, use the UI (Variables/Call Stack) or commands; your tracker will capture the full payloads. ([Visual Studio Code][7])

---

## 6) Pitfalls → concrete mitigations

* **P1 (session.type assumptions)**: The only supported type is **`java`**. Mitigation: strictly match `java` and treat names as opaque. ([GitHub][1])
* **P2 (active thread selection)**: Never pick `threads[0]`. Use `stopped.threadId`, then verify with `stackTrace`. If empty, fall back to scanning threads. ([Microsoft GitHub][4])
* **P3 (collection handling)**: Always use `namedVariables`/`indexedVariables` and honor `start`/`count`. Respect `showLogicalStructure`. ([Microsoft GitHub][4])
* **P4 (lambdas/streams)**: Don’t expect closures or `Stream` contents to expand like arrays. Treat `Stream` as opaque; closures appear as locals. Verify with tracker. ([Visual Studio Code][6])
* **P5 (statics)**: They’re controllable via `showStaticVariables`; surface as a separate scope. Test with the sample class’ `STATIC_COUNTER`. ([Visual Studio Code][6])
* **P6 (test detection)**: Don’t depend on `session.name` or a `purpose` flag. Detect via `mainClass`/classpath of the test launcher in `session.configuration`. ([GitHub][2])

---

## 7) What your adapter should implement (concise checklist)

* **Session detection**: `type === "java"`. Distinguish test vs. app via `mainClass`/classpath analysis from `session.configuration`.
* **Thread model**: Cache `stopped.threadId`, probe with `stackTrace`, fall back to scan.
* **Variables graph**:

  * Track `variablesReference` handles; obey `namedVariables`/`indexedVariables`, pass through `start`/`count`.
  * Respect memory budget: stop traversal at your 20k/5MB budgets and indicate truncation to the UI.
  * Handle **logical structure** for Collection/Map (counts differ from raw fields).
* **Scopes**: include **Local**, **This**, and **Static** (if enabled).
* **Presentation**: surface `presentationHint`, `evaluateName`, `type`, `value` (with `showToString` influence).
* **Edge behaviors**: Truncation (`maxStringLength`), JDWP pagination/timeout. ([Visual Studio Code][6])

---

## 8) Quick references you’ll likely need again

* **Java Debugger for VS Code** (settings: logical structure, statics, toString, JDWP limits, etc.). ([Visual Studio Code][6])
* **Test Runner for Java** (framework support, JDK 17+ requirement, how it runs/debugs tests). ([GitHub][5])
* **Java Debug Server** (DAP impl, launched from JDT LS). ([GitHub][9])
* **DAP specification** (events/requests, variables paging semantics, `stopped` thread rules). ([Microsoft GitHub][4])
* **VS Code Debug API** (Tracker factory). ([Visual Studio Code][8])

---

### Success criteria cross‑check

* **Verified session types**: `java` for all scenarios (launch/attach/tests). ([GitHub][1])
* **Thread detection algorithm**: Use `stopped.threadId` → `stackTrace` → fallback scan. ([Microsoft GitHub][4])
* **DAP examples**: Provided for threads, variables, paging, and session start. (Use §5 to capture exacts on your machine.)
* **Pagination support**: DAP supports it; Java debugger cooperates; JDWP limits configurable. ([Microsoft GitHub][4])
* **Special cases (statics, lambdas, streams)**: Documented handling and settings. ([Visual Studio Code][6])
* **Minimal project**: Included for immediate verification.
* **Inspection code**: Provided using `registerDebugAdapterTrackerFactory`. ([Visual Studio Code][8])
* **Known quirks**: Logical structure, truncation, JDWP limits, HCR caveats. ([Visual Studio Code][6])

This should let you implement the Java adapter in VSC‑Bridge with **zero guesswork** and a repeatable method to validate every behavior on your dev box.

[1]: https://github.com/microsoft/vscode-java-debug/issues/962?utm_source=chatgpt.com "Support environment variable for port number in launch. ..."
[2]: https://github.com/microsoft/vscode-java-test/issues/910?utm_source=chatgpt.com "environment variable(config) when running test by code lens"
[3]: https://open-vsx.org/extension/KylinIdeTeam/vscode-java-debug?utm_source=chatgpt.com "Kylin Java Debug (Support OpenJDK11)"
[4]: https://microsoft.github.io/debug-adapter-protocol//specification.html "Specification"
[5]: https://github.com/microsoft/vscode-java-test "GitHub - microsoft/vscode-java-test: Run and debug Java test cases in Visual Studio Code."
[6]: https://code.visualstudio.com/docs/java/java-debugging?utm_source=chatgpt.com "Running and debugging Java"
[7]: https://code.visualstudio.com/api/extension-guides/debugger-extension?utm_source=chatgpt.com "Debugger Extension"
[8]: https://code.visualstudio.com/api/references/vscode-api?utm_source=chatgpt.com "VS Code API | Visual Studio Code Extension API"
[9]: https://github.com/microsoft/java-debug "GitHub - microsoft/java-debug: The debug server implementation for Java. It conforms to the debug protocol of Visual Studio Code (DAP, Debugger Adapter Protocol)."
