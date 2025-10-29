import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { IPathService } from '../types';

/**
 * Path service that provides cross-platform path utilities.
 * Handles Windows, Unix, and remote workspace paths correctly.
 */
export class PathService implements IPathService {
    public readonly extensionRoot: string;

    constructor(extensionRoot: string) {
        this.extensionRoot = extensionRoot;
    }

    /**
     * Resolve a path to an absolute path, handling various formats.
     * @param relativePath The path to resolve
     * @returns The absolute path
     */
    resolve(relativePath: string): string {
        // Already absolute
        if (this.isAbsolute(relativePath)) {
            return this.normalize(relativePath);
        }

        // Expand home directory
        if (relativePath.startsWith('~')) {
            const homePath = relativePath.replace(/^~/, os.homedir());
            return this.normalize(homePath);
        }

        // Resolve relative to workspace
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (workspace) {
            // Remove leading ./ if present
            if (relativePath.startsWith('./')) {
                relativePath = relativePath.substring(2);
            }
            return path.resolve(workspace.uri.fsPath, relativePath);
        }

        // Fallback to CWD
        return path.resolve(process.cwd(), relativePath);
    }

    /**
     * Check if a path is absolute.
     * @param filePath The path to check
     * @returns True if the path is absolute
     */
    isAbsolute(filePath: string): boolean {
        // Check for home directory marker
        if (filePath.startsWith('~')) {
            return false;
        }

        // Use Node's path.isAbsolute for platform-specific check
        return path.isAbsolute(filePath);
    }

    /**
     * Convert an absolute path to a workspace-relative path.
     * @param absolutePath The absolute path
     * @returns The relative path or undefined if outside workspace
     */
    toWorkspaceRelative(absolutePath: string): string | undefined {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace) {
            return undefined;
        }

        const workspacePath = workspace.uri.fsPath;
        const normalizedAbsolute = this.normalize(absolutePath);
        const normalizedWorkspace = this.normalize(workspacePath);

        // Check if path is within workspace
        if (!normalizedAbsolute.startsWith(normalizedWorkspace)) {
            return undefined;
        }

        // Get relative path
        const relative = path.relative(normalizedWorkspace, normalizedAbsolute);
        return relative === '' ? '' : relative;
    }

    /**
     * Resolve a path relative to the extension root.
     * @param relativePath The path relative to extension root
     * @returns The absolute path
     */
    resolveExtensionPath(relativePath: string): string {
        return path.resolve(this.extensionRoot, relativePath);
    }

    /**
     * Normalize a path (fix separators, remove redundant segments).
     * @param filePath The path to normalize
     * @returns The normalized path
     */
    normalize(filePath: string): string {
        // Normalize path and remove trailing slash (unless root)
        const normalized = path.normalize(filePath);
        if (normalized.length > 1 && normalized.endsWith(path.sep)) {
            return normalized.slice(0, -1);
        }
        return normalized;
    }

    /**
     * Join path segments.
     * @param segments Path segments to join
     * @returns The joined path
     */
    join(...segments: string[]): string {
        return path.join(...segments);
    }

    /**
     * Get the directory of a file path.
     * @param filePath The file path
     * @returns The directory path
     */
    getDirectory(filePath: string): string {
        return path.dirname(filePath);
    }

    /**
     * Get the filename from a path.
     * @param filePath The file path
     * @returns The filename
     */
    getFilename(filePath: string): string {
        return path.basename(filePath);
    }

    /**
     * Get the file extension.
     * @param filePath The file path
     * @returns The extension including the dot (e.g., '.ts')
     */
    getExtension(filePath: string): string {
        return path.extname(filePath);
    }

    /**
     * Get filename without extension.
     * @param filePath The file path
     * @returns The filename without extension
     */
    getBasename(filePath: string): string {
        const filename = this.getFilename(filePath);
        const ext = this.getExtension(filePath);
        return ext ? filename.slice(0, -ext.length) : filename;
    }

    /**
     * Convert path to VS Code Uri.
     * @param filePath The file path
     * @returns VS Code Uri
     */
    toUri(filePath: string): vscode.Uri {
        const absolutePath = this.resolve(filePath);
        return vscode.Uri.file(absolutePath);
    }

    /**
     * Convert VS Code Uri to file path.
     * @param uri The VS Code Uri
     * @returns The file path
     */
    fromUri(uri: vscode.Uri): string {
        return uri.fsPath;
    }

    /**
     * Check if two paths refer to the same location.
     * @param path1 First path
     * @param path2 Second path
     * @returns True if paths are the same
     */
    isSame(path1: string, path2: string): boolean {
        const normalized1 = this.normalize(this.resolve(path1));
        const normalized2 = this.normalize(this.resolve(path2));

        // Case-insensitive comparison on Windows
        if (process.platform === 'win32') {
            return normalized1.toLowerCase() === normalized2.toLowerCase();
        }

        return normalized1 === normalized2;
    }

    /**
     * Get relative path between two paths.
     * @param from The starting path
     * @param to The target path
     * @returns The relative path from 'from' to 'to'
     */
    relative(from: string, to: string): string {
        return path.relative(from, to);
    }
}