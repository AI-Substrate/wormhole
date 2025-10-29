/**
 * SymbolUtils - Shared symbol provider access with consistent timeout and error handling
 *
 * High-value utility ensuring consistent timeout behavior (10 seconds) and error handling
 * across all symbol-using tools. Prevents 8 different timeout implementations.
 */

import * as vscode from 'vscode';

export class SymbolUtils {
    /**
     * Fetch document symbols with timeout protection
     * @param uri Document URI to fetch symbols for
     * @param timeout Timeout in milliseconds (default: 10000ms / 10 seconds)
     * @returns DocumentSymbol array, null (no provider/crash), or 'timeout' string
     */
    static async getDocumentSymbols(
        uri: vscode.Uri,
        timeout: number = 10000
    ): Promise<vscode.DocumentSymbol[] | null | 'timeout'> {
        try {
            // Try-catch wrapper BEFORE Promise.race to catch provider crashes
            const symbolsPromise = vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );

            const timeoutPromise = new Promise<'timeout'>((resolve) => {
                setTimeout(() => resolve('timeout'), timeout);
            });

            const result = await Promise.race([symbolsPromise, timeoutPromise]);

            if (result === 'timeout') {
                return 'timeout';
            }

            // Coalesce undefined to null (language server not ready)
            return result || null;
        } catch (error) {
            // Provider crashed - return null (same as "no provider")
            return null;
        }
    }

    /**
     * Find containing scopes at given position with depth limit
     * @param symbols DocumentSymbol array to traverse
     * @param position Position to find scopes for (VS Code Position object)
     * @param maxDepth Maximum depth to traverse (default: 10)
     * @returns Array of containing scopes (innermost last), truncated if > maxDepth
     */
    static findContainingScopes(
        symbols: vscode.DocumentSymbol[],
        position: vscode.Position,
        maxDepth: number = 10
    ): Array<{ name: string; kind: number; range: vscode.Range; depth: number }> {
        const scopes: Array<{ name: string; kind: number; range: vscode.Range; depth: number }> = [];

        function traverse(syms: vscode.DocumentSymbol[], depth: number): void {
            for (const symbol of syms) {
                if (symbol.range.contains(position)) {
                    scopes.push({
                        name: symbol.name,
                        kind: symbol.kind,
                        range: symbol.range,
                        depth
                    });

                    // Recurse into children if they exist and we haven't hit depth limit
                    if (symbol.children && symbol.children.length > 0 && depth < maxDepth) {
                        traverse(symbol.children, depth + 1);
                    }
                }
            }
        }

        traverse(symbols, 0);

        // Truncate to maxDepth if exceeded
        if (scopes.length > maxDepth) {
            return scopes.slice(0, maxDepth);
        }

        return scopes;
    }

    /**
     * Find symbol by name (for code.replaceMethod tool in Phase 3)
     * @param symbols DocumentSymbol array to search
     * @param name Symbol name to find
     * @returns First matching symbol or null
     */
    static findSymbolByName(
        symbols: vscode.DocumentSymbol[],
        name: string
    ): vscode.DocumentSymbol | null {
        for (const symbol of symbols) {
            if (symbol.name === name) {
                return symbol;
            }

            // Recurse into children
            if (symbol.children && symbol.children.length > 0) {
                const found = this.findSymbolByName(symbol.children, name);
                if (found) {
                    return found;
                }
            }
        }

        return null;
    }
}
