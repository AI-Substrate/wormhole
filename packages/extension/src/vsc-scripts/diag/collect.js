const { z } = require('zod');
const os = require('os');

// Dynamic loading - scripts are loaded from src but base classes are compiled to out
const { QueryScript, ActionScript, WaitableScript, ScriptResult } = require('@script-base');
const { ErrorCode } = require('@core/response/errorTaxonomy');

/**
 * @typedef {any} ScriptContext
 */

/**
 * Collect diagnostics query script
 * Collects system, extension, and debug session diagnostics
 */
class CollectDiagnosticsScript extends QueryScript {
    constructor() {
        super();
        this.paramsSchema = z.object({
            path: z.string().optional()
        });
    }

    /**
     * @param {any} bridgeContext
     * @param {{path?: string}} params
     * @returns {Promise<{success: boolean, data?: any, reason?: string}>}
     */
    async execute(bridgeContext, params) {
        try {
            const vscode = bridgeContext.vscode;

            // Collect VS Code diagnostics
            const diagnosticCollection = vscode.languages.getDiagnostics();
            let diagnostics = [];

            if (params.path) {
                // Get diagnostics for specific file
                const uri = vscode.Uri.file(params.path);
                const fileDiagnostics = vscode.languages.getDiagnostics(uri);
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
                vscodeVersion: vscode.version,
                extensionVersion: vscode.extensions.getExtension('AI-Substrate.vsc-bridge-extension')?.packageJSON?.version || 'dev',
                platform: os.platform(),
                arch: os.arch(),
                nodeVersion: process.version,
                mode: bridgeContext.mode || 'normal'
            };

            // Collect debug session info
            const activeSession = vscode.debug.activeDebugSession;
            const debugInfo = {
                hasActiveSession: !!activeSession,
                sessionId: activeSession?.id,
                sessionName: activeSession?.name,
                sessionType: activeSession?.type,
                breakpointCount: vscode.debug.breakpoints.length
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
        } catch (error) {
            return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
        }
    }

    getSeverityName(severity) {
        switch (severity) {
            case 0: return 'error';
            case 1: return 'warning';
            case 2: return 'info';
            case 3: return 'hint';
            default: return 'unknown';
        }
    }
}

module.exports = { CollectDiagnosticsScript };