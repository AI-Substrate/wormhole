const { z } = require('zod');
const { QueryScript } = require('@script-base');

/**
 * Symbol kind enum mapping for filtering
 */
const SYMBOL_KINDS = {
    File: 0,
    Module: 1,
    Namespace: 2,
    Package: 3,
    Class: 4,
    Method: 5,
    Property: 6,
    Field: 7,
    Constructor: 8,
    Enum: 9,
    Interface: 10,
    Function: 11,
    Variable: 12,
    Constant: 13,
    String: 14,
    Number: 15,
    Boolean: 16,
    Array: 17,
    Object: 18,
    Key: 19,
    Null: 20,
    EnumMember: 21,
    Struct: 22,
    Event: 23,
    Operator: 24,
    TypeParameter: 25
};

/**
 * Reverse mapping for kind names
 */
const KIND_NAMES = Object.fromEntries(
    Object.entries(SYMBOL_KINDS).map(([k, v]) => [v, k])
);

/**
 * Symbol search query script
 * Supports workspace-wide search and document-level outline
 */
class SymbolSearchScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            query: z.string().default(''),
            mode: z.enum(['workspace', 'document']).default('workspace'),
            path: z.string().optional(),
            kinds: z.string().optional(),
            limit: z.number().int().min(1).max(1000).default(100),
            includeLocation: z.boolean().default(true),
            includeContainer: z.boolean().default(true)
        }).refine(data => {
            // Validate path required when mode=document
            if (data.mode === 'document' && !data.path) {
                throw new Error('path parameter required for document mode');
            }
            return true;
        });
    }

    /**
     * Execute symbol search
     * @param {any} bridgeContext
     * @param {{query: string, mode: string, path?: string, kinds?: string, limit: number, includeLocation: boolean, includeContainer: boolean}} params
     * @returns {Promise<Object>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;
        const fs = require('fs');

        let rawSymbols = [];

        try {
            // Execute appropriate symbol provider based on mode
            if (params.mode === 'workspace') {
                // Workspace-wide symbol search
                rawSymbols = await vscode.commands.executeCommand(
                    'vscode.executeWorkspaceSymbolProvider',
                    params.query
                ) || [];

            } else if (params.mode === 'document') {
                // Document-level symbol outline

                // Validate file exists
                if (!fs.existsSync(params.path)) {
                    throw new Error(`E_FILE_NOT_FOUND: ${params.path}`);
                }

                const uri = vscode.Uri.file(params.path);
                const docSymbols = await vscode.commands.executeCommand(
                    'vscode.executeDocumentSymbolProvider',
                    uri
                ) || [];

                // Flatten hierarchical DocumentSymbols into flat array
                rawSymbols = this._flattenDocumentSymbols(docSymbols, uri.toString());
            }

            // Parse and apply kind filter if specified
            let filteredSymbols = rawSymbols;
            let appliedKinds = null;

            if (params.kinds) {
                appliedKinds = params.kinds
                    .split(',')
                    .map(k => k.trim())
                    .filter(k => k.length > 0);

                const allowedKindValues = appliedKinds
                    .map(k => SYMBOL_KINDS[k])
                    .filter(v => v !== undefined);

                if (allowedKindValues.length > 0) {
                    filteredSymbols = filteredSymbols.filter(s =>
                        allowedKindValues.includes(s.kind)
                    );
                }
            }

            // Apply limit and track truncation
            const total = filteredSymbols.length;
            const limitedSymbols = filteredSymbols.slice(0, params.limit);
            const truncated = total > params.limit;

            // Calculate statistics
            const statistics = this._calculateStatistics(filteredSymbols);

            // Format symbols for output
            const formattedSymbols = limitedSymbols.map(s =>
                this._formatSymbol(s, params.includeLocation, params.includeContainer)
            );

            // Return structured response
            return {
                mode: params.mode,
                query: params.query,
                filters: {
                    kinds: appliedKinds,
                    limit: params.limit
                },
                results: {
                    total: total,
                    returned: formattedSymbols.length,
                    truncated: truncated
                },
                statistics: statistics,
                symbols: formattedSymbols
            };

        } catch (error) {
            // Handle errors gracefully
            if (error.message.startsWith('E_FILE_NOT_FOUND')) {
                throw error;
            }
            throw new Error(`Symbol search failed: ${error.message}`);
        }
    }

    /**
     * Flatten hierarchical DocumentSymbol[] into flat SymbolInformation-like array
     * @private
     */
    _flattenDocumentSymbols(docSymbols, uriString, container = null, result = []) {
        for (const sym of docSymbols) {
            // Create SymbolInformation-compatible object
            result.push({
                name: sym.name,
                kind: sym.kind,
                location: {
                    uri: uriString,
                    range: sym.range
                },
                containerName: container,
                _selectionRange: sym.selectionRange
            });

            // Recurse into children
            if (sym.children && sym.children.length > 0) {
                this._flattenDocumentSymbols(sym.children, uriString, sym.name, result);
            }
        }
        return result;
    }

    /**
     * Format symbol for output with configurable fields
     * @private
     */
    _formatSymbol(symbol, includeLocation, includeContainer) {
        const result = {
            name: symbol.name,
            kind: KIND_NAMES[symbol.kind] || symbol.kind
        };

        // Add container if requested and available
        if (includeContainer && symbol.containerName) {
            result.container = symbol.containerName;
        }

        // Add location if requested
        if (includeLocation && symbol.location) {
            const loc = symbol.location;
            const uri = typeof loc.uri === 'string' ? loc.uri : loc.uri.toString();

            // Extract file path from URI
            const pathMatch = uri.match(/file:\/\/(.+)/);
            const filePath = pathMatch ? pathMatch[1] : uri;

            const range = loc.range;
            const line = range.start.line + 1; // Convert to 1-indexed
            const char = range.start.character;

            result.location = {
                file: filePath,
                line: line,
                character: char,
                range: {
                    start: { line: range.start.line, char: range.start.character },
                    end: { line: range.end.line, char: range.end.character }
                }
            };
        }

        return result;
    }

    /**
     * Calculate statistics about symbol distribution
     * @private
     */
    _calculateStatistics(symbols) {
        const byKind = {};

        for (const s of symbols) {
            const kind = KIND_NAMES[s.kind] || `Unknown(${s.kind})`;
            byKind[kind] = (byKind[kind] || 0) + 1;
        }

        return {
            byKind: byKind
        };
    }
}

module.exports = { SymbolSearchScript };
