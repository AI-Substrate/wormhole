import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs');

describe('CLI Manifest Loading', () => {
    const mockManifest = {
        version: 2,
        generatedAt: '2025-09-17T00:00:00.000Z',
        scripts: {
            'breakpoint.set': {
                metadata: {
                    alias: 'breakpoint.set',
                    category: 'breakpoint',
                    description: 'Set a breakpoint',
                    params: {
                        path: {
                            type: 'string',
                            required: true,
                            description: 'File path'
                        },
                        line: {
                            type: 'number',
                            required: true,
                            description: 'Line number'
                        }
                    }
                },
                scriptRelPath: 'breakpoint/set.js'
            }
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('loadManifest', () => {
        it('should load manifest from CLI dist first', () => {
            const loadManifest = (paths: string[]) => {
                for (const manifestPath of paths) {
                    try {
                        if (fs.existsSync(manifestPath)) {
                            return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                        }
                    } catch (e) {
                        continue;
                    }
                }
                throw new Error('Manifest not found in any location');
            };

            // Mock fs.existsSync to return true for first path
            vi.mocked(fs.existsSync).mockImplementation((path) => {
                return path === './dist/manifest.json';
            });
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockManifest));

            const manifest = loadManifest([
                './dist/manifest.json',
                '../extension/out/vsc-scripts/manifest.json'
            ]);

            expect(manifest).toEqual(mockManifest);
            expect(fs.existsSync).toHaveBeenCalledWith('./dist/manifest.json');
            expect(fs.readFileSync).toHaveBeenCalledWith('./dist/manifest.json', 'utf-8');
        });

        it('should fallback to extension manifest if CLI dist not found', () => {
            const loadManifest = (paths: string[]) => {
                for (const manifestPath of paths) {
                    try {
                        if (fs.existsSync(manifestPath)) {
                            return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                        }
                    } catch (e) {
                        continue;
                    }
                }
                throw new Error('Manifest not found in any location');
            };

            // Mock fs.existsSync to return true only for second path
            vi.mocked(fs.existsSync).mockImplementation((path) => {
                return path === '../extension/out/vsc-scripts/manifest.json';
            });
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockManifest));

            const manifest = loadManifest([
                './dist/manifest.json',
                '../extension/out/vsc-scripts/manifest.json'
            ]);

            expect(manifest).toEqual(mockManifest);
            expect(fs.existsSync).toHaveBeenCalledWith('./dist/manifest.json');
            expect(fs.existsSync).toHaveBeenCalledWith('../extension/out/vsc-scripts/manifest.json');
        });

        it('should throw error if no manifest found', () => {
            const loadManifest = (paths: string[]) => {
                for (const manifestPath of paths) {
                    try {
                        if (fs.existsSync(manifestPath)) {
                            return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                        }
                    } catch (e) {
                        continue;
                    }
                }
                throw new Error('Manifest not found in any location');
            };

            // Mock fs.existsSync to always return false
            vi.mocked(fs.existsSync).mockReturnValue(false);

            expect(() => loadManifest([
                './dist/manifest.json',
                '../extension/out/vsc-scripts/manifest.json'
            ])).toThrow('Manifest not found in any location');
        });

        it('should handle corrupted manifest gracefully', () => {
            const loadManifest = (paths: string[]) => {
                for (const manifestPath of paths) {
                    try {
                        if (fs.existsSync(manifestPath)) {
                            return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                        }
                    } catch (e) {
                        continue;
                    }
                }
                throw new Error('Manifest not found in any location');
            };

            // First path exists but has invalid JSON
            vi.mocked(fs.existsSync).mockImplementation((path) => {
                return path === './dist/manifest.json' || path === '../extension/out/vsc-scripts/manifest.json';
            });
            vi.mocked(fs.readFileSync).mockImplementation((path) => {
                if (path === './dist/manifest.json') {
                    return 'invalid json';
                }
                return JSON.stringify(mockManifest);
            });

            // Should skip corrupted first file and use second
            const manifest = loadManifest([
                './dist/manifest.json',
                '../extension/out/vsc-scripts/manifest.json'
            ]);

            expect(manifest).toEqual(mockManifest);
        });

        it('should validate manifest version', () => {
            const loadManifest = (paths: string[]): any => {
                for (const manifestPath of paths) {
                    try {
                        if (fs.existsSync(manifestPath)) {
                            const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                            if (content.version !== 2) {
                                throw new Error(`Unsupported manifest version: ${content.version}`);
                            }
                            return content;
                        }
                    } catch (e) {
                        if (e instanceof Error && e.message.includes('Unsupported manifest version')) {
                            throw e;
                        }
                        continue;
                    }
                }
                throw new Error('Manifest not found in any location');
            };

            const oldManifest = { ...mockManifest, version: 1 };
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(oldManifest));

            expect(() => loadManifest(['./dist/manifest.json'])).toThrow('Unsupported manifest version: 1');
        });
    });

    describe('getScriptMetadata', () => {
        it('should retrieve script metadata by alias', () => {
            const getScriptMetadata = (manifest: any, alias: string) => {
                const script = manifest.scripts[alias];
                if (!script) {
                    return null;
                }
                return script.metadata;
            };

            const metadata = getScriptMetadata(mockManifest, 'breakpoint.set');
            expect(metadata).toEqual(mockManifest.scripts['breakpoint.set'].metadata);
        });

        it('should return null for non-existent script', () => {
            const getScriptMetadata = (manifest: any, alias: string) => {
                const script = manifest.scripts[alias];
                if (!script) {
                    return null;
                }
                return script.metadata;
            };

            const metadata = getScriptMetadata(mockManifest, 'non.existent');
            expect(metadata).toBeNull();
        });

        it('should list all available scripts', () => {
            const listScripts = (manifest: any) => {
                return Object.keys(manifest.scripts);
            };

            const scripts = listScripts(mockManifest);
            expect(scripts).toEqual(['breakpoint.set']);
        });
    });

    describe('manifest caching', () => {
        it('should cache loaded manifest', () => {
            class ManifestLoader {
                private cache: any = null;

                load(paths: string[]): any {
                    if (this.cache) {
                        return this.cache;
                    }

                    for (const manifestPath of paths) {
                        try {
                            if (fs.existsSync(manifestPath)) {
                                this.cache = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                                return this.cache;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                    throw new Error('Manifest not found');
                }

                clearCache() {
                    this.cache = null;
                }
            }

            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockManifest));

            const loader = new ManifestLoader();
            const manifest1 = loader.load(['./dist/manifest.json']);
            const manifest2 = loader.load(['./dist/manifest.json']);

            // Should only read file once
            expect(fs.readFileSync).toHaveBeenCalledTimes(1);
            expect(manifest1).toBe(manifest2); // Same reference
        });
    });

    describe('manifest paths', () => {
        it('should construct correct paths based on runtime location', () => {
            const getManifestPaths = (baseDir: string): string[] => {
                return [
                    path.join(baseDir, 'dist', 'manifest.json'),
                    path.join(baseDir, '..', 'extension', 'out', 'vsc-scripts', 'manifest.json'),
                    path.join(baseDir, '..', 'extension', 'src', 'vsc-scripts', 'manifest.json')
                ];
            };

            const paths = getManifestPaths('/home/user/project/cli');

            expect(paths).toEqual([
                '/home/user/project/cli/dist/manifest.json',
                '/home/user/project/extension/out/vsc-scripts/manifest.json',
                '/home/user/project/extension/src/vsc-scripts/manifest.json'
            ]);
        });
    });
});