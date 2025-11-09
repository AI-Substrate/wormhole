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
