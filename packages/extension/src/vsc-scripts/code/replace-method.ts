import { z } from 'zod';
import { ActionScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';
import {
    resolveSymbolInput,
    getLSPResultWithTimeout
} from '@core/util/symbol-resolver';
import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * Method replacement script - replace entire method declarations using LSP
 * Supports Flowspace ID and symbol name inputs
 *
 * DESTRUCTIVE OPERATION: Modifies files with best-effort save (non-atomic)
 * Uses whole-symbol replacement (DocumentSymbol.range) matching Serena production tool
 */
@RegisterScript('code.replace-method')
export class ReplaceMethodScript extends ActionScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            // Input: Flowspace ID OR path+symbol (mutually exclusive)
            nodeId: z.string().optional(),
            path: z.string().optional(),
            symbol: z.string().optional(),

            // Replacement text (entire method declaration)
            replacement: z.string() // Allow empty string for deletion
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
     * Execute method replacement
     */
    async execute(bridgeContext: IBridgeContext, params: {
        nodeId?: string;
        path?: string;
        symbol?: string;
        replacement: string;
    }): Promise<any> {
        const vscodeApi = bridgeContext.vscode;

        try {
            // Step 1: Resolve symbol input to position (Phase 1 API - T007)
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

            // Step 2: Get DocumentSymbol from LSP (proven in dynamic scripts - T007)
            const symbols = await this._executeDocumentSymbolProvider(
                vscodeApi,
                resolution.uri
            );

            if (!symbols || symbols.length === 0) {
                const error: any = new Error('No document symbol provider available for this file type');
                error.code = 'E_NO_LANGUAGE_SERVER';
                throw error;
            }

            // Step 3: Find target symbol at resolved position (T007)
            const targetSymbol = this._findSymbolAtPosition(symbols, resolution.position);

            if (!targetSymbol) {
                const error: any = new Error(`No symbol found at resolved position in ${resolution.uri.fsPath}`);
                error.code = 'E_NOT_FOUND';
                throw error;
            }

            // Step 4: Capture old text for response (before replacement - T008)
            const doc = await vscodeApi.workspace.openTextDocument(resolution.uri);
            const oldText = doc.getText(targetSymbol.range);

            // Step 5: Create WorkspaceEdit with whole-symbol replacement (T008)
            const edit = new vscodeApi.WorkspaceEdit();
            edit.replace(resolution.uri, targetSymbol.range, params.replacement);

            // Step 6: Extract files and pre-validate permissions (T009, T010)
            const files = this._extractFilesFromEdit(edit);
            await this._validateFilesWritable(files);

            // Step 7: Apply WorkspaceEdit with best-effort save (T011)
            const saveResults = await this._applyWorkspaceEditSafely(vscodeApi, edit);

            // Step 8: Format response (T012)
            return ScriptResult.success({
                applied: true,
                changes: [{
                    file: resolution.uri.fsPath,
                    range: {
                        start: { line: targetSymbol.range.start.line, character: targetSymbol.range.start.character },
                        end: { line: targetSymbol.range.end.line, character: targetSymbol.range.end.character }
                    },
                    oldText: oldText.substring(0, 100) + (oldText.length > 100 ? '...' : ''),
                    newText: params.replacement.substring(0, 100) + (params.replacement.length > 100 ? '...' : ''),
                    oldTextLength: oldText.length,
                    newTextLength: params.replacement.length
                }],
                succeeded: saveResults.succeeded,
                failed: saveResults.failed,
                totalFiles: 1,
                totalEdits: 1,
                input: {
                    type: params.nodeId ? 'flowspaceId' : 'symbolName',
                    nodeId: params.nodeId,
                    path: params.path,
                    symbol: params.symbol,
                    replacementLength: params.replacement.length
                }
            });

        } catch (error: any) {
            // T013: Comprehensive error handling
            return this._handleError(error);
        }
    }

    /**
     * Execute DocumentSymbol provider with timeout protection
     * @private
     */
    private async _executeDocumentSymbolProvider(vscodeApi: typeof vscode, uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
        const result = await getLSPResultWithTimeout<vscode.DocumentSymbol[]>(
            Promise.resolve(vscodeApi.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri)) as Promise<vscode.DocumentSymbol[]>
        );

        if (result === 'timeout') {
            const error: any = new Error('LSP document symbol provider timeout (10s)');
            error.code = 'E_TIMEOUT';
            throw error;
        }

        return result as vscode.DocumentSymbol[]; // DocumentSymbol[] or null/undefined
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
     * Extract unique file paths from WorkspaceEdit (T009)
     * @private
     */
    private _extractFilesFromEdit(edit: vscode.WorkspaceEdit): string[] {
        const files: string[] = [];
        for (const [uri, _edits] of edit.entries()) {
            files.push(uri.fsPath);
        }
        return files;
    }

    /**
     * Validate all files are writable (T010 - pre-validation)
     * @private
     */
    private async _validateFilesWritable(files: string[]): Promise<void> {
        for (const file of files) {
            // Check file exists
            if (!fs.existsSync(file)) {
                const error: any = new Error(`Cannot apply edit: ${file} does not exist`);
                error.code = 'E_NOT_FOUND';
                throw error;
            }

            // Check file is writable
            try {
                fs.accessSync(file, fs.constants.W_OK);
            } catch {
                const error: any = new Error(`Cannot apply edit: ${file} is read-only`);
                error.code = 'E_FILE_READ_ONLY';
                throw error;
            }
        }
    }

    /**
     * Apply WorkspaceEdit with best-effort document save (T011)
     * Insight #1: Document save is NOT atomic - try-catch per file with detailed reporting
     * @private
     */
    private async _applyWorkspaceEditSafely(vscodeApi: typeof vscode, edit: vscode.WorkspaceEdit): Promise<{
        succeeded: string[];
        failed: Array<{ file: string; reason: string }>;
    }> {
        // Apply edit (atomic - all or nothing)
        const applied = await vscodeApi.workspace.applyEdit(edit);

        if (!applied) {
            const error: any = new Error(
                'E_OPERATION_FAILED: Cannot apply replacement. Common causes: ' +
                '(1) File locked by another application, ' +
                '(2) File modified concurrently, ' +
                '(3) File deleted after validation. ' +
                'Ensure files are saved and not open in other editors.'
            );
            error.code = 'E_OPERATION_FAILED';
            throw error;
        }

        // Save affected documents (best-effort - Insight #1)
        const succeeded: string[] = [];
        const failed: Array<{ file: string; reason: string }> = [];

        for (const [uri, _edits] of edit.entries()) {
            try {
                const doc = await vscodeApi.workspace.openTextDocument(uri);
                await doc.save();
                succeeded.push(uri.fsPath);
            } catch (saveError: any) {
                failed.push({
                    file: uri.fsPath,
                    reason: saveError.message
                });
            }
        }

        return { succeeded, failed };
    }

    /**
     * Handle errors with appropriate error codes (T013)
     * @private
     */
    private _handleError(error: any): any {
        // Pass through VS Code errors wholesale - no mucking around
        const errorCode = error.code || ErrorCode.E_INTERNAL;

        // Preserve ALL error properties from the original error
        const details = {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            // Spread all other properties from VS Code API errors
            ...error
        };

        return ScriptResult.failure(error.message, errorCode, details);
    }
}

export default ReplaceMethodScript;
