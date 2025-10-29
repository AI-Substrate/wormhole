# How to Debug JavaScript Tests with VSC-Bridge

This guide shows how to set breakpoints and debug JavaScript/Jest tests using VSC-Bridge's test debugging capabilities.

## Prerequisites

1. **VS Code Extension Running**: Ensure the VSC-Bridge extension is running in your VS Code instance
2. **JavaScript Test Project Open**: Have a workspace with JavaScript tests open in VS Code
3. **VSC-Bridge CLI Installed**: The `vscb` CLI tool should be installed and accessible
4. **vscode-jest Extension**: Will be prompted to install if not present (ID: `Orta.vscode-jest`)

## Step-by-Step Guide

### 1. Set a Breakpoint in Your Test File

Open your test file in VS Code and click in the gutter (left margin) next to the line number where you want to pause execution. A red dot will appear indicating the breakpoint is set.

**Example**: Setting a breakpoint in a Jest test
```javascript
describe('Calculator', () => {
    test('should multiply two numbers', () => {
        const a = 2;
        const b = 3;
        const result = a * b;
        expect(result).toBe(6);  // ← Click in the gutter here to set breakpoint
    });
});
```

### 2. Verify Breakpoints Are Set

You can list all active breakpoints using the CLI:

```bash
# Navigate to your test workspace directory
cd /path/to/your/javascript/project

# List all breakpoints
vscb script run bp.list
```

**Example Output** (JSON format is now default):
```json
{
  "data": {
    "breakpoints": [
      {
        "path": "/Users/you/project/test/javascript/calculator.test.js",
        "line": 87,
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
  -p path=/path/to/test/file.test.js \
  -p line=87
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
    "sessionName": "JavaScript Debug Tests",
    "framework": "jest",
    "workspaceFolder": "/Users/you/project",
    "status": "paused",
    "pauseReason": "breakpoint",
    "pauseLocation": {
      "name": "should multiply two numbers",
      "source": "/Users/you/project/test/javascript/calculator.test.js",
      "line": 87
    }
  },
  "meta": {
    "requestId": "20250930T094036356Z-6356-0074",
    "mode": "normal",
    "timestamp": "2025-09-30T09:40:38.829Z",
    "duration": 2377
  }
}
```

**Key Information**:
- `status`: "paused" indicates the debugger hit a breakpoint
- `pauseReason`: "breakpoint" shows why execution paused
- `framework`: "jest" confirms Jest framework detection
- `pauseLocation`: Contains the exact location where execution stopped
  - `source`: Full path to the file
  - `line`: Line number where breakpoint was hit
  - `name`: Name of the test

### 5. Automated Test Script Example

You can create a shell script to automate debugging JavaScript tests:

```bash
#!/bin/bash
# test-debug-js.sh

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TEST_FILE="/path/to/your/test.test.js"
LINE_NUMBER=87

echo -e "${YELLOW}Starting JavaScript test debug session...${NC}"
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

    # Check framework detection
    if echo "$RESULT" | grep -q '"framework": "jest"'; then
        echo -e "${GREEN}✓ Jest framework detected${NC}"
    fi

    # Extract location information using jq (if available)
    if command -v jq &> /dev/null; then
        SOURCE=$(echo "$RESULT" | jq -r '.data.pauseLocation.source')
        LINE=$(echo "$RESULT" | jq -r '.data.pauseLocation.line')
        TEST_NAME=$(echo "$RESULT" | jq -r '.data.pauseLocation.name')

        echo "Test: $TEST_NAME"
        echo "Location: $SOURCE:$LINE"
    else
        echo "$RESULT"
    fi
else
    echo "No breakpoint hit or test failed"
    echo "$RESULT"
fi
```

## Troubleshooting

### vscode-jest Extension Not Installed
If you see "Missing required extension: Orta.vscode-jest":
1. The extension will prompt you to install when you first debug a JavaScript file
2. Or manually install: `code --install-extension Orta.vscode-jest`
3. Reload VS Code if prompted

### Extension Not Connected
If you see "VSC Bridge not found" error:
1. Ensure VS Code is running with the VSC-Bridge extension
2. Check you're in the correct workspace directory
3. Verify the bridge is running: `vscb status`

### Breakpoint Not Hit
If the debugger doesn't pause at your breakpoint:
1. Verify the breakpoint is enabled (red dot, not gray)
2. Ensure the test actually executes the line with the breakpoint
3. Check that Jest test discovery has completed in VS Code
4. Try running Jest tests manually first: `npm test`

### Framework Detection Issues
If framework is detected as "none" or incorrect:
1. Ensure package.json includes Jest in devDependencies
2. Check that you're debugging a file with test extensions (.test.js, .spec.js)
3. Verify Jest configuration exists (jest.config.js or package.json jest section)

### No Test Found at Cursor
If you get "No test found at cursor position":
1. Ensure the line number points to a valid test or describe block
2. Try placing cursor on the test name line itself
3. Check that vscode-jest has discovered your tests (visible in Testing sidebar)
4. Refresh test discovery: Command Palette → "Jest: Start All Runners"

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

### Debugging Different Test Patterns

**Single test file**:
```bash
vscb script run tests.debug-single -p path=calculator.test.js -p line=10
```

**Test suite with multiple describes**:
```bash
# Place cursor on specific test within suite
vscb script run tests.debug-single -p path=suite.test.js -p line=45
```

**TypeScript tests**:
```bash
# Works with .test.ts and .spec.ts files
vscb script run tests.debug-single -p path=app.test.ts -p line=20
```

### Working with Monorepos

For monorepo projects, the framework detection walks up from the test file to find the nearest package.json:

```bash
# Test in packages/api/tests/user.test.js
# Will find packages/api/package.json for Jest detection
vscb script run tests.debug-single \
  -p path=/workspace/packages/api/tests/user.test.js \
  -p line=30
```

### Programmatic Integration
The JSON output makes it easy to integrate with other tools:

```javascript
const { execSync } = require('child_process');

function debugJestTest(filePath, lineNumber) {
    // Debug a Jest test and return breakpoint information
    try {
        const cmd = `vscb script run tests.debug-single -p path=${filePath} -p line=${lineNumber}`;
        const result = execSync(cmd, { encoding: 'utf-8' });
        const data = JSON.parse(result);

        if (data.data?.status === 'paused') {
            const location = data.data.pauseLocation;
            return {
                success: true,
                test: location.name,
                file: location.source,
                line: location.line,
                framework: data.data.framework
            };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Example usage
const result = debugJestTest('/path/to/calculator.test.js', 87);
if (result.success) {
    console.log(`Paused in test: ${result.test}`);
    console.log(`Framework: ${result.framework}`);
    console.log(`Location: ${result.file}:${result.line}`);
}
```

## Related Documentation

- [How to Debug Python Tests](./howto-simple-debug.md) - Python/pytest debugging guide
- [JavaScript Testing Setup](../JAVASCRIPT_TESTING.md) - Jest configuration and setup
- [VSC-Bridge CLI Reference](../cli-reference.md) - Complete CLI command reference
- [Script Development Guide](../development/scripts.md) - How to create custom debugging scripts