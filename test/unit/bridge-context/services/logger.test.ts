import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedLogger } from '../../../../extension/src/core/bridge-context/services/EnhancedLogger';

describe('EnhancedLogger', () => {
    let logger: EnhancedLogger;
    let outputChannel: {
        appendLine: ReturnType<typeof vi.fn>;
        show: ReturnType<typeof vi.fn>;
        clear: ReturnType<typeof vi.fn>;
        dispose: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        outputChannel = {
            appendLine: vi.fn(),
            show: vi.fn(),
            clear: vi.fn(),
            dispose: vi.fn()
        };
        logger = new EnhancedLogger(outputChannel as any, 'test.script');
    });

    describe('log levels', () => {
        it('should prefix info messages with script name', () => {
            logger.info('Test message');
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[test.script]')
            );
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[INFO]')
            );
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Test message')
            );
        });

        it('should handle error messages with stack traces', () => {
            const error = new Error('Something failed');
            logger.error('Operation failed', error);

            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[ERROR]')
            );
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Operation failed')
            );
            // Second call should include error details
            expect(outputChannel.appendLine).toHaveBeenCalledTimes(2);
            const secondCall = outputChannel.appendLine.mock.calls[1][0];
            expect(secondCall).toContain('Something failed');
        });

        it('should show channel on error', () => {
            logger.error('Critical error');
            expect(outputChannel.show).toHaveBeenCalled();
        });

        it('should handle null/undefined gracefully', () => {
            expect(() => logger.info(null as any)).not.toThrow();
            expect(() => logger.info(undefined as any)).not.toThrow();
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('(empty message)')
            );
        });

        it('should format debug messages with data', () => {
            const data = { foo: 'bar', count: 42 };
            logger.debug('Debug info', data);

            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[DEBUG]')
            );
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Debug info')
            );
            // Should include JSON representation of data
            const call = outputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('{"foo":"bar","count":42}');
        });

        it('should format warning messages', () => {
            logger.warn('This is a warning');
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[WARN]')
            );
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('This is a warning')
            );
        });
    });

    describe('timestamp option', () => {
        it('should include timestamps when configured', () => {
            logger = new EnhancedLogger(outputChannel as any, 'test.script', {
                includeTimestamp: true
            });
            logger.debug('Debug message');

            const call = outputChannel.appendLine.mock.calls[0][0];
            // Check for time format HH:MM:SS
            expect(call).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
        });

        it('should not include timestamps by default', () => {
            logger.info('Test message');
            const call = outputChannel.appendLine.mock.calls[0][0];
            // Should not have time format
            expect(call).not.toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
        });
    });

    describe('log level filtering', () => {
        it('should respect minimum log level', () => {
            logger = new EnhancedLogger(outputChannel as any, 'test.script', {
                minLevel: 'warn'
            });

            logger.debug('Debug message');
            logger.info('Info message');
            logger.warn('Warning message');
            logger.error('Error message');

            // Only warn and error should be logged
            expect(outputChannel.appendLine).toHaveBeenCalledTimes(2);
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Warning message')
            );
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Error message')
            );
        });
    });

    describe('special formatting', () => {
        it('should handle circular references in data', () => {
            const circular: any = { name: 'test' };
            circular.self = circular;

            expect(() => logger.debug('Circular data', circular)).not.toThrow();
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[Circular]')
            );
        });

        it('should truncate very long messages', () => {
            const longMessage = 'x'.repeat(1000);
            logger.info(longMessage);

            const call = outputChannel.appendLine.mock.calls[0][0];
            expect(call.length).toBeLessThan(600); // Should be truncated
            expect(call).toContain('...');
        });

        it('should handle multiple arguments', () => {
            logger.info('User', 'logged in', 'successfully');
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('User logged in successfully')
            );
        });
    });
});