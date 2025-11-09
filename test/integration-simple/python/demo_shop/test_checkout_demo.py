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

    <-- Line 30: Use this line for tests.debug-single

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
