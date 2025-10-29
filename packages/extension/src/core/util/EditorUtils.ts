/**
 * EditorUtils - Extract editor state information (file, cursor, selection)
 *
 * Medium-value utility providing safe wrappers around VS Code APIs that can be undefined.
 * Centralizes editor state access patterns, ensures consistent null checking across tools.
 */

import * as vscode from 'vscode';

export class EditorUtils {
    /**
     * Get active text editor with null safety
     * @returns Active TextEditor or undefined if none
     */
    static getActiveEditor(): vscode.TextEditor | undefined {
        return vscode.window.activeTextEditor;
    }

    /**
     * Extract file information from text editor
     * @param editor TextEditor to extract from
     * @returns File info (path, languageId, lineCount, isDirty)
     */
    static getFileInfo(editor: vscode.TextEditor): {
        path: string;
        languageId: string;
        lineCount: number;
        isDirty: boolean;
    } {
        return {
            path: editor.document.uri.fsPath,
            languageId: editor.document.languageId,
            lineCount: editor.document.lineCount,
            isDirty: editor.document.isDirty
        };
    }

    /**
     * Get cursor position (1-indexed for external consumption)
     * @param editor TextEditor to extract from
     * @returns Position object with 1-indexed line/character
     */
    static getCursorPosition(editor: vscode.TextEditor): { line: number; character: number } {
        const pos = editor.selection.active;
        return {
            line: pos.line + 1,  // 0-indexed → 1-indexed
            character: pos.character + 1  // 0-indexed → 1-indexed
        };
    }

    /**
     * Get selection information
     * @param editor TextEditor to extract from
     * @returns Selection info (isEmpty, text, range)
     */
    static getSelection(editor: vscode.TextEditor): {
        isEmpty: boolean;
        text?: string;
        range?: vscode.Range;
    } {
        const selection = editor.selection;
        const isEmpty = selection.isEmpty;

        if (isEmpty) {
            return { isEmpty: true };
        }

        const text = editor.document.getText(selection);
        return {
            isEmpty: false,
            text,
            range: new vscode.Range(selection.start, selection.end)
        };
    }
}
