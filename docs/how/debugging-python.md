# Debugging Python Tests and Scripts

This guide covers debugging Python code using VSC-Bridge, including pytest tests and standalone scripts.

## Table of Contents

- [Quick Start](#quick-start)
- [Debugging Pytest Tests](#debugging-pytest-tests)
- [Debugging Python Scripts](#debugging-python-scripts)
- [Capturing Debug Output](#capturing-debug-output)
- [Exception Handling](#exception-handling)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

1. **Python extension installed**: `ms-python.python`
2. **Pytest installed** (for test debugging):
   ```bash
   python3 -m pip install pytest
   ```
3. **Pytest configured** in `.vscode/settings.json`:
   ```json
   {
     "python.testing.pytestEnabled": true,
     "python.testing.pytestArgs": ["python"]
   }
   ```

## Debugging Pytest Tests

### Using `tests.debug-single`

The `tests.debug-single` script works seamlessly with pytest via VS Code's Testing API.

#### Example Test File

```python
# python/test_example.py
def add(a: int, b: int) -> int:
    return a + b

def test_simple_addition():
    print("🎯 Running test_simple_addition")
    result = add(2, 2)
    assert result == 4
    print(f"✓ Test passed: 2 + 2 = {result}")
```

#### Debug a Test

```bash
# Set a breakpoint
vscb script run bp.set \
  --param path=/path/to/test_example.py \
  --param line=21

# Debug the test (cursor at test function)
vscb script run tests.debug-single \
  --param path=/path/to/test_example.py \
  --param line=18
```

**What happens:**
1. VS Code positions cursor at the test
2. Calls `testing.debugAtCursor`
3. Python extension starts debugpy session
4. Session pauses at breakpoint
5. You can step through, inspect variables, etc.

#### Workflow Commands

```bash
# Check debug status
vscb script run debug.status

# Step through code
vscb script run debug.step-over
vscb script run debug.step-into
vscb script run debug.step-out

# Continue execution
vscb script run debug.continue

# Inspect variables
vscb script run debug.list-variables
vscb script run debug.evaluate --param expression="result"
```

## Debugging Python Scripts

### Using `debug.start` with Launch Configurations

For standalone Python scripts, use launch configurations.

#### Create Launch Configuration

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: Sample.py",
      "type": "debugpy",
      "request": "launch",
      "program": "${workspaceFolder}/python/sample.py",
      "console": "internalConsole",
      "justMyCode": false,
      "stopOnEntry": false
    }
  ]
}
```

**⚠️ Important**: Use `"console": "internalConsole"` to ensure DAP captures output!

#### Debug a Script

```bash
# Set breakpoint
vscb script run bp.set \
  --param path=/path/to/sample.py \
  --param line=18

# Start debug session
vscb script run debug.start \
  --param launch="Python: Sample.py"

# Continue execution
vscb script run debug.continue
```

## Capturing Debug Output

### DAP (Debug Adapter Protocol) Capture

VSC-Bridge automatically captures all DAP events during debug sessions, including:
- Console output (stdout/stderr)
- Exceptions and errors
- Test results
- Telemetry

#### View Session Summary

```bash
vscb script run dap.summary --param sessionId=<session-id>
```

**Output:**
```json
{
  "session": {
    "id": "5f1e423b-e8c1-4d16-a7bd-cf860f018714",
    "type": "debugpy",
    "duration": "71.18s"
  },
  "counts": {
    "totalOutputs": 16,
    "byCategory": {
      "stdout": 13,
      "stderr": 1,
      "console": 0,
      "telemetry": 2
    },
    "exceptions": 0,
    "breakpointHits": 1
  }
}
```

#### View Detailed Logs

```bash
# Get last 50 logs
vscb script run dap.logs \
  --param sessionId=<session-id> \
  --param count=50

# Filter by category
vscb script run dap.logs \
  --param sessionId=<session-id> \
  --param category=stdout

# Search for specific text
vscb script run dap.logs \
  --param sessionId=<session-id> \
  --param search="FAILED"
```

### Output Capture Comparison

| Scenario | Console Mode | stdout Captured | stderr Captured | Exceptions Captured |
|----------|--------------|-----------------|-----------------|-------------------|
| **Pytest tests** | `integratedTerminal` | ✅ YES | ✅ YES | ❌ NO (see below) |
| **Python scripts** | `internalConsole` | ✅ YES | ✅ YES | ✅ YES |
| **Python scripts** | `integratedTerminal` | ❌ NO | ❌ NO | ❌ NO |

**Key Finding**: Python extension uses `--capture=no` for pytest, which sends output to stdout/stderr and is captured by DAP!

## Exception Handling

### Regular Python Scripts

Uncaught exceptions in regular scripts are captured as **DAP exception events**.

#### Example

```python
# sample.py
if __name__ == '__main__':
    raise RuntimeError("Something went wrong!")
```

#### Check for Exceptions

```bash
vscb script run dap.exceptions --param sessionId=<session-id>
```

**Output:**
```json
{
  "exceptions": [
    {
      "exception": {
        "message": "RuntimeError",
        "description": "Something went wrong!"
      },
      "stoppedEvent": {
        "reason": "exception",
        "threadId": 1
      }
    }
  ]
}
```

#### Full Traceback in Logs

```bash
vscb script run dap.logs \
  --param sessionId=<session-id> \
  --param category=stderr
```

**Output:**
```
Traceback (most recent call last):
  File "/path/to/sample.py", line 19, in <module>
    raise RuntimeError("Something went wrong!")
RuntimeError: Something went wrong!
```

### Pytest Test Failures

**Important**: Pytest test failures (both assertions and exceptions) are **NOT** captured as DAP exception events because pytest catches them internally.

#### Assertion Failures

```python
def test_simple_addition():
    result = add(2, 2)
    assert result == 5  # This will fail
```

**Captured as stdout:**

```bash
vscb script run dap.logs \
  --param sessionId=<session-id> \
  --param search="FAILED"
```

**Output:**
```
_____________________________ test_simple_addition _____________________________
python/test_example.py:22: in test_simple_addition
    assert result == 5
    ^^^^^^^^^^^^^^^^^^
E   assert 4 == 5

FAILED python/test_example.py::test_simple_addition - assert 4 == 5
============================== 1 failed in 15.71s ==============================
```

#### Exception in Tests

```python
def test_simple_addition():
    result = add(2, 2)
    raise ValueError(f"Result was {result}")
```

**Also captured as stdout:**

```
python/test_example.py:22: in test_simple_addition
    raise ValueError(f"Intentional exception: result was {result}")
E   ValueError: Intentional exception: result was 4

FAILED python/test_example.py::test_simple_addition - ValueError: Intentional...
```

### Exception Capture Matrix

| Scenario | DAP Exception Event | stdout/stderr | How to Query |
|----------|---------------------|---------------|--------------|
| **Regular script exception** | ✅ YES | ✅ YES (stderr) | `dap.exceptions` + `dap.logs` |
| **Pytest assertion failure** | ❌ NO | ✅ YES (stdout) | `dap.logs --param search="FAILED"` |
| **Pytest raised exception** | ❌ NO | ✅ YES (stdout) | `dap.logs --param search="FAILED"` |

**Why the difference?**
- **Regular scripts**: Exception is uncaught → debugpy sees it → triggers exception event
- **Pytest tests**: Exception is caught by pytest framework → reported as test failure → only appears in stdout

## Troubleshooting

### Tests Not Discovered

**Error**: `E_NO_SESSION: Debug session failed to start after testing.debugAtCursor`

**Cause**: Python extension hasn't discovered tests yet.

**Solution**:
1. Open VS Code Test Explorer (Testing icon in Activity Bar)
2. Click the refresh icon to trigger test discovery
3. Wait for tests to appear in the tree
4. Retry `tests.debug-single`

**Or manually trigger discovery:**
```bash
# Check pytest is enabled
cat .vscode/settings.json | grep pytest

# Verify pytest can find tests
python3 -m pytest --collect-only
```

### No Output Captured

**Cause**: Using `"console": "integratedTerminal"` in launch config.

**Solution**: Change to `"console": "internalConsole"`:

```json
{
  "name": "Python: Sample.py",
  "type": "debugpy",
  "console": "internalConsole",  // ← Change this
  "justMyCode": false
}
```

**Why?**
- `integratedTerminal`: Output bypasses DAP protocol → not captured
- `internalConsole`: Output sent as DAP events → captured ✅

### Pytest Not Installed

**Error**: `No module named pytest`

**Solution**:
```bash
python3 -m pip install pytest --break-system-packages
```

Or use a virtual environment:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install pytest
```

### Debug Session Times Out

**Cause**: Test takes longer than default timeout (30s).

**Solution**: Increase timeout:
```bash
vscb script run tests.debug-single \
  --param path=/path/to/test.py \
  --param line=18 \
  --param timeoutMs=60000  # 60 seconds
```

## Advanced Usage

### Searching Test Failures

Find all failed assertions:

```bash
vscb script run dap.search \
  --param sessionId=<session-id> \
  --param pattern="assert.*==" \
  --param contextLines=5
```

### Comparing Debug Sessions

Compare two test runs to find regressions:

```bash
vscb script run dap.compare \
  --param sessionA=<session-1> \
  --param sessionB=<session-2> \
  --param compareBy=exceptions
```

### Saving Large Variable Data

Export large data structures during debugging:

```bash
vscb script run debug.save-variable \
  --param outputPath=/tmp/debug-data.jsonl \
  --param expression="large_dataset" \
  --param pageSize=500
```

### Timeline Analysis

View chronological event stream:

```bash
vscb script run dap.timeline \
  --param sessionId=<session-id> \
  --param granularity=milestones
```

## Best Practices

### 1. Use Internal Console for Scripts

Always use `"console": "internalConsole"` for reliable output capture:

```json
{
  "console": "internalConsole",
  "redirectOutput": true
}
```

### 2. Enable Print Debugging

Add strategic print statements in tests:

```python
def test_complex_calculation():
    print(f"🎯 Starting test with input: {data}")
    result = process(data)
    print(f"✓ Got result: {result}")
    assert result == expected
```

These will be captured in DAP logs!

### 3. Set Breakpoints Before Debugging

```bash
# Set breakpoints first
vscb script run bp.set --param path=/path/to/file.py --param line=42
vscb script run bp.set --param path=/path/to/file.py --param line=56

# Then debug
vscb script run tests.debug-single --param path=/path/to/file.py --param line=18
```

### 4. Query DAP Immediately After Session

DAP data is session-specific. Query it before starting another debug session:

```bash
# Get session ID from debug.status
SESSION_ID=$(vscb script run debug.status | jq -r '.data.sessionId')

# Query while fresh
vscb script run dap.summary --param sessionId=$SESSION_ID
vscb script run dap.logs --param sessionId=$SESSION_ID --param count=100
```

### 5. Search for Failures, Not Exceptions

For pytest, search stdout for failures:

```bash
# ✅ Good - finds test failures
vscb script run dap.search \
  --param pattern="FAILED|assert.*==" \
  --param category=stdout

# ❌ Bad - won't find pytest failures
vscb script run dap.exceptions
```

## Summary

- **Pytest tests**: Use `tests.debug-single`, failures captured in stdout
- **Python scripts**: Use `debug.start` with launch config, exceptions captured as DAP events
- **Always use** `"console": "internalConsole"` for complete output capture
- **Query DAP logs** to see test failures, print statements, and errors
- **Use `dap.exceptions`** only for regular scripts, not pytest tests

## See Also

- [JavaScript Testing Guide](JAVASCRIPT_TESTING.md)
- [DAP Scripts Documentation](../reference/dap-scripts.md)
- [Debug Scripts Documentation](../reference/debug-scripts.md)
- [Breakpoint Management](../reference/breakpoint-scripts.md)
