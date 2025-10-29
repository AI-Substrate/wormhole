import { AsyncLocalStorage } from 'node:async_hooks';
import { BridgeContext } from './BridgeContext';

/**
 * AsyncLocalStorage for maintaining BridgeContext across async boundaries
 * This ensures each request has its own isolated context
 */
const asyncLocalStorage = new AsyncLocalStorage<BridgeContext>();

/**
 * Execute a function with a specific BridgeContext
 * The context will be available to all async operations within the function
 *
 * @param ctx The BridgeContext to use for this execution
 * @param fn The function to execute with the context
 * @returns The result of the function
 */
export function withContext<T>(
    ctx: BridgeContext,
    fn: () => T | Promise<T>
): T | Promise<T> {
    return asyncLocalStorage.run(ctx, fn);
}

/**
 * Get the current BridgeContext from AsyncLocalStorage
 * Returns undefined if not running within a context
 *
 * @returns The current BridgeContext or undefined
 */
export function currentContext(): BridgeContext | undefined {
    return asyncLocalStorage.getStore();
}

/**
 * Check if we're running within a BridgeContext
 *
 * @returns true if a BridgeContext is available
 */
export function hasContext(): boolean {
    return asyncLocalStorage.getStore() !== undefined;
}

/**
 * Exit the current async context
 * This is useful for breaking out of the context chain
 *
 * @param fn The function to run outside the context
 * @returns The result of the function
 */
export function exitContext<T>(fn: () => T | Promise<T>): T | Promise<T> {
    return asyncLocalStorage.exit(fn);
}

/**
 * Create a new isolated context for testing
 * This ensures tests don't interfere with each other
 *
 * @returns A new AsyncLocalStorage instance for testing
 */
export function createTestStorage(): AsyncLocalStorage<BridgeContext> {
    return new AsyncLocalStorage<BridgeContext>();
}

/**
 * Helper to get a required context (throws if not available)
 *
 * @throws Error if no context is available
 * @returns The current BridgeContext
 */
export function requireContext(): BridgeContext {
    const ctx = currentContext();
    if (!ctx) {
        throw new Error('BridgeContext is required but not available. Ensure code is running within withContext()');
    }
    return ctx;
}

/**
 * Helper to get context with a fallback
 *
 * @param fallback Function to create a fallback context
 * @returns The current context or the fallback
 */
export function contextOrFallback(fallback: () => BridgeContext): BridgeContext {
    return currentContext() || fallback();
}

// Export the storage instance for advanced use cases
export const contextStorage = asyncLocalStorage;