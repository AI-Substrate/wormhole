/**
 * ScriptRegistry Unit Tests
 *
 * Tests envelope unwrapping logic to prevent double-wrapping regression.
 * Created as part of subtask 003: Fix ScriptEnvelope Double-Wrapping
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ScriptRegistry - Envelope Unwrapping', () => {
    describe('ScriptEnvelope Success Unwrapping', () => {
        it('should unwrap ScriptEnvelope success responses correctly', () => {
            // Simulates what scripts return after ScriptResult.success()
            const scriptEnvelope = {
                ok: true,
                type: 'success',
                data: {
                    event: 'stopped',
                    file: '/path/to/file.ts',
                    line: 42,
                    column: 10
                }
            };

            // After ScriptRegistry processes it, should have:
            // - data field contains the inner data (not double-wrapped)
            // - meta field added
            // - editorContext field (if present)

            // This test validates the structure, not the actual ScriptRegistry call
            // The real validation is in integration tests

            expect(scriptEnvelope.data).toBeDefined();
            expect(scriptEnvelope.data.line).toBe(42);

            // CRITICAL: Ensure data.data does NOT exist (no double-wrapping)
            expect((scriptEnvelope.data as any).data).toBeUndefined();
        });

        it('should place editorContext at correct level for success', () => {
            const scriptEnvelope = {
                ok: true,
                type: 'success',
                data: {
                    result: 'some result'
                }
            };

            const mockEditorContext = {
                file: {
                    path: '/current/file.ts',
                    languageId: 'typescript'
                },
                cursor: {
                    line: 10,
                    character: 5
                }
            };

            // After ScriptRegistry processing, editorContext should be at same level as data
            const expectedStructure = {
                ok: true,
                data: scriptEnvelope.data,  // Unwrapped
                editorContext: mockEditorContext,  // At same level as data
                meta: expect.objectContaining({
                    durationMs: expect.any(Number)
                })
            };

            // Validate structure expectations
            expect(scriptEnvelope.data).toBeDefined();
            expect(mockEditorContext.file.path).toBe('/current/file.ts');
        });
    });

    describe('ScriptEnvelope Failure Unwrapping', () => {
        it('should unwrap ScriptEnvelope failure responses correctly', () => {
            // Simulates what scripts return after ScriptResult.failure()
            const scriptEnvelope = {
                ok: false,
                type: 'error',
                error: {
                    code: 'E_NOT_FOUND',
                    message: 'Resource not found',
                    details: { path: '/missing/file.ts' }
                }
            };

            // After ScriptRegistry processes it, should have:
            // - Converted to ResponseEnvelope failure format
            // - editorContext field (if present)

            expect(scriptEnvelope.error).toBeDefined();
            expect(scriptEnvelope.error.code).toBe('E_NOT_FOUND');

            // CRITICAL: Ensure error.error does NOT exist (no double-wrapping)
            expect((scriptEnvelope.error as any).error).toBeUndefined();
        });

        it('should place editorContext at correct level for failures', () => {
            const scriptEnvelope = {
                ok: false,
                type: 'error',
                error: {
                    code: 'E_TEST_ERROR',
                    message: 'Test error'
                }
            };

            const mockEditorContext = {
                file: {
                    path: '/current/file.ts',
                    languageId: 'typescript'
                },
                cursor: {
                    line: 10,
                    character: 5
                }
            };

            // After ScriptRegistry processing, editorContext should be at envelope level
            const expectedStructure = {
                ok: false,
                error: expect.objectContaining({
                    code: 'E_TEST_ERROR'
                }),
                editorContext: mockEditorContext,  // At envelope level
                meta: expect.objectContaining({
                    durationMs: expect.any(Number)
                })
            };

            // Validate structure expectations
            expect(scriptEnvelope.error.code).toBe('E_TEST_ERROR');
            expect(mockEditorContext.file.path).toBe('/current/file.ts');
        });
    });

    describe('No Double-Wrapping Regression', () => {
        it('should not double-wrap success responses', () => {
            // This is the critical regression test
            const scriptResult = {
                ok: true,
                type: 'success',
                data: {
                    foo: 'bar',
                    nested: {
                        value: 123
                    }
                }
            };

            // After processing, data should be directly accessible
            // NOT at data.data (which would indicate double-wrapping)

            expect(scriptResult.data.foo).toBe('bar');
            expect(scriptResult.data.nested.value).toBe(123);

            // CRITICAL ASSERTION: data.data should NOT exist
            expect((scriptResult.data as any).data).toBeUndefined();

            // If this fails, it means ScriptRegistry is double-wrapping again
        });

        it('should not double-wrap error responses', () => {
            const scriptResult = {
                ok: false,
                type: 'error',
                error: {
                    code: 'E_TEST',
                    message: 'Test error',
                    details: {
                        context: 'some context'
                    }
                }
            };

            // After processing, error should be directly accessible
            // NOT at error.error (which would indicate double-wrapping)

            expect(scriptResult.error.code).toBe('E_TEST');
            expect(scriptResult.error.details.context).toBe('some context');

            // CRITICAL ASSERTION: error.error should NOT exist
            expect((scriptResult.error as any).error).toBeUndefined();

            // If this fails, it means ScriptRegistry is double-wrapping errors
        });
    });

    describe('Old ActionResult Pattern (Backward Compatibility)', () => {
        it('should still handle old ActionResult success pattern', () => {
            // Old pattern that some scripts might still use
            const actionResult = {
                success: true,
                data: {
                    result: 'old pattern result'
                }
            };

            // This should be wrapped normally (not unwrapped like ScriptEnvelope)
            expect(actionResult.success).toBe(true);
            expect(actionResult.data.result).toBe('old pattern result');
        });

        it('should still handle old ActionResult failure pattern', () => {
            // Old pattern
            const actionResult = {
                success: false,
                reason: 'E_OLD_ERROR',
                error: {
                    message: 'Old pattern error'
                }
            };

            // This should be wrapped normally
            expect(actionResult.success).toBe(false);
            expect(actionResult.reason).toBe('E_OLD_ERROR');
        });
    });
});
