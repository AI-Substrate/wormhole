# Java Test Validation

This directory contains Java tests for validating the Java Debug Adapter functionality with VSC-Bridge.

## Prerequisites

### Required Extensions
1. **Language Support for Java (Red Hat)** - `redhat.java`
2. **Debugger for Java** - `vscjava.vscode-java-debug`
3. **Test Runner for Java** - `vscjava.vscode-java-test`

Install via VS Code marketplace or command palette.

### JDK Requirements
- **JDK 17 or higher** is required (JDK 21 recommended)
- Verify installation: `java --version`
- Configure in VS Code:
  - Open Command Palette (Cmd+Shift+P)
  - Run "Java: Configure Java Runtime"
  - Ensure JDK 17+ is selected

## Project Structure

```
test/java/
├── pom.xml                          # Maven project configuration
├── src/test/java/com/example/
│   └── DebugTest.java              # Test class with debug scenarios
└── README.md                        # This file
```

## Setup Instructions

1. **Open workspace in VS Code**
   ```bash
   cd /Users/jordanknight/github/vsc-bridge
   code .
   ```

2. **Wait for Java Language Server**
   - VS Code will automatically import the Maven project
   - Check status bar for "Java" indicator
   - Wait for "Importing projects" to complete
   - No Maven CLI required - VS Code has built-in Maven support

3. **Verify project import**
   - Open Test Explorer (flask/beaker icon in activity bar)
   - Expand "Java" section
   - You should see `DebugTest` with test method `inspectLocalsAndStatics()`

## Test Discovery

The Java Test Runner extension automatically discovers:
- JUnit 5 tests (using `@Test` annotation)
- TestNG tests (optional, configured in pom.xml)

After opening in VS Code:
1. Open Test Explorer (flask icon)
2. Tests should appear under "Java" → "java-dap-debug-test" → "com.example.DebugTest"
3. If not visible, try:
   - Refresh Test Explorer
   - Check Output panel → Java for errors
   - Ensure JDK 17+ is configured

## Manual Validation Steps

### Phase 0 Task 0.6: Verify Debug Functionality

1. **Set a breakpoint**
   - Open `src/test/java/com/example/DebugTest.java`
   - Click gutter at line 27 (`assertEquals(3, list.size());`)
   - Red dot should appear

2. **Debug using Test Explorer**
   - In Test Explorer, find `inspectLocalsAndStatics()`
   - Right-click → "Debug Test"
   - Debugger should stop at breakpoint

3. **Inspect variables**
   - Check Variables panel (Debug sidebar)
   - Verify visible variables:
     - **Locals**: `i=42`, `s="hello"`, `list` (ArrayList, size=3), `map` (HashMap, size=2)
     - **Lambda**: `r` (Runnable with captured variable)
     - **Stream**: `pipeline` (ReferencePipeline - lazy, not materialized)
     - **Object**: `p` (Person instance: name="Ada", age=37)
     - **This**: reference to DebugTest instance
   - Check for **Static** scope (if `java.debug.settings.showStaticVariables` is enabled):
     - Should see `STATIC_COUNTER=7`

4. **Test continuation**
   - Press F5 (Continue) or click Continue button
   - Test should complete successfully
   - Console output: "captured = 9"

## Debugging Test Cases

### Test: inspectLocalsAndStatics()

**Purpose**: Validates DAP variable inspection for Java-specific features

**What to test**:
- ✅ Primitive types (int, String)
- ✅ Collections (ArrayList, HashMap) with logical structure
- ✅ Static fields (STATIC_COUNTER)
- ✅ Lambda captured variables
- ✅ Stream pipelines (lazy evaluation)
- ✅ Inner class instances (Person)

**Good breakpoint locations**:
- Line 27: `assertEquals(3, list.size());` - All variables initialized
- Line 28: `r.run();` - After assertion, before lambda execution

## Troubleshooting

### Tests don't appear in Test Explorer
1. Check JDK version: Must be 17+ (`java --version`)
2. Check Java Language Server status: Look for errors in Output → Java
3. Clean and rebuild: Command Palette → "Java: Clean Java Language Server Workspace"
4. Reload window: Command Palette → "Developer: Reload Window"

### Debugging doesn't work
1. Ensure all 3 Java extensions are installed and enabled
2. Check launch.json doesn't have conflicting Java configurations
3. Try debugging a simple Java class first to verify setup
4. Check Debug Console for errors

### Maven import fails
1. VS Code uses built-in Maven - no CLI installation needed
2. Check internet connection (downloads dependencies)
3. Try: Command Palette → "Java: Update Project Configuration"

### Compilation errors
1. Verify JDK 17+ is configured
2. Check pom.xml is not corrupted
3. Ensure dependencies downloaded (check `.m2` cache)

## Next Steps (Phase 1+)

After Phase 0 validation succeeds:
- **Phase 1**: Implement JavaDebugAdapter class
- **Phase 2**: Register adapter in AdapterFactory
- **Phase 3**: Validate runtime inspection with VSC-Bridge
- **Phase 4**: Document Java-specific behaviors

## Expected Behavior

### Variable Presentation
- **Collections**: Shown with logical structure (e.g., "ArrayList (size = 3)")
- **Maps**: Entries accessible as named children
- **Streams**: Opaque objects (not expanded as lists)
- **Lambdas**: Captured variables in Local scope
- **Static fields**: Separate "Static" scope (if enabled)

### Programmatic Variable Expansion (via `debug.get-variable`)

**Important Limitation**: VS Code's Java extension only allows programmatic expansion of arrays and collections through the DAP protocol. This is a VS Code Java extension limitation, not a VSC-Bridge limitation.

**Can be expanded** ✅:
- Arrays: `int[]`, `String[]`, `Object[]`
- Collections: `ArrayList`, `HashMap`, `HashSet`, `LinkedList`, etc.
- Special: `this` reference

**Cannot be expanded** ❌ (returns `"Only Array type is supported."` error):
- Regular objects: `Person`, custom classes
- Strings: `String` object fields
- Lambdas: Functional interfaces
- Streams: `Stream`, `ReferencePipeline` objects

**Workarounds**:
- Use VS Code's Variables panel (UI expands all types)
- Use `debug.evaluate` to access fields: `debug.evaluate --expression "person.name"`
- Accept limitation for CLI automation

**Investigation Tool**: Run `just investigate-var-expansion` (from `/test` directory) to test expansion capabilities of current debug session.

**See Also**: `docs/plans/10-java-debug-adapter/java-debug-adapter-spec.md` → Known Limitations section

### Settings Influence
These VS Code settings affect variable display:
- `java.debug.settings.showStaticVariables`: Show/hide Static scope
- `java.debug.settings.showLogicalStructure`: Logical vs raw object view
- `java.debug.settings.showToString`: Include toString() in values
- `java.debug.settings.maxStringLength`: String truncation limit
