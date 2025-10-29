import * as vscode from 'vscode';
import { IDebugService } from '../types';

/**
 * Debug service that provides simplified access to VS Code's debug API.
 * This is a thin wrapper that eliminates common boilerplate code.
 */
export class DebugService implements IDebugService {
    /**
     * Get a debug session by ID or return the active session.
     * @param sessionId Optional session ID to find
     * @returns The debug session or undefined if not found
     */
    getSession(sessionId?: string): vscode.DebugSession | undefined {
        const activeSession = vscode.debug.activeDebugSession;

        if (!sessionId) {
            return activeSession || undefined;
        }

        // Check if active session matches the requested ID
        if (activeSession?.id === sessionId) {
            return activeSession;
        }

        // In VS Code API, there's no direct way to get all sessions,
        // so we return undefined if the active session doesn't match
        return undefined;
    }

    /**
     * Check if any debug session is currently active.
     * @returns True if a debug session is active, false otherwise
     */
    isActive(): boolean {
        return vscode.debug.activeDebugSession !== undefined &&
               vscode.debug.activeDebugSession !== null;
    }

    /**
     * Get all active debug sessions.
     * Note: VS Code API only exposes the active session, not all sessions.
     * @returns Array containing the active session if present
     */
    getAllSessions(): vscode.DebugSession[] {
        const active = vscode.debug.activeDebugSession;
        return active ? [active] : [];
    }

    /**
     * Stop a specific debug session.
     * @param session The session to stop
     */
    async stopSession(session?: vscode.DebugSession): Promise<void> {
        if (session) {
            await vscode.debug.stopDebugging(session);
        }
    }

    /**
     * Start a new debug session.
     * @param folder The workspace folder to debug in
     * @param config The debug configuration
     * @returns The started debug session or undefined if failed
     */
    async startSession(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration
    ): Promise<vscode.DebugSession | undefined> {
        const success = await vscode.debug.startDebugging(folder, config);
        if (success) {
            // Return the newly active session
            return vscode.debug.activeDebugSession;
        }
        return undefined;
    }

    /**
     * Get breakpoints for a specific file or all breakpoints.
     * @param uri Optional file URI to filter breakpoints
     * @returns Array of breakpoints
     */
    getBreakpoints(uri?: vscode.Uri): readonly vscode.Breakpoint[] {
        const allBreakpoints = vscode.debug.breakpoints;

        if (!uri) {
            return allBreakpoints;
        }

        // Filter breakpoints for specific file
        return allBreakpoints.filter(bp => {
            // Type guard for SourceBreakpoint
            if ('location' in bp && bp.location) {
                const sourceBreakpoint = bp as vscode.SourceBreakpoint;
                return sourceBreakpoint.location.uri.toString() === uri.toString();
            }
            return false;
        });
    }
}