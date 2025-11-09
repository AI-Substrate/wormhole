import { type ScriptMetadata, type ParamDefinition } from './manifest-loader.js';
import * as path from 'path';

// Debug logging utility for path resolution
const debugPath = (message: string) => {
    if (process.env.DEBUG?.includes('vscb:path') || process.env.DEBUG?.includes('*')) {
        console.error(`[vscb:path] ${message}`);
    }
};

/**
 * Resolve a path based on the resolution strategy
 */
function resolvePath(
    value: string,
    strategy: 'workspace-relative' | 'absolute' | 'cwd-relative' | undefined,
    workspaceRoot?: string
): string {
    if (!strategy || strategy === 'absolute') {
        // No resolution needed for absolute paths or no strategy
        debugPath(`No resolution needed for: ${value} (strategy: ${strategy || 'absolute'})`);
        return value;
    }

    // If already absolute, return as-is
    if (path.isAbsolute(value)) {
        debugPath(`Path already absolute: ${value}`);
        return value;
    }

    switch (strategy) {
        case 'workspace-relative':
            if (!workspaceRoot) {
                // If no workspace root available, treat as cwd-relative
                const cwd = process.cwd();
                const resolvedWsFallback = path.resolve(cwd, value);
                debugPath(`Workspace-relative fallback to CWD: '${value}' -> '${resolvedWsFallback}' (cwd: ${cwd})`);
                return resolvedWsFallback;
            }
            const resolvedWs = path.resolve(workspaceRoot, value);
            debugPath(`Workspace-relative: '${value}' -> '${resolvedWs}' (workspace: ${workspaceRoot})`);
            return resolvedWs;

        case 'cwd-relative':
            const cwd = process.cwd();
            const resolvedCwd = path.resolve(cwd, value);
            debugPath(`CWD-relative: '${value}' -> '${resolvedCwd}' (cwd: ${cwd})`);
            return resolvedCwd;

        default:
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[vscb:path] WARNING: unknown resolve strategy '${strategy}' – value left unchanged`);
            }
            debugPath(`Unknown strategy '${strategy}', returning as-is: ${value}`);
            return value;
    }
}

/**
 * Build a map from aliases to canonical parameter names
 */
function buildAliasMap(params: Record<string, ParamDefinition>): Record<string, string> {
    const aliasMap: Record<string, string> = {};

    for (const [canonicalName, def] of Object.entries(params)) {
        if (def.aliases) {
            for (const alias of def.aliases) {
                aliasMap[alias] = canonicalName;
            }
        }
    }

    return aliasMap;
}

/**
 * Normalize parameter names using alias mapping
 */
function normalizeParams(
    params: Record<string, any>,
    aliasMap: Record<string, string>
): Record<string, any> {
    const normalized: Record<string, any> = {};

    for (const [name, value] of Object.entries(params)) {
        // Check if this is an alias
        const canonicalName = aliasMap[name] || name;
        normalized[canonicalName] = value;
    }

    return normalized;
}

/**
 * Validation error structure
 */
export interface ValidationError {
    field: string;
    message: string;
    suggestion?: string;
    expected?: any;
    received?: any;
    // Path resolution details (for enhanced error messages)
    originalPath?: string;
    resolvedPath?: string;
    resolutionStrategy?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    coercedParams?: Record<string, any>;
}

/**
 * Validate parameters against script metadata
 */
export function validateParams(
    metadata: ScriptMetadata,
    params: Record<string, any>,
    options: { workspaceRoot?: string } = {}
): ValidationResult {
    const errors: ValidationError[] = [];
    const coercedParams: Record<string, any> = {};
    const paramDefs = metadata.params || {};

    // Build alias map and normalize parameters
    const aliasMap = buildAliasMap(paramDefs);
    const normalizedParams = normalizeParams(params, aliasMap);

    // Check for required parameters (using normalized params)
    for (const [name, def] of Object.entries(paramDefs)) {
        if (def.required && !(name in normalizedParams)) {
            errors.push({
                field: name,
                message: 'Missing required parameter'
            });
        }
    }

    // Validate and coerce provided parameters
    for (const [name, value] of Object.entries(normalizedParams)) {
        const def = paramDefs[name];

        if (!def) {
            // Unknown parameter
            const suggestion = findClosestMatch(name, Object.keys(paramDefs));
            errors.push({
                field: name,
                message: 'Unknown parameter',
                suggestion: suggestion || undefined
            });
            continue;
        }

        // Skip null or undefined values for optional params
        if (value === null || value === undefined) {
            if (def.required) {
                errors.push({
                    field: name,
                    message: 'Required parameter cannot be null or undefined'
                });
            }
            continue;
        }

        // Try to coerce and validate the value
        try {
            const coercedValue = coerceValue(value, def.type, def.values);

            // Additional validation for specific types
            if (def.type === 'enum' && def.values) {
                if (!def.values.includes(coercedValue)) {
                    errors.push({
                        field: name,
                        message: `Value must be one of: ${def.values.join(', ')}`,
                        expected: def.values,
                        received: coercedValue
                    });
                    continue;
                }
            }

            // Validate number constraints
            if (def.type === 'number' && typeof coercedValue === 'number') {
                if (def.min !== undefined && coercedValue < def.min) {
                    errors.push({
                        field: name,
                        message: `Value must be >= ${def.min}`,
                        expected: `>= ${def.min}`,
                        received: coercedValue
                    });
                    continue;
                }
                if (def.max !== undefined && coercedValue > def.max) {
                    errors.push({
                        field: name,
                        message: `Value must be <= ${def.max}`,
                        expected: `<= ${def.max}`,
                        received: coercedValue
                    });
                    continue;
                }
                if (def.integer && !Number.isInteger(coercedValue)) {
                    errors.push({
                        field: name,
                        message: 'Value must be an integer',
                        expected: 'integer',
                        received: coercedValue
                    });
                    continue;
                }
            }

            // Validate string constraints and apply path resolution
            if (def.type === 'string' && typeof coercedValue === 'string') {
                // Apply path resolution if specified
                let resolvedValue = coercedValue;
                let originalPath: string | undefined;
                let resolvedPath: string | undefined;
                let resolutionStrategy: string | undefined;

                if (def.resolve) {
                    originalPath = coercedValue;
                    resolvedValue = resolvePath(coercedValue, def.resolve, options.workspaceRoot);
                    resolvedPath = resolvedValue;
                    resolutionStrategy = def.resolve;
                }

                // Empty string policy: Required strings must be non-empty unless minLength: 0 is set
                if (def.required && resolvedValue === '' && def.minLength !== 0) {
                    errors.push({
                        field: name,
                        message: 'Required string cannot be empty',
                        expected: 'non-empty string',
                        received: 'empty string',
                        originalPath,
                        resolvedPath,
                        resolutionStrategy
                    });
                    continue;
                }

                if (def.minLength !== undefined && resolvedValue.length < def.minLength) {
                    errors.push({
                        field: name,
                        message: `String length must be >= ${def.minLength}`,
                        expected: `length >= ${def.minLength}`,
                        received: `length ${resolvedValue.length}`,
                        originalPath,
                        resolvedPath,
                        resolutionStrategy
                    });
                    continue;
                }
                if (def.maxLength !== undefined && resolvedValue.length > def.maxLength) {
                    errors.push({
                        field: name,
                        message: `String length must be <= ${def.maxLength}`,
                        expected: `length <= ${def.maxLength}`,
                        received: `length ${resolvedValue.length}`,
                        originalPath,
                        resolvedPath,
                        resolutionStrategy
                    });
                    continue;
                }

                // Validate pattern if specified
                if (def.pattern) {
                    try {
                        const regex = new RegExp(def.pattern);
                        if (!regex.test(resolvedValue)) {
                            errors.push({
                                field: name,
                                message: `String does not match pattern: ${def.pattern}`,
                                expected: `matches /${def.pattern}/`,
                                received: resolvedValue,
                                originalPath,
                                resolvedPath,
                                resolutionStrategy
                            });
                            continue;
                        }
                    } catch (e) {
                        errors.push({
                            field: name,
                            message: `Invalid regex pattern: ${def.pattern}`,
                            expected: 'valid regex',
                            received: def.pattern,
                            originalPath,
                            resolvedPath,
                            resolutionStrategy
                        });
                        continue;
                    }
                }

                // Use resolved value for strings with resolution strategy
                coercedParams[name] = resolvedValue;
            } else {
                coercedParams[name] = coercedValue;
            }
        } catch (error: any) {
            errors.push({
                field: name,
                message: error.message || `Failed to validate ${name}`,
                expected: def.type,
                received: typeof value
            });
        }
    }

    // Apply default values for missing optional parameters
    for (const [name, def] of Object.entries(paramDefs)) {
        if (!def.required && !(name in params) && def.default !== undefined) {
            coercedParams[name] = def.default;
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        coercedParams: errors.length === 0 ? coercedParams : undefined
    };
}

/**
 * Coerce a value to the expected type
 */
export function coerceValue(
    value: any,
    type: string,
    enumValues?: string[]
): any {
    // Already the correct type
    if (type === 'string' && typeof value === 'string') return value;
    if (type === 'number' && typeof value === 'number') return value;
    if (type === 'boolean' && typeof value === 'boolean') return value;
    if (type === 'enum') return value; // Enum values are validated separately

    switch (type) {
        case 'number': {
            if (value === '' || value === null || value === undefined) {
                throw new Error(`Cannot convert empty value to number`);
            }
            const num = Number(value);
            if (isNaN(num)) {
                throw new Error(`Cannot convert '${value}' to number`);
            }
            return num;
        }

        case 'boolean': {
            if (value === 'true' || value === '1' || value === 1) return true;
            if (value === 'false' || value === '0' || value === 0) return false;
            throw new Error(`Cannot convert '${value}' to boolean. Use 'true', 'false', '1', or '0'`);
        }

        case 'string': {
            return String(value);
        }

        case 'enum': {
            // Enum values are strings, just return as-is
            return String(value);
        }

        case 'array': {
            if (Array.isArray(value)) return value;
            // Try to parse as JSON if it's a string
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) return parsed;
                } catch {}
            }
            // Wrap single value in array
            return [value];
        }

        case 'object': {
            if (typeof value === 'object' && value !== null) return value;
            // Try to parse as JSON if it's a string
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    if (typeof parsed === 'object' && parsed !== null) return parsed;
                } catch {}
            }
            throw new Error(`Cannot convert '${value}' to object`);
        }

        default:
            return value;
    }
}

/**
 * Find the closest matching string using Levenshtein distance
 */
export function findClosestMatch(
    input: string,
    options: string[]
): string | null {
    if (!input || options.length === 0) return null;

    let minDistance = Infinity;
    let closest: string | null = null;

    for (const option of options) {
        const distance = levenshteinDistance(input.toLowerCase(), option.toLowerCase());
        if (distance < minDistance && distance <= 3) { // Max 3 edits
            minDistance = distance;
            closest = option;
        }
    }

    return closest;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    // Calculate distances
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // Deletion
                matrix[i][j - 1] + 1,      // Insertion
                matrix[i - 1][j - 1] + cost // Substitution
            );
        }
    }

    return matrix[len1][len2];
}

/**
 * Format validation errors into a user-friendly message
 */
export function formatValidationErrors(
    errors: ValidationError[],
    metadata: ScriptMetadata
): string {
    let output = `Parameter validation failed for '${metadata.alias}':\n\n`;

    // Format each error
    for (const error of errors) {
        output += `  ✗ ${error.field}: ${error.message}\n`;

        // Add path resolution details if available
        if (error.originalPath && error.resolvedPath) {
            output += `    Original path: ${error.originalPath}\n`;
            output += `    Resolved to: ${error.resolvedPath}\n`;
            if (error.resolutionStrategy) {
                output += `    Resolution strategy: ${error.resolutionStrategy}\n`;
            }
        }

        if (error.suggestion) {
            output += `    Did you mean '${error.suggestion}'?\n`;
        }

        // Add parameter description if available
        const paramDef = metadata.params?.[error.field];
        if (paramDef?.description) {
            output += `    ${paramDef.description}\n`;
        }
    }

    // Show expected parameters
    output += '\nExpected parameters:\n';
    const params = metadata.params || {};

    for (const [name, def] of Object.entries(params)) {
        const req = def.required ? '*' : '';
        const defVal = def.default !== undefined ? ` (default: ${def.default})` : '';
        output += `  ${name}${req} (${def.type})${defVal}: ${def.description || 'No description'}\n`;

        if (def.type === 'enum' && def.values) {
            output += `    Allowed values: ${def.values.join(', ')}\n`;
        }
    }

    output += `\nRun 'vscb script info ${metadata.alias}' to see more details.`;

    return output;
}