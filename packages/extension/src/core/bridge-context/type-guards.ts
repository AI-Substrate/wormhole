/**
 * Type guard functions for VS Code API objects
 * These can be used as an alternative to instanceof checks,
 * especially when crossing execution context boundaries
 */

import * as vscode from 'vscode';

/**
 * Type guards for different breakpoint types
 */
export const typeGuards = {
    /**
     * Check if a breakpoint is a SourceBreakpoint
     */
    isSourceBreakpoint(bp: vscode.Breakpoint): bp is vscode.SourceBreakpoint {
        return bp && 'location' in bp &&
               (bp as any).location &&
               'uri' in (bp as any).location &&
               'range' in (bp as any).location;
    },

    /**
     * Check if a breakpoint is a FunctionBreakpoint
     */
    isFunctionBreakpoint(bp: vscode.Breakpoint): bp is vscode.FunctionBreakpoint {
        return bp && 'functionName' in bp && typeof (bp as any).functionName === 'string';
    },

    /**
     * Check if a breakpoint is a DataBreakpoint
     */
    isDataBreakpoint(bp: vscode.Breakpoint): boolean {
        return bp && 'dataId' in bp && typeof (bp as any).dataId === 'string';
    },

    /**
     * Check if a breakpoint is an ExceptionBreakpoint
     * (Note: VS Code doesn't have a specific class for exception breakpoints,
     * they're just breakpoints that aren't one of the other types)
     */
    isExceptionBreakpoint(bp: vscode.Breakpoint): boolean {
        return bp &&
               !this.isSourceBreakpoint(bp) &&
               !this.isFunctionBreakpoint(bp) &&
               !this.isDataBreakpoint(bp);
    }
};

/**
 * Export individual guards for convenience
 */
export const isSourceBreakpoint = typeGuards.isSourceBreakpoint;
export const isFunctionBreakpoint = typeGuards.isFunctionBreakpoint;
export const isDataBreakpoint = typeGuards.isDataBreakpoint;
export const isExceptionBreakpoint = typeGuards.isExceptionBreakpoint;