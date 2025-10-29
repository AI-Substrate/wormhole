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

// Project paths
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Test file path
const CSHARP_TEST_FILE = path.join(PROJECT_ROOT, 'test/integration-simple/csharp/DebugTest.cs');

/**
 * Execute C# enhanced debug workflow
 *
 * @param runner - DebugRunner implementation (CLI or MCP)
 */
export async function csharpEnhancedDebugWorkflow(runner: DebugRunner): Promise<void> {
    // Dynamically find breakpoint lines
    const breakpoint1Line = await findBreakpointLine(CSHARP_TEST_FILE);   // Line 32: int sum = Add(x, y);
    const breakpoint2Line = await findBreakpoint2Line(CSHARP_TEST_FILE);  // Line 37: Assert.Equal(2, diff);

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
        retryDelayMs: 2000
    };

    // Execute the enhanced coverage workflow with C# configuration
    return enhancedCoverageWorkflow(runner, config);
}