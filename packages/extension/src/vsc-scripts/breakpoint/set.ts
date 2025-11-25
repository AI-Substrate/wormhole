import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { ActionScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';
import * as vscode from 'vscode';

/**
 * Set breakpoint action script
 * Supports conditions, hit conditions, and log messages
 */
@RegisterScript('breakpoint.set')
export class SetBreakpointScript extends ActionScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            path: z.string().min(1),
            line: z.coerce.number().int().min(1), // CLI passes strings, use coerce
            condition: z.string().optional(),
            hitCondition: z.string().optional(),
            logMessage: z.string().optional()
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        const vscodeApi = bridgeContext.vscode;

        // Resolve relative path to absolute (supports workspace-relative paths)
        let resolvedPath = params.path;
        if (!path.isAbsolute(params.path)) {
            const workspace = vscodeApi.workspace.workspaceFolders?.[0];
            if (!workspace) {
                return ScriptResult.failure(
                    `Cannot resolve relative path "${params.path}": No workspace folder open`,
                    ErrorCode.E_INVALID_PATH,
                    { path: params.path }
                );
            }
            resolvedPath = path.resolve(workspace.uri.fsPath, params.path);
        }

        // Validate file exists
        if (!fs.existsSync(resolvedPath)) {
            return ScriptResult.failure(
                `File not found: ${params.path}` +
                (resolvedPath !== params.path ? ` (resolved to: ${resolvedPath})` : ''),
                ErrorCode.E_FILE_NOT_FOUND,
                { path: params.path, resolvedPath }
            );
        }

        // Validate line number is reasonable (must be positive)
        if (!params.line || params.line < 1) {
            return ScriptResult.failure(
                `Line number must be a positive integer (1 or greater), got ${params.line}`,
                ErrorCode.E_INVALID_LINE,
                { line: params.line }
            );
        }

        // Check if line number is within file bounds (optional but helpful)
        try {
            const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
            const lineCount = fileContent.split('\n').length;

            if (params.line > lineCount) {
                // VS Code allows setting breakpoints beyond EOF, but warn the user
                console.log(`[bp.set] Warning: Line ${params.line} is beyond end of file (${lineCount} lines)`);
                // Still allow it as VS Code handles this gracefully
            }
        } catch (err: any) {
            // If we can't read the file, just proceed - VS Code will handle it
            console.error(`[bp.set] Could not verify line bounds: ${err.message}`);
        }

        // Create source breakpoint
        const uri = vscodeApi.Uri.file(resolvedPath);
        const position = new vscodeApi.Position(params.line - 1, 0); // VS Code uses 0-indexed lines
        const location = new vscodeApi.Location(uri, position);

        // Create the breakpoint with all optional properties
        const sourceBreakpoint = new vscodeApi.SourceBreakpoint(
            location,
            true, // enabled
            params.condition, // condition (optional)
            params.hitCondition, // hit condition (optional)
            params.logMessage // log message (optional)
        );

        // Add the breakpoint
        vscodeApi.debug.addBreakpoints([sourceBreakpoint]);

        // Log to output channel
        if (bridgeContext.outputChannel) {
            let message = `[bp.set] Added breakpoint at ${params.path}:${params.line}`;
            if (params.condition) message += ` with condition: ${params.condition}`;
            if (params.hitCondition) message += ` with hit condition: ${params.hitCondition}`;
            if (params.logMessage) message += ` with log message: ${params.logMessage}`;
            bridgeContext.outputChannel.appendLine(message);
        }

        // Return success with breakpoint details
        return ScriptResult.success({
            breakpoint: {
                path: params.path,
                line: params.line,
                condition: params.condition,
                hitCondition: params.hitCondition,
                logMessage: params.logMessage,
                enabled: true,
                verified: true
            }
        });
    }
}

export default SetBreakpointScript;
