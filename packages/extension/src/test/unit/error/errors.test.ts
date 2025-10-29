import { describe, it } from 'mocha';
import * as assert from 'assert';
import {
    StructuredError,
    createError,
    isStructuredError,
    toEnvelope
} from '../../../core/error/errors';
import { ErrorCode, ErrorMessages, ErrorHttpStatus } from '../../../core/response/errorTaxonomy';

describe('Structured Errors', () => {
    describe('StructuredError', () => {
        it('should create error with code and message', () => {
            const error = new StructuredError(
                ErrorCode.E_SCRIPT_NOT_FOUND,
                'Script not found'
            );

            assert.strictEqual(error.code, ErrorCode.E_SCRIPT_NOT_FOUND);
            assert.strictEqual(error.message, 'Script not found');
            assert.strictEqual(error.httpStatus, ErrorHttpStatus[ErrorCode.E_SCRIPT_NOT_FOUND]);
        });

        it('should include details when provided', () => {
            const details = { script: 'test.script', reason: 'File missing' };
            const error = new StructuredError(
                ErrorCode.E_INTERNAL,
                'Internal error',
                details
            );

            assert.deepStrictEqual(error.details, details);
        });

        it('should use default message when not provided', () => {
            const error = new StructuredError(ErrorCode.E_TIMEOUT);

            assert.strictEqual(error.message, ErrorMessages[ErrorCode.E_TIMEOUT]);
        });

        it('should serialize to JSON correctly', () => {
            const error = new StructuredError(
                ErrorCode.E_INVALID_PARAMS,
                'Invalid parameters',
                { field: 'test' }
            );

            const json = error.toJSON();

            assert.strictEqual(json.code, ErrorCode.E_INVALID_PARAMS);
            assert.strictEqual(json.message, 'Invalid parameters');
            assert.deepStrictEqual(json.details, { field: 'test' });
            assert.strictEqual(json.httpStatus, 400);
        });
    });

    describe('createError', () => {
        it('should create error with factory function', () => {
            const error = createError(
                ErrorCode.E_DANGER_MODE_REQUIRED,
                'Danger mode is required'
            );

            assert.ok(error instanceof StructuredError);
            assert.strictEqual(error.code, ErrorCode.E_DANGER_MODE_REQUIRED);
        });

        it('should use default message when not provided', () => {
            const error = createError(ErrorCode.E_NO_SESSION);

            assert.strictEqual(error.message, ErrorMessages[ErrorCode.E_NO_SESSION]);
        });
    });

    describe('isStructuredError', () => {
        it('should identify StructuredError instances', () => {
            const structuredError = new StructuredError(ErrorCode.E_ABORTED);
            const regularError = new Error('Regular error');

            assert.strictEqual(isStructuredError(structuredError), true);
            assert.strictEqual(isStructuredError(regularError), false);
        });

        it('should handle null and undefined', () => {
            assert.strictEqual(isStructuredError(null), false);
            assert.strictEqual(isStructuredError(undefined), false);
        });
    });

    describe('toEnvelope', () => {
        it('should convert error to response envelope', () => {
            const error = new StructuredError(
                ErrorCode.E_FILE_NOT_FOUND,
                'File not found',
                { path: '/test.js' }
            );

            const meta = {
                requestId: 'test-500',
                mode: 'normal' as const,
                startedAt: new Date().toISOString(),
                durationMs: 10
            };

            const envelope = toEnvelope(error, meta);

            assert.strictEqual(envelope.ok, false);
            assert.strictEqual(envelope.status, 'error');
            assert.strictEqual(envelope.error?.code, ErrorCode.E_FILE_NOT_FOUND);
            assert.strictEqual(envelope.error?.message, 'File not found');
            assert.deepStrictEqual(envelope.error?.details, { path: '/test.js' });
        });

        it('should handle regular errors', () => {
            const error = new Error('Regular error message');

            const meta = {
                requestId: 'test-501',
                mode: 'danger' as const,
                startedAt: new Date().toISOString(),
                durationMs: 5
            };

            const envelope = toEnvelope(error, meta);

            assert.strictEqual(envelope.ok, false);
            assert.strictEqual(envelope.status, 'error');
            assert.strictEqual(envelope.error?.code, ErrorCode.E_INTERNAL);
            assert.strictEqual(envelope.error?.message, 'Regular error message');
        });
    });

    describe('Error factories', () => {
        it('should have convenience methods for common errors', () => {
            const errors = {
                invalidParams: createError(
                    ErrorCode.E_INVALID_PARAMS,
                    undefined,
                    { field: 'test' }
                ),
                timeout: createError(ErrorCode.E_TIMEOUT),
                scriptNotFound: createError(
                    ErrorCode.E_SCRIPT_NOT_FOUND,
                    undefined,
                    { alias: 'test.script' }
                ),
                dangerModeRequired: createError(ErrorCode.E_DANGER_MODE_REQUIRED)
            };

            assert.strictEqual(errors.invalidParams.code, ErrorCode.E_INVALID_PARAMS);
            assert.strictEqual(errors.timeout.code, ErrorCode.E_TIMEOUT);
            assert.strictEqual(errors.scriptNotFound.code, ErrorCode.E_SCRIPT_NOT_FOUND);
            assert.strictEqual(errors.dangerModeRequired.code, ErrorCode.E_DANGER_MODE_REQUIRED);
        });
    });
});