import * as vscode from 'vscode';
import * as os from 'os';
import { IWorkspaceService } from '../types';

/**
 * Workspace service that provides safe access to VS Code workspace APIs.
 * Handles common patterns and edge cases like missing workspaces.
 */
export class WorkspaceService implements IWorkspaceService {
    /**
     * Get the default (first) workspace folder.
     * @returns The first workspace folder or undefined if no workspace is open
     */
    getDefault(): vscode.WorkspaceFolder | undefined {
        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length > 0 ? folders[0] : undefined;
    }

    /**
     * Find the workspace folder containing a specific file path.
     * @param filePath The file path to check
     * @returns The containing workspace folder or undefined
     */
    findByPath(filePath: string): vscode.WorkspaceFolder | undefined {
        if (!filePath) {
            return undefined;
        }

        // For relative paths, check against default workspace
        if (!this.isAbsolutePath(filePath)) {
            const defaultFolder = this.getDefault();
            if (defaultFolder) {
                // Convert to absolute path using workspace root
                const uri = vscode.Uri.joinPath(defaultFolder.uri, filePath);
                filePath = uri.fsPath;
            }
        }

        // Use VS Code's API to find the containing workspace
        const uri = vscode.Uri.file(filePath);
        return vscode.workspace.getWorkspaceFolder(uri);
    }

    /**
     * Resolve a path to a VS Code Uri, handling relative and special paths.
     * @param path The path to resolve
     * @returns A VS Code Uri
     */
    resolveUri(path: string): vscode.Uri {
        // Handle URI strings
        if (path.includes('://')) {
            return vscode.Uri.parse(path);
        }

        // Expand home directory
        if (path.startsWith('~')) {
            path = path.replace(/^~/, os.homedir());
        }

        // Handle absolute paths
        if (this.isAbsolutePath(path)) {
            return vscode.Uri.file(path);
        }

        // Handle relative paths - resolve from workspace
        const workspace = this.getDefault();
        if (workspace) {
            // Remove leading ./ if present
            if (path.startsWith('./')) {
                path = path.substring(2);
            }
            return vscode.Uri.joinPath(workspace.uri, path);
        }

        // Fallback to file URI
        return vscode.Uri.file(path);
    }

    /**
     * Get all workspace folders.
     * @returns Array of workspace folders (empty if no workspace is open)
     */
    getAll(): readonly vscode.WorkspaceFolder[] {
        return vscode.workspace.workspaceFolders || [];
    }

    /**
     * Get a workspace folder by name.
     * @param name The name of the workspace folder
     * @returns The matching workspace folder or undefined
     */
    getByName(name: string): vscode.WorkspaceFolder | undefined {
        const folders = this.getAll();
        return folders.find(folder => folder.name === name);
    }

    /**
     * Get a workspace folder by index.
     * @param index The index of the workspace folder
     * @returns The workspace folder at the index or undefined
     */
    getByIndex(index: number): vscode.WorkspaceFolder | undefined {
        const folders = this.getAll();
        return folders[index];
    }

    /**
     * Check if a path is within any workspace folder.
     * @param path The path to check
     * @returns True if the path is within a workspace
     */
    isInWorkspace(path: string): boolean {
        return this.findByPath(path) !== undefined;
    }

    /**
     * Get the relative path from the workspace root.
     * @param absolutePath The absolute path
     * @returns The relative path or the original path if outside workspace
     */
    getRelativePath(absolutePath: string): string {
        return vscode.workspace.asRelativePath(absolutePath, false);
    }

    /**
     * Open a text document.
     * @param path The path to the document
     * @returns The opened text document
     */
    async openDocument(path: string): Promise<vscode.TextDocument> {
        const uri = this.resolveUri(path);
        return await vscode.workspace.openTextDocument(uri);
    }

    /**
     * Find files matching a glob pattern.
     * @param pattern The glob pattern
     * @param maxResults Maximum number of results
     * @returns Array of matching file URIs
     */
    async findFiles(
        pattern: string,
        exclude?: string | null,
        maxResults?: number
    ): Promise<vscode.Uri[]> {
        // Use workspace folder for bounded search
        const workspace = this.getDefault();
        if (workspace) {
            const include = new vscode.RelativePattern(workspace, pattern);
            const excludePattern = exclude
                ? new vscode.RelativePattern(workspace, exclude)
                : undefined;
            return await vscode.workspace.findFiles(include, excludePattern, maxResults);
        }

        // Fallback to unbounded search
        return await vscode.workspace.findFiles(pattern, exclude, maxResults);
    }

    /**
     * Helper to check if a path is absolute.
     */
    private isAbsolutePath(path: string): boolean {
        return /^([a-zA-Z]:)?[\\/]/.test(path) || path.startsWith('/');
    }
}