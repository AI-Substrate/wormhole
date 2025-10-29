import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { WorkspaceService } from '../../../../extension/src/core/bridge-context/services/WorkspaceService';

// Mock VS Code workspace API
vi.mock('vscode', () => ({
    workspace: {
        workspaceFolders: undefined,
        getWorkspaceFolder: vi.fn(),
        asRelativePath: vi.fn()
    },
    Uri: {
        file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file', path })),
        joinPath: vi.fn((base: any, ...parts: string[]) => ({
            fsPath: `${base.fsPath}/${parts.join('/')}`,
            scheme: base.scheme,
            path: `${base.path}/${parts.join('/')}`
        })),
        parse: vi.fn((str: string) => ({ fsPath: str, scheme: 'file', path: str }))
    }
}));

describe('WorkspaceService', () => {
    let service: WorkspaceService;

    beforeEach(() => {
        service = new WorkspaceService();
        // Reset workspace folders
        (vscode.workspace as any).workspaceFolders = undefined;
    });

    describe('getDefault', () => {
        it('should return first workspace folder', () => {
            const mockFolder = {
                uri: { fsPath: '/project', scheme: 'file' },
                name: 'project',
                index: 0
            };
            (vscode.workspace as any).workspaceFolders = [mockFolder];

            const result = service.getDefault();
            expect(result).toBe(mockFolder);
        });

        it('should return undefined when no workspace is open', () => {
            (vscode.workspace as any).workspaceFolders = undefined;

            const result = service.getDefault();
            expect(result).toBeUndefined();
        });

        it('should return undefined for empty workspace array', () => {
            (vscode.workspace as any).workspaceFolders = [];

            const result = service.getDefault();
            expect(result).toBeUndefined();
        });
    });

    describe('findByPath', () => {
        it('should find workspace folder containing the file', () => {
            const mockFolder = {
                uri: { fsPath: '/project', scheme: 'file' },
                name: 'project',
                index: 0
            };
            (vscode.workspace as any).workspaceFolders = [mockFolder];
            (vscode.workspace.getWorkspaceFolder as any).mockReturnValue(mockFolder);

            const result = service.findByPath('/project/src/file.ts');
            expect(result).toBe(mockFolder);
            expect(vscode.workspace.getWorkspaceFolder).toHaveBeenCalled();
        });

        it('should return undefined for path outside workspace', () => {
            (vscode.workspace as any).workspaceFolders = [{
                uri: { fsPath: '/project' },
                name: 'project'
            }];
            (vscode.workspace.getWorkspaceFolder as any).mockReturnValue(undefined);

            const result = service.findByPath('/other/file.ts');
            expect(result).toBeUndefined();
        });

        it('should handle relative paths', () => {
            const mockFolder = {
                uri: { fsPath: '/project', scheme: 'file' },
                name: 'project',
                index: 0
            };
            (vscode.workspace as any).workspaceFolders = [mockFolder];

            // For relative paths, should check default workspace
            const result = service.findByPath('./src/file.ts');
            expect(vscode.Uri.file).toHaveBeenCalled();
        });
    });

    describe('resolveUri', () => {
        it('should resolve absolute paths to Uri', () => {
            const path = '/absolute/path/file.ts';
            const result = service.resolveUri(path);

            expect(vscode.Uri.file).toHaveBeenCalledWith(path);
            expect(result.fsPath).toBe(path);
        });

        it('should resolve relative paths from workspace', () => {
            const mockFolder = {
                uri: { fsPath: '/project', scheme: 'file', path: '/project' },
                name: 'project',
                index: 0
            };
            (vscode.workspace as any).workspaceFolders = [mockFolder];

            const result = service.resolveUri('./src/file.ts');
            expect(vscode.Uri.joinPath).toHaveBeenCalledWith(mockFolder.uri, 'src/file.ts');
            expect(result.fsPath).toBe('/project/src/file.ts');
        });

        it('should handle home directory expansion', () => {
            const homePath = '~/Documents/file.ts';
            const result = service.resolveUri(homePath);

            expect(vscode.Uri.file).toHaveBeenCalled();
            const callArg = (vscode.Uri.file as any).mock.calls[0][0];
            expect(callArg).not.toContain('~');
        });

        it('should return Uri for URIs passed as strings', () => {
            const uriString = 'file:///path/to/file';
            const result = service.resolveUri(uriString);

            expect(vscode.Uri.parse).toHaveBeenCalledWith(uriString);
        });
    });

    describe('getAll', () => {
        it('should return all workspace folders', () => {
            const mockFolders = [
                { uri: { fsPath: '/project1' }, name: 'project1', index: 0 },
                { uri: { fsPath: '/project2' }, name: 'project2', index: 1 }
            ];
            (vscode.workspace as any).workspaceFolders = mockFolders;

            const result = service.getAll();
            expect(result).toEqual(mockFolders);
        });

        it('should return empty array when no workspaces', () => {
            (vscode.workspace as any).workspaceFolders = undefined;

            const result = service.getAll();
            expect(result).toEqual([]);
        });
    });

    describe('getByName', () => {
        it('should find workspace by name', () => {
            const mockFolders = [
                { uri: { fsPath: '/project1' }, name: 'frontend', index: 0 },
                { uri: { fsPath: '/project2' }, name: 'backend', index: 1 }
            ];
            (vscode.workspace as any).workspaceFolders = mockFolders;

            const result = service.getByName('backend');
            expect(result).toBe(mockFolders[1]);
        });

        it('should return undefined for non-existent name', () => {
            const mockFolders = [
                { uri: { fsPath: '/project' }, name: 'project', index: 0 }
            ];
            (vscode.workspace as any).workspaceFolders = mockFolders;

            const result = service.getByName('nonexistent');
            expect(result).toBeUndefined();
        });

        it('should be case-sensitive', () => {
            const mockFolders = [
                { uri: { fsPath: '/project' }, name: 'MyProject', index: 0 }
            ];
            (vscode.workspace as any).workspaceFolders = mockFolders;

            const result = service.getByName('myproject');
            expect(result).toBeUndefined();
        });
    });
});