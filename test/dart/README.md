# Dart Test Validation

This directory contains Dart tests for validating the `tests.debug-single` script functionality and the DartDebugAdapter implementation.

## Setup Instructions

### 1. Install Dart SDK

The Dart SDK should be pre-installed in the devcontainer. Verify:

```bash
dart --version
```

Expected output:
```
Dart SDK version: 3.9.4 (stable) (Wed Oct  2 11:59:41 2024 +0000) on "linux_x64"
```

If not installed, install via:
- **Linux (apt)**: `sudo apt-get install dart`
- **Linux (snap)**: `sudo snap install dart --classic`
- **macOS (Homebrew)**: `brew tap dart-lang/dart && brew install dart`
- **Windows**: Download from [dart.dev/get-dart](https://dart.dev/get-dart)

### 2. Install Dart-Code Extension

In VS Code:
1. Open Extensions (Ctrl+Shift+X)
2. Search for "Dart"
3. Install "Dart" by Dart Code (officially maintained by Google)

## Dependencies

### Get Project Dependencies

From the `test/dart/` directory:

```bash
cd /workspaces/vsc-bridge-devcontainer/test/dart
dart pub get
```

This installs the `package:test` dependency and locks versions in `pubspec.lock`.

Expected output:
```
Got dependencies!
```

Verify dependencies:
```bash
grep -A2 "dev_dependencies:" pubspec.yaml
```

Should show:
```
dev_dependencies:
  test: ^1.24.0
```

## Running Tests

### Run All Tests

```bash
cd /workspaces/vsc-bridge-devcontainer/test/dart
dart test
```

Expected output:
```
00:00 +0: loading test/calculator_test.dart
00:00 +0: test/calculator_test.dart: Calculator add calculates the sum of two integers
00:00 +1: test/calculator_test.dart: Calculator add calculates the sum of two integers
00:00 +1: test/calculator_test.dart: Calculator subtract finds the difference of two integers
00:00 +2: test/calculator_test.dart: Calculator subtract finds the difference of two integers
00:00 +2: All tests passed!
```

### Run Specific Test File

```bash
cd /workspaces/vsc-bridge-devcontainer/test/dart
dart test test/calculator_test.dart
```

### Run Tests with Verbose Output

```bash
dart test --verbose
```

This shows detailed test execution information useful for debugging.

## Debugging with vscb

The `vscb` CLI tool provides the `tests.debug-single` script for debugging individual tests in VS Code.

### Basic Usage

```bash
# From the test/dart directory
cd /workspaces/vsc-bridge-devcontainer/test/dart

# Debug the first test at line 8
vscb script run tests.debug-single \
  --param path=$(pwd)/test/calculator_test.dart \
  --param line=8
```

### What Happens

1. VS Code opens the test file
2. Debug session starts
3. Debugger pauses at the specified line
4. You can inspect variables, step through code, etc.

### Debugging Workflow

1. **Set a breakpoint** (optional)
   - Open `test/calculator_test.dart`
   - Click in the gutter at line 8 (where `final sum = add(x, y);` is)
   - A red dot appears

2. **Start debugging**
   ```bash
   vscb script run tests.debug-single \
     --param path=$(pwd)/test/calculator_test.dart \
     --param line=8
   ```

3. **Inspect variables** in VS Code's Debug panel
   - Look at "Local" scope to see `x=5, y=3`
   - Watch `sum` as it's computed

4. **Step through code**
   - Use VS Code's step controls (F10 step-over, F11 step-into, Shift+F11 step-out)
   - Watch function execution in the integrated terminal

### Good Breakpoint Locations

In `test/calculator_test.dart`:

- **Line 8**: Start of test, see variables `x` and `y`
- **Line 10**: After `add()` call, inspect `sum` result
- **Line 11**: After `subtract()` call, inspect `diff` result

## Test File Structure

```
test/dart/
├── pubspec.yaml              # Project manifest
├── lib/
│   └── calculator.dart       # Simple calculator library
├── test/
│   └── calculator_test.dart  # Tests using package:test
└── README.md                 # This file
```

### calculator.dart

Simple library with two functions:

```dart
int add(int a, int b) => a + b;
int subtract(int a, int b) => a - b;
```

### calculator_test.dart

Tests organized in groups using `package:test`:

```dart
void main() {
  group('Calculator', () {
    test('add calculates the sum of two integers', () {
      expect(add(2, 2), equals(4));
    });

    test('subtract finds the difference of two integers', () {
      expect(subtract(5, 3), equals(2));
    });
  });
}
```

## Launch Configuration

The test project works with VS Code's Dart debugging via the DartDebugAdapter. The debugger is configured via `.vscode/launch.json` at the workspace root.

Key settings for Dart debugging:

```json
{
  "type": "dart",
  "name": "Dart",
  "request": "launch",
  "program": "${file}",
  "console": "integratedTerminal",
  "evaluateGettersInDebugViews": false,
  "showGettersInDebugViews": true
}
```

These settings:
- Disable automatic getter evaluation (improves performance)
- Show computed getters in the Variables panel (useful for debugging)

No additional configuration is needed for this test project.

## Troubleshooting

### Dart Command Not Found

**Problem**: `dart: command not found`

**Solution**:
- Verify Dart SDK is installed: `dart --version`
- If in devcontainer, rebuild: `devcontainer: Rebuild Container` (VS Code command palette)
- Check PATH: `echo $PATH | grep -i dart`

### `pubspec.lock` Not Generated

**Problem**: Running `dart pub get` doesn't create `pubspec.lock`

**Solution**:
- Check `pubspec.yaml` syntax: `dart pub get --verbose`
- Ensure you're in the `test/dart/` directory
- Check disk space: `df -h`
- Try clearing cache: `rm -rf .dart_tool && dart pub get`

### Tests Don't Run

**Problem**: `dart test` shows "No tests run" or file not found

**Solution**:
- Verify test file exists: `ls -la test/calculator_test.dart`
- Check file permissions: `chmod 644 test/calculator_test.dart`
- Verify test patterns: Test files must match `*_test.dart`
- Ensure `package:test` is installed: `dart pub get`

### Debug Session Won't Start

**Problem**: `vscb script run tests.debug-single` fails

**Solution**:
- Check vscb is installed: `vscb --version`
- Verify file path is absolute: Use `$(pwd)/` prefix
- Ensure line number is valid: Check file has that many lines
- Try from `test/` directory, not deeper subdirectories

### Variables Don't Show in Debugger

**Problem**: Local variables not visible in VS Code's Variables panel

**Solution**:
- Ensure Dart-Code extension is installed and up to date
- Check DartDebugAdapter is active: Look for "Dart" in debug console
- Try stepping: Sometimes variables appear after first step
- Verify `evaluateGettersInDebugViews: false` in launch config

## Next Steps

Once this test project is working:

1. **Explore the DartDebugAdapter**: See how Dart debugging is implemented in the extension
2. **Add more tests**: Create additional test cases in `calculator_test.dart`
3. **Debug integration tests**: Try debugging `/workspaces/vsc-bridge-devcontainer/test/integration-simple/dart/test/debug_test.dart`
4. **Write multi-file tests**: Organize tests across multiple files following Dart conventions

## Resources

- **Dart Documentation**: https://dart.dev/guides
- **package:test**: https://pub.dev/packages/test
- **Dart-Code Extension**: https://dartcode.org/
- **VS Code Debugging**: https://code.visualstudio.com/docs/editor/debugging
