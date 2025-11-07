import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';
import {
    resolveSymbolInput,
    getLSPResultWithTimeout
} from '@core/util/symbol-resolver';
import * as vscode from 'vscode';

/**
 * Call hierarchy script - find incoming/outgoing calls using two-step LSP process
 *
 * Two-step LSP flow (LSP 3.16+):
 * 1. prepareCallHierarchy - Resolve symbol to CallHierarchyItem
 * 2. provideIncomingCalls / provideOutgoingCalls - Get actual call data
 *
 * READ-ONLY OPERATION - Uses QueryScript base class
 *
 * Key finding: Must use DocumentSymbol.selectionRange.start (identifier token position)
 * NOT range.start (entire declaration), as Pylance/Python LSP is position-sensitive.
 */
@RegisterScript('symbol.calls')
export class CallHierarchyScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            // Input: Flowspace ID OR path+symbol (mutually exclusive)
            nodeId: z.string().optional(),
            path: z.string().optional(),
            symbol: z.string().optional(),

            // Direction: incoming or outgoing
            direction: z.enum(['incoming', 'outgoing']).default('incoming'),

            // Optional: Enrich results with Flowspace IDs (slower)
            enrichWithFlowspaceIds: z.boolean().optional().default(false)
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
     * Execute call hierarchy lookup
     */
    async execute(bridgeContext: IBridgeContext, params: {
        nodeId?: string;
        path?: string;
        symbol?: string;
        direction: 'incoming' | 'outgoing';
        enrichWithFlowspaceIds?: boolean;
    }): Promise<any> {
        const vscodeApi = bridgeContext.vscode;

        try {
            // Step 1: Resolve symbol input to position
            const resolution = await resolveSymbolInput({
                nodeId: params.nodeId,
                path: params.path,
                symbol: params.symbol
            });

            if (!resolution) {
                const error: any = new Error(
                    params.nodeId
                        ? `Symbol not found for Flowspace ID "${params.nodeId}"`
                        : `Symbol "${params.symbol}" not found in ${params.path}`
                );
                error.code = 'E_NOT_FOUND';
                throw error;
            }

            // Step 2: Get DocumentSymbol to find selectionRange (identifier token position)
            // CRITICAL: Use selectionRange.start (not range.start) for position-sensitive LSPs
            const symbols = await vscodeApi.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                resolution.uri
            );

            if (!symbols || symbols.length === 0) {
                const error: any = new Error('No document symbols available - LSP may not be ready');
                error.code = 'E_NO_LANGUAGE_SERVER';
                throw error;
            }

            // Find target symbol at resolved position
            const targetSymbol = this._findSymbolAtPosition(symbols, resolution.position);

            if (!targetSymbol) {
                const error: any = new Error(`No symbol found at resolved position in ${resolution.uri.fsPath}`);
                error.code = 'E_NOT_FOUND';
                throw error;
            }

            // Use selectionRange.start (identifier token) for LSP position
            const lspPosition = targetSymbol.selectionRange.start;

            // Step 3: TWO-STEP LSP PROCESS

            // Step 3a: prepareCallHierarchy (First LSP call)
            const hierarchyItems = await this._prepareCallHierarchy(
                vscodeApi,
                resolution.uri,
                lspPosition
            );

            if (!hierarchyItems || hierarchyItems.length === 0) {
                const error: any = new Error(
                    'prepareCallHierarchy returned no items. ' +
                    'LSP may not support call hierarchy for this language. ' +
                    'Supported: TypeScript, Python (Pylance), Java, Dart, Go. ' +
                    'Not supported: C# (OmniSharp).'
                );
                error.code = 'E_NO_LANGUAGE_SERVER';
                throw error;
            }

            // Step 3b: provideIncomingCalls or provideOutgoingCalls (Second LSP call)
            const calls = await this._provideCalls(
                vscodeApi,
                hierarchyItems[0],
                params.direction
            );

            if (!calls || calls.length === 0) {
                // Not an error - symbol may simply have no calls in that direction
                return ScriptResult.success({
                    symbol: resolution.symbol,
                    direction: params.direction,
                    calls: [],
                    totalCalls: 0,
                    message: `Symbol has no ${params.direction} calls`
                });
            }

            // Step 4: Format results
            const formattedCalls = await this._formatCalls(
                vscodeApi,
                calls,
                params.direction,
                params.enrichWithFlowspaceIds || false
            );

            return ScriptResult.success({
                symbol: resolution.symbol,
                direction: params.direction,
                calls: formattedCalls,
                totalCalls: formattedCalls.length
            });

        } catch (error: any) {
            return this._handleError(error);
        }
    }

    /**
     * Find symbol at specified position using hierarchical search
     * @private
     */
    private _findSymbolAtPosition(symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol | null {
        const findInSymbols = (syms: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null => {
            for (const sym of syms) {
                // Check if position is within this symbol's range
                if (this._containsPosition(sym.range, position)) {
                    // Check children first (more specific match)
                    if (sym.children && sym.children.length > 0) {
                        const childMatch = findInSymbols(sym.children);
                        if (childMatch) {
                            return childMatch;
                        }
                    }
                    // Return this symbol if no child match
                    return sym;
                }
            }
            return null;
        };

        return findInSymbols(symbols);
    }

    /**
     * Check if range contains position
     * @private
     */
    private _containsPosition(range: vscode.Range, position: vscode.Position): boolean {
        if (position.line < range.start.line || position.line > range.end.line) {
            return false;
        }
        if (position.line === range.start.line && position.character < range.start.character) {
            return false;
        }
        if (position.line === range.end.line && position.character > range.end.character) {
            return false;
        }
        return true;
    }

    /**
     * Step 3a: Execute prepareCallHierarchy with timeout protection
     * @private
     */
    private async _prepareCallHierarchy(
        vscodeApi: typeof vscode,
        uri: vscode.Uri,
        position: vscode.Position
    ): Promise<vscode.CallHierarchyItem[]> {
        const result = await getLSPResultWithTimeout<vscode.CallHierarchyItem[]>(
            Promise.resolve(
                vscodeApi.commands.executeCommand('vscode.prepareCallHierarchy', uri, position)
            ) as Promise<vscode.CallHierarchyItem[]>
        );

        if (result === 'timeout') {
            const error: any = new Error('LSP prepareCallHierarchy timeout (10s)');
            error.code = 'E_TIMEOUT';
            throw error;
        }

        return result as vscode.CallHierarchyItem[];
    }

    /**
     * Step 3b: Execute provideIncomingCalls or provideOutgoingCalls with timeout
     * @private
     */
    private async _provideCalls(
        vscodeApi: typeof vscode,
        item: vscode.CallHierarchyItem,
        direction: 'incoming' | 'outgoing'
    ): Promise<vscode.CallHierarchyIncomingCall[] | vscode.CallHierarchyOutgoingCall[]> {
        const command = direction === 'incoming'
            ? 'vscode.provideIncomingCalls'
            : 'vscode.provideOutgoingCalls';

        const result = await getLSPResultWithTimeout<any[]>(
            Promise.resolve(
                vscodeApi.commands.executeCommand(command, item)
            ) as Promise<any[]>
        );

        if (result === 'timeout') {
            const error: any = new Error(`LSP ${command} timeout (10s)`);
            error.code = 'E_TIMEOUT';
            throw error;
        }

        return result as any[];
    }

    /**
     * Format call hierarchy results
     * @private
     */
    private async _formatCalls(
        vscodeApi: typeof vscode,
        calls: vscode.CallHierarchyIncomingCall[] | vscode.CallHierarchyOutgoingCall[],
        direction: 'incoming' | 'outgoing',
        enrichWithFlowspaceIds: boolean
    ): Promise<any[]> {
        const formatted: any[] = [];

        for (const call of calls) {
            // incoming uses 'from', outgoing uses 'to'
            const item = (call as any).from || (call as any).to;
            const ranges = (call as any).fromRanges || [];

            const callInfo: any = {
                [direction === 'incoming' ? 'caller' : 'callee']: item.name,
                kind: vscode.SymbolKind[item.kind],
                file: item.uri.fsPath,
                line: item.range.start.line,
                character: item.range.start.character,
                callSites: ranges.map((r: vscode.Range) => ({
                    line: r.start.line,
                    character: r.start.character,
                    endLine: r.end.line,
                    endCharacter: r.end.character
                }))
            };

            // Optional: Enrich with Flowspace ID (adds overhead)
            if (enrichWithFlowspaceIds) {
                try {
                    const { buildFlowspaceIdAtPosition } = await import('@core/util/symbol-resolver');
                    const nodeId = await buildFlowspaceIdAtPosition(item.uri, item.range.start);
                    if (nodeId) {
                        callInfo.nodeId = nodeId;
                    }
                } catch {
                    // Enrichment is optional - continue without it
                }
            }

            formatted.push(callInfo);
        }

        return formatted;
    }

    /**
     * Handle errors with appropriate error codes
     * @private
     */
    private _handleError(error: any): any {
        const errorCode = error.code || ErrorCode.E_INTERNAL;

        const details = {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            ...error
        };

        return ScriptResult.failure(error.message, errorCode, details);
    }
}

export default CallHierarchyScript;
