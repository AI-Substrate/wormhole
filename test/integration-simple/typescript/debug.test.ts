/**
 * Unified Integration Test for MCP Debugging (TypeScript - Vitest)
 *
 * Template: This structure is mirrored in all languages
 * Expected variables at breakpoint 1 (line 24): x=5, y=3
 * Expected variables at breakpoint 2 (line 28): x=5, y=3, sum=8, diff=2
 *
 * Enhanced Coverage:
 * - Breakpoint 1: Initial breakpoint for step-in/step-out testing
 * - Step in to add() function to validate parameters (a=5, b=3)
 * - Step out back to test to validate return value (sum=8)
 * - Breakpoint 2: Second breakpoint for continue testing
 * - Validate all variables present after execution
 */

import { describe, test, expect } from 'vitest';

function add(a: number, b: number): number {
    
    return a + b;
}

function subtract(a: number, b: number): number {
    return a - b;
}

describe('Unified Integration Test', () => {
    test('should debug simple arithmetic', () => {
        const x = 5;
        const y = 3;

        // VSCB_BREAKPOINT_NEXT_LINE
        const sum = add(x, y);        // Expected: sum = 8 (Breakpoint 1 - step-in target)
        const diff = subtract(x, y);  // Expected: diff = 2

        expect(sum).toBe(8);
        // VSCB_BREAKPOINT_2_NEXT_LINE
        expect(diff).toBe(2);         // Breakpoint 2 - continue target
    });
});
