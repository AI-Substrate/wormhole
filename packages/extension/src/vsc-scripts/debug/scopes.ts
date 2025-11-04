import { z } from 'zod';
import { QueryScript, RegisterScript } from '@script-base';
import type { IBridgeContext } from '../../core/bridge-context/types';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/response/errorTaxonomy';

/**
 * List scopes query script
 * Returns available scopes for a given frame
 */
@RegisterScript('debug.scopes')
export class ScopesScript extends QueryScript<any> {
    constructor() {
        super();
        this.paramsSchema = z.object({
            frameId: z.coerce.number().int().min(0),
            sessionId: z.string().optional()
        });
    }

    async execute(bridgeContext: IBridgeContext, params: any): Promise<any> {
        const vscode = bridgeContext.vscode;

        // Get the target session
        let session: any;
        if (params.sessionId) {
            // Find specific session by ID
            const sessions = vscode.debug.breakpoints as any;
            session = sessions.find((s: any) => s.id === params.sessionId);
            if (!session) {
                return ScriptResult.failure(
                    `Session ${params.sessionId} not found`,
                    ErrorCode.E_NO_SESSION
                );
            }
        } else {
            // Use active session
            session = vscode.debug.activeDebugSession;
            if (!session) {
                return ScriptResult.failure(
                    'No active debug session',
                    ErrorCode.E_NO_SESSION
                );
            }
        }

        try {
            // Use DAP scopes request
            const response = await session.customRequest('scopes', {
                frameId: params.frameId
            });

            const scopes = response.body?.scopes || response.scopes || [];

            // Log to output channel
            if (bridgeContext.outputChannel) {
                bridgeContext.outputChannel.appendLine(
                    `[dbg.scopes] Retrieved ${scopes.length} scope(s) for frame ${params.frameId}`
                );
            }

            return ScriptResult.success({
                scopes: scopes.map((scope: any) => ({
                    name: scope.name,
                    variablesReference: scope.variablesReference,
                    expensive: scope.expensive || false,
                    namedVariables: scope.namedVariables,
                    indexedVariables: scope.indexedVariables
                }))
            });
        } catch (e: any) {
            return ScriptResult.failure(
                `Failed to get scopes: ${e.message}`,
                ErrorCode.E_INTERNAL
            );
        }
    }
}
