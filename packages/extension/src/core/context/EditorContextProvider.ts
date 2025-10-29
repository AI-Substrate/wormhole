/**
 * EditorContextProvider - Thin facade that captures editor context for tool responses
 *
 * Architectural Philosophy: "Thin Scripts, Heavy Utilities"
 * - This class orchestrates (120 lines) - it composes, doesn't implement
 * - Utilities implement (150-200 lines each) - reusable business logic
 * - Composition over implementation = testability + reusability across 16 future tools
 */

import * as vscode from 'vscode';
import type { EditorContext } from '../response/envelope';
import { EditorUtils } from '../util/EditorUtils';
import { SymbolUtils } from '../util/SymbolUtils';
import { SerializationUtils } from '../util/SerializationUtils';

export class EditorContextProvider {
    private static outputChannel: vscode.OutputChannel | undefined;

    /**
     * Set OutputChannel for logging (called during extension activation)
     * @param channel Shared OutputChannel instance
     */
    static setOutputChannel(channel: vscode.OutputChannel): void {
        this.outputChannel = channel;
    }

    /**
     * Null-safe logging with console.warn fallback
     * Handles race condition where capture() called before setOutputChannel()
     * @param message Log message
     * @param level Log level
     */
    private static log(message: string, level: 'info' | 'warn' | 'error'): void {
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[EditorContext] [${level.toUpperCase()}] ${message}`);
        } else {
            // Fallback to console if OutputChannel not yet initialized
            console.warn('[EditorContext]', message);
        }
    }

    /**
     * Capture current editor context (file, cursor, selection, symbols)
     * Graceful degradation:
     * - Returns undefined if no active editor
     * - Returns partial context (file + cursor) if symbol fetch times out or crashes
     * - Returns undefined if unexpected errors occur during capture
     *
     * @returns EditorContext or undefined
     */
    static async capture(): Promise<EditorContext | undefined> {
        try {
            // Get active editor via EditorUtils (null-safe wrapper)
            const editor = EditorUtils.getActiveEditor();
            if (!editor) {
                return undefined;  // No editor open - graceful degradation
            }

            // Extract file/cursor/selection info (EditorUtils delegation)
            const file = EditorUtils.getFileInfo(editor);
            const cursor = EditorUtils.getCursorPosition(editor);  // Already 1-indexed
            const selection = EditorUtils.getSelection(editor);

            // Fetch symbols with 10-second timeout (SymbolUtils delegation)
            const symbols = await SymbolUtils.getDocumentSymbols(editor.document.uri, 10000);

            // Handle symbol fetch timeout or crash (partial context fallback)
            if (symbols === 'timeout') {
                this.log('Symbol fetch timed out after 10 seconds', 'warn');
                return this.createPartialContext(file, cursor, selection, 'Symbol fetch timed out');
            }

            if (symbols === null) {
                this.log('Symbol provider unavailable or crashed', 'warn');
                return this.createPartialContext(file, cursor, selection, 'Symbol provider unavailable');
            }

            // Find containing scopes with depth limit (SymbolUtils delegation)
            const cursorPos = new vscode.Position(cursor.line - 1, cursor.character - 1);  // Back to 0-indexed for API
            const scopesRaw = SymbolUtils.findContainingScopes(symbols, cursorPos, 10);

            // Check if scopes were truncated due to depth limit
            const scopesOmitted = scopesRaw.length === 10 && scopesRaw[scopesRaw.length - 1].depth === 9
                ? this.countRemainingScopes(symbols, cursorPos, 10)
                : undefined;

            // Serialize scopes to POJOs (SerializationUtils delegation)
            const containingScopes = scopesRaw.map(scope => SerializationUtils.serializeSymbol({
                name: scope.name,
                kind: scope.kind,
                range: scope.range,
                // DocumentSymbol requires these fields but we don't use them
                selectionRange: scope.range,
                detail: '',
                children: []
            }));

            // Build scope hierarchy string (innermost last)
            const scopeHierarchy = containingScopes.map(s => s.name).join(' > ');
            const immediateScope = containingScopes.length > 0
                ? containingScopes[containingScopes.length - 1].name
                : null;

            // Serialize selection range if present (SerializationUtils delegation)
            const serializedSelection = {
                isEmpty: selection.isEmpty,
                text: selection.text,
                range: selection.range ? SerializationUtils.serializeRange(selection.range) : undefined
            };

            // Return full context
            return {
                file,
                cursor,  // Already 1-indexed from EditorUtils
                selection: serializedSelection,
                symbols: {
                    totalInDocument: this.countTotalSymbols(symbols),
                    containingScopes,
                    immediateScope,
                    scopeHierarchy,
                    scopesOmitted
                }
            };

        } catch (error) {
            // Outer catch: non-symbol errors (disposed document, invalid API calls, etc.)
            // Inner catch (SymbolUtils) handles symbol provider errors
            const message = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;
            this.log(`Capture failed: ${message}\n${stack}`, 'error');
            return undefined;  // Last resort safety net - graceful degradation
        }
    }

    /**
     * Create partial context when symbols unavailable (timeout or crash)
     * @param file File info
     * @param cursor Cursor position (1-indexed)
     * @param selection Selection info
     * @param warning Warning message
     * @returns Partial EditorContext with warning
     */
    private static createPartialContext(
        file: { path: string; languageId: string; lineCount: number; isDirty: boolean },
        cursor: { line: number; character: number },
        selection: { isEmpty: boolean; text?: string; range?: vscode.Range },
        warning: string
    ): EditorContext {
        return {
            file,
            cursor,
            selection: {
                isEmpty: selection.isEmpty,
                text: selection.text,
                range: selection.range ? SerializationUtils.serializeRange(selection.range) : undefined
            },
            symbols: {
                totalInDocument: 0,
                containingScopes: [],
                immediateScope: null,
                scopeHierarchy: '',
                warning
            }
        };
    }

    /**
     * Count total symbols in document (recursive)
     * @param symbols DocumentSymbol array
     * @returns Total count including nested symbols
     */
    private static countTotalSymbols(symbols: vscode.DocumentSymbol[]): number {
        let count = symbols.length;
        for (const symbol of symbols) {
            if (symbol.children && symbol.children.length > 0) {
                count += this.countTotalSymbols(symbol.children);
            }
        }
        return count;
    }

    /**
     * Count how many scopes were omitted due to depth limit
     * @param symbols DocumentSymbol array
     * @param position Position to check
     * @param maxDepth Depth limit
     * @returns Number of omitted scopes
     */
    private static countRemainingScopes(
        symbols: vscode.DocumentSymbol[],
        position: vscode.Position,
        maxDepth: number
    ): number {
        let total = 0;

        function traverse(syms: vscode.DocumentSymbol[], depth: number): void {
            for (const symbol of syms) {
                if (symbol.range.contains(position)) {
                    if (depth >= maxDepth) {
                        total++;
                    }
                    if (symbol.children && symbol.children.length > 0) {
                        traverse(symbol.children, depth + 1);
                    }
                }
            }
        }

        traverse(symbols, 0);
        return total;
    }
}
