# Seeing Between the Lines: Debugging Invisible State with VSC-Bridge

> A collaborative debugging story showcasing breakpoints, stepping, and runtime evaluation

---

## Prerequisites

**Required Versions**:
- Python >= 3.8 (for `lru_cache` introspection)
- pytest >= 5.0 (for `tmp_path` fixture)
- VS Code Python extension >= 2024.0.0
- VSC-Bridge extension installed and bridge running

**Verification**:
```bash
python --version  # Should show 3.8+
pytest --version  # Should show 5.0+
vscb status       # Should show "Bridge connected"
```

---

## Presentation Mode

For live presentations, expand all spoilers beforehand by pasting this in your browser console:

```javascript
document.querySelectorAll('details').forEach(d => d.open = true);
```

For printing or static viewing, the CSS print media query will automatically expand all details.

---

## The Problem: Something's Not Updating

Let's start by running the test to see what's wrong:

```bash
cd /workspaces/vscode-bridge/test/integration-simple/python
pytest demo_shop/test_checkout_demo.py -v
```

**Result**: The test fails with this error:

```
FAILED demo_shop/test_checkout_demo.py::test_total_changes_when_env_and_file_change
AssertionError: Second call should reflect EU tax + discount: expected 120.00, got 214.0
```

### What the Test Does

Let's look at what the test is trying to do:

**First call** (line 47):
- Writes config file: `region: US`, `discount_rate: 0.10`
- Sets environment: `FEATURE_SALES=0`
- Calls `calculate_total()`
- Gets: **214.0** (correct: US tax 7%, no discount because feature off)

**Second call** (line 57):
- **Changes config file**: `region: EU`, `discount_rate: 0.50`
- **Changes environment**: `FEATURE_SALES=1`
- Calls `calculate_total()` again
- Expects: **120.0** (EU tax 20%, then 50% discount)
- Actually gets: **214.0** ← Same as first call! 🤔

### Why Is This Hard Without Debugging?

Let's look at the code. Navigate to the second call site:

```bash
# Using VSC-Bridge to jump to the problem
vscb script run editor.goto-line \
  --param path=/workspaces/vscode-bridge/test/integration-simple/python/demo_shop/test_checkout_demo.py \
  --param line=57
```

The test clearly writes a new config file and changes the environment variable. So why doesn't the calculation reflect these changes?

**Static reading shows**:
- `load_settings()` opens and reads the file ✓
- `make_tax_rate_provider()` calls `load_settings()` ✓
- `flag_enabled()` calls `os.getenv()` ✓

Everything LOOKS right. The file is different, the environment is different, but the result is the same.

**This is where runtime debugging becomes essential.**

---

## The Investigation Strategy

We have three categories of "invisible state" bugs hiding in this code:
1. **Mutable default parameter cache** - Settings loader reuses stale cached values
2. **LRU-cached environment flag** - Decorator caches environment variable reads
3. **Closure-captured configuration** - Tax rate function captures region at creation time

These bugs are practically invisible during code review but become trivial to identify with runtime debugging using the **Breakpoint Ladder** approach:

1. Set strategic breakpoints at decision points
2. Run the test under debugger to a specific line
3. Pause at each decision and inspect state
4. Use `debug.evaluate` to compare "what code thinks" vs "what's real"
5. Build evidence chain proving each bug

---

## File Structure

Navigate to `/workspaces/vscode-bridge/test/integration-simple/python/demo_shop/`:

- `config.py` - Settings loader with mutable default cache bug (BP1)
- `flags.py` - Feature flags with lru_cache decorator bug (BP2)
- `tax.py` - Tax rate provider with closure capture bug (BP3)
- `checkout.py` - Integration module (BP4)
- `test_checkout_demo.py` - Failing test demonstrating all three bugs

---

## Breakpoint Setup

**IMPORTANT**: Run all commands from `/workspaces/vscode-bridge/test/` directory to ensure you're using the Extension Host bridge (not the root workspace bridge).

```bash
# Navigate to test directory first
cd /workspaces/vscode-bridge/test

# Optional: start clean
vscb script run breakpoint.clear.project

# BP1: Conditional - only fires on cache hit (second call)
vscb script run breakpoint.set \
  --param path=/workspaces/vscode-bridge/test/integration-simple/python/demo_shop/config.py \
  --param line=37 \
  --param condition="abspath in cache"

# BP2: Inside closure to inspect captured region
vscb script run breakpoint.set \
  --param path=/workspaces/vscode-bridge/test/integration-simple/python/demo_shop/tax.py \
  --param line=20

# BP3: At feature flag decision point
vscb script run breakpoint.set \
  --param path=/workspaces/vscode-bridge/test/integration-simple/python/demo_shop/checkout.py \
  --param line=22

# BP4: Inside flag_enabled return statement
vscb script run breakpoint.set \
  --param path=/workspaces/vscode-bridge/test/integration-simple/python/demo_shop/flags.py \
  --param line=17
```

**Note**: The conditional breakpoint on BP1 (`abspath in cache`) ensures we skip the first call and only pause when the cache is populated (second call). This keeps the demonstration focused.

---

## Launch Debug Session

**IMPORTANT**: Ensure you're in the test/ directory (this is where the Extension Host creates the `.vsc-bridge/` directory):

```bash
cd /workspaces/vscode-bridge/test

# Target the test DEFINITION line (where `def test_...` appears)
vscb script run tests.debug-single \
  --param path=/workspaces/vscode-bridge/test/integration-simple/python/demo_shop/test_checkout_demo.py \
  --param line=30
```

**Alternative**: Click the "debug test" icon in VS Code Test UI gutter at line 30.

**Why the test/ directory?** The Extension Host opens the test workspace, creating its bridge communication directory at `/workspaces/vscode-bridge/test/.vsc-bridge/`. Running `vscb` commands from this directory ensures they connect to the correct bridge instance.

---

## Stop 1: config.py — The Hidden Cache

### 🤔 The Mystery

We just changed the settings file between calls. The file clearly says `region: EU` now.
Yet when we hit this breakpoint, we're about to return cached settings. What's going on?

**Before continuing, think**: What mechanism could cause a file loader to ignore file changes?

<details>
<summary>🎯 Reveal: Hypothesis</summary>

**Hypothesis**: There's a hidden cache preventing re-reads of the file.

The function signature shows `cache: Dict[str, Dict[str, Any]] = {}`. That default dict
is evaluated ONCE at function definition time, not at each call. It persists across calls!

</details>

<details>
<summary>🔍 Reveal: Investigation Commands</summary>

**CLI**:
```bash
# What's in the cache?
vscb script run debug.evaluate --param expression="list(cache.keys())"

# What's the cached value?
vscb script run debug.evaluate --param expression="cache[abspath]"

# Prove it's the same object across calls
vscb script run debug.evaluate --param expression="id(cache)"
```

**MCP**:
```typescript
await debug_evaluate({ expression: "list(cache.keys())" });
await debug_evaluate({ expression: "cache[abspath]" });
await debug_evaluate({ expression: "id(cache)" });
```

</details>

<details>
<summary>📊 Reveal: Expected Results</summary>

You should see:
- `cache.keys()` shows the settings file path
- `cache[abspath]` shows `{'region': 'US', 'discount_rate': 0.1}`
- The cached region is STILL 'US' despite file now saying 'EU'
- The `id(cache)` is the same number each time (same object instance)

</details>

<details>
<summary>💡 Reveal: The Insight</summary>

**Root Cause**: Mutable default parameter bug!

The `cache={}` in the function signature creates ONE dict that survives across ALL calls
in the Python process. Changes to the file don't matter - we return the first result cached.

**Why debugging reveals this instantly**: Static reading shows `if abspath in cache: return cache[abspath]`
and makes you think "it's an optimization." Only at runtime can you see the default-arg dict is
the SAME object every time, preserving state across calls.

**The fix** (optional to show):
```python
def load_settings(path: str, cache: Dict[str, Dict[str, Any]] = None):
    if cache is None:
        cache = {}  # Fresh dict each call
    # ...
```

</details>

**Continue to next breakpoint**:
```bash
# Still in /workspaces/vscode-bridge/test/
vscb script run debug.continue
```

---

## Stop 2: tax.py — The Frozen Closure

### 🤔 The Mystery

The config file now says `region: EU`, but the tax calculation still uses 7% (US rate).
The `make_tax_rate_provider` function reads the file... doesn't it?

**Before continuing, think**:
- When does `make_tax_rate_provider` read the config?
- When does the returned `rate()` function use that config?
- Could the region value be "frozen" somehow?

<details>
<summary>🎯 Reveal: Hypothesis</summary>

**Hypothesis**: The closure captured the `region` variable when the tax provider
was created (first call). The inner function doesn't re-read the file.

**What would prove this?**
- Compare the `region` variable visible inside the closure
- With what the config file *currently* contains

</details>

<details>
<summary>🔍 Reveal: Investigation Commands</summary>

**CLI**:
```bash
# What region does the closure see?
vscb script run debug.evaluate --param expression="region"

# What does the file ACTUALLY say right now?
vscb script run debug.evaluate --param expression="load_settings(settings_path)['region']"
```

**MCP**:
```typescript
await debug_evaluate({ expression: "region" });
await debug_evaluate({ expression: "load_settings(settings_path)['region']" });
```

</details>

<details>
<summary>📊 Reveal: Expected Results</summary>

You should see:
- `region` → `'US'` (the captured value from first call)
- `load_settings(...)['region']` → `'EU'` (current file contents)

**The smoking gun**: Two different answers for "what's the region?"

</details>

<details>
<summary>💡 Reveal: The Insight</summary>

**Root cause**: Closure variable capture at factory creation time.

When `make_tax_rate_provider(settings_path)` runs the first time:
1. It loads settings → `region = 'US'`
2. The inner `rate()` function *closes over* that specific `region` variable
3. The `rate()` function is returned and saved

When we call `calculate_total` the SECOND time:
- We call `make_tax_rate_provider` again (but the settings are cached - see Stop 1!)
- Even if we got fresh settings, the `region` was captured at creation time
- The closure doesn't re-evaluate `settings.get("region")` each call

**Why debugging reveals this instantly**:
Static reading shows `region = settings.get("region")` and makes you think
"it reads the region." Only at runtime can you see the closure captured a
*value*, not a *reference to live data*.

**The fix** (optional to show):
```python
def make_tax_rate_provider(settings_path: str) -> Callable[[], float]:
    def rate() -> float:
        settings = load_settings(settings_path)  # Fresh read each call
        region = settings.get("region", "US")
        return 0.07 if region == "US" else 0.20
    return rate
```

</details>

**Continue**:
```bash
vscb script run debug.continue
```

---

## Stop 3: checkout.py — Step Into the Decorator

### 🤔 The Mystery

We're about to check if the SALES feature flag is enabled. The environment variable was changed
from `"0"` to `"1"` between calls. Will the decorator see the new value?

**Before continuing, think**:
- What does `@lru_cache` do when a function is called?
- Could the decorator be returning a cached result?
- How would we prove whether this is a cache hit or miss?

<details>
<summary>🎯 Reveal: Hypothesis</summary>

**Hypothesis**: The `@lru_cache` decorator is returning a cached result from the
first call, ignoring the environment variable change.

**What would prove this?**
- Step INTO the `flag_enabled()` call
- Check if we land in the cache wrapper or the function body
- Inspect `flag_enabled.cache_info()` to see hit/miss statistics
- Compare cached result with current environment variable

</details>

<details>
<summary>🔍 Reveal: Investigation Commands</summary>

**CLI**:
```bash
# Step into the call; you'll land inside functools' lru wrapper on a cache hit
vscb script run debug.step-into

# Show this is a cache hit and the env is different now
vscb script run debug.evaluate --param expression="flag_enabled.cache_info()"
vscb script run debug.evaluate --param expression="__import__('os').getenv('FEATURE_SALES')"

# Optional: prove causality by clearing the cache without changing code
# vscb script run debug.evaluate --param expression="flag_enabled.cache_clear()"
```

**MCP**:
```typescript
await debug_step_into({});
await debug_evaluate({ expression: "flag_enabled.cache_info()" });
await debug_evaluate({ expression: "__import__('os').getenv('FEATURE_SALES')" });
```

</details>

<details>
<summary>📊 Reveal: Expected Results</summary>

After stepping in:
- You land inside `functools.py` (the lru_cache wrapper), NOT your function body
- BP4 at line 17 in `flags.py` does NOT fire (cache hit short-circuits your code)

After evaluating:
- `cache_info()` shows `hits=1, misses=1, maxsize=None, currsize=1`
- `os.getenv('FEATURE_SALES')` returns `'1'` (current environment)
- But the cached function returns `False` (from when env was `'0'`)

</details>

<details>
<summary>💡 Reveal: The Insight</summary>

**Root cause**: `@lru_cache` on a function that reads `os.environ`.

The decorator caches based on function *arguments*, not external state. When you call
`flag_enabled("SALES")` the second time with the same argument, it returns the cached
result without re-executing the function body.

The environment variable has changed, but the decorator doesn't know that!

**Why debugging reveals this instantly**:
- Stepping INTO doesn't reach your function body (smoking gun!)
- `cache_info()` explicitly shows the hit
- You can compare cached behavior vs current environment in real-time

**What to point out**: This is the power of `debug.evaluate` - you can call ANY Python
expression, including introspecting decorator internals that aren't visible in code.

**The fix** (optional to show):
```python
# Option 1: Don't cache environment-derived values
def flag_enabled(name: str) -> bool:
    raw = os.getenv(f"FEATURE_{name.upper()}", "0")
    return raw not in ("0", "", "false", "False")

# Option 2: Clear cache when environment changes (demo-able live)
# In test: after changing env, call flag_enabled.cache_clear()
```

</details>

**Continue**:
```bash
vscb script run debug.continue
```

---

## Stop 4: Back in the Test — The Mismatch

At this point, the test will continue to the assertion and fail. You can inspect the final values:

```bash
# Compare what the test expected vs what actually happened
vscb script run debug.evaluate --param expression="total2"
vscb script run debug.evaluate --param expression="expected"
```

You'll see `total2` is still 214.0 (US 7% tax, no discount), despite the file/env changes.

---

## Troubleshooting

### BP1 Never Fires

**Problem**: Conditional breakpoint `abspath in cache` is False.

**Solution**:
- Verify first call (around line 47 in test) completed successfully
- Try without condition first: remove `--param condition="..."`
- Check test reached first `calculate_total` before second call

### Can't Step Into @lru_cache Wrapper

**Problem**: Step-into jumps directly to function body, skipping decorator.

**Solution**: Set `"justMyCode": false` in launch.json or Python extension settings:

```json
{
  "name": "Python: Debug Tests",
  "type": "debugpy",
  "request": "launch",
  "justMyCode": false  // Shows decorator wrappers
}
```

### Line Numbers Don't Match

**Problem**: Breakpoints miss targets because line numbers shifted.

**Solution**: Look for inline `# <-- BPx` markers in source files:
- BP1: Line with `if abspath in cache:`
- BP2: Line with `return 0.07 if region...`
- BP3: Line with `if flag_enabled("SALES"):`
- BP4: Line with `return raw not in...`

---

## Key Takeaways

**Runtime state beats static guesses**: You don't have to hypothesize about "maybe a cache?" -
you inspect `cache`, `region`, and `cache_info()` live.

**Breakpoints + continue keep focus**: A single test, one line, and four strategic breakpoints
walk you straight to the root causes.

**Step-in exposes indirection**: You literally see the `lru_cache` wrapper intercept calls,
explaining why your own breakpoint doesn't fire.

**`debug.evaluate` is a superpower**: Compare closure-captured variables to freshly computed
values, peek into decorator caches, and validate hypotheses instantly.

---

## Talking Points (For Presentations)

1. **Most bugs aren't loud** - They're quiet, obvious in hindsight, invisible until runtime
2. **Three layers of staleness** - Cache, closure, decorator - each in a different module
3. **Breakpoint ladder pattern** - Entry, decision, mutation, boundary - systematic investigation
4. **Collaborative debugging** - Agent sets rails (breakpoints, commands), human sees same view
5. **Evidence over guessing** - Every assertion backed by runtime evaluation

---

## Optional: Showing the Fixes

If time permits in your presentation, you can demonstrate the fixes:

**Fix 1: Mutable default** (config.py):
```python
def load_settings(path: str, cache: Dict[str, Dict[str, Any]] = None):
    if cache is None:
        cache = {}
    # rest stays the same
```

**Fix 2: Closure capture** (tax.py):
```python
def make_tax_rate_provider(settings_path: str):
    def rate() -> float:
        settings = load_settings(settings_path)  # Re-read each time
        region = settings.get("region", "US")
        return 0.07 if region == "US" else 0.20
    return rate
```

**Fix 3: Cached environment** (flags.py):
```python
# Remove @lru_cache decorator entirely, or:
# Call flag_enabled.cache_clear() after env changes in test
```

After applying fixes, re-run the test to show it passes:
```bash
pytest /workspaces/vscode-bridge/test/integration-simple/python/demo_shop/test_checkout_demo.py -v
```

---

## Summary

This compact scenario reliably fails on the second call and is nearly impossible to "reason out"
perfectly without a debugger. It demonstrates why giving an AI agent (or human developer) full
debugging controls—breakpoints, single-test runs, step controls, and `debug.evaluate`—is such
a force multiplier for understanding complex state bugs.

**The difference between a hunch and a fix is one `evaluate` away.**
