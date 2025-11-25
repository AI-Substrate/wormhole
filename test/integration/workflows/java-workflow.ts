/**
 * Java Enhanced Debug Workflow
 *
 * Extracted from cross-language-debug.test.ts (lines 949-1132)
 *
 * This workflow tests comprehensive debug lifecycle for Java:
 * - Uses the shared enhanced coverage workflow
 * - Key difference: Requires retry logic for test discovery
 * - Java debugger sometimes has intermittent discovery failures
 */

import { DebugRunner } from '../runners/DebugRunner';
import { enhancedCoverageWorkflow, EnhancedWorkflowConfig } from './base/enhanced-coverage-workflow';
import { scopeExtractors, findBreakpointLine, findBreakpoint2Line } from './base/utils';
import * as path from 'path';

// Project root for local file operations (findBreakpointLine uses fs.readFile)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Test file path - relative to test/ workspace (resolved by runner.resolvePath())
const JAVA_TEST_FILE = 'integration-simple/java/src/test/java/com/example/DebugTest.java';

// Absolute path for local file reading (findBreakpointLine)
const JAVA_TEST_FILE_ABS = path.join(PROJECT_ROOT, 'test', JAVA_TEST_FILE);

/**
 * Execute Java enhanced debug workflow
 *
 * @param runner - DebugRunner implementation (CLI or MCP)
 */
export async function javaEnhancedDebugWorkflow(runner: DebugRunner): Promise<void> {
    // Dynamically find breakpoint lines (uses absolute path for local fs.readFile)
    const breakpoint1Line = await findBreakpointLine(JAVA_TEST_FILE_ABS);    // Line 36: int sum = add(x, y);
    const breakpoint2Line = await findBreakpoint2Line(JAVA_TEST_FILE_ABS);   // Line 41: assertEquals(2, diff);

    const config: EnhancedWorkflowConfig = {
        // Language information
        language: 'Java',
        sessionType: 'java',

        // File paths and lines
        testFile: JAVA_TEST_FILE,
        breakpoint1Line,
        breakpoint2Line,

        // Expected variables at each stage
        expectedVars: {
            stage1: ['x', 'y'],           // Before sum assignment
            stage2: ['a', 'b'],           // Inside add() function (may not be visible)
            stage3: ['x', 'y', 'sum'],    // After step out and step over
            stage6: ['x', 'y', 'sum', 'diff']  // All 4 variables at end
        },

        // Expected values
        expectedValues: {
            x: '5',
            y: '3',
            sum: '8',
            diff: '2',
            a: '5',
            b: '3'
        },

        // Java uses 'sum' not 'sum_result'
        sumVarName: 'sum',
        diffVarName: 'diff',

        // Type validation
        typePattern: /int/,

        // Java-specific configuration
        variableNameMatcher: undefined,  // Uses default exact matcher
        scopeExtractor: scopeExtractors.nestedOptional,  // Java returns scope with children
        requiresStepOverAfterStepOut: true,  // Java needs step-over after step-out

        // CRITICAL: Java needs retry logic for test discovery
        retryTestDiscovery: true,
        retryMaxAttempts: 5,
        retryDelayMs: 2000,

        // Method replacement test (Phase 4 validation)
        methodReplacement: {
            functionName: 'add',
            modifiedCode: `    private int add(int a, int b) {
        int result = a + b;
        return result;
    }`,
            originalCode: `    private int add(int a, int b) {
        return a + b;
    }`
        }
    };

    // Execute the enhanced coverage workflow with Java configuration
    return enhancedCoverageWorkflow(runner, config);
}