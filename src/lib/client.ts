
// Response envelope types matching the extension
export type SuccessEnvelope<T = any> = {
  ok: true;
  type: 'success' | 'pending' | 'progress' | 'event';
  data: T;
  meta?: {
    requestId: string;
    mode: 'normal' | 'danger';
    operation?: string;
    duration?: number;
    timestamp?: string;
  };
};

export type ErrorEnvelope = {
  ok: false;
  type: 'error';
  error: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    requestId: string;
    mode: 'normal' | 'danger';
    operation?: string;
    duration?: number;
    timestamp?: string;
  };
};

export type Envelope<T = any> = SuccessEnvelope<T> | ErrorEnvelope;


/**
 * Helper to check if response is successful
 */
export function isSuccess<T>(envelope: Envelope<T>): envelope is SuccessEnvelope<T> {
  return envelope.ok === true;
}

/**
 * Helper to check if response is an error
 */
export function isError(envelope: Envelope): envelope is ErrorEnvelope {
  return envelope.ok === false;
}