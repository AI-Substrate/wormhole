/**
 * Dynamic Script Executor
 *
 * Executes dynamic scripts sent from CLI with scriptContent.
 * Provides a sandboxed environment with VS Code API access.
 * No danger mode required since we're running locally.
 */

import * as vscode from 'vscode';

export interface DynamicScriptResult {
    success?: boolean;
    [key: string]: any;
}

export interface DynamicScriptContext {
    vscode: typeof vscode;
    workspace: typeof vscode.workspace;
    window: typeof vscode.window;
    debug: typeof vscode.debug;
    commands: typeof vscode.commands;
    env: typeof vscode.env;
    requestId: string;
    mode: string;
    signal?: AbortSignal;
}

/**
 * Execute a dynamic script with VS Code API access
 *
 * @param source - The script source code
 * @param params - Parameters to pass to the script
 * @param context - VS Code API context
 * @returns The script execution result
 */
export async function executeDynamicScript(
    source: string,
    params: unknown,
    context: DynamicScriptContext
): Promise<DynamicScriptResult> {
    // Create a minimal module environment
    const moduleEnv = {
        exports: {} as any,
    };

    // Transform the source to handle ESM-style exports
    // This is a simple transformation for common patterns
    let transformedSource = source;

    // Handle: export default async function(...) or export default function(...)
    transformedSource = transformedSource.replace(
        /export\s+default\s+(async\s+)?function/g,
        'module.exports.default = $1function'
    );

    // Handle: export default async (...) => or export default (...) =>
    transformedSource = transformedSource.replace(
        /export\s+default\s+(async\s+)?\(/g,
        'module.exports.default = $1('
    );

    // Handle: export default async params => or export default params =>
    transformedSource = transformedSource.replace(
        /export\s+default\s+(async\s+)?(\w+)\s+=>/g,
        'module.exports.default = $1$2 =>'
    );

    // Handle: export const meta = { ... }
    transformedSource = transformedSource.replace(
        /export\s+const\s+meta\s*=/g,
        'module.exports.meta ='
    );

    // Handle: export function name(...)
    transformedSource = transformedSource.replace(
        /export\s+function\s+(\w+)/g,
        'module.exports.$1 = function'
    );

    // Handle: export { ... }
    // This is more complex and we'll skip named exports for now

    try {
        // Create a function with limited scope
        // We provide module but not require, process, or fs
        const scriptFunction = new Function(
            'module',
            'console',
            'setTimeout',
            'setInterval',
            'clearTimeout',
            'clearInterval',
            'Promise',
            'Date',
            'Math',
            'JSON',
            'Array',
            'Object',
            'String',
            'Number',
            'Boolean',
            'Map',
            'Set',
            'RegExp',
            'Error',
            transformedSource
        );

        // Execute the script to populate module.exports
        scriptFunction(
            moduleEnv,
            console,
            setTimeout,
            setInterval,
            clearTimeout,
            clearInterval,
            Promise,
            Date,
            Math,
            JSON,
            Array,
            Object,
            String,
            Number,
            Boolean,
            Map,
            Set,
            RegExp,
            Error
        );

        // Check for default export
        const scriptModule = moduleEnv.exports;
        if (!scriptModule.default) {
            // Try to find a function export
            const functionExports = Object.keys(scriptModule).filter(
                key => typeof scriptModule[key] === 'function'
            );

            if (functionExports.length === 1) {
                // Use the single function export as default
                scriptModule.default = scriptModule[functionExports[0]];
            } else if (typeof scriptModule === 'function') {
                // module.exports = function() {...} pattern
                scriptModule.default = scriptModule;
            } else {
                throw new Error('Script must export a default function');
            }
        }

        // Validate the default export is a function
        if (typeof scriptModule.default !== 'function') {
            throw new Error('Default export must be a function');
        }

        // Create the curated context object
        const scriptContext = Object.freeze({
            vscode: context.vscode,
            workspace: context.workspace,
            window: context.window,
            debug: context.debug,
            commands: context.commands,
            env: context.env,
            // Additional helpers
            requestId: context.requestId,
            mode: context.mode,
            signal: context.signal,
        });

        // Execute the script's default function
        const result = await scriptModule.default(params, scriptContext);

        // Ensure result is an object
        if (result === undefined || result === null) {
            return { success: true };
        }

        if (typeof result !== 'object') {
            return { success: true, value: result };
        }

        return result;
    } catch (error: any) {
        // Return error in a structured format
        return {
            success: false,
            error: error.message || 'Script execution failed',
            stack: error.stack,
        };
    }
}

/**
 * Validate that a script has proper structure
 *
 * @param source - The script source code
 * @returns Whether the script appears to be valid
 */
export function validateScriptStructure(source: string): {
    valid: boolean;
    error?: string;
} {
    // Basic validation - check for obvious issues
    if (!source || source.trim().length === 0) {
        return { valid: false, error: 'Script is empty' };
    }

    // Check for dangerous patterns (even though we trust local scripts)
    const dangerousPatterns = [
        /\beval\s*\(/,
        /new\s+Function\s*\(/,
        /\bimport\s*\(/,  // Dynamic imports
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(source)) {
            return {
                valid: false,
                error: `Script contains potentially dangerous pattern: ${pattern.source}`,
            };
        }
    }

    // Check for export default or module.exports
    const hasExport =
        /export\s+default/.test(source) ||
        /module\.exports/.test(source) ||
        /exports\.default/.test(source);

    if (!hasExport) {
        return {
            valid: false,
            error: 'Script must have a default export',
        };
    }

    return { valid: true };
}