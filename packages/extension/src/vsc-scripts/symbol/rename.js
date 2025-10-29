const { z } = require('zod');
const { ActionScript } = require('@script-base');
const {
    resolveSymbolInput,
    getLSPResultWithTimeout
} = require('@core/util/symbol-resolver');
const fs = require('fs');

/**
 * Symbol rename script - rename symbols workspace-wide using LSP
 * Supports Flowspace ID and symbol name inputs
 *
 * DESTRUCTIVE OPERATION: Modifies files atomically (all or nothing)
 */
class RenameScript extends ActionScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            // Input: Flowspace ID OR path+symbol (mutually exclusive)
            nodeId: z.string().optional(),
            path: z.string().optional(),
            symbol: z.string().optional(),

            // New name for the symbol
            newName: z.string().min(1, 'newName must be non-empty')
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
     * Execute symbol rename
     * @param {any} bridgeContext
     * @param {{nodeId?: string, path?: string, symbol?: string, newName: string}} params
     * @returns {Promise<ActionResult>}
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
                const error = new Error(
                    params.nodeId
                        ? `E_NOT_FOUND: Symbol not found for Flowspace ID "${params.nodeId}"`
                        : `E_NOT_FOUND: Symbol "${params.symbol}" not found in ${params.path}`
                );
                error.code = 'E_NOT_FOUND';
                throw error;
            }

            // Step 2: Execute LSP rename provider with timeout
            const workspaceEdit = await this._executeRenameProvider(
                vscode,
                resolution.uri,
                resolution.position,
                params.newName
            );

            if (!workspaceEdit) {
                const error = new Error('E_NO_LANGUAGE_SERVER: No rename provider available for this file type');
                error.code = 'E_NO_LANGUAGE_SERVER';
                throw error;
            }

            // Step 3: Extract files and pre-validate permissions (Discovery 07)
            const files = this._extractFilesFromEdit(workspaceEdit);
            await this._validateFilesWritable(files);

            // Step 4: Apply WorkspaceEdit atomically
            const applied = await this._applyWorkspaceEditSafely(vscode, workspaceEdit);

            if (!applied) {
                const error = new Error(
                    'E_OPERATION_FAILED: Cannot apply rename. Common causes: ' +
                    '(1) File locked by another application, ' +
                    '(2) File modified concurrently, ' +
                    '(3) File deleted after validation. ' +
                    'Ensure files are saved and not open in other editors.'
                );
                error.code = 'E_OPERATION_FAILED';
                throw error;
            }

            // Step 5: Format change summary
            const summary = this._formatChangeSummary(workspaceEdit);

            // Return success with details
            return this.success({
                applied: true,
                ...summary,
                input: {
                    type: params.nodeId ? 'flowspaceId' : 'symbolName',
                    nodeId: params.nodeId,
                    path: params.path,
                    symbol: params.symbol,
                    newName: params.newName
                }
            });

        } catch (error) {
            // Handle errors with appropriate error codes
            if (error.code === 'E_NOT_FOUND' ||
                error.code === 'E_AMBIGUOUS_SYMBOL' ||
                error.code === 'E_NO_LANGUAGE_SERVER' ||
                error.code === 'E_FILE_READ_ONLY' ||
                error.code === 'E_OPERATION_FAILED' ||
                error.code === 'E_TIMEOUT') {
                throw error;
            }

            // Generic error
            const wrappedError = new Error(`E_INVALID_INPUT: ${error.message}`);
            wrappedError.code = 'E_INVALID_INPUT';
            throw wrappedError;
        }
    }

    /**
     * Execute rename provider with timeout protection
     */
    async _executeRenameProvider(vscode, uri, position, newName) {
        const result = await getLSPResultWithTimeout(
            'vscode.executeDocumentRenameProvider',
            uri,
            position,
            newName
        );

        if (result === 'timeout') {
            const error = new Error('E_TIMEOUT: LSP rename provider timeout (10s)');
            error.code = 'E_TIMEOUT';
            throw error;
        }

        return result; // WorkspaceEdit or null/undefined
    }

    /**
     * Extract unique file paths from WorkspaceEdit
     */
    _extractFilesFromEdit(edit) {
        const files = [];
        for (const [uri, _edits] of edit.entries()) {
            files.push(uri.fsPath);
        }
        return files;
    }

    /**
     * Validate all files are writable (Discovery 07 - pre-validation)
     */
    async _validateFilesWritable(files) {
        for (const file of files) {
            // Check file exists
            if (!fs.existsSync(file)) {
                const error = new Error(`E_NOT_FOUND: Cannot apply edit: ${file} does not exist`);
                error.code = 'E_NOT_FOUND';
                throw error;
            }

            // Check file is writable
            try {
                fs.accessSync(file, fs.constants.W_OK);
            } catch {
                const error = new Error(`E_FILE_READ_ONLY: Cannot apply edit: ${file} is read-only`);
                error.code = 'E_FILE_READ_ONLY';
                throw error;
            }
        }
    }

    /**
     * Apply WorkspaceEdit with error handling and save all affected documents
     */
    async _applyWorkspaceEditSafely(vscode, edit) {
        const applied = await vscode.workspace.applyEdit(edit);

        if (!applied) {
            return false;
        }

        // Save all affected documents to persist changes to disk
        // Without this, changes remain in memory only
        for (const [uri, edits] of edit.entries()) {
            const doc = await vscode.workspace.openTextDocument(uri);
            await doc.save();
        }

        return true;
    }

    /**
     * Format change summary from WorkspaceEdit
     */
    _formatChangeSummary(edit) {
        const changes = [];
        let totalEdits = 0;

        for (const [uri, edits] of edit.entries()) {
            changes.push({
                file: uri.fsPath,
                editCount: edits.length
            });
            totalEdits += edits.length;
        }

        return {
            changes,
            totalFiles: edit.size,
            totalEdits
        };
    }
}

module.exports = RenameScript;
