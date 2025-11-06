/**
 * Dynamic script: Test call hierarchy two-step LSP process
 *
 * Tests the unique two-step flow:
 * 1. prepareCallHierarchy - Resolve symbol to CallHierarchyItem
 * 2. provideIncomingCalls / provideOutgoingCalls - Get actual call data
 *
 * Usage:
 *   vscb script run -f ./scripts/sample/dynamic/test-call-hierarchy.js \
 *     --param path=/absolute/path/to/file.ts \
 *     --param symbol=functionName \
 *     --param direction=incoming
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;
    const { path, symbol, direction = 'incoming' } = params;

    console.log(`\n🔍 Testing Call Hierarchy for "${symbol}" in ${path}`);
    console.log(`📍 Direction: ${direction}\n`);

    try {
        // Step 0: Validate direction parameter
        if (direction !== 'incoming' && direction !== 'outgoing') {
            throw new Error(`Invalid direction "${direction}". Must be "incoming" or "outgoing"`);
        }

        // Step 1: Open document and find symbol
        const uri = vscode.Uri.file(path);
        const doc = await vscode.workspace.openTextDocument(uri);

        console.log('✅ Step 1: Document opened');

        // Step 2: Get DocumentSymbols to find position
        const symbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            uri
        );

        if (!symbols || symbols.length === 0) {
            throw new Error('No symbols found - LSP may not be active');
        }

        console.log(`✅ Step 2: Found ${symbols.length} top-level symbols`);

        // Step 3: Find target symbol (flatten hierarchy)
        const targetSymbol = findSymbolByName(symbols, symbol);

        if (!targetSymbol) {
            // Show available symbols for debugging
            const availableSymbols = flattenSymbols(symbols).map(s => s.name);
            throw new Error(
                `Symbol "${symbol}" not found.\n` +
                `Available symbols: ${availableSymbols.join(', ')}`
            );
        }

        console.log(`✅ Step 3: Found symbol "${targetSymbol.name}" at line ${targetSymbol.range.start.line}`);
        console.log(`   Kind: ${vscode.SymbolKind[targetSymbol.kind]}`);

        // Step 4: TWO-STEP LSP PROCESS

        // Step 4a: prepareCallHierarchy (First LSP call)
        console.log('\n🔧 Step 4a: Calling prepareCallHierarchy...');
        // CRITICAL FIX: Use selectionRange.start (identifier token) not range.start (entire declaration)
        const position = targetSymbol.selectionRange.start;
        console.log(`   Position: Line ${position.line}, Character ${position.character} (using selectionRange)`);

        const hierarchyItems = await vscode.commands.executeCommand(
            'vscode.prepareCallHierarchy',
            uri,
            position
        );

        if (!hierarchyItems || hierarchyItems.length === 0) {
            throw new Error('prepareCallHierarchy returned no items - LSP may not support call hierarchy');
        }

        console.log(`✅ Step 4a: Got ${hierarchyItems.length} CallHierarchyItem(s)`);
        console.log(`   Item 0:`, JSON.stringify({
            name: hierarchyItems[0].name,
            kind: vscode.SymbolKind[hierarchyItems[0].kind],
            uri: hierarchyItems[0].uri.fsPath,
            range: hierarchyItems[0].range
        }, null, 2));

        // Step 4b: provideIncomingCalls or provideOutgoingCalls (Second LSP call)
        console.log(`\n🔧 Step 4b: Calling provide${direction === 'incoming' ? 'Incoming' : 'Outgoing'}Calls...`);

        const command = direction === 'incoming'
            ? 'vscode.provideIncomingCalls'
            : 'vscode.provideOutgoingCalls';

        const calls = await vscode.commands.executeCommand(
            command,
            hierarchyItems[0]
        );

        if (!calls || calls.length === 0) {
            console.log(`⚠️  No ${direction} calls found for "${symbol}"`);
            return {
                ok: true,
                result: {
                    symbol: symbol,
                    direction: direction,
                    hierarchyItems: hierarchyItems.length,
                    calls: [],
                    message: `Symbol exists but has no ${direction} calls`
                }
            };
        }

        console.log(`✅ Step 4b: Found ${calls.length} ${direction} call(s)\n`);

        // Step 5: Format results
        const formattedCalls = calls.map((call, idx) => {
            const from = call.from || call.to; // incoming uses 'from', outgoing uses 'to'
            const ranges = call.fromRanges || [];

            console.log(`📞 Call ${idx + 1}:`);
            console.log(`   From: ${from.name} (${vscode.SymbolKind[from.kind]})`);
            console.log(`   File: ${from.uri.fsPath}`);
            console.log(`   Line: ${from.range.start.line}`);
            console.log(`   Call sites: ${ranges.length}`);

            ranges.forEach((range, rangeIdx) => {
                console.log(`     Site ${rangeIdx + 1}: Line ${range.start.line}, Col ${range.start.character}`);
            });

            console.log('');

            return {
                caller: from.name,
                callerKind: vscode.SymbolKind[from.kind],
                file: from.uri.fsPath,
                line: from.range.start.line,
                character: from.range.start.character,
                callSites: ranges.map(r => ({
                    line: r.start.line,
                    character: r.start.character
                }))
            };
        });

        return {
            ok: true,
            result: {
                symbol: symbol,
                direction: direction,
                hierarchyItems: hierarchyItems.length,
                calls: formattedCalls,
                totalCalls: formattedCalls.length
            }
        };

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);

        return {
            ok: false,
            error: error.message,
            stack: error.stack
        };
    }
};

/**
 * Find symbol by name (supports nested symbols)
 */
function findSymbolByName(symbols, targetName) {
    for (const sym of symbols) {
        if (sym.name === targetName) {
            return sym;
        }

        // Check children recursively
        if (sym.children && sym.children.length > 0) {
            const found = findSymbolByName(sym.children, targetName);
            if (found) return found;
        }
    }

    return null;
}

/**
 * Flatten symbol hierarchy for debugging
 */
function flattenSymbols(symbols) {
    const result = [];

    for (const sym of symbols) {
        result.push(sym);

        if (sym.children && sym.children.length > 0) {
            result.push(...flattenSymbols(sym.children));
        }
    }

    return result;
}
