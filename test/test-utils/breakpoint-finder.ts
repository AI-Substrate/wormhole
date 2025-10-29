import * as fs from 'fs';

/**
 * Dynamically find breakpoint line by searching for VSCB_BREAKPOINT_NEXT_LINE marker.
 *
 * Used by integration tests to discover breakpoint locations in test files
 * without hardcoding line numbers (which break when files are refactored).
 *
 * @param filePath Absolute path to test file
 * @returns Line number for breakpoint (1-indexed)
 * @throws Error if marker not found in file or file doesn't exist
 *
 * @example
 * ```typescript
 * const testFile = path.join(PROJECT_ROOT, 'test/integration-simple/python/debug_test.py');
 * const breakpointLine = findBreakpointLine(testFile);  // e.g., 22
 * ```
 */
export function findBreakpointLine(filePath: string): number {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Test file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const markerIndex = lines.findIndex(line => line.includes('VSCB_BREAKPOINT_NEXT_LINE'));

    if (markerIndex === -1) {
        throw new Error(
            `VSCB_BREAKPOINT_NEXT_LINE marker not found in ${filePath}\n` +
            `Expected to find comment with marker before the breakpoint line.`
        );
    }

    // Return the line AFTER the marker
    // +1 for next line, +1 to convert 0-indexed to 1-indexed
    return markerIndex + 2;
}

/**
 * Dynamically find second breakpoint line by searching for VSCB_BREAKPOINT_2_NEXT_LINE marker.
 *
 * Used by integration tests for enhanced coverage testing with multiple breakpoints.
 *
 * @param filePath Absolute path to test file
 * @returns Line number for second breakpoint (1-indexed)
 * @throws Error if marker not found in file or file doesn't exist
 *
 * @example
 * ```typescript
 * const testFile = path.join(PROJECT_ROOT, 'test/integration-simple/typescript/debug.test.ts');
 * const breakpoint2Line = findBreakpoint2Line(testFile);  // e.g., 37
 * ```
 */
export function findBreakpoint2Line(filePath: string): number {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Test file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const markerIndex = lines.findIndex(line => line.includes('VSCB_BREAKPOINT_2_NEXT_LINE'));

    if (markerIndex === -1) {
        throw new Error(
            `VSCB_BREAKPOINT_2_NEXT_LINE marker not found in ${filePath}\n` +
            `Expected to find comment with marker before the second breakpoint line.`
        );
    }

    // Return the line AFTER the marker
    // +1 for next line, +1 to convert 0-indexed to 1-indexed
    return markerIndex + 2;
}
