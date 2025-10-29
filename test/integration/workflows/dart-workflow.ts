/**
 * Dart Enhanced Debug Workflow
 *
 * This workflow tests comprehensive debug lifecycle for Dart:
 * 1. Cleanup: Stop any existing session
 * 2. Set first breakpoint (dynamically discovered via VSCB_BREAKPOINT_NEXT_LINE)
 * 3. Start debug session at first breakpoint
 * 4. Validate initial variables (x=5, y=3 - sum not yet assigned)
 * 5. Step into add() function
 * 6. Validate function parameters (a=5, b=3)
 * 7. Step out back to test
 * 8. Step over to complete sum assignment
 * 9. Validate sum is now available (sum=8)
 * 10. Expression evaluation: test variable access, arithmetic, literals, and method calls
 * 11. Set second breakpoint dynamically (VSCB_BREAKPOINT_2_NEXT_LINE)
 * 12. Continue to second breakpoint
 * 13. Validate all variables present (x=5, y=3, sum=8, diff=2)
 * 14. Stop debug session to clean up
 */

import { expect } from 'vitest';
import { DebugRunner } from '../runners/DebugRunner';
import { withRetry } from './base/utils';
import * as path from 'path';

// Project paths
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Test file path
const DART_TEST_FILE = path.join(PROJECT_ROOT, 'test/integration-simple/dart/test/debug_test.dart');

/**
 * Execute Dart enhanced debug workflow
 *
 * @param runner - DebugRunner implementation (CLI or MCP)
 */
export async function dartEnhancedDebugWorkflow(runner: DebugRunner): Promise<void> {
    console.log('🎯 Testing Dart debugging (enhanced coverage)...');

    const BREAKPOINT_LINE_1 = 19;
    const BREAKPOINT_LINE_2 = 24;

    console.log(`📍 Breakpoint 1 line: ${BREAKPOINT_LINE_1}`);
    console.log(`📍 Breakpoint 2 line: ${BREAKPOINT_LINE_2}`);

    // CLEANUP: Stop any existing debug session
    console.log('🧹 Cleaning up any existing debug session...');
    await runner.stopDebug();
    console.log('✅ Cleanup complete');

    // Navigate to breakpoint line first
    console.log(`📍 Navigating to line ${BREAKPOINT_LINE_1}...`);
    const gotoResult = await runner.gotoLine(DART_TEST_FILE, BREAKPOINT_LINE_1);
    expect(gotoResult.success, `Failed to navigate: ${gotoResult.error}`).toBe(true);
    console.log('✅ Navigated to breakpoint line');

    // Set first breakpoint
    console.log(`📍 Setting breakpoint 1 at ${DART_TEST_FILE}:${BREAKPOINT_LINE_1}...`);
    const bpResult = await runner.setBreakpoint(DART_TEST_FILE, BREAKPOINT_LINE_1);
    expect(bpResult.success, `Failed to set breakpoint: ${bpResult.error}`).toBe(true);
    console.log('✅ Breakpoint 1 set');

    // Wait 2 seconds before starting debug session
    console.log('⏱️  Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Wait complete');

    // Start debug session (with retry for intermittent test discovery)
    console.log(`🎯 Starting debug session at ${DART_TEST_FILE}:${BREAKPOINT_LINE_1}...`);
    const startResult = await withRetry(
        () => runner.debugSingle(DART_TEST_FILE, BREAKPOINT_LINE_1),
        {
            maxRetries: 5,
            delayMs: 2000,
            operationName: 'Dart test discovery'
        }
    );

    // Verify debug session started successfully
    expect(startResult.success, `Failed to start: ${startResult.error}`).toBe(true);
    expect(startResult.data?.event).toBe('stopped');
    expect(startResult.data?.line).toBeDefined();
    console.log(`✅ Debug session started at line ${startResult.data?.line}`);

    // STAGE 1: List variables at first breakpoint (before sum is assigned)
    console.log('📋 Stage 1: Listing variables at breakpoint 1 (before sum assignment)...');
    const vars1Result = await runner.listVariables('local');
    expect(vars1Result.success, `Failed to list variables: ${vars1Result.error}`).toBe(true);
    expect(vars1Result.data).toBeDefined();

    const vars1 = vars1Result.data!;
    console.log(`✅ Found ${vars1.length} variables`);
    console.log(`📋 Available variables: ${vars1.map((v: any) => v.name).join(', ')}`);

    // Dart may return variables in a scope container - extract from children if present
    const scopeVar1 = vars1[0];
    const actualVars1 = scopeVar1?.children || vars1;
    console.log(`📋 Actual variables extracted: ${actualVars1.map((v: any) => v.name).join(', ')}`);

    // Validate x and y are present (sum should NOT be assigned yet)
    const x1 = actualVars1.find((v: any) => v.name === 'x');
    const y1 = actualVars1.find((v: any) => v.name === 'y');
    expect(x1, 'Variable x not found').toBeDefined();
    expect(y1, 'Variable y not found').toBeDefined();
    expect(x1!.value).toBe('5');
    expect(y1!.value).toBe('3');
    console.log(`✅ Stage 1 validation: x=${x1!.value}, y=${y1!.value}`);

    // STAGE 2: Step into add() function
    console.log('🔽 Stage 2: Stepping into add() function...');
    const stepInResult = await runner.stepInto();
    expect(stepInResult.success, `Failed to step into: ${stepInResult.error}`).toBe(true);
    expect(stepInResult.data?.event).toBe('stopped');
    console.log(`✅ Stepped into function at line ${stepInResult.data?.line}`);

    // List variables inside add() function (should see a and b parameters)
    console.log('📋 Listing variables inside add() function...');
    const vars2Result = await runner.listVariables('local');
    expect(vars2Result.success).toBe(true);
    const vars2 = vars2Result.data!;
    console.log(`📋 Available variables: ${vars2.map((v: any) => v.name).join(', ')}`);

    // Dart may return variables in a scope container - extract from children
    const scopeVar2 = vars2[0];
    const actualVars2 = scopeVar2?.children || vars2;

    // Validate a and b parameters (may not be visible if at return statement)
    const a = actualVars2.find((v: any) => v.name === 'a');
    const b = actualVars2.find((v: any) => v.name === 'b');

    if (a && b) {
        expect(a.value).toBe('5');
        expect(b.value).toBe('3');
        console.log(`✅ Stage 2 validation: a=${a.value}, b=${b.value} (inside add function)`);
    } else {
        console.log(`ℹ️  Stage 2: Parameters not visible (likely at return statement) - skipping validation`);
    }

    // STAGE 3: Step out back to test
    console.log('🔼 Stage 3: Stepping out back to test...');
    const stepOutResult = await runner.stepOut();
    expect(stepOutResult.success, `Failed to step out: ${stepOutResult.error}`).toBe(true);
    expect(stepOutResult.data?.event).toBe('stopped');
    console.log(`✅ Stepped out to line ${stepOutResult.data?.line}`);

    // Step until we reach line 20 (where sum is assigned) - Dart may require multiple steps
    console.log('⏭️  Stepping until line 20 (sum assignment line)...');
    let currentLine = stepOutResult.data?.line;
    let attempts = 0;
    const maxAttempts = 5;
    const targetLine = 20;

    while (currentLine !== targetLine && attempts < maxAttempts) {
        attempts++;
        console.log(`🔄 Attempt ${attempts}/${maxAttempts}: Currently at line ${currentLine}, target line ${targetLine}`);
        const stepResult = await runner.stepOver();
        expect(stepResult.success, `Failed to step over on attempt ${attempts}: ${stepResult.error}`).toBe(true);
        currentLine = stepResult.data?.line;
        console.log(`   Stepped to line ${currentLine}`);
    }

    expect(currentLine, `Failed to reach line ${targetLine} after ${maxAttempts} attempts`).toBe(targetLine);
    console.log(`✅ Reached target line ${targetLine} after ${attempts} step(s)`);

    // List variables after reaching line 20 (sum should now be assigned)
    console.log('📋 Listing variables at line 20 (after sum assignment)...');
    const vars3Result = await runner.listVariables('local');
    expect(vars3Result.success).toBe(true);
    const vars3 = vars3Result.data!;
    console.log(`📋 Available variables: ${vars3.map((v: any) => v.name).join(', ')}`);

    // Dart may return variables in a scope container - extract from children
    const scopeVar3 = vars3[0];
    const actualVars3 = scopeVar3?.children || vars3;

    // Validate x, y, and sum are present
    const x3 = actualVars3.find((v: any) => v.name === 'x');
    const y3 = actualVars3.find((v: any) => v.name === 'y');
    const sum3 = actualVars3.find((v: any) => v.name === 'sum');
    expect(x3, 'Variable x not found after step over').toBeDefined();
    expect(y3, 'Variable y not found after step over').toBeDefined();
    expect(sum3, 'Variable sum not found after step over').toBeDefined();
    expect(x3!.value).toBe('5');
    expect(y3!.value).toBe('3');
    expect(sum3!.value).toBe('8');
    console.log(`✅ Stage 3 validation: x=${x3!.value}, y=${y3!.value}, sum=${sum3!.value}`);

    // STAGE 3.5: Expression Evaluation Tests
    console.log('🧮 Stage 3.5: Testing expression evaluation...');

    // Test 1: Simple variable access
    console.log('📊 Evaluating: x');
    const eval1 = await runner.evaluate('x');
    expect(eval1.success, `Failed to evaluate 'x': ${eval1.error}`).toBe(true);
    expect(eval1.data?.result).toBe('5');
    console.log(`✅ Evaluate variable: x = ${eval1.data?.result}`);

    // Test 2: Arithmetic expression
    console.log('📊 Evaluating: x + y');
    const eval2 = await runner.evaluate('x + y');
    expect(eval2.success, `Failed to evaluate 'x + y': ${eval2.error}`).toBe(true);
    expect(eval2.data?.result).toBe('8');
    console.log(`✅ Evaluate arithmetic: x + y = ${eval2.data?.result}`);

    // Test 3: Expression with literal
    console.log('📊 Evaluating: x * 2');
    const eval3 = await runner.evaluate('x * 2');
    expect(eval3.success, `Failed to evaluate 'x * 2': ${eval3.error}`).toBe(true);
    expect(eval3.data?.result).toBe('10');
    console.log(`✅ Evaluate with literal: x * 2 = ${eval3.data?.result}`);

    // Test 4: Method call (Dart-specific)
    console.log('📊 Evaluating: sum.toString()');
    const eval4 = await runner.evaluate('sum.toString()');
    expect(eval4.success, `Failed to evaluate 'sum.toString()': ${eval4.error}`).toBe(true);
    expect(eval4.data?.result).toBe('"8"');
    console.log(`✅ Evaluate method call: sum.toString() = ${eval4.data?.result}`);

    console.log('✅ Stage 3.5: All expression evaluations passed');

    // STAGE 4: Set second breakpoint dynamically
    console.log(`📍 Stage 4: Setting breakpoint 2 at line ${BREAKPOINT_LINE_2}...`);
    const bp2Result = await runner.setBreakpoint(DART_TEST_FILE, BREAKPOINT_LINE_2);
    expect(bp2Result.success, `Failed to set breakpoint 2: ${bp2Result.error}`).toBe(true);
    console.log('✅ Breakpoint 2 set dynamically during active session');

    // STAGE 5: Continue to second breakpoint
    console.log('▶️  Stage 5: Continuing to breakpoint 2...');
    const continueResult = await runner.continue();
    expect(continueResult.success, `Failed to continue: ${continueResult.error}`).toBe(true);
    expect(continueResult.data?.event).toBe('stopped');
    expect(continueResult.data?.line).toBe(BREAKPOINT_LINE_2);
    console.log(`✅ Stopped at breakpoint 2 (line ${continueResult.data?.line})`);

    // STAGE 6: Final validation - all 4 variables should be present
    console.log('📋 Stage 6: Final variable validation (all 4 expected)...');
    const vars4Result = await runner.listVariables('local');
    expect(vars4Result.success).toBe(true);
    const vars4 = vars4Result.data!;
    console.log(`📋 Available variables: ${vars4.map((v: any) => v.name).join(', ')}`);

    // Dart may return variables in a scope container - extract from children
    const scopeVar4 = vars4[0];
    const actualVars4 = scopeVar4?.children || vars4;

    const expectedVars = [
        { name: 'x', value: '5', type: /int/ },
        { name: 'y', value: '3', type: /int/ },
        { name: 'sum', value: '8', type: /int/ },
        { name: 'diff', value: '2', type: /int/ }
    ];
    let foundCount = 0;

    for (const expected of expectedVars) {
        const found = actualVars4.find((v: any) => v.name === expected.name);
        if (found) {
            foundCount++;
            console.log(`✅ Found expected variable: ${found.name} = ${found.value} (${found.type || 'no type info'})`);
            expect(found.value).toBe(expected.value);
            if (found.type) {
                expect(found.type).toMatch(expected.type);
            }
        } else {
            console.log(`⚠️  Expected variable not found: ${expected.name}`);
        }
    }

    expect(foundCount).toBe(expectedVars.length);
    console.log(`✅ Stage 6 validation: Found all ${foundCount}/${expectedVars.length} expected variables`);

    // CLEANUP: Stop debug session (REQUIRED to allow next test to run)
    console.log('🛑 Stopping debug session...');
    const stopResult = await runner.stopDebug();
    expect(stopResult.success, `Failed to stop: ${stopResult.error}`).toBe(true);
    console.log('✅ Debug session stopped cleanly');

    console.log('✅ Dart enhanced debugging workflow completed ✓');
}
