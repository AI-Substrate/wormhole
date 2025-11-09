/**
 * Dynamic Script: Explore References (TAD Probe)
 *
 * Purpose: Explore LSP references behavior with real language servers
 * Usage: cd test && vscb script run -f ../scripts/sample/dynamic/explore-references.js
 *
 * Hot-reload workflow (0s rebuild):
 * 1. Edit this file
 * 2. Save
 * 3. Run command above
 * 4. Observe output instantly
 *
 * This script explores:
 * - Basic reference finding with Flowspace IDs
 * - includeDeclaration tri-state behavior (true/false/undefined)
 * - Symbol name resolution (path + symbol)
 * - Error handling (missing symbols, timeouts)
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const log = bridgeContext.logger.info.bind(bridgeContext.logger);

    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('🔍 Exploring References with Real LSP');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        // Test fixture: Python test file
        const testFile = '/workspaces/vscode-bridge/test/python/test_example.py';
        const uri = vscode.Uri.file(testFile);

        // Open document to ensure language server is active
        const doc = await vscode.workspace.openTextDocument(uri);
        log(`✓ Opened ${testFile}`);

        // Test 1: Find references to 'add' function
        log('\n📍 Test 1: Find references to add() function');
        log('Looking for: function:test/python/test_example.py:add');

        // Get document symbols to find 'add' function position
        const symbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            uri
        );

        const addFunc = symbols.find(s => s.name === 'add');
        if (!addFunc) {
            log('❌ Could not find "add" function in symbols');
            return { success: false, error: 'Symbol not found' };
        }

        const addPosition = addFunc.selectionRange.start;
        log(`✓ Found "add" at line ${addPosition.line + 1}, char ${addPosition.character}`);

        // Call references provider
        const refs = await vscode.commands.executeCommand(
            'vscode.executeReferenceProvider',
            uri,
            addPosition,
            { includeDeclaration: true }
        );

        log(`✓ Found ${refs ? refs.length : 0} references`);
        if (refs && refs.length > 0) {
            refs.forEach((ref, i) => {
                log(`  [${i}] ${ref.uri.fsPath}:${ref.range.start.line + 1}:${ref.range.start.character}`);
            });
        }

        // Test 2: Test includeDeclaration behavior
        log('\n📍 Test 2: Test includeDeclaration tri-state');

        const refsWithDecl = await vscode.commands.executeCommand(
            'vscode.executeReferenceProvider',
            uri,
            addPosition,
            { includeDeclaration: true }
        );

        const refsWithoutDecl = await vscode.commands.executeCommand(
            'vscode.executeReferenceProvider',
            uri,
            addPosition,
            { includeDeclaration: false }
        );

        const refsDefault = await vscode.commands.executeCommand(
            'vscode.executeReferenceProvider',
            uri,
            addPosition,
            {}  // No context - provider default
        );

        log(`  includeDeclaration=true:  ${refsWithDecl?.length || 0} results`);
        log(`  includeDeclaration=false: ${refsWithoutDecl?.length || 0} results`);
        log(`  includeDeclaration=undefined: ${refsDefault?.length || 0} results`);

        // Test 3: Test with JavaScript file
        log('\n📍 Test 3: JavaScript file references');
        const jsFile = '/workspaces/vscode-bridge/test/javascript/auth-mocks.js';
        const jsUri = vscode.Uri.file(jsFile);
        const jsDoc = await vscode.workspace.openTextDocument(jsUri);

        const jsSymbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            jsUri
        );

        const findUserFunc = jsSymbols.find(s => s.name === 'findUserByUsername');
        if (findUserFunc) {
            const jsRefs = await vscode.commands.executeCommand(
                'vscode.executeReferenceProvider',
                jsUri,
                findUserFunc.selectionRange.start,
                { includeDeclaration: true }
            );

            log(`✓ Found ${jsRefs?.length || 0} references to findUserByUsername()`);
            if (jsRefs && jsRefs.length > 0) {
                jsRefs.slice(0, 3).forEach((ref, i) => {
                    const relPath = ref.uri.fsPath.replace('/workspaces/vscode-bridge/', '');
                    log(`  [${i}] ${relPath}:${ref.range.start.line + 1}`);
                });
            }
        }

        // Test 4: Error handling - nonexistent symbol
        log('\n📍 Test 4: Error handling - nonexistent symbol');
        const badPosition = new vscode.Position(999, 0);
        try {
            const badRefs = await vscode.commands.executeCommand(
                'vscode.executeReferenceProvider',
                uri,
                badPosition,
                {}
            );
            log(`  Result for bad position: ${badRefs ? badRefs.length : 'null'} (no error thrown)`);
        } catch (error) {
            log(`  ✓ Error caught: ${error.message}`);
        }

        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('✅ Exploration Complete');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        return {
            success: true,
            tests: {
                test1_basic_references: refs?.length || 0,
                test2_includeDeclaration_true: refsWithDecl?.length || 0,
                test2_includeDeclaration_false: refsWithoutDecl?.length || 0,
                test2_includeDeclaration_default: refsDefault?.length || 0,
                test3_javascript_refs: jsSymbols ? 'found symbols' : 'no symbols',
                test4_error_handling: 'passed'
            }
        };

    } catch (error) {
        log(`\n❌ Error: ${error.message}`);
        log(error.stack);
        return { success: false, error: error.message };
    }
};
