/**
 * TypeScript Enhanced Debug Workflow
 *
 * Extracted from cross-language-debug.test.ts (lines 1162-1346)
 *
 * This workflow tests comprehensive debug lifecycle for TypeScript:
 * - Uses the shared enhanced coverage workflow
 * - Key differences:
 *   1. Does NOT require step-over after step-out (unique to TypeScript)
 *   2. Uses /number/ type pattern instead of /int/
 *   3. Requires retry logic for Vitest test discovery
 */

import { DebugRunner } from '../runners/DebugRunner';
import { enhancedCoverageWorkflow, EnhancedWorkflowConfig } from './base/enhanced-coverage-workflow';
import { scopeExtractors, findBreakpointLine, findBreakpoint2Line } from './base/utils';
import * as path from 'path';

// Project paths
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Test file path
const TYPESCRIPT_TEST_FILE = path.join(PROJECT_ROOT, 'test/integration-simple/typescript/debug.test.ts');

/**
 * Execute TypeScript enhanced debug workflow
 *
 * @param runner - DebugRunner implementation (CLI or MCP)
 */
export async function typescriptEnhancedDebugWorkflow(runner: DebugRunner): Promise<void> {
    // Dynamically find breakpoint lines
    const breakpoint1Line = await findBreakpointLine(TYPESCRIPT_TEST_FILE);   // Line 32: const sum = add(x, y);
    const breakpoint2Line = await findBreakpoint2Line(TYPESCRIPT_TEST_FILE);  // Line 37: expect(diff).toBe(2);

    const config: EnhancedWorkflowConfig = {
        // Language information
        language: 'TypeScript',
        sessionType: 'pwa-node',  // Node.js debugger for TypeScript (can also be 'node')

        // File paths and lines
        testFile: TYPESCRIPT_TEST_FILE,
        breakpoint1Line,
        breakpoint2Line,

        // Expected variables at each stage
        expectedVars: {
            stage1: ['x', 'y'],           // Before sum assignment
            stage2: ['a', 'b'],           // Inside add() function (may not be visible)
            stage3: ['x', 'y', 'sum'],    // After step out (NO step-over needed!)
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

        // TypeScript uses 'sum' not 'sum_result'
        sumVarName: 'sum',
        diffVarName: 'diff',

        // Type validation - TypeScript uses 'number' not 'int'
        typePattern: /number/,

        // TypeScript-specific configuration
        variableNameMatcher: undefined,  // Uses default exact matcher (clean variable names)

        // TypeScript returns nested scope with required children property
        // Using nestedOptional for safety, but could use nestedRequired
        scopeExtractor: scopeExtractors.nestedOptional,

        // CRITICAL: TypeScript does NOT require step-over after step-out
        // This is unique to TypeScript - the sum variable is immediately available
        requiresStepOverAfterStepOut: false,

        // TypeScript/Vitest needs retry logic for test discovery (like Java)
        retryTestDiscovery: true,
        retryMaxAttempts: 5,
        retryDelayMs: 2000
    };

    // Execute the enhanced coverage workflow with TypeScript configuration
    return enhancedCoverageWorkflow(runner, config);
}