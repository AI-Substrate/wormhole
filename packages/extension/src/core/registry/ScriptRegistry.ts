import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ScriptBase } from '../scripts/base';
import { ScriptManifest, ManifestEntry, ScriptMetadata } from '../discovery/types';
import { ResponseEnvelope, ok, fail } from '../response/envelope';
import { ErrorCode, ErrorMessages } from '../response/errorTaxonomy';
import { createMeta, updateMetaDuration } from '../response/serialize';
import { loadModuleFromDisk } from './dynamicLoader';
import { scriptSchemas, safeValidateScriptParams } from '../../vsc-scripts/generated/schemas';
import { BridgeContext, BridgeContextFactory, withContext } from '../bridge-context';
import { typeGuards } from '../bridge-context/type-guards';
import { EditorContextProvider } from '../context/EditorContextProvider';
import { ITelemetry, scrubPII } from '../telemetry';

// Using ESM dynamic imports with webpackIgnore comment to load scripts at runtime.
// This bypasses webpack's module system and allows loading scripts from disk.
// The webpackIgnore comment prevents webpack from trying to bundle these modules.

/**
 * Registry for managing and executing scripts
 */
export class ScriptRegistry {
    private scripts: Map<string, ScriptBase> = new Map();
    private manifests: Map<string, ManifestEntry> = new Map();
    private extensionContext: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private telemetry?: ITelemetry;

    constructor(extensionContext: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, telemetry?: ITelemetry) {
        this.extensionContext = extensionContext;
        this.outputChannel = outputChannel;
        this.telemetry = telemetry;
    }

    /**
     * Log script execution details to output channel
     */
    private logScriptExecution(
        alias: string,
        params: unknown,
        isDynamic: boolean,
        scriptPath?: string
    ): void {
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('='.repeat(60));
        if (isDynamic) {
            this.outputChannel.appendLine(`🎯 DYNAMIC SCRIPT EXECUTION`);
            if (scriptPath) {
                this.outputChannel.appendLine(`📄 File: ${scriptPath}`);
            }
        } else {
            this.outputChannel.appendLine(`🎯 SCRIPT EXECUTION`);
            this.outputChannel.appendLine(`📝 Alias: ${alias}`);
        }
        this.outputChannel.appendLine(`📦 Parameters:`);
        if (params && typeof params === 'object' && Object.keys(params).length > 0) {
            for (const [key, value] of Object.entries(params)) {
                this.outputChannel.appendLine(`   ${key}: ${JSON.stringify(value)}`);
            }
        } else {
            this.outputChannel.appendLine(`   (none)`);
        }
        this.outputChannel.appendLine('='.repeat(60));
        this.outputChannel.appendLine('');
    }

    /**
     * Discover and load scripts from manifest
     */
    async discover(manifestPath: string): Promise<void> {
        // Check if manifest exists
        if (!fs.existsSync(manifestPath)) {
            throw new Error(`Manifest not found: ${manifestPath}`);
        }

        // Load manifest
        const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
        const manifest: ScriptManifest = JSON.parse(manifestContent);

        console.log(`[ScriptRegistry] 📦 Loading ${Object.keys(manifest.scripts).length} scripts from manifest at ${new Date().toISOString()}`);
        console.log(`[ScriptRegistry] Manifest path: ${manifestPath}`);

        // Clear existing scripts
        const previousCount = this.scripts.size;
        if (previousCount > 0) {
            console.log(`[ScriptRegistry] Clearing ${previousCount} previously loaded scripts`);
        }
        this.scripts.clear();
        this.manifests.clear();

        // Load each script
        for (const [alias, entry] of Object.entries(manifest.scripts)) {
            try {
                await this.loadScript(alias, entry, path.dirname(manifestPath));
            } catch (error: any) {
                console.error(`[ScriptRegistry] Failed to load script ${alias}: ${error.message}`);
            }
        }

        console.log(`[ScriptRegistry] ✅ Successfully loaded ${this.scripts.size} scripts at ${new Date().toISOString()}`);
    }

    /**
     * Load a single script
     */
    private async loadScript(alias: string, entry: ManifestEntry, baseDir: string): Promise<void> {
        const scriptPath = path.join(baseDir, entry.scriptRelPath);

        // Check if script file exists
        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Script file not found: ${scriptPath}`);
        }

        // Use cross-platform dynamic loader (works on macOS, Linux, WSL, Windows)
        const module = await loadModuleFromDisk(scriptPath);

        // Find the exported script class
        // We need to check if it's a subclass of ScriptBase in a way that works
        // even when modules are loaded from different paths
        let ScriptClass: any;

        // Check all exports for a class that looks like a ScriptBase subclass
        for (const exportName of Object.keys(module)) {
            const exported = module[exportName];
            if (typeof exported === 'function' && exported.prototype) {
                // Check if it has the expected ScriptBase methods/properties
                // This is more reliable than instanceof when dealing with module loading issues
                const proto = exported.prototype;
                if (proto.execute && (proto.constructor.name.includes('Script') ||
                    proto.constructor.name.includes('ActionScript') ||
                    proto.constructor.name.includes('QueryScript') ||
                    proto.constructor.name.includes('WaitableScript') ||
                    proto.constructor.name.includes('StreamScript'))) {
                    ScriptClass = exported;
                    break;
                }
            }
        }

        if (!ScriptClass) {
            // Try default export with same checks
            if (module.default && typeof module.default === 'function' && module.default.prototype) {
                const proto = module.default.prototype;
                if (proto.execute && proto.constructor.name.includes('Script')) {
                    ScriptClass = module.default;
                }
            }

            if (!ScriptClass) {
                // Log what we found for debugging
                console.error(`[ScriptRegistry] No script class found in ${scriptPath}. Module exports:`, Object.keys(module));
                throw new Error(`No ScriptBase class found in ${scriptPath}`);
            }
        }

        // Instantiate the script
        const script = new ScriptClass();

        // Attach metadata
        script.metadata = entry.metadata;

        // Register the script
        this.scripts.set(alias, script);
        this.manifests.set(alias, entry);

        console.log(`[ScriptRegistry]   ✔ Loaded script: ${alias} from ${scriptPath}`);
    }



    /**
     * Execute script with BridgeContext as first parameter
     */
    private async executeScript(
        script: any,
        params: unknown,
        requestId: string,
        mode: 'normal' | 'danger',
        signal?: AbortSignal,
        alias?: string
    ): Promise<any> {
        if (!this.extensionContext) {
            throw new Error('Extension context not initialized');
        }

        // Create BridgeContext for this execution with request metadata
        // Pass shared outputChannel for dependency injection
        const bridgeContext = BridgeContextFactory.create(this.extensionContext, {
            outputChannel: this.outputChannel,
            signal,
            mode
        } as any);

        // Set request metadata for logging correlation
        bridgeContext.setRequestMetadata({
            requestId,
            mode,
            alias
        });

        // Execute within AsyncLocalStorage context for proper isolation
        return withContext(bridgeContext, async () => {
            // All scripts now use: (bridgeContext, params)
            if (script.wait) {
                // WaitableScript
                return await script.wait(bridgeContext, params);
            } else {
                // Regular script
                return await script.execute(bridgeContext, params);
            }
        });
    }

    /**
     * Create a virtual script object from dynamic script content
     * This allows dynamic scripts to use the same execution pipeline as regular scripts
     */
    private async createDynamicScript(scriptContent: string): Promise<any> {
        const { loadDynamicModule } = await import('../dynamic/loadDynamicModule');
        const vscode = await import('vscode');
        
        try {
            // Pass extensionRoot for proper require anchoring
            // This allows dynamic scripts to require extension modules from the out/ directory
            const extensionRoot = this.extensionContext?.extensionPath;
            const moduleExports = loadDynamicModule(scriptContent, vscode, extensionRoot);
            
            // Create a virtual script object that matches the ScriptBase interface
            const virtualScript = {
                // The execute method will be called by executeScript with (bridgeContext, params)
                execute: async (bridgeContext: any, params: any) => {
                    // Add extensionRoot to bridgeContext for scripts to use in paths
                    bridgeContext.extensionRoot = extensionRoot;
                    
                    // Handle different export patterns
                    if (typeof moduleExports === 'function') {
                        // Direct function export
                        return await moduleExports(bridgeContext, params);
                    } else if (moduleExports.execute && typeof moduleExports.execute === 'function') {
                        // Object with execute method
                        return await moduleExports.execute(bridgeContext, params);
                    } else {
                        throw new Error('Dynamic script must export a function or object with execute method');
                    }
                },
                
                // Add metadata if provided
                metadata: moduleExports.meta || moduleExports.metadata || {
                    name: 'dynamic-script',
                    description: 'Dynamically loaded script'
                }
            };
            
            return virtualScript;
        } catch (error: any) {
            throw new Error(`Failed to load dynamic script: ${error.message}`);
        }
    }


    /**
     * Execute a script by alias
     */
    async execute(
        alias: string,
        params: unknown,
        requestId: string,
        mode: 'normal' | 'danger',
        signal?: AbortSignal,
        scriptContent?: string
    ): Promise<ResponseEnvelope> {
        const startTime = Date.now();
        const meta = createMeta(requestId, mode, alias);

        // Send ScriptExecutionStarted event (T008, T010)
        try {
            if (this.telemetry?.isEnabled()) {
                this.telemetry.sendEvent('ScriptExecutionStarted', {
                    sessionId: this.telemetry.getSessionId(),
                    alias,
                    mode,
                    requestId,
                    telemetrySchemaVersion: '2' // Phase 3: Privacy-enhanced schema (Finding DR-05)
                });
            }
        } catch (error) {
            // Graceful degradation - telemetry errors don't affect script execution
        }

        // Handle dynamic scripts using the unified pipeline
        if (alias === '@dynamic' && scriptContent) {
            // Log dynamic script execution
            this.logScriptExecution('@dynamic', params, true);

            try {
                // Create a virtual script object that uses the same interface as regular scripts
                const dynamicScript = await this.createDynamicScript(scriptContent);

                // Use the SAME execution pipeline as regular scripts
                // This ensures dynamic scripts get BridgeContext, AsyncLocalStorage isolation, etc.
                const result = await this.executeScript(dynamicScript, params, requestId, mode, signal, '@dynamic');

                // Capture editor context for enrichment (per Discovery 03)
                const contextStart = Date.now();
                const editorContext = await EditorContextProvider.capture();
                const contextDuration = Date.now() - contextStart;

                // Log performance warning if enrichment exceeds budget (per Discovery 12)
                if (contextDuration > 100) {
                    this.outputChannel.appendLine(`⚠️ Context enrichment: ${contextDuration}ms (exceeds 100ms budget)`);
                }

                // Update duration
                const finalMeta = updateMetaDuration(meta);

                // Log completion with result
                this.outputChannel.appendLine(`✅ Dynamic script completed successfully`);
                this.outputChannel.appendLine(`📤 Result:`);
                this.outputChannel.appendLine(JSON.stringify(result, null, 2));
                this.outputChannel.appendLine('');

                // Check if the dynamic script returned an error
                if (result && typeof result === 'object' && result.success === false) {
                    const envelope = fail(
                        ErrorCode.E_SCRIPT_FAILED,
                        result.error || 'Dynamic script execution failed',
                        { stack: result.stack },
                        finalMeta
                    );
                    // Inject context into error envelope (per Discovery 09)
                    if (editorContext) {
                        envelope.editorContext = editorContext;
                    }
                    return envelope;
                }

                // Return success envelope with context
                const envelope = ok(result, finalMeta);
                if (editorContext) {
                    envelope.editorContext = editorContext;
                }
                return envelope;
            } catch (error: any) {
                // Capture context for exception path (error envelopes useful for debugging)
                const contextStart = Date.now();
                const editorContext = await EditorContextProvider.capture();
                const contextDuration = Date.now() - contextStart;

                if (contextDuration > 100) {
                    this.outputChannel.appendLine(`⚠️ Context enrichment: ${contextDuration}ms (exceeds 100ms budget)`);
                }

                const envelope = fail(
                    ErrorCode.E_INTERNAL,
                    error.message || 'Dynamic script execution failed',
                    { error: error.toString() },
                    updateMetaDuration(meta)
                );
                // Inject context into exception envelope
                if (editorContext) {
                    envelope.editorContext = editorContext;
                }
                return envelope;
            }
        }

        // Find script
        const script = this.scripts.get(alias);
        if (!script) {
            return fail(
                ErrorCode.E_SCRIPT_NOT_FOUND,
                ErrorMessages[ErrorCode.E_SCRIPT_NOT_FOUND],
                { alias },
                updateMetaDuration(meta)
            );
        }

        // Log regular script execution
        this.logScriptExecution(alias, params, false);

        // Three-tier validation system
        let validatedParams = params;

        // Tier 1: Check for generated schema (baked-in scripts)
        if (scriptSchemas[alias as keyof typeof scriptSchemas]) {
            const validation = safeValidateScriptParams(alias as keyof typeof scriptSchemas, params);
            if (!validation.success) {
                return fail(
                    ErrorCode.E_INVALID_PARAMS,
                    ErrorMessages[ErrorCode.E_INVALID_PARAMS],
                    {
                        errors: validation.error?.issues?.map((issue: any) => ({
                            path: issue.path.join('.'),
                            message: issue.message,
                            code: issue.code
                        }))
                    },
                    updateMetaDuration(meta)
                );
            }
            validatedParams = validation.data;
        }
        // Tier 2: Check for script's own validation (dynamic scripts)
        else if (script.paramsSchema || script.validateParams) {
            const validation = script.validateParams ?
                script.validateParams(params) :
                { success: true, data: params };

            if (!validation.success) {
                return fail(
                    ErrorCode.E_INVALID_PARAMS,
                    ErrorMessages[ErrorCode.E_INVALID_PARAMS],
                    {
                        errors: (validation as any).error?.issues?.map((issue: any) => ({
                            path: issue.path.join ? issue.path.join('.') : '',
                            message: issue.message || 'Validation failed',
                            code: issue.code || 'custom'
                        })) || [{ path: '', message: (validation as any).error?.message || 'Validation failed', code: 'custom' }]
                    },
                    updateMetaDuration(meta)
                );
            }
            validatedParams = validation.data;
        }
        // Tier 3: Pass-through (test/mock scripts) - no validation needed

        try {
            // Execute the script with validated parameters and BridgeContext
            const result = await this.executeScript(script, validatedParams, requestId, mode, signal, alias);

            // Capture editor context for enrichment (per Discovery 03)
            const contextStart = Date.now();
            const editorContext = await EditorContextProvider.capture();
            const contextDuration = Date.now() - contextStart;

            // Log performance warning if enrichment exceeds budget (per Discovery 12)
            if (contextDuration > 100) {
                this.outputChannel.appendLine(`⚠️ Context enrichment: ${contextDuration}ms (exceeds 100ms budget)`);
            }

            // Update duration
            const finalMeta = updateMetaDuration(meta);

            // Check if this is a ScriptEnvelope (new pattern)
            if (result && typeof result === 'object' && 'ok' in result && 'type' in result) {
                const envelope = result as any;
                if (!envelope.ok && envelope.error) {
                    // NEW PATTERN: ScriptEnvelope from ScriptResult.failure()
                    // Log ScriptEnvelope failure to output channel
                    this.outputChannel.appendLine(`⚠️ Script ${alias} returned failure:`);
                    this.outputChannel.appendLine(`   Code: ${envelope.error.code}`);
                    this.outputChannel.appendLine(`   Message: ${envelope.error.message}`);
                    if (envelope.error.details) {
                        this.outputChannel.appendLine(`   Details: ${JSON.stringify(envelope.error.details, null, 2)}`);
                    }
                    this.outputChannel.appendLine('');

                    // Send ScriptExecutionFailed event
                    try {
                        if (this.telemetry?.isEnabled()) {
                            this.telemetry.sendErrorEvent('ScriptExecutionFailed', {
                                sessionId: this.telemetry.getSessionId(),
                                alias,
                                errorCode: envelope.error.code,
                                success: 'false',
                                telemetrySchemaVersion: '2'
                            }, {
                                durationMs: finalMeta.durationMs
                            });
                        }
                    } catch (error) {
                        // Graceful degradation
                    }

                    // Return failure envelope directly (already properly formatted)
                    const failureEnvelope = fail(
                        envelope.error.code as ErrorCode,
                        envelope.error.message,
                        envelope.error.details,
                        finalMeta
                    );
                    if (editorContext) {
                        failureEnvelope.editorContext = editorContext;
                    }
                    return failureEnvelope;
                }
            }

            // Check if this is an ActionScript failure response (OLD PATTERN - backward compatibility)
            if (result && typeof result === 'object' && 'success' in result) {
                const actionResult = result as any;
                if (!actionResult.success) {
                    // OLD PATTERN: ActionResult from this.failure()
                    // Log ActionScript failure to output channel
                    this.outputChannel.appendLine(`⚠️ Script ${alias} returned failure (deprecated pattern):`);
                    this.outputChannel.appendLine(`   Reason: ${actionResult.reason || 'Unknown'}`);
                    if (actionResult.error) {
                        this.outputChannel.appendLine(`   Error: ${JSON.stringify(actionResult.error, null, 2)}`);
                    }
                    if (actionResult.details) {
                        this.outputChannel.appendLine(`   Details: ${JSON.stringify(actionResult.details, null, 2)}`);
                    }
                    this.outputChannel.appendLine('');

                    // This is a failed action - return error envelope
                    // Use the errorCode if provided, otherwise check if reason is an error code
                    const errorCode = actionResult.errorCode ||
                                    (actionResult.reason && typeof actionResult.reason === 'string' &&
                                     actionResult.reason.startsWith('E_') ? actionResult.reason : ErrorCode.E_INTERNAL);

                    // IMPROVED: Extract message from multiple sources (fixes error message loss)
                    // Priority: details.message > reason (if not error code) > error.message > default
                    let message: string;
                    if (actionResult.details?.message && typeof actionResult.details.message === 'string') {
                        // Check if message is in details (new idiomatic pattern)
                        message = actionResult.details.message;
                    } else if (actionResult.reason && typeof actionResult.reason === 'string' && !actionResult.reason.startsWith('E_')) {
                        // Use reason if it's not an error code
                        message = actionResult.reason;
                    } else if (actionResult.error?.message) {
                        // Check error object
                        message = actionResult.error.message;
                    } else {
                        // Fallback to error code description
                        message = ErrorMessages[errorCode as ErrorCode] || 'Script execution failed';
                    }

                    // Send ScriptExecutionFailed event for ActionScript failure (T010)
                    try {
                        if (this.telemetry?.isEnabled()) {
                            this.telemetry.sendErrorEvent('ScriptExecutionFailed', {
                                sessionId: this.telemetry.getSessionId(),
                                alias,
                                errorCode: errorCode as string,
                                success: 'false',
                                telemetrySchemaVersion: '2' // Phase 3: Privacy-enhanced schema (Finding DR-05)
                            }, {
                                durationMs: finalMeta.durationMs
                            });
                        }
                    } catch (error) {
                        // Graceful degradation - telemetry errors don't affect script execution
                    }

                    // Return failure envelope with proper error code and context
                    const envelope = fail(
                        errorCode as ErrorCode,
                        typeof message === 'string' ? message : ErrorMessages[errorCode as ErrorCode] || 'Script execution failed',
                        actionResult.details,
                        finalMeta
                    );
                    // Inject context into error envelope (per Discovery 09)
                    if (editorContext) {
                        envelope.editorContext = editorContext;
                    }
                    return envelope;
                }
            }

            // Log completion with result
            this.outputChannel.appendLine(`✅ Script ${alias} completed successfully`);
            this.outputChannel.appendLine(`📤 Result:`);
            this.outputChannel.appendLine(JSON.stringify(result, null, 2));
            this.outputChannel.appendLine('');

            // Send ScriptExecutionCompleted event (T009, T010)
            try {
                if (this.telemetry?.isEnabled()) {
                    this.telemetry.sendEvent('ScriptExecutionCompleted', {
                        sessionId: this.telemetry.getSessionId(),
                        alias,
                        success: 'true',
                        telemetrySchemaVersion: '2' // Phase 3: Privacy-enhanced schema (Finding DR-05)
                    }, {
                        durationMs: finalMeta.durationMs
                    });
                }
            } catch (error) {
                // Graceful degradation - telemetry errors don't affect script execution
            }

            // Return success envelope for successful results with context
            const envelope = ok(result, finalMeta);
            if (editorContext) {
                envelope.editorContext = editorContext;
            }
            return envelope;
        } catch (error: any) {
            // Capture context for exception path (error envelopes useful for debugging)
            const contextStart = Date.now();
            const editorContext = await EditorContextProvider.capture();
            const contextDuration = Date.now() - contextStart;

            if (contextDuration > 100) {
                this.outputChannel.appendLine(`⚠️ Context enrichment: ${contextDuration}ms (exceeds 100ms budget)`);
            }

            // Log error to output channel for debugging
            this.outputChannel.appendLine(`❌ Script ${alias} failed with error:`);
            this.outputChannel.appendLine(`   Message: ${error.message || 'Unknown error'}`);
            if (error.stack) {
                this.outputChannel.appendLine(`   Stack trace:`);
                this.outputChannel.appendLine(error.stack.split('\n').map((line: string) => `     ${line}`).join('\n'));
            }
            this.outputChannel.appendLine('');

            // Update meta duration before sending telemetry
            const finalMeta = updateMetaDuration(meta);

            // Send ScriptExecutionFailed event for exception path (T011, T010)
            try {
                if (this.telemetry?.isEnabled()) {
                    this.telemetry.sendErrorEvent('ScriptExecutionFailed', {
                        sessionId: this.telemetry.getSessionId(),
                        alias,
                        errorCode: ErrorCode.E_INTERNAL,
                        success: 'false',
                        errorMessage: scrubPII(error.message || 'Unknown error') as string,
                        stackPreview: error.stack ? scrubPII(error.stack.split('\n')[0] || '') as string : '',
                        telemetrySchemaVersion: '2' // Phase 3: Privacy-enhanced schema (Finding DR-05)
                    }, {
                        durationMs: finalMeta.durationMs
                    });
                }
            } catch (telemetryError) {
                // Nested try-catch - telemetry error shouldn't mask script error
            }

            // Handle execution errors with full details and context
            const envelope = fail(
                ErrorCode.E_INTERNAL,
                error.message || ErrorMessages[ErrorCode.E_INTERNAL],
                {
                    error: error.toString(),
                    stack: error.stack,
                    name: error.name,
                    code: error.code
                },
                finalMeta
            );
            // Inject context into exception envelope
            if (editorContext) {
                envelope.editorContext = editorContext;
            }
            return envelope;
        }
    }

    /**
     * List all registered script aliases
     */
    listScripts(): string[] {
        return Array.from(this.scripts.keys());
    }

    /**
     * Get metadata for a script
     */
    getMetadata(alias: string): ScriptMetadata | undefined {
        return this.manifests.get(alias)?.metadata;
    }

    /**
     * Check if a script exists
     */
    hasScript(alias: string): boolean {
        return this.scripts.has(alias);
    }

    /**
     * Get scripts by category
     */
    getScriptsByCategory(category: string): string[] {
        const scripts: string[] = [];
        for (const [alias, entry] of this.manifests.entries()) {
            if (entry.metadata.category === category) {
                scripts.push(alias);
            }
        }
        return scripts;
    }

    /**
     * Get danger-only scripts
     */
    getDangerOnlyScripts(): string[] {
        const scripts: string[] = [];
        for (const [alias, entry] of this.manifests.entries()) {
            if (entry.metadata.dangerOnly) {
                scripts.push(alias);
            }
        }
        return scripts;
    }

    /**
     * Register a script directly (for testing and dynamic scripts)
     */
    register(alias: string, script: ScriptBase): void {
        this.scripts.set(alias, script);
    }
}
