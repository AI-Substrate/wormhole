Below is a compact, multi-file Python project that *intentionally* mixes three “invisible state” bugs that are painful to isolate by static reading alone but become trivial once you can pause, step, and evaluate expressions with your VSC‑Bridge debugger:

* **A mutable-default cache** that survives across calls (`config.py`)
* **An `lru_cache`-decorated feature flag** that silently ignores later env changes (`flags.py`)
* **A closure that captures stale configuration**, so the tax region never updates (`tax.py`)

Together they make a second test call “mysteriously” ignore an edited config file and a flipped environment flag. You can then showcase: set breakpoints, run *one* test at *one* line, *continue*, *step in*, and use **debug.evaluate** to prove where the stale state lives.

---

## Project layout

```
vsc-bridge-toy/
├─ shop/
│  ├─ __init__.py
│  ├─ config.py         # mutable default cache bug
│  ├─ flags.py          # lru_cache hides env changes
│  ├─ tax.py            # closure captures stale region
│  └─ checkout.py       # coordinates everything
├─ tests/
│  └─ test_checkout.py  # a single failing scenario
└─ .vscode/
   └─ launch.json       # optional; adjust to your Python/pytest path
```

---

## Files (copy verbatim)

**shop/**init**.py**

```python
# empty on purpose
```

**shop/config.py**  *(mutable default cache; breakpoint target BP1 at line 31)*

```python
# shop/config.py
import os
from typing import Dict, Any

def _parse_kv(text: str) -> Dict[str, Any]:
    settings: Dict[str, Any] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        k, v = [p.strip() for p in line.split(":", 1)]
        low = v.lower()
        if low in ("true", "false"):
            settings[k] = (low == "true")
            continue
        try:
            settings[k] = float(v) if "." in v else int(v)
            continue
        except ValueError:
            settings[k] = v
    return settings

def load_settings(path: str, cache: Dict[str, Dict[str, Any]] = {}) -> Dict[str, Any]:
    """
    Tiny YAML-like loader with a subtle bug: the default `cache` dict is mutable
    and persists across calls, so values survive file changes between calls.
    """
    abspath = os.path.abspath(path)
    if abspath in cache:                           # <-- BP1: see stale cache
        return cache[abspath]
    with open(abspath, "r", encoding="utf8") as f:
        text = f.read()
    settings = _parse_kv(text)
    cache[abspath] = settings
    return settings
```

**shop/flags.py**  *(lru_cache; you’ll step into wrapper & use `debug.evaluate`; BP2 at line 11)*

```python
# shop/flags.py
import os
from functools import lru_cache

@lru_cache(maxsize=None)
def flag_enabled(name: str) -> bool:
    """Environment flags like FEATURE_SALES=1.
    BUG DEMO: lru_cache hides changes to the environment within a process.
    """
    raw = os.getenv(f"FEATURE_{name.upper()}", "0")
    return raw not in ("0", "", "false", "False")  # <-- BP2: step into wrapper here, then eval flag_enabled.cache_info()
```

**shop/tax.py**  *(closure captures stale region from file; BP3 at line 10)*

```python
# shop/tax.py
from typing import Callable
from .config import load_settings

def make_tax_rate_provider(settings_path: str) -> Callable[[], float]:
    settings = load_settings(settings_path)
    region = settings.get("region", "US")  # captured by closure!
    def rate() -> float:
        _ = settings_path  # keep settings_path in the closure for debug.eval comparisons
        # <-- BP3: inspect captured `region` vs current file contents
        return 0.07 if region == "US" else 0.20
    return rate

def iter_line_totals(cart, rate_fn: Callable[[], float]):
    for item in cart:
        price = item["price"] * item["qty"]
        yield price * (1 + rate_fn())
```

**shop/checkout.py**  *(where you’ll step into `flag_enabled` and eval cache_info; BP4 at line 12)*

```python
# shop/checkout.py
from .config import load_settings
from .flags import flag_enabled
from .tax import make_tax_rate_provider, iter_line_totals

def calculate_total(cart, settings_path: str) -> float:
    settings = load_settings(settings_path)
    rate_fn = make_tax_rate_provider(settings_path)
    total = 0.0
    for line_total in iter_line_totals(cart, rate_fn):
        total += line_total
    if flag_enabled("SALES"):                       # <-- BP4: step in, then debug.evaluate("flag_enabled.cache_info()")
        total *= (1 - float(settings.get("discount_rate", 0.0)))
    return round(total, 2)
```

**tests/test_checkout.py**  *(single failing scenario; “debug single” target BP5 at line 31)*

```python
# tests/test_checkout.py
import os
from pathlib import Path

from shop.checkout import calculate_total

def write_settings(path: Path, *, region: str, discount_rate: float):
    path.write_text(f"""
# toy settings (not real YAML)
region: {region}
discount_rate: {discount_rate}
""".strip())

def test_total_changes_when_env_and_file_change(tmp_path: Path):
    cfg = tmp_path / "settings.yml"
    cart = [
        {"price": 100.0, "qty": 1},
        {"price": 50.0, "qty": 2},
    ]

    # First run: US region, feature off, 10% discount (but feature is off so ignored)
    write_settings(cfg, region="US", discount_rate=0.10)
    os.environ["FEATURE_SALES"] = "0"
    total1 = calculate_total(cart, str(cfg))
    assert total1 == 100.0*1*1.07 + 50.0*2*1.07  # 07% US tax, no discount

    # Second run: change both file and env, expect higher tax and then 50% discount
    write_settings(cfg, region="EU", discount_rate=0.50)
    os.environ["FEATURE_SALES"] = "1"
    # Place the cursor on the next line and run `tests.debug-single`:
    total2 = calculate_total(cart, str(cfg))  # <-- BP5 (tests.debug-single line)
    # We expect EU tax (20%) and then 50% off the taxed total:
    expected = (100.0*1*1.20 + 50.0*2*1.20) * 0.50
    assert round(total2, 2) == round(expected, 2)
```

**.vscode/launch.json** *(optional; adjust `program`/`args` to your environment)*

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Pytest: Debug current file",
      "type": "python",
      "request": "launch",
      "program": "${workspaceFolder}/.venv/bin/pytest",
      "args": ["-k", "${fileBasenameNoExtension}::", "-q"],
      "console": "integratedTerminal",
      "justMyCode": false
    }
  ]
}
```

---

## Why this is hard without a debugger

* The **file clearly changes** between calls, yet `load_settings` returns the **old content** (hidden mutable-default cache).
* The **environment flag flips**, yet `flag_enabled("SALES")` keeps returning the **old value** (`lru_cache` on a function that *reads* `os.environ`).
* The **tax region looks like it should follow the file**, yet the closure **captured** the **old region** value.

Static reading makes each call look idempotent and fresh; only at runtime do you see the staleness.

---

## Breakpoint lines (verbatim files above)

| File                     | Put breakpoint at line                     |
| ------------------------ | ------------------------------------------ |
| `shop/config.py`         | **31** (BP1)                               |
| `shop/flags.py`          | **11** (BP2)                               |
| `shop/tax.py`            | **10** (BP3)                               |
| `shop/checkout.py`       | **12** (BP4)                               |
| `tests/test_checkout.py` | **31** (BP5 – use tests.debug-single here) |

> If you edit whitespace/comments, line numbers will shift—use the inline `# <-- BPx` markers to re-target.

---

## VSC‑Bridge walkthrough (CLI)

**Start fresh**

```bash
# optional, but keeps the demo clean
vscb script run breakpoint.clear.project
```

**Set the breakpoints**

```bash
vscb script run breakpoint.set --param path="$(pwd)/shop/config.py"   --param line=31 --param condition="abspath in cache"
vscb script run breakpoint.set --param path="$(pwd)/shop/tax.py"      --param line=10
vscb script run breakpoint.set --param path="$(pwd)/shop/checkout.py" --param line=12
vscb script run breakpoint.set --param path="$(pwd)/shop/flags.py"    --param line=11
```

* Note the **condition** on the config breakpoint — it only triggers on the **second** call *after* the cache is populated. That keeps the first run noise-free.

**Run exactly one test at exactly one line**

```bash
vscb script run tests.debug-single \
  --param path="$(pwd)/tests/test_checkout.py" \
  --param line=31
```

> From here, you’ll pause on each hit in sequence. Use the following commands at each stop.

---

### Stop 1 — `shop/config.py` line 31 (BP1): prove the hidden cache

```bash
# See locals (abspath, cache, etc.)
vscb script run debug.list-variables --param scope=local

# Prove we are hitting the cached path and what's inside
vscb script run debug.evaluate --param expression="abspath"
vscb script run debug.evaluate --param expression="list(cache.keys())"
vscb script run debug.evaluate --param expression="cache[abspath]"

# Step over and continue to next breakpoint
vscb script run debug.step-over
vscb script run debug.continue
```

**What to point out**: the `cache` default persists across calls; you can even `debug.evaluate` `id(cache)` to show it’s the **same dict**.

---

### Stop 2 — `shop/tax.py` line 10 (BP3): prove the stale closure

```bash
# The region captured by the closure...
vscb script run debug.evaluate --param expression="region"  # likely 'US'

# ...vs re-reading the file *right now* via the outer reference we captured for demo
vscb script run debug.evaluate --param expression="load_settings(settings_path)['region']"  # likely 'EU'

# This contrast is almost impossible to be sure of without runtime evaluation.
vscb script run debug.continue
```

---

### Stop 3 — `shop/checkout.py` line 12 (BP4): step into the feature flag

```bash
# Step into the call site; you'll land inside functools' lru wrapper, not your function body, on a cache hit.
vscb script run debug.step-into

# Show this is a cache hit and the env is different now
vscb script run debug.evaluate --param expression="flag_enabled.cache_info()"
vscb script run debug.evaluate --param expression="__import__('os').getenv('FEATURE_SALES')"

# Optional: prove causality by clearing the cache *without* changing code, then continuing
# vscb script run debug.evaluate --param expression="flag_enabled.cache_clear()"

vscb script run debug.continue
```

**What to point out**: stepping into *doesn’t* reach your function body on a cache hit (your BP2 won’t fire). That’s the smoking gun — and `debug.evaluate("flag_enabled.cache_info()")` makes it explicit.

---

### Stop 4 — back in the test around BP5: inspect the mismatch

```bash
# Compare what the test expected vs what actually happened
vscb script run debug.evaluate --param expression="total2"
vscb script run debug.evaluate --param expression="expected"
```

You’ll see `total2` still matches the **US 7%** total with **no discount**, despite the file/env changes.

---

## (Optional) MCP flavor

If you’re driving this from an AI agent via MCP, the same flow translates cleanly:

```ts
// start clean
await breakpoint_clear_project();

// set breakpoints
await breakpoint_set({ path: `${workspace}/shop/config.py`, line: 31, condition: "abspath in cache" });
await breakpoint_set({ path: `${workspace}/shop/tax.py`,    line: 10 });
await breakpoint_set({ path: `${workspace}/shop/checkout.py`, line: 12 });
await breakpoint_set({ path: `${workspace}/shop/flags.py`,   line: 11 });

// run exactly one test at a specific line
await test_debug_single({ path: `${workspace}/tests/test_checkout.py`, line: 31 });

// when paused at config.py
await debug_evaluate({ expression: "list(cache.keys())" });
await debug_evaluate({ expression: "cache[abspath]" });
await debug_continue({});

// at tax.py
await debug_evaluate({ expression: "region" });
await debug_evaluate({ expression: "load_settings(settings_path)['region']" });
await debug_continue({});

// at checkout.py -> step into flag call and inspect
await debug_step_into({});
await debug_evaluate({ expression: "flag_enabled.cache_info()" });
await debug_evaluate({ expression: "__import__('os').getenv('FEATURE_SALES')" });
await debug_continue({});
```

---

## What this demo proves (talking points)

* **Runtime state beats static guesses.** You don’t have to hypothesize about “maybe a cache?” — you inspect `cache`, `region`, and `cache_info()` live.
* **Breakpoints + continue keep focus.** A single test, one line, and three strategic BPs walk you straight to the root causes.
* **Step-in exposes indirection.** You literally see the `lru_cache` wrapper intercept calls, explaining why your own breakpoint doesn’t fire.
* **`debug.evaluate` is a superpower.** Compare closure-captured variables to freshly computed values, peek into decorator caches, and validate hypotheses instantly.

---

## If you want to show quick fixes (optional)

* Replace the mutable default: `cache=None` then `cache = {} if cache is None else cache`.
* Don’t cache env-derived flags, or incorporate the env value into the cache key, or call `flag_enabled.cache_clear()` when env changes (demo-able live).
* Build the tax function to read the region each call (or provide a reload path) instead of capturing it once.

This compact scenario reliably fails on the second call and is nearly impossible to “reason out” perfectly without a debugger — perfect for demonstrating why giving an LLM agent full debugging controls (breakpoints, single-test runs, step controls, and `debug.evaluate`) is such a force multiplier.
