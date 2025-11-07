package com.example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;

/**
 * Unified Integration Test for MCP Debugging (Java - JUnit 5)
 *
 * Template: This structure is mirrored in all languages
 * Expected variables at breakpoint 1 (line 31): x=5, y=3
 * Expected variables at breakpoint 2 (line 35): x=5, y=3, sum=8, diff=2
 *
 * Enhanced Coverage:
 * - Breakpoint 1: Initial breakpoint for step-in/step-out testing
 * - Step in to add() method to validate parameters (a=5, b=3)
 * - Step out back to test to validate return value (sum=8)
 * - Breakpoint 2: Second breakpoint for continue testing
 * - Validate all variables present after execution
 */
public class DebugTest {

        private int add(int a, int b) {
        int result = a + b;
        return result;
    }

    private int subtract(int a, int b) {
        return a - b;
    }

    @Test
    void testDebugSimpleArithmetic() {
        int x = 5;
        int y = 3;

        // VSCB_BREAKPOINT_NEXT_LINE
        int sum = add(x, y);         // Expected: sum = 8 (Breakpoint 1 - step-in target)
        int diff = subtract(x, y);   // Expected: diff = 2

        assertEquals(8, sum);
        // VSCB_BREAKPOINT_2_NEXT_LINE
        assertEquals(2, diff);       // Breakpoint 2 - continue target
    }
}
