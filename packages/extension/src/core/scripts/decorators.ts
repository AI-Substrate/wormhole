/**
 * Script Decorator System
 *
 * Provides @RegisterScript decorator for compile-time script registration.
 * Replaces dynamic loading (eval require) with static imports in Phase 5.
 *
 * ## Usage
 *
 * Basic script decoration:
 * ```typescript
 * import { QueryScript, RegisterScript } from '@script-base';
 * import { IBridgeContext } from '@core/bridge-context/types';
 *
 * @RegisterScript('category.scriptname')
 * export class MyScript extends QueryScript<ParamsType, ResultType> {
 *   async execute(ctx: IBridgeContext, params: ParamsType): Promise<ResultType> {
 *     // ... implementation
 *   }
 * }
 *
 * export default MyScript;
 * ```
 *
 * ## Script Name Convention
 *
 * Script names follow the pattern `category.scriptname`:
 * - `debug.status` → /vsc-scripts/debug/status.ts
 * - `breakpoint.set` → /vsc-scripts/breakpoint/set.ts
 * - `symbol.navigate` → /vsc-scripts/symbol/navigate.ts
 *
 * ## Technical Details
 *
 * ### Lazy Initialization
 * The decorator uses lazy initialization to prevent race conditions caused by
 * decorator execution during module imports. WeakMap is created on first access,
 * ensuring it always exists when decorator runs.
 *
 * ### Import Order Independence
 * Decorators work regardless of module load order. Whether a script imports
 * decorators or decorators import a script, metadata storage always succeeds.
 *
 * ### WeakMap Choice
 * Uses WeakMap (not Map) to allow garbage collection of unused script classes.
 * No memory leaks from class references.
 *
 * ### Debugging Support
 * Decorated scripts maintain full source map support. Set breakpoints in .ts
 * files and debug normally in VS Code Extension Host.
 *
 * ### Development Workflow Note
 * **IMPORTANT**: Due to WeakMap metadata storage, script changes require a full
 * Extension Host restart (Ctrl+Shift+F5 or "Developer: Reload Window"). This is
 * because new class constructors have different object identity, preventing hot-reload.
 * Typical restart time: 10-30 seconds. This matches standard VS Code extension
 * development workflow.
 *
 * ### Mandatory Decorator Requirement
 * **CRITICAL**: TypeScript CANNOT enforce decorator usage at compile time. A script
 * without `@RegisterScript` will compile successfully but fail at runtime when the
 * registry cannot find it. Always add the decorator - runtime validation (Phase 5)
 * will warn about missing decorators.
 *
 * ## Phase Context
 *
 * - **Phase 2** (current): Decorator implementation
 * - **Phase 3-4**: Apply decorator to all 41 scripts during TypeScript conversion
 * - **Phase 5**: ScriptRegistry uses decorator metadata instead of dynamic loading
 *
 * @module decorators
 * @since Phase 2: Decorator System Implementation
 */

/**
 * Script metadata stored by decorator
 */
export interface ScriptMetadata {
  scriptName: string;
}

/**
 * Type for script constructor (any class extending ScriptBase)
 */
export type ScriptConstructor = new (...args: any[]) => any;

// Module-level storage (initialized lazily to prevent race conditions)
let scriptMetadata: WeakMap<any, string> | undefined;

/**
 * Lazy initialization getter for script metadata storage.
 *
 * Creates WeakMap on first access to prevent race conditions caused by
 * decorator execution during module imports.
 *
 * Why WeakMap:
 * - Allows garbage collection of unused script classes
 * - No memory leaks from class references
 * - Class-to-metadata mapping without exposing class properties
 *
 * @returns WeakMap for storing script metadata
 */
export function getScriptMetadata(): WeakMap<any, string> {
  if (!scriptMetadata) {
    scriptMetadata = new WeakMap<any, string>();
  }
  return scriptMetadata;
}

/**
 * Decorator to register a script with its scriptName.
 *
 * Usage:
 *   @RegisterScript('debug.status')
 *   export class DebugStatusScript extends QueryScript { ... }
 *
 * The decorator stores the script name as metadata, enabling:
 * - Static script discovery in Phase 5
 * - Replacement of dynamic loading with static imports
 * - Full debugging support with source maps
 *
 * @param scriptName - The unique identifier for this script (e.g., 'debug.status')
 * @returns Class decorator function
 */
export function RegisterScript(scriptName: string) {
  return function <T extends ScriptConstructor>(target: T): T {
    // Use getter to ensure WeakMap exists (lazy initialization)
    getScriptMetadata().set(target, scriptName);
    return target;
  };
}
