const { z } = require('zod');
const { QueryScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');
const {
    resolveSymbolInput,
    buildFlowspaceIdAtPosition,
    getLSPResultWithTimeout
} = require('@core/util/symbol-resolver');

/**
 * Symbol navigation script - find references and implementations
 * Supports Flowspace ID and symbol name inputs
 */
class NavigateScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            // Input: Flowspace ID OR path+symbol (mutually exclusive)
            nodeId: z.string().optional(),
            path: z.string().optional(),
            symbol: z.string().optional(),

            // Action type
            action: z.enum(['references', 'implementations']).default('references'),

            // Options
            includeDeclaration: z.boolean().optional(),
            enrichWithFlowspaceIds: z.boolean().default(false)
        }).refine(data => {
            // Validate: Must provide either nodeId OR (path AND symbol)
            const hasNodeId = !!data.nodeId;
            const hasPathSymbol = !!data.path && !!data.symbol;

            if (!hasNodeId && !hasPathSymbol) {
                throw new Error('Must provide either "nodeId" OR both "path" and "symbol"');
            }

            if (hasNodeId && hasPathSymbol) {
                throw new Error('Provide either "nodeId" OR "path"+"symbol", not both');
            }

            return true;
        });
    }

    /**
     * Execute symbol navigation
     * @param {any} bridgeContext
     * @param {{nodeId?: string, path?: string, symbol?: string, action: string, includeDeclaration?: boolean, enrichWithFlowspaceIds: boolean}} params
     * @returns {Promise<Object>}
     */
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        try {
            // Step 1: Resolve symbol input to position
            const resolution = await resolveSymbolInput({
                nodeId: params.nodeId,
                path: params.path,
                symbol: params.symbol
            });

            if (!resolution) {
                return ScriptResult.failure(
                    params.nodeId
                        ? `Symbol not found for Flowspace ID "${params.nodeId}"`
                        : `Symbol "${params.symbol}" not found in ${params.path}`,
                    ErrorCode.E_SYMBOL_NOT_FOUND,
                    {
                        input: this._formatInput(params)
                    }
                );
            }

            // Step 2: Execute appropriate LSP command
            let locations;
            if (params.action === 'references') {
                locations = await this._executeReferences(
                    vscode,
                    resolution.uri,
                    resolution.position,
                    params.includeDeclaration
                );
            } else if (params.action === 'implementations') {
                locations = await this._executeImplementations(
                    vscode,
                    resolution.uri,
                    resolution.position
                );
            }

            // Step 3: Handle timeout and null results
            if (locations === 'timeout') {
                return ScriptResult.success({
                    action: params.action,
                    input: this._formatInput(params),
                    locations: [],
                    total: 0,
                    timeout: true,
                    message: 'LSP provider timed out after 10s (language server may be indexing)'
                });
            }

            if (!locations || locations.length === 0) {
                // Empty result is valid (e.g., no references, concrete class has no implementations)
                return ScriptResult.success({
                    action: params.action,
                    input: this._formatInput(params),
                    locations: [],
                    total: 0
                });
            }

            // Step 4: Normalize Location/LocationLink polymorphism
            const normalized = locations.map(loc => this._normalizeLocation(loc));

            // Step 5: Optional Flowspace ID enrichment
            let enriched = normalized;
            if (params.enrichWithFlowspaceIds) {
                enriched = await this._enrichWithFlowspaceIds(vscode, normalized);
            }

            // Step 6: Format and return
            return ScriptResult.success({
                action: params.action,
                input: this._formatInput(params),
                locations: enriched,
                total: enriched.length
            });

        } catch (error) {
            // Handle known error codes from symbol-resolver
            if (error.code === 'E_AMBIGUOUS_SYMBOL') {
                return ScriptResult.failure(
                    error.message,
                    ErrorCode.E_AMBIGUOUS_SYMBOL,
                    {
                        input: this._formatInput(params)
                    }
                );
            }

            // Check for language server issues
            if (error.message.includes('no language server') ||
                error.message.includes('not supported')) {
                return ScriptResult.failure(
                    `${error.message}. ${this._getLanguageHint(params.path)}`,
                    ErrorCode.E_NO_LANGUAGE_SERVER,
                    {
                        input: this._formatInput(params)
                    }
                );
            }

            // Catch unexpected errors
            return ScriptResult.fromError(
                error,
                ErrorCode.E_OPERATION_FAILED
            );
        }
    }

    /**
     * Execute references provider with timeout protection
     * @private
     */
    async _executeReferences(vscode, uri, position, includeDeclaration) {
        // Convert undefined to explicit boolean (tri-state: true, false, undefined)
        // undefined means "use provider default"
        const context = includeDeclaration !== undefined
            ? { includeDeclaration: includeDeclaration }
            : {};

        const command = 'vscode.executeReferenceProvider';
        return await getLSPResultWithTimeout(
            command,
            uri,
            position,
            context
        );
    }

    /**
     * Execute implementations provider with timeout protection
     * @private
     */
    async _executeImplementations(vscode, uri, position) {
        const command = 'vscode.executeImplementationProvider';
        return await getLSPResultWithTimeout(
            command,
            uri,
            position
        );
    }

    /**
     * Normalize Location or LocationLink to consistent format
     * @private
     */
    _normalizeLocation(loc) {
        // Check if it's LocationLink (has targetUri/targetRange)
        if (loc.targetUri) {
            return {
                file: loc.targetUri.fsPath,
                range: {
                    start: {
                        line: loc.targetRange.start.line + 1,  // 1-indexed
                        character: loc.targetRange.start.character
                    },
                    end: {
                        line: loc.targetRange.end.line + 1,
                        character: loc.targetRange.end.character
                    }
                }
            };
        }

        // It's a Location (has uri/range)
        return {
            file: loc.uri.fsPath,
            range: {
                start: {
                    line: loc.range.start.line + 1,  // 1-indexed
                    character: loc.range.start.character
                },
                end: {
                    line: loc.range.end.line + 1,
                    character: loc.range.end.character
                }
            }
        };
    }

    /**
     * Enrich locations with Flowspace IDs
     * @private
     */
    async _enrichWithFlowspaceIds(vscode, locations) {
        const enriched = [];

        for (const loc of locations) {
            const uri = vscode.Uri.file(loc.file);
            const position = new vscode.Position(
                loc.range.start.line - 1,  // Convert back to 0-indexed
                loc.range.start.character
            );

            const flowspaceId = await buildFlowspaceIdAtPosition(uri, position);

            enriched.push({
                ...loc,
                flowspaceId: flowspaceId || null
            });
        }

        return enriched;
    }

    /**
     * Format input for response
     * @private
     */
    _formatInput(params) {
        if (params.nodeId) {
            return { type: 'flowspaceId', value: params.nodeId };
        } else {
            return {
                type: 'symbolName',
                path: params.path,
                symbol: params.symbol
            };
        }
    }

    /**
     * Get language-specific hint for missing language server
     * @private
     */
    _getLanguageHint(path) {
        if (!path) return '';

        if (path.endsWith('.py')) {
            return 'Python: Ensure Pylance or Python extension is installed and activated.';
        } else if (path.endsWith('.js') || path.endsWith('.ts')) {
            return 'JavaScript/TypeScript: Language server should be built-in, check VS Code extensions.';
        } else if (path.endsWith('.java')) {
            return 'Java: Ensure Java Language Support extension is installed.';
        } else if (path.endsWith('.go')) {
            return 'Go: Ensure Go extension is installed and gopls is configured.';
        } else if (path.endsWith('.cs')) {
            return 'C#: Ensure C# Dev Kit or OmniSharp extension is installed.';
        }

        return 'Check that appropriate language extension is installed for this file type.';
    }
}

module.exports = { NavigateScript };
