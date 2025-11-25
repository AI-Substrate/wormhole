import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Symbol kind enum mapping for filtering
 */
const SYMBOL_KINDS: Record<string, number> = {
    File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4, Method: 5, Property: 6, Field: 7,
    Constructor: 8, Enum: 9, Interface: 10, Function: 11, Variable: 12, Constant: 13,
    String: 14, Number: 15, Boolean: 16, Array: 17, Object: 18, Key: 19, Null: 20,
    EnumMember: 21, Struct: 22, Event: 23, Operator: 24, TypeParameter: 25
};

const KIND_NAMES = Object.fromEntries(
    Object.entries(SYMBOL_KINDS).map(([k, v]) => [v, k])
);

/**
 * Symbol search query script
 * Supports workspace-wide search and document-level outline
 */
@RegisterScript('search.symbol-search')
export class SymbolSearchScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            query: z.string().default(''),
            mode: z.enum(['workspace', 'document']).default('workspace'),
            path: z.string().optional(),
            kinds: z.string().optional(),
            limit: z.coerce.number().int().min(1).max(1000).default(100),
            includeLocation: z.coerce.boolean().default(true),
            includeContainer: z.coerce.boolean().default(true)
        }).refine(data => {
            if (data.mode === 'document' && !data.path) {
                throw new Error('path parameter required for document mode');
            }
            return true;
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        try {
            const vscode = bridgeContext.vscode;

            let rawSymbols: any[] = [];

            if (params.mode === 'workspace') {
                rawSymbols = (await vscode.commands.executeCommand(
                    'vscode.executeWorkspaceSymbolProvider',
                    params.query
                ) as any[]) || [];
            } else if (params.mode === 'document') {
                // Resolve relative path to absolute (supports workspace-relative paths)
                let resolvedPath = params.path;
                if (!path.isAbsolute(params.path)) {
                    const workspace = vscode.workspace.workspaceFolders?.[0];
                    if (!workspace) {
                        return ScriptResult.failure(
                            `Cannot resolve relative path "${params.path}": No workspace folder open`,
                            ErrorCode.E_INVALID_PATH,
                            { path: params.path }
                        );
                    }
                    resolvedPath = path.resolve(workspace.uri.fsPath, params.path);
                }

                if (!fs.existsSync(resolvedPath)) {
                    return ScriptResult.failure(
                        `File not found: ${params.path}` +
                        (resolvedPath !== params.path ? ` (resolved to: ${resolvedPath})` : ''),
                        ErrorCode.E_FILE_NOT_FOUND,
                        { path: params.path, resolvedPath }
                    );
                }

                const uri = vscode.Uri.file(resolvedPath);
                const docSymbols = (await vscode.commands.executeCommand(
                    'vscode.executeDocumentSymbolProvider',
                    uri
                ) as any[]) || [];

                rawSymbols = this._flattenDocumentSymbols(docSymbols, uri.toString());
            }

            let filteredSymbols = rawSymbols;
            let appliedKinds = null;

            if (params.kinds) {
                appliedKinds = params.kinds.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
                const allowedKindValues = appliedKinds.map((k: string) => SYMBOL_KINDS[k]).filter((v: number | undefined) => v !== undefined);

                if (allowedKindValues.length > 0) {
                    filteredSymbols = filteredSymbols.filter((s: any) => allowedKindValues.includes(s.kind));
                }
            }

            const total = filteredSymbols.length;
            const limitedSymbols = filteredSymbols.slice(0, params.limit);
            const truncated = total > params.limit;

            const statistics = this._calculateStatistics(filteredSymbols);
            const formattedSymbols = limitedSymbols.map((s: any) => this._formatSymbol(s, params.includeLocation, params.includeContainer));

            return ScriptResult.success({
                mode: params.mode,
                query: params.query,
                filters: { kinds: appliedKinds, limit: params.limit },
                results: { total, returned: formattedSymbols.length, truncated },
                statistics,
                symbols: formattedSymbols
            });

        } catch (error: any) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }

    private _flattenDocumentSymbols(docSymbols: any[], uriString: string, container: string | null = null, result: any[] = []): any[] {
        for (const sym of docSymbols) {
            result.push({
                name: sym.name,
                kind: sym.kind,
                location: { uri: uriString, range: sym.range },
                containerName: container,
                _selectionRange: sym.selectionRange
            });

            if (sym.children && sym.children.length > 0) {
                this._flattenDocumentSymbols(sym.children, uriString, sym.name, result);
            }
        }
        return result;
    }

    private _formatSymbol(symbol: any, includeLocation: boolean, includeContainer: boolean): any {
        const result: any = {
            name: symbol.name,
            kind: KIND_NAMES[symbol.kind] || symbol.kind
        };

        if (includeContainer && symbol.containerName) {
            result.container = symbol.containerName;
        }

        if (includeLocation && symbol.location) {
            const loc = symbol.location;
            const uri = typeof loc.uri === 'string' ? loc.uri : loc.uri.toString();
            const pathMatch = uri.match(/file:\/\/(.+)/);
            const filePath = pathMatch ? pathMatch[1] : uri;
            const range = loc.range;
            const line = range.start.line + 1;
            const char = range.start.character;

            result.location = {
                file: filePath,
                line,
                character: char,
                range: {
                    start: { line: range.start.line, char: range.start.character },
                    end: { line: range.end.line, char: range.end.character }
                }
            };
        }

        return result;
    }

    private _calculateStatistics(symbols: any[]): any {
        const byKind: Record<string, number> = {};
        for (const s of symbols) {
            const kind = KIND_NAMES[s.kind] || `Unknown(${s.kind})`;
            byKind[kind] = (byKind[kind] || 0) + 1;
        }
        return { byKind };
    }
}
