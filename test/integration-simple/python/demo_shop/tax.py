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
