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
