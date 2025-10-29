/**
 * Mock vscode module for unit tests
 *
 * This is a minimal mock that allows unit tests to import modules
 * that have vscode dependencies without requiring Extension Host.
 *
 * For tests that actually need VS Code APIs, use Extension Host integration tests.
 */

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
}

export class Uri {
  static file(path: string): Uri {
    return new Uri(path);
  }

  constructor(public fsPath: string) {}
}

export const workspace = {
  fs: {
    readDirectory: async (_uri: Uri): Promise<Array<[string, FileType]>> => {
      throw new Error('Mock not implemented - use NodeFilesystem in tests');
    },
    stat: async (_uri: Uri): Promise<any> => {
      throw new Error('Mock not implemented - use NodeFilesystem in tests');
    },
    readFile: async (_uri: Uri): Promise<Uint8Array> => {
      throw new Error('Mock not implemented - use NodeFilesystem in tests');
    },
    writeFile: async (_uri: Uri, _content: Uint8Array): Promise<void> => {
      throw new Error('Mock not implemented - use NodeFilesystem in tests');
    },
    createDirectory: async (_uri: Uri): Promise<void> => {
      throw new Error('Mock not implemented - use NodeFilesystem in tests');
    },
    delete: async (_uri: Uri, _options?: { recursive?: boolean }): Promise<void> => {
      throw new Error('Mock not implemented - use NodeFilesystem in tests');
    }
  },
  workspaceFolders: undefined
};
