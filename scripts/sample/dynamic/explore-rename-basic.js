#!/usr/bin/env node
/**
 * Dynamic TAD Exploration: Basic Rename Operations
 *
 * Purpose: Explore LSP rename behavior with real providers
 * - Single-file rename (function/variable)
 * - Multi-file rename (class with imports)
 * - WorkspaceEdit structure inspection
 *
 * Run: vscb script run -f scripts/sample/dynamic/explore-rename-basic.js
 *
 * Expected behavior:
 * - LSP rename provider returns WorkspaceEdit
 * - WorkspaceEdit contains TextEdits grouped by file URI
 * - Atomic application updates all references
 */

const path = require('path');

module.exports = {
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;
        const results = [];

        // Test 1: Single-file rename (Python function)
        try {
            results.push(await exploreSingleFileRename(vscode));
        } catch (error) {
            results.push({ test: 'single-file', error: error.message });
        }

        // Test 2: Multi-file rename (Python class)
        try {
            results.push(await exploreMultiFileRename(vscode));
        } catch (error) {
            results.push({ test: 'multi-file', error: error.message });
        }

        // Test 3: WorkspaceEdit structure
        try {
            results.push(await exploreWorkspaceEditStructure(vscode));
        } catch (error) {
            results.push({ test: 'workspace-edit', error: error.message });
        }

        return { success: true, results };
    }
};

async function exploreSingleFileRename(vscode) {
    // Use test/ subdirectory relative to workspace root
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py');
    const uri = vscode.Uri.file(testFile);

    // Open document
    const doc = await vscode.workspace.openTextDocument(uri);

    // Position on the 'add' function (line 7: def add)
    const position = new vscode.Position(6, 4); // "add"

    // Execute rename
    const newName = 'add_numbers';
    const workspaceEdit = await vscode.commands.executeCommand(
        'vscode.executeDocumentRenameProvider',
        uri,
        position,
        newName
    );

    if (!workspaceEdit) {
        throw new Error('No WorkspaceEdit returned');
    }

    // Inspect structure
    const changes = {};
    workspaceEdit.entries().forEach(([uri, edits]) => {
        changes[uri.fsPath] = {
            editCount: edits.length,
            edits: edits.map(e => ({
                range: `L${e.range.start.line + 1}:${e.range.start.character}-L${e.range.end.line + 1}:${e.range.end.character}`,
                newText: e.newText
            }))
        };
    });

    // APPLY THE EDIT!
    const applied = await vscode.workspace.applyEdit(workspaceEdit);

    // Save the document to persist changes
    if (applied) {
        const doc = await vscode.workspace.openTextDocument(uri);
        await doc.save();
    }

    return {
        test: 'single-file',
        oldName: 'add',
        newName,
        totalFiles: workspaceEdit.size,
        changes,
        applied,
        note: applied ? '✅ RENAME APPLIED & SAVED' : '❌ RENAME FAILED'
    };
}

async function exploreMultiFileRename(vscode) {
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'python', 'test_example.py');
    const uri = vscode.Uri.file(testFile);

    // Open document
    const doc = await vscode.workspace.openTextDocument(uri);

    // Position on TestCalculator class (line 43: class TestCalculator)
    const position = new vscode.Position(42, 6); // "TestCalculator"

    // Execute rename
    const newName = 'TestMathCalculator';
    const workspaceEdit = await vscode.commands.executeCommand(
        'vscode.executeDocumentRenameProvider',
        uri,
        position,
        newName
    );

    if (!workspaceEdit) {
        throw new Error('No WorkspaceEdit returned');
    }

    // Inspect multi-file changes
    const fileList = [];
    const editCounts = {};

    workspaceEdit.entries().forEach(([uri, edits]) => {
        const relativePath = path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, uri.fsPath);
        fileList.push(relativePath);
        editCounts[relativePath] = edits.length;
    });

    // APPLY THE EDIT!
    const applied = await vscode.workspace.applyEdit(workspaceEdit);

    // Save all affected documents
    if (applied) {
        for (const [uri, edits] of workspaceEdit.entries()) {
            const doc = await vscode.workspace.openTextDocument(uri);
            await doc.save();
        }
    }

    return {
        test: 'multi-file',
        oldName: 'TestCalculator',
        newName,
        totalFiles: workspaceEdit.size,
        affectedFiles: fileList,
        editCounts,
        applied,
        note: applied ? '✅ RENAME APPLIED & SAVED' : '❌ RENAME FAILED'
    };
}

async function exploreWorkspaceEditStructure(vscode) {
    const testFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'test', 'javascript', 'simple-debug-test.js');
    const uri = vscode.Uri.file(testFile);

    // Open document
    const doc = await vscode.workspace.openTextDocument(uri);

    // Position on numberVar variable (line 6: let numberVar)
    const position = new vscode.Position(5, 8); // "numberVar"

    // Execute rename
    const newName = 'myNumber';
    const workspaceEdit = await vscode.commands.executeCommand(
        'vscode.executeDocumentRenameProvider',
        uri,
        position,
        newName
    );

    if (!workspaceEdit) {
        throw new Error('No WorkspaceEdit returned');
    }

    // Deep structure inspection
    const structure = {
        type: workspaceEdit.constructor.name,
        size: workspaceEdit.size,
        hasEntries: typeof workspaceEdit.entries === 'function',
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(workspaceEdit))
    };

    // APPLY THE EDIT!
    const applied = await vscode.workspace.applyEdit(workspaceEdit);

    // Save the document
    if (applied) {
        const doc = await vscode.workspace.openTextDocument(uri);
        await doc.save();
    }

    return {
        test: 'workspace-edit-structure',
        structure,
        sampleEntry: workspaceEdit.entries().length > 0 ? {
            uri: workspaceEdit.entries()[0][0].fsPath,
            editsType: Array.isArray(workspaceEdit.entries()[0][1]) ? 'TextEdit[]' : 'unknown',
            firstEdit: workspaceEdit.entries()[0][1][0] ? {
                range: workspaceEdit.entries()[0][1][0].range.constructor.name,
                newText: workspaceEdit.entries()[0][1][0].newText
            } : null
        } : null,
        applied,
        note: applied ? '✅ RENAME APPLIED & SAVED' : '❌ RENAME FAILED'
    };
}
