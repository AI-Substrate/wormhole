# Demo Shop - Invisible State Debugging Scenario

Quick-start guide for the VSC-Bridge debugging demonstration.

## What Is This?

A Python shopping cart with **three intentional bugs** designed to showcase VSC-Bridge debugging capabilities. The bugs are "invisible" during static code review but become obvious with runtime debugging.

## Prerequisites

- Python 3.8+
- pytest 5.0+
- VSC-Bridge extension running

## Quick Start

1. **Run the failing test**:
   ```bash
   cd /workspaces/vscode-bridge/test/integration-simple/python
   pytest demo_shop/test_checkout_demo.py -v
   ```

2. **Set breakpoints and debug**:
   ```bash
   vscb script run breakpoint.clear.project
   vscb script run breakpoint.set --param path=$(pwd)/demo_shop/config.py --param line=37 --param condition="abspath in cache"
   vscb script run breakpoint.set --param path=$(pwd)/demo_shop/tax.py --param line=20
   vscb script run breakpoint.set --param path=$(pwd)/demo_shop/checkout.py --param line=22
   vscb script run breakpoint.set --param path=$(pwd)/demo_shop/flags.py --param line=17
   vscb script run tests.debug-single --param path=$(pwd)/demo_shop/test_checkout_demo.py --param line=30
   ```

3. **Investigate at each stop** using `debug.evaluate`, `debug.step-into`, and `debug.continue`

## The Bugs

1. **config.py** - Mutable default cache (`cache={}`) persists across calls
2. **tax.py** - Closure captures `region` at creation time, never updates
3. **flags.py** - `@lru_cache` decorator caches environment variable reads

## Full Walkthrough

For the complete progressive revelation walkthrough with detailed commands and explanations:

**[📖 See docs/how/scenarios/invisible-state-debugging.md](/workspaces/vscode-bridge/docs/how/scenarios/invisible-state-debugging.md)**

## Files

- `config.py` - Settings loader (BP1 at line 37)
- `flags.py` - Feature flags (BP4 at line 17)
- `tax.py` - Tax rate provider (BP2 at line 20)
- `checkout.py` - Integration module (BP3 at line 22)
- `test_checkout_demo.py` - Failing test
