# Debugging a Failing Test: A Complete Workflow

> A realistic walkthrough of debugging an intermittent test failure using VSC-Bridge DAP query scripts and step commands

> **🎯 Follow Along!** This tutorial uses real, runnable test files you can practice with.
> See [`test/javascript/AUTH_TUTORIAL_README.md`](../../test/javascript/AUTH_TUTORIAL_README.md) for setup instructions.

## The Scenario

You're working on a user authentication service. A test called `test/javascript/auth.test.js` is failing intermittently with this error:

```
TypeError: Cannot read property 'token' of undefined
```

The test is supposed to:
1. Create a mock user
2. Call `loginUser(username, password)`
3. Verify it returns a valid token
4. Check that the token is stored in the session

**The Problem**: Sometimes it works, sometimes it crashes. You need to figure out why.

Let's debug it step-by-step using the VSC-Bridge tools.

---

## The Investigation

### 1. Clearing the Deck

**💭 Your thought**: "Before I start debugging, let me see what breakpoints are already set from my last session"

```bash
vscb script run bp.list
```

**Output**:
```
Found 5 breakpoint(s):
  [1] test/javascript/user.test.js:42 (enabled)
  [2] src/database.js:15 (enabled)
  [3] src/database.js:87 (enabled)
  [4] test/javascript/profile.test.js:23 (enabled)
  [5] src/utils.js:105 (enabled)
```

**💭 Your thought**: "I don't need those old ones from previous debugging sessions. Let me clear them all and start fresh"

```bash
vscb script run bp.clear.project
```

**Output**:
```
✅ Cleared all breakpoints (5 removed)
```

---

### 2. Setting Up for Investigation

**💭 Your thought**: "The error mentions 'token' being undefined. Let me look at the test and set a breakpoint right after the login call where we try to access the token"

Looking at `test/javascript/auth.test.js`:
```javascript
10: describe('User Login', () => {
11:   it('should return valid token for correct credentials', async () => {
12:     const mockUser = { username: 'alice', password: 'secret123' };
13:     const result = await loginUser(mockUser.username, mockUser.password);
14:     console.log('Login result:', result);
15:     expect(result.token).toBeDefined(); // <-- Sometimes crashes here!
16:     expect(result.token).toMatch(/^[a-f0-9]{32}$/);
17:     expect(result.expires).toBeGreaterThan(Date.now());
18:   });
19: });
```

**💭 Your thought**: "I'll set a breakpoint at line 14, right after the login call, so I can inspect the `result` object before the crash happens"

```bash
vscb script run bp.set --param path=test/javascript/auth.test.js --param line=14
```

**Output**:
```
✅ Breakpoint set at test/javascript/auth.test.js:14
```

**💭 Your thought**: "Let me verify it's set correctly"

```bash
vscb script run bp.list
```

**Output**:
```
Found 1 breakpoint(s):
  [1] test/javascript/auth.test.js:14 (enabled)
      Condition: none
```

Perfect! ✅

---

### 3. Starting the Debug Session

**💭 Your thought**: "Now let's run the test in debug mode and wait for it to hit my breakpoint"

```bash
vscb script run tests.debug-single --param path=test/javascript/auth.test.js --param line=14
```

**What happens**:
```
🐛 Starting debugger for test: "should return valid token"
⏳ Waiting for breakpoint hit...
✓ Test started
✓ Running test file: test/javascript/auth.test.js
🎯 Breakpoint hit at test/javascript/auth.test.js:14
⏸️  Paused - awaiting next command
```

Excellent! The test is now paused at line 14. The `loginUser` function has executed, and we're about to check its result.

---

### 4. Initial Investigation - What's the State?

**💭 Your thought**: "Great! We're paused. Now let me get a quick overview of what's happened so far in this debug session. This will tell me if there are any obvious problems."

```bash
vscb script run dap.summary
```

**Output**:
```json
{
  "session": {
    "id": "7f3a92bc-e401-4f28-9b12-d8c7a6e5f3b1",
    "type": "pwa-node",
    "name": "Jest: auth.test.js",
    "duration": "2.3s (still running)",
    "status": "running"
  },
  "counts": {
    "totalOutputs": 47,
    "byCategory": {
      "stdout": 12,
      "stderr": 2,
      "console": 30,
      "telemetry": 3
    },
    "exceptions": 0,
    "stoppedEvents": 1,
    "breakpointHits": 1
  },
  "metrics": {
    "totalDataSize": 8432,
    "avgOutputLength": 179,
    "eventsPerSecond": 20.4,
    "timeSinceLastEvent": 127
  },
  "health": {
    "hasExceptions": false,
    "exceptionRate": 0,
    "errorRatio": 0.04,
    "exitCode": null,
    "abnormalExit": false
  },
  "samples": {
    "firstOutputs": [
      "[console] PASS test/javascript/auth.test.js",
      "[console] User Login",
      "[stdout] Setting up test environment..."
    ],
    "lastOutputs": [
      "[stdout] Creating mock user: alice",
      "[console] Calling loginUser(alice, ****)",
      "[console] [Auth Service] Processing login request..."
    ]
  }
}
```

**💭 Your thought**: "Interesting findings:
- We've had 47 outputs total in just 2.3 seconds
- **2 stderr messages** - that's worth investigating
- **No exceptions yet** - good, we caught it before the crash
- We hit our breakpoint (stoppedEvents: 1)
- Error ratio is only 4%, so not many errors in the logs yet

Let me look at those recent logs more carefully to understand what happened leading up to this moment."

---

### 5. Examining Recent Activity

**💭 Your thought**: "Let me see the last 20 logs to understand the execution flow"

```bash
vscb script run dap.logs --param count=20
```

**Output**:
```
Showing last 20 outputs (newest first):

[20] [console] Login result: undefined                                  [auth.test.js:14]
[19] [console] [Auth Service] Session saved successfully                [auth.js:40]
[18] [console] [Auth Service] Token generated: a7f3c2e91b4d8f...       [auth.js:35]
[17] [stderr] Warning: Token generator using deprecated crypto method  [auth.js:33]
[16] [console] [Auth Service] Generating token for user 42             [auth.js:32]
[15] [stdout] [Auth Service] User found in database                     [auth.js:28]
[14] [console] [Auth Service] Checking credentials...                   [auth.js:25]
[13] [console] Calling loginUser(alice, ****)                          [auth.test.js:13]
[12] [stdout] Creating mock user: alice                                 [auth.test.js:12]
[11] [console] Running test: should return valid token                  [jest]
[10] [telemetry] js-debug/dap/operation                                [debugger]
[09] [console] Setting up test environment...                           [jest-setup.js:5]
[08] [console] Clearing database...                                     [jest-setup.js:12]
[07] [stdout] Database cleared                                          [database.js:89]
...

Matched 20 of 47 total outputs
```

**💭 Your thought**: "Wait a minute... look at entry [20]:

```
[20] [console] Login result: undefined
```

That's line 14 - my `console.log('Login result:', result)` statement. The result is **undefined**!

But entries [16-18] show:
- Token WAS generated (`a7f3c2e91b4d8f...`)
- Session WAS saved successfully

So the auth service is working internally, but somehow the function is returning `undefined`. There's also that stderr warning about deprecated crypto - probably unrelated to our bug, but good to fix later.

Let me search for all mentions of 'Login result' to see if this pattern appeared before."

---

### 6. Searching for Clues

**💭 Your thought**: "Let me search the entire session for 'Login result' to see if there are any other clues"

```bash
vscb script run dap.search --param pattern="Login result"
```

**Output**:
```json
{
  "matches": [
    {
      "sessionId": "7f3a92bc-e401-4f28-9b12-d8c7a6e5f3b1",
      "output": {
        "ts": 1759712345678,
        "category": "console",
        "text": "Login result: undefined\n",
        "source": {
          "path": "/Users/you/project/test/javascript/auth.test.js",
          "name": "auth.test.js"
        },
        "line": 14
      },
      "matchText": "Login result",
      "context": {
        "before": [
          "[Auth Service] Token generated: a7f3c2e91b4d8f...",
          "[Auth Service] Session saved successfully"
        ],
        "after": [
          "Attempting to read token property from result..."
        ]
      }
    }
  ],
  "totalMatches": 1,
  "matchesBySession": {
    "7f3a92bc-e401-4f28-9b12-d8c7a6e5f3b1": 1
  },
  "sessionsSearched": 1
}
```

**💭 Your thought**: "Only one match. The context confirms:
- BEFORE the undefined result: Token was generated and session saved ✅
- AFTER the undefined result: We try to read the token property ❌

So the function `loginUser()` is doing its internal work correctly, but it's not returning the result. This smells like a missing `return` statement!

Let me verify by inspecting the actual variables at this breakpoint."

---

### 7. Stepping Through the Code

**💭 Your thought**: "I'm currently paused at line 14 in the test. Let me check what the `result` variable actually contains"

```bash
vscb script run debug.list-variables --param scope=local
```

**Output**:
```javascript
Scope: Local
├─ mockUser: Object
│  ├─ username: "alice"
│  └─ password: "secret123"
└─ result: undefined

2 variables shown (2 total in scope)
```

**💭 Your thought**: "Confirmed - `result` is indeed `undefined`.

Now I need to understand WHY `loginUser()` returns undefined. To do this, I should:
1. Continue this session (which will crash)
2. Restart the debugger
3. Step INTO the `loginUser` function to see what's happening inside

Let me continue and let it crash first."

```bash
vscb script run debug.continue
```

**Output**:
```
▶️  Resuming execution...
❌ Test failed with exception:
   TypeError: Cannot read property 'token' of undefined
   at test/javascript/auth.test.js:15:23

Session terminated (exitCode: 1)
```

Expected crash. Now let's restart with a different strategy:

**💭 Your thought**: "This time I'll set a breakpoint at line 13 (BEFORE the login call) so I can step INTO the function"

```bash
vscb script run bp.clear.project
vscb script run bp.set --param path=test/javascript/auth.test.js --param line=13
vscb script run tests.debug-single --param path=test/javascript/auth.test.js --param line=13
```

**Output**:
```
🎯 Breakpoint hit at test/javascript/auth.test.js:13
⏸️  Paused - awaiting next command
```

Perfect! Now I'm paused BEFORE the `loginUser()` call on line 13.

**💭 Your thought**: "Now let me step INTO the loginUser function to trace its execution"

```bash
vscb script run debug.step-into
```

**Output**:
```
⏭️  Stepped into function: loginUser
📍 Now at: src/auth.js:24

   24: async function loginUser(username, password) {
   25:   console.log('[Auth Service] Checking credentials...');
```

Excellent! We're now inside the `loginUser` function in `src/auth.js`.

**💭 Your thought**: "Let me check the parameters that were passed in"

```bash
vscb script run debug.list-variables --param scope=local --param maxDepth=1
```

**Output**:
```javascript
Scope: Local
├─ username: "alice"
├─ password: "secret123"

2 variables shown (2 total in scope)
```

Good - parameters are correct. Now let me step through the function to see what it does.

**💭 Your thought**: "I'll step over the next few lines to see the function's logic"

```bash
vscb script run debug.step-over
```

**Output**:
```
📍 Now at: src/auth.js:27
   27:   const user = await db.findUserByUsername(username);
```

```bash
vscb script run debug.step-over
```

**Output**:
```
📍 Now at: src/auth.js:28
   28:   console.log('[Auth Service] User found in database');
```

```bash
# Check what user was found
vscb script run debug.list-variables --param scope=local
```

**Output**:
```javascript
Scope: Local
├─ username: "alice"
├─ password: "secret123"
└─ user: Object
   ├─ id: 42
   ├─ username: "alice"
   ├─ passwordHash: "$2b$10$N9qo8uLOickgx..."
   └─ email: "alice@example.com"
```

Good! User was found. Let me continue stepping...

```bash
vscb script run debug.step-over  # Line 32: Generating token
vscb script run debug.step-over  # Line 33: Token generation (with that deprecated crypto warning)
vscb script run debug.step-over  # Line 35: Token generated
```

**Output**:
```
📍 Now at: src/auth.js:37
   37:   const session = { userId: user.id, token, expires: Date.now() + 3600000 };
```

```bash
just list-variables --param scopeFilter=local
```

**Output**:
```javascript
Scope: Local
├─ username: "alice"
├─ password: "secret123"
├─ user: Object { id: 42, username: "alice", ... }
├─ token: "a7f3c2e91b4d8f6a3c5e9d2b7f1a8c4e"
└─ session: Object
   ├─ userId: 42
   ├─ token: "a7f3c2e91b4d8f6a3c5e9d2b7f1a8c4e"
   └─ expires: 1759716000000
```

Excellent! The token exists, the session object is created. Let me continue stepping...

```bash
vscb script run debug.step-over  # Line 40: Save session
vscb script run debug.step-over  # Line 41: Log the result
```

**Output**:
```
📍 Now at: src/auth.js:42
   42:   // TODO: Return the token object
```

**💭 Your thought**: "WAIT. What's on line 42?"

Let me look at the source code around this area:

```javascript
39:
40:   await sessionStore.save(session);
41:   console.log('Login result:', { token, expires: session.expires });
42:   // TODO: Return the token object
43: }
```

**💭 Your thought**: "**THERE'S THE BUG!**

Line 42 is just a TODO comment! There's NO return statement! The function:
1. ✅ Finds the user
2. ✅ Generates a token
3. ✅ Creates a session object with the token
4. ✅ Saves the session
5. ✅ Logs the result
6. ❌ **FORGETS TO RETURN ANYTHING**

The function should be returning `{ token, expires }` but instead it just ends, so JavaScript returns `undefined` by default.

That's why our test sees `result = undefined` and crashes when trying to access `result.token`!

Let me verify this is the end of the function:"

```bash
vscb script run debug.step-over
```

**Output**:
```
⬆️  Stepped out of function: loginUser
📍 Returned to: test/javascript/auth.test.js:14

   Returned value: undefined
```

**💭 Your thought**: "Confirmed! The function returned `undefined`. The bug is crystal clear now."

---

### 8. Understanding the Full Impact

**💭 Your thought**: "Before I fix this, let me understand the full impact by checking if there were any exceptions and what the crash looks like"

```bash
vscb script run debug.continue
```

**Output**:
```
▶️  Resuming execution...
❌ Exception thrown: TypeError: Cannot read property 'token' of undefined
⏸️  Paused on exception
```

Great! The debugger caught the exception. Now let's examine it:

```bash
vscb script run dap.exceptions
```

**Output**:
```json
{
  "exceptions": [
    {
      "exception": {
        "ts": 1759712347891,
        "threadId": 5,
        "message": "Cannot read property 'token' of undefined",
        "description": "Paused on exception"
      },
      "stoppedEvent": {
        "ts": 1759712347891,
        "reason": "exception",
        "threadId": 5,
        "allThreadsStopped": false
      },
      "timeSinceStart": 2847,
      "location": {
        "file": "test/javascript/auth.test.js",
        "line": 15
      },
      "context": {
        "before": [
          "[console] Login result: undefined",
          "[console] Attempting to read token property from result...",
          "[stdout] Executing assertion: expect(result.token).toBeDefined()",
          "[stderr] Assertion failed",
          "[console] Reading property 'token' from undefined value"
        ],
        "after": [
          "[stderr] Test failed: TypeError",
          "[stderr] Stack trace:",
          "[stderr]     at test/javascript/auth.test.js:15:23",
          "[stderr]     at async Promise.all (index 0)",
          "[console] Cleaning up test environment..."
        ]
      },
      "stackTrace": "TypeError: Cannot read property 'token' of undefined\n    at test/javascript/auth.test.js:15:23\n    at processTicksAndRejections (node:internal/process/task_queues:96:5)\n    at async Promise.all (index 0)"
    }
  ],
  "totalExceptions": 1,
  "session": {
    "id": "7f3a92bc-e401-4f28-9b12-d8c7a6e5f3b1",
    "type": "pwa-node",
    "name": "Jest: auth.test.js"
  }
}
```

**💭 Your thought**: "Perfect! The exception details show:
- Exception happened at 2.847 seconds into the test
- Location: line 15 (the `expect(result.token).toBeDefined()` line)
- Context BEFORE: Shows 'Login result: undefined' and the failed assertion
- Context AFTER: Shows the crash and cleanup
- Full stack trace included

This gives us the complete picture of the failure."

---

### 9. Checking the Timeline

**💭 Your thought**: "Let me see a timeline view to understand the full flow of events"

```bash
vscb script run dap.timeline --param granularity=milestones
```

**Output**:
```json
{
  "timeline": [
    {
      "timestamp": 1759712345000,
      "relativeTime": 0,
      "eventType": "output",
      "summary": "Session started",
      "significance": "normal"
    },
    {
      "timestamp": 1759712345127,
      "relativeTime": 127,
      "eventType": "output",
      "summary": "First output: Setting up test environment...",
      "significance": "normal"
    },
    {
      "timestamp": 1759712347341,
      "relativeTime": 2341,
      "eventType": "stopped",
      "summary": "Breakpoint hit at auth.test.js:14",
      "significance": "warning"
    },
    {
      "timestamp": 1759712347847,
      "relativeTime": 2847,
      "eventType": "exception",
      "summary": "Exception: Cannot read property 'token' of undefined",
      "significance": "error"
    },
    {
      "timestamp": 1759712347891,
      "relativeTime": 2891,
      "eventType": "exit",
      "summary": "Session terminated (exitCode: 1)",
      "significance": "error"
    }
  ],
  "milestones": {
    "firstOutput": 127,
    "firstException": 2847,
    "breakpointHits": [2341],
    "sessionExit": 2891
  },
  "duration": 2891,
  "eventCount": 47
}
```

**💭 Your thought**: "Clear timeline:
- **0-127ms**: Test setup
- **127-2341ms**: Test execution up to breakpoint (2.2 seconds)
- **2341ms**: Hit breakpoint (paused here during debugging)
- **2847ms**: Exception thrown (506ms after breakpoint, during my investigation)
- **2891ms**: Test exited with failure (44ms after exception)

The test runs pretty quickly - only 2.9 seconds total including the crash."

---

### 10. Getting Statistics (Bonus)

**💭 Your thought**: "Out of curiosity, let me see what's generating all those console logs - we had 47 outputs in under 3 seconds"

```bash
vscb script run dap.stats --param groupBy=source
```

**Output**:
```json
{
  "distribution": {
    "byCategory": {
      "console": 30,
      "stdout": 12,
      "stderr": 2,
      "telemetry": 3
    },
    "bySource": {
      "src/auth.js": 23,
      "test/javascript/auth.test.js": 8,
      "node_modules/jest/...": 12,
      "unknown": 4
    }
  },
  "topN": {
    "mostFrequentMessages": [
      { "text": "[Auth Service] Checking credentials...\n", "count": 1 },
      { "text": "[Auth Service] User found in database\n", "count": 1 },
      { "text": "[Auth Service] Generating token for user 42\n", "count": 1 }
    ],
    "noisiestFiles": [
      { "file": "src/auth.js", "count": 23 },
      { "file": "node_modules/jest/...", "count": 12 },
      { "file": "test/javascript/auth.test.js", "count": 8 }
    ]
  },
  "averages": {
    "eventsPerSecond": 16.3,
    "timeBetweenOutputs": 61,
    "outputsPerSession": 47
  },
  "charts": {
    "categoryDistribution": "console: ████████████████████████▌ 64%\nstdout:   ██████▎ 26%\nstderr:   █ 4%\ntelemetry: █▌ 6%"
  }
}
```

**💭 Your thought**: "Interesting insights:
- **src/auth.js generates 23 outputs** - nearly half of all logs! That's a lot of logging
- Most logs are 'console' category (64%)
- Only 2 stderr messages (the deprecated crypto warning being one)
- Average 16 events per second

Good to know for future optimization - we might want to reduce logging in auth.js for production."

---

### 11. The Fix and Verification

**💭 Your thought**: "Now I know exactly what to fix. The bug is on line 42 of `src/auth.js`. I need to change the TODO comment to an actual return statement."

**Edit `src/auth.js`** and change line 42 from:
```javascript
42:   // TODO: Return the token object
43: }
```

To:
```javascript
42:   return { token, expires: session.expires };
43: }
```

**💭 Your thought**: "Perfect! Now let's test it to verify the fix works. I'll set a breakpoint after the login call to confirm `result` is now properly defined."

```bash
# Clear old breakpoint from line 13
vscb script run bp.clear.project

# Set new breakpoint at line 14 (after the login call returns)
vscb script run bp.set --param path=test/javascript/auth.test.js --param line=14

# Debug the test again
vscb script run tests.debug-single --param path=test/javascript/auth.test.js --param line=14
```

**Output**:
```
🎯 Breakpoint hit at test/javascript/auth.test.js:14
⏸️  Paused - awaiting next command
```

**💭 Your thought**: "Good! We're paused at line 14 again. Now let me check the `result` variable"

```bash
vscb script run debug.list-variables --param scope=local
```

**Output**:
```javascript
Scope: Local
├─ mockUser: Object
│  ├─ username: "alice"
│  └─ password: "secret123"
└─ result: Object
   ├─ token: "a7f3c2e91b4d8f6a3c5e9d2b7f1a8c4e"
   └─ expires: 1759716000000

2 variables shown (2 total in scope)
```

**💭 Your thought**: "🎉 **SUCCESS!**

The `result` variable is now an Object containing:
- ✅ `token`: A proper 32-character hex token
- ✅ `expires`: A timestamp in the future

This is exactly what we expected! Let me continue execution and verify the test passes completely."

```bash
vscb script run debug.continue
```

**Output**:
```
▶️  Resuming execution...
✅ Test passed: should return valid token for correct credentials
✨ All assertions passed
   ✓ result.token is defined
   ✓ result.token matches pattern /^[a-f0-9]{32}$/
   ✓ result.expires is greater than current time

Session terminated (exitCode: 0)
```

**💭 Your thought**: "Perfect! The test now passes. Let me get a summary of this successful run to compare with the failing run."

```bash
vscb script run dap.summary
```

**Output**:
```json
{
  "session": {
    "id": "9c2e5b7a-f312-4d89-a6b3-c9f1e4d8a7b2",
    "type": "pwa-node",
    "name": "Jest: auth.test.js",
    "duration": "2.1s",
    "status": "terminated"
  },
  "counts": {
    "totalOutputs": 45,
    "byCategory": {
      "stdout": 12,
      "stderr": 1,
      "console": 29,
      "telemetry": 3
    },
    "exceptions": 0,
    "stoppedEvents": 1,
    "breakpointHits": 1
  },
  "metrics": {
    "eventsPerSecond": 21.4
  },
  "health": {
    "hasExceptions": false,
    "exceptionRate": 0,
    "errorRatio": 0.02,
    "exitCode": 0,
    "abnormalExit": false
  }
}
```

**💭 Your thought**: "Excellent! Key differences from the failing run:
- ✅ **exitCode: 0** (was 1 before) - test passed!
- ✅ **exceptions: 0** (was 1 before) - no crash!
- ✅ **errorRatio: 0.02** (was 0.04 before) - fewer errors
- ✅ Only 1 stderr message now (the deprecation warning; the crash is gone)
- ✅ Slightly faster: 2.1s vs 2.3s

Bug confirmed fixed!"

---

### 12. Comparing Runs (Advanced Verification)

**💭 Your thought**: "As a final verification, let me compare the failing run with this successful run to see the exact differences"

```bash
# Compare the two most recent sessions
# The failing session was: 7f3a92bc-e401-4f28-9b12-d8c7a6e5f3b1
# The fixed session is: 9c2e5b7a-f312-4d89-a6b3-c9f1e4d8a7b2
vscb script run dap.compare --param sessionA=7f3a92bc --param sessionB=9c2e5b7a --param compareBy=exceptions
```

**Output**:
```json
{
  "comparison": {
    "counts": {
      "deltaOutputs": -2,
      "deltaExceptions": -1,
      "deltaStops": 0
    },
    "exceptions": {
      "onlyInA": [
        {
          "ts": 1759712347891,
          "description": "Cannot read property 'token' of undefined",
          "location": "test/javascript/auth.test.js:15"
        }
      ],
      "onlyInB": [],
      "common": []
    },
    "divergencePoint": {
      "timestamp": 1759712347678,
      "outputIndex": 20,
      "description": "Outputs diverged after 'Login result:' - Session A logged 'undefined', Session B logged proper object"
    }
  },
  "sessionA": {
    "id": "7f3a92bc-e401-4f28-9b12-d8c7a6e5f3b1",
    "name": "Jest: auth.test.js (FAILED)",
    "exceptions": 1,
    "exitCode": 1
  },
  "sessionB": {
    "id": "9c2e5b7a-f312-4d89-a6b3-c9f1e4d8a7b2",
    "name": "Jest: auth.test.js (PASSED)",
    "exceptions": 0,
    "exitCode": 0
  }
}
```

**💭 Your thought**: "Perfect comparison! This confirms:

**Differences**:
- Session A (before fix) had **1 exception**, Session B (after fix) has **0**
- Session A had **2 more outputs** (the crash-related logs)
- **Divergence point**: Output #20 is where they differed - Session A logged `undefined`, Session B logged the proper object

**The exception unique to Session A**:
- TypeError at line 15
- 'Cannot read property token of undefined'

**No exceptions in Session B** - the bug is completely fixed!

This comparison proves beyond doubt that our one-line fix (adding the return statement) resolved the issue."

---

## Summary

### What We Accomplished

We successfully debugged and fixed an intermittent test failure using a systematic approach with VSC-Bridge tools:

1. ✅ **Cleared old breakpoints** to start with a clean slate
2. ✅ **Set strategic breakpoint** at the suspected problem area
3. ✅ **Used debug-wait** to pause execution at the right moment
4. ✅ **Used dap-summary** to get a quick health overview of the session
5. ✅ **Used dap-logs** to examine recent activity and spot the undefined result
6. ✅ **Used dap-search** to find all occurrences of the problem pattern
7. ✅ **Used step commands** (step-in, step-over) to trace through the login function
8. ✅ **Used list-variables** to inspect values at each step
9. ✅ **Used dap-exceptions** to understand the crash in detail
10. ✅ **Used dap-timeline** to see the chronological flow of events
11. ✅ **Used dap-stats** to analyze logging patterns
12. ✅ **Used dap-compare** to verify the fix by comparing runs

### The Bug

**Root Cause**: The `loginUser()` function in `src/auth.js` was missing a return statement on line 42.

**What Happened**:
- The function correctly generated a token
- The function correctly saved the session
- **But it forgot to return the token object**
- JavaScript returned `undefined` by default
- The test tried to access `result.token` on `undefined`
- This caused: `TypeError: Cannot read property 'token' of undefined`

### The Fix

**Changed line 42 in `src/auth.js`** from:
```javascript
// TODO: Return the token object
```

To:
```javascript
return { token, expires: session.expires };
```

**Result**: Test now passes consistently ✅

### Key Takeaways

#### Pro Tips for Debugging

1. **Always start with `dap-summary`** - It gives you a quick health check: exception count, exit code, error ratio
2. **Use `dap-logs --param count=N`** to see recent activity - Often reveals the problem immediately
3. **Use `dap-search`** to find patterns - Great for tracking down specific error messages
4. **Step commands are essential** - Step-in/over/out let you trace execution flow precisely
5. **`dap-exceptions` shows context** - See what happened before AND after crashes
6. **`dap-timeline` helps with timing issues** - See exactly when events occurred
7. **`dap-compare` verifies fixes** - Compare before/after to confirm the bug is gone
8. **Clear old breakpoints** - Start each session fresh to avoid confusion

#### The Debugging Workflow

```
1. Clear old breakpoints
2. Set new breakpoint at suspected issue
3. Run debug-wait to pause at breakpoint
4. Get overview with dap-summary
5. Examine recent logs with dap-logs
6. Use step commands to trace execution
7. Inspect variables at each step
8. When crash occurs, use dap-exceptions
9. After fixing, verify with dap-compare
```

#### Why This Approach Works

- **Systematic**: You investigate methodically, not randomly
- **Evidence-based**: Every conclusion is backed by captured data
- **Reproducible**: The DAP capture lets you re-examine the session
- **Fast**: The tools give you instant answers without manual log parsing
- **Complete**: You see the full picture: logs, exceptions, timeline, variables

---

## Hands-On Practice

Want to follow along with the actual code? This tutorial comes with interactive practice files!

### Quick Setup

```bash
# Navigate to test/javascript directory
cd test/javascript

# Introduce the bug
node run-auth-tutorial.js --mode=buggy

# Verify it's ready
node run-auth-tutorial.js --mode=status
```

### Practice Files

- **Setup Instructions**: [`test/javascript/AUTH_TUTORIAL_README.md`](../../test/javascript/AUTH_TUTORIAL_README.md)
- **Test File**: `test/javascript/auth.test.js` (set breakpoint at line 14)
- **Buggy Code**: `test/javascript/auth-service.js` (bug is on line 42)
- **Helper Script**: `test/javascript/run-auth-tutorial.js` (toggle bug on/off)

### Follow Along

Once setup is complete, all the commands from this tutorial work with the practice files:

```bash
cd test  # Must be in test directory

vscb script run bp.set --param path=test/javascript/auth.test.js --param line=14
vscb script run tests.debug-single --param path=test/javascript/auth.test.js --param line=14
vscb script run dap.summary
vscb script run dap.logs --param count=20
# ... and all other commands from the tutorial
```

### Reset Anytime

Want to practice again? Reset the bug:

```bash
node javascript/run-auth-tutorial.js --mode=buggy
```

---

## Available Debug Commands Reference

### Breakpoint Management
```bash
vscb script run bp.list                                            # Show all breakpoints
vscb script run bp.set --param path=... --param line=...           # Set new breakpoint
vscb script run bp.clear.project                                   # Clear all breakpoints
```

### Debug Control
```bash
vscb script run tests.debug-single --param path=... --param line=...  # Start debugging and wait at breakpoint
vscb script run debug.continue                                     # Resume execution
vscb script run debug.step-over                                    # Step to next line (don't enter functions)
vscb script run debug.step-into                                    # Step into function
vscb script run debug.step-out                                     # Step out of current function
```

### Variable Inspection
```bash
vscb script run debug.list-variables                               # Show all variables in current scope
vscb script run debug.list-variables --param scope=local           # Show only local variables
vscb script run debug.list-variables --param maxDepth=2            # Control how deep to expand objects
```

### Session Investigation (Tier 1 - Essential)
```bash
vscb script run dap.summary           # Quick overview of session health
vscb script run dap.summary --param compact=true   # One-line condensed view
vscb script run dap.logs              # Show last 20 logs
vscb script run dap.logs --param count=50          # Show last 50 logs
vscb script run dap.logs --param category=stdout   # Show only stdout logs
vscb script run dap.logs --param search=ERROR      # Search for pattern in logs
vscb script run dap.exceptions        # Show all exceptions with context
vscb script run dap.exceptions --param count=5     # Show last 5 exceptions
```

### Analysis Tools (Tier 2 - High Value)
```bash
vscb script run dap.search --param pattern=...     # Search for text/regex in all sessions
vscb script run dap.timeline                       # View chronological events
vscb script run dap.timeline --param granularity=milestones   # Show only key events
vscb script run dap.stats                          # Analyze metrics and patterns
vscb script run dap.stats --param groupBy=source   # Group by source file
```

### Advanced Tools (Tier 3)
```bash
vscb script run dap.filter --param 'filters={...}' # Complex multi-criteria filtering
vscb script run dap.compare --param sessionA=... --param sessionB=...  # Compare two debug sessions
```

---

## Related Documentation

- [Breakpoint Management Guide](./breakpoint-management.md)
- [Debug Step Commands Reference](./step-commands.md)
- [DAP Query Scripts Complete Reference](./dap-scripts-reference.md)
- [Variable Inspection Guide](./variable-inspection.md)

---

## What's Next?

Now that you've seen a complete debugging workflow, try applying these techniques to your own failing tests:

1. Start with `dap-summary` to understand session health
2. Use `dap-logs` to see what's happening
3. Use step commands to trace execution
4. Use `dap-exceptions` when crashes occur
5. Use `dap-compare` to verify your fixes

**Happy debugging! 🐛🔍✨**
