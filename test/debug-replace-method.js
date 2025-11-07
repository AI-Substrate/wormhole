#!/usr/bin/env node
/**
 * Debug script to test code.replace-method command execution
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_WORKSPACE = path.join(PROJECT_ROOT, 'test');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'index.js');

const PYTHON_TEST_FILE = path.join(PROJECT_ROOT, 'test/integration-simple/python/test_debug.py');

const replacement = `def add(a: int, b: int) -> int:
    """Add two numbers"""
    result = a + b
    return result`;

async function testReplaceMethod() {
    console.log('Testing code.replace-method...');
    console.log('Python test file:', PYTHON_TEST_FILE);
    console.log('Replacement:\n', replacement);

    const env = {
        ...process.env,
        NODE_ENV: 'production',
        OCLIF_TS_NODE: '0',
        TS_NODE_PROJECT: '',
    };

    const command = `script run code.replace-method --param path="${PYTHON_TEST_FILE}" --param symbol="add" --param replacement="${replacement.replace(/"/g, '\\"')}"`;

    console.log('\nCommand:', `node ${CLI_PATH} ${command}`);
    console.log('\nCWD:', TEST_WORKSPACE);

    try {
        const { stdout, stderr } = await execAsync(
            `node ${CLI_PATH} ${command}`,
            {
                cwd: TEST_WORKSPACE,
                timeout: 30000,
                env,
                maxBuffer: 10 * 1024 * 1024
            }
        );

        console.log('\n=== STDERR ===');
        console.log(stderr);

        console.log('\n=== STDOUT ===');
        console.log(stdout);

        try {
            const result = JSON.parse(stdout);
            console.log('\n=== PARSED RESULT ===');
            console.log(JSON.stringify(result, null, 2));
            console.log('\nResult ok:', result.ok);
        } catch (e) {
            console.error('\n=== JSON PARSE ERROR ===');
            console.error(e.message);
            console.error('First 500 chars:', stdout.substring(0, 500));
        }
    } catch (error) {
        console.error('\n=== EXEC ERROR ===');
        console.error('Error message:', error.message);
        if (error.stdout) console.error('Stdout:', error.stdout);
        if (error.stderr) console.error('Stderr:', error.stderr);
    }
}

testReplaceMethod();
