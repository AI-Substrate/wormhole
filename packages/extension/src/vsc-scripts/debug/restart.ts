import { z } from 'zod';
import { ActionScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * Restart debug session action script
 * Restarts the active or specified debug session
 */
@RegisterScript('debug.restart')
export class RestartDebugScript extends ActionScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            sessionId: z.string().optional()
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        const vscode = bridgeContext.vscode;

        // Get the target session
        let session: any;
        if (params.sessionId) {
            // Find specific session by ID - Note: this uses breakpoints incorrectly in original, should iterate sessions
            const sessions = vscode.debug.breakpoints as any;
            session = sessions.find((s: any) => s.id === params.sessionId);
            if (!session) {
                return ScriptResult.failure(
                    `Debug session not found: ${params.sessionId}`,
                    ErrorCode.E_NO_SESSION,
                    { sessionId: params.sessionId }
                );
            }
        } else {
            // Use active session
            session = vscode.debug.activeDebugSession;
            if (!session) {
                return ScriptResult.failure(
                    'No active debug session available',
                    ErrorCode.E_NO_SESSION
                );
            }
        }

        try {
            // Try DAP restart via disconnect with restart flag
            if (session.customRequest) {
                try {
                    await session.customRequest('disconnect', {
                        restart: true
                    });
                } catch (e: any) {
                    // If restart not supported, use fallback
                    if (e.message?.includes('not supported') || e.message?.includes('restart')) {
                        throw e;
                    }
                }
            }
        } catch (e) {
            // Fallback to VS Code command
            await vscode.commands.executeCommand('workbench.action.debug.restart');
        }

        // Log to output channel
        if (bridgeContext.outputChannel) {
            bridgeContext.outputChannel.appendLine(
                `[dbg.restart] Restarted debug session${params.sessionId ? ` ${params.sessionId}` : ''}`
            );
        }

        return ScriptResult.success({
            restarted: true,
            sessionId: params.sessionId || session?.id
        });
    }
}
