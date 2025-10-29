const { ActionScript } = require('@script-base');

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
class GotoLineScript extends ActionScript {
    async execute(bridgeContext, params) {
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

            return this.success({
                message: `Navigated to ${path}:${line}:${column}`,
                file: path,
                line: line,
                column: column,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            bridgeContext.logger.error(`Failed to navigate to file: ${error.message}`);

            // Determine specific error reason
            let reason = 'NAVIGATION_FAILED';
            if (error.code === 'ENOENT' || error.message.includes('Unable to read file')) {
                reason = 'FILE_NOT_FOUND';
            } else if (error.message.includes('line') || error.message.includes('position')) {
                reason = 'INVALID_POSITION';
            }

            return this.failure(
                reason,
                `Failed to navigate to ${path}:${line}:${column}: ${error.message}`
            );
        }
    }
}

module.exports = { GotoLineScript };
