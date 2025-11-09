#!/usr/bin/env node
/**
 * Dynamic TAD Exploration: Signature Change Patterns
 *
 * Purpose: Explore method replacement with signature modifications
 * - Async conversion (add async keyword, Promise return)
 * - Parameter changes (add/remove/reorder parameters)
 * - Return type changes (TypeScript)
 *
 * Run: vscb script run -f scripts/sample/dynamic/explore-signature-change.js
 *
 * Expected behavior:
 * - Whole-symbol replacement handles signature changes
 * - LSP providers may flag import issues (user must fix manually)
 * - Changes persist to disk after document save
 */

const path = require('path');

module.exports = {
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;
        const results = [];

        // Test 1: Async conversion (Python)
        try {
            results.push(await exploreAsyncConversion(vscode));
        } catch (error) {
            results.push({ test: 'async-conversion', error: error.message, stack: error.stack });
        }

        // Test 2: Parameter addition (Python)
        try {
            results.push(await exploreParameterAddition(vscode));
        } catch (error) {
            results.push({ test: 'parameter-addition', error: error.message, stack: error.stack });
        }

        // Test 3: Empty replacement (method deletion)
        try {
            results.push(await exploreMethodDeletion(vscode));
        } catch (error) {
            results.push({ test: 'method-deletion', error: error.message, stack: error.stack });
        }

        return { success: true, results };
    }
};

async function exploreAsyncConversion(vscode) {
    // Use test/python/test_example.py
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py');
    const uri = vscode.Uri.file(testFile);

    // Get document symbols
    const symbols = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        uri
    );

    // Find TestMathCalculator class -> test_division method
    const calculatorClass = symbols.find(s => s.name === 'TestMathCalculator' && s.kind === vscode.SymbolKind.Class);
    const divisionMethod = calculatorClass?.children.find(s => s.name === 'test_division');

    if (!divisionMethod) {
        throw new Error('Could not find "test_division" method');
    }

    // Capture old text
    const doc = await vscode.workspace.openTextDocument(uri);
    const oldText = doc.getText(divisionMethod.range);

    // Convert to async (Python async/await pattern)
    const newText = `    async def test_division(self):
        """Test division with async pattern."""
        import asyncio
        await asyncio.sleep(0)  # Simulate async operation
        result = self.divide(10, 2)
        assert result == 5`;

    // Create and apply WorkspaceEdit
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, divisionMethod.range, newText);

    const applied = await vscode.workspace.applyEdit(edit);

    if (applied) {
        const freshDoc = await vscode.workspace.openTextDocument(uri);
        await freshDoc.save();
    }

    return {
        test: 'async-conversion',
        methodName: divisionMethod.name,
        signatureChange: 'def test_division -> async def test_division',
        oldTextLength: oldText.length,
        newTextLength: newText.length,
        applied,
        note: applied ? '✅ ASYNC CONVERSION APPLIED & SAVED' : '❌ CONVERSION FAILED'
    };
}

async function exploreParameterAddition(vscode) {
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py');
    const uri = vscode.Uri.file(testFile);

    // Get document symbols
    const symbols = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        uri
    );

    // Find subtract function (standalone function, not in class)
    const subtractFunction = symbols.find(s => s.name === 'subtract' && s.kind === vscode.SymbolKind.Function);

    if (!subtractFunction) {
        throw new Error('Could not find "subtract" function');
    }

    // Capture old text
    const doc = await vscode.workspace.openTextDocument(uri);
    const oldText = doc.getText(subtractFunction.range);

    // Add optional message parameter with default value
    const newText = `def subtract(a: int, b: int, message: str = "") -> int:
    """Subtract b from a with optional message."""
    if message:
        print(message)
    return a - b`;

    // Create and apply WorkspaceEdit
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, subtractFunction.range, newText);

    const applied = await vscode.workspace.applyEdit(edit);

    if (applied) {
        const freshDoc = await vscode.workspace.openTextDocument(uri);
        await freshDoc.save();
    }

    return {
        test: 'parameter-addition',
        functionName: subtractFunction.name,
        signatureChange: 'subtract(a, b) -> subtract(a, b, message="")',
        oldTextLength: oldText.length,
        newTextLength: newText.length,
        applied,
        note: applied ? '✅ PARAMETER ADDITION APPLIED & SAVED' : '❌ ADDITION FAILED'
    };
}

async function exploreMethodDeletion(vscode) {
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py');
    const uri = vscode.Uri.file(testFile);

    // Get document symbols
    const symbols = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        uri
    );

    // Find TestMathCalculator class -> test_division_by_zero method (we'll delete this)
    const calculatorClass = symbols.find(s => s.name === 'TestMathCalculator');
    const divByZeroMethod = calculatorClass?.children.find(s => s.name === 'test_division_by_zero');

    if (!divByZeroMethod) {
        throw new Error('Could not find "test_division_by_zero" method');
    }

    // Capture old text
    const doc = await vscode.workspace.openTextDocument(uri);
    const oldText = doc.getText(divByZeroMethod.range);

    // Empty replacement = deletion (Insight #4 - simple empty string)
    const newText = '';

    // Create and apply WorkspaceEdit
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, divByZeroMethod.range, newText);

    const applied = await vscode.workspace.applyEdit(edit);

    if (applied) {
        const freshDoc = await vscode.workspace.openTextDocument(uri);
        await freshDoc.save();
    }

    return {
        test: 'method-deletion',
        methodName: divByZeroMethod.name,
        signatureChange: 'test_division_by_zero method -> DELETED (empty string)',
        oldTextLength: oldText.length,
        newTextLength: 0,
        oldTextPreview: oldText.substring(0, 100),
        applied,
        note: applied ? '✅ METHOD DELETION APPLIED & SAVED (Insight #4 validated)' : '❌ DELETION FAILED'
    };
}
