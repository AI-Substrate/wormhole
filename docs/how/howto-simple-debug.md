# How to Debug Tests with VSC-Bridge

This guide shows how to set breakpoints and debug tests using VSC-Bridge's test debugging capabilities.

## Prerequisites

1. **VS Code Extension Running**: Ensure the VSC-Bridge extension is running in your VS Code instance
2. **Test Workspace Open**: Have a workspace with tests open in VS Code
3. **VSC-Bridge CLI Installed**: The `vscb` CLI tool should be installed and accessible

## Step-by-Step Guide

### 1. Set a Breakpoint in Your Test File

Open your test file in VS Code and click in the gutter (left margin) next to the line number where you want to pause execution. A red dot will appear indicating the breakpoint is set.

**Example**: Setting a breakpoint in a Python test
```python
def test_simple_multiplication():
    """Test basic multiplication."""
    result = 2 * 3
    assert result == 6  # ← Click in the gutter here to set breakpoint
    return result
```

### 2. Verify Breakpoints Are Set

You can list all active breakpoints using the CLI:

```bash
# Navigate to your test workspace directory
cd /path/to/your/test/workspace

# List all breakpoints
vscb script run bp.list
```

**Example Output** (JSON format is now default):
```json
{
  "data": {
    "breakpoints": [
      {
        "path": "/Users/you/project/test/python/test_example.py",
        "line": 38,
        "enabled": true
      }
    ],
    "total": 1
  }
}
```

### 3. Debug a Test at Cursor Position

To debug a specific test, use the `tests.debug-single` script:

```bash
vscb script run tests.debug-single \
  -p path=/path/to/test/file.py \
  -p line=38
```

**Parameters**:
- `path`: Absolute path to the test file
- `line`: Line number where your test is defined (or where cursor should be)
- `column` (optional): Column position, defaults to 1
- `timeoutMs` (optional): Timeout in milliseconds, defaults to 30000

### 4. Understanding the Response

When a breakpoint is hit, the command returns immediately with debugging information:

```json
{
  "ok": true,
  "type": "success",
  "data": {
    "sessionId": "f7f962f5-50d9-4ebf-a06e-6f1caab7dff8",
    "sessionName": "Python: Debug Tests",
    "framework": "pytest",
    "workspaceFolder": "/Users/you/project/test",
    "status": "paused",
    "pauseReason": "breakpoint",
    "pauseLocation": {
      "name": "test_simple_multiplication",
      "source": "/Users/you/project/test/python/test_example.py",
      "line": 38
    }
  },
  "meta": {
    "requestId": "20250928T094036356Z-6356-0074",
    "mode": "normal",
    "timestamp": "2025-09-28T09:40:38.829Z",
    "duration": 2377
  }
}
```

**Key Information**:
- `status`: "paused" indicates the debugger hit a breakpoint
- `pauseReason`: "breakpoint" shows why execution paused
- `pauseLocation`: Contains the exact location where execution stopped
  - `source`: Full path to the file
  - `line`: Line number where breakpoint was hit
  - `name`: Name of the function/method

### 5. Automated Test Script Example

You can create a shell script to automate debugging tests:

```bash
#!/bin/bash
# test-debug.sh

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TEST_FILE="/path/to/your/test_file.py"
LINE_NUMBER=38

echo -e "${YELLOW}Starting test debug session...${NC}"
echo "File: $TEST_FILE"
echo "Line: $LINE_NUMBER"
echo ""

# Run the debug command
RESULT=$(vscb script run tests.debug-single \
  -p path="$TEST_FILE" \
  -p line=$LINE_NUMBER 2>/dev/null)

# Check if breakpoint was hit
if echo "$RESULT" | grep -q '"status": "paused"'; then
    echo -e "${GREEN}✓ Breakpoint hit successfully${NC}"

    # Extract location information using jq (if available)
    if command -v jq &> /dev/null; then
        SOURCE=$(echo "$RESULT" | jq -r '.data.pauseLocation.source')
        LINE=$(echo "$RESULT" | jq -r '.data.pauseLocation.line')
        FUNCTION=$(echo "$RESULT" | jq -r '.data.pauseLocation.name')

        echo "Location: $FUNCTION at $SOURCE:$LINE"
    else
        echo "$RESULT"
    fi
else
    echo "No breakpoint hit or test failed"
    echo "$RESULT"
fi
```

## Troubleshooting

### Extension Not Connected
If you see "VSC Bridge not found" error:
1. Ensure VS Code is running with the VSC-Bridge extension
2. Check you're in the correct workspace directory
3. Verify the bridge is running: `vscb status`

### Breakpoint Not Hit
If the debugger doesn't pause at your breakpoint:
1. Verify the breakpoint is enabled (red dot, not gray)
2. Ensure the test actually executes the line with the breakpoint
3. Check that test discovery has completed: Some test frameworks need time to discover tests

### No Test Found at Cursor
If you get "No test found at cursor position":
1. Ensure the line number points to a valid test function/method
2. Try refreshing test discovery in VS Code
3. Check that the test framework is properly configured in VS Code settings

### JSON Output Configuration
If you're not seeing JSON output by default:
1. Set the output format explicitly: `vscb config set outputFormat json`
2. Or use the `--json` flag: `vscb script run tests.debug-single --json ...`

## Advanced Usage

### Setting Conditional Breakpoints
In VS Code, right-click on a breakpoint and select "Edit Breakpoint" to add conditions:
- **Expression**: `result > 10` - Only break when condition is true
- **Hit Count**: `5` - Break on the 5th time this line is hit
- **Log Message**: Print to debug console without breaking

### Debugging Specific Test Frameworks

**pytest**:
```bash
# Ensure pytest is enabled in VS Code
# Settings: python.testing.pytestEnabled = true
vscb script run tests.debug-single -p path=test_file.py -p line=10
```

**unittest**:
```bash
# Ensure unittest is enabled in VS Code
# Settings: python.testing.unittestEnabled = true
vscb script run tests.debug-single -p path=test_file.py -p line=20
```

### Programmatic Integration
The JSON output makes it easy to integrate with other tools:

```python
import json
import subprocess

def debug_test(file_path, line_number):
    """Debug a test and return breakpoint information."""

    result = subprocess.run([
        'vscb', 'script', 'run', 'tests.debug-single',
        '-p', f'path={file_path}',
        '-p', f'line={line_number}'
    ], capture_output=True, text=True)

    if result.returncode == 0:
        data = json.loads(result.stdout)
        if data.get('data', {}).get('status') == 'paused':
            location = data['data']['pauseLocation']
            return {
                'success': True,
                'file': location['source'],
                'line': location['line'],
                'function': location['name']
            }

    return {'success': False, 'error': result.stderr}

# Example usage
result = debug_test('/path/to/test.py', 42)
if result['success']:
    print(f"Paused at {result['function']} ({result['file']}:{result['line']})")
```

## Related Documentation

- [Debug Session Polling Implementation](../plans/4-bridge-context/debug-session-polling-fix.md) - Technical details of how debugging works
- [VSC-Bridge CLI Reference](../cli-reference.md) - Complete CLI command reference
- [Script Development Guide](../development/scripts.md) - How to create custom debugging scripts