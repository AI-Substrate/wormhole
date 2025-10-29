/**
 * Simple filesystem adapter interface for pluggable I/O.
 * Enables pure unit testing while supporting VS Code's remote filesystem.
 */
export interface FSAdapter {
    /**
     * Check if a path exists
     */
    exists(path: string): boolean | Promise<boolean>;

    /**
     * Read directory contents
     */
    readDir(path: string): string[] | Promise<string[]>;
}

/**
 * Node.js filesystem adapter for unit tests.
 * Synchronous, fast, works with temp directories.
 */
export class NodeFSAdapter implements FSAdapter {
    private fs = require('fs');

    exists(path: string): boolean {
        try {
            return this.fs.existsSync(path);
        } catch {
            return false;
        }
    }

    readDir(path: string): string[] {
        try {
            return this.fs.readdirSync(path);
        } catch {
            return [];
        }
    }
}

/**
 * VS Code filesystem adapter for production.
 * Works with remote development, SSH, WSL, containers.
 */
export class VSCodeFSAdapter implements FSAdapter {
    constructor(private vscode: typeof import('vscode')) {}

    async exists(path: string): Promise<boolean> {
        try {
            await this.vscode.workspace.fs.stat(this.vscode.Uri.file(path));
            return true;
        } catch {
            return false;
        }
    }

    async readDir(path: string): Promise<string[]> {
        try {
            const uri = this.vscode.Uri.file(path);
            const entries = await this.vscode.workspace.fs.readDirectory(uri);
            return entries.map(([name]) => name);
        } catch {
            return [];
        }
    }
}