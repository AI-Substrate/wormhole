import { describe, it, beforeEach } from 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { BridgeContext } from '../../core/bridge-context/BridgeContext';
import type {
    IBridgeContext,
    ILogger,
    IDebugService,
    IWorkspaceService,
    IPathService
} from '../../vsc-scripts/bridge-context';

/**
 * Test that TypeScript definitions match the runtime implementation
 * This ensures JavaScript scripts get accurate IntelliSense
 */
describe('BridgeContext TypeScript Definitions', () => {
    let mockExtensionContext: vscode.ExtensionContext;

    beforeEach(() => {
        // Create minimal mock extension context
        mockExtensionContext = {
            extensionPath: '/test/extension',
            extensionUri: vscode.Uri.file('/test/extension'),
            subscriptions: [],
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => [],
                setKeysForSync: () => {}
            } as any,
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => []
            } as any,
            asAbsolutePath: (path: string) => `/test/extension/${path}`,
            storagePath: '/test/storage',
            globalStoragePath: '/test/global-storage',
            logPath: '/test/logs'
        } as any;
    });

    describe('Core Interface Properties', () => {
        it('should have all required properties defined in types', () => {
            const context = new BridgeContext(mockExtensionContext);

            // These should all exist as per our type definitions
            const typedContext: IBridgeContext = context as IBridgeContext;

            assert.ok(typedContext.version);
            assert.strictEqual(typedContext.version, '1.0.0');

            assert.ok(typedContext.vscode);
            assert.strictEqual(typedContext.vscode, vscode);

            assert.strictEqual(typeof typedContext.getWorkspace, 'function');
            assert.strictEqual(typeof typedContext.getActiveEditor, 'function');
            assert.strictEqual(typeof typedContext.getConfiguration, 'function');
            assert.strictEqual(typeof typedContext.dispose, 'function');
        });

        it('should have optional properties correctly typed', () => {
            const context = new BridgeContext(mockExtensionContext, {
                mode: 'normal',
                signal: new AbortController().signal
            });

            const typedContext: IBridgeContext = context as IBridgeContext;

            // Optional properties
            assert.ok(typedContext.signal);
            assert.strictEqual(typedContext.mode, 'normal');
            assert.ok(typedContext.outputChannel);
        });
    });

    describe('Logger Service', () => {
        it('should match ILogger interface', () => {
            const context = new BridgeContext(mockExtensionContext);
            const logger: ILogger = context.logger;

            assert.strictEqual(typeof logger.info, 'function');
            assert.strictEqual(typeof logger.error, 'function');
            assert.strictEqual(typeof logger.debug, 'function');
            assert.strictEqual(typeof logger.warn, 'function');
        });

        it('should accept correct parameter types', () => {
            const context = new BridgeContext(mockExtensionContext);
            const logger: ILogger = context.logger;

            // These should compile without type errors
            logger.info('Test message', 'arg1', 'arg2');
            logger.error('Error message', new Error('test'));
            logger.debug('Debug message', { data: 'test' });
            logger.warn('Warning message');
        });
    });

    describe('Service Interfaces', () => {
        it('should have debug service matching IDebugService', () => {
            const context = new BridgeContext(mockExtensionContext);

            if (context.debug) {
                const debugService: IDebugService = context.debug;
                assert.strictEqual(typeof debugService.getSession, 'function');
                assert.strictEqual(typeof debugService.isActive, 'function');
            }
        });

        it('should have workspace service matching IWorkspaceService', () => {
            const context = new BridgeContext(mockExtensionContext);

            if (context.workspace) {
                const workspaceService: IWorkspaceService = context.workspace;
                assert.strictEqual(typeof workspaceService.getDefault, 'function');
                assert.strictEqual(typeof workspaceService.findByPath, 'function');
                assert.strictEqual(typeof workspaceService.resolveUri, 'function');
            }
        });

        it('should have path service matching IPathService', () => {
            const context = new BridgeContext(mockExtensionContext);

            if (context.paths) {
                const pathService: IPathService = context.paths;
                assert.ok(pathService.extensionRoot);
                assert.strictEqual(typeof pathService.resolve, 'function');
                assert.strictEqual(typeof pathService.isAbsolute, 'function');
                assert.strictEqual(typeof pathService.toWorkspaceRelative, 'function');
            }
        });
    });

    describe('Method Return Types', () => {
        it('should return correct types from methods', () => {
            const context = new BridgeContext(mockExtensionContext);
            const typedContext: IBridgeContext = context;

            // Test return type compatibility
            const workspace: vscode.WorkspaceFolder | undefined = typedContext.getWorkspace();
            assert.strictEqual(workspace, undefined); // No workspace in test

            const editor: vscode.TextEditor | undefined = typedContext.getActiveEditor();
            assert.strictEqual(editor, undefined); // No editor in test

            const config: vscode.WorkspaceConfiguration = typedContext.getConfiguration('test');
            assert.ok(config);
            assert.strictEqual(typeof config.get, 'function');
        });
    });

    describe('Type Definition Completeness', () => {
        it('should cover all public methods', () => {
            const context = new BridgeContext(mockExtensionContext);

            // Get all public methods from the instance
            const publicMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(context))
                .filter(name => {
                    const prop = (context as any)[name];
                    return typeof prop === 'function' &&
                           !name.startsWith('_') &&
                           name !== 'constructor';
                });

            // These methods should be in our interface
            const expectedMethods = [
                'getWorkspace',
                'getActiveEditor',
                'getConfiguration',
                'setRequestMetadata',
                'dispose'
            ];

            expectedMethods.forEach(method => {
                assert.ok(publicMethods.includes(method));
                assert.strictEqual(typeof (context as any)[method], 'function');
            });
        });
    });

    describe('JavaScript IntelliSense Compatibility', () => {
        it('should provide types usable from JavaScript via JSDoc', () => {
            // This simulates how a JavaScript file would use the types

            /** @type {import('../../vsc-scripts/bridge-context').IBridgeContext} */
            let jsContext;

            jsContext = new BridgeContext(mockExtensionContext) as any;

            // TypeScript should understand these types from our .d.ts file
            assert.ok(jsContext);
        });
    });
});