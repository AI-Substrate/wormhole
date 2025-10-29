"""
Unified Integration Test for MCP Debugging (Python - pytest)

Template: This structure is mirrored in all languages
Expected variables at breakpoint 1 (line 21): x=5, y=3
Expected variables at breakpoint 2 (line 25): x=5, y=3, sum_result=8, diff=2

Enhanced Coverage:
- Breakpoint 1: Initial breakpoint for step-in/step-out testing
- Step in to add() function to validate parameters (a=5, b=3)
- Step out back to test to validate return value (sum_result=8)
- Breakpoint 2: Second breakpoint for continue testing
- Validate all variables present after execution
"""
import pytest

def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

def subtract(a: int, b: int) -> int:
    """Subtract b from a"""
    return a - b

def test_debug_simple_arithmetic():
    """Validate basic debugging workflow via MCP"""
    x = 5
    y = 3

    # VSCB_BREAKPOINT_NEXT_LINE
a    sum_result = add(x, y)     # Expected: sum_result = 8 (Breakpoint 1 - step-in target)
da    diff = subtract(x, y)      # Expected: diff = 2

    assert sum_result == 8
    # VSCB_BREAKPOINT_2_NEXT_LINE
    assert diff == 2           # Breakpoint 2 - continue target

