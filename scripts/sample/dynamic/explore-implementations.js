/**
 * Dynamic Script: Explore Implementations (TAD Probe)
 *
 * Purpose: Explore LSP implementations behavior with real language servers
 * Usage: cd test && vscb script run -f ../scripts/sample/dynamic/explore-implementations.js
 *
 * Hot-reload workflow (0s rebuild):
 * 1. Edit this file
 * 2. Save
 * 3. Run command above
 * 4. Observe output instantly
 *
 * This script explores:
 * - Implementations for TypeScript interfaces
 * - Flowspace ID input validation
 * - Empty results for concrete classes (not an error)
 * - Language-specific error handling
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const log = bridgeContext.logger.info.bind(bridgeContext.logger);

    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('🔍 Exploring Implementations with Real LSP');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        // Test 1: TypeScript interface implementations (using extension source)
        log('\n📍 Test 1: TypeScript interface implementations');
        log('Looking for: IDebugAdapter implementations in extension source');

        // Use extension source - ScriptRegistry and other interfaces
        const tsFile = '/workspaces/vscode-bridge/packages/extension/src/core/registry/ScriptRegistry.ts';
        const tsUri = vscode.Uri.file(tsFile);

        try {
            const tsDoc = await vscode.workspace.openTextDocument(tsUri);
            log(`✓ Opened ${tsFile}`);

            // Get symbols to find an interface
            const tsSymbols = await vscode.commands.executeCommand(
                'vscode.executeDocumentSymbolProvider',
                tsUri
            );

            if (!tsSymbols || tsSymbols.length === 0) {
                log('  No symbols found - TypeScript may not be indexed yet');
            } else {
                // Look for any interface
                const iface = tsSymbols.find(s => s.kind === 10);  // 10 = Interface
                if (iface) {
                    log(`✓ Found interface: ${iface.name}`);

                    const impls = await vscode.commands.executeCommand(
                        'vscode.executeImplementationProvider',
                        tsUri,
                        iface.selectionRange.start
                    );

                    log(`✓ Found ${impls ? impls.length : 0} implementations`);
                    if (impls && impls.length > 0) {
                        impls.slice(0, 3).forEach((impl, i) => {
                            const loc = impl.targetUri ? impl.targetUri : impl.uri;
                            const range = impl.targetRange ? impl.targetRange : impl.range;
                            const relPath = loc.fsPath.replace('/workspaces/vscode-bridge/', '');
                            log(`  [${i}] ${relPath}:${range.start.line + 1}`);
                        });
                    }
                } else {
                    log('  No interfaces found in ScriptRegistry.ts');
                }
            }
        } catch (error) {
            log(`  Note: ${error.message} (TypeScript source may not be available in test workspace)`);
        }

        // Test 2: Empty implementations for concrete class (edge case)
        log('\n📍 Test 2: Empty implementations for concrete class');
        log('Looking for: Concrete class should return empty array, not error');

        const pyFile = '/workspaces/vscode-bridge/test/python/test_example.py';
        const pyUri = vscode.Uri.file(pyFile);
        const pyDoc = await vscode.workspace.openTextDocument(pyUri);

        const pySymbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            pyUri
        );

        const pyClass = pySymbols.find(s => s.kind === 4);  // 4 = Class
        if (pyClass) {
            log(`✓ Found class: ${pyClass.name}`);

            const pyImpls = await vscode.commands.executeCommand(
                'vscode.executeImplementationProvider',
                pyUri,
                pyClass.selectionRange.start
            );

            log(`✓ Result: ${pyImpls ? pyImpls.length : 'null'} implementations (expected: 0 or null for concrete class)`);
        }

        // Test 3: JavaScript (no interface concept)
        log('\n📍 Test 3: JavaScript (no interfaces - limited support)');
        const jsFile = '/workspaces/vscode-bridge/test/javascript/auth-mocks.js';
        const jsUri = vscode.Uri.file(jsFile);
        const jsDoc = await vscode.workspace.openTextDocument(jsUri);

        const jsSymbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            jsUri
        );

        const jsFunc = jsSymbols.find(s => s.kind === 11);  // 11 = Function
        if (jsFunc) {
            log(`✓ Found function: ${jsFunc.name}`);

            const jsImpls = await vscode.commands.executeCommand(
                'vscode.executeImplementationProvider',
                jsUri,
                jsFunc.selectionRange.start
            );

            log(`✓ Result: ${jsImpls ? jsImpls.length : 'null'} implementations (JavaScript doesn't have interfaces)`);
        }

        // Test 4: Location vs LocationLink polymorphism
        log('\n📍 Test 4: Location vs LocationLink type inspection');
        log('Checking what type LSP providers return...');
        log('(Skipping - TypeScript symbols not available in this test run)')

        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('✅ Exploration Complete');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('\nKey Findings:');
        log('1. TypeScript interfaces return implementations (if available)');
        log('2. Concrete classes return empty/null (not an error)');
        log('3. JavaScript has limited implementation support (no interfaces)');
        log('4. Return type can be Location OR LocationLink - need normalization');

        return { success: true };

    } catch (error) {
        log(`\n❌ Error: ${error.message}`);
        log(error.stack);
        return { success: false, error: error.message };
    }
};
