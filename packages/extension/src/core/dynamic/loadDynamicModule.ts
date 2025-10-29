/**
 * Load dynamic script module from source code string
 * This extracts the module loading logic to be reusable
 */

/**
 * Load a dynamic script module from source string
 * @param source The JavaScript source code
 * @returns The module exports (function or object with execute method)
 */
export function loadDynamicModule(source: string, vscode?: any, extensionRoot?: string): any {
    // Import required modules
    const vm = require('node:vm');
    const path = require('node:path');
    const { createRequire } = require('node:module');
    
    // Create a minimal module environment
    const moduleEnv = {
        exports: {} as any,
    };

    // Transform the source to handle various export patterns
    let transformedSource = source;

    // Handle: export default async function(...) or export default function(...)
    transformedSource = transformedSource.replace(
        /export\s+default\s+(async\s+)?function/g,
        'module.exports = $1function'
    );

    // Handle: export default async (...) => or export default (...) =>
    transformedSource = transformedSource.replace(
        /export\s+default\s+(async\s+)?\(/g,
        'module.exports = $1('
    );

    // Handle: export default async params => or export default params =>
    transformedSource = transformedSource.replace(
        /export\s+default\s+(async\s+)?(\w+)\s+=>/g,
        'module.exports = $1$2 =>'
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

    // Handle: export { ... as default }
    transformedSource = transformedSource.replace(
        /export\s+\{\s*(\w+)\s+as\s+default\s*\}/g,
        'module.exports = $1'
    );

    // Determine the virtual location for the dynamic script
    // This is important for require resolution
    const virtualPath = extensionRoot 
        ? path.join(extensionRoot, 'dynamic', 'user-script.js')
        : path.join(process.cwd(), 'dynamic', 'user-script.js');
    
    const dirname = path.dirname(virtualPath);
    
    // CRITICAL: Create a Node require anchored to the virtual script location
    // This allows the dynamic script to require both Node built-ins and extension modules
    const nodeRequire = createRequire(virtualPath);

    // Compile in the CURRENT context to preserve prototype chains
    // This is why instanceof checks work correctly
    const compiledFunction = vm.compileFunction(
        transformedSource,
        ['module', 'exports', 'require', '__filename', '__dirname', 'vscode', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Promise', 'Date', 'Math', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'RegExp', 'Error'],
        { 
            filename: virtualPath,  // Improves stack traces and debugging
            lineOffset: 0,
            columnOffset: 0
        }
    );

    // Execute the compiled function with the anchored require
    // The nodeRequire can now resolve both 'path' and '/absolute/path/to/module'
    compiledFunction(
        moduleEnv,
        moduleEnv.exports,
        nodeRequire,  // The properly anchored require function
        virtualPath,  // __filename
        dirname,      // __dirname
        vscode || {},  // Pass the real vscode module
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

    // Get the exports
    let scriptModule = moduleEnv.exports;

    // Handle various export patterns
    if (typeof scriptModule === 'function') {
        // Direct function export: module.exports = function() {}
        return scriptModule;
    }

    if (scriptModule.default) {
        // ES6 default export pattern
        return scriptModule.default;
    }

    if (scriptModule.execute && typeof scriptModule.execute === 'function') {
        // Object with execute method
        return scriptModule;
    }

    // Check for single named function export
    const functionExports = Object.keys(scriptModule).filter(
        key => typeof scriptModule[key] === 'function'
    );

    if (functionExports.length === 1) {
        // Use the single function export
        return scriptModule[functionExports[0]];
    }

    // If we have an object with multiple exports, return it as-is
    // The caller will need to handle it appropriately
    return scriptModule;
}