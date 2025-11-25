/**
 * C# Enhanced Debug Workflow
 *
 * Extracted from cross-language-debug.test.ts (lines 727-916)
 *
 * This workflow tests comprehensive debug lifecycle for C#:
 * - Uses the shared enhanced coverage workflow
 * - Key difference: C# includes type annotations in variable names (e.g., "x [int]")
 * - Requires special variable name matching using startsWith instead of exact match
 */

import { DebugRunner } from '../runners/DebugRunner';
import { enhancedCoverageWorkflow, EnhancedWorkflowConfig } from './base/enhanced-coverage-workflow';
import { scopeExtractors, variableMatchers, findBreakpointLine, findBreakpoint2Line } from './base/utils';
import * as path from 'path';

// Project root for local file operations (findBreakpointLine uses fs.readFile)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Test file path - relative to test/ workspace (resolved by runner.resolvePath())
const CSHARP_TEST_FILE = 'integration-simple/csharp/DebugTest.cs';

// Absolute path for local file reading (findBreakpointLine)
const CSHARP_TEST_FILE_ABS = path.join(PROJECT_ROOT, 'test', CSHARP_TEST_FILE);

/**
 * Execute C# enhanced debug workflow
 *
 * @param runner - DebugRunner implementation (CLI or MCP)
 */
export async function csharpEnhancedDebugWorkflow(runner: DebugRunner): Promise<void> {
    // Dynamically find breakpoint lines (uses absolute path for local fs.readFile)
    const breakpoint1Line = await findBreakpointLine(CSHARP_TEST_FILE_ABS);   // Line 32: int sum = Add(x, y);
    const breakpoint2Line = await findBreakpoint2Line(CSHARP_TEST_FILE_ABS);  // Line 37: Assert.Equal(2, diff);

    const config: EnhancedWorkflowConfig = {
        // Language information
        language: 'C#',
        sessionType: 'coreclr',  // .NET Core debugger

        // File paths and lines
        testFile: CSHARP_TEST_FILE,
        breakpoint1Line,
        breakpoint2Line,

        // Expected variables at each stage
        expectedVars: {
            stage1: ['x', 'y'],           // Before sum assignment
            stage2: ['a', 'b'],           // Inside Add() method (may not be visible)
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

        // C# uses 'sum' not 'sum_result'
        sumVarName: 'sum',
        diffVarName: 'diff',

        // Type validation
        typePattern: /int/,

        // C#-specific configuration
        // CRITICAL: C# includes type annotations in variable names
        // Variable names appear as "x [int]", "y [int]", etc.
        // We need to use startsWith matching instead of exact
        variableNameMatcher: variableMatchers.typeAnnotated,

        // C# returns scope variable with children array
        scopeExtractor: scopeExtractors.nestedOptional,

        // C# needs step-over after step-out to complete assignment
        requiresStepOverAfterStepOut: true,

        // C# test discovery can be intermittent - enable retry
        retryTestDiscovery: true,
        retryMaxAttempts: 5,
        retryDelayMs: 2000,

        // Method replacement test (Phase 4 validation)
        methodReplacement: {
            functionName: 'Add',
            modifiedCode: `        private int Add(int a, int b)
        {
            int result = a + b;
            return result;
        }`,
            originalCode: `        private int Add(int a, int b) => a + b;`
        },

        // C# OmniSharp does not support LSP Call Hierarchy (Phase 6)
        // See: symbol/calls.meta.yaml line 99
        supportsCallHierarchy: false
    };

    // Execute the enhanced coverage workflow with C# configuration
    return enhancedCoverageWorkflow(runner, config);
}