/**
 * Runtime Inspection Service
 *
 * Central coordinator for debug session management and adapter lifecycle.
 * Singleton service that manages active debug sessions and their adapters.
 */

import * as vscode from 'vscode';
import { IDebugAdapter } from './interfaces';
import { AdapterFactory } from './AdapterFactory';
import {
    IDebugError,
    DebugErrorCode,
    createDebugError
} from '../errors/debug-errors';

/**
 * Singleton service for managing debug adapters
 */
export class RuntimeInspectionService {
    private static instance: RuntimeInspectionService | null = null;

    private sessions: Map<string, vscode.DebugSession> = new Map();
    private adapters: Map<string, IDebugAdapter> = new Map();
    private factory: AdapterFactory;
    private disposables: vscode.Disposable[] = [];

    /**
     * Private constructor for singleton pattern
     */
    private constructor() {
        this.factory = new AdapterFactory();
        this.setupSessionListeners();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): RuntimeInspectionService {
        if (!RuntimeInspectionService.instance) {
            RuntimeInspectionService.instance = new RuntimeInspectionService();
        }
        return RuntimeInspectionService.instance;
    }

    /**
     * Setup listeners for debug session lifecycle
     */
    private setupSessionListeners(): void {
        // Listen for session start
        this.disposables.push(
            vscode.debug.onDidStartDebugSession((session) => {
                this.registerSession(session);
            })
        );

        // Listen for session termination
        this.disposables.push(
            vscode.debug.onDidTerminateDebugSession((session) => {
                this.unregisterSession(session.id);
            })
        );

        // Listen for state changes (to handle resume/pause events)
        // This is important for clearing caches per Critical Discovery 02
        // Note: VS Code doesn't have a direct "onDidChangeState" event,
        // so we rely on adapters to handle this internally or clear manually
    }

    /**
     * Register a debug session
     * @param session Debug session to register
     */
    public registerSession(session: vscode.DebugSession): void {
        this.sessions.set(session.id, session);
    }

    /**
     * Unregister a debug session and dispose its adapter
     * @param sessionId Session ID to unregister
     */
    public unregisterSession(sessionId: string): void {
        // Dispose adapter if exists
        this.disposeAdapter(sessionId);

        // Remove session
        this.sessions.delete(sessionId);
    }

    /**
     * Get adapter for a session (creates if doesn't exist)
     * @param sessionId Session ID (if not provided, uses active session)
     * @returns Adapter or error if session not found or unsupported
     */
    public getAdapter(sessionId?: string): IDebugAdapter | IDebugError {
        // Determine which session to use
        let session: vscode.DebugSession | undefined;

        if (sessionId) {
            session = this.sessions.get(sessionId);
            if (!session) {
                // Session ID provided but not found
                return createDebugError(
                    DebugErrorCode.E_NO_SESSION,
                    `Session ${sessionId} not found`
                );
            }
        } else {
            // Use active debug session
            session = vscode.debug.activeDebugSession;
            if (!session) {
                return createDebugError(DebugErrorCode.E_NO_SESSION);
            }
        }

        // Check if we already have an adapter for this session
        if (this.adapters.has(session.id)) {
            return this.adapters.get(session.id)!;
        }

        // Create new adapter
        const adapterOrError = this.factory.createAdapter(session);

        // If error, return it
        if ('code' in adapterOrError) {
            return adapterOrError as IDebugError;
        }

        // Cache the adapter
        const adapter = adapterOrError as IDebugAdapter;
        this.adapters.set(session.id, adapter);

        return adapter;
    }

    /**
     * Dispose adapter for a session
     * @param sessionId Session ID
     */
    public disposeAdapter(sessionId: string): void {
        const adapter = this.adapters.get(sessionId);
        if (adapter) {
            adapter.dispose();
            this.adapters.delete(sessionId);
        }
    }

    /**
     * Dispose all adapters
     */
    public disposeAll(): void {
        for (const [sessionId, adapter] of this.adapters) {
            adapter.dispose();
        }
        this.adapters.clear();
        this.sessions.clear();

        // Dispose event listeners
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }

    /**
     * Get the adapter factory (for registering adapters)
     */
    public getFactory(): AdapterFactory {
        return this.factory;
    }

    /**
     * Get all active session IDs
     */
    public getActiveSessions(): string[] {
        return Array.from(this.sessions.keys());
    }

    /**
     * Check if a session is active
     */
    public hasSession(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }
}
