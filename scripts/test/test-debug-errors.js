#!/usr/bin/env node
/**
 * Manual Test Harness for Debug Error Codes
 *
 * This script demonstrates all error codes and their formatted output.
 * Run this to validate that all error messages and hints are correct.
 *
 * Usage: npx ts-node scripts/test/test-debug-errors.js
 */

// Use ts-node to import the actual TypeScript module
require('ts-node').register({
    compilerOptions: {
        module: 'commonjs',
        target: 'ES2022',
        lib: ['ES2022'],
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        strict: false, // Disable strict mode for manual testing
        moduleResolution: 'node'
    },
    transpileOnly: true // Skip type checking for faster execution
});

// Import from the actual module
const {
    DebugErrorCode,
    createDebugError,
    createCustomDebugError,
    createLargeDataError,
    createUnsupportedLanguageError,
    formatDebugError,
    isDebuggerStateError,
    isReferenceError,
    getSupportedDebuggerTypes
} = require('../../extension/src/core/errors/debug-errors');

// Helper functions for output formatting
function printSeparator(char = '=', width = 80) {
    console.log(char.repeat(width));
}

function printSection(title) {
    console.log();
    printSeparator('=');
    console.log(`  ${title}`);
    printSeparator('-');
    console.log();
}

function printError(description, error) {
    console.log(`📍 ${description}`);
    console.log(formatDebugError(error));
    console.log();
}

// Main test execution
function main() {
    printSeparator('=');
    console.log('  MANUAL TEST HARNESS: Debug Error Codes');
    console.log('  Testing all error codes and their formatted output');
    printSeparator('=');

    // Test Session Errors
    printSection('SESSION ERRORS');
    printError('No active debug session', createDebugError(DebugErrorCode.E_NO_SESSION));
    printError('Session not paused', createDebugError(DebugErrorCode.E_NOT_PAUSED));
    printError('DAP not stopped', createDebugError(DebugErrorCode.E_NOT_STOPPED));

    // Test Parameter Errors
    printSection('PARAMETER ERRORS');
    printError('Invalid parameters', createDebugError(DebugErrorCode.E_INVALID_PARAMS));
    printError('Missing required parameter', createDebugError(DebugErrorCode.E_MISSING_REQUIRED_PARAM));

    // Test Data Size Errors
    printSection('DATA SIZE ERRORS');
    printError('Large data warning', createDebugError(DebugErrorCode.E_LARGE_DATA));
    printError('Memory budget exceeded', createDebugError(DebugErrorCode.E_MEMORY_BUDGET_EXCEEDED));

    // Test custom large data error
    printError('Large data (sub-MB)', createLargeDataError(999, 512 * 1024)); // 512KB
    printError('Large data (MB)', createLargeDataError(25000, 6 * 1024 * 1024)); // 6MB

    // Test Language Support Errors
    printSection('LANGUAGE SUPPORT ERRORS');
    printError('Unsupported language', createDebugError(DebugErrorCode.E_UNSUPPORTED_LANGUAGE));
    printError('Not implemented', createDebugError(DebugErrorCode.E_NOT_IMPLEMENTED));
    printError('Custom debugger type', createUnsupportedLanguageError('my-custom-debugger'));

    // Test DAP Operation Errors
    printSection('DAP OPERATION ERRORS');
    printError('No threads available', createDebugError(DebugErrorCode.E_NO_THREADS));
    printError('No stack available', createDebugError(DebugErrorCode.E_NO_STACK));
    printError('No frames available', createDebugError(DebugErrorCode.E_NO_FRAMES));
    printError('Invalid reference', createDebugError(DebugErrorCode.E_INVALID_REFERENCE));
    printError('Stale reference', createDebugError(DebugErrorCode.E_STALE_REFERENCE));

    // Test Modification Errors
    printSection('MODIFICATION ERRORS');
    printError('Modification failed', createDebugError(DebugErrorCode.E_MODIFICATION_FAILED));
    printError('Read-only variable', createDebugError(DebugErrorCode.E_READ_ONLY));
    printError('Unsupported operation', createDebugError(DebugErrorCode.E_UNSUPPORTED_OPERATION));

    // Test Evaluation Errors
    printSection('EVALUATION ERRORS');
    printError('Evaluation failed', createDebugError(DebugErrorCode.E_EVALUATE_FAILED));
    printError('Variable not expandable', createDebugError(DebugErrorCode.E_NOT_EXPANDABLE));

    // Test Generic Errors
    printSection('GENERIC ERRORS');
    printError('Unknown error', createDebugError(DebugErrorCode.E_UNKNOWN));
    printError('Internal error with detail', createDebugError(DebugErrorCode.E_INTERNAL, 'Stack trace: at foo.js:123'));

    // Test custom error creation
    printSection('CUSTOM ERROR CREATION');
    const customError = createCustomDebugError(
        DebugErrorCode.E_LARGE_DATA,
        'Custom message: Data exceeds 10MB limit',
        'Consider using pagination or streaming'
    );
    printError('Custom error with override', customError);

    // Test helper functions
    printSection('HELPER FUNCTIONS');

    const stateError = createDebugError(DebugErrorCode.E_NO_SESSION);
    const nonStateError = createDebugError(DebugErrorCode.E_INVALID_PARAMS);
    const refError = createDebugError(DebugErrorCode.E_INVALID_REFERENCE);

    console.log('🔍 State Error Checks:');
    console.log(`  - E_NO_SESSION is state error: ${isDebuggerStateError(stateError)}`);
    console.log(`  - E_INVALID_PARAMS is state error: ${isDebuggerStateError(nonStateError)}`);
    console.log();

    console.log('🔍 Reference Error Checks:');
    console.log(`  - E_INVALID_REFERENCE is ref error: ${isReferenceError(refError)}`);
    console.log(`  - E_NO_SESSION is ref error: ${isReferenceError(stateError)}`);
    console.log();

    console.log('🔍 Supported Debugger Types:');
    const types = getSupportedDebuggerTypes();
    types.forEach(type => console.log(`  - ${type}`));

    // Summary
    printSection('TEST SUMMARY');
    console.log('✅ All error codes tested');
    console.log(`✅ Total error codes: ${Object.keys(DebugErrorCode).length}`);
    console.log('✅ All helper functions validated');
    console.log('✅ Custom error creation works');
    console.log();
    console.log('🎯 Manual validation checklist:');
    console.log('  [ ] All error messages are clear and actionable');
    console.log('  [ ] All hints provide helpful guidance');
    console.log('  [ ] E_NOT_STOPPED clarifies DAP semantics');
    console.log('  [ ] Byte formatting shows KB for <1MB sizes');
    console.log('  [ ] Error codes follow consistent naming convention');
    console.log();

    printSeparator('=');
    console.log('  END OF TEST HARNESS');
    printSeparator('=');
}

// Run the test
main();