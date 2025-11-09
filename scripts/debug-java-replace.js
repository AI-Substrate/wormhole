/**
 * Debug Java replace-method Issue
 *
 * Problem: Java file path contains $(pwd) literally instead of being expanded
 * Error: "Unable to resolve nonexistent file '...$(pwd)/integration-simple/java/...'"
 *
 * This script will:
 * 1. Test path resolution for Java file
 * 2. Attempt symbol search to find the 'add' method
 * 3. Try LSP-based method replacement
 * 4. Log detailed diagnostics
 *
 * Usage:
 *   cd /workspaces/vscode-bridge/test
 *   vscb script run -f ../scripts/debug-java-replace.js
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const logger = bridgeContext.logger;

    console.log('\n🔍 DEBUG: Java replace-method Issue\n');
    console.log('=' .repeat(60));

    // Step 1: Define file paths
    const javaFilePath = '/workspaces/vscode-bridge/test/integration-simple/java/src/test/java/com/example/DebugTest.java';
    const symbol = 'add';
    const replacement = `    private int add(int a, int b) {
        int result = a + b;
        return result;
    }`;

    console.log('\n📍 Step 1: File Path Resolution');
    console.log('Target file:', javaFilePath);
    console.log('Symbol:', symbol);

    // Step 2: Check if file exists via VS Code
    const uri = vscode.Uri.file(javaFilePath);
    console.log('\n📂 Step 2: File Existence Check');
    console.log('URI:', uri.toString());

    try {
        const doc = await vscode.workspace.openTextDocument(uri);
        console.log('✅ File opened successfully');
        console.log('   Language:', doc.languageId);
        console.log('   Line count:', doc.lineCount);
        console.log('   Is dirty:', doc.isDirty);
        console.log('   URI scheme:', doc.uri.scheme);
        console.log('   URI fsPath:', doc.uri.fsPath);
    } catch (error) {
        console.log('❌ Failed to open file:', error.message);
        return {
            success: false,
            error: 'File not accessible',
            details: error.message
        };
    }

    // Step 3: Get document symbols
    console.log('\n🔍 Step 3: Symbol Discovery');
    try {
        const symbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            uri
        );

        console.log(`✅ Found ${symbols?.length || 0} top-level symbols`);

        // Flatten and find our target symbol
        const flatSymbols = [];
        function flattenSymbols(syms, prefix = '') {
            for (const sym of syms || []) {
                flatSymbols.push({
                    name: sym.name,
                    kind: sym.kind,
                    range: sym.range,
                    selectionRange: sym.selectionRange
                });
                if (sym.children) {
                    flattenSymbols(sym.children, `${prefix}${sym.name}.`);
                }
            }
        }
        flattenSymbols(symbols);

        console.log('   All symbols:', flatSymbols.map(s => s.name).join(', '));

        const addSymbol = flatSymbols.find(s => s.name === symbol);
        if (addSymbol) {
            console.log(`✅ Found '${symbol}' method`);
            console.log('   Range:', `L${addSymbol.range.start.line + 1}-${addSymbol.range.end.line + 1}`);
            console.log('   Selection:', `L${addSymbol.selectionRange.start.line + 1}`);
        } else {
            console.log(`⚠️  Symbol '${symbol}' not found directly`);
            console.log('   Available symbols:', flatSymbols.map(s => s.name).join(', '));

            // Maybe Java LSP isn't ready - let's still continue with diagnostic info
            console.log('\n⚠️  Continuing diagnostic without symbol...');

            return {
                success: false,
                error: 'Symbol not found - Java LSP may not be ready',
                availableSymbols: flatSymbols.map(s => s.name),
                recommendation: 'Wait for Java LSP to initialize, or check if file is in workspace'
            };
        }

        // Step 4: Attempt replacement using WorkspaceEdit
        console.log('\n✏️  Step 4: Method Replacement Attempt');

        const doc = await vscode.workspace.openTextDocument(uri);

        // Create edit range from symbol range
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            uri,
            addSymbol.range,
            replacement
        );

        console.log('   Edit created for range:',
            `L${addSymbol.range.start.line + 1}:${addSymbol.range.start.character}` +
            ` to L${addSymbol.range.end.line + 1}:${addSymbol.range.end.character}`
        );

        // Apply the edit
        const applied = await vscode.workspace.applyEdit(edit);
        console.log('   Edit applied:', applied ? '✅ YES' : '❌ NO');

        if (!applied) {
            return {
                success: false,
                error: 'WorkspaceEdit failed to apply',
                symbolFound: true,
                editCreated: true
            };
        }

        // Step 5: Try to save the document
        console.log('\n💾 Step 5: Save Document');
        try {
            await doc.save();
            console.log('✅ Document saved successfully');
        } catch (saveError) {
            console.log('❌ Save failed:', saveError.message);
            return {
                success: false,
                error: 'Save failed',
                details: saveError.message
            };
        }

        // Step 6: Verify the change
        console.log('\n✅ Step 6: Verification');
        const updatedDoc = await vscode.workspace.openTextDocument(uri);
        const methodText = updatedDoc.getText(addSymbol.range);
        console.log('   Updated method text:');
        console.log('   ' + methodText.split('\n').join('\n   '));

        console.log('\n' + '='.repeat(60));
        console.log('✅ SUCCESS: Method replacement completed\n');

        return {
            success: true,
            data: {
                file: javaFilePath,
                symbol: symbol,
                applied: true,
                saved: true,
                range: {
                    start: { line: addSymbol.range.start.line, character: addSymbol.range.start.character },
                    end: { line: addSymbol.range.end.line, character: addSymbol.range.end.character }
                }
            }
        };

    } catch (error) {
        console.log('\n❌ Error during symbol operations:', error.message);
        console.log('   Stack:', error.stack);
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
};
