/**
 * Adapter Factory
 *
 * Creates appropriate debug adapters based on session type.
 * Implements language detection via session.type property.
 *
 * Critical Discovery 04: Language Detection via Session Type
 * - Auto-detect adapter from session.type
 * - Return E_UNSUPPORTED_LANGUAGE for unknown types
 */

import * as vscode from 'vscode';
import { IDebugAdapter } from './interfaces';
import {
    IDebugError,
    DebugErrorCode,
    createUnsupportedLanguageError,
    getSupportedDebuggerTypes
} from '../errors/debug-errors';
import { BaseDebugAdapter } from './adapters/BaseDebugAdapter';
import { ChromeDebugAdapter } from './adapters/chrome-adapter';
import { CoreClrDebugAdapter } from './adapters/coreclr-adapter';
import { DartDebugAdapter } from './adapters/dart-adapter';
import { DebugpyAdapter } from './adapters/debugpy-adapter';
import { JavaDebugAdapter } from './adapters/java-adapter';
import { NodeDebugAdapter } from './adapters/node-adapter';

/**
 * Adapter constructor type
 */
type AdapterConstructor = new (session: vscode.DebugSession) => IDebugAdapter;

/**
 * Factory for creating language-specific debug adapters
 * Per Subtask 001 ST014: Supports custom mappings with priority ordering
 */
export class AdapterFactory {
    // Default adapter type mappings (built-in)
    private supportedTypes: Map<string, AdapterConstructor> = new Map();

    // Custom adapter type mappings (user-defined, higher priority)
    // Per Subtask 001 ST014: Allow overriding default mappings
    private customMappings: Map<string, AdapterConstructor> = new Map();

    constructor() {
        // Register supported adapter types

        // Phase 3: Node.js adapter
        this.registerAdapter('pwa-node', NodeDebugAdapter);
        this.registerAdapter('node', NodeDebugAdapter); // Legacy node debugger

        // Phase 4: C# .NET CoreCLR adapter (Subtask 006)
        this.registerAdapter('coreclr', CoreClrDebugAdapter);

        // Python debugpy adapter
        this.registerAdapter('debugpy', DebugpyAdapter);

        // Java adapter
        this.registerAdapter('java', JavaDebugAdapter);

        // Chrome/Chromium adapter (pwa-chrome)
        this.registerAdapter('pwa-chrome', ChromeDebugAdapter);

        // Dart adapter (Plan 19: Dart and Flutter Debugging Support)
        this.registerAdapter('dart', DartDebugAdapter);

        // Phase 5 will add stubs for: dlv-dap
    }

    /**
     * Register a default adapter type (built-in adapters)
     * @param sessionType Debug session type (e.g., 'pwa-node', 'debugpy')
     * @param constructor Adapter constructor
     */
    registerAdapter(sessionType: string, constructor: AdapterConstructor): void {
        this.supportedTypes.set(sessionType, constructor);
    }

    /**
     * Register a custom adapter mapping (overrides defaults)
     * Per Subtask 001 ST014: Public API for custom language mappings
     * @param sessionType Debug session type to map
     * @param constructor Adapter constructor
     */
    registerMapping(sessionType: string, constructor: AdapterConstructor): void {
        this.customMappings.set(sessionType, constructor);
    }

    /**
     * Check if a session type is supported (checks both custom and default mappings)
     * @param sessionType Debug session type
     */
    isSupported(sessionType: string): boolean {
        return this.customMappings.has(sessionType) || this.supportedTypes.has(sessionType);
    }

    /**
     * Get list of supported debugger types (includes both custom and default)
     */
    getSupportedTypes(): string[] {
        const customTypes = Array.from(this.customMappings.keys());
        const defaultTypes = Array.from(this.supportedTypes.keys());
        // Return unique types (custom takes precedence)
        return Array.from(new Set([...customTypes, ...defaultTypes]));
    }

    /**
     * Create adapter for a debug session
     * Per Critical Discovery 04: Auto-detect from session.type
     * Per Subtask 001 ST014: Uses priority ordering for detection
     *
     * @param session Active debug session
     * @returns Adapter instance or error if unsupported
     */
    createAdapter(session: vscode.DebugSession): IDebugAdapter | IDebugError {
        const sessionType = this.detectSessionType(session);

        // Priority 1: Check custom mappings first (user-defined overrides)
        let AdapterClass = this.customMappings.get(sessionType);

        // Priority 2: Check default mappings if no custom mapping found
        if (!AdapterClass) {
            AdapterClass = this.supportedTypes.get(sessionType);
        }

        if (!AdapterClass) {
            // Return unsupported language error with helpful message
            return createUnsupportedLanguageError(sessionType);
        }

        // Create and return the adapter
        try {
            return new AdapterClass(session);
        } catch (error) {
            // If adapter construction fails, return internal error
            return {
                code: DebugErrorCode.E_INTERNAL,
                message: `Failed to create adapter for ${sessionType}`,
                detail: error instanceof Error ? error.message : String(error),
                hint: 'This may be a bug. Check the VS Code output panel for details'
            };
        }
    }

    /**
     * Detect session type from debug session
     * Per Critical Discovery 04: Use session.type property
     * Per Subtask 001 ST014: Enhanced with config.debuggerType fallback
     *
     * Priority ordering:
     * 1. Check if session.type has a custom mapping → use it
     * 2. Check if session.configuration.debuggerType has a custom mapping → use it
     * 3. Check if session.type has a default mapping → use it
     * 4. Return session.type as-is (will trigger E_UNSUPPORTED_LANGUAGE)
     *
     * @param session Debug session
     * @returns Session type string
     */
    private detectSessionType(session: vscode.DebugSession): string {
        // Priority 1: Check session.type with custom mapping
        if (this.customMappings.has(session.type)) {
            return session.type;
        }

        // Priority 2: Check session.configuration.debuggerType with custom mapping
        const configType = session.configuration?.debuggerType;
        if (configType && this.customMappings.has(configType)) {
            return configType;
        }

        // Priority 3: Check session.type with default mapping
        if (this.supportedTypes.has(session.type)) {
            return session.type;
        }

        // Priority 4: Return session.type (will trigger unsupported error)
        // The session.type property contains the debugger type
        // Examples: 'pwa-node', 'node', 'debugpy', 'dlv-dap', 'netcoredbg', 'dart'
        return session.type;
    }
}
