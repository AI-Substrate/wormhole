import * as vscode from 'vscode';

/**
 * Jest extension ID
 */
const JEST_EXT_ID = 'Orta.vscode-jest';

/**
 * Ensures vscode-jest extension is installed and activated before tests run.
 * This is critical for JavaScript test debugging functionality.
 *
 * @throws Error if extension is not installed or activation fails
 */
export async function ensureJestActivated(): Promise<void> {
    const ext = vscode.extensions.getExtension(JEST_EXT_ID);

    if (!ext) {
        throw new Error(
            `Missing required extension: ${JEST_EXT_ID}. ` +
            `Ensure extensionDependencies includes "${JEST_EXT_ID}" in package.json ` +
            `and that the test configuration installs it.`
        );
    }

    // Extension activation is lazy/event-driven - force it and wait
    if (!ext.isActive) {
        console.log(`[ensure-jest] Activating ${JEST_EXT_ID}...`);
        try {
            await ext.activate();
            console.log(`[ensure-jest] ✓ ${JEST_EXT_ID} activated successfully`);
        } catch (error) {
            throw new Error(
                `Failed to activate ${JEST_EXT_ID}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    } else {
        console.log(`[ensure-jest] ✓ ${JEST_EXT_ID} already active`);
    }
}

/**
 * Check if Jest extension is available without throwing
 * @returns true if extension is installed and active
 */
export function isJestAvailable(): boolean {
    const ext = vscode.extensions.getExtension(JEST_EXT_ID);
    return ext !== undefined && ext.isActive;
}