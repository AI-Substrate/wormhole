/**
 * Base Enhanced Coverage Workflow
 *
 * This is the shared workflow used by Python, C#, Java, and TypeScript tests.
 * It provides a configurable template that handles language-specific quirks through
 * configuration rather than duplication.
 *
 * Stages:
 * 1. Cleanup and setup
 * 2. Step into function
 * 3. Step out and validate variables
 * 3.5. Expression evaluation tests (NEW)
 * 4. Set second breakpoint
 * 5. Continue to second breakpoint
 * 6. Final validation
 */

import { expect } from 'vitest';
import { DebugRunner } from '../../runners/DebugRunner';
import {
    withRetry,
    findVariable,
    validateVariable,
    variableMatchers,
    scopeExtractors
} from './utils';

/**
 * Configuration for enhanced coverage workflow
 */
export interface EnhancedWorkflowConfig {
    // Language information
    language: string;
    sessionType?: string;  // Expected session type (e.g., 'coreclr', 'java', 'pwa-node')

    // File paths and lines
    testFile: string;
    breakpoint1Line: number;
    breakpoint2Line: number;

    // Expected variables at each stage
    expectedVars: {
        stage1: string[];  // Variables at first breakpoint (e.g., ['x', 'y'])
        stage2?: string[]; // Variables inside function (e.g., ['a', 'b']) - optional as may not be visible
        stage3: string[];  // Variables after step out (e.g., ['x', 'y', 'sum'])
        stage6: string[];  // All variables at end (e.g., ['x', 'y', 'sum', 'diff'])
    };

    // Expected values for validation
    expectedValues: {
        x: string;
        y: string;
        sum: string;
        diff: string;
        // Function parameters (optional)
        a?: string;
        b?: string;
    };

    // Variable names for sum and diff (language-specific)
    sumVarName?: string;  // Default: 'sum_result' for Python, 'sum' for others
    diffVarName?: string; // Default: 'diff' for all

    // Type validation pattern (e.g., /int/ for Python/C#/Java, /number/ for TypeScript)
    typePattern?: RegExp;

    // Language-specific quirks
    variableNameMatcher?: (varName: string, expectedName: string) => boolean;
    scopeExtractor?: (vars: any[]) => any[];
    requiresStepOverAfterStepOut?: boolean;  // Default: true
    retryTestDiscovery?: boolean;            // Default: false
    retryMaxAttempts?: number;                // Default: 5
    retryDelayMs?: number;                    // Default: 2000

    // Method replacement test (Phase 4 validation)
    methodReplacement?: {
        functionName: string;        // Symbol name to replace (e.g., 'add', 'Add')
        modifiedCode: string;        // Modified version with extra local variable
        originalCode: string;        // Original version to restore
    };

    // Call hierarchy support (Phase 6 validation)
    // Set to false for languages that don't support LSP Call Hierarchy (e.g., C#)
    supportsCallHierarchy?: boolean;  // Default: true
}

/**
 * Execute the enhanced coverage workflow with language-specific configuration
 */
export async function enhancedCoverageWorkflow(
    runner: DebugRunner,
    config: EnhancedWorkflowConfig
): Promise<void> {
    // Set defaults
    const sumVarName = config.sumVarName || (config.language === 'Python' ? 'sum_result' : 'sum');
    const diffVarName = config.diffVarName || 'diff';
    const variableNameMatcher = config.variableNameMatcher || variableMatchers.exact;
    const scopeExtractor = config.scopeExtractor || scopeExtractors.safe;
    const requiresStepOver = config.requiresStepOverAfterStepOut !== false; // Default true
    const typePattern = config.typePattern;

    console.log(`🚀 Testing ${config.language} debugging (enhanced coverage)...`);
    console.log(`📍 Breakpoint 1 line: ${config.breakpoint1Line}`);
    console.log(`📍 Breakpoint 2 line: ${config.breakpoint2Line}`);

    // CLEANUP: Stop any existing debug session
    console.log('🧹 Cleaning up any existing debug session...');
    await runner.stopDebug();
    console.log('✅ Cleanup complete');

    // Navigate to breakpoint line first
    console.log(`📍 Navigating to line ${config.breakpoint1Line}...`);
    const gotoResult = await runner.gotoLine(config.testFile, config.breakpoint1Line);
    expect(gotoResult.success, `Failed to navigate: ${gotoResult.error}`).toBe(true);
    console.log('✅ Navigated to breakpoint line');

    // Wait for file to settle after navigation (prevents file lock/dirty state issues)
    console.log('⏱️  Waiting 2 seconds for file to settle...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ File settled');

    // METHOD REPLACEMENT VALIDATION (Phase 4)
    if (config.methodReplacement) {
        console.log('🔄 Testing method replacement (Phase 4 validation)...');

        // Step 1: Replace method with modified version
        console.log(`📝 Step 1: Replacing ${config.methodReplacement.functionName}() with modified version...`);
        const replaceResult1 = await runner.replaceMethod(
            config.testFile,
            config.methodReplacement.functionName,
            config.methodReplacement.modifiedCode
        );
        expect(replaceResult1.success, `Failed to replace method: ${replaceResult1.error}`).toBe(true);
        console.log('✅ Method replaced successfully');

        // Step 2: Replace back to original
        console.log('🔄 Step 2: Replacing back to original version...');
        const replaceResult2 = await runner.replaceMethod(
            config.testFile,
            config.methodReplacement.functionName,
            config.methodReplacement.originalCode
        );
        expect(replaceResult2.success, `Failed to restore method: ${replaceResult2.error}`).toBe(true);
        console.log('✅ Method restored to original');
        console.log('✅ Method replacement transaction complete');

        // STAGE 1.5: Call Hierarchy Validation (Phase 6)
        // Only run if language supports call hierarchy (default: true, but C# sets to false)
        const supportsCallHierarchy = config.supportsCallHierarchy !== false;
        if (supportsCallHierarchy) {
            console.log(`🔍 Stage 1.5: Testing call hierarchy for ${config.methodReplacement.functionName}()...`);
            const callsResult = await runner.callHierarchy(
                config.testFile,
                config.methodReplacement.functionName,
                'incoming'
            );
            expect(callsResult.success, `Failed to get call hierarchy: ${callsResult.error}`).toBe(true);
            expect(callsResult.data?.calls).toBeDefined();
            expect(callsResult.data?.calls.length).toBeGreaterThan(0);
            console.log(`✅ Stage 1.5 validation: Found ${callsResult.data?.calls.length} incoming calls to ${config.methodReplacement.functionName}()`);
        } else {
            console.log(`ℹ️  Stage 1.5: Skipping call hierarchy validation (${config.language} does not support LSP Call Hierarchy)`);
        }
    }

    // Set first breakpoint
    console.log(`📍 Setting breakpoint 1 at ${config.testFile}:${config.breakpoint1Line}...`);
    const bpResult = await runner.setBreakpoint(config.testFile, config.breakpoint1Line);
    expect(bpResult.success, `Failed to set breakpoint: ${bpResult.error}`).toBe(true);
    console.log('✅ Breakpoint 1 set');

    // Wait 2 seconds before starting debug session
    console.log('⏱️  Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Wait complete');

    // Start debug session (with optional retry)
    console.log(`🎯 Starting debug session at ${config.testFile}:${config.breakpoint1Line}...`);

    let startResult;
    if (config.retryTestDiscovery) {
        startResult = await withRetry(
            () => runner.debugSingle(config.testFile, config.breakpoint1Line),
            {
                maxRetries: config.retryMaxAttempts || 5,
                delayMs: config.retryDelayMs || 2000,
                operationName: `${config.language} test discovery`
            }
        );
    } else {
        startResult = await runner.debugSingle(config.testFile, config.breakpoint1Line);
    }

    // Verify debug session started successfully
    expect(startResult.success, `Failed to start: ${startResult.error}`).toBe(true);
    expect(startResult.data?.event).toBe('stopped');
    expect(startResult.data?.line).toBeDefined();
    expect(startResult.data).toHaveProperty('editorContext');
    console.log(`✅ Debug session started at line ${startResult.data?.line}`);

    // Check session type if configured
    if (config.sessionType && startResult.data?.sessionType) {
        if (startResult.data.sessionType !== config.sessionType) {
            console.log(`ℹ️  Session type is '${startResult.data.sessionType}', expected '${config.sessionType}'`);
        }
    }

    // STAGE 1: List variables at first breakpoint (before sum is assigned)
    console.log(`📋 Stage 1: Listing variables at breakpoint 1 (before ${sumVarName} assignment)...`);
    const vars1Result = await runner.listVariables('local');
    expect(vars1Result.success, `Failed to list variables: ${vars1Result.error}`).toBe(true);
    expect(vars1Result.data).toBeDefined();

    const vars1 = vars1Result.data!;
    console.log(`✅ Found ${vars1.length} variables`);

    // Extract actual variables using language-specific extractor
    const actualVars1 = scopeExtractor(vars1);
    console.log(`📋 Actual variables extracted: ${actualVars1.map((v: any) => v.name).join(', ')}`);

    // Validate expected variables at stage 1
    for (const expectedVar of config.expectedVars.stage1) {
        const found = findVariable(actualVars1, expectedVar, variableNameMatcher);
        expect(found, `Variable '${expectedVar}' not found at stage 1`).toBeDefined();

        // Validate value if it's x or y
        if (expectedVar === 'x') {
            expect(found!.value).toBe(config.expectedValues.x);
            console.log(`✅ x = ${found!.value}`);
        } else if (expectedVar === 'y') {
            expect(found!.value).toBe(config.expectedValues.y);
            console.log(`✅ y = ${found!.value}`);
        }
    }

    // STAGE 2: Step into function
    console.log(`🔽 Stage 2: Stepping into function...`);
    const stepInResult = await runner.stepInto();
    expect(stepInResult.success, `Failed to step into: ${stepInResult.error}`).toBe(true);
    expect(stepInResult.data?.event).toBe('stopped');
    expect(stepInResult.data).toHaveProperty('editorContext');
    console.log(`✅ Stepped into function at line ${stepInResult.data?.line}`);

    // List variables inside function (should see parameters if not at return)
    console.log('📋 Listing variables inside function...');
    const vars2Result = await runner.listVariables('local');
    expect(vars2Result.success).toBe(true);
    const vars2 = vars2Result.data!;

    const actualVars2 = scopeExtractor(vars2);
    console.log(`📋 Variables in function: ${actualVars2.map((v: any) => v.name).join(', ')}`);

    // Validate function parameters if configured and visible
    if (config.expectedVars.stage2 && config.expectedVars.stage2.length > 0) {
        const a = findVariable(actualVars2, config.expectedVars.stage2[0], variableNameMatcher);
        const b = findVariable(actualVars2, config.expectedVars.stage2[1], variableNameMatcher);

        if (a && b) {
            expect(a.value).toBe(config.expectedValues.a || config.expectedValues.x);
            expect(b.value).toBe(config.expectedValues.b || config.expectedValues.y);
            console.log(`✅ Stage 2 validation: ${config.expectedVars.stage2[0]}=${a.value}, ${config.expectedVars.stage2[1]}=${b.value}`);
        } else {
            console.log(`ℹ️  Stage 2: Parameters not visible (likely at return statement) - skipping validation`);
        }
    }

    // STAGE 3: Step out back to test
    console.log('🔼 Stage 3: Stepping out back to test...');
    const stepOutResult = await runner.stepOut();
    expect(stepOutResult.success, `Failed to step out: ${stepOutResult.error}`).toBe(true);
    expect(stepOutResult.data?.event).toBe('stopped');
    expect(stepOutResult.data).toHaveProperty('editorContext');
    console.log(`✅ Stepped out to line ${stepOutResult.data?.line}`);

    // Optional step-over (required for most languages except TypeScript)
    if (requiresStepOver) {
        console.log(`⏭️  Stepping over to complete ${sumVarName} assignment...`);
        const stepOverResult = await runner.stepOver();
        expect(stepOverResult.success, `Failed to step over: ${stepOverResult.error}`).toBe(true);
        expect(stepOverResult.data).toHaveProperty('editorContext');
        console.log(`✅ Stepped over to line ${stepOverResult.data?.line}`);
    } else {
        console.log(`ℹ️  ${config.language} doesn't require step-over after step-out`);
    }

    // List variables after step out/over (sum should now be assigned)
    console.log(`📋 Listing variables after step-out (${sumVarName} should be assigned)...`);
    const vars3Result = await runner.listVariables('local');
    expect(vars3Result.success).toBe(true);
    const vars3 = vars3Result.data!;

    const actualVars3 = scopeExtractor(vars3);
    console.log(`📋 Variables: ${actualVars3.map((v: any) => v.name).join(', ')}`);

    // Validate expected variables at stage 3
    for (const expectedVar of config.expectedVars.stage3) {
        const varName = expectedVar === 'sum' ? sumVarName : expectedVar;
        const found = findVariable(actualVars3, varName, variableNameMatcher);
        expect(found, `Variable '${varName}' not found at stage 3`).toBeDefined();

        // Validate values
        if (expectedVar === 'x') {
            expect(found!.value).toBe(config.expectedValues.x);
        } else if (expectedVar === 'y') {
            expect(found!.value).toBe(config.expectedValues.y);
        } else if (expectedVar === 'sum' || varName === sumVarName) {
            expect(found!.value).toBe(config.expectedValues.sum);
            console.log(`✅ ${sumVarName} = ${found!.value}`);
        }
    }

    // STAGE 3.5: Expression Evaluation Tests
    console.log('🧮 Stage 3.5: Testing expression evaluation...');

    // Test 1: Simple variable access
    console.log('📊 Evaluating: x');
    const eval1 = await runner.evaluate('x');
    expect(eval1.success, `Failed to evaluate 'x': ${eval1.error}`).toBe(true);
    expect(eval1.data?.result).toBe(config.expectedValues.x);
    expect(eval1.data).toHaveProperty('editorContext');
    console.log(`✅ Evaluate variable: x = ${eval1.data?.result}`);

    // Test 2: Arithmetic expression
    console.log('📊 Evaluating: x + y');
    const eval2 = await runner.evaluate('x + y');
    expect(eval2.success, `Failed to evaluate 'x + y': ${eval2.error}`).toBe(true);
    expect(eval2.data?.result).toBe(config.expectedValues.sum);
    expect(eval2.data).toHaveProperty('editorContext');
    console.log(`✅ Evaluate arithmetic: x + y = ${eval2.data?.result}`);

    // Test 3: Expression with literal
    console.log('📊 Evaluating: x * 2');
    const xTimes2 = parseInt(config.expectedValues.x) * 2;
    const eval3 = await runner.evaluate('x * 2');
    expect(eval3.success, `Failed to evaluate 'x * 2': ${eval3.error}`).toBe(true);
    expect(eval3.data?.result).toBe(xTimes2.toString());
    expect(eval3.data).toHaveProperty('editorContext');
    console.log(`✅ Evaluate with literal: x * 2 = ${eval3.data?.result}`);

    // Test 4: Method/Function call (language-specific)
    console.log(`📊 Evaluating: ${sumVarName}.toString() (or equivalent)`);
    let toStringExpr: string;
    let expectedToString: string;

    if (config.language === 'Python') {
        toStringExpr = `str(${sumVarName})`;
        expectedToString = `'${config.expectedValues.sum}'`;  // Python wraps in single quotes
    } else if (config.language === 'C#') {
        toStringExpr = `${sumVarName}.ToString()`;
        expectedToString = `"${config.expectedValues.sum}"`;  // C# wraps in double quotes
    } else if (config.language === 'Java') {
        toStringExpr = `String.valueOf(${sumVarName})`;
        expectedToString = `"${config.expectedValues.sum}"`;  // Java wraps in double quotes
    } else {
        // TypeScript/JavaScript
        toStringExpr = `${sumVarName}.toString()`;
        expectedToString = `'${config.expectedValues.sum}'`;  // JS/TS wraps in single quotes (Node.js debugger)
    }

    const eval4 = await runner.evaluate(toStringExpr);
    expect(eval4.success, `Failed to evaluate '${toStringExpr}': ${eval4.error}`).toBe(true);
    expect(eval4.data?.result).toBe(expectedToString);
    expect(eval4.data).toHaveProperty('editorContext');
    console.log(`✅ Evaluate method/function call: ${toStringExpr} = ${eval4.data?.result}`);

    console.log('✅ Stage 3.5: All expression evaluations passed');

    // STAGE 4: Set second breakpoint dynamically
    console.log(`📍 Stage 4: Setting breakpoint 2 at line ${config.breakpoint2Line}...`);
    const bp2Result = await runner.setBreakpoint(config.testFile, config.breakpoint2Line);
    expect(bp2Result.success, `Failed to set breakpoint 2: ${bp2Result.error}`).toBe(true);
    console.log('✅ Breakpoint 2 set dynamically during active session');

    // STAGE 5: Continue to second breakpoint
    console.log('▶️  Stage 5: Continuing to breakpoint 2...');
    const continueResult = await runner.continue();
    expect(continueResult.success, `Failed to continue: ${continueResult.error}`).toBe(true);
    expect(continueResult.data?.event).toBe('stopped');
    expect(continueResult.data?.line).toBe(config.breakpoint2Line);
    expect(continueResult.data).toHaveProperty('editorContext');
    console.log(`✅ Stopped at breakpoint 2 (line ${continueResult.data?.line})`);

    // STAGE 6: Final validation - all variables should be present
    console.log('📋 Stage 6: Final variable validation (all 4 expected)...');
    const vars4Result = await runner.listVariables('local');
    expect(vars4Result.success).toBe(true);
    const vars4 = vars4Result.data!;

    const actualVars4 = scopeExtractor(vars4);
    console.log(`📋 Final variables: ${actualVars4.map((v: any) => v.name).join(', ')}`);

    // Build expected variables list with language-specific names
    const expectedFinalVars = [
        { name: 'x', value: config.expectedValues.x },
        { name: 'y', value: config.expectedValues.y },
        { name: sumVarName, value: config.expectedValues.sum },
        { name: diffVarName, value: config.expectedValues.diff }
    ];

    let foundCount = 0;
    for (const expected of expectedFinalVars) {
        const found = findVariable(actualVars4, expected.name, variableNameMatcher);
        if (found) {
            foundCount++;
            console.log(`✅ Found: ${expected.name} = ${found.value}${typePattern ? ` (${found.type})` : ''}`);
            expect(found.value).toBe(expected.value);

            // Validate type if pattern provided
            if (typePattern && found.type) {
                expect(found.type).toMatch(typePattern);
            }
        } else {
            console.log(`⚠️  Expected variable not found: ${expected.name}`);
        }
    }

    expect(foundCount).toBe(expectedFinalVars.length);
    console.log(`✅ Stage 6: Found all ${foundCount}/${expectedFinalVars.length} expected variables`);

    // CLEANUP: Stop debug session
    console.log('🛑 Stopping debug session...');
    const stopResult = await runner.stopDebug();
    expect(stopResult.success, `Failed to stop: ${stopResult.error}`).toBe(true);
    console.log('✅ Debug session stopped cleanly');

    console.log(`✅ ${config.language} enhanced debugging workflow completed ✓`);
}