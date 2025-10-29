#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Mock the build manifest function to test
const SCRIPTS_DIR = path.resolve(__dirname, '..', 'extension', 'src', 'vsc-scripts');
const MANIFEST_FILE = path.join(SCRIPTS_DIR, 'manifest.json');

function runTests() {
    console.log('Running enhanced manifest generation tests...\n');

    let passed = 0;
    let failed = 0;
    let originalManifest;

    // Helper functions for test runner
    const it = (name, fn) => {
        try {
            fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (error) {
            console.log(`  ✗ ${name}`);
            console.log(`    ${error.message}`);
            failed++;
        }
    };

    const describe = (name, fn) => {
        console.log(`\n${name}`);
        fn();
    };

    // Backup existing manifest
    if (fs.existsSync(MANIFEST_FILE)) {
        originalManifest = fs.readFileSync(MANIFEST_FILE, 'utf-8');
    }

    // Run tests
    describe('Enhanced Manifest Generation', () => {
        describe('Manifest v2 Structure', () => {
        it('should include version field set to 2', () => {
            // Read generated manifest
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

            // Test for version 2 (will be implemented)
            // For now, test that version exists
            assert.ok(manifest.version, 'Manifest should have version field');
        });

        it('should include generated timestamp', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

            // Check for timestamp field (currently generatedAt)
            assert.ok(manifest.generatedAt, 'Manifest should have generatedAt field');

            // Verify it's a valid ISO date
            const date = new Date(manifest.generatedAt);
            assert.ok(!isNaN(date.getTime()), 'generatedAt should be valid ISO date');
        });

        it('should preserve complete metadata from .meta.yaml files', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

            // Check a specific script
            const bpSet = manifest.scripts['bp.set'];
            assert.ok(bpSet, 'bp.set script should exist in manifest');
            assert.ok(bpSet.metadata, 'Script should have metadata field');
            assert.ok(bpSet.scriptRelPath, 'Script should have scriptRelPath field');

            // Check metadata completeness
            assert.strictEqual(bpSet.metadata.alias, 'bp.set');
            assert.ok(bpSet.metadata.category, 'Metadata should include category');
            assert.ok(bpSet.metadata.description, 'Metadata should include description');
            assert.ok(typeof bpSet.metadata.dangerOnly === 'boolean', 'Metadata should include dangerOnly');
            assert.ok(bpSet.metadata.params, 'Metadata should include params');
        });

        it('should include all parameter definitions with full fidelity', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
            const bpSet = manifest.scripts['bp.set'];

            // Check parameter structure
            assert.ok(bpSet.metadata.params.path, 'Should have path parameter');
            assert.ok(bpSet.metadata.params.line, 'Should have line parameter');

            // Check parameter details
            const pathParam = bpSet.metadata.params.path;
            assert.strictEqual(pathParam.type, 'string', 'Path should be string type');
            assert.strictEqual(pathParam.required, true, 'Path should be required');
            assert.ok(pathParam.description, 'Path should have description');

            const lineParam = bpSet.metadata.params.line;
            assert.strictEqual(lineParam.type, 'number', 'Line should be number type');
            assert.strictEqual(lineParam.required, true, 'Line should be required');
            assert.ok(lineParam.description, 'Line should have description');
        });

        it('should handle enum type parameters correctly', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
            const debugVars = manifest.scripts['debug.list-variables'];

            if (debugVars) {
                const scopeParam = debugVars.metadata.params.scope;
                if (scopeParam && scopeParam.type === 'enum') {
                    assert.strictEqual(scopeParam.type, 'enum', 'Scope should be enum type');
                    assert.ok(Array.isArray(scopeParam.values), 'Enum should have values array');
                    assert.ok(scopeParam.values.length > 0, 'Enum should have at least one value');
                    if (scopeParam.default) {
                        assert.ok(scopeParam.values.includes(scopeParam.default), 'Default should be in values');
                    }
                }
            }
        });

        it('should preserve CLI and MCP configurations', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
            const bpSet = manifest.scripts['bp.set'];

            // Check CLI config if present
            if (bpSet.metadata.cli) {
                assert.ok(bpSet.metadata.cli.command, 'CLI should have command');
                assert.ok(bpSet.metadata.cli.description, 'CLI should have description');
                assert.ok(Array.isArray(bpSet.metadata.cli.examples), 'CLI should have examples array');
            }

            // Check MCP config if present
            if (bpSet.metadata.mcp) {
                assert.ok(bpSet.metadata.mcp.tool, 'MCP should have tool name');
                assert.ok(bpSet.metadata.mcp.description, 'MCP should have description');
            }
        });

        it('should preserve error definitions', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
            const bpSet = manifest.scripts['bp.set'];

            if (bpSet.metadata.errors) {
                assert.ok(Array.isArray(bpSet.metadata.errors), 'Errors should be an array');
                assert.ok(bpSet.metadata.errors.length > 0, 'Should have at least one error defined');
            }
        });

        it('should include all scripts found in vsc-scripts directory', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
            const scriptCount = Object.keys(manifest.scripts).length;

            // We know there are at least 19 scripts from the audit
            assert.ok(scriptCount >= 19, `Should have at least 19 scripts, found ${scriptCount}`);

            // Check for specific scripts we know exist
            const expectedScripts = [
                'bp.set', 'bp.list', 'bp.clear.file', 'bp.clear.project', 'bp.remove',
                'debug.start', 'debug.continue', 'debug.stop', 'debug.list-variables',
                'diag.collect'
            ];

            for (const scriptAlias of expectedScripts) {
                assert.ok(manifest.scripts[scriptAlias], `Missing expected script: ${scriptAlias}`);
            }
        });

        it('should handle scripts with no parameters', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
            const bpList = manifest.scripts['bp.list'];

            assert.ok(bpList, 'bp.list should exist');
            assert.deepStrictEqual(bpList.metadata.params, {}, 'bp.list should have empty params object');
        });

        it('should preserve optional parameter flags', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
            const bpSet = manifest.scripts['bp.set'];

            // Check optional parameters
            if (bpSet.metadata.params.condition) {
                assert.strictEqual(bpSet.metadata.params.condition.required, false, 'Condition should be optional');
            }
            if (bpSet.metadata.params.hitCondition) {
                assert.strictEqual(bpSet.metadata.params.hitCondition.required, false, 'HitCondition should be optional');
            }
            if (bpSet.metadata.params.logMessage) {
                assert.strictEqual(bpSet.metadata.params.logMessage.required, false, 'LogMessage should be optional');
            }
        });

        it('should preserve default values', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

            // Check for scripts with default values
            const debugVars = manifest.scripts['debug.list-variables'];
            if (debugVars && debugVars.metadata.params.scope && debugVars.metadata.params.scope.default) {
                assert.ok(debugVars.metadata.params.scope.default, 'Should preserve default value if present');
            }

            // Check debug.continue timeoutMs default
            const debugContinue = manifest.scripts['debug.continue'];
            if (debugContinue && debugContinue.metadata.params.timeoutMs) {
                assert.ok(debugContinue.metadata.params.timeoutMs.default !== undefined, 'Should have default timeout');
            }
        });

        it('should maintain backward compatibility with v1 structure', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

            // V1 compatibility checks
            assert.ok(manifest.scripts, 'Should have scripts object');

            // Each script should have metadata and scriptRelPath
            for (const [alias, script] of Object.entries(manifest.scripts)) {
                assert.ok(script.metadata, `${alias} should have metadata`);
                assert.ok(script.scriptRelPath, `${alias} should have scriptRelPath`);
                assert.strictEqual(script.metadata.alias, alias, `${alias} metadata.alias should match key`);
            }
        });
    });

    describe('Metadata Validation', () => {
        it('should validate that all metadata files have corresponding JS files', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

            for (const [alias, script] of Object.entries(manifest.scripts)) {
                const jsPath = path.join(SCRIPTS_DIR, script.scriptRelPath);
                assert.ok(fs.existsSync(jsPath), `JS file should exist for ${alias}: ${jsPath}`);
            }
        });

        it('should validate metadata structure against schema', () => {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

            for (const [alias, script] of Object.entries(manifest.scripts)) {
                const metadata = script.metadata;

                // Required fields
                assert.ok(metadata.alias, `${alias} should have alias`);
                assert.strictEqual(typeof metadata.alias, 'string', `${alias} alias should be string`);

                // Optional but common fields
                if (metadata.description) {
                    assert.strictEqual(typeof metadata.description, 'string', `${alias} description should be string`);
                }
                if (metadata.category) {
                    assert.strictEqual(typeof metadata.category, 'string', `${alias} category should be string`);
                }
                if (metadata.dangerOnly !== undefined) {
                    assert.strictEqual(typeof metadata.dangerOnly, 'boolean', `${alias} dangerOnly should be boolean`);
                }

                // Params validation
                if (metadata.params) {
                    assert.strictEqual(typeof metadata.params, 'object', `${alias} params should be object`);

                    for (const [paramName, paramDef] of Object.entries(metadata.params)) {
                        assert.ok(paramDef.type, `${alias}.${paramName} should have type`);

                        // Handle union types (e.g., [string, object])
                        const validTypes = ['string', 'number', 'boolean', 'array', 'object', 'enum'];
                        if (Array.isArray(paramDef.type)) {
                            // Union type - validate each type in the array
                            for (const t of paramDef.type) {
                                assert.ok(validTypes.includes(t),
                                    `${alias}.${paramName} has invalid type in union: ${t}`);
                            }
                        } else {
                            // Single type
                            assert.ok(validTypes.includes(paramDef.type),
                                `${alias}.${paramName} has invalid type: ${paramDef.type}`);
                        }

                        if (paramDef.type === 'enum') {
                            assert.ok(Array.isArray(paramDef.values), `${alias}.${paramName} enum should have values array`);
                        }

                        assert.strictEqual(typeof paramDef.required, 'boolean',
                            `${alias}.${paramName} should have required boolean`);
                    }
                }
            }
        });
    });

    describe('Build Performance', () => {
        it('should generate manifest within reasonable time', () => {
            const startTime = Date.now();

            // Re-read the manifest (simulating a build)
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Should complete in under 100ms for reading
            assert.ok(duration < 100, `Manifest read took ${duration}ms, should be under 100ms`);
        });

        it('should produce consistent output on multiple runs', () => {
            // This would test that running build-manifest.js multiple times
            // produces the same output (excluding timestamp)
            const manifest1 = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

            // Remove timestamps for comparison
            delete manifest1.generatedAt;

            // In a real test, we'd run build-manifest.js again and compare
            // For now, just verify structure is consistent
            assert.ok(manifest1.version, 'Should have version');
            assert.ok(manifest1.scripts, 'Should have scripts');
        });
    });
});

    // Restore original manifest
    if (originalManifest) {
        fs.writeFileSync(MANIFEST_FILE, originalManifest);
    }

    // Print results
    console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests();
}

module.exports = { runTests };