/**
 * Test EditorContextProvider - Dynamic Script
 *
 * Tests EditorContextProvider.capture() to validate editor context extraction
 *
 * Usage:
 *   vscb script run -f ./scripts/sample/dynamic/test-editor-context.js
 *
 * Prerequisites:
 *   1. Extension Host running (F5 in VS Code)
 *   2. Test workspace open with a file open in the editor
 *   3. Cursor positioned in a function/class for scope testing
 */

module.exports = async function(bridgeContext, params) {
    const vscode = bridgeContext.vscode;

    console.log('\n=== EditorContextProvider Test ===\n');

    try {
        // Import EditorContextProvider from compiled extension code
        const { EditorContextProvider } = require(bridgeContext.extensionRoot + '/out/core/context/EditorContextProvider.js');

        console.log('✓ EditorContextProvider imported successfully');

        // Set output channel (required before calling capture)
        if (bridgeContext.outputChannel) {
            EditorContextProvider.setOutputChannel(bridgeContext.outputChannel);
            console.log('✓ OutputChannel set for logging');
        } else {
            console.warn('⚠ No outputChannel available, using console fallback');
        }

        // Check if there's an active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            console.log('❌ No active editor - open a file to test');
            return {
                success: false,
                error: 'No active editor',
                hint: 'Open a JavaScript/TypeScript file and position cursor inside a function'
            };
        }

        console.log(`✓ Active editor found: ${activeEditor.document.fileName}`);
        console.log(`  Language: ${activeEditor.document.languageId}`);
        console.log(`  Line count: ${activeEditor.document.lineCount}`);
        console.log(`  Cursor position: Line ${activeEditor.selection.active.line + 1}, Col ${activeEditor.selection.active.character + 1}`);

        // Call EditorContextProvider.capture()
        console.log('\nCalling EditorContextProvider.capture()...');
        const context = await EditorContextProvider.capture();

        // Analyze results
        if (!context) {
            console.log('❌ capture() returned undefined');
            return {
                success: false,
                error: 'capture() returned undefined',
                hint: 'Check Extension Host Debug Console for errors'
            };
        }

        console.log('✅ Context captured successfully!\n');

        // Display captured context with formatted output
        console.log('📄 File Info:');
        console.log(`  Path: ${context.file.path}`);
        console.log(`  Language: ${context.file.languageId}`);
        console.log(`  Lines: ${context.file.lineCount}`);
        console.log(`  Dirty: ${context.file.isDirty}`);

        console.log('\n📍 Cursor Info:');
        console.log(`  Line: ${context.cursor.line} (1-indexed)`);
        console.log(`  Character: ${context.cursor.character} (1-indexed)`);

        console.log('\n📝 Selection Info:');
        console.log(`  Empty: ${context.selection.isEmpty}`);
        if (!context.selection.isEmpty && context.selection.text) {
            console.log(`  Text: "${context.selection.text.substring(0, 50)}${context.selection.text.length > 50 ? '...' : ''}"`);
            console.log(`  Range: ${JSON.stringify(context.selection.range)}`);
        }

        console.log('\n🔍 Symbol Info:');
        console.log(`  Total symbols in document: ${context.symbols.totalInDocument}`);
        console.log(`  Containing scopes: ${context.symbols.containingScopes.length}`);
        console.log(`  Immediate scope: ${context.symbols.immediateScope || '(none)'}`);
        console.log(`  Scope hierarchy: ${context.symbols.scopeHierarchy || '(none)'}`);

        if (context.symbols.warning) {
            console.log(`  ⚠ Warning: ${context.symbols.warning}`);
        }

        if (context.symbols.scopesOmitted) {
            console.log(`  ⚠ Scopes omitted (depth limit): ${context.symbols.scopesOmitted}`);
        }

        // Display containing scopes detail
        if (context.symbols.containingScopes.length > 0) {
            console.log('\n  Containing Scopes (outermost to innermost):');
            context.symbols.containingScopes.forEach((scope, index) => {
                console.log(`    ${index + 1}. ${scope.name} (kind: ${scope.kind})`);
                console.log(`       Range: Line ${scope.range.start.line} - ${scope.range.end.line}`);
            });
        }

        // Full JSON output
        console.log('\n📦 Full Context (JSON):');
        console.log(JSON.stringify(context, null, 2));

        // Validation checks
        const validations = {
            hasFile: !!context.file,
            hasCursor: !!context.cursor,
            hasSelection: !!context.selection,
            hasSymbols: !!context.symbols,
            cursorIs1Indexed: context.cursor.line >= 1 && context.cursor.character >= 1,
            isPOJO: Object.getPrototypeOf(context.cursor) === Object.prototype,
            jsonSerializable: true
        };

        try {
            JSON.stringify(context);
        } catch (e) {
            validations.jsonSerializable = false;
        }

        console.log('\n✅ Validation Results:');
        Object.entries(validations).forEach(([key, value]) => {
            console.log(`  ${value ? '✓' : '✗'} ${key}: ${value}`);
        });

        // Log to output channel for persistence
        bridgeContext.logger.info('EditorContext test completed successfully');
        bridgeContext.logger.info(`Captured context for: ${context.file.path}`);

        return {
            success: true,
            context,
            validations,
            summary: {
                file: context.file.path,
                language: context.file.languageId,
                cursorLine: context.cursor.line,
                symbolCount: context.symbols.totalInDocument,
                scopeDepth: context.symbols.containingScopes.length,
                immediateScope: context.symbols.immediateScope
            }
        };

    } catch (error) {
        console.error('\n❌ Test failed with error:');
        console.error(error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }

        bridgeContext.logger.error('EditorContext test failed', error);

        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
};
