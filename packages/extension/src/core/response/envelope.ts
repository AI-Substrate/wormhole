/**
 * Unified JSON response envelope for all surfaces (HTTP, CLI, MCP)
 */

export type ResponseStatus = 'ok' | 'error';
export type ResponseType = 'result' | 'event' | 'progress' | 'pending';
export type ResponseMode = 'normal' | 'danger';

export interface ResponseMeta {
    requestId: string;
    mode: ResponseMode;
    scriptName?: string;
    startedAt: string;
    durationMs: number;
}

export interface ResponseError {
    code: string;
    message: string;
    details?: unknown;
}

/**
 * Editor context captured at time of script execution
 * Provides spatial awareness of user's current code location
 */
export interface EditorContext {
    file: {
        path: string;
        languageId: string;
        lineCount: number;
        isDirty: boolean;
    };
    cursor: {
        line: number;  // 1-indexed
        character: number;  // 1-indexed
    };
    selection: {
        isEmpty: boolean;
        text?: string;
        range?: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
    };
    symbols: {
        totalInDocument: number;
        containingScopes: Array<{
            name: string;
            kind: number;
            range: {
                start: { line: number; character: number };
                end: { line: number; character: number };
            };
        }>;
        immediateScope: string | null;
        scopeHierarchy: string;
        warning?: string;
        scopesOmitted?: number;
    };
}

export interface ResponseEnvelope<T = unknown> {
    ok: boolean;
    status: ResponseStatus;
    type: ResponseType;
    data?: T;
    error?: ResponseError;
    meta: ResponseMeta;
    editorContext?: EditorContext;
}

/**
 * Create a successful result envelope
 */
export function ok<T>(data: T | undefined, meta: ResponseMeta): ResponseEnvelope<T> {
    return {
        ok: true,
        status: 'ok',
        type: 'result',
        data,
        meta
    };
}

/**
 * Create an error result envelope
 */
export function fail(
    code: string,
    message: string,
    details: unknown | undefined,
    meta: ResponseMeta
): ResponseEnvelope<undefined> {
    return {
        ok: false,
        status: 'error',
        type: 'result',
        error: {
            code,
            message,
            details
        },
        meta
    };
}

/**
 * Create a progress envelope (for long-running operations)
 */
export function progress<T>(data: T, meta: ResponseMeta): ResponseEnvelope<T> {
    return {
        ok: true,
        status: 'ok',
        type: 'progress',
        data,
        meta
    };
}

/**
 * Create an event envelope (for async notifications)
 */
export function event<T>(data: T, meta: ResponseMeta): ResponseEnvelope<T> {
    return {
        ok: true,
        status: 'ok',
        type: 'event',
        data,
        meta
    };
}

/**
 * Create a pending envelope (for operations that have started but not completed)
 */
export function pending<T>(data: T, meta: ResponseMeta): ResponseEnvelope<T> {
    return {
        ok: true,
        status: 'ok',
        type: 'pending',
        data,
        meta
    };
}