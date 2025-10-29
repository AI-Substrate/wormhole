/**
 * CONTRACT TEST - Critical Regression Prevention
 *
 * DO NOT DELETE OR MODIFY THIS TEST!
 *
 * This test prevents regression of the core bug where breakpoints
 * didn't work because we were using 'program' instead of 'module'
 * in Python debug configurations.
 */

import * as assert from 'assert';
import { suite, test } from 'mocha';
import { buildDebugConfig } from '../../../core/python/detect';

suite('Python Debug Configuration Contract', () => {

    test('🔒 CRITICAL: Debug config MUST use module NOT program for pytest', () => {
        const config = buildDebugConfig('pytest', '/workspace', 'tests/test_foo.py');

        // THE CRITICAL ASSERTION - This is why breakpoints work
        assert.strictEqual(config.module, 'pytest', 'Must use module: "pytest"');
        assert.strictEqual(config.program, undefined, 'Must NOT have program property');
        assert.strictEqual(config.type, 'debugpy');
        assert.ok(Array.isArray(config.args));
        assert.ok(config.args.includes('tests/test_foo.py'));
    });

    test('🔒 CRITICAL: Debug config MUST use module NOT program for unittest', () => {
        const config = buildDebugConfig('unittest', '/workspace', 'test_sample.py');

        // THE CRITICAL ASSERTION - This is why breakpoints work
        assert.strictEqual(config.module, 'unittest', 'Must use module: "unittest"');
        assert.strictEqual(config.program, undefined, 'Must NOT have program property');
        assert.strictEqual(config.type, 'debugpy');
        assert.ok(config.args.includes('discover'));
    });

    test('🔒 Even "none" framework must use module approach', () => {
        const config = buildDebugConfig('none', '/workspace');

        // Even fallback uses module to maintain consistency
        assert.strictEqual(config.module, 'pytest', 'Fallback to pytest module');
        assert.strictEqual(config.program, undefined, 'Must NOT have program property');
    });
});

/**
 * WHY THIS TEST EXISTS:
 *
 * The original bug was that we were generating debug configs like:
 *   { type: 'debugpy', program: '/path/to/test.py' }
 *
 * This bypassed the test framework, so breakpoints wouldn't hit.
 *
 * The fix is to use:
 *   { type: 'debugpy', module: 'pytest', args: ['/path/to/test.py'] }
 *
 * This test ensures we never regress back to using 'program'.
 */