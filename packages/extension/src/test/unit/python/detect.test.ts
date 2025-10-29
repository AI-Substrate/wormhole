import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test, setup, teardown } from 'mocha';
import {
    detectFrameworkOnDisk,
    buildDebugConfig,
    getConfidence,
    findMarkers
} from '../../../core/python/detect';

suite('Python Detection (Pure Logic)', () => {
    let tmpDir: string;

    setup(() => {
        // Create a temp directory for each test
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsc-bridge-test-'));
    });

    teardown(() => {
        // Clean up temp directory
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    test('detects pytest from pytest.ini', async () => {
        // Create a pytest.ini file
        fs.writeFileSync(path.join(tmpDir, 'pytest.ini'), '[pytest]\naddopts = -q');

        const framework = await detectFrameworkOnDisk(tmpDir);
        assert.strictEqual(framework, 'pytest');

        const markers = await findMarkers(tmpDir);
        assert.ok(markers.includes('pytest.ini'));

        const confidence = getConfidence(framework, markers);
        assert.strictEqual(confidence, 0.9); // Strong signal
    });

    test('detects pytest from conftest.py', async () => {
        fs.writeFileSync(path.join(tmpDir, 'conftest.py'), 'import pytest\n');

        const framework = await detectFrameworkOnDisk(tmpDir);
        assert.strictEqual(framework, 'pytest');
    });

    test('detects pytest from setup.cfg', async () => {
        fs.writeFileSync(
            path.join(tmpDir, 'setup.cfg'),
            '[tool:pytest]\naddopts = -v\n'
        );

        const framework = await detectFrameworkOnDisk(tmpDir);
        assert.strictEqual(framework, 'pytest');

        const confidence = getConfidence(framework, ['setup.cfg']);
        assert.strictEqual(confidence, 0.6); // Medium signal
    });

    test('detects unittest from tests directory', async () => {
        // Create a tests directory with test files
        const testsDir = path.join(tmpDir, 'tests');
        fs.mkdirSync(testsDir);
        fs.writeFileSync(
            path.join(testsDir, 'test_sample.py'),
            'import unittest\nclass Test(unittest.TestCase): pass'
        );

        const framework = await detectFrameworkOnDisk(tmpDir);
        assert.strictEqual(framework, 'unittest');
    });

    test('returns none for non-test projects', async () => {
        // Just a regular Python file
        fs.writeFileSync(path.join(tmpDir, 'main.py'), 'print("hello")');

        const framework = await detectFrameworkOnDisk(tmpDir);
        assert.strictEqual(framework, 'none');

        const confidence = getConfidence(framework, []);
        assert.strictEqual(confidence, 0);
    });

    test('builds correct pytest debug config', () => {
        const config = buildDebugConfig('pytest', '/workspace', 'tests/test_foo.py');

        assert.strictEqual(config.type, 'debugpy');
        assert.strictEqual(config.module, 'pytest'); // Critical: module, not program!
        assert.ok(!config.program); // Should NOT have program
        assert.deepStrictEqual(config.args, ['-q', 'tests/test_foo.py', '--no-cov']);
        assert.strictEqual(config.justMyCode, false);
        assert.strictEqual(config.cwd, '/workspace');
    });

    test('builds correct unittest debug config', () => {
        const config = buildDebugConfig('unittest', '/workspace', 'test_sample.py');

        assert.strictEqual(config.type, 'debugpy');
        assert.strictEqual(config.module, 'unittest'); // Critical: module, not program!
        assert.ok(!config.program); // Should NOT have program
        assert.deepStrictEqual(config.args, ['discover', '-s', '.', '-p', 'test_sample.py']);
        assert.strictEqual(config.justMyCode, false);
    });

    test('fallback config uses pytest', () => {
        const config = buildDebugConfig('none', '/workspace');

        assert.strictEqual(config.module, 'pytest'); // Default to pytest
        assert.deepStrictEqual(config.args, ['-q', '--no-cov']);
    });

    test('finds multiple markers', async () => {
        // Create multiple marker files
        fs.writeFileSync(path.join(tmpDir, 'pytest.ini'), '[pytest]');
        fs.writeFileSync(path.join(tmpDir, 'setup.cfg'), '[tool:pytest]');
        fs.mkdirSync(path.join(tmpDir, 'tests'));

        const markers = await findMarkers(tmpDir);
        assert.ok(markers.includes('pytest.ini'));
        assert.ok(markers.includes('setup.cfg'));
        assert.ok(markers.includes('tests'));
        assert.ok(markers.length >= 3);
    });

    test('handles missing or unreadable directories gracefully', async () => {
        const nonExistent = path.join(tmpDir, 'does-not-exist');

        const framework = await detectFrameworkOnDisk(nonExistent);
        assert.strictEqual(framework, 'none');

        const markers = await findMarkers(nonExistent);
        assert.strictEqual(markers.length, 0);
    });
});