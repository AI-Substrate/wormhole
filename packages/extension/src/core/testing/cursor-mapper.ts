import * as vscode from 'vscode';
import { TestDiscovery } from './discovery';

/**
 * Maps cursor positions to test items using VS Code Testing API
 */
export class CursorTestMapper {
    /**
     * Find test at cursor position
     * @param document The document to search in
     * @param position The cursor position
     * @param refreshIfNeeded Whether to refresh test discovery if no test found
     */
    static async findTestAtCursor(
        document: vscode.TextDocument,
        position: vscode.Position,
        refreshIfNeeded: boolean = true
    ): Promise<vscode.TestItem | null> {
        // First attempt to find test at position
        let testItem = await TestDiscovery.getTestAtPosition(document, position);

        if (!testItem && refreshIfNeeded) {
            // Refresh discovery and try again
            const refreshed = await TestDiscovery.refreshTests(document.uri);
            if (refreshed) {
                // Wait for discovery to complete
                await TestDiscovery.waitForTestDiscovery(2000);

                // Try finding test again
                testItem = await TestDiscovery.getTestAtPosition(document, position);
            }
        }

        return testItem;
    }

    /**
     * Wait for test discovery at specific URI
     * @param uri The URI to wait for test discovery
     * @param timeoutMs Maximum time to wait
     */
    static async waitForTestDiscovery(
        uri: vscode.Uri,
        timeoutMs: number = 5000
    ): Promise<boolean> {
        // Trigger refresh
        const refreshed = await TestDiscovery.refreshTests(uri);
        if (!refreshed) {
            return false;
        }

        // Wait for discovery to complete
        return await TestDiscovery.waitForTestDiscovery(timeoutMs);
    }

    /**
     * Get test name from position using pattern matching
     * This is a fallback when Testing API doesn't provide test items
     */
    static async getTestNameFromPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<string | null> {
        return TestDiscovery.getTestNameAtPosition(document, position);
    }

    /**
     * Check if position is inside a test file
     */
    static isInTestFile(document: vscode.TextDocument): boolean {
        return TestDiscovery.isTestFile(document.uri.fsPath);
    }

    /**
     * Get all test items in a document
     * @param document The document to search
     */
    static async getAllTestsInDocument(
        document: vscode.TextDocument
    ): Promise<vscode.TestItem[]> {
        const tests: vscode.TestItem[] = [];

        if (!vscode.tests) {
            return tests;
        }

        const controllers = TestDiscovery.getAvailableTestControllers();

        for (const controller of controllers) {
            this.collectTestItemsFromCollection(
                controller.items,
                document.uri,
                tests
            );
        }

        return tests;
    }

    /**
     * Recursively collect test items from a collection
     */
    private static collectTestItemsFromCollection(
        collection: vscode.TestItemCollection,
        uri: vscode.Uri,
        result: vscode.TestItem[]
    ): void {
        collection.forEach(item => {
            // Add item if it matches the URI
            if (item.uri?.fsPath === uri.fsPath) {
                result.push(item);
            }

            // Recursively check children
            if (item.children.size > 0) {
                this.collectTestItemsFromCollection(item.children, uri, result);
            }
        });
    }

    /**
     * Find the nearest test to a position
     * Useful when cursor is not exactly on a test
     */
    static async findNearestTest(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.TestItem | null> {
        const allTests = await this.getAllTestsInDocument(document);

        if (allTests.length === 0) {
            return null;
        }

        // Find test with closest range
        let nearestTest: vscode.TestItem | null = null;
        let nearestDistance = Number.MAX_VALUE;

        for (const test of allTests) {
            if (!test.range) continue;

            // Calculate distance (simple line difference)
            const distance = Math.abs(test.range.start.line - position.line);

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestTest = test;
            }
        }

        return nearestTest;
    }

    /**
     * Create a test run request for a specific test
     */
    static createTestRunRequest(
        testItem: vscode.TestItem,
        debug: boolean = true
    ): vscode.TestRunRequest {
        return new vscode.TestRunRequest(
            [testItem],
            undefined,
            undefined,
            debug
        );
    }

    /**
     * Get parent test suite/describe block for a test
     */
    static getParentTestSuite(testItem: vscode.TestItem): vscode.TestItem | undefined {
        return testItem.parent;
    }

    /**
     * Get test framework from workspace
     */
    static async getTestFramework(document: vscode.TextDocument): Promise<string> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return 'unknown';
        }

        // Pass document URI to enable file-extension based framework detection
        return TestDiscovery.getTestFramework(workspaceFolder, document.uri);
    }
}