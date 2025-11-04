# VSC-Bridge Interactive Debugging Demonstration Scenario Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2025-11-04
**Spec**: [example-scenario-spec.md](./example-scenario-spec.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 0: Project Setup & Validation](#phase-0-project-setup--validation)
   - [Phase 1: Demo Module Implementation](#phase-1-demo-module-implementation)
   - [Phase 2: Test Harness Implementation](#phase-2-test-harness-implementation)
   - [Phase 3: Progressive Revelation Walkthrough](#phase-3-progressive-revelation-walkthrough)
   - [Phase 4: Manual Validation & Integration](#phase-4-manual-validation--integration)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Progress Tracking](#progress-tracking)
8. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem Statement**: New users and stakeholders struggle to understand VSC-Bridge's value proposition without hands-on experience. Existing documentation explains WHAT the tools do, but doesn't demonstrate WHY runtime debugging beats static analysis for certain bug classes.

**Solution Approach**:
- Create a realistic Python shopping cart scenario with three intentional "invisible state" bugs
- Provide a progressive revelation walkthrough that teaches debugging methodology
- Support both CLI (`vscb`) and MCP tool workflows
- Enable self-paced learning and live presentations from a single document

**Expected Outcomes**:
- New users complete the scenario in under 15 minutes
- Users understand when to use breakpoints, stepping, and `debug.evaluate`
- Presenters can demonstrate VSC-Bridge capabilities in under 10 minutes
- AI agent developers learn collaborative debugging patterns

**Success Metrics**:
- Scenario runs reliably without environment-specific failures
- Walkthrough commands execute without modification
- Progressive revelation structure enables both learning modes
- Line number validation prevents documentation drift

---

## Technical Context

### Current System State

The VSC-Bridge test infrastructure includes:
- Python test workspace at `/workspaces/vscode-bridge/test/python/`
- Pytest configuration in `test/pytest.ini` and `test/python/.vscode/settings.json`
- Existing integration tests: `test_example.py`, `sample.py`
- VS Code Test UI integration via Python extension
- CLI debugging via `vscb script run` commands
- MCP tools for AI agent debugging workflows

### Integration Requirements

The demonstration scenario must:
- Coexist with existing Python tests without conflicts
- Be discoverable by pytest and VS Code Test UI
- Work with both Extension Host (test workspace) and CLI workflows
- Support conditional breakpoints, stepping, and expression evaluation
- Run reliably across multiple executions without state leakage

### Constraints and Limitations

**Technical Constraints**:
- Python 3.8+ required (for `lru_cache` introspection)
- pytest 5.0+ required (for `tmp_path` fixture)
- No external pip dependencies beyond pytest
- Must use absolute paths for portability
- Line numbers must be validated against breakpoint markers

**Project Constraints**:
- Documentation lives in `docs/how/scenarios/` (not test directory)
- Module naming uses `demo_shop/` prefix (explicit demo marker)
- No automated tests for demo code (it IS the test harness)
- Manual validation only

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Pytest Naming Convention for Test Discovery
**Impact**: Critical
**Sources**: [S1-02] (pattern analyst)
**Problem**: Pytest discovery is configured with strict patterns: `test_*.py` for files, `Test*` for classes, `test_*` for functions. Files not matching these patterns won't appear in VS Code Test UI, breaking the "click debug test in gutter" acceptance criterion.
**Root Cause**: Pytest uses naming conventions for auto-discovery rather than explicit test registration.
**Solution**: Name the test file `test_checkout_demo.py` (not `checkout_test.py` or `demo_test.py`) and ensure all test functions use `test_` prefix.
**Example**:
```python
# ❌ WRONG - Won't be discovered
demo_shop/checkout_test.py
demo_shop/demo_checkout.py

# ✅ CORRECT - Matches pytest discovery pattern
demo_shop/test_checkout_demo.py

def test_total_changes_when_env_and_file_change():  # ✅
def checkout_test():  # ❌ Missing test_ prefix
```
**Action Required**: Verify test discovery works: `python3 -m pytest --collect-only test/python/demo_shop/`
**Affects Phases**: Phase 2

---

### 🚨 Critical Discovery 02: lru_cache Persists Across Tests Without Explicit Clear
**Impact**: Critical
**Sources**: [S2-03] (technical investigator)
**Problem**: Functions decorated with `@lru_cache` maintain cached results across test boundaries. Running the test multiple times in the same pytest session causes flaky behavior where the second run sees cached values from the first run.
**Root Cause**: `functools.lru_cache` creates module-level cache that persists for Python process lifetime.
**Solution**: Add `autouse=True` pytest fixture to call `flag_enabled.cache_clear()` after each test.
**Example**:
```python
# ❌ WRONG - Cache survives across test runs
@lru_cache(maxsize=None)
def flag_enabled(name: str) -> bool:
    return os.getenv(f"FEATURE_{name}", "0") != "0"
# Running test twice: first run caches, second run gets stale cache

# ✅ CORRECT - Clear cache after each test
@pytest.fixture(autouse=True)
def clear_caches():
    yield  # Run test first
    from demo_shop.flags import flag_enabled
    flag_enabled.cache_clear()
```
**Action Required**: Add fixture to `test_checkout_demo.py` or `conftest.py`
**Affects Phases**: Phase 2

---

### 🚨 Critical Discovery 03: Environment Variable Cleanup Required
**Impact**: Critical
**Sources**: [S2-02] (technical investigator), [S3-05] (discovery documenter)
**Problem**: Direct modifications to `os.environ` persist across tests. Setting `FEATURE_SALES=1` in one test run leaves it set for subsequent runs, potentially masking the `lru_cache` bug.
**Root Cause**: `os.environ` is a global mutable dict-like object.
**Solution**: Use pytest's `monkeypatch` fixture with `autouse=True` for automatic cleanup.
**Example**:
```python
# ❌ WRONG - Changes persist to next test
def test_demo(tmp_path):
    os.environ["FEATURE_SALES"] = "1"
    # FEATURE_SALES still set after test!

# ✅ CORRECT - monkeypatch auto-cleans
def test_demo(tmp_path, monkeypatch):
    monkeypatch.setenv("FEATURE_SALES", "1")
    # Auto-removed after test
```
**Action Required**: Use `monkeypatch` fixture in test implementation
**Affects Phases**: Phase 2

---

### 🚨 Critical Discovery 04: justMyCode=false Required for Stepping Into Decorators
**Impact**: High
**Sources**: [S2-04] (technical investigator)
**Problem**: VS Code Python debugger with `justMyCode: true` (default) skips library code including `functools`. Stepping into `@lru_cache` decorated functions jumps directly to function body, hiding the cache wrapper that demonstrates the bug.
**Root Cause**: `justMyCode` filters out standard library modules.
**Solution**: Document that users may need to set `"justMyCode": false` in their launch configuration to see decorator wrappers.
**Example**:
```json
// Add to walkthrough troubleshooting section
{
  "name": "Python: Debug Tests",
  "type": "debugpy",
  "request": "launch",
  "justMyCode": false  // Shows decorator wrappers
}
```
**Action Required**: Add troubleshooting section to walkthrough documentation
**Affects Phases**: Phase 3

---

### 🚨 Critical Discovery 05: CLI vs MCP Parity Validation Gap
**Impact**: Critical
**Sources**: [S3-04] (discovery documenter)
**Problem**: The spec assumes CLI and MCP commands produce identical behavior, but there's no validation plan. MCP tools use async TypeScript, CLI uses bash subprocess. Timing, error handling, or parameter serialization bugs could cause divergent behavior.
**Root Cause**: Two different execution paths with no parity testing.
**Solution**: Add manual MCP validation to testing checklist: run complete scenario via CLI (baseline), then via MCP (parity check), verify identical output.
**Action Required**: Include MCP validation in Phase 4 manual testing
**Affects Phases**: Phase 4

---

### ⚠️ High Impact Discovery 06: Line Number Fragility Requires Validation
**Impact**: High
**Sources**: [S3-01] (discovery documenter)
**Problem**: Scenario relies on exact line numbers for breakpoints (BP1=31, BP2=11, etc.). Any code changes (comments, whitespace) invalidate documented commands. Inline `# <-- BPx` markers mitigate this but don't prevent drift.
**Root Cause**: Documentation specifies line numbers that become stale when code changes.
**Solution**: Implement validation script that parses files for `# <-- BPx` markers and reports current line numbers vs documented numbers.
**Example**:
```python
# Validation script
def validate_breakpoint_lines():
    files = {
        "demo_shop/config.py": {"BP1": "abspath in cache"},
        # ...
    }
    for filepath, markers in files.items():
        # Parse file, find markers, report line numbers
```
**Action Required**: Create validation script in Phase 4
**Affects Phases**: Phase 4

---

### ⚠️ High Impact Discovery 07: Flat Module Structure Convention
**Impact**: High
**Sources**: [S1-01] (pattern analyst)
**Problem**: Test/python/ uses flat structure with source modules and tests at same level, no deep nesting. Violating this pattern creates confusion.
**Root Cause**: Existing test organization uses simple flat layout.
**Solution**: Place all demo_shop files directly in `test/python/demo_shop/` without src/ or lib/ subdirectories.
**Example**:
```bash
# ❌ WRONG - Nested structure
test/python/demo_shop/src/config.py
test/python/demo_shop/tests/test_checkout.py

# ✅ CORRECT - Flat structure
test/python/demo_shop/config.py
test/python/demo_shop/test_checkout_demo.py
```
**Action Required**: Follow flat structure in Phase 1
**Affects Phases**: Phase 1

---

### ⚠️ High Impact Discovery 08: Package Structure Requires __init__.py
**Impact**: High
**Sources**: [S1-05, S4-05] (pattern analyst + dependency mapper)
**Problem**: The scenario uses `from demo_shop.config import load_settings` imports. This requires demo_shop/ to be a proper Python package with `__init__.py`. However, existing test/python/ has NO `__init__.py` files anywhere.
**Root Cause**: Import statements need package structure, but existing tests are standalone scripts.
**Solution**: Create only `test/python/demo_shop/__init__.py` (empty file). Do NOT create `test/python/__init__.py`.
**Example**:
```python
# ✅ CORRECT - Package structure for imports
test/python/demo_shop/__init__.py  # Empty or minimal
test/python/demo_shop/config.py
# test_checkout_demo.py can now: from demo_shop.config import load_settings

# ❌ WRONG - Adding __init__.py to test root
test/python/__init__.py  # NOT needed, breaks pattern
```
**Action Required**: Create minimal `__init__.py` in Phase 1
**Affects Phases**: Phase 1

---

### ⚠️ High Impact Discovery 09: Documentation Structure - docs/how/scenarios/ New Pattern
**Impact**: High
**Sources**: [S1-08, S4-02] (pattern analyst + dependency mapper)
**Problem**: Project uses `docs/how/` for comprehensive guides with subdirectories like `dogfood/` and `semantic-versioning/`. No `docs/how/scenarios/` directory exists yet.
**Root Cause**: New category of documentation being introduced.
**Solution**: Create `docs/how/scenarios/` subdirectory following existing pattern. Place full walkthrough in `docs/how/scenarios/invisible-state-debugging.md` (300-500 lines based on existing guide lengths).
**Example**:
```bash
# ✅ CORRECT - New subdirectory pattern
docs/how/scenarios/invisible-state-debugging.md
docs/how/scenarios/README.md  # Optional index

# ❌ WRONG - Flat structure
docs/how/invisible-state-debugging-scenario.md
```
**Action Required**: Create subdirectory in Phase 3
**Affects Phases**: Phase 3

---

### 📋 Medium Impact Discovery 10: Progressive Revelation Presentation Mode
**Impact**: Medium
**Sources**: [S3-02] (discovery documenter)
**Problem**: Spec says "expand all spoilers beforehand" for presentations but doesn't specify HOW. Manually opening 15-20 `<details>` tags is error-prone.
**Root Cause**: HTML `<details>` elements are collapsed by default.
**Solution**: Include JavaScript snippet users can paste in browser console, plus CSS print media query.
**Example**:
```javascript
// Paste in browser console before presenting
document.querySelectorAll('details').forEach(d => d.open = true);
```
**Action Required**: Add to walkthrough header in Phase 3
**Affects Phases**: Phase 3

---

### 📋 Medium Impact Discovery 11: Version Prerequisites Documentation
**Impact**: Medium
**Sources**: [S3-06] (discovery documenter)
**Problem**: Spec assumes Python/pytest support but doesn't specify minimum versions. Key concerns: `lru_cache.cache_info()` requires Python 3.8+, `tmp_path` requires pytest 5.0+.
**Root Cause**: Implicit version assumptions.
**Solution**: Document minimum versions in prerequisites section.
**Action Required**: Add prerequisites to walkthrough in Phase 3
**Affects Phases**: Phase 3

---

### 📋 Medium Impact Discovery 12: Test Line Number Clarity for debug-single
**Impact**: High
**Sources**: [S3-07, S4-07] (discovery documenter + dependency mapper)
**Problem**: Documentation must clarify whether users target the test function definition line or the assertion line for `tests.debug-single`. CLAUDE.md says "test start line", but challenge.md implies BP5 is the target.
**Root Cause**: Ambiguous documentation about test vs breakpoint line numbers.
**Solution**: Use test function definition line (where `def test_...` appears) and document this explicitly with inline comments.
**Example**:
```python
# ✅ CORRECT - Clear guidance
def test_total_changes():  # <-- Line 152: tests.debug-single starts here
    # ...
    total2 = calculate_total()  # <-- BP1: Set breakpoint here (line 159)
```
**Action Required**: Document clearly in Phase 2 implementation and Phase 3 walkthrough
**Affects Phases**: Phase 2, Phase 3

---

### 📋 Medium Impact Discovery 13: Inline Breakpoint Markers Required
**Impact**: High
**Sources**: [S1-07] (pattern analyst)
**Problem**: Integration tests use inline comments like `# <-- BPx` to mark suggested breakpoint locations. Without these, users must manually count lines.
**Root Cause**: Line numbers are fragile; markers provide stable reference.
**Solution**: Add inline `# <-- BPx` markers with explanatory comments above each breakpoint location.
**Example**:
```python
# ✅ CORRECT - Clear markers
def calculate_total(cart, settings_path):
    # BP1: Inspect cache to see if settings are stale
    settings = load_settings(settings_path)  # <-- BP1

    # BP2: Check if tax_rate reflects current file contents
    rate_fn = make_tax_rate_provider(settings_path)  # <-- BP2
```
**Action Required**: Add markers during Phase 1 implementation
**Affects Phases**: Phase 1

---

### 📋 Low Impact Discovery 14: No launch.json Configuration Needed
**Impact**: Low
**Sources**: [S4-08] (dependency mapper)
**Problem**: Scenario doesn't need custom launch.json entries. The `tests.debug-single` workflow uses VS Code Testing API which auto-generates debug sessions.
**Root Cause**: Pytest debugging via Testing API, not standalone script execution.
**Solution**: Do NOT add Python launch configurations. Rely on `tests.debug-single` workflow.
**Action Required**: Confirm no launch.json changes needed
**Affects Phases**: None

---

### 📋 Low Impact Discovery 15: Standard Library Dependencies Only
**Impact**: Low
**Sources**: [S4-01] (dependency mapper)
**Problem**: All scenario modules require only Python standard library (`functools`, `os`, `pathlib`). Zero external pip dependencies beyond pytest.
**Root Cause**: Design decision to minimize setup friction.
**Solution**: Use only standard library features available in Python 3.8+.
**Action Required**: Verify no external imports during Phase 1
**Affects Phases**: Phase 1

---

## Testing Philosophy

### Testing Approach
**Selected Approach**: Manual Only (No Automated Tests)
**Rationale**: This is demonstration code with intentional bugs designed to teach debugging workflows. The scenario itself IS the test harness - users run a failing pytest test and debug it interactively. Automated tests would be testing the demo, not adding value.

### Manual Validation Strategy

**Focus Areas**:
- Manual verification that scenario runs successfully
- Validation that breakpoints trigger at marked locations
- Confirmation that `debug.evaluate` expressions produce expected results
- CLI and MCP parity testing

**Validation Checklist** (Phase 4):
1. **Environment Setup**: Verify Python 3.8+, pytest 5.0+, VSC-Bridge running
2. **Test Discovery**: Confirm VS Code Test UI shows demo test
3. **CLI Workflow**: Run complete scenario via `vscb` commands
4. **MCP Workflow**: Run complete scenario via MCP tools
5. **Breakpoint Accuracy**: Verify all breakpoints trigger at marked lines
6. **Expression Evaluation**: Confirm all `debug.evaluate` expressions work
7. **State Isolation**: Run test 3 times in sequence, verify consistent behavior
8. **Line Number Validation**: Run validation script to check marker accuracy

**Excluded from Scope**:
- Unit tests for demo_shop modules
- Integration tests for the scenario
- Automated validation of walkthrough steps
- Performance testing or benchmarking

---

## Implementation Phases

### Phase 0: Project Setup & Validation

**Objective**: Set up directory structure and validate project readiness

**Deliverables**:
- `test/python/demo_shop/` directory created
- `docs/how/scenarios/` directory created
- Prerequisites verified (Python 3.8+, pytest 5.0+)

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Python version incompatibility | Low | Medium | Document minimum versions clearly |
| Pytest configuration conflicts | Low | High | Test discovery validation after setup |

### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 0.1 | [ ] | Verify Python and pytest versions | Python >= 3.8, pytest >= 5.0 confirmed | - | Run `python --version` and `pytest --version` |
| 0.2 | [ ] | Create demo_shop directory structure | Directory exists: `test/python/demo_shop/` | - | Use mkdir -p for parent dirs |
| 0.3 | [ ] | Create scenarios documentation directory | Directory exists: `docs/how/scenarios/` | - | |
| 0.4 | [ ] | Verify VSC-Bridge bridge status | `vscb status` shows "Bridge connected" | - | Ensure extension running |
| 0.5 | [ ] | Check pytest discovery baseline | `pytest --collect-only test/python/` shows existing tests | - | Baseline before adding demo |

### Acceptance Criteria
- [ ] All directories created successfully
- [ ] Python and pytest meet minimum version requirements
- [ ] VSC-Bridge bridge is running and responsive
- [ ] Pytest can discover existing tests

---

### Phase 1: Demo Module Implementation

**Objective**: Implement the four Python modules with intentional bugs and inline breakpoint markers

**Deliverables**:
- `demo_shop/__init__.py` (empty package file)
- `demo_shop/config.py` (mutable default cache bug)
- `demo_shop/flags.py` (lru_cache decorator bug)
- `demo_shop/tax.py` (closure capture bug)
- `demo_shop/checkout.py` (integration module)
- All files have inline `# <-- BPx` markers

**Dependencies**: Phase 0 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Line numbers shift during edits | High | High | Add inline markers immediately; validate after each file |
| Import errors due to package structure | Medium | High | Test imports after creating __init__.py |
| Bugs too subtle or too obvious | Low | Medium | Manual validation with fresh eyes |

### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 1.1 | [ ] | Create demo_shop/__init__.py | File exists, empty or minimal content | - | Makes demo_shop importable as package |
| 1.2 | [ ] | Implement config.py with mutable default cache | File compiles, `load_settings()` function works, mutable default bug present | - | Include BP1 marker at cache hit line |
| 1.3 | [ ] | Add inline markers to config.py | Marker `# <-- BP1` present at line checking cache | - | Add explanatory comment above marker |
| 1.4 | [ ] | Implement flags.py with lru_cache decorator | File compiles, `flag_enabled()` function works with @lru_cache | - | Include BP2 marker at return statement |
| 1.5 | [ ] | Add inline markers to flags.py | Marker `# <-- BP2` present at return line | - | |
| 1.6 | [ ] | Implement tax.py with closure capture | `make_tax_rate_provider()` returns closure, captures region | - | Include BP3 marker inside closure |
| 1.7 | [ ] | Add inline markers to tax.py | Marker `# <-- BP3` present at tax rate return | - | |
| 1.8 | [ ] | Implement checkout.py integration module | `calculate_total()` function integrates all modules | - | Include BP4 marker at flag_enabled call |
| 1.9 | [ ] | Add inline markers to checkout.py | Marker `# <-- BP4` present at flag check | - | |
| 1.10 | [ ] | Test imports in Python REPL | All modules import without errors: `from demo_shop.config import load_settings` | - | Verify package structure works |

### Code Structure Reference

**demo_shop/config.py**:
```python
"""
Configuration loader with mutable default cache bug.
Demonstrates hidden state persistence across function calls.
"""
import os
from typing import Dict, Any

def _parse_kv(text: str) -> Dict[str, Any]:
    """Parse simple key:value format."""
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
    Load settings from file with mutable default cache bug.

    BUG: The default cache={} persists across calls!
    """
    abspath = os.path.abspath(path)
    # BP1: Inspect cache to see if settings are stale
    if abspath in cache:  # <-- BP1
        return cache[abspath]
    with open(abspath, "r", encoding="utf8") as f:
        text = f.read()
    settings = _parse_kv(text)
    cache[abspath] = settings
    return settings
```

**demo_shop/flags.py**:
```python
"""
Feature flags with lru_cache decorator bug.
Demonstrates cached environment variable reads.
"""
import os
from functools import lru_cache

@lru_cache(maxsize=None)
def flag_enabled(name: str) -> bool:
    """
    Check if feature flag is enabled via environment variable.

    BUG: lru_cache hides changes to os.environ!
    """
    raw = os.getenv(f"FEATURE_{name.upper()}", "0")
    # BP2: Check if flag reflects current environment
    return raw not in ("0", "", "false", "False")  # <-- BP2
```

**demo_shop/tax.py**:
```python
"""
Tax rate provider with closure capture bug.
Demonstrates stale variable capture in closures.
"""
from typing import Callable
from .config import load_settings

def make_tax_rate_provider(settings_path: str) -> Callable[[], float]:
    """
    Create tax rate function based on region from settings.

    BUG: Closure captures region at creation time, never updates!
    """
    settings = load_settings(settings_path)
    region = settings.get("region", "US")  # Captured once!

    def rate() -> float:
        _ = settings_path  # Keep in scope for debug.evaluate
        # BP3: Compare captured region vs current file contents
        return 0.07 if region == "US" else 0.20  # <-- BP3

    return rate

def iter_line_totals(cart, rate_fn: Callable[[], float]):
    """Calculate line totals with tax."""
    for item in cart:
        price = item["price"] * item["qty"]
        yield price * (1 + rate_fn())
```

**demo_shop/checkout.py**:
```python
"""
Checkout calculation integrating all buggy modules.
"""
from .config import load_settings
from .flags import flag_enabled
from .tax import make_tax_rate_provider, iter_line_totals

def calculate_total(cart, settings_path: str) -> float:
    """
    Calculate cart total with tax and optional discount.

    Integrates all three bugs: mutable cache, lru_cache, closure capture.
    """
    settings = load_settings(settings_path)
    rate_fn = make_tax_rate_provider(settings_path)

    total = 0.0
    for line_total in iter_line_totals(cart, rate_fn):
        total += line_total

    # BP4: Step into flag_enabled to see lru_cache wrapper
    if flag_enabled("SALES"):  # <-- BP4
        total *= (1 - float(settings.get("discount_rate", 0.0)))

    return round(total, 2)
```

### Acceptance Criteria
- [ ] All five Python files created and compilable
- [ ] Package structure allows imports: `from demo_shop.X import Y`
- [ ] All four `# <-- BPx` markers present with explanatory comments
- [ ] No external dependencies beyond standard library
- [ ] Code matches bug descriptions from spec

---

### Phase 2: Test Harness Implementation

**Objective**: Implement the failing pytest test with proper fixtures for state isolation

**Deliverables**:
- `test/python/demo_shop/test_checkout_demo.py` (failing test)
- `conftest.py` or autouse fixtures for cache/env cleanup
- Test discoverable by pytest and VS Code Test UI
- Clear inline documentation of test start line vs breakpoint lines

**Dependencies**: Phase 1 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Test isolation failures | High | High | Add autouse fixtures for cache_clear and env cleanup |
| pytest discovery fails | Medium | Critical | Verify naming follows test_*.py pattern |
| tmp_path conflicts in parallel runs | Low | Medium | Document serial execution requirement |

### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 2.1 | [ ] | Create test_checkout_demo.py skeleton | File exists with test function stub | - | Name must be test_*.py for discovery |
| 2.2 | [ ] | Implement write_settings helper function | Function writes settings file to tmp_path | - | Used to modify config between calls |
| 2.3 | [ ] | Implement test first call (baseline) | First calculate_total call with US/no-discount works | - | Sets baseline expectations |
| 2.4 | [ ] | Implement test second call (failing) | Second call modifies settings and env, fails assertion | - | This is where bugs manifest |
| 2.5 | [ ] | Add inline test start marker | Comment: `# <-- Line XXX: tests.debug-single starts here` at test def | - | Clarifies where to target debug-single |
| 2.6 | [ ] | Add cache cleanup fixture | autouse fixture calls flag_enabled.cache_clear() | - | Prevents lru_cache leakage between runs |
| 2.7 | [ ] | Add environment cleanup | Use monkeypatch fixture for FEATURE_SALES env var | - | Prevents os.environ leakage |
| 2.8 | [ ] | Verify pytest discovery | `pytest --collect-only` shows test_checkout_demo | - | Confirms naming convention works |
| 2.9 | [ ] | Verify VS Code Test UI discovery | Test appears in VS Code Test Explorer | - | Confirms integration works |
| 2.10 | [ ] | Run test to confirm failure | Test fails with expected assertion error | - | Validates bugs manifest correctly |

### Test Structure Reference

**test/python/demo_shop/test_checkout_demo.py**:
```python
"""
Demonstration test showing invisible state bugs.

This test intentionally fails to demonstrate three categories of hidden state:
1. Mutable default parameter cache (config.py)
2. LRU-cached environment variable (flags.py)
3. Closure-captured configuration (tax.py)
"""
import os
import pytest
from pathlib import Path
from demo_shop.checkout import calculate_total
from demo_shop.flags import flag_enabled

@pytest.fixture(autouse=True)
def clear_caches():
    """Clear lru_cache between test runs to ensure isolation."""
    yield  # Run test first
    flag_enabled.cache_clear()  # Clean up after

def write_settings(path: Path, *, region: str, discount_rate: float):
    """Write settings file in simple key:value format."""
    path.write_text(f"""
# Demo settings (not real YAML)
region: {region}
discount_rate: {discount_rate}
""".strip())

def test_total_changes_when_env_and_file_change(tmp_path: Path, monkeypatch):
    """
    Test that configuration and environment changes affect calculation.

    <-- Line XXX: Use this line for tests.debug-single

    This test FAILS because of three invisible state bugs. The second call
    should use EU tax (20%) and apply 50% discount, but instead it uses
    stale US tax (7%) with no discount.
    """
    cfg = tmp_path / "settings.yml"
    cart = [
        {"price": 100.0, "qty": 1},
        {"price": 50.0, "qty": 2},
    ]

    # First run: US region, feature off, 10% discount (ignored because feature off)
    write_settings(cfg, region="US", discount_rate=0.10)
    monkeypatch.setenv("FEATURE_SALES", "0")
    total1 = calculate_total(cart, str(cfg))

    # Expected: 100*1*1.07 + 50*2*1.07 = 107 + 107 = 214.0
    assert total1 == 214.0, f"First call baseline: expected 214.0, got {total1}"

    # Second run: change BOTH file and env, expect higher tax and then discount
    write_settings(cfg, region="EU", discount_rate=0.50)
    monkeypatch.setenv("FEATURE_SALES", "1")

    # <-- BP5: Set breakpoint here to inspect second call
    total2 = calculate_total(cart, str(cfg))

    # Expected: (100*1*1.20 + 50*2*1.20) * 0.50 = (120 + 120) * 0.50 = 120.0
    expected = (100.0 * 1 * 1.20 + 50.0 * 2 * 1.20) * 0.50

    # THIS ASSERTION FAILS: total2 is still 214.0 (same as first call)!
    assert round(total2, 2) == round(expected, 2), (
        f"Second call should reflect EU tax + discount: "
        f"expected {expected:.2f}, got {total2}"
    )
```

### Acceptance Criteria
- [ ] Test file created and pytest can discover it
- [ ] VS Code Test UI shows test in tree
- [ ] Test runs and fails with expected assertion error
- [ ] autouse fixtures prevent cache/env leakage between runs
- [ ] Inline markers clarify test start line vs breakpoint lines
- [ ] Test can be run 3 times in sequence with consistent failure

---

### Phase 3: Progressive Revelation Walkthrough

**Objective**: Create comprehensive walkthrough documentation with progressive revelation structure

**Deliverables**:
- `docs/how/scenarios/invisible-state-debugging.md` (300-500 lines)
- Progressive revelation structure with collapsible `<details>` sections
- CLI and MCP command examples at each breakpoint stop
- Presentation mode JavaScript snippet
- Prerequisites and version requirements

**Dependencies**: Phase 1 and Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Line numbers in docs drift from code | High | High | Reference validation script in intro |
| Commands don't execute as documented | Medium | High | Manual validation in Phase 4 |
| Progressive revelation structure confusing | Low | Medium | Follow established pattern with clear headings |

### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 3.1 | [ ] | Create docs/how/scenarios/ directory | Directory exists | - | |
| 3.2 | [ ] | Write walkthrough header and prerequisites | Prerequisites section lists Python 3.8+, pytest 5.0+, VSC-Bridge | - | Include version verification commands |
| 3.3 | [ ] | Add presentation mode JavaScript snippet | Code snippet to expand all `<details>` tags included | - | Paste in console: `document.querySelectorAll('details').forEach(...)` |
| 3.4 | [ ] | Write introduction and problem statement | Explains why these bugs are hard without debugging | - | 2-3 paragraphs, links to spec |
| 3.5 | [ ] | Document file structure and overview | Lists all demo_shop files with brief descriptions | - | Helps orient users before diving in |
| 3.6 | [ ] | Write breakpoint setup section | Shows CLI commands to set all 4 breakpoints | - | Include conditional breakpoint for BP1 |
| 3.7 | [ ] | Write debug-single launch section | Shows command to start test debugging at test line | - | Clarify test definition line vs assertion line |
| 3.8 | [ ] | Create Stop 1 progressive revelation (config.py) | Mystery → Hypothesis → Commands → Results → Insight structure | - | Use `<details>` tags for spoilers |
| 3.9 | [ ] | Create Stop 2 progressive revelation (tax.py) | Full progressive structure with code examples | - | |
| 3.10 | [ ] | Create Stop 3 progressive revelation (checkout.py) | Full progressive structure, include step-into guidance | - | Explain stepping into @lru_cache wrapper |
| 3.11 | [ ] | Create Stop 4 progressive revelation (flags.py) | Full progressive structure with cache_info() evaluation | - | |
| 3.12 | [ ] | Add MCP tool equivalents | Show MCP TypeScript calls alongside CLI commands | - | Parity with CLI examples |
| 3.13 | [ ] | Write troubleshooting section | Common issues: BP1 doesn't fire, justMyCode=true, line numbers shifted | - | Reference validation script |
| 3.14 | [ ] | Add talking points section | Key insights for presentations: runtime beats static, breakpoint ladder, debug.evaluate power | - | |
| 3.15 | [ ] | Create README.md in demo_shop directory | Brief quick-start, link to full walkthrough | - | < 50 lines, complements comprehensive guide |

### Walkthrough Structure Reference

**docs/how/scenarios/invisible-state-debugging.md**:
```markdown
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

For live presentations, expand all spoilers beforehand:

```javascript
// Paste in browser console
document.querySelectorAll('details').forEach(d => d.open = true);
```

---

## The Problem

[Introduction explaining the scenario, why it's hard without debugging, etc.]

---

## File Structure

- `demo_shop/config.py` - Settings loader with mutable default cache bug
- `demo_shop/flags.py` - Feature flags with lru_cache decorator bug
- `demo_shop/tax.py` - Tax rate provider with closure capture bug
- `demo_shop/checkout.py` - Integration module
- `test_checkout_demo.py` - Failing test demonstrating all three bugs

---

## Breakpoint Setup

Clear any existing breakpoints and set up our ladder:

```bash
# Optional: start clean
vscb script run breakpoint.clear.project

# BP1: Conditional - only fires on cache hit (second call)
vscb script run breakpoint.set \
  --param path="$(pwd)/python/demo_shop/config.py" \
  --param line=31 \
  --param condition="abspath in cache"

# BP2: Inside closure to inspect captured region
vscb script run breakpoint.set \
  --param path="$(pwd)/python/demo_shop/tax.py" \
  --param line=10

# BP3: At feature flag decision point
vscb script run breakpoint.set \
  --param path="$(pwd)/python/demo_shop/checkout.py" \
  --param line=12

# BP4: Inside flag_enabled return statement
vscb script run breakpoint.set \
  --param path="$(pwd)/python/demo_shop/flags.py" \
  --param line=11
```

---

## Launch Debug Session

Target the test DEFINITION line (where `def test_...` appears):

```bash
vscb script run tests.debug-single \
  --param path="$(pwd)/python/demo_shop/test_checkout_demo.py" \
  --param line=25  # Update to actual test definition line
```

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
```

</details>

<details>
<summary>📊 Reveal: Expected Results</summary>

You should see:
- `cache.keys()` shows the settings file path
- `cache[abspath]` shows `{'region': 'US', 'discount_rate': 0.1}`
- The cached region is STILL 'US' despite file now saying 'EU'

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

**Continue**:
```bash
vscb script run debug.continue
```

---

## Stop 2: tax.py — The Frozen Closure

[Similar progressive revelation structure...]

---

## Stop 3: checkout.py — Step Into the Decorator

[Similar progressive revelation structure with step-into guidance...]

---

## Stop 4: flags.py — The Cache Wrapper

[Similar progressive revelation structure with cache_info() evaluation...]

---

## Troubleshooting

### BP1 Never Fires

**Problem**: Conditional breakpoint `abspath in cache` is False.

**Solution**:
- Verify first call (line 162) completed successfully
- Try without condition first: remove `--param condition="..."`
- Check test reached first calculate_total before second call

### Can't Step Into @lru_cache Wrapper

**Problem**: Step-into jumps directly to function body, skipping decorator.

**Solution**: Set `"justMyCode": false` in launch.json or Python extension settings.

### Line Numbers Don't Match

**Problem**: Breakpoints miss targets because line numbers shifted.

**Solution**: Look for inline `# <-- BPx` markers in source files. Run validation
script to check current line numbers.

---

## Key Takeaways

[Talking points for presentations...]

```

### Acceptance Criteria
- [ ] Walkthrough document 300-500 lines
- [ ] All four breakpoint stops use progressive revelation structure
- [ ] CLI and MCP command examples provided
- [ ] Presentation mode JavaScript snippet included
- [ ] Prerequisites and troubleshooting sections complete
- [ ] demo_shop/README.md created with brief quick-start

---

### Phase 4: Manual Validation & Integration

**Objective**: Validate the complete scenario works via CLI and MCP, verify line numbers, test repeatability

**Deliverables**:
- Manual validation checklist completed
- Line number validation script
- CLI workflow verified
- MCP workflow verified
- State isolation confirmed

**Dependencies**: Phases 1, 2, and 3 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CLI/MCP behavior divergence | Medium | High | Side-by-side comparison testing |
| Line number drift undetected | Medium | High | Run validation script before approval |
| Flaky test behavior | Low | Medium | Run 5+ times to catch intermittent issues |

### Tasks

| #   | Status | Task | Success Criteria | Log | Notes |
|-----|--------|------|------------------|-----|-------|
| 4.1 | [ ] | Create line number validation script | Script parses files, finds BP markers, reports line numbers | - | Python or bash script |
| 4.2 | [ ] | Run validation script | All BP markers found, line numbers match documentation | - | Update docs if mismatches |
| 4.3 | [ ] | Verify test discovery | VS Code Test UI shows test_checkout_demo | - | Open test workspace in Extension Host |
| 4.4 | [ ] | Complete CLI workflow validation | Run all commands from walkthrough, reach all 4 stops | - | Document any command failures |
| 4.5 | [ ] | Verify BP1 conditional breakpoint | Only fires on second call (cache hit) | - | First call should skip BP1 |
| 4.6 | [ ] | Verify debug.evaluate expressions | All expressions from walkthrough execute successfully | - | Check cache.keys(), cache_info(), etc. |
| 4.7 | [ ] | Complete MCP workflow validation | Run equivalent MCP tools, verify identical behavior | - | Compare output to CLI baseline |
| 4.8 | [ ] | Test state isolation | Run test 5 times in sequence, verify consistent failure | - | Confirms autouse fixtures work |
| 4.9 | [ ] | Test fresh Python process | Restart Python/pytest, run test, verify works | - | Ensures no hidden dependencies on prior state |
| 4.10 | [ ] | Verify justMyCode=false guidance | Test step-into with justMyCode true vs false | - | Confirm troubleshooting guidance accurate |
| 4.11 | [ ] | Review walkthrough for accuracy | All commands execute, line numbers correct, output matches | - | Final proofreading pass |
| 4.12 | [ ] | Update plan with any changes | Document any adjustments made during validation | - | Keep plan in sync with reality |

### Manual Validation Checklist

**Environment Setup**:
- [ ] Python >= 3.8 verified
- [ ] pytest >= 5.0 verified
- [ ] VSC-Bridge bridge running (`vscb status`)
- [ ] Extension Host can open test workspace

**Test Discovery**:
- [ ] `pytest --collect-only` shows test_checkout_demo
- [ ] VS Code Test UI shows test in tree
- [ ] Can click "debug test" icon in gutter

**CLI Workflow**:
- [ ] All 4 breakpoints set successfully
- [ ] tests.debug-single launches at correct line
- [ ] BP1 triggers only on second call (conditional)
- [ ] BP2 triggers inside tax.py closure
- [ ] BP3 triggers in checkout.py
- [ ] BP4 triggers inside flags.py
- [ ] All debug.evaluate expressions work
- [ ] Can step-into flag_enabled and see decorator wrapper

**MCP Workflow**:
- [ ] breakpoint_set works for all 4 breakpoints
- [ ] test_debug_single launches correctly
- [ ] debug_evaluate works for all expressions
- [ ] debug_step_into works
- [ ] debug_continue works
- [ ] Output matches CLI behavior

**State Isolation**:
- [ ] Test fails consistently (same assertion error)
- [ ] Running test 5 times produces identical failures
- [ ] No cache leakage between runs
- [ ] No env var leakage between runs

**Line Number Accuracy**:
- [ ] Validation script runs successfully
- [ ] All BP markers found at documented lines
- [ ] Documentation reflects actual line numbers

### Line Number Validation Script

```bash
#!/bin/bash
# validate-breakpoints.sh

echo "Validating breakpoint markers..."

FILES=(
    "test/python/demo_shop/config.py:BP1:abspath in cache"
    "test/python/demo_shop/flags.py:BP2:return raw"
    "test/python/demo_shop/tax.py:BP3:return 0.07"
    "test/python/demo_shop/checkout.py:BP4:if flag_enabled"
)

ERRORS=0

for entry in "${FILES[@]}"; do
    IFS=':' read -r filepath marker keyword <<< "$entry"

    if [ ! -f "$filepath" ]; then
        echo "❌ File not found: $filepath"
        ((ERRORS++))
        continue
    fi

    line_num=$(grep -n "# <-- $marker" "$filepath" | cut -d: -f1)

    if [ -z "$line_num" ]; then
        echo "❌ Marker not found: $marker in $filepath"
        ((ERRORS++))
        continue
    fi

    line_content=$(sed -n "${line_num}p" "$filepath")

    if echo "$line_content" | grep -q "$keyword"; then
        echo "✅ $marker found at line $line_num in $filepath"
    else
        echo "⚠️  $marker found at line $line_num but keyword '$keyword' not present"
        echo "   Content: $line_content"
        ((ERRORS++))
    fi
done

if [ $ERRORS -eq 0 ]; then
    echo ""
    echo "✅ All breakpoint markers validated successfully!"
    exit 0
else
    echo ""
    echo "❌ Found $ERRORS error(s). Update documentation or code."
    exit 1
fi
```

### Acceptance Criteria
- [ ] Validation script reports all markers correct
- [ ] CLI workflow completes without errors
- [ ] MCP workflow completes without errors
- [ ] CLI and MCP produce identical results
- [ ] Test runs consistently 5+ times
- [ ] All documentation accurate and up-to-date

---

## Cross-Cutting Concerns

### Security Considerations
**N/A**: This is a demonstration scenario with no production deployment, no user input validation required, no sensitive data handling.

### Observability
**Logging**: Use inline comments and print-style debugging for development. No production logging needed.

**Metrics**: Track manual validation results in Phase 4 execution log.

**Error Tracking**: Document any errors encountered during validation in Phase 4 notes.

### Documentation

**Location**: `docs/how/scenarios/` per Documentation Strategy from spec

**Structure**:
- `docs/how/scenarios/invisible-state-debugging.md` - Main progressive revelation walkthrough (300-500 lines)
- `test/python/demo_shop/README.md` - Brief quick-start and reference link (< 50 lines)

**Content Organization**:
- Prerequisites and setup
- File structure overview
- Breakpoint setup commands
- Progressive revelation per breakpoint (Mystery → Hypothesis → Commands → Results → Insight)
- CLI and MCP command examples
- Troubleshooting section
- Talking points for presentations

**Target Audience**:
- New VSC-Bridge users learning debugging workflows
- Presenters demonstrating VSC-Bridge capabilities
- AI agent developers learning collaborative debugging patterns

**Maintenance**:
- Update when VSC-Bridge CLI/MCP APIs change
- Refresh if Python debugging workflow changes
- Validate line numbers using validation script before presentations
- Test scenario after VSC-Bridge version upgrades

---

## Progress Tracking

### Phase Completion Checklist
- [ ] Phase 0: Project Setup & Validation
- [ ] Phase 1: Demo Module Implementation
- [ ] Phase 2: Test Harness Implementation
- [ ] Phase 3: Progressive Revelation Walkthrough
- [ ] Phase 4: Manual Validation & Integration

### STOP Rule
**IMPORTANT**: This plan must be validated before proceeding to implementation.

**Next Steps**:
1. Run `/plan-4-complete-the-plan` to validate plan readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes
3. Begin implementation with Phase 0

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by `/plan-6a-update-progress`.

**Footnote Numbering Authority**: `/plan-6a-update-progress` is the single source of truth for footnote numbering across the entire plan.

**Initial State** (before implementation begins):

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
[^4]: [To be added during implementation via plan-6a]
[^5]: [To be added during implementation via plan-6a]

---

## Appendix: Related Documentation

- [Spec](./example-scenario-spec.md) - Feature specification with goals, acceptance criteria, and design decisions
- [Scenario Challenge](./scenario/challenge.md) - Original scenario materials with bug descriptions
- [Scenario Script](./scenario/script.md) - Presentation script and walkthrough outline
- [CLAUDE.md](/workspaces/vscode-bridge/CLAUDE.md) - Project instructions and debugging workflow patterns
- [AGENTS-TEMPLATE.md](/workspaces/vscode-bridge/AGENTS-TEMPLATE.md) - Template for AI agents using VSC-Bridge
