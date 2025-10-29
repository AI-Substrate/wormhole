import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { PathService } from '../../../../extension/src/core/bridge-context/services/PathService';
import * as vscode from 'vscode';

// Mock VS Code API
vi.mock('vscode', () => ({
    workspace: {
        workspaceFolders: undefined,
        asRelativePath: vi.fn((p: string) => {
            // Simple mock implementation
            if (p.startsWith('/project/')) {
                return p.replace('/project/', '');
            }
            return p;
        })
    },
    Uri: {
        file: vi.fn((p: string) => ({ fsPath: p, scheme: 'file', path: p })),
        joinPath: vi.fn((base: any, ...parts: string[]) => ({
            fsPath: path.join(base.fsPath, ...parts),
            scheme: base.scheme,
            path: path.join(base.path, ...parts)
        }))
    }
}));

describe('PathService', () => {
    let service: PathService;
    const extensionRoot = '/Users/test/vsc-bridge';

    beforeEach(() => {
        service = new PathService(extensionRoot);
        // Set up mock workspace
        (vscode.workspace as any).workspaceFolders = [{
            uri: { fsPath: '/project', scheme: 'file' },
            name: 'project',
            index: 0
        }];
    });

    describe('constructor and extensionRoot', () => {
        it('should store extension root path', () => {
            expect(service.extensionRoot).toBe(extensionRoot);
        });

        it('should be readonly', () => {
            expect(() => {
                (service as any).extensionRoot = '/other/path';
            }).toThrow();
        });
    });

    describe('resolve', () => {
        it('should return absolute paths unchanged', () => {
            const absPath = '/absolute/path/file.ts';
            const result = service.resolve(absPath);
            expect(result).toBe(absPath);
        });

        it('should resolve relative paths from workspace', () => {
            const relPath = './src/file.ts';
            const result = service.resolve(relPath);
            expect(result).toBe('/project/src/file.ts');
        });

        it('should expand home directory', () => {
            const homePath = '~/Documents/file.ts';
            const result = service.resolve(homePath);
            expect(result).toBe(path.join(os.homedir(), 'Documents/file.ts'));
        });

        it('should handle paths without workspace', () => {
            (vscode.workspace as any).workspaceFolders = undefined;
            const relPath = './file.ts';
            const result = service.resolve(relPath);
            // Should resolve from current working directory
            expect(result).toBe(path.resolve(process.cwd(), 'file.ts'));
        });

        it('should resolve extension-relative paths', () => {
            const extPath = 'scripts/test.js';
            const result = service.resolveExtensionPath(extPath);
            expect(result).toBe('/Users/test/vsc-bridge/scripts/test.js');
        });

        it('should handle Windows paths correctly', () => {
            // Mock Windows environment
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });

            const winPath = 'C:\\Users\\test\\file.ts';
            const result = service.resolve(winPath);
            expect(service.isAbsolute(winPath)).toBe(true);
            expect(result).toBe(winPath);

            // Restore
            Object.defineProperty(process, 'platform', {
                value: originalPlatform
            });
        });
    });

    describe('isAbsolute', () => {
        it('should detect Unix absolute paths', () => {
            expect(service.isAbsolute('/usr/local/bin')).toBe(true);
            expect(service.isAbsolute('/file.txt')).toBe(true);
        });

        it('should detect Windows absolute paths', () => {
            expect(service.isAbsolute('C:\\Windows')).toBe(true);
            expect(service.isAbsolute('D:\\file.txt')).toBe(true);
        });

        it('should detect relative paths', () => {
            expect(service.isAbsolute('./file.txt')).toBe(false);
            expect(service.isAbsolute('../parent/file.txt')).toBe(false);
            expect(service.isAbsolute('file.txt')).toBe(false);
        });

        it('should detect home directory as not absolute', () => {
            expect(service.isAbsolute('~/Documents')).toBe(false);
        });
    });

    describe('toWorkspaceRelative', () => {
        it('should convert absolute path within workspace to relative', () => {
            const absPath = '/project/src/file.ts';
            const result = service.toWorkspaceRelative(absPath);
            expect(result).toBe('src/file.ts');
        });

        it('should return undefined for paths outside workspace', () => {
            const absPath = '/other/project/file.ts';
            const result = service.toWorkspaceRelative(absPath);
            expect(result).toBeUndefined();
        });

        it('should handle workspace root path', () => {
            const result = service.toWorkspaceRelative('/project');
            expect(result).toBe('');
        });

        it('should return undefined when no workspace', () => {
            (vscode.workspace as any).workspaceFolders = undefined;
            const result = service.toWorkspaceRelative('/any/path');
            expect(result).toBeUndefined();
        });
    });

    describe('normalize', () => {
        it('should normalize path separators', () => {
            const mixedPath = 'src\\components/Button.tsx';
            const result = service.normalize(mixedPath);
            expect(result).toBe('src/components/Button.tsx');
        });

        it('should remove redundant segments', () => {
            const redundantPath = './src/../lib/./utils.ts';
            const result = service.normalize(redundantPath);
            expect(result).toBe('lib/utils.ts');
        });

        it('should handle trailing slashes', () => {
            const trailingSlash = '/project/src/';
            const result = service.normalize(trailingSlash);
            expect(result).toBe('/project/src');
        });
    });

    describe('join', () => {
        it('should join path segments', () => {
            const result = service.join('/project', 'src', 'components', 'Button.tsx');
            expect(result).toBe('/project/src/components/Button.tsx');
        });

        it('should handle empty segments', () => {
            const result = service.join('/project', '', 'src', '', 'file.ts');
            expect(result).toBe('/project/src/file.ts');
        });

        it('should handle relative paths', () => {
            const result = service.join('./src', '..', 'lib', 'utils.ts');
            expect(result).toBe('lib/utils.ts');
        });
    });

    describe('getDirectory', () => {
        it('should return directory of file path', () => {
            const result = service.getDirectory('/project/src/file.ts');
            expect(result).toBe('/project/src');
        });

        it('should handle paths without extension', () => {
            const result = service.getDirectory('/project/src/folder');
            expect(result).toBe('/project/src');
        });
    });

    describe('getFilename', () => {
        it('should return filename with extension', () => {
            const result = service.getFilename('/project/src/file.ts');
            expect(result).toBe('file.ts');
        });

        it('should return filename without path', () => {
            const result = service.getFilename('file.ts');
            expect(result).toBe('file.ts');
        });
    });

    describe('getExtension', () => {
        it('should return file extension', () => {
            expect(service.getExtension('file.ts')).toBe('.ts');
            expect(service.getExtension('package.json')).toBe('.json');
            expect(service.getExtension('README.md')).toBe('.md');
        });

        it('should return empty string for no extension', () => {
            expect(service.getExtension('README')).toBe('');
            expect(service.getExtension('.gitignore')).toBe('');
        });
    });
});