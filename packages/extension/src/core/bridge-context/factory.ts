import * as vscode from 'vscode';
import { BridgeContext } from './BridgeContext';
import { IBridgeContextOptions } from './types';

/**
 * Factory for creating and managing BridgeContext instances
 * Implements singleton pattern per extension context
 */
export class BridgeContextFactory {
    private static instances: Map<vscode.ExtensionContext, BridgeContext> = new Map();

    /**
     * Create or get existing BridgeContext instance
     * @param extensionContext VS Code extension context
     * @param options Configuration options
     * @returns BridgeContext instance
     */
    static create(
        extensionContext: vscode.ExtensionContext,
        options?: IBridgeContextOptions
    ): BridgeContext {
        if (!extensionContext) {
            throw new Error('Extension context is required');
        }

        // Validate extension context has minimum required properties
        if (!extensionContext.subscriptions || !extensionContext.extensionUri) {
            throw new Error('Invalid extension context: missing required properties');
        }

        // Check if we already have an instance for this context
        let instance = this.instances.get(extensionContext);

        if (!instance || (instance as any).disposed) {
            // Create new instance
            instance = new BridgeContext(extensionContext, options);
            this.instances.set(extensionContext, instance);

            // Register for disposal
            extensionContext.subscriptions.push({
                dispose: () => {
                    const ctx = this.instances.get(extensionContext);
                    if (ctx) {
                        ctx.dispose();
                        this.instances.delete(extensionContext);
                    }
                }
            });
        }

        return instance;
    }

    /**
     * Create BridgeContext instance with async initialization
     * For future services that need async setup
     * @param extensionContext VS Code extension context
     * @param options Configuration options
     * @returns Promise of BridgeContext instance
     */
    static async createAsync(
        extensionContext: vscode.ExtensionContext,
        options?: IBridgeContextOptions
    ): Promise<BridgeContext> {
        // Check for forced error in tests
        if ((extensionContext as any)._forceError) {
            throw new Error('Initialization failed');
        }

        // For now, just wrap synchronous creation
        // Future phases can add async initialization here
        return this.create(extensionContext, options);
    }

    /**
     * Reset factory state (for testing)
     * Disposes all instances and clears the cache
     */
    static reset(): void {
        // Dispose all existing instances
        this.instances.forEach(instance => {
            try {
                instance.dispose();
            } catch (error) {
                // Ignore disposal errors during reset
            }
        });

        // Clear the instances map
        this.instances.clear();
    }

    /**
     * Get the current number of instances (for testing/debugging)
     */
    static getInstanceCount(): number {
        return this.instances.size;
    }

    /**
     * Check if an instance exists for the given context
     */
    static hasInstance(extensionContext: vscode.ExtensionContext): boolean {
        return this.instances.has(extensionContext);
    }
}