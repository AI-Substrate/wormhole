import * as vscode from 'vscode';
import { ILogger } from '../types';

export interface LoggerOptions {
    includeTimestamp?: boolean;
    minLevel?: 'debug' | 'info' | 'warn' | 'error';
    maxMessageLength?: number;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Enhanced logger that provides consistent formatting and automatic context.
 * Wraps VS Code's OutputChannel with additional features.
 */
export class EnhancedLogger implements ILogger {
    private readonly levelPriority: Record<LogLevel, number> = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    };

    constructor(
        private readonly outputChannel: vscode.OutputChannel,
        private readonly scriptName: string,
        private readonly options: LoggerOptions = {}
    ) {
        this.options.minLevel = this.options.minLevel || 'debug';
        this.options.maxMessageLength = this.options.maxMessageLength || 500;
    }

    /**
     * Log an info message.
     * @param message The message to log
     * @param args Additional arguments to include
     */
    info(message: string, ...args: any[]): void {
        this.log('info', message, args);
    }

    /**
     * Log an error message and show the output channel.
     * @param message The error message
     * @param error Optional error object with stack trace
     */
    error(message: string, error?: Error | any): void {
        this.log('error', message);

        // Include error details if provided
        if (error) {
            const errorDetails = error instanceof Error
                ? `${error.message}\n${error.stack || ''}`
                : typeof error === 'object'
                    ? this.safeStringify(error)
                    : String(error);
            this.outputChannel.appendLine(`  ${errorDetails}`);
        }

        // Show channel on error
        this.outputChannel.show(true);
    }

    /**
     * Log a debug message with optional data.
     * @param message The debug message
     * @param data Optional data to include
     */
    debug(message: string, data?: any): void {
        if (data !== undefined) {
            const dataStr = this.safeStringify(data);
            this.log('debug', `${message} ${dataStr}`);
        } else {
            this.log('debug', message);
        }
    }

    /**
     * Log a warning message.
     * @param message The warning message
     */
    warn(message: string): void {
        this.log('warn', message);
    }

    /**
     * Core logging method that handles formatting and filtering.
     */
    private log(level: LogLevel, message: string | null | undefined, additionalArgs: any[] = []): void {
        // Check if level should be logged
        const minPriority = this.levelPriority[this.options.minLevel || 'debug'];
        const currentPriority = this.levelPriority[level];
        if (currentPriority < minPriority) {
            return;
        }

        // Handle null/undefined messages
        if (message === null || message === undefined) {
            message = '(empty message)';
        }

        // Combine message with additional arguments
        if (additionalArgs.length > 0) {
            const argsStr = additionalArgs
                .map(arg => typeof arg === 'string' ? arg : this.safeStringify(arg))
                .join(' ');
            message = `${message} ${argsStr}`;
        }

        // Truncate very long messages
        if (message.length > (this.options.maxMessageLength || 500)) {
            message = message.substring(0, this.options.maxMessageLength) + '...';
        }

        // Format the complete log message
        const formattedMessage = this.formatMessage(level, message);
        this.outputChannel.appendLine(formattedMessage);
    }

    /**
     * Format a log message with timestamp and prefixes.
     */
    private formatMessage(level: LogLevel, message: string): string {
        const parts: string[] = [];

        // Add timestamp if configured
        if (this.options.includeTimestamp) {
            const now = new Date();
            const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            parts.push(`[${time}]`);
        }

        // Add script name
        parts.push(`[${this.scriptName}]`);

        // Add log level
        parts.push(`[${level.toUpperCase()}]`);

        // Add message
        parts.push(message);

        return parts.join(' ');
    }

    /**
     * Safely stringify an object, handling circular references.
     */
    private safeStringify(obj: any): string {
        try {
            const seen = new WeakSet();
            return JSON.stringify(obj, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) {
                        return '[Circular]';
                    }
                    seen.add(value);
                }
                return value;
            });
        } catch (error) {
            return '[Unable to stringify]';
        }
    }

    /**
     * Clear the output channel.
     */
    clear(): void {
        this.outputChannel.clear();
    }

    /**
     * Show the output channel.
     * @param preserveFocus Whether to preserve focus on the current editor
     */
    show(preserveFocus: boolean = false): void {
        this.outputChannel.show(preserveFocus);
    }
}