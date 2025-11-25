/**
 * Symbol Resolver - Flowspace ID parsing and symbol name resolution for LSP navigation
 *
 * Provides utilities for:
 * - Parsing Flowspace Node IDs (type:file_path:qualified_name)
 * - Resolving symbols by Flowspace ID or symbol name
 * - Hierarchical symbol search with multiple fallback strategies
 * - LSP operation timeout handling
 *
 * Part of Phase 1: Symbol Resolver Foundation
 */

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Resolve a file path to absolute, using workspace root for relative paths.
 *
 * @param filePath - Absolute or workspace-relative path
 * @returns Absolute path
 * @throws Error with code E_NO_WORKSPACE if no workspace folder available for relative path
 */
export function resolveToAbsolutePath(filePath: string): string {
    // Already absolute - return as-is
    if (path.isAbsolute(filePath)) {
        return filePath;
    }

    // Resolve relative to first workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        const error: any = new Error(
            `Cannot resolve relative path "${filePath}": No workspace folder open. ` +
            `Use an absolute path or open a workspace folder.`
        );
        error.code = 'E_NO_WORKSPACE';
        throw error;
    }

    return path.resolve(workspaceFolder.uri.fsPath, filePath);
}

/**
 * Parsed Flowspace ID components
 */
export interface FlowspaceIdComponents {
    /** Node type (method, class, function, interface, file, etc.) */
    type: string;
    /** File path (relative or absolute, using forward slashes) */
    filePath: string;
    /** Qualified symbol name (e.g., "Calculator.add") or null for file-only nodes */
    qualifiedName: string | null;
}

/**
 * Parse a Flowspace Node ID into its components
 *
 * Format: `type:file_path:qualified_name`
 * - File-only nodes: `file:src/Calculator.ts` (no qualified name)
 * - Method nodes: `method:src/Calculator.ts:Calculator.add`
 * - Nested classes: `method:src/Geo.ts:Shape.Circle.area`
 *
 * Windows paths MUST use forward slashes (C:/Users/...) not backslashes.
 *
 * @param nodeId Flowspace Node ID string
 * @returns Parsed components
 * @throws Error with code E_INVALID_INPUT if format is invalid or backslashes detected
 */
export function parseFlowspaceId(nodeId: string): FlowspaceIdComponents {
    // Validate input is non-empty
    if (!nodeId || typeof nodeId !== 'string') {
        const error: any = new Error('Flowspace ID must be a non-empty string');
        error.code = 'E_INVALID_INPUT';
        throw error;
    }

    // Check for minimum required colons (at least one for "type:path")
    const colonCount = (nodeId.match(/:/g) || []).length;
    if (colonCount < 1) {
        const error: any = new Error('Flowspace ID must contain at least one colon separator (format: type:path or type:path:name)');
        error.code = 'E_INVALID_INPUT';
        throw error;
    }

    // Split at first colon to get type
    const firstColonIndex = nodeId.indexOf(':');
    const type = nodeId.substring(0, firstColonIndex);
    const remainder = nodeId.substring(firstColonIndex + 1);

    // Validate type is present
    if (!type) {
        const error: any = new Error('Flowspace ID type cannot be empty');
        error.code = 'E_INVALID_INPUT';
        throw error;
    }

    // Windows path validation: detect drive letters (C:, D:, etc.)
    // Must use forward slashes, reject backslashes
    const windowsPathPattern = /^[A-Z]:[\\\/]/i;
    const hasWindowsPath = windowsPathPattern.test(remainder);

    if (hasWindowsPath && remainder.includes('\\')) {
        const error: any = new Error(
            'Windows paths in Flowspace IDs must use forward slashes (C:/Users/...) not backslashes (C:\\Users\\...)'
        );
        error.code = 'E_INVALID_INPUT';
        throw error;
    }

    // Split at last colon in remainder to separate path from qualified name
    // File-only nodes have no qualified name (e.g., "file:src/Calculator.ts")
    const lastColonIndex = remainder.lastIndexOf(':');

    let filePath: string;
    let qualifiedName: string | null;

    if (lastColonIndex === -1) {
        // No qualified name (file-only node)
        filePath = remainder;
        qualifiedName = null;
    } else {
        // Has qualified name
        filePath = remainder.substring(0, lastColonIndex);
        qualifiedName = remainder.substring(lastColonIndex + 1);

        // Validate qualifiedName is not empty if present
        if (qualifiedName === '') {
            const error: any = new Error('Flowspace ID qualified name cannot be empty if colon is present');
            error.code = 'E_INVALID_INPUT';
            throw error;
        }
    }

    // Validate filePath is present
    if (!filePath) {
        const error: any = new Error('Flowspace ID file path cannot be empty');
        error.code = 'E_INVALID_INPUT';
        throw error;
    }

    return {
        type,
        filePath,
        qualifiedName
    };
}

/**
 * Find all symbols matching a given name (for ambiguity detection)
 *
 * Recursively searches the symbol tree to find all symbols with the exact name match.
 * Used to detect ambiguous symbol references (multiple symbols with same name).
 *
 * @param symbols DocumentSymbol array to search
 * @param symbolName Symbol name to find
 * @returns Array of all matching symbols
 */
export function findAllMatchingSymbols(
    symbols: vscode.DocumentSymbol[],
    symbolName: string
): vscode.DocumentSymbol[] {
    const matches: vscode.DocumentSymbol[] = [];

    function traverse(syms: vscode.DocumentSymbol[]): void {
        for (const symbol of syms) {
            // Exact match
            if (symbol.name === symbolName) {
                matches.push(symbol);
            }
            // Java-style signature match: "add" should match "add(int, int)"
            // This handles Java LSP which returns method names with parameter types
            else if (symbol.name.startsWith(symbolName + '(')) {
                matches.push(symbol);
            }

            // Recurse into children
            if (symbol.children && symbol.children.length > 0) {
                traverse(symbol.children);
            }
        }
    }

    traverse(symbols);
    return matches;
}

/**
 * Find a symbol in a document using hierarchical search with multiple fallback strategies
 *
 * Implements three search strategies with smart ordering based on dot count:
 * 1. **Exact match**: Find symbol by exact name (e.g., "add" finds method named "add")
 * 2. **Hierarchical split**: Split qualified name by dots and traverse hierarchy
 *    (e.g., "Outer.Inner.method" finds method in nested classes)
 * 3. **Deep traversal**: Fallback to recursive search through entire tree
 *
 * Smart ordering heuristic (from didyouknow session):
 * - ≥2 dots → Try exact first (optimizes for flat structures like Python)
 * - <2 dots → Try hierarchical first (optimizes for nested structures like TypeScript)
 * - Always fallback to deep traversal if first strategy fails
 *
 * Throws error if multiple symbols match (ambiguous reference).
 *
 * @param symbols DocumentSymbol array from VS Code LSP
 * @param symbolName Symbol name or qualified name (e.g., "Calculator.add")
 * @returns Matching DocumentSymbol or null if not found
 * @throws Error with code E_AMBIGUOUS_SYMBOL if multiple matches found
 */
export function findSymbolInDocument(
    symbols: vscode.DocumentSymbol[],
    symbolName: string
): vscode.DocumentSymbol | null {
    // Count dots to determine smart ordering
    const dotCount = (symbolName.match(/\./g) || []).length;

    // Strategy 1: Exact match (find symbol by exact name)
    function exactMatch(): vscode.DocumentSymbol | null {
        const matches = findAllMatchingSymbols(symbols, symbolName);

        if (matches.length === 0) {
            return null;
        }

        if (matches.length > 1) {
            // Ambiguous: multiple symbols with same name
            const error: any = new Error(
                `Ambiguous symbol reference: Found ${matches.length} symbols named "${symbolName}". ` +
                `Use qualified name (e.g., "ClassName.${symbolName}") to disambiguate.`
            );
            error.code = 'E_AMBIGUOUS_SYMBOL';
            error.matches = matches.map(m => ({
                name: m.name,
                kind: m.kind,
                range: m.range
            }));
            throw error;
        }

        return matches[0];
    }

    // Strategy 2: Hierarchical split (traverse by dot-separated path)
    function hierarchicalSplit(): vscode.DocumentSymbol | null {
        const parts = symbolName.split('.');
        if (parts.length === 1) {
            return null; // Can't split, not a qualified name
        }

        let current: vscode.DocumentSymbol[] = symbols;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const found = current.find(s => s.name === part);

            if (!found) {
                return null; // Path broken, container not found
            }

            if (i === parts.length - 1) {
                // Last part, this is our target symbol
                return found;
            }

            // Not last part, descend into children
            if (!found.children || found.children.length === 0) {
                return null; // No children to descend into
            }

            current = found.children;
        }

        return null;
    }

    // Strategy 3: Deep traversal (recursive fallback)
    function deepTraversal(): vscode.DocumentSymbol | null {
        // Try to find by last component of qualified name
        const parts = symbolName.split('.');
        const targetName = parts[parts.length - 1];

        const matches = findAllMatchingSymbols(symbols, targetName);

        if (matches.length === 0) {
            return null;
        }

        if (matches.length === 1) {
            return matches[0];
        }

        // Multiple matches - check if qualified name helps disambiguate
        // Try to match by building qualified names from tree
        for (const match of matches) {
            const qualifiedName = buildQualifiedNameForSymbol(symbols, match);
            if (qualifiedName === symbolName) {
                return match;
            }
        }

        // Still ambiguous
        const error: any = new Error(
            `Ambiguous symbol reference: Found ${matches.length} symbols named "${targetName}". ` +
            `Use qualified name to disambiguate.`
        );
        error.code = 'E_AMBIGUOUS_SYMBOL';
        error.matches = matches.map(m => ({
            name: m.name,
            kind: m.kind,
            range: m.range
        }));
        throw error;
    }

    // Smart ordering based on dot count
    if (dotCount >= 2) {
        // ≥2 dots: Try exact first (optimizes for flat structures like Python)
        const exactResult = exactMatch();
        if (exactResult) return exactResult;

        const hierarchicalResult = hierarchicalSplit();
        if (hierarchicalResult) return hierarchicalResult;

        return deepTraversal();
    } else {
        // <2 dots: Try hierarchical first (optimizes for nested structures like TypeScript)
        const hierarchicalResult = hierarchicalSplit();
        if (hierarchicalResult) return hierarchicalResult;

        const exactResult = exactMatch();
        if (exactResult) return exactResult;

        return deepTraversal();
    }
}

/**
 * Build qualified name for a symbol by traversing up the tree
 *
 * Helper function to construct hierarchical qualified names like "Outer.Inner.method"
 * by finding the symbol's parent chain in the tree.
 *
 * @param symbols Root DocumentSymbol array
 * @param target Target symbol to build qualified name for
 * @returns Qualified name (e.g., "Outer.Inner.method") or just symbol name if at root
 */
function buildQualifiedNameForSymbol(
    symbols: vscode.DocumentSymbol[],
    target: vscode.DocumentSymbol
): string {
    const path: string[] = [];

    function findPath(syms: vscode.DocumentSymbol[], targetSym: vscode.DocumentSymbol): boolean {
        for (const symbol of syms) {
            if (symbol === targetSym) {
                path.push(symbol.name);
                return true;
            }

            if (symbol.children && symbol.children.length > 0) {
                if (findPath(symbol.children, targetSym)) {
                    path.unshift(symbol.name);
                    return true;
                }
            }
        }

        return false;
    }

    findPath(symbols, target);
    return path.join('.');
}

/**
 * Symbol resolution result
 */
export interface SymbolResolutionResult {
    /** VS Code URI for the file */
    uri: vscode.Uri;
    /** Position of the symbol in the document */
    position: vscode.Position;
    /** The resolved DocumentSymbol */
    symbol: vscode.DocumentSymbol;
    /** Metadata about how symbol was resolved */
    meta: {
        resolvedVia: 'flowspaceId' | 'symbolName';
    };
}

/**
 * Resolve a symbol from a Flowspace Node ID
 *
 * Combines parseFlowspaceId() + VS Code LSP symbol lookup to find a symbol
 * in the workspace by its Flowspace ID.
 *
 * @param nodeId Flowspace Node ID (e.g., "method:src/Calculator.ts:Calculator.add")
 * @returns Resolution result with URI, position, and symbol
 * @throws Error if parsing fails or symbol not found
 */
export async function resolveFromFlowspaceId(
    nodeId: string
): Promise<SymbolResolutionResult | null> {
    // Parse Flowspace ID
    const parsed = parseFlowspaceId(nodeId);

    // Resolve relative path to absolute (supports workspace-relative paths in Flowspace IDs)
    const absolutePath = resolveToAbsolutePath(parsed.filePath);

    // Convert file path to URI
    const uri = vscode.Uri.file(absolutePath);

    // Get document symbols from LSP
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
    );

    if (!symbols || symbols.length === 0) {
        return null; // No symbols available
    }

    // If no qualified name, return file reference
    if (!parsed.qualifiedName) {
        return {
            uri,
            position: new vscode.Position(0, 0),
            symbol: symbols[0], // Return first symbol as file reference
            meta: { resolvedVia: 'flowspaceId' }
        };
    }

    // Find symbol by qualified name
    const symbol = findSymbolInDocument(symbols, parsed.qualifiedName);

    if (!symbol) {
        return null; // Symbol not found
    }

    return {
        uri,
        position: symbol.selectionRange.start,
        symbol,
        meta: { resolvedVia: 'flowspaceId' }
    };
}

/**
 * Resolve a symbol from file path + symbol name
 *
 * Alternative to Flowspace ID resolution - takes separate path and symbol name.
 *
 * @param filePath Absolute or relative file path
 * @param symbolName Symbol name or qualified name (e.g., "Calculator.add")
 * @returns Resolution result with URI, position, and symbol
 */
export async function resolveFromSymbolName(
    filePath: string,
    symbolName: string
): Promise<SymbolResolutionResult | null> {
    // Resolve relative path to absolute (supports workspace-relative paths)
    const absolutePath = resolveToAbsolutePath(filePath);

    // Convert file path to URI
    const uri = vscode.Uri.file(absolutePath);

    // Get document symbols from LSP
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
    );

    if (!symbols || symbols.length === 0) {
        return null; // No symbols available
    }

    // Find symbol by name
    const symbol = findSymbolInDocument(symbols, symbolName);

    if (!symbol) {
        return null; // Symbol not found
    }

    return {
        uri,
        position: symbol.selectionRange.start,
        symbol,
        meta: { resolvedVia: 'symbolName' }
    };
}

/**
 * Input parameters for symbol resolution dispatcher
 */
export interface SymbolInputParams {
    /** Flowspace Node ID (takes precedence if provided) */
    nodeId?: string;
    /** File path (used with symbolName if nodeId not provided) */
    path?: string;
    /** Symbol name (used with path if nodeId not provided) */
    symbol?: string;
}

/**
 * Resolve symbol input using dispatcher pattern
 *
 * Routes to appropriate resolution method based on input parameters:
 * - If nodeId provided: Use resolveFromFlowspaceId()
 * - Otherwise: Use resolveFromSymbolName() with path + symbol
 *
 * Flowspace ID takes precedence per Discovery 16.
 *
 * @param params Input parameters with nodeId OR (path + symbol)
 * @returns Resolution result with metadata showing which method was used
 * @throws Error if neither valid input combination provided
 */
export async function resolveSymbolInput(
    params: SymbolInputParams
): Promise<SymbolResolutionResult | null> {
    // Flowspace ID takes precedence
    if (params.nodeId) {
        return resolveFromFlowspaceId(params.nodeId);
    }

    // Fall back to path + symbol
    if (params.path && params.symbol) {
        return resolveFromSymbolName(params.path, params.symbol);
    }

    // Invalid input
    const error: any = new Error(
        'Invalid symbol input: Must provide either "nodeId" OR both "path" and "symbol"'
    );
    error.code = 'E_INVALID_INPUT';
    throw error;
}

/**
 * Execute an LSP command with timeout protection
 *
 * Wraps VS Code LSP commands with Promise.race timeout pattern to prevent
 * hanging on slow/unresponsive language servers.
 *
 * Returns:
 * - Result if LSP completes before timeout
 * - null if LSP returns undefined or throws exception
 * - 'timeout' string if operation exceeds timeout
 *
 * @param lspPromise Promise from vscode.commands.executeCommand()
 * @param timeoutMs Timeout in milliseconds (default: 10000ms / 10s)
 * @returns LSP result, null, or 'timeout'
 */
export async function getLSPResultWithTimeout<T>(
    lspPromise: Promise<T>,
    timeoutMs: number = 10000
): Promise<T | null | 'timeout'> {
    try {
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
            setTimeout(() => resolve('timeout'), timeoutMs);
        });

        const result = await Promise.race([lspPromise, timeoutPromise]);

        if (result === 'timeout') {
            return 'timeout';
        }

        // Coalesce undefined to null (language server not ready)
        return result === undefined ? null : result;
    } catch (error) {
        // LSP provider crashed - return null (same as "no provider")
        return null;
    }
}

/**
 * Build qualified name for a symbol at a specific position
 *
 * Constructs hierarchical qualified name by traversing the symbol tree
 * and finding all parent symbols containing the target position.
 *
 * @param symbols DocumentSymbol array from LSP
 * @param position Target position in document
 * @returns Qualified name (e.g., "Outer.Inner.method") or null if not found
 */
export function buildQualifiedName(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position
): string | null {
    const path: string[] = [];

    function traverse(syms: vscode.DocumentSymbol[]): boolean {
        for (const symbol of syms) {
            // Check if position is within this symbol's range
            if (symbol.range.contains(position)) {
                path.push(symbol.name);

                // Check if position is in selection range (the symbol itself, not just container)
                if (symbol.selectionRange.contains(position)) {
                    return true; // Found the exact symbol
                }

                // Position is in this symbol's range but not selection range
                // Continue searching children
                if (symbol.children && symbol.children.length > 0) {
                    if (traverse(symbol.children)) {
                        return true;
                    }
                }

                // Position in range but no child matched, use this symbol
                return true;
            }
        }
        return false;
    }

    const found = traverse(symbols);
    return found ? path.join('.') : null;
}

/**
 * Find symbol at a specific position in the document
 *
 * Uses VS Code LSP to get the symbol at the exact cursor position.
 *
 * @param uri Document URI
 * @param position Position in document
 * @returns DocumentSymbol at position or null if not found
 */
export async function findSymbolAtPosition(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<vscode.DocumentSymbol | null> {
    // Get document symbols from LSP
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
    );

    if (!symbols || symbols.length === 0) {
        return null;
    }

    // Find symbol containing the position
    function traverse(syms: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null {
        for (const symbol of syms) {
            // Check if position is in selection range (exact match)
            if (symbol.selectionRange.contains(position)) {
                return symbol;
            }

            // Check children
            if (symbol.children && symbol.children.length > 0) {
                const found = traverse(symbol.children);
                if (found) return found;
            }
        }
        return null;
    }

    return traverse(symbols);
}

/**
 * Map VS Code SymbolKind to Flowspace node type
 *
 * Converts VS Code SymbolKind enum to Flowspace ID type strings.
 *
 * @param kind VS Code SymbolKind
 * @returns Flowspace node type string
 */
export function symbolKindToFlowspaceType(kind: vscode.SymbolKind): string {
    switch (kind) {
        case vscode.SymbolKind.File:
            return 'file';
        case vscode.SymbolKind.Module:
            return 'module';
        case vscode.SymbolKind.Namespace:
            return 'namespace';
        case vscode.SymbolKind.Package:
            return 'package';
        case vscode.SymbolKind.Class:
            return 'class';
        case vscode.SymbolKind.Method:
            return 'method';
        case vscode.SymbolKind.Property:
            return 'property';
        case vscode.SymbolKind.Field:
            return 'field';
        case vscode.SymbolKind.Constructor:
            return 'constructor';
        case vscode.SymbolKind.Enum:
            return 'enum';
        case vscode.SymbolKind.Interface:
            return 'interface';
        case vscode.SymbolKind.Function:
            return 'function';
        case vscode.SymbolKind.Variable:
            return 'variable';
        case vscode.SymbolKind.Constant:
            return 'constant';
        case vscode.SymbolKind.String:
            return 'string';
        case vscode.SymbolKind.Number:
            return 'number';
        case vscode.SymbolKind.Boolean:
            return 'boolean';
        case vscode.SymbolKind.Array:
            return 'array';
        case vscode.SymbolKind.Object:
            return 'object';
        case vscode.SymbolKind.Key:
            return 'key';
        case vscode.SymbolKind.Null:
            return 'null';
        case vscode.SymbolKind.EnumMember:
            return 'enum-member';
        case vscode.SymbolKind.Struct:
            return 'struct';
        case vscode.SymbolKind.Event:
            return 'event';
        case vscode.SymbolKind.Operator:
            return 'operator';
        case vscode.SymbolKind.TypeParameter:
            return 'type-parameter';
        default:
            return 'unknown';
    }
}

/**
 * Build a Flowspace Node ID from symbol information
 *
 * Constructs a Flowspace ID in the format: `type:file_path:qualified_name`
 *
 * @param filePath File path (will be normalized to forward slashes)
 * @param symbol DocumentSymbol to build ID for
 * @param symbols Full symbol tree (for building qualified name)
 * @returns Flowspace Node ID string
 */
export function buildFlowspaceId(
    filePath: string,
    symbol: vscode.DocumentSymbol,
    symbols: vscode.DocumentSymbol[]
): string {
    // Normalize path to forward slashes (Windows compatibility)
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Get Flowspace type from symbol kind
    const type = symbolKindToFlowspaceType(symbol.kind);

    // Build qualified name
    const qualifiedName = buildQualifiedNameForSymbol(symbols, symbol);

    // Format: type:path:qualified_name
    return `${type}:${normalizedPath}:${qualifiedName}`;
}

/**
 * Build a Flowspace Node ID from a position in a document
 *
 * Convenience function that finds the symbol at a position and builds its Flowspace ID.
 *
 * @param uri Document URI
 * @param position Position in document
 * @returns Flowspace Node ID or null if no symbol at position
 */
export async function buildFlowspaceIdAtPosition(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<string | null> {
    // Get all symbols
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
    );

    if (!symbols || symbols.length === 0) {
        return null;
    }

    // Find symbol at position
    const symbol = await findSymbolAtPosition(uri, position);
    if (!symbol) {
        return null;
    }

    // Build Flowspace ID
    return buildFlowspaceId(uri.fsPath, symbol, symbols);
}
