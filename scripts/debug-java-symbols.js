/**
 * Debug Java Symbol Discovery
 *
 * Compare what different symbol providers return for the Java file
 * to understand why replace-method can't find "add" but goto-line can
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;

    const javaFile = '/workspaces/vscode-bridge/test/integration-simple/java/src/test/java/com/example/DebugTest.java';
    const uri = vscode.Uri.file(javaFile);

    console.log('\n🔍 Java Symbol Discovery Comparison\n');
    console.log('=' .repeat(70));

    // Open the document
    const doc = await vscode.workspace.openTextDocument(uri);
    console.log(`\n✅ Document opened: ${doc.fileName}`);
    console.log(`   Language: ${doc.languageId}`);
    console.log(`   Lines: ${doc.lineCount}`);

    // Variables to track across methods
    let docSymbols = null;
    let addSymbol = null;

    // Method 1: Document Symbol Provider (used by goto-line)
    console.log('\n📋 Method 1: Document Symbol Provider');
    console.log('   Command: vscode.executeDocumentSymbolProvider');

    try {
        docSymbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            uri
        );

        console.log(`   ✅ Found ${docSymbols?.length || 0} top-level symbols`);

        function printSymbols(symbols, indent = '   ') {
            for (const sym of symbols || []) {
                console.log(`${indent}- ${sym.name} (kind: ${sym.kind})`);
                console.log(`${indent}  Range: L${sym.range.start.line + 1}:${sym.range.start.character} - L${sym.range.end.line + 1}:${sym.range.end.character}`);
                console.log(`${indent}  Selection: L${sym.selectionRange.start.line + 1}:${sym.selectionRange.start.character}`);
                if (sym.children && sym.children.length > 0) {
                    printSymbols(sym.children, indent + '    ');
                }
            }
        }

        printSymbols(docSymbols);

        // Flatten to find "add"
        const flatSymbols = [];
        function flatten(syms) {
            for (const sym of syms || []) {
                flatSymbols.push(sym);
                if (sym.children) flatten(sym.children);
            }
        }
        flatten(docSymbols);

        addSymbol = flatSymbols.find(s => s.name === 'add');
        if (addSymbol) {
            console.log(`\n   ✅ Found "add" symbol via DocumentSymbolProvider`);
            console.log(`      Kind: ${addSymbol.kind}`);
            console.log(`      Range: L${addSymbol.range.start.line + 1}-${addSymbol.range.end.line + 1}`);
        } else {
            console.log(`\n   ❌ "add" NOT found in flattened symbols`);
        }

    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    // Method 2: Workspace Symbol Search (might be used by replace-method?)
    console.log('\n🔎 Method 2: Workspace Symbol Search');
    console.log('   Command: vscode.executeWorkspaceSymbolProvider');

    try {
        const workspaceSymbols = await vscode.commands.executeCommand(
            'vscode.executeWorkspaceSymbolProvider',
            'add'
        );

        console.log(`   ✅ Found ${workspaceSymbols?.length || 0} workspace symbols matching "add"`);

        for (const sym of workspaceSymbols || []) {
            console.log(`   - ${sym.name} in ${sym.location.uri.fsPath}`);
            console.log(`     Range: L${sym.location.range.start.line + 1}`);
        }

        const javaAdd = workspaceSymbols?.find(s =>
            s.location.uri.fsPath.includes('DebugTest.java') && s.name === 'add'
        );

        if (javaAdd) {
            console.log(`\n   ✅ Found "add" in DebugTest.java via workspace search`);
        } else {
            console.log(`\n   ❌ "add" in DebugTest.java NOT found in workspace search`);
        }

    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    // Method 3: Text search for the method definition
    console.log('\n📝 Method 3: Text Pattern Analysis');

    const methodPattern = /private\s+int\s+add\s*\(/g;
    const text = doc.getText();
    const matches = [...text.matchAll(methodPattern)];

    console.log(`   Found ${matches.length} text matches for "private int add("`);
    for (const match of matches) {
        const offset = match.index;
        const position = doc.positionAt(offset);
        console.log(`   - Match at line ${position.line + 1}, character ${position.character}`);
    }

    // Method 4: Check what replace-method actually gets
    console.log('\n🔧 Method 4: Simulating replace-method Symbol Lookup');
    console.log('   (This is what the actual script does)');

    // Read the actual replace-method.ts to see how it finds symbols
    const replaceMethodPath = '/workspaces/vscode-bridge/packages/extension/src/vsc-scripts/code/replace-method.ts';
    try {
        const replaceDoc = await vscode.workspace.openTextDocument(replaceMethodPath);
        const replaceText = replaceDoc.getText();

        // Look for the symbol finding logic
        if (replaceText.includes('executeDocumentSymbolProvider')) {
            console.log('   ✅ replace-method DOES use executeDocumentSymbolProvider');
        } else {
            console.log('   ⚠️  replace-method might use different symbol lookup');
        }

        // Check for filtering logic
        if (replaceText.includes('kind') && replaceText.includes('Method')) {
            console.log('   ✅ replace-method filters by symbol kind');
        }

    } catch (error) {
        console.log(`   ⚠️  Could not read replace-method.ts: ${error.message}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Diagnostic complete\n');

    return {
        success: true,
        documentSymbolsFound: docSymbols?.length || 0,
        addSymbolFound: !!addSymbol
    };
};
