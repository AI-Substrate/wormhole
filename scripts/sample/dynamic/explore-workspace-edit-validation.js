#!/usr/bin/env node
/**
 * Dynamic TAD Exploration: WorkspaceEdit Pre-Validation
 *
 * Purpose: Explore file permission validation before applyEdit (Discovery 07)
 * - Read-only file detection
 * - Non-existent file handling
 * - Permission error scenarios
 *
 * Run: vscb script run -f scripts/sample/dynamic/explore-workspace-edit-validation.js
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

module.exports = {
    async execute(bridgeContext, params) {
        const results = [];

        // Test 1: Extract files from WorkspaceEdit
        try {
            results.push(await exploreFileExtraction());
        } catch (error) {
            results.push({ test: 'file-extraction', error: error.message });
        }

        // Test 2: Validate writable files
        try {
            results.push(await exploreWritableValidation());
        } catch (error) {
            results.push({ test: 'writable-validation', error: error.message });
        }

        // Test 3: Read-only file scenario
        try {
            results.push(await exploreReadOnlyHandling());
        } catch (error) {
            results.push({ test: 'read-only-handling', error: error.message });
        }

        return { success: true, results };
    }
};

async function exploreFileExtraction() {
    // Create sample WorkspaceEdit
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'python/test_example.py');
    const uri = vscode.Uri.file(testFile);
    const doc = await vscode.workspace.openTextDocument(uri);
    const position = new vscode.Position(2, 8);

    const workspaceEdit = await vscode.commands.executeCommand(
        'vscode.executeDocumentRenameProvider',
        uri,
        position,
        'new_name'
    );

    // Extract file paths
    const files = [];
    workspaceEdit.entries().forEach(([uri, edits]) => {
        files.push(uri.fsPath);
    });

    return {
        test: 'file-extraction',
        totalFiles: files.length,
        files: files.map(f => path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, f)),
        extractionMethod: 'workspaceEdit.entries().map(([uri]) => uri.fsPath)'
    };
}

async function exploreWritableValidation() {
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'python/test_example.py');

    // Test fs.accessSync with W_OK flag
    const validationResults = [];

    try {
        fs.accessSync(testFile, fs.constants.W_OK);
        validationResults.push({ file: testFile, writable: true, method: 'fs.accessSync' });
    } catch (error) {
        validationResults.push({ file: testFile, writable: false, error: error.code });
    }

    // Test non-existent file
    const fakeFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'nonexistent.py');
    try {
        fs.accessSync(fakeFile, fs.constants.W_OK);
        validationResults.push({ file: fakeFile, writable: true });
    } catch (error) {
        validationResults.push({ file: fakeFile, writable: false, error: error.code });
    }

    return {
        test: 'writable-validation',
        validations: validationResults,
        recommendation: 'Use fs.existsSync() first, then fs.accessSync(file, fs.constants.W_OK)'
    };
}

async function exploreReadOnlyHandling() {
    const testDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'scratch');
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, 'readonly-test.txt');

    // Create test file
    fs.writeFileSync(testFile, 'test content');

    // Make read-only
    fs.chmodSync(testFile, 0o444);

    // Test validation
    let validationError = null;
    try {
        if (!fs.existsSync(testFile)) {
            throw new Error('E_NOT_FOUND: File does not exist');
        }
        fs.accessSync(testFile, fs.constants.W_OK);
    } catch (error) {
        validationError = {
            code: error.code || 'E_FILE_READ_ONLY',
            message: `Cannot apply edit: ${testFile} is read-only`
        };
    }

    // Cleanup: restore write permissions and delete
    fs.chmodSync(testFile, 0o644);
    fs.unlinkSync(testFile);

    return {
        test: 'read-only-handling',
        scenario: 'File exists but is read-only (chmod 444)',
        validationError,
        errorCode: 'E_FILE_READ_ONLY',
        recommendation: 'Pre-validate with fs.accessSync before applyEdit to prevent partial edits'
    };
}
