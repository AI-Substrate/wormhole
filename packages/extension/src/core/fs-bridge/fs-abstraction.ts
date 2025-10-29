/**
 * @file fs-abstraction.ts
 * @brief Filesystem abstraction layer for VS Code and Node.js environments
 *
 * Provides dependency injection for filesystem operations to enable:
 * - Fast unit testing with NodeFilesystem (Vitest)
 * - Remote workspace support with VsCodeFilesystem (SSH, Codespaces, WSL)
 *
 * Design:
 * - IFilesystem interface defines contract
 * - VsCodeFilesystem adapter wraps vscode.workspace.fs
 * - NodeFilesystem adapter wraps fs.promises
 */

import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';

/**
 * Filesystem abstraction interface
 *
 * Provides async methods for common filesystem operations needed by fs-bridge.
 * Implementations MUST handle both local and remote filesystem scenarios.
 */
export interface IFilesystem {
  /**
   * Read directory entries
   * @returns Array of [name, fileType] tuples
   */
  readDirectory(dirPath: string): Promise<Array<[string, FileType]>>;

  /**
   * Check if file or directory exists
   * @returns true if exists, false otherwise (no error on ENOENT)
   */
  exists(filePath: string): Promise<boolean>;

  /**
   * Read file contents as UTF-8 string
   */
  readFile(filePath: string): Promise<string>;

  /**
   * Write file contents (UTF-8 string)
   */
  writeFile(filePath: string, content: string): Promise<void>;

  /**
   * Create directory (recursive)
   */
  createDirectory(dirPath: string): Promise<void>;

  /**
   * Delete file or directory
   */
  delete(path: string, options?: { recursive?: boolean }): Promise<void>;
}

/**
 * File type enumeration (matches vscode.FileType semantics)
 */
export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
}

/**
 * VS Code filesystem adapter
 *
 * Wraps vscode.workspace.fs for production use.
 * Supports remote workspaces (SSH, Codespaces, WSL) via VS Code's FileSystemProvider.
 *
 * Use this in:
 * - Extension runtime (BridgeManager, processor, recovery)
 * - Integration tests running in Extension Host
 */
export class VsCodeFilesystem implements IFilesystem {
  async readDirectory(dirPath: string): Promise<Array<[string, FileType]>> {
    try {
      const uri = vscode.Uri.file(dirPath);
      const entries = await vscode.workspace.fs.readDirectory(uri);

      // Map vscode.FileType to our FileType enum
      return entries.map(([name, type]) => [name, type as FileType]);
    } catch (err: any) {
      if (err.code === 'FileNotFound' || err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(filePath: string): Promise<string> {
    const uri = vscode.Uri.file(filePath);
    const data = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(data).toString('utf8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  }

  async createDirectory(dirPath: string): Promise<void> {
    const uri = vscode.Uri.file(dirPath);
    await vscode.workspace.fs.createDirectory(uri);
  }

  async delete(targetPath: string, options?: { recursive?: boolean }): Promise<void> {
    const uri = vscode.Uri.file(targetPath);
    await vscode.workspace.fs.delete(uri, options);
  }
}

/**
 * Node.js filesystem adapter
 *
 * Wraps fs.promises for fast unit testing.
 * Only works with local filesystem (does NOT support remote workspaces).
 *
 * Use this in:
 * - Vitest unit tests (no Extension Host overhead)
 * - Fast test execution (no VS Code runtime)
 *
 * DO NOT use this in production extension code!
 */
export class NodeFilesystem implements IFilesystem {
  /**
   * Expose fs.promises for advanced test scenarios
   * @internal
   */
  public readonly promises = fsPromises;

  async readDirectory(dirPath: string): Promise<Array<[string, FileType]>> {
    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });

      return entries.map(entry => {
        let type = FileType.Unknown;
        if (entry.isFile()) {
          type = FileType.File;
        } else if (entry.isDirectory()) {
          type = FileType.Directory;
        } else if (entry.isSymbolicLink()) {
          type = FileType.SymbolicLink;
        }

        return [entry.name, type] as [string, FileType];
      });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(filePath: string): Promise<string> {
    return await fsPromises.readFile(filePath, 'utf8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fsPromises.writeFile(filePath, content, 'utf8');
  }

  async createDirectory(dirPath: string): Promise<void> {
    await fsPromises.mkdir(dirPath, { recursive: true });
  }

  async delete(targetPath: string, options?: { recursive?: boolean }): Promise<void> {
    if (options?.recursive) {
      await fsPromises.rm(targetPath, { recursive: true, force: true });
    } else {
      await fsPromises.unlink(targetPath);
    }
  }
}
