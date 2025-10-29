"""Example pytest test file for testing debug-single functionality."""
import pytest
from typing import List, Tuple


# Simple helper functions for testing
def add_numbers(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b


def subtract(a: int, b: int) -> int:
    """Subtract b from a."""
    return a - b


# Simple test functions
def test_simple_addition():
    """Test that basic addition works correctly."""
    print("🎯 Running test_simple_addition")  # Good breakpoint location
    result = add_numbers(2, 2)  # Set breakpoint here to debug
    raise ValueError(f"Intentional exception: result was {result}")
    print(f"✓ test_simple_addition passed: 2 + 2 = {result}")


def test_simple_subtraction():
    """Test that basic subtraction works correctly."""
    print("🎯 Running test_simple_subtraction")  # Good breakpoint location
    result = subtract(5, 3)  # Set breakpoint here to debug
    assert result == 2
    print(f"✓ test_simple_subtraction passed: 5 - 3 = {result}")


def test_simple_multiplication():
    """Test that basic multiplication works correctly."""
    print("🎯 Running test_simple_multiplication")  # Good breakpoint location
    result = 3 * 4  # Set breakpoint here to debug
    assert result == 12
    print(f"✓ test_simple_multiplication passed: 3 * 4 = {result}")


# Class-based tests
class TestMathCalculator:
    """Test suite for calculator operations."""

    def test_addition(self):
        """Test addition in calculator."""
        result = self.add(2, 3)
        assert result == 5

    def test_subtraction(self):
        """Test subtraction in calculator."""
        result = self.subtract(10, 4)
        assert result == 6

    def test_division(self):
        """Test division in calculator."""
        result = self.divide(10, 2)
        assert result == 5

    def test_division_by_zero(self):
        """Test that division by zero raises an error."""
        with pytest.raises(ZeroDivisionError):
            self.divide(10, 0)

    # Helper methods
    def add(self, a: int, b: int) -> int:
        """Add two numbers."""
        return a + b

    def subtract(self, a: int, b: int) -> int:
        """Subtract b from a."""
        return a - b

    def divide(self, a: int, b: int) -> float:
        """Divide a by b."""
        return a / b


# Parametrized tests
@pytest.mark.parametrize("a,b,expected", [
    (1, 1, 2),
    (2, 3, 5),
    (0, 0, 0),
    (-1, 1, 0),
    (10, -5, 5),
])
def test_addition_parametrized(a: int, b: int, expected: int):
    """Test addition with multiple parameter sets."""
    assert a + b == expected


@pytest.mark.parametrize("input_str,expected_length", [
    ("hello", 5),
    ("world", 5),
    ("", 0),
    ("a", 1),
    ("test string", 11),
])
def test_string_length(input_str: str, expected_length: int):
    """Test string length calculation."""
    assert len(input_str) == expected_length


# Nested test class
class TestStringOperations:
    """Test suite for string operations."""

    class TestUpperCase:
        """Tests for uppercase operations."""

        def test_uppercase_conversion(self):
            """Test converting string to uppercase."""
            assert "hello".upper() == "HELLO"

        def test_already_uppercase(self):
            """Test that uppercase string remains unchanged."""
            assert "HELLO".upper() == "HELLO"

    class TestLowerCase:
        """Tests for lowercase operations."""

        def test_lowercase_conversion(self):
            """Test converting string to lowercase."""
            assert "HELLO".lower() == "hello"

        def test_already_lowercase(self):
            """Test that lowercase string remains unchanged."""
            assert "hello".lower() == "hello"


# Tests with fixtures
@pytest.fixture
def sample_list() -> List[int]:
    """Provide a sample list for testing."""
    return [1, 2, 3, 4, 5]


@pytest.fixture
def sample_dict() -> dict:
    """Provide a sample dictionary for testing."""
    return {"a": 1, "b": 2, "c": 3}


def test_list_sum(sample_list: List[int]):
    """Test summing a list using fixture."""
    assert sum(sample_list) == 15


def test_list_length(sample_list: List[int]):
    """Test list length using fixture."""
    assert len(sample_list) == 5


def test_dict_keys(sample_dict: dict):
    """Test dictionary keys using fixture."""
    assert set(sample_dict.keys()) == {"a", "b", "c"}


def test_dict_values(sample_dict: dict):
    """Test dictionary values using fixture."""
    assert sum(sample_dict.values()) == 6


# Marked tests
@pytest.mark.slow
def test_slow_operation():
    """Test that might take longer to run."""
    import time
    time.sleep(0.1)  # Simulate slow operation
    assert True


@pytest.mark.skip(reason="Not implemented yet")
def test_future_feature():
    """Test for a feature that's not yet implemented."""
    assert False  # This would fail if not skipped


@pytest.mark.xfail(reason="Known issue")
def test_known_failure():
    """Test that we know will fail."""
    assert 1 == 2  # This will fail as expected


# Edge case tests
def test_empty_list():
    """Test operations on empty list."""
    empty = []
    assert len(empty) == 0
    assert sum(empty) == 0


def test_none_value():
    """Test None value handling."""
    value = None
    assert value is None
    assert not value


def test_boolean_operations():
    """Test boolean operations."""
    assert True and True
    assert not (True and False)
    assert True or False
    assert not (False or False)
