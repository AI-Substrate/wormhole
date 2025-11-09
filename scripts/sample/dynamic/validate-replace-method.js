#!/usr/bin/env node
/**
 * Phase 4 Validation: Test core replace-method.js script
 *
 * Purpose: Validate T007-T013 implementation matches TAD patterns
 * Run: vscb script run -f scripts/sample/dynamic/validate-replace-method.js
 *
 * Tests:
 * 1. Simple function replacement (Python - add_numbers)
 * 2. Class method replacement (Python - TestMathCalculator.test_addition)
 * 3. JavaScript function replacement
 * 4. Empty string deletion (Python - test_division_by_zero)
 * 5. Error handling validation (E_NOT_FOUND)
 */

const path = require('path');

module.exports = {
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;
        const results = [];

        // Test 1: Simple function replacement via nodeId
        try {
            const scriptRegistry = bridgeContext.extensionContext.scriptRegistry;
            const script = await scriptRegistry.loadScript('code.replace-method');

            // Test with path+symbol input (not nodeId for now)
            const result = await script.execute(bridgeContext, {
                path: path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py'),
                symbol: 'add_numbers',
                replacement: 'def add_numbers(a: int, b: int) -> int:\n    """Add two numbers (validated)."""\n    return a + b'
            });

            results.push({
                test: '1-simple-function',
                success: result.success,
                applied: result.details?.applied,
                totalFiles: result.details?.totalFiles,
                succeeded: result.details?.succeeded?.length,
                failed: result.details?.failed?.length,
                note: result.success ? '✅ SIMPLE FUNCTION REPLACEMENT WORKS' : '❌ FAILED'
            });
        } catch (error) {
            results.push({ test: '1-simple-function', error: error.message, stack: error.stack });
        }

        // Test 2: Class method replacement via path+symbol
        try {
            const scriptRegistry = bridgeContext.extensionContext.scriptRegistry;
            const script = await scriptRegistry.loadScript('code.replace-method');

            const result = await script.execute(bridgeContext, {
                path: path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py'),
                symbol: 'TestMathCalculator.test_addition',
                replacement: '    def test_addition(self):\n        """Test addition with enhanced logging."""\n        print("Testing addition...")\n        result = self.add(2, 3)\n        assert result == 5\n        print(f"Success: {result}")'
            });

            results.push({
                test: '2-class-method',
                success: result.success,
                applied: result.details?.applied,
                note: result.success ? '✅ CLASS METHOD REPLACEMENT WORKS' : '❌ FAILED'
            });
        } catch (error) {
            results.push({ test: '2-class-method', error: error.message, stack: error.stack });
        }

        // Test 3: JavaScript function replacement
        try {
            const scriptRegistry = bridgeContext.extensionContext.scriptRegistry;
            const script = await scriptRegistry.loadScript('code.replace-method');

            const result = await script.execute(bridgeContext, {
                path: path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'javascript', 'simple-debug-test.js'),
                symbol: 'testVariableModification',
                replacement: '/**\n * testVariableModification - Validated version\n */\nfunction testVariableModification(a, b) {\n    if (typeof a !== "number" || typeof b !== "number") {\n        throw new TypeError("Arguments must be numbers");\n    }\n    return a + b;\n}'
            });

            results.push({
                test: '3-javascript-function',
                success: result.success,
                note: result.success ? '✅ JS FUNCTION REPLACEMENT WORKS' : '❌ FAILED'
            });
        } catch (error) {
            results.push({ test: '3-javascript-function', error: error.message, stack: error.stack });
        }

        // Test 4: Empty string deletion
        try {
            const scriptRegistry = bridgeContext.extensionContext.scriptRegistry;
            const script = await scriptRegistry.loadScript('code.replace-method');

            const result = await script.execute(bridgeContext, {
                path: path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py'),
                symbol: 'TestMathCalculator.test_division_by_zero',
                replacement: ''
            });

            results.push({
                test: '4-empty-string-deletion',
                success: result.success,
                note: result.success ? '✅ DELETION WORKS (INSIGHT #4 VALIDATED)' : '❌ FAILED'
            });
        } catch (error) {
            results.push({ test: '4-empty-string-deletion', error: error.message, stack: error.stack });
        }

        // Test 5: Error handling - E_NOT_FOUND
        try {
            const scriptRegistry = bridgeContext.extensionContext.scriptRegistry;
            const script = await scriptRegistry.loadScript('code.replace-method');

            const result = await script.execute(bridgeContext, {
                path: path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py'),
                symbol: 'nonexistent_function',
                replacement: 'def nonexistent(): pass'
            });

            results.push({
                test: '5-error-handling',
                success: result.success === false,  // Expect failure
                errorCode: result.reason?.code || result.reason,
                note: result.success === false && result.reason?.includes('NOT_FOUND') ? '✅ ERROR HANDLING WORKS (E_NOT_FOUND)' : '❌ WRONG ERROR'
            });
        } catch (error) {
            results.push({ test: '5-error-handling', error: error.message });
        }

        return {
            success: true,
            results,
            summary: {
                total: results.length,
                passed: results.filter(r => r.note && r.note.includes('✅')).length,
                failed: results.filter(r => r.note && r.note.includes('❌')).length,
                errors: results.filter(r => r.error).length
            }
        };
    }
};
