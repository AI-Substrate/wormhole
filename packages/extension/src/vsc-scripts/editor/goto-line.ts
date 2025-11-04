import { z } from 'zod';
import { ActionScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Goto Line Script
 *
 * Opens a file in the editor and navigates to a specific line and column.
 * The target line is centered in the viewport for optimal visibility.
 *
 * Usage:
 *   vscb script run editor.goto-line --param path=/abs/path/to/file.js --param line=42
 *   vscb script run editor.goto-line --param path=/abs/path/to/file.js --param line=42 --param column=10
 *
 * Parameters:
 *   - path: Absolute path to the file to open
 *   - line: Line number to navigate to (1-indexed)
 *   - column: Optional column number (1-indexed, defaults to 1)
 *
 * The script will:
 * 1. Open the specified file in the editor
 * 2. Position the cursor at the specified line/column
 * 3. Center the line in the viewport
 * 4. Open as a permanent tab (not preview)
 */
@RegisterScript('editor.goto-line')
export class GotoLineScript extends ActionScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            path: z.string().min(1),
            line: z.coerce.number().int().min(1),
            column: z.coerce.number().int().min(1).optional().default(1)
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        const vscode = bridgeContext.vscode;
        const { path, line, column = 1 } = params;

        bridgeContext.logger.info(`Navigating to ${path}:${line}:${column}...`);

        try {
            // Create URI for the file
            const fileUri = vscode.Uri.file(path);

            // Convert 1-indexed to 0-indexed positions
            const position = new vscode.Position(line - 1, column - 1);

            // Create range for the position
            const range = new vscode.Range(position, position);

            // Open the document
            bridgeContext.logger.info('Opening document...');
            const document = await vscode.workspace.openTextDocument(fileUri);

            // Show the document with cursor at target position
            bridgeContext.logger.info('Showing document and positioning cursor...');
            const editor = await vscode.window.showTextDocument(document, {
                selection: range,
                preview: false, // Open as permanent tab
                viewColumn: vscode.ViewColumn.One
            });

            // Reveal the line in center of viewport
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

            bridgeContext.logger.info(`Successfully navigated to ${path}:${line}:${column}`);

            return ScriptResult.success({
                message: `Navigated to ${path}:${line}:${column}`,
                file: path,
                line: line,
                column: column,
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            bridgeContext.logger.error(`Failed to navigate to file: ${error.message}`);

            // Determine specific error code
            let errorCode = ErrorCode.E_OPERATION_FAILED;
            if (error.code === 'ENOENT' || error.message.includes('Unable to read file')) {
                errorCode = ErrorCode.E_FILE_NOT_FOUND;
            } else if (error.message.includes('line') || error.message.includes('position')) {
                errorCode = ErrorCode.E_INVALID_PATH;
            }

            return ScriptResult.failure(
                `Failed to navigate to ${path}:${line}:${column}: ${error.message}`,
                errorCode,
                { path, line, column }
            );
        }
    }
}
