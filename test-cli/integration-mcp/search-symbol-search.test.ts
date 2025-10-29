import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupMcpTestEnvironment } from './helpers/mcp-test-environment.js';
import type { McpTestEnvironment } from './helpers/mcp-test-environment.js';

describe('search.symbol-search MCP Tool', () => {
    let env: McpTestEnvironment;

    beforeAll(async () => {
        // Create test environment with InMemoryTransport (fast, no Extension Host needed)
        env = setupMcpTestEnvironment({
            workspace: '/workspaces/vsc-bridge-devcontainer/test',
            timeout: 30000
        });
        await env.setup();
    }, 60000);

    afterAll(async () => {
        await env.cleanup();
    });

    it('should appear in tools list', async () => {
        const result = await env.client.request(
            { method: 'tools/list' },
            { timeout: 5000 }
        );

        expect(result.tools).toBeDefined();
        const searchTool = result.tools.find((t: any) => t.name === 'search_symbol_search');

        expect(searchTool).toBeDefined();
        expect(searchTool.name).toBe('search_symbol_search');
        expect(searchTool.description).toContain('symbol search');
    });

    it('should have correct input schema', async () => {
        const result = await env.client.request(
            { method: 'tools/list' },
            { timeout: 5000 }
        );

        const searchTool = result.tools.find((t: any) => t.name === 'search_symbol_search');
        expect(searchTool.inputSchema).toBeDefined();
        expect(searchTool.inputSchema.type).toBe('object');

        const props = searchTool.inputSchema.properties;
        expect(props.query).toBeDefined();
        expect(props.mode).toBeDefined();
        expect(props.kinds).toBeDefined();
        expect(props.limit).toBeDefined();
        expect(props.includeLocation).toBeDefined();
        expect(props.includeContainer).toBeDefined();
    });

    it('should execute workspace search with query', async () => {
        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'search_symbol_search',
                    arguments: {
                        query: 'UserService',
                        mode: 'workspace',
                        limit: 10
                    }
                }
            },
            { timeout: 10000 }
        );

        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content.length).toBeGreaterThan(0);

        // Check structured content if available
        if (result.structuredContent) {
            expect(result.structuredContent.mode).toBe('workspace');
            expect(result.structuredContent.query).toBe('UserService');
            expect(result.structuredContent.results).toBeDefined();
            expect(result.structuredContent.symbols).toBeDefined();
        }
    });

    it('should filter by kind', async () => {
        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'search_symbol_search',
                    arguments: {
                        query: '',
                        kinds: 'Class',
                        limit: 5
                    }
                }
            },
            { timeout: 10000 }
        );

        expect(result.content).toBeDefined();

        if (result.structuredContent) {
            expect(result.structuredContent.filters.kinds).toContain('Class');
            // All returned symbols should be classes
            if (result.structuredContent.symbols.length > 0) {
                result.structuredContent.symbols.forEach((sym: any) => {
                    expect(sym.kind).toBe('Class');
                });
            }
        }
    });

    it('should support multiple kind filters', async () => {
        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'search_symbol_search',
                    arguments: {
                        query: 'test',
                        kinds: 'Function,Method',
                        limit: 10
                    }
                }
            },
            { timeout: 10000 }
        );

        expect(result.content).toBeDefined();

        if (result.structuredContent && result.structuredContent.symbols.length > 0) {
            // Check statistics show only Function and Method
            const stats = result.structuredContent.statistics.byKind;
            const allowedKinds = Object.keys(stats);
            allowedKinds.forEach(kind => {
                expect(['Function', 'Method']).toContain(kind);
            });
        }
    });

    it('should respect limit parameter', async () => {
        const limit = 3;
        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'search_symbol_search',
                    arguments: {
                        query: 'test',
                        limit
                    }
                }
            },
            { timeout: 10000 }
        );

        expect(result.content).toBeDefined();

        if (result.structuredContent) {
            expect(result.structuredContent.results.returned).toBeLessThanOrEqual(limit);
            if (result.structuredContent.results.total > limit) {
                expect(result.structuredContent.results.truncated).toBe(true);
            }
        }
    });

    it('should support document mode', async () => {
        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'search_symbol_search',
                    arguments: {
                        mode: 'document',
                        path: '/workspaces/vsc-bridge-devcontainer/test/python/test_example.py',
                        limit: 20
                    }
                }
            },
            { timeout: 10000 }
        );

        expect(result.content).toBeDefined();

        if (result.structuredContent) {
            expect(result.structuredContent.mode).toBe('document');
            // Document mode may return 0 symbols if file not indexed
            expect(result.structuredContent.results).toBeDefined();
        }
    });

    it('should return statistics', async () => {
        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'search_symbol_search',
                    arguments: {
                        query: '',
                        kinds: 'Class,Interface',
                        limit: 50
                    }
                }
            },
            { timeout: 10000 }
        );

        expect(result.content).toBeDefined();

        if (result.structuredContent) {
            expect(result.structuredContent.statistics).toBeDefined();
            expect(result.structuredContent.statistics.byKind).toBeDefined();
            expect(typeof result.structuredContent.statistics.byKind).toBe('object');
        }
    });

    it('should support includeLocation flag', async () => {
        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'search_symbol_search',
                    arguments: {
                        query: 'Class',
                        limit: 5,
                        includeLocation: false
                    }
                }
            },
            { timeout: 10000 }
        );

        expect(result.content).toBeDefined();

        if (result.structuredContent && result.structuredContent.symbols.length > 0) {
            // Symbols should not have location field when includeLocation=false
            const firstSymbol = result.structuredContent.symbols[0];
            expect(firstSymbol.location).toBeUndefined();
        }
    });

    it('should support includeContainer flag', async () => {
        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'search_symbol_search',
                    arguments: {
                        query: 'Method',
                        limit: 5,
                        includeContainer: false
                    }
                }
            },
            { timeout: 10000 }
        );

        expect(result.content).toBeDefined();

        if (result.structuredContent && result.structuredContent.symbols.length > 0) {
            // Symbols should not have container field when includeContainer=false
            const firstSymbol = result.structuredContent.symbols[0];
            expect(firstSymbol.container).toBeUndefined();
        }
    });

    it('should handle empty query (return all symbols)', async () => {
        const result = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'search_symbol_search',
                    arguments: {
                        query: '',
                        limit: 100
                    }
                }
            },
            { timeout: 10000 }
        );

        expect(result.content).toBeDefined();

        if (result.structuredContent) {
            expect(result.structuredContent.query).toBe('');
            // Should return symbols even with empty query
            expect(result.structuredContent.results).toBeDefined();
        }
    });

    it('should require path for document mode', async () => {
        try {
            await env.client.request(
                {
                    method: 'tools/call',
                    params: {
                        name: 'search_symbol_search',
                        arguments: {
                            mode: 'document'
                            // path is missing
                        }
                    }
                },
                { timeout: 10000 }
            );

            // Should not reach here
            expect(true).toBe(false);
        } catch (error: any) {
            // Should throw error about missing path
            expect(error.message).toContain('path');
        }
    });
});
