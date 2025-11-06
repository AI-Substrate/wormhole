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
 * Two-step LSP flow (Critical Discovery 09):
 * 1. prepareCallHierarchy - Resolve symbol to CallHierarchyItem
 * 2. provideIncomingCalls / provideOutgoingCalls - Get actual call data
 *
 * READ-ONLY OPERATION - Uses QueryScript base class
 */
@RegisterScript('hierarchy.calls')
export class CallHierarchyScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            // Input: Flowspace ID OR path+symbol (mutually exclusive)
            nodeId: z.string().optional(),
            path: z.string().optional(),
            symbol: z.string().optional(),

            // Direction: incoming or outgoing
            direction: z.enum(['incoming', 'outgoing']).default('incoming')
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

            // Step 2: TWO-STEP LSP PROCESS (Discovery 09)

            // Step 2a: prepareCallHierarchy (First LSP call)
            const hierarchyItems = await this._prepareCallHierarchy(
                vscodeApi,
                resolution.uri,
                resolution.position
            );

            if (!hierarchyItems || hierarchyItems.length === 0) {
                const error: any = new Error(
                    'prepareCallHierarchy returned no items. ' +
                    'LSP may not support call hierarchy for this language'
                );
                error.code = 'E_NO_LANGUAGE_SERVER';
                throw error;
            }

            // Step 2b: provideIncomingCalls or provideOutgoingCalls (Second LSP call)
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

            // Step 3: Format results
            const formattedCalls = this._formatCalls(calls, params.direction);

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
     * Step 2a: Execute prepareCallHierarchy with timeout protection
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
     * Step 2b: Execute provideIncomingCalls or provideOutgoingCalls with timeout
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
    private _formatCalls(
        calls: vscode.CallHierarchyIncomingCall[] | vscode.CallHierarchyOutgoingCall[],
        direction: 'incoming' | 'outgoing'
    ): any[] {
        return calls.map(call => {
            // incoming uses 'from', outgoing uses 'to'
            const item = (call as any).from || (call as any).to;
            const ranges = (call as any).fromRanges || [];

            return {
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
        });
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
