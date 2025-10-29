# Authentication Debug Tutorial - Hands-On Practice

> 🎯 **Interactive Learning**: Follow along with real, runnable code to practice the debugging workflow from [`docs/how/simple-debug-flow.md`](../../docs/how/simple-debug-flow.md)

## Overview

This directory contains a working authentication test with an intentional bug that you can debug step-by-step following the tutorial.

**The Scenario**: A test is failing intermittently with `TypeError: Cannot read property 'token' of undefined`. Your job is to debug it using VSC-Bridge tools.

## Files

- **`auth.test.js`** - The failing test (set breakpoint at line 14)
- **`auth-service.js`** - Contains the buggy `loginUser()` function (bug is on line 42)
- **`auth-mocks.js`** - Mock database, session store, and crypto functions
- **`run-auth-tutorial.js`** - Helper script to toggle bug on/off

## Quick Start

### 1. Setup the Bug

From the `test/javascript/` directory:

```bash
node run-auth-tutorial.js --mode=buggy
```

**Output**:
```
✅ Bug introduced: Line 42 is now a TODO comment
   The loginUser() function will return undefined

Run the test with: vscb script run test.debug-wait --param path=test/javascript/auth.test.js --param line=14
```

### 2. Verify the Bug Exists

```bash
node run-auth-tutorial.js --mode=status
```

**Output**:
```
Current State: BUGGY

Line 42 in auth-service.js:
  // TODO: Return the token object

💡 This is the BUGGY version - the test will fail
```

### 3. Follow the Tutorial

Open [`docs/how/simple-debug-flow.md`](../../docs/how/simple-debug-flow.md) and follow along step-by-step.

All the commands from the tutorial work with these files:

```bash
# From test/ directory

# Clear old breakpoints
vscb script run bp.clear.project

# Set breakpoint at line 14 (after login call)
vscb script run bp.set --param path=test/javascript/auth.test.js --param line=14

# Start debugging
vscb script run test.debug-wait --param path=test/javascript/auth.test.js --param line=14

# When paused, get session overview
vscb script run dap.summary

# View recent logs
vscb script run dap.logs --param count=20

# Search for patterns
vscb script run dap.search --param pattern="Login result"

# Step through code
vscb script run debug.step-into
vscb script run debug.step-over

# Check exceptions
vscb script run dap.exceptions

# And much more! See the tutorial for full workflow
```

## The Bug Explained

The `loginUser()` function in `auth-service.js`:
- ✅ Correctly validates credentials
- ✅ Correctly generates a token
- ✅ Correctly saves the session
- ❌ **Forgets to return the result** (line 42 is just a TODO comment)

This causes the function to return `undefined`, which crashes the test when it tries to access `result.token`.

## Practicing the Tutorial

### First Time Through

1. **Setup**: `node run-auth-tutorial.js --mode=buggy`
2. **Follow Tutorial**: Open `docs/how/simple-debug-flow.md` and work through each step
3. **Verify Fix**: After you understand the bug, run `node run-auth-tutorial.js --mode=fixed`
4. **Confirm**: Debug again to see the test pass

### Practice Again

Want to practice the workflow again?

```bash
# Reset to buggy state
node run-auth-tutorial.js --mode=buggy

# Now go through the debugging workflow again
just clear-breakpoints
just set-breakpoint --param file=test/javascript/auth.test.js --param line=14
just debug-wait --param testName="should return valid token"
```

## Expected Behavior

### When BUGGY

```bash
vscb script run test.debug-wait --param path=test/javascript/auth.test.js --param line=14
```

Should:
- Pause at line 14 breakpoint ✓
- Show `result = undefined` in variables ✓
- Crash with `TypeError: Cannot read property 'token' of undefined` ✓
- `dap-summary` shows `exitCode: 1` and `exceptions: 1` ✓

### When FIXED

```bash
vscb script run test.debug-wait --param path=test/javascript/auth.test.js --param line=14
```

Should:
- Pause at line 14 breakpoint ✓
- Show `result = { token: '...', expires: ... }` in variables ✓
- Test passes all assertions ✓
- `dap-summary` shows `exitCode: 0` and `exceptions: 0` ✓

## Debugging Commands Reference

**Breakpoints**:
```bash
vscb script run bp.list
vscb script run bp.set --param path=... --param line=...
vscb script run bp.clear.project
```

**Debug Control**:
```bash
vscb script run test.debug-wait --param path=... --param line=...
vscb script run debug.continue
vscb script run debug.step-over
vscb script run debug.step-into
vscb script run debug.step-out
```

**Inspection** (Tier 1 - Essential):
```bash
vscb script run dap.summary                      # Quick overview
vscb script run dap.logs --param count=20        # Recent logs
vscb script run dap.exceptions                   # Exception details
vscb script run debug.list-variables --param scope=local                         # Current variables
```

**Analysis** (Tier 2 - High Value):
```bash
vscb script run dap.search --param pattern=...   # Search outputs
vscb script run dap.timeline                     # Event chronology
vscb script run dap.stats                        # Metrics and patterns
```

**Advanced** (Tier 3):
```bash
vscb script run dap.filter --param 'filters={...}'  # Complex filtering
vscb script run dap.compare --param sessionA=... --param sessionB=...  # Compare runs
```

## Troubleshooting

### "Test not found"

Make sure you're in the `test/` directory when running debug commands:

```bash
cd test
vscb script run test.debug-wait --param path=test/javascript/auth.test.js --param line=14
```

### "Breakpoint not hit"

Verify breakpoint is set correctly:

```bash
vscb script run bp.list
```

Should show:
```
[1] test/javascript/auth.test.js:14 (enabled)
```

### "Already in BUGGY/FIXED state"

The toggle script is idempotent - running it multiple times is safe. Check status with:

```bash
node run-auth-tutorial.js --mode=status
```

## Tips for Learning

1. **Don't rush** - The tutorial is designed to show the discovery process
2. **Try all the commands** - Each DAP query script teaches a different skill
3. **Compare runs** - Use `dap-compare` to see before/after differences
4. **Practice multiple times** - Reset the bug and debug it again with different approaches
5. **Experiment** - Try setting breakpoints in different places

## What You'll Learn

By completing this tutorial, you'll master:

- ✅ Setting and clearing breakpoints strategically
- ✅ Using `debug-wait` to pause at the right moment
- ✅ Using `dap-summary` for quick health checks
- ✅ Using `dap-logs` to examine execution flow
- ✅ Using `dap-search` to find patterns
- ✅ Using step commands (step-in, step-over, step-out)
- ✅ Using `list-variables` to inspect program state
- ✅ Using `dap-exceptions` to understand crashes
- ✅ Using `dap-timeline` to see event chronology
- ✅ Using `dap-stats` for aggregate analysis
- ✅ Using `dap-compare` to verify fixes

## Next Steps

After completing this tutorial:

1. **Try your own code** - Apply these techniques to real failing tests
2. **Explore advanced features** - Check out Tier 2 and Tier 3 DAP scripts
3. **Read more docs** - See `docs/how/` for more debugging guides
4. **Share your learnings** - Help teammates learn the debugging workflow

## Related Documentation

- **Main Tutorial**: [`docs/how/simple-debug-flow.md`](../../docs/how/simple-debug-flow.md)
- **Breakpoint Management**: `docs/how/breakpoint-management.md`
- **Step Commands**: `docs/how/step-commands.md`
- **DAP Scripts Reference**: `docs/how/dap-scripts-reference.md`

---

**Happy Debugging! 🐛🔍✨**

Questions? Issues? See the main project README or open an issue.
