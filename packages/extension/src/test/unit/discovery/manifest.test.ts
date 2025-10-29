import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { ScriptMetadataSchema } from '../../../core/discovery/types';

describe('Script Manifest', () => {
    describe('ScriptMetadataSchema', () => {
        it('should validate valid metadata', () => {
            const validMetadata = {
                alias: 'breakpoint.set',
                category: 'breakpoint',
                description: 'Set a breakpoint',
                dangerOnly: false,
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
                },
                response: 'action',
                errors: ['E_FILE_NOT_FOUND', 'E_INVALID_LINE']
            };

            const result = ScriptMetadataSchema.safeParse(validMetadata);
            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.strictEqual(result.data.alias, 'breakpoint.set');
                assert.strictEqual(result.data.category, 'breakpoint');
            }
        });

        it('should reject metadata without alias', () => {
            const invalidMetadata = {
                category: 'test',
                description: 'Test script'
            };

            const result = ScriptMetadataSchema.safeParse(invalidMetadata);
            assert.strictEqual(result.success, false);
        });

        it('should provide defaults for optional fields', () => {
            const minimalMetadata = {
                alias: 'test.minimal'
            };

            const result = ScriptMetadataSchema.safeParse(minimalMetadata);
            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.strictEqual(result.data.dangerOnly, false);
                assert.strictEqual(result.data.response, 'action');
            }
        });

        it('should validate param types', () => {
            const metadata = {
                alias: 'test.params',
                params: {
                    invalid: {
                        type: 'invalid-type',
                        required: true
                    }
                }
            };

            const result = ScriptMetadataSchema.safeParse(metadata);
            assert.strictEqual(result.success, false);
        });

        it('should accept all response types', () => {
            const responseTypes = ['action', 'query', 'waitable', 'stream'];

            for (const responseType of responseTypes) {
                const metadata = {
                    alias: `test.${responseType}`,
                    response: responseType
                };

                const result = ScriptMetadataSchema.safeParse(metadata);
                assert.strictEqual(result.success, true);
            }
        });

        it('should validate CLI and MCP configurations', () => {
            const metadata = {
                alias: 'test.full',
                cli: {
                    command: 'test-cmd',
                    description: 'Test command',
                    examples: ['test-cmd --help', 'test-cmd run']
                },
                mcp: {
                    tool: 'test_tool',
                    description: 'Test MCP tool'
                }
            };

            const result = ScriptMetadataSchema.safeParse(metadata);
            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.strictEqual(result.data.cli?.command, 'test-cmd');
                assert.strictEqual(result.data.mcp?.tool, 'test_tool');
            }
        });
    });

    describe('YAML parsing', () => {
        it('should parse valid YAML metadata', () => {
            const yamlContent = `
alias: test.yaml
category: testing
description: Test YAML parsing
dangerOnly: false
params:
  message:
    type: string
    required: true
    description: Test message
response: action
errors:
  - E_TEST_ERROR
`;

            const parsed = yaml.parse(yamlContent);
            const result = ScriptMetadataSchema.safeParse(parsed);
            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.strictEqual(result.data.alias, 'test.yaml');
                assert.deepStrictEqual(result.data.errors, ['E_TEST_ERROR']);
            }
        });
    });
});