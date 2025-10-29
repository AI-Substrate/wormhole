/**
 * SerializationUtils - Convert VS Code API objects to plain JSON-serializable objects
 *
 * Critical utility preventing serialization bugs across 14+ future MCP tools.
 * Centralizes Position/Range/Symbol → POJO conversion, ensuring consistent
 * 0-indexed → 1-indexed transformation and circular reference prevention.
 */

import * as vscode from 'vscode';

export class SerializationUtils {
    /**
     * Serialize VS Code Position to plain object with 1-indexed line/character
     * @param pos VS Code Position (0-indexed)
     * @returns Plain object with 1-indexed coordinates
     */
    static serializePosition(pos: vscode.Position): { line: number; character: number } {
        return {
            line: pos.line + 1,  // 0-indexed → 1-indexed
            character: pos.character + 1  // 0-indexed → 1-indexed
        };
    }

    /**
     * Serialize VS Code Range to plain object with 1-indexed coordinates
     * @param range VS Code Range (0-indexed)
     * @returns Plain object with start/end positions (1-indexed)
     */
    static serializeRange(range: vscode.Range): {
        start: { line: number; character: number };
        end: { line: number; character: number };
    } {
        return {
            start: this.serializePosition(range.start),
            end: this.serializePosition(range.end)
        };
    }

    /**
     * Serialize VS Code Location to plain object
     * @param loc VS Code Location
     * @returns Plain object with uri and range
     */
    static serializeLocation(loc: vscode.Location): {
        uri: string;
        range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
    } {
        return {
            uri: loc.uri.toString(),
            range: this.serializeRange(loc.range)
        };
    }

    /**
     * Serialize VS Code DocumentSymbol to plain object (shallow - no children)
     * @param symbol VS Code DocumentSymbol
     * @returns Plain object with name, kind, and range
     */
    static serializeSymbol(symbol: vscode.DocumentSymbol): {
        name: string;
        kind: number;
        range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
    } {
        return {
            name: symbol.name,
            kind: symbol.kind,
            range: this.serializeRange(symbol.range)
        };
    }
}
