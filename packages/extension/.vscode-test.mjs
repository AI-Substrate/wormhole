/**
 * VS CODE TEST CONFIGURATION
 *
 * CRITICAL: Use fresh user-data-dir to prevent window restore!
 * Each VS Code window spawns its own Extension Host process.
 */

import { defineConfig } from '@vscode/test-cli';
import * as os from 'os';
import * as path from 'path';

// Create fresh directories for each test run to prevent session restore
const tmpDir = os.tmpdir();
const timestamp = Date.now();
const userDataDir = path.join(tmpDir, `vsc-test-ud-${timestamp}`);
const extensionsDir = path.join(tmpDir, `vsc-test-ext-${timestamp}`);

export default defineConfig({
    label: 'integration',
    // Use single index file to ensure all tests run in one Extension Host
    files: 'out/test/integration/index.js',
    version: 'stable',
    workspaceFolder: './src/test/fixtures/test-all-fixtures.code-workspace',
    // Install vscode-jest for JavaScript test debugging support
    extensionDependencies: [
        'Orta.vscode-jest@5.3.1'  // Pin version for consistency
    ],
    mocha: {
        ui: 'tdd',
        timeout: 30000,
        color: true,
        // Explicitly disable parallel to ensure serial execution
        parallel: false,
        // Load bootstrap for shared test utilities
        require: './out/test/bootstrap.js'
    },
    launchArgs: [
        // CRITICAL: Fresh user-data-dir prevents window restore
        '--user-data-dir', userDataDir,
        '--extensions-dir', extensionsDir,
        // Force single window behavior
        '--reuse-window',
        // Standard test configuration
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-telemetry',
        '--disable-crash-reporter',
        // Enable proposed APIs for testing
        '--enable-proposed-api', 'mcaps-microsoft.vsc-bridge-extension',
        // Enhanced logging
        '--log', 'trace'
    ]
});