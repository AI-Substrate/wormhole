/**
 * Utility functions for unified test workflows
 */

import { RunnerResponse } from '../../runners/DebugRunner';

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry configuration for operations
 */
export interface RetryConfig {
    maxRetries: number;
    delayMs: number;
    operationName: string;
}

/**
 * Execute an operation with retry logic
 */
export async function withRetry<T>(
    operation: () => Promise<RunnerResponse<T>>,
    config: RetryConfig
): Promise<RunnerResponse<T>> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
        console.log(`🔄 Attempt ${attempt}/${config.maxRetries}: ${config.operationName}`);
        const result = await operation();

        if (result.success) {
            console.log(`✅ Succeeded on attempt ${attempt}`);
            return result;
        }

        lastError = result.error;
        console.log(`❌ Attempt ${attempt} failed: ${lastError?.substring(0, 100)}`);

        if (attempt < config.maxRetries) {
            console.log(`⏳ Waiting ${config.delayMs}ms before retry...`);
            await sleep(config.delayMs);
        }
    }

    return {
        success: false,
        error: `Failed after ${config.maxRetries} attempts: ${lastError}`
    };
}

/**
 * Variable name matchers for different languages
 */
export const variableMatchers = {
    // Exact match (Python, Java, TypeScript)
    exact: (varName: string, expectedName: string): boolean => {
        return varName === expectedName;
    },

    // Prefix match for C# type-annotated variables (e.g., "x [int]")
    typeAnnotated: (varName: string, expectedName: string): boolean => {
        return varName.startsWith(expectedName);
    }
};

/**
 * Scope extractors for different debugger responses
 */
export const scopeExtractors = {
    // Direct array (JavaScript)
    direct: (vars: any[]): any[] => {
        return vars;
    },

    // Nested with optional children property (Python, C#, Java)
    nestedOptional: (vars: any[]): any[] => {
        return vars[0]?.children || vars;
    },

    // Nested with required children property (TypeScript)
    nestedRequired: (vars: any[]): any[] => {
        if (!vars[0] || !vars[0].children) {
            throw new Error('Expected nested scope structure with children property');
        }
        return vars[0].children;
    },

    // Safe extraction that handles both
    safe: (vars: any[]): any[] => {
        if (!vars || vars.length === 0) return [];

        // If the first element has a 'children' property, use it
        if (vars[0] && 'children' in vars[0]) {
            return vars[0].children || [];
        }

        // Otherwise return the array as-is
        return vars;
    }
};

/**
 * Find a variable by name in a list of variables
 */
export function findVariable(
    variables: any[],
    name: string,
    matcher: (varName: string, expectedName: string) => boolean = variableMatchers.exact
): any | undefined {
    return variables.find(v => matcher(v.name, name));
}

/**
 * Validate a variable has expected value
 */
export function validateVariable(
    variables: any[],
    expectedName: string,
    expectedValue: string,
    matcher: (varName: string, expectedName: string) => boolean = variableMatchers.exact
): boolean {
    const variable = findVariable(variables, expectedName, matcher);
    if (!variable) {
        console.log(`❌ Variable '${expectedName}' not found`);
        return false;
    }

    if (variable.value !== expectedValue) {
        console.log(`❌ Variable '${expectedName}' has value '${variable.value}', expected '${expectedValue}'`);
        return false;
    }

    console.log(`✅ Variable '${expectedName}' = '${expectedValue}'`);
    return true;
}

/**
 * Find breakpoint line markers in a file
 */
export async function findBreakpointLine(
    filePath: string,
    marker: string = 'VSCB_BREAKPOINT_NEXT_LINE'
): Promise<number> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(marker)) {
            // Return the next line number (1-indexed)
            return i + 2;
        }
    }

    throw new Error(`Marker '${marker}' not found in file ${filePath}`);
}

/**
 * Find secondary breakpoint line marker in a file
 */
export async function findBreakpoint2Line(
    filePath: string,
    marker: string = 'VSCB_BREAKPOINT_2_NEXT_LINE'
): Promise<number> {
    return findBreakpointLine(filePath, marker);
}