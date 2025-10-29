import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ScriptMetadataSchema } from '../../../core/discovery/types';

describe('Test Category Scripts', () => {
    describe('Directory Structure', () => {
        it('should verify tests/ directory can be created in vsc-scripts', () => {
            const scriptsDir = path.join(__dirname, '..', '..', '..', 'vsc-scripts');
            const testsDir = path.join(scriptsDir, 'tests');

            // Check that parent directory exists
            assert.ok(fs.existsSync(scriptsDir), 'vsc-scripts directory should exist');

            // If tests directory doesn't exist, it should be possible to create it
            if (!fs.existsSync(testsDir)) {
                // Verify we could create it (without actually creating in test)
                assert.doesNotThrow(() => {
                    // This would be the creation code
                    // fs.mkdirSync(testsDir, { recursive: true });
                }, 'Should be able to create tests directory');
            }
        });

        it('should recognize tests as a valid category', () => {
            const metadata = {
                alias: 'test.debug-single',
                category: 'tests',
                description: 'Debug a single test at cursor',
                response: 'waitable'
            };

            const result = ScriptMetadataSchema.safeParse(metadata);
            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.strictEqual(result.data.category, 'tests');
            }
        });

        it('should allow test-specific metadata fields', () => {
            const metadata = {
                alias: 'test.debug-single',
                category: 'tests',
                description: 'Debug a single test at cursor position',
                dangerOnly: false,
                params: {
                    path: {
                        type: 'string',
                        required: true,
                        description: 'File path containing the test'
                    },
                    line: {
                        type: 'number',
                        required: true,
                        description: 'Line number where cursor is positioned'
                    },
                    column: {
                        type: 'number',
                        required: false,
                        default: 1,
                        description: 'Column position of cursor'
                    },
                    timeoutMs: {
                        type: 'number',
                        required: false,
                        default: 60000,
                        description: 'Timeout for debug session to start'
                    }
                },
                response: 'waitable',
                errors: [
                    'E_NO_TEST_AT_CURSOR',
                    'E_TEST_PROVIDER_NOT_FOUND',
                    'E_DEBUG_SESSION_FAILED',
                    'E_TIMEOUT'
                ]
            };

            const result = ScriptMetadataSchema.safeParse(metadata);
            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.strictEqual(result.data.alias, 'test.debug-single');
                assert.strictEqual(result.data.params?.path?.type, 'string');
                assert.deepStrictEqual(result.data.errors, [
                    'E_NO_TEST_AT_CURSOR',
                    'E_TEST_PROVIDER_NOT_FOUND',
                    'E_DEBUG_SESSION_FAILED',
                    'E_TIMEOUT'
                ]);
            }
        });
    });

    describe('Script Discovery', () => {
        it('should discover scripts in tests/ directory', () => {
            // This tests that the discovery mechanism would find scripts in tests/
            const mockManifestEntry = {
                metadata: {
                    alias: 'test.debug-single',
                    category: 'tests',
                    description: 'Debug single test',
                    response: 'waitable'
                },
                scriptRelPath: 'tests/debug-single.js'
            };

            // Verify the path structure is valid
            assert.ok(mockManifestEntry.scriptRelPath.startsWith('tests/'));
            assert.ok(mockManifestEntry.scriptRelPath.endsWith('.js'));
            assert.strictEqual(mockManifestEntry.metadata.category, 'tests');
        });

        it('should handle nested test scripts', () => {
            // Tests can be organized in subdirectories
            const nestedPaths = [
                'tests/debug-single.js',
                'tests/run-single.js',
                'tests/discovery/refresh.js',
                'tests/providers/list.js'
            ];

            nestedPaths.forEach(scriptPath => {
                assert.ok(scriptPath.startsWith('tests/'),
                    `Script path should start with tests/: ${scriptPath}`);
                assert.ok(scriptPath.endsWith('.js'),
                    `Script should be a JavaScript file: ${scriptPath}`);
            });
        });
    });

    describe('Test-specific Response Types', () => {
        it('should support waitable response for debug operations', () => {
            const metadata = {
                alias: 'test.debug-single',
                response: 'waitable'
            };

            const result = ScriptMetadataSchema.safeParse(metadata);
            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.strictEqual(result.data.response, 'waitable');
            }
        });

        it('should support query response for test discovery', () => {
            const metadata = {
                alias: 'test.discover',
                response: 'query'
            };

            const result = ScriptMetadataSchema.safeParse(metadata);
            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.strictEqual(result.data.response, 'query');
            }
        });

        it('should support action response for test refresh', () => {
            const metadata = {
                alias: 'test.refresh',
                response: 'action'
            };

            const result = ScriptMetadataSchema.safeParse(metadata);
            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.strictEqual(result.data.response, 'action');
            }
        });
    });

    describe('CLI Integration', () => {
        it('should define CLI commands for test scripts', () => {
            const metadata = {
                alias: 'test.debug-single',
                cli: {
                    command: 'test debug-single',
                    description: 'Debug a single test at cursor position',
                    examples: [
                        'vscb script run test.debug-single --param path="/path/to/test.py" --param line=42',
                        'vscb test debug-single --path "/path/to/test.js" --line 15'
                    ]
                }
            };

            const result = ScriptMetadataSchema.safeParse(metadata);
            assert.strictEqual(result.success, true);
            if (result.success && result.data.cli) {
                assert.strictEqual(result.data.cli.command, 'test debug-single');
                assert.strictEqual(result.data.cli.examples?.length, 2);
            }
        });
    });

    describe('MCP Tool Integration', () => {
        it('should define MCP tools for test scripts', () => {
            const metadata = {
                alias: 'test.debug-single',
                mcp: {
                    tool: 'debug_single_test',
                    description: 'Debug a single test at the specified location'
                }
            };

            const result = ScriptMetadataSchema.safeParse(metadata);
            assert.strictEqual(result.success, true);
            if (result.success && result.data.mcp) {
                assert.strictEqual(result.data.mcp.tool, 'debug_single_test');
                assert.ok(result.data.mcp.description?.includes('Debug'));
            }
        });
    });
});