/**
 * Single entry point for all integration tests.
 * This ensures all tests run in a single Extension Host process.
 *
 * The @vscode/test-cli will import this file directly,
 * so we need to load all tests synchronously when this module is imported.
 */

import 'mocha';

console.log('[TEST-INDEX] Starting to load all integration tests in single Extension Host');
console.log(`[TEST-INDEX] Process PID: ${process.pid}`);

// Import all test files directly
// We must use require() instead of dynamic import() for synchronous loading
import './bridgeContext.test';
import './cleanup.test';
import './cursorMapping.test';
import './discovery.test';
import './factory.test';
import './lifecycle.test';
import './registry.test';
import './scriptLoadingESM.test';
import './smoke.test';
import './validation.tiered.test';
import './scripts/debug-wait.test';
// bridge-context-types.test - Skipped: requires additional VS Code API proposals (telemetry)
// These tests validate TypeScript type definitions but are not critical for runtime functionality
// import './bridge-context-types.test';

// Test environment tests (require VS Code APIs)
import './test-environments/JavaScriptTestDetector.test';
import './test-environments/PythonTestDetector.test';
import './test-environments/TestEnvironmentService.test';

console.log('[TEST-INDEX] All test files loaded successfully in single Extension Host');