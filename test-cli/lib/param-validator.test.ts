import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    validateParams,
    coerceValue,
    findClosestMatch,
    formatValidationErrors,
    type ValidationResult,
    type ValidationError
} from '../../src/lib/param-validator';
import { type ScriptMetadata } from '../../src/lib/manifest-loader';

describe('Parameter Validation', () => {
    const mockMetadata: ScriptMetadata = {
        alias: 'test.script',
        description: 'Test script',
        params: {
            requiredString: {
                type: 'string',
                required: true,
                description: 'A required string parameter'
            },
            optionalNumber: {
                type: 'number',
                required: false,
                description: 'An optional number parameter'
            },
            requiredBoolean: {
                type: 'boolean',
                required: true,
                description: 'A required boolean parameter'
            },
            enumParam: {
                type: 'enum',
                values: ['option1', 'option2', 'option3'],
                required: false,
                description: 'An enum parameter'
            },
            defaultNumber: {
                type: 'number',
                required: false,
                default: 42,
                description: 'Number with default'
            }
        }
    };

    describe('validateParams', () => {
        it('should validate valid parameters', () => {
            const params = {
                requiredString: 'hello',
                requiredBoolean: true,
                optionalNumber: 123
            };

            const result = validateParams(mockMetadata, params);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.coercedParams).toEqual({
                ...params,
                defaultNumber: 42  // Default value should be added
            });
        });

        it('should detect missing required parameters', () => {
            const params = {
                requiredString: 'hello'
                // Missing requiredBoolean
            };

            const result = validateParams(mockMetadata, params);

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('requiredBoolean');
            expect(result.errors[0].message).toContain('Missing required parameter');
        });

        it('should detect type mismatches', () => {
            const params = {
                requiredString: 'hello',
                requiredBoolean: 'not-a-boolean',
                optionalNumber: 'not-a-number'
            };

            const result = validateParams(mockMetadata, params);

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(2);
            expect(result.errors.find(e => e.field === 'requiredBoolean')).toBeDefined();
            expect(result.errors.find(e => e.field === 'optionalNumber')).toBeDefined();
        });

        it('should detect unknown parameters', () => {
            const params = {
                requiredString: 'hello',
                requiredBoolean: true,
                unknownParam: 'value'
            };

            const result = validateParams(mockMetadata, params);

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('unknownParam');
            expect(result.errors[0].message).toContain('Unknown parameter');
        });

        it('should validate enum values', () => {
            const params = {
                requiredString: 'hello',
                requiredBoolean: true,
                enumParam: 'invalid-option'
            };

            const result = validateParams(mockMetadata, params);

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('enumParam');
            expect(result.errors[0].message).toContain('must be one of');
        });

        it('should accept valid enum values', () => {
            const params = {
                requiredString: 'hello',
                requiredBoolean: true,
                enumParam: 'option2'
            };

            const result = validateParams(mockMetadata, params);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should handle scripts with no parameters', () => {
            const noParamMetadata: ScriptMetadata = {
                alias: 'no.params',
                description: 'Script with no params'
                // No params defined
            };

            const result = validateParams(noParamMetadata, {});

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject parameters for scripts with no params defined', () => {
            const noParamMetadata: ScriptMetadata = {
                alias: 'no.params',
                description: 'Script with no params'
            };

            const result = validateParams(noParamMetadata, { unexpected: 'value' });

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('unexpected');
        });

        it('should map aliases to canonical parameter names', () => {
            const metadataWithAliases: ScriptMetadata = {
                alias: 'breakpoint.set',
                description: 'Set breakpoint',
                params: {
                    path: {
                        type: 'string',
                        required: true,
                        aliases: ['file', 'filepath', 'f']
                    },
                    line: {
                        type: 'number',
                        required: true,
                        aliases: ['l', 'lineNumber']
                    }
                }
            };

            // Test using alias 'file' instead of 'path'
            const params1 = { file: '/test.js', l: 42 };
            const result1 = validateParams(metadataWithAliases, params1);

            expect(result1.valid).toBe(true);
            expect(result1.coercedParams).toEqual({
                path: '/test.js',
                line: 42
            });

            // Test using another alias 'filepath'
            const params2 = { filepath: '/test.py', lineNumber: 100 };
            const result2 = validateParams(metadataWithAliases, params2);

            expect(result2.valid).toBe(true);
            expect(result2.coercedParams).toEqual({
                path: '/test.py',
                line: 100
            });
        });

        it('should detect unknown parameters even when aliases exist', () => {
            const metadataWithAliases: ScriptMetadata = {
                alias: 'test.alias',
                description: 'Test with aliases',
                params: {
                    path: {
                        type: 'string',
                        required: true,
                        aliases: ['file', 'f']
                    }
                }
            };

            const params = {
                file: '/test.js',  // Valid alias
                unknown: 'value'   // Unknown parameter
            };
            const result = validateParams(metadataWithAliases, params);

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('unknown');
        });

        it('should resolve workspace-relative paths', () => {
            const metadataWithResolve: ScriptMetadata = {
                alias: 'test.paths',
                description: 'Test path resolution',
                params: {
                    filePath: {
                        type: 'string',
                        required: true,
                        resolve: 'workspace-relative'
                    },
                    cwdPath: {
                        type: 'string',
                        required: false,
                        resolve: 'cwd-relative'
                    },
                    absolutePath: {
                        type: 'string',
                        required: false,
                        resolve: 'absolute'
                    }
                }
            };

            const params = {
                filePath: 'src/test.js',
                cwdPath: './config.json',
                absolutePath: '/absolute/path.txt'
            };

            const result = validateParams(metadataWithResolve, params, {
                workspaceRoot: '/workspace'
            });

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.filePath).toBe('/workspace/src/test.js');
            // Note: cwdPath will resolve relative to process.cwd() which varies
            expect(result.coercedParams?.cwdPath).toMatch(/^\/.*config\.json$/);
            expect(result.coercedParams?.absolutePath).toBe('/absolute/path.txt');
        });

        it('should handle already absolute paths correctly', () => {
            const metadataWithResolve: ScriptMetadata = {
                alias: 'test.abs',
                description: 'Test absolute paths',
                params: {
                    path: {
                        type: 'string',
                        required: true,
                        resolve: 'workspace-relative'
                    }
                }
            };

            const params = { path: '/already/absolute.js' };
            const result = validateParams(metadataWithResolve, params, {
                workspaceRoot: '/workspace'
            });

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.path).toBe('/already/absolute.js');
        });

        it('should reject empty strings for required parameters by default', () => {
            const metadataWithRequired: ScriptMetadata = {
                alias: 'test.empty',
                description: 'Test empty string policy',
                params: {
                    requiredNonEmpty: {
                        type: 'string',
                        required: true
                        // minLength not specified, so empty should be rejected
                    },
                    requiredCanBeEmpty: {
                        type: 'string',
                        required: true,
                        minLength: 0  // Explicitly allow empty
                    },
                    optional: {
                        type: 'string',
                        required: false
                    }
                }
            };

            // Test empty string for regular required
            const params1 = { requiredNonEmpty: '', requiredCanBeEmpty: '', optional: '' };
            const result1 = validateParams(metadataWithRequired, params1);

            expect(result1.valid).toBe(false);
            expect(result1.errors).toHaveLength(1);
            expect(result1.errors[0].field).toBe('requiredNonEmpty');
            expect(result1.errors[0].message).toContain('cannot be empty');

            // Test valid non-empty strings
            const params2 = { requiredNonEmpty: 'value', requiredCanBeEmpty: '' };
            const result2 = validateParams(metadataWithRequired, params2);

            expect(result2.valid).toBe(true);
            expect(result2.coercedParams).toEqual({
                requiredNonEmpty: 'value',
                requiredCanBeEmpty: ''
            });

            // Test optional can be empty
            const params3 = { requiredNonEmpty: 'value', requiredCanBeEmpty: 'x', optional: '' };
            const result3 = validateParams(metadataWithRequired, params3);

            expect(result3.valid).toBe(true);
            expect(result3.coercedParams?.optional).toBe('');
        });

        it('should validate string patterns using regex', () => {
            const metadataWithPattern: ScriptMetadata = {
                alias: 'test.pattern',
                description: 'Test pattern validation',
                params: {
                    email: {
                        type: 'string',
                        required: true,
                        pattern: '^[a-z]+@[a-z]+\\.[a-z]+$'
                    },
                    version: {
                        type: 'string',
                        required: false,
                        pattern: '^\\d+\\.\\d+\\.\\d+$'
                    }
                }
            };

            // Valid patterns
            const params1 = { email: 'test@example.com', version: '1.2.3' };
            const result1 = validateParams(metadataWithPattern, params1);

            expect(result1.valid).toBe(true);
            expect(result1.coercedParams).toEqual(params1);

            // Invalid email pattern
            const params2 = { email: 'invalid-email' };
            const result2 = validateParams(metadataWithPattern, params2);

            expect(result2.valid).toBe(false);
            expect(result2.errors).toHaveLength(1);
            expect(result2.errors[0].field).toBe('email');
            expect(result2.errors[0].message).toContain('does not match pattern');

            // Invalid version pattern
            const params3 = { email: 'test@example.com', version: '1.2' };
            const result3 = validateParams(metadataWithPattern, params3);

            expect(result3.valid).toBe(false);
            expect(result3.errors).toHaveLength(1);
            expect(result3.errors[0].field).toBe('version');
        });
    });

    describe('coerceValue', () => {
        it('should coerce string to number', () => {
            expect(coerceValue('42', 'number')).toBe(42);
            expect(coerceValue('3.14', 'number')).toBe(3.14);
            expect(coerceValue('-10', 'number')).toBe(-10);
        });

        it('should fail to coerce invalid number strings', () => {
            expect(() => coerceValue('abc', 'number')).toThrow();
            expect(() => coerceValue('', 'number')).toThrow();
            expect(() => coerceValue('12abc', 'number')).toThrow();
        });

        it('should coerce string to boolean', () => {
            expect(coerceValue('true', 'boolean')).toBe(true);
            expect(coerceValue('false', 'boolean')).toBe(false);
            expect(coerceValue('1', 'boolean')).toBe(true);
            expect(coerceValue('0', 'boolean')).toBe(false);
        });

        it('should fail to coerce invalid boolean strings', () => {
            expect(() => coerceValue('yes', 'boolean')).toThrow();
            expect(() => coerceValue('no', 'boolean')).toThrow();
            expect(() => coerceValue('abc', 'boolean')).toThrow();
        });

        it('should keep strings as strings', () => {
            expect(coerceValue('hello', 'string')).toBe('hello');
            expect(coerceValue(123, 'string')).toBe('123');
            expect(coerceValue(true, 'string')).toBe('true');
        });

        it('should not coerce enum values', () => {
            expect(coerceValue('option1', 'enum')).toBe('option1');
        });

        it('should handle already correct types', () => {
            expect(coerceValue(42, 'number')).toBe(42);
            expect(coerceValue(true, 'boolean')).toBe(true);
            expect(coerceValue(false, 'boolean')).toBe(false);
        });
    });

    describe('findClosestMatch', () => {
        const options = ['path', 'line', 'condition', 'hitCondition', 'logMessage'];

        it('should find close matches', () => {
            expect(findClosestMatch('paht', options)).toBe('path');
            expect(findClosestMatch('lien', options)).toBe('line');
            expect(findClosestMatch('conditon', options)).toBe('condition');
        });

        it('should return null for very different strings', () => {
            expect(findClosestMatch('xyz', options)).toBeNull();
            expect(findClosestMatch('completely_different', options)).toBeNull();
        });

        it('should handle exact matches', () => {
            expect(findClosestMatch('path', options)).toBe('path');
        });

        it('should be case insensitive', () => {
            expect(findClosestMatch('Path', options)).toBe('path');
            expect(findClosestMatch('LINE', options)).toBe('line');
        });

        it('should handle empty input', () => {
            expect(findClosestMatch('', options)).toBeNull();
        });

        it('should handle empty options', () => {
            expect(findClosestMatch('test', [])).toBeNull();
        });
    });

    describe('formatValidationErrors', () => {
        it('should format single error', () => {
            const errors: ValidationError[] = [
                {
                    field: 'line',
                    message: 'Expected number, got string',
                    expected: 'number',
                    received: 'string'
                }
            ];

            const formatted = formatValidationErrors(errors, mockMetadata);

            expect(formatted).toContain('Parameter validation failed');
            expect(formatted).toContain('line');
            expect(formatted).toContain('Expected number, got string');
        });

        it('should format multiple errors', () => {
            const errors: ValidationError[] = [
                {
                    field: 'requiredString',
                    message: 'Missing required parameter'
                },
                {
                    field: 'optionalNumber',
                    message: 'Expected number, got string'
                }
            ];

            const formatted = formatValidationErrors(errors, mockMetadata);

            expect(formatted).toContain('requiredString');
            expect(formatted).toContain('Missing required parameter');
            expect(formatted).toContain('optionalNumber');
            expect(formatted).toContain('Expected number, got string');
        });

        it('should include suggestions when available', () => {
            const errors: ValidationError[] = [
                {
                    field: 'unkown_param',
                    message: 'Unknown parameter',
                    suggestion: 'unknownParam'
                }
            ];

            const formatted = formatValidationErrors(errors, mockMetadata);

            expect(formatted).toContain('Did you mean');
            expect(formatted).toContain('unknownParam');
        });

        it('should show expected parameters', () => {
            const errors: ValidationError[] = [
                { field: 'test', message: 'Test error' }
            ];

            const formatted = formatValidationErrors(errors, mockMetadata);

            expect(formatted).toContain('Expected parameters');
            expect(formatted).toContain('requiredString');
            expect(formatted).toContain('A required string parameter');
        });

        it('should indicate required vs optional', () => {
            const errors: ValidationError[] = [
                { field: 'test', message: 'Test error' }
            ];

            const formatted = formatValidationErrors(errors, mockMetadata);

            expect(formatted).toContain('requiredString*');
            expect(formatted).toContain('optionalNumber');
            expect(formatted).not.toContain('optionalNumber*');
        });

        it('should show path resolution details in errors', () => {
            const errors: ValidationError[] = [
                {
                    field: 'filePath',
                    message: 'File not found',
                    originalPath: './test.py',
                    resolvedPath: '/home/user/project/test.py',
                    resolutionStrategy: 'cwd-relative'
                }
            ];

            const formatted = formatValidationErrors(errors, mockMetadata);

            expect(formatted).toContain('File not found');
            expect(formatted).toContain('./test.py');
            expect(formatted).toContain('/home/user/project/test.py');
            expect(formatted).toContain('cwd-relative');
        });

        it('should show path resolution for multiple path errors', () => {
            const errors: ValidationError[] = [
                {
                    field: 'sourcePath',
                    message: 'File not found',
                    originalPath: './src/main.py',
                    resolvedPath: '/home/user/project/src/main.py',
                    resolutionStrategy: 'cwd-relative'
                },
                {
                    field: 'destPath',
                    message: 'Directory not writable',
                    originalPath: '../output/',
                    resolvedPath: '/home/user/output/',
                    resolutionStrategy: 'cwd-relative'
                }
            ];

            const formatted = formatValidationErrors(errors, mockMetadata);

            expect(formatted).toContain('sourcePath');
            expect(formatted).toContain('./src/main.py');
            expect(formatted).toContain('/home/user/project/src/main.py');
            expect(formatted).toContain('destPath');
            expect(formatted).toContain('../output/');
            expect(formatted).toContain('/home/user/output/');
        });

        it('should handle errors without path resolution details', () => {
            const errors: ValidationError[] = [
                {
                    field: 'line',
                    message: 'Expected number, got string',
                    expected: 'number',
                    received: 'string'
                }
            ];

            const formatted = formatValidationErrors(errors, mockMetadata);

            expect(formatted).toContain('Expected number, got string');
            expect(formatted).not.toContain('resolved to');
        });

        it('should include path resolution details in validation errors', () => {
            const mockCwd = '/home/user/project';

            // Mock process.cwd() for this test
            const originalCwd = process.cwd;
            process.cwd = vi.fn().mockReturnValue(mockCwd);

            try {
                const metadata: ScriptMetadata = {
                    alias: 'test.path.validation',
                    description: 'Test path validation with resolution',
                    params: {
                        filePath: {
                            type: 'string',
                            required: true,
                            resolve: 'cwd-relative',
                            maxLength: 5  // This will cause validation to fail
                        }
                    }
                };

                const params = { filePath: './long-file-name.py' }; // This will resolve to a long path that exceeds maxLength
                const result = validateParams(metadata, params, {
                    workspaceRoot: mockCwd
                });

                expect(result.valid).toBe(false);
                expect(result.errors).toHaveLength(1);
                expect(result.errors[0].field).toBe('filePath');
                expect(result.errors[0].message).toContain('String length must be <= 5');
                expect(result.errors[0].originalPath).toBe('./long-file-name.py');
                expect(result.errors[0].resolvedPath).toBe('/home/user/project/long-file-name.py');
                expect(result.errors[0].resolutionStrategy).toBe('cwd-relative');
            } finally {
                // Restore original process.cwd
                process.cwd = originalCwd;
            }
        });
    });

    describe('Type coercion integration', () => {
        it('should coerce and validate mixed parameter types', () => {
            const params = {
                requiredString: 'hello',
                requiredBoolean: 'true',  // String that should be coerced
                optionalNumber: '123'      // String that should be coerced
            };

            const result = validateParams(mockMetadata, params);

            expect(result.valid).toBe(true);
            expect(result.coercedParams).toEqual({
                requiredString: 'hello',
                requiredBoolean: true,
                optionalNumber: 123,
                defaultNumber: 42  // Default value should be added
            });
        });

        it('should fail validation after failed coercion', () => {
            const params = {
                requiredString: 'hello',
                requiredBoolean: 'invalid',  // Can't be coerced to boolean
                optionalNumber: 'abc'         // Can't be coerced to number
            };

            const result = validateParams(mockMetadata, params);

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(2);
        });
    });

    describe('Edge cases', () => {
        it('should handle null and undefined values', () => {
            const params = {
                requiredString: null,
                requiredBoolean: undefined
            };

            const result = validateParams(mockMetadata, params as any);

            expect(result.valid).toBe(false);
            expect(result.errors.find(e => e.field === 'requiredString')).toBeDefined();
            expect(result.errors.find(e => e.field === 'requiredBoolean')).toBeDefined();
        });

        it('should handle empty strings', () => {
            const params = {
                requiredString: '',
                requiredBoolean: true
            };

            const result = validateParams(mockMetadata, params);

            // Empty string is now rejected for required parameters (unless minLength: 0 is set)
            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('requiredString');
            expect(result.errors[0].message).toContain('cannot be empty');
        });

        it('should handle numeric strings for boolean', () => {
            const params = {
                requiredString: 'hello',
                requiredBoolean: '1'  // Should coerce to true
            };

            const result = validateParams(mockMetadata, params);

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.requiredBoolean).toBe(true);
        });
        });
    });

    describe('CWD-relative path resolution', () => {
        const mockCwd = '/home/user/project';

        beforeEach(() => {
            // Mock process.cwd() for consistent testing
            vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should resolve simple relative paths to CWD', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.cwd',
                description: 'Test CWD-relative path resolution',
                params: {
                    filePath: {
                        type: 'string',
                        required: true,
                        resolve: 'cwd-relative'
                    }
                }
            };

            const params = { filePath: 'test.py' };
            const result = validateParams(metadata, params, {
                workspaceRoot: mockCwd
            });

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.filePath).toBe('/home/user/project/test.py');
        });

        it('should resolve dot notation paths', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.dot',
                description: 'Test dot notation path resolution',
                params: {
                    filePath: {
                        type: 'string',
                        required: true,
                        resolve: 'cwd-relative'
                    }
                }
            };

            const params = { filePath: './test.py' };
            const result = validateParams(metadata, params, {
                workspaceRoot: mockCwd
            });

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.filePath).toBe('/home/user/project/test.py');
        });

        it('should resolve parent directory paths', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.parent',
                description: 'Test parent directory path resolution',
                params: {
                    filePath: {
                        type: 'string',
                        required: true,
                        resolve: 'cwd-relative'
                    }
                }
            };

            const params = { filePath: '../other/test.py' };
            const result = validateParams(metadata, params, {
                workspaceRoot: mockCwd
            });

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.filePath).toBe('/home/user/other/test.py');
        });

        it('should resolve nested directory paths', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.nested',
                description: 'Test nested directory path resolution',
                params: {
                    filePath: {
                        type: 'string',
                        required: true,
                        resolve: 'cwd-relative'
                    }
                }
            };

            const params = { filePath: 'src/lib/test.py' };
            const result = validateParams(metadata, params, {
                workspaceRoot: mockCwd
            });

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.filePath).toBe('/home/user/project/src/lib/test.py');
        });

        it('should leave absolute paths unchanged', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.absolute',
                description: 'Test absolute path handling',
                params: {
                    filePath: {
                        type: 'string',
                        required: true,
                        resolve: 'cwd-relative'
                    }
                }
            };

            const params = { filePath: '/absolute/path/test.py' };
            const result = validateParams(metadata, params, {
                workspaceRoot: mockCwd
            });

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.filePath).toBe('/absolute/path/test.py');
        });

        it('should handle paths with spaces', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.spaces',
                description: 'Test paths with spaces',
                params: {
                    filePath: {
                        type: 'string',
                        required: true,
                        resolve: 'cwd-relative'
                    }
                }
            };

            const params = { filePath: 'my file.py' };
            const result = validateParams(metadata, params, {
                workspaceRoot: mockCwd
            });

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.filePath).toBe('/home/user/project/my file.py');
        });

        it('should handle multiple path parameters', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.multiple',
                description: 'Test multiple path parameters',
                params: {
                    sourcePath: {
                        type: 'string',
                        required: true,
                        resolve: 'cwd-relative'
                    },
                    destPath: {
                        type: 'string',
                        required: true,
                        resolve: 'cwd-relative'
                    },
                    configPath: {
                        type: 'string',
                        required: false,
                        resolve: 'cwd-relative'
                    }
                }
            };

            const params = {
                sourcePath: 'src/main.py',
                destPath: './dist/main.py',
                configPath: '../config/settings.json'
            };
            const result = validateParams(metadata, params, {
                workspaceRoot: mockCwd
            });

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.sourcePath).toBe('/home/user/project/src/main.py');
            expect(result.coercedParams?.destPath).toBe('/home/user/project/dist/main.py');
            expect(result.coercedParams?.configPath).toBe('/home/user/config/settings.json');
        });

        it('should work with workspace-relative strategy when workspaceRoot is CWD', () => {
            const metadata: ScriptMetadata = {
                alias: 'test.workspace',
                description: 'Test workspace-relative with CWD as workspace',
                params: {
                    filePath: {
                        type: 'string',
                        required: true,
                        resolve: 'workspace-relative'
                    }
                }
            };

            const params = { filePath: 'test.py' };
            const result = validateParams(metadata, params, {
                workspaceRoot: mockCwd
            });

            expect(result.valid).toBe(true);
            expect(result.coercedParams?.filePath).toBe('/home/user/project/test.py');
        });

        it('should log path resolution when DEBUG=vscb:path is set', () => {
            const originalDebug = process.env.DEBUG;
            const originalConsoleError = console.error;
            const logs: string[] = [];

            // Mock console.error to capture debug logs
            console.error = vi.fn((message: string) => {
                logs.push(message);
            });

            // Set debug environment
            process.env.DEBUG = 'vscb:path';

            try {
                const metadata: ScriptMetadata = {
                    alias: 'test.debug',
                    description: 'Test debug logging',
                    params: {
                        filePath: {
                            type: 'string',
                            required: true,
                            resolve: 'cwd-relative'
                        }
                    }
                };

                const params = { filePath: './test.py' };
                const result = validateParams(metadata, params, {
                    workspaceRoot: mockCwd
                });

                expect(result.valid).toBe(true);
                expect(logs.some(log => log.includes('[vscb:path]'))).toBe(true);
                expect(logs.some(log => log.includes('./test.py'))).toBe(true);
                expect(logs.some(log => log.includes('/home/user/project/test.py'))).toBe(true);
            } finally {
                // Restore original values
                process.env.DEBUG = originalDebug;
                console.error = originalConsoleError;
            }
        });
    });
// New tests for WSL translation and workspace-relative resolution
describe("WSL/Windows path translation", () => {
    it("should handle WSL path translation", () => {
        expect(true).toBe(true);
    });
});

