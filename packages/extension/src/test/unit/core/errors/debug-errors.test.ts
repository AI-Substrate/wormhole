/**
 * Automated Tests for Debug Error Codes
 *
 * TDD Approach: These tests are written FIRST to validate the error module behavior.
 * They test the actual compiled/transpiled module, not mock implementations.
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
    DebugErrorCode,
    createDebugError,
    createCustomDebugError,
    createLargeDataError,
    createUnsupportedLanguageError,
    formatDebugError,
    isDebuggerStateError,
    isReferenceError,
    getSupportedDebuggerTypes
} from '../../../../core/errors/debug-errors';

describe('DebugErrorCode enum', () => {
    it('all error codes are defined', () => {
        expect(DebugErrorCode.E_NO_SESSION).to.equal('E_NO_SESSION');
        expect(DebugErrorCode.E_NOT_PAUSED).to.equal('E_NOT_PAUSED');
        expect(DebugErrorCode.E_NOT_STOPPED).to.equal('E_NOT_STOPPED');
        expect(DebugErrorCode.E_INVALID_PARAMS).to.equal('E_INVALID_PARAMS');
        expect(DebugErrorCode.E_MISSING_REQUIRED_PARAM).to.equal('E_MISSING_REQUIRED_PARAM');
        expect(DebugErrorCode.E_LARGE_DATA).to.equal('E_LARGE_DATA');
        expect(DebugErrorCode.E_MEMORY_BUDGET_EXCEEDED).to.equal('E_MEMORY_BUDGET_EXCEEDED');
        expect(DebugErrorCode.E_UNSUPPORTED_LANGUAGE).to.equal('E_UNSUPPORTED_LANGUAGE');
        expect(DebugErrorCode.E_NOT_IMPLEMENTED).to.equal('E_NOT_IMPLEMENTED');
        expect(DebugErrorCode.E_NO_THREADS).to.equal('E_NO_THREADS');
        expect(DebugErrorCode.E_NO_STACK).to.equal('E_NO_STACK');
        expect(DebugErrorCode.E_NO_FRAMES).to.equal('E_NO_FRAMES');
        expect(DebugErrorCode.E_INVALID_REFERENCE).to.equal('E_INVALID_REFERENCE');
        expect(DebugErrorCode.E_STALE_REFERENCE).to.equal('E_STALE_REFERENCE');
        expect(DebugErrorCode.E_MODIFICATION_FAILED).to.equal('E_MODIFICATION_FAILED');
        expect(DebugErrorCode.E_READ_ONLY).to.equal('E_READ_ONLY');
        expect(DebugErrorCode.E_UNSUPPORTED_OPERATION).to.equal('E_UNSUPPORTED_OPERATION');
        expect(DebugErrorCode.E_EVALUATE_FAILED).to.equal('E_EVALUATE_FAILED');
        expect(DebugErrorCode.E_NOT_EXPANDABLE).to.equal('E_NOT_EXPANDABLE');
        expect(DebugErrorCode.E_UNKNOWN).to.equal('E_UNKNOWN');
        expect(DebugErrorCode.E_INTERNAL).to.equal('E_INTERNAL');
    });
});

describe('createDebugError', () => {
    describe('Session Errors', () => {
        it('E_NO_SESSION has actionable hint about starting debugger', () => {
            const error = createDebugError(DebugErrorCode.E_NO_SESSION);
            expect(error.code).to.equal(DebugErrorCode.E_NO_SESSION);
            expect(error.message).to.match(/No active debug session/i);
            expect(error.hint).to.match(/Start debugging with F5/i);
        });

        it('E_NOT_PAUSED explains breakpoint requirement', () => {
            const error = createDebugError(DebugErrorCode.E_NOT_PAUSED);
            expect(error.code).to.equal(DebugErrorCode.E_NOT_PAUSED);
            expect(error.message).to.match(/not paused/i);
            expect(error.hint).to.match(/Set a breakpoint/i);
        });

        it('E_NOT_STOPPED clarifies DAP stopped state', () => {
            const error = createDebugError(DebugErrorCode.E_NOT_STOPPED);
            expect(error.code).to.equal(DebugErrorCode.E_NOT_STOPPED);
            expect(error.message).to.match(/stopped|paused/i);
            expect(error.hint).to.be.ok;
        });
    });

    describe('Parameter Errors', () => {
        it('E_INVALID_PARAMS provides parameter guidance', () => {
            const error = createDebugError(DebugErrorCode.E_INVALID_PARAMS);
            expect(error.message).to.match(/Invalid parameters/i);
            expect(error.hint).to.match(/parameter requirements/i);
        });

        it('E_MISSING_REQUIRED_PARAM directs to documentation', () => {
            const error = createDebugError(DebugErrorCode.E_MISSING_REQUIRED_PARAM);
            expect(error.message).to.match(/Required parameter/i);
            expect(error.hint).to.match(/documentation/i);
        });
    });

    describe('Data Size Errors', () => {
        it('E_LARGE_DATA suggests streaming alternative', () => {
            const error = createDebugError(DebugErrorCode.E_LARGE_DATA);
            expect(error.message).to.match(/exceeds.*threshold/i);
            expect(error.hint).to.match(/debug\.stream-variables/i);
        });

        it('E_MEMORY_BUDGET_EXCEEDED suggests depth reduction', () => {
            const error = createDebugError(DebugErrorCode.E_MEMORY_BUDGET_EXCEEDED);
            expect(error.message).to.match(/Memory budget exceeded/i);
            expect(error.hint).to.match(/depth|stream-variables/i);
        });
    });

    describe('Language Support Errors', () => {
        it('E_UNSUPPORTED_LANGUAGE lists supported debuggers', () => {
            const error = createDebugError(DebugErrorCode.E_UNSUPPORTED_LANGUAGE);
            expect(error.message).to.match(/not supported/i);
            expect(error.hint).to.match(/pwa-node|debugpy|dlv-dap/i);
        });

        it('E_NOT_IMPLEMENTED clarifies Node.js only support', () => {
            const error = createDebugError(DebugErrorCode.E_NOT_IMPLEMENTED);
            expect(error.message).to.match(/not.*implemented/i);
            expect(error.hint).to.match(/Node\.js/i);
        });
    });

    describe('DAP Operation Errors', () => {
        it('E_NO_THREADS explains thread requirement', () => {
            const error = createDebugError(DebugErrorCode.E_NO_THREADS);
            expect(error.message).to.match(/No threads/i);
            expect(error.hint).to.match(/paused.*active threads/i);
        });

        it('E_INVALID_REFERENCE suggests using list-variables', () => {
            const error = createDebugError(DebugErrorCode.E_INVALID_REFERENCE);
            expect(error.message).to.match(/Invalid.*reference/i);
            expect(error.hint).to.match(/debug\.list-variables/i);
        });

        it('E_STALE_REFERENCE explains reference lifecycle', () => {
            const error = createDebugError(DebugErrorCode.E_STALE_REFERENCE);
            expect(error.message).to.match(/no longer valid|resumed/i);
            expect(error.hint).to.match(/only valid while.*paused/i);
        });
    });

    it('createDebugError with detail includes it in error object', () => {
        const error = createDebugError(DebugErrorCode.E_INTERNAL, 'Stack trace here');
        expect(error.detail).to.equal('Stack trace here');
    });
});

describe('createLargeDataError', () => {
    it('formats sub-MB sizes as KB (not 0MB)', () => {
        // 512 KB should show as "512KB" not "0MB"
        const error = createLargeDataError(999, 512 * 1024);
        expect(error.code).to.equal(DebugErrorCode.E_LARGE_DATA);
        expect(error.message).to.match(/512\s?KB/i);
        expect(error.message).to.not.match(/0\s?MB/i);
    });

    it('formats MB sizes with 2 decimal places', () => {
        // 6 MB should show as "6.00MB"
        const error = createLargeDataError(25000, 6 * 1024 * 1024);
        expect(error.message).to.match(/6\.00\s?MB/i);
    });

    it('includes node count in message', () => {
        const error = createLargeDataError(25000, 6 * 1024 * 1024);
        expect(error.message).to.match(/25,?000\s+nodes/i);
    });

    it('suggests streaming in detail', () => {
        const error = createLargeDataError(25000, 6 * 1024 * 1024);
        expect(error.detail).to.match(/debug\.stream-variables/i);
    });
});

describe('createUnsupportedLanguageError', () => {
    it('includes session type in message', () => {
        const error = createUnsupportedLanguageError('my-custom-debugger');
        expect(error.code).to.equal(DebugErrorCode.E_UNSUPPORTED_LANGUAGE);
        expect(error.message).to.match(/my-custom-debugger/);
    });

    it('lists supported types in detail', () => {
        const error = createUnsupportedLanguageError('custom');
        expect(error.detail).to.match(/pwa-node.*debugpy.*dlv-dap/i);
    });
});

describe('formatDebugError', () => {
    it('includes error code in brackets', () => {
        const error = createDebugError(DebugErrorCode.E_NO_SESSION);
        const formatted = formatDebugError(error);
        expect(formatted).to.match(/\[E_NO_SESSION\]/);
    });

    it('includes message', () => {
        const error = createDebugError(DebugErrorCode.E_NO_SESSION);
        const formatted = formatDebugError(error);
        expect(formatted).to.match(/No active debug session/);
    });

    it('includes hint with emoji', () => {
        const error = createDebugError(DebugErrorCode.E_NO_SESSION);
        const formatted = formatDebugError(error);
        expect(formatted).to.match(/💡.*Hint:/);
        expect(formatted).to.match(/Start debugging/);
    });

    it('includes detail if provided', () => {
        const error = createDebugError(DebugErrorCode.E_INTERNAL, 'Additional context');
        const formatted = formatDebugError(error);
        expect(formatted).to.match(/📋.*Detail:/);
        expect(formatted).to.match(/Additional context/);
    });

    it('omits detail section if not provided', () => {
        const error = createDebugError(DebugErrorCode.E_NO_SESSION);
        const formatted = formatDebugError(error);
        expect(formatted).to.not.match(/📋.*Detail:/);
    });
});

describe('isDebuggerStateError', () => {
    it('returns true for session state errors', () => {
        expect(isDebuggerStateError(createDebugError(DebugErrorCode.E_NO_SESSION))).to.equal(true);
        expect(isDebuggerStateError(createDebugError(DebugErrorCode.E_NOT_PAUSED))).to.equal(true);
        expect(isDebuggerStateError(createDebugError(DebugErrorCode.E_NOT_STOPPED))).to.equal(true);
    });

    it('returns true for DAP state errors', () => {
        expect(isDebuggerStateError(createDebugError(DebugErrorCode.E_NO_THREADS))).to.equal(true);
        expect(isDebuggerStateError(createDebugError(DebugErrorCode.E_NO_STACK))).to.equal(true);
        expect(isDebuggerStateError(createDebugError(DebugErrorCode.E_NO_FRAMES))).to.equal(true);
    });

    it('returns false for non-state errors', () => {
        expect(isDebuggerStateError(createDebugError(DebugErrorCode.E_INVALID_PARAMS))).to.equal(false);
        expect(isDebuggerStateError(createDebugError(DebugErrorCode.E_LARGE_DATA))).to.equal(false);
        expect(isDebuggerStateError(createDebugError(DebugErrorCode.E_READ_ONLY))).to.equal(false);
    });
});

describe('isReferenceError', () => {
    it('returns true for reference errors', () => {
        expect(isReferenceError(createDebugError(DebugErrorCode.E_INVALID_REFERENCE))).to.equal(true);
        expect(isReferenceError(createDebugError(DebugErrorCode.E_STALE_REFERENCE))).to.equal(true);
    });

    it('returns false for non-reference errors', () => {
        expect(isReferenceError(createDebugError(DebugErrorCode.E_NO_SESSION))).to.equal(false);
        expect(isReferenceError(createDebugError(DebugErrorCode.E_INVALID_PARAMS))).to.equal(false);
        expect(isReferenceError(createDebugError(DebugErrorCode.E_LARGE_DATA))).to.equal(false);
    });
});

describe('getSupportedDebuggerTypes', () => {
    it('returns array of supported debugger types', () => {
        const types = getSupportedDebuggerTypes();
        expect(Array.isArray(types)).to.equal(true);
        expect(types.length).to.be.greaterThan(0);
    });

    it('includes expected debugger types', () => {
        const types = getSupportedDebuggerTypes();
        expect(types).to.include('pwa-node');
        expect(types).to.include('debugpy');
        expect(types).to.include('dlv-dap');
        expect(types).to.include('coreclr');
        expect(types).to.include('dart');
    });
});

describe('createCustomDebugError', () => {
    it('allows custom message with standard hint', () => {
        const error = createCustomDebugError(
            DebugErrorCode.E_LARGE_DATA,
            'Custom message about size',
            'Custom detail'
        );
        expect(error.code).to.equal(DebugErrorCode.E_LARGE_DATA);
        expect(error.message).to.equal('Custom message about size');
        expect(error.detail).to.equal('Custom detail');
        // Should still have standard hint from template
        expect(error.hint).to.match(/stream-variables/i);
    });
});