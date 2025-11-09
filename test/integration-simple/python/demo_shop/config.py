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
