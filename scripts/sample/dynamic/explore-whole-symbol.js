#!/usr/bin/env node
/**
 * Dynamic TAD Exploration: Whole-Symbol Method Replacement
 *
 * Purpose: Explore method replacement using DocumentSymbol.range
 * - Get symbol via executeDocumentSymbolProvider
 * - Create WorkspaceEdit with TextEdit using symbol.range
 * - Test whole-symbol replacement (signature + body)
 *
 * Run: vscb script run -f scripts/sample/dynamic/explore-whole-symbol.js
 *
 * Expected behavior:
 * - DocumentSymbol.range covers entire method declaration
 * - WorkspaceEdit replaces entire method atomically
 * - Document save persists changes to disk
 */

const path = require('path');

module.exports = {
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;
        const results = [];

        // Test 1: Simple function replacement (Python)
        try {
            results.push(await exploreSimpleFunctionReplacement(vscode));
        } catch (error) {
            results.push({ test: 'simple-function', error: error.message, stack: error.stack });
        }

        // Test 2: Class method replacement (Python)
        try {
            results.push(await exploreClassMethodReplacement(vscode));
        } catch (error) {
            results.push({ test: 'class-method', error: error.message, stack: error.stack });
        }

        // Test 3: JavaScript function replacement
        try {
            results.push(await exploreJavaScriptFunctionReplacement(vscode));
        } catch (error) {
            results.push({ test: 'javascript-function', error: error.message, stack: error.stack });
        }

        return { success: true, results };
    }
};

async function exploreSimpleFunctionReplacement(vscode) {
    // Use test/python/test_example.py
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py');
    const uri = vscode.Uri.file(testFile);

    // Get document symbols
    const symbols = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        uri
    );

    if (!symbols || symbols.length === 0) {
        throw new Error('No symbols found in document');
    }

    // Find the 'add_numbers' function
    const addFunction = symbols.find(s => s.name === 'add_numbers' && s.kind === vscode.SymbolKind.Function);

    if (!addFunction) {
        throw new Error('Could not find "add_numbers" function symbol');
    }

    // Capture old text before replacement
    const doc = await vscode.workspace.openTextDocument(uri);
    const oldText = doc.getText(addFunction.range);

    // Create replacement text (add logging to the function)
    const newText = `def add_numbers(a: int, b: int) -> int:
    """Add two numbers with logging."""
    print(f"Adding {a} + {b}")
    result = a + b
    print(f"Result: {result}")
    return result`;

    // Create WorkspaceEdit
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, addFunction.range, newText);

    // Apply edit
    const applied = await vscode.workspace.applyEdit(edit);

    // CRITICAL: Save document to persist changes
    if (applied) {
        const freshDoc = await vscode.workspace.openTextDocument(uri);
        await freshDoc.save();
    }

    return {
        test: 'simple-function',
        symbolName: addFunction.name,
        symbolKind: vscode.SymbolKind[addFunction.kind],
        range: {
            start: { line: addFunction.range.start.line, char: addFunction.range.start.character },
            end: { line: addFunction.range.end.line, char: addFunction.range.end.character }
        },
        oldTextLength: oldText.length,
        newTextLength: newText.length,
        oldTextPreview: oldText.substring(0, 50) + '...',
        newTextPreview: newText.substring(0, 50) + '...',
        applied,
        note: applied ? '✅ REPLACEMENT APPLIED & SAVED' : '❌ REPLACEMENT FAILED'
    };
}

async function exploreClassMethodReplacement(vscode) {
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py');
    const uri = vscode.Uri.file(testFile);

    // Get document symbols
    const symbols = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        uri
    );

    // Find TestMathCalculator class
    const calculatorClass = symbols.find(s => s.name === 'TestMathCalculator' && s.kind === vscode.SymbolKind.Class);

    if (!calculatorClass) {
        throw new Error('Could not find "TestMathCalculator" class');
    }

    // Find 'test_addition' method within TestMathCalculator class
    const addMethod = calculatorClass.children.find(s => s.name === 'test_addition' && s.kind === vscode.SymbolKind.Method);

    if (!addMethod) {
        throw new Error('Could not find "test_addition" method in TestMathCalculator class');
    }

    // Capture old text
    const doc = await vscode.workspace.openTextDocument(uri);
    const oldText = doc.getText(addMethod.range);

    // Create replacement with enhanced validation
    const newText = `    def test_addition(self):
        """Test addition in calculator with validation."""
        a, b = 2, 3
        result = self.add(a, b)
        # Enhanced validation
        assert isinstance(result, int), "Result must be an integer"
        assert result == 5, f"Expected 5, got {result}"`;

    // Create WorkspaceEdit
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, addMethod.range, newText);

    // Apply and save
    const applied = await vscode.workspace.applyEdit(edit);

    if (applied) {
        const freshDoc = await vscode.workspace.openTextDocument(uri);
        await freshDoc.save();
    }

    return {
        test: 'class-method',
        className: calculatorClass.name,
        methodName: addMethod.name,
        methodKind: vscode.SymbolKind[addMethod.kind],
        range: {
            start: { line: addMethod.range.start.line, char: addMethod.range.start.character },
            end: { line: addMethod.range.end.line, char: addMethod.range.end.character }
        },
        oldTextLength: oldText.length,
        newTextLength: newText.length,
        applied,
        note: applied ? '✅ METHOD REPLACEMENT APPLIED & SAVED' : '❌ REPLACEMENT FAILED'
    };
}

async function exploreJavaScriptFunctionReplacement(vscode) {
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'javascript', 'simple-debug-test.js');
    const uri = vscode.Uri.file(testFile);

    // Get document symbols
    const symbols = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        uri
    );

    // Find a function to replace (use 'add' if it exists, or first function)
    const functionSymbol = symbols.find(s => s.kind === vscode.SymbolKind.Function);

    if (!functionSymbol) {
        throw new Error('No function symbols found');
    }

    // Capture old text
    const doc = await vscode.workspace.openTextDocument(uri);
    const oldText = doc.getText(functionSymbol.range);

    // Create replacement text (add JSDoc and error handling)
    const newText = `/**
 * ${functionSymbol.name} - Enhanced with documentation
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
function ${functionSymbol.name}(a, b) {
    if (typeof a !== 'number' || typeof b !== 'number') {
        throw new TypeError('Arguments must be numbers');
    }
    return a + b;
}`;

    // Create WorkspaceEdit
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, functionSymbol.range, newText);

    // Apply and save
    const applied = await vscode.workspace.applyEdit(edit);

    if (applied) {
        const freshDoc = await vscode.workspace.openTextDocument(uri);
        await freshDoc.save();
    }

    return {
        test: 'javascript-function',
        functionName: functionSymbol.name,
        functionKind: vscode.SymbolKind[functionSymbol.kind],
        range: {
            start: { line: functionSymbol.range.start.line, char: functionSymbol.range.start.character },
            end: { line: functionSymbol.range.end.line, char: functionSymbol.range.end.character }
        },
        oldTextLength: oldText.length,
        newTextLength: newText.length,
        applied,
        note: applied ? '✅ JS FUNCTION REPLACEMENT APPLIED & SAVED' : '❌ REPLACEMENT FAILED'
    };
}
