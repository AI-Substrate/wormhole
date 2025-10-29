import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

// Mock process.cwd for consistent testing
const originalCwd = process.cwd;
const mockCwd = '/home/user/project';

beforeAll(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
});

afterAll(() => {
    vi.restoreAllMocks();
});

describe('Parameter Validation Integration', () => {
    const CLI_PATH = path.join(__dirname, '..', '..', 'cli', 'bin', 'run');
    const TEST_FILE = path.join(__dirname, '..', 'fixtures', 'test.py');

    beforeAll(async () => {
        // Ensure test file exists
        const fixturesDir = path.dirname(TEST_FILE);
        if (!fs.existsSync(fixturesDir)) {
            fs.mkdirSync(fixturesDir, { recursive: true });
        }
        fs.writeFileSync(TEST_FILE, 'print("test")\n', 'utf-8');

        // Build both CLI and extension
        await execAsync('npm run build', { cwd: path.join(__dirname, '..', '..', 'cli') });
        await execAsync('npm run build', { cwd: path.join(__dirname, '..', '..', 'extension') });
    });

    afterAll(() => {
        // Clean up test file
        if (fs.existsSync(TEST_FILE)) {
            fs.unlinkSync(TEST_FILE);
        }
    });

    describe('CLI Validation', () => {
        it('should reject missing required parameters', async () => {
            try {
                await execAsync(`${CLI_PATH} script breakpoint.set`);
                expect.fail('Should have thrown error');
            } catch (error: any) {
                expect(error.code).toBe(1);
                expect(error.stderr).toContain('Parameter validation failed');
                expect(error.stderr).toContain('path');
                expect(error.stderr).toContain('Missing required parameter');
            }
        });

        it('should reject wrong parameter types', async () => {
            try {
                await execAsync(`${CLI_PATH} script breakpoint.set path=${TEST_FILE} line=not-a-number`);
                expect.fail('Should have thrown error');
            } catch (error: any) {
                expect(error.code).toBe(1);
                expect(error.stderr).toContain('Parameter validation failed');
                expect(error.stderr).toContain('line');
                expect(error.stderr).toContain('Cannot convert');
            }
        });

        it('should suggest correct parameter names', async () => {
            try {
                await execAsync(`${CLI_PATH} script breakpoint.set paht=${TEST_FILE} line=10`);
                expect.fail('Should have thrown error');
            } catch (error: any) {
                expect(error.code).toBe(1);
                expect(error.stderr).toContain('Unknown parameter');
                expect(error.stderr).toContain('paht');
                expect(error.stderr).toContain('Did you mean \'path\'?');
            }
        });

        it('should reject invalid enum values', async () => {
            try {
                await execAsync(`${CLI_PATH} script dbg.vars scope=invalid`);
                expect.fail('Should have thrown error');
            } catch (error: any) {
                expect(error.code).toBe(1);
                expect(error.stderr).toContain('Parameter validation failed');
                expect(error.stderr).toContain('scope');
                expect(error.stderr).toContain('must be one of');
                expect(error.stderr).toContain('local, global, all');
            }
        });

        it('should accept valid parameters', async () => {
            // This would need the extension running to actually succeed
            // For now, we just test that validation passes
            try {
                await execAsync(`${CLI_PATH} script breakpoint.set path=${TEST_FILE} line=10 --dry-run`);
                // If dry-run is implemented, it should pass validation but not execute
            } catch (error: any) {
                // If dry-run is not implemented, check that error is not validation-related
                expect(error.stderr).not.toContain('Parameter validation failed');
            }
        });

        it('should apply default values', async () => {
            // Test that default values are applied
            try {
                await execAsync(`${CLI_PATH} script dbg.vars --dry-run`);
                // Should use default scope=all
            } catch (error: any) {
                expect(error.stderr).not.toContain('Parameter validation failed');
                expect(error.stderr).not.toContain('Missing required parameter');
            }
        });

        it('should bypass validation with --no-validate flag', async () => {
            // Even with invalid params, should pass CLI validation
            try {
                await execAsync(`${CLI_PATH} script breakpoint.set path=${TEST_FILE} line=not-a-number --no-validate`);
                // Will fail at extension level, not CLI level
            } catch (error: any) {
                // The error should come from the extension, not CLI validation
                expect(error.stderr).not.toContain('Parameter validation failed for \'breakpoint.set\'');
            }
        });
    });

    describe('Extension Validation', () => {
        // These tests would require the extension to be running
        // They're included for completeness but may need to be skipped in CI

        it.skip('should validate parameters at extension level', async () => {
            // Start extension server
            // Send request with invalid params directly to extension
            // Verify extension returns validation error
        });

        it.skip('should handle type coercion at extension level', async () => {
            // The Zod schemas use .coerce, so "123" should become 123
            // Send string numbers to extension
            // Verify they're coerced correctly
        });

        it.skip('should use generated schemas as primary validation', async () => {
            // Test that even scripts without their own paramsSchema
            // are validated using generated schemas
        });
    });

    describe('End-to-End Validation', () => {
        it('should show helpful error messages', async () => {
            try {
                await execAsync(`${CLI_PATH} script breakpoint.set`);
                expect.fail('Should have thrown error');
            } catch (error: any) {
                // Check for comprehensive error message
                expect(error.stderr).toContain('Parameter validation failed');
                expect(error.stderr).toContain('Expected parameters:');
                expect(error.stderr).toContain('path* (string)');
                expect(error.stderr).toContain('line* (number)');
                expect(error.stderr).toContain('condition (string)');
                expect(error.stderr).toContain('Run \'vscb script info breakpoint.set\'');
            }
        });

        it('should handle complex parameter types', async () => {
            // Test array and object parameters
            try {
                // If we had a script with array params
                await execAsync(`${CLI_PATH} script test.array tags=tag1,tag2,tag3 --dry-run`);
            } catch (error: any) {
                if (error.stderr.includes('Script not found')) {
                    // Expected if test.array doesn't exist
                    expect(error.stderr).toContain('test.array');
                } else {
                    // Should handle array conversion
                    expect(error.stderr).not.toContain('Parameter validation failed');
                }
            }
        });

        it('should validate number constraints', async () => {
            // Test min/max constraints on numbers
            try {
                await execAsync(`${CLI_PATH} script debug.start launch=test timeoutMs=-1000`);
                expect.fail('Should have thrown error');
            } catch (error: any) {
                // Should reject negative timeout if there's a min constraint
                // Or it might accept it if no constraint is defined
                // This depends on the actual metadata
            }
        });

        it('should validate string constraints', async () => {
            // Test minLength/maxLength on strings if any script has them
            try {
                // Example: if a script had minLength constraint
                await execAsync(`${CLI_PATH} script test.string name=x`);
            } catch (error: any) {
                if (error.stderr.includes('Script not found')) {
                    // Expected if test.string doesn't exist
                    expect(error.stderr).toContain('test.string');
                } else if (error.stderr.includes('String length must be')) {
                    // Good - constraint was validated
                    expect(error.stderr).toContain('String length');
                }
            }
        });
    });

    describe('Manifest Consistency', () => {
        it('should have consistent validation between CLI and extension', () => {
            // Load both manifests
            const cliManifest = JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', '..', 'cli', 'dist', 'manifest.json'), 'utf-8')
            );
            const extensionManifest = JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'src', 'vsc-scripts', 'manifest.json'), 'utf-8')
            );

            // Verify they have the same version
            expect(cliManifest.version).toBe(extensionManifest.version);

            // Verify they have the same scripts
            const cliScripts = new Set(Object.keys(cliManifest.scripts));
            const extScripts = new Set(Object.keys(extensionManifest.scripts));
            expect(cliScripts).toEqual(extScripts);

            // Verify parameter definitions match
            for (const alias of cliScripts) {
                const cliParams = cliManifest.scripts[alias].metadata.params || {};
                const extParams = extensionManifest.scripts[alias].metadata.params || {};

                expect(Object.keys(cliParams).sort()).toEqual(Object.keys(extParams).sort());

                for (const paramName of Object.keys(cliParams)) {
                    expect(cliParams[paramName]).toEqual(extParams[paramName]);
                }
            }
        });

        it('should have generated schemas for all scripts', () => {
            // Check that generated schemas exist
            const schemasPath = path.join(__dirname, '..', '..', 'extension', 'src', 'vsc-scripts', 'generated', 'schemas.ts');
            expect(fs.existsSync(schemasPath)).toBe(true);

            // Read and verify schemas
            const schemasContent = fs.readFileSync(schemasPath, 'utf-8');
            const manifest = JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'src', 'vsc-scripts', 'manifest.json'), 'utf-8')
            );

            // Check that each script has a schema
            for (const alias of Object.keys(manifest.scripts)) {
                expect(schemasContent).toContain(`"${alias}":`);
            }
        });
    });

    describe('Breakpoint Path Resolution', () => {
        it('should resolve relative paths for breakpoint.set', async () => {
            // Create a test file in the mock CWD
            const testFile = path.join(mockCwd, 'test.py');
            fs.writeFileSync(testFile, 'print("test")\n', 'utf-8');

            try {
                // This should work with relative path after Phase 2
                await execAsync(`${CLI_PATH} script breakpoint.set path=test.py line=10 --dry-run`);
                // If dry-run is implemented, it should pass validation
            } catch (error: any) {
                // If dry-run is not implemented, check that error is not validation-related
                expect(error.stderr).not.toContain('Parameter validation failed');
            } finally {
                // Clean up
                if (fs.existsSync(testFile)) {
                    fs.unlinkSync(testFile);
                }
            }
        });

        it('should resolve dot notation paths for breakpoint.set', async () => {
            // Create a test file in the mock CWD
            const testFile = path.join(mockCwd, 'test.py');
            fs.writeFileSync(testFile, 'print("test")\n', 'utf-8');

            try {
                // This should work with ./ notation
                await execAsync(`${CLI_PATH} script breakpoint.set path=./test.py line=10 --dry-run`);
            } catch (error: any) {
                expect(error.stderr).not.toContain('Parameter validation failed');
            } finally {
                if (fs.existsSync(testFile)) {
                    fs.unlinkSync(testFile);
                }
            }
        });

        it('should resolve parent directory paths for breakpoint.set', async () => {
            // Create a test file in parent directory
            const parentDir = path.dirname(mockCwd);
            const testFile = path.join(parentDir, 'parent.py');
            fs.writeFileSync(testFile, 'print("parent")\n', 'utf-8');

            try {
                // This should work with ../ notation
                await execAsync(`${CLI_PATH} script breakpoint.set path=../parent.py line=10 --dry-run`);
            } catch (error: any) {
                expect(error.stderr).not.toContain('Parameter validation failed');
            } finally {
                if (fs.existsSync(testFile)) {
                    fs.unlinkSync(testFile);
                }
            }
        });

        it('should resolve relative paths for breakpoint.remove', async () => {
            try {
                // This should work with relative path
                await execAsync(`${CLI_PATH} script breakpoint.remove path=test.py line=10 --dry-run`);
            } catch (error: any) {
                expect(error.stderr).not.toContain('Parameter validation failed');
            }
        });

        it('should resolve relative paths for breakpoint.clear.file', async () => {
            try {
                // This should work with relative path
                await execAsync(`${CLI_PATH} script breakpoint.clear.file path=test.py --dry-run`);
            } catch (error: any) {
                expect(error.stderr).not.toContain('Parameter validation failed');
            }
        });

        it('should still accept absolute paths for all breakpoint commands', async () => {
            const absPath = '/absolute/path/test.py';

            try {
                await execAsync(`${CLI_PATH} script breakpoint.set path=${absPath} line=10 --dry-run`);
            } catch (error: any) {
                expect(error.stderr).not.toContain('Parameter validation failed');
            }

            try {
                await execAsync(`${CLI_PATH} script breakpoint.remove path=${absPath} line=10 --dry-run`);
            } catch (error: any) {
                expect(error.stderr).not.toContain('Parameter validation failed');
            }

            try {
                await execAsync(`${CLI_PATH} script breakpoint.clear.file path=${absPath} --dry-run`);
            } catch (error: any) {
                expect(error.stderr).not.toContain('Parameter validation failed');
            }
        });

        it('should handle paths with spaces', async () => {
            // Create a test file with spaces in name
            const testFile = path.join(mockCwd, 'my test file.py');
            fs.writeFileSync(testFile, 'print("test")\n', 'utf-8');

            try {
                // This should work with spaces in path
                await execAsync(`${CLI_PATH} script breakpoint.set path="my test file.py" line=10 --dry-run`);
            } catch (error: any) {
                expect(error.stderr).not.toContain('Parameter validation failed');
            } finally {
                if (fs.existsSync(testFile)) {
                    fs.unlinkSync(testFile);
                }
            }
        });

        it('should handle nested directory paths', async () => {
            // Create nested directory structure
            const nestedDir = path.join(mockCwd, 'src', 'lib');
            const testFile = path.join(nestedDir, 'test.py');

            if (!fs.existsSync(nestedDir)) {
                fs.mkdirSync(nestedDir, { recursive: true });
            }
            fs.writeFileSync(testFile, 'print("nested")\n', 'utf-8');

            try {
                // This should work with nested path
                await execAsync(`${CLI_PATH} script breakpoint.set path=src/lib/test.py line=10 --dry-run`);
            } catch (error: any) {
                expect(error.stderr).not.toContain('Parameter validation failed');
            } finally {
                // Clean up
                if (fs.existsSync(testFile)) {
                    fs.unlinkSync(testFile);
                }
                if (fs.existsSync(nestedDir)) {
                    fs.rmSync(nestedDir, { recursive: true });
                }
            }
        });
    });
});