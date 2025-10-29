# Python Test Validation

This directory contains Python tests for validating the `debug-single` script functionality.

## Setup Instructions

1. **Install Python Extension**
   - Open VS Code
   - Install the `ms-python.python` extension from the marketplace

2. **Install pytest**
   ```bash
   pip install pytest
   ```

3. **Open this folder in VS Code**
   ```bash
   cd /home/jak/vsc-bridge
   code .
   ```

## Test Discovery

After opening in VS Code:
1. Open the Test Explorer (flask icon in the activity bar)
2. You should see tests appear under "Python" section
3. If not, run "Python: Discover Tests" from Command Palette (Ctrl+Shift+P)

## Manual Validation Steps

### Test individual test debugging:

1. **Set a breakpoint**
   - Open `test_example.py`
   - Click in the gutter at line 21 (inside `test_simple_addition`)
   - A red dot should appear

2. **Debug using Test Explorer**
   - In Test Explorer, find `test_simple_addition`
   - Right-click and select "Debug Test"
   - The debugger should stop at your breakpoint

3. **Verify debug output**
   - You should see "🎯 Running test_simple_addition" in the debug console
   - The test should be running in isolation (not all tests)

## Test Locations for Breakpoints

Good breakpoint locations in `test_example.py`:
- Line 20: `print("🎯 Running test_simple_addition")` - Start of test
- Line 21: `result = add(2, 2)` - Main test logic
- Line 29: `result = subtract(5, 3)` - Different test function
- Line 37: `result = 3 * 4` - Simple multiplication test

## Using debug-single Script

Once VS Code Test Explorer is working, test our script:

```bash
# From the project root
vscb script run tests.debug-single --param path="/home/jak/vsc-bridge/test/python/test_example.py" --param line=18

# This should:
# 1. Open the file
# 2. Position cursor at line 18 (test_simple_addition)
# 3. Start debugging that specific test
# 4. Hit any breakpoints you've set
```

## Troubleshooting

If tests don't appear in Test Explorer:
1. Check Python interpreter is selected (bottom status bar)
2. Run "Python: Configure Tests" and select pytest
3. Check Output panel → Python for errors
4. Ensure pytest is installed: `pip install pytest`

If debugging doesn't work:
1. Ensure Python extension is up to date
2. Check launch.json doesn't have conflicting configs
3. Try debugging a simple Python file first to verify setup