import { ResponseEnvelope, ResponseMeta } from './envelope';

/**
 * Serialize a response envelope to JSON string
 */
export function serializeEnvelope(envelope: ResponseEnvelope): string {
    return JSON.stringify(envelope, null, 2);
}

/**
 * Create default meta fields with timing
 */
export function createMeta(
    requestId: string,
    mode: 'normal' | 'danger',
    scriptName?: string,
    startedAt?: string
): ResponseMeta {
    return {
        requestId,
        mode,
        scriptName,
        startedAt: startedAt || new Date().toISOString(),
        durationMs: 0
    };
}

/**
 * Update meta with duration based on start time
 */
export function updateMetaDuration(meta: ResponseMeta): ResponseMeta {
    const startTime = new Date(meta.startedAt).getTime();
    const now = Date.now();
    return {
        ...meta,
        durationMs: now - startTime
    };
}

/**
 * Check if an object is a valid response envelope
 */
export function isResponseEnvelope(obj: unknown): obj is ResponseEnvelope {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    const envelope = obj as any;

    // Check required fields
    if (typeof envelope.ok !== 'boolean') return false;
    if (!['ok', 'error'].includes(envelope.status)) return false;
    if (!['result', 'event', 'progress', 'pending'].includes(envelope.type)) return false;
    if (!envelope.meta || typeof envelope.meta !== 'object') return false;

    // Check meta fields
    const meta = envelope.meta;
    if (typeof meta.requestId !== 'string') return false;
    if (!['normal', 'danger'].includes(meta.mode)) return false;
    if (typeof meta.startedAt !== 'string') return false;
    if (typeof meta.durationMs !== 'number') return false;

    // Check error field if status is error
    if (envelope.status === 'error') {
        if (!envelope.error || typeof envelope.error !== 'object') return false;
        if (typeof envelope.error.code !== 'string') return false;
        if (typeof envelope.error.message !== 'string') return false;
    }

    return true;
}