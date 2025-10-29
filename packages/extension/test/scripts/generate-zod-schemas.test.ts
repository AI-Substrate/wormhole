import { describe, it, expect } from 'vitest';
import { metadataToZodSchema, generateAllSchemas } from '../../scripts/generate-zod-schemas';
import type { ScriptMetadata } from '../../src/vsc-scripts/manifest.json';

describe('Zod Schema Generation', () => {
    describe('metadataToZodSchema', () => {
        it('should generate schema for string parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.string',
                description: 'Test script',
                params: {
                    name: {
                        type: 'string',
                        required: true,
                        description: 'A name parameter'
                    },
                    message: {
                        type: 'string',
                        required: false,
                        minLength: 5,
                        maxLength: 100,
                        description: 'Optional message'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata);

            expect(schema).toContain('z.object({');
            expect(schema).toContain('name: z.string()');
            expect(schema).toContain('message: z.string().min(5).max(100).optional()');
        });

        it('should generate schema for number parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.number',
                description: 'Test script',
                params: {
                    line: {
                        type: 'number',
                        required: true,
                        min: 1,
                        integer: true,
                        description: 'Line number'
                    },
                    timeout: {
                        type: 'number',
                        required: false,
                        default: 5000,
                        min: 0,
                        max: 60000,
                        description: 'Timeout in ms'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata);

            expect(schema).toContain('line: z.number().int().min(1)');
            expect(schema).toContain('timeout: z.number().min(0).max(60000).default(5000).optional()');
        });

        it('should generate schema for boolean parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.boolean',
                description: 'Test script',
                params: {
                    enabled: {
                        type: 'boolean',
                        required: true,
                        description: 'Enable feature'
                    },
                    verbose: {
                        type: 'boolean',
                        required: false,
                        default: false,
                        description: 'Verbose output'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata);

            expect(schema).toContain('enabled: z.boolean()');
            expect(schema).toContain('verbose: z.boolean().default(false).optional()');
        });

        it('should generate schema for enum parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.enum',
                description: 'Test script',
                params: {
                    mode: {
                        type: 'enum',
                        values: ['fast', 'normal', 'slow'],
                        required: true,
                        description: 'Execution mode'
                    },
                    format: {
                        type: 'enum',
                        values: ['json', 'yaml', 'xml'],
                        required: false,
                        default: 'json',
                        description: 'Output format'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata);

            expect(schema).toContain('mode: z.enum(["fast", "normal", "slow"])');
            expect(schema).toContain('format: z.enum(["json", "yaml", "xml"]).default("json").optional()');
        });

        it('should generate schema for array parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.array',
                description: 'Test script',
                params: {
                    tags: {
                        type: 'array',
                        required: true,
                        description: 'List of tags'
                    },
                    ids: {
                        type: 'array',
                        required: false,
                        description: 'List of IDs'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata);

            expect(schema).toContain('tags: z.array(z.unknown())');
            expect(schema).toContain('ids: z.array(z.unknown()).optional()');
        });

        it('should generate schema for object parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.object',
                description: 'Test script',
                params: {
                    config: {
                        type: 'object',
                        required: true,
                        description: 'Configuration object'
                    },
                    metadata: {
                        type: 'object',
                        required: false,
                        description: 'Optional metadata'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata);

            expect(schema).toContain('config: z.record(z.unknown())');
            expect(schema).toContain('metadata: z.record(z.unknown()).optional()');
        });

        it('should handle scripts with no parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.noparams',
                description: 'Script with no params'
            };

            const schema = metadataToZodSchema(metadata);

            expect(schema).toBe('z.object({}).strict()');
        });

        it('should add .strict() for schemas with parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.strict',
                description: 'Test script',
                params: {
                    name: {
                        type: 'string',
                        required: true,
                        description: 'Name'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata);

            expect(schema).toContain('}).strict()');
        });

        it('should handle complex nested constraints', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.complex',
                description: 'Complex test',
                params: {
                    port: {
                        type: 'number',
                        required: true,
                        min: 1024,
                        max: 65535,
                        integer: true,
                        description: 'Port number'
                    },
                    username: {
                        type: 'string',
                        required: true,
                        minLength: 3,
                        maxLength: 20,
                        description: 'Username'
                    },
                    protocol: {
                        type: 'enum',
                        values: ['http', 'https', 'ws', 'wss'],
                        required: false,
                        default: 'https',
                        description: 'Protocol'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata);

            expect(schema).toContain('port: z.number().int().min(1024).max(65535)');
            expect(schema).toContain('username: z.string().min(3).max(20)');
            expect(schema).toContain('protocol: z.enum(["http", "https", "ws", "wss"]).default("https").optional()');
        });

        it('should preserve parameter order', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.order',
                description: 'Test order',
                params: {
                    first: { type: 'string', required: true, description: 'First' },
                    second: { type: 'number', required: true, description: 'Second' },
                    third: { type: 'boolean', required: false, description: 'Third' }
                }
            };

            const schema = metadataToZodSchema(metadata);
            const lines = schema.split('\n');

            const firstIndex = lines.findIndex(l => l.includes('first:'));
            const secondIndex = lines.findIndex(l => l.includes('second:'));
            const thirdIndex = lines.findIndex(l => l.includes('third:'));

            expect(firstIndex).toBeLessThan(secondIndex);
            expect(secondIndex).toBeLessThan(thirdIndex);
        });
    });

    describe('generateAllSchemas', () => {
        it('should generate a complete schemas file', () => {
            const manifest = {
                version: 2,
                scripts: {
                    'bp.set': {
                        metadata: {
                            alias: 'bp.set',
                            description: 'Set breakpoint',
                            params: {
                                path: { type: 'string', required: true, description: 'File path' },
                                line: { type: 'number', required: true, integer: true, min: 1, description: 'Line number' }
                            }
                        }
                    },
                    'debug.start': {
                        metadata: {
                            alias: 'debug.start',
                            description: 'Start debugging',
                            params: {
                                config: { type: 'string', required: true, description: 'Config name' }
                            }
                        }
                    }
                }
            };

            const result = generateAllSchemas(manifest);

            // Check file structure
            expect(result).toContain('import { z } from "zod"');
            expect(result).toContain('export const scriptSchemas = {');
            expect(result).toContain('"bp.set":');
            expect(result).toContain('"debug.start":');
            expect(result).toContain('} as const;');

            // Check schema generation
            expect(result).toContain('path: z.string()');
            expect(result).toContain('line: z.number().int().min(1)');
            expect(result).toContain('config: z.string()');

            // Check TypeScript types
            expect(result).toContain('export type ScriptSchemas = typeof scriptSchemas;');
            expect(result).toContain('export type ScriptParams<T extends keyof ScriptSchemas>');
        });

        it('should handle empty manifest', () => {
            const manifest = {
                version: 2,
                scripts: {}
            };

            const result = generateAllSchemas(manifest);

            expect(result).toContain('export const scriptSchemas = {');
            expect(result).toContain('} as const;');
        });

        it('should escape special characters in aliases', () => {
            const manifest = {
                version: 2,
                scripts: {
                    'script-with.special-chars': {
                        metadata: {
                            alias: 'script-with.special-chars',
                            description: 'Test',
                            params: {}
                        }
                    }
                }
            };

            const result = generateAllSchemas(manifest);

            expect(result).toContain('"script-with.special-chars":');
        });

        it('should add generation timestamp comment', () => {
            const manifest = {
                version: 2,
                scripts: {}
            };

            const result = generateAllSchemas(manifest);

            expect(result).toContain('// Generated by generate-zod-schemas.ts');
            expect(result).toMatch(/\/\/ Generated on: \d{4}-\d{2}-\d{2}/);
        });

        it('should handle all parameter types', () => {
            const manifest = {
                version: 2,
                scripts: {
                    'test.all': {
                        metadata: {
                            alias: 'test.all',
                            description: 'All types',
                            params: {
                                str: { type: 'string', required: true, description: 'String' },
                                num: { type: 'number', required: true, description: 'Number' },
                                bool: { type: 'boolean', required: true, description: 'Boolean' },
                                enum: { type: 'enum', values: ['a', 'b'], required: true, description: 'Enum' },
                                arr: { type: 'array', required: false, description: 'Array' },
                                obj: { type: 'object', required: false, description: 'Object' }
                            }
                        }
                    }
                }
            };

            const result = generateAllSchemas(manifest);

            expect(result).toContain('str: z.string()');
            expect(result).toContain('num: z.number()');
            expect(result).toContain('bool: z.boolean()');
            expect(result).toContain('enum: z.enum(["a", "b"])');
            expect(result).toContain('arr: z.array(z.unknown()).optional()');
            expect(result).toContain('obj: z.record(z.unknown()).optional()');
        });
    });

    describe('Type coercion', () => {
        it('should add .coerce() for number parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.coerce',
                description: 'Test coercion',
                params: {
                    port: {
                        type: 'number',
                        required: true,
                        description: 'Port'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata, { enableCoercion: true });

            expect(schema).toContain('port: z.coerce.number()');
        });

        it('should add .coerce() for boolean parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.coerce',
                description: 'Test coercion',
                params: {
                    enabled: {
                        type: 'boolean',
                        required: true,
                        description: 'Enabled'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata, { enableCoercion: true });

            expect(schema).toContain('enabled: z.coerce.boolean()');
        });

        it('should not add .coerce() when disabled', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.nocoerce',
                description: 'Test no coercion',
                params: {
                    port: {
                        type: 'number',
                        required: true,
                        description: 'Port'
                    }
                }
            };

            const schema = metadataToZodSchema(metadata, { enableCoercion: false });

            expect(schema).toContain('port: z.number()');
            expect(schema).not.toContain('z.coerce');
        });
    });
});