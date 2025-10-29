import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { DebugService } from '../../../../extension/src/core/bridge-context/services/DebugService';

// Mock VS Code debug API
vi.mock('vscode', () => ({
    debug: {
        activeDebugSession: undefined,
        breakpoints: [],
        onDidStartDebugSession: vi.fn(),
        onDidTerminateDebugSession: vi.fn(),
    }
}));

describe('DebugService', () => {
    let service: DebugService;

    beforeEach(() => {
        service = new DebugService();
        // Reset mock state
        (vscode.debug as any).activeDebugSession = undefined;
    });

    describe('getSession', () => {
        it('should return session by ID when it exists', () => {
            const mockSession = {
                id: 'session-123',
                name: 'Test Debug',
                type: 'node',
                workspaceFolder: undefined,
                configuration: {},
                customRequest: vi.fn(),
                getDebugProtocolBreakpoint: vi.fn()
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const result = service.getSession('session-123');
            expect(result).toBe(mockSession);
        });

        it('should return undefined when session ID does not match', () => {
            const mockSession = {
                id: 'session-456',
                name: 'Different Session'
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const result = service.getSession('session-123');
            expect(result).toBeUndefined();
        });

        it('should return active session when no ID provided', () => {
            const activeSession = {
                id: 'active',
                name: 'Active Debug'
            };
            (vscode.debug as any).activeDebugSession = activeSession;

            const result = service.getSession();
            expect(result).toBe(activeSession);
        });

        it('should return undefined when no sessions exist', () => {
            (vscode.debug as any).activeDebugSession = undefined;

            const result = service.getSession();
            expect(result).toBeUndefined();
        });

        it('should handle null session gracefully', () => {
            (vscode.debug as any).activeDebugSession = null;

            const result = service.getSession();
            expect(result).toBeUndefined();
        });
    });

    describe('isActive', () => {
        it('should return true when debug session is active', () => {
            (vscode.debug as any).activeDebugSession = { id: 'any' };
            expect(service.isActive()).toBe(true);
        });

        it('should return false when no debug session', () => {
            (vscode.debug as any).activeDebugSession = undefined;
            expect(service.isActive()).toBe(false);
        });

        it('should return false when session is null', () => {
            (vscode.debug as any).activeDebugSession = null;
            expect(service.isActive()).toBe(false);
        });
    });

    describe('getAllSessions', () => {
        it('should return array with active session when present', () => {
            const mockSession = { id: 'test', name: 'Test' };
            (vscode.debug as any).activeDebugSession = mockSession;

            const sessions = service.getAllSessions();
            expect(sessions).toHaveLength(1);
            expect(sessions[0]).toBe(mockSession);
        });

        it('should return empty array when no active session', () => {
            (vscode.debug as any).activeDebugSession = undefined;

            const sessions = service.getAllSessions();
            expect(sessions).toHaveLength(0);
        });
    });

    describe('stopSession', () => {
        it('should stop the specified session', async () => {
            const mockStopDebugging = vi.fn().mockResolvedValue(undefined);
            (vscode.debug as any).stopDebugging = mockStopDebugging;

            const mockSession = { id: 'test-123', name: 'Test' };
            await service.stopSession(mockSession as any);

            expect(mockStopDebugging).toHaveBeenCalledWith(mockSession);
        });

        it('should handle undefined session gracefully', async () => {
            const mockStopDebugging = vi.fn();
            (vscode.debug as any).stopDebugging = mockStopDebugging;

            await service.stopSession(undefined);
            expect(mockStopDebugging).not.toHaveBeenCalled();
        });
    });
});