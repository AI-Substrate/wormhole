import { z } from 'zod';
import * as os from 'os';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';
import * as vscode from 'vscode';

/**
 * Collect diagnostics query script
 * Collects system, extension, and debug session diagnostics
 */
@RegisterScript('diag.collect')
export class CollectDiagnosticsScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            path: z.string().optional()
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        try {
            const vscodeApi = bridgeContext.vscode;

            // Collect VS Code diagnostics
            const diagnosticCollection = vscodeApi.languages.getDiagnostics();
            let diagnostics: any[] = [];

            if (params.path) {
                // Get diagnostics for specific file
                const uri = vscodeApi.Uri.file(params.path);
                const fileDiagnostics = vscodeApi.languages.getDiagnostics(uri);
                diagnostics = fileDiagnostics.map(d => ({
                    file: params.path,
                    line: d.range.start.line + 1, // Convert to 1-indexed
                    column: d.range.start.character,
                    message: d.message,
                    severity: this.getSeverityName(d.severity),
                    code: d.code,
                    source: d.source
                }));
            } else {
                // Get all workspace diagnostics
                for (const [uri, fileDiagnostics] of diagnosticCollection) {
                    const filePath = uri.fsPath;
                    for (const d of fileDiagnostics) {
                        diagnostics.push({
                            file: filePath,
                            line: d.range.start.line + 1, // Convert to 1-indexed
                            column: d.range.start.character,
                            message: d.message,
                            severity: this.getSeverityName(d.severity),
                            code: d.code,
                            source: d.source
                        });
                    }
                }
            }

            // Collect system info
            const systemInfo = {
                vscodeVersion: vscodeApi.version,
                extensionVersion: vscodeApi.extensions.getExtension('AI-Substrate.vsc-bridge-extension')?.packageJSON?.version || 'dev',
                platform: os.platform(),
                arch: os.arch(),
                nodeVersion: process.version,
                mode: bridgeContext.mode || 'normal'
            };

            // Collect debug session info
            const activeSession = vscodeApi.debug.activeDebugSession;
            const debugInfo = {
                hasActiveSession: !!activeSession,
                sessionId: activeSession?.id,
                sessionName: activeSession?.name,
                sessionType: activeSession?.type,
                breakpointCount: vscodeApi.debug.breakpoints.length
            };

            // Log to output channel
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[diag.collect] Collected ${diagnostics.length} diagnostic(s)${params.path ? ` for ${params.path}` : ' workspace-wide'}`
                );
            }

            return ScriptResult.success({
                diagnostics,
                system: systemInfo,
                debug: debugInfo,
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }

    getSeverityName(severity: vscode.DiagnosticSeverity): string {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error: return 'error';
            case vscode.DiagnosticSeverity.Warning: return 'warning';
            case vscode.DiagnosticSeverity.Information: return 'info';
            case vscode.DiagnosticSeverity.Hint: return 'hint';
            default: return 'unknown';
        }
    }
}

export default CollectDiagnosticsScript;
