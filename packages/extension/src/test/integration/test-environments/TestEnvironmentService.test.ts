import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { TestEnvironmentService } from '../../../core/test-environments/TestEnvironmentService';
import { ILogger, IWorkspaceService } from '../../../core/bridge-context/types';
import { ITestEnvironmentDetector, ITestEnvironment } from '../../../core/test-environments/interfaces';

suite('TestEnvironmentService', () => {
    let service: TestEnvironmentService;
    let mockLogger: sinon.SinonStubbedInstance<ILogger>;
    let mockWorkspaceService: sinon.SinonStubbedInstance<IWorkspaceService>;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();

        // Create mock logger
        mockLogger = {
            info: sandbox.stub(),
            error: sandbox.stub(),
            debug: sandbox.stub(),
            warn: sandbox.stub()
        } as any;

        // Create mock workspace service
        mockWorkspaceService = {
            getWorkspaceFolder: sandbox.stub(),
            getWorkspaceFolders: sandbox.stub()
        } as any;

        // Create service with mocks
        service = new TestEnvironmentService(mockLogger, mockWorkspaceService);
    });

    teardown(() => {
        service.dispose();
        sandbox.restore();
    });

    test('should register detectors without duplicates', () => {
        const mockDetector: ITestEnvironmentDetector<ITestEnvironment> = {
            supportedLanguages: ['python'],
            canHandle: sandbox.stub().resolves(true),
            detect: sandbox.stub().resolves({} as any),
            watchGlobs: () => ['*.py']
        };

        // Register same detector twice
        service.registerDetector(mockDetector);
        service.registerDetector(mockDetector);

        // Should only have one detector
        assert.strictEqual(service.getDetectorCount(), 1);
    });

    test('should detect environment with caching', async () => {
        const mockFolder: vscode.WorkspaceFolder = {
            uri: vscode.Uri.file('/test/project'),
            name: 'test-project',
            index: 0
        };

        const mockEnv: ITestEnvironment = {
            language: 'python',
            framework: 'pytest',
            confidence: 0.9,
            cwd: '/test/project',
            projectRoot: '/test/project',
            testFilePatterns: ['**/test_*.py'],
            debugConfig: {
                type: 'python',
                name: 'Debug Test',
                request: 'launch'
            },
            reasons: ['Found pytest.ini']
        };

        const mockDetector: ITestEnvironmentDetector<ITestEnvironment> = {
            supportedLanguages: ['python'],
            canHandle: sandbox.stub().resolves(true),
            detect: sandbox.stub().resolves(mockEnv),
            watchGlobs: () => ['pytest.ini']
        };

        service.registerDetector(mockDetector);

        // First detection
        const result1 = await service.detect(mockFolder);
        assert.deepStrictEqual(result1, mockEnv);
        assert.ok((mockDetector.detect as sinon.SinonStub).calledOnce);

        // Second detection should use cache
        const result2 = await service.detect(mockFolder);
        assert.deepStrictEqual(result2, mockEnv);
        assert.ok((mockDetector.detect as sinon.SinonStub).calledOnce); // Still only once

        // Verify cache hit was logged
        assert.ok(mockLogger.debug.calledWith('[TestEnv] Cache hit for /test/project:<no-file>'));
    });

    test('should apply workspace trust reduction', async () => {
        // Mock workspace as untrusted
        sandbox.stub(vscode.workspace, 'isTrusted').value(false);

        const mockFolder: vscode.WorkspaceFolder = {
            uri: vscode.Uri.file('/test/project'),
            name: 'test-project',
            index: 0
        };

        const mockEnv: ITestEnvironment = {
            language: 'python',
            framework: 'pytest',
            confidence: 0.9,
            cwd: '/test/project',
            projectRoot: '/test/project',
            testFilePatterns: ['**/test_*.py'],
            debugConfig: {
                type: 'python',
                name: 'Debug Test',
                request: 'launch'
            },
            reasons: ['Found pytest.ini']
        };

        const mockDetector: ITestEnvironmentDetector<ITestEnvironment> = {
            supportedLanguages: ['python'],
            canHandle: sandbox.stub().resolves(true),
            detect: sandbox.stub().resolves(mockEnv),
            watchGlobs: () => []
        };

        service.registerDetector(mockDetector);

        const result = await service.detect(mockFolder);

        // Confidence should be reduced
        assert.ok(result);
        assert.strictEqual(result.confidence, 0.45); // 0.9 * 0.5
        assert.ok(result.reasons.includes('Workspace not trusted - confidence reduced'));
    });

    test('should invalidate cache on request', () => {
        const mockFolder: vscode.WorkspaceFolder = {
            uri: vscode.Uri.file('/test/project'),
            name: 'test-project',
            index: 0
        };

        // Populate cache (simulated)
        (service as any).cache.set('/test/project:file.py', {} as any);
        (service as any).cache.set('/other/project:file.py', {} as any);

        // Invalidate specific folder
        service.invalidateCache(mockFolder);

        // Only folder's entries should be removed
        assert.strictEqual((service as any).cache.size, 1);
        assert.ok((service as any).cache.has('/other/project:file.py'));

        // Invalidate all
        service.invalidateCache();
        assert.strictEqual((service as any).cache.size, 0);
    });

    test('should handle detector errors gracefully', async () => {
        const mockFolder: vscode.WorkspaceFolder = {
            uri: vscode.Uri.file('/test/project'),
            name: 'test-project',
            index: 0
        };

        const errorDetector: ITestEnvironmentDetector<ITestEnvironment> = {
            supportedLanguages: ['python'],
            canHandle: sandbox.stub().rejects(new Error('Test error')),
            detect: sandbox.stub().rejects(new Error('Should not be called')),
            watchGlobs: () => []
        };

        const successDetector: ITestEnvironmentDetector<ITestEnvironment> = {
            supportedLanguages: ['javascript'],
            canHandle: sandbox.stub().resolves(true),
            detect: sandbox.stub().resolves({
                language: 'javascript',
                framework: 'jest',
                confidence: 0.8,
                cwd: '/test/project',
                projectRoot: '/test/project',
                testFilePatterns: ['**/*.test.js'],
                debugConfig: {
                    type: 'node',
                    name: 'Debug Test',
                    request: 'launch'
                },
                reasons: ['Found jest.config.js']
            }),
            watchGlobs: () => []
        };

        service.registerDetector(errorDetector);
        service.registerDetector(successDetector);

        const result = await service.detect(mockFolder);

        // Should return successful detector result despite error in first detector
        assert.ok(result);
        assert.strictEqual(result.language, 'javascript');
        assert.strictEqual(result.framework, 'jest');

        // Should log error
        assert.ok(mockLogger.error.calledWith('[TestEnv] Error checking detector'));
    });

    test('should use quickScore for routing in monorepos', async () => {
        const mockFolder: vscode.WorkspaceFolder = {
            uri: vscode.Uri.file('/monorepo'),
            name: 'monorepo',
            index: 0
        };

        const fileUri = vscode.Uri.file('/monorepo/packages/api/test.py');

        const detector1: ITestEnvironmentDetector<ITestEnvironment> = {
            supportedLanguages: ['python'],
            canHandle: sandbox.stub().resolves(true),
            detect: sandbox.stub().resolves({
                language: 'python',
                framework: 'pytest',
                confidence: 0.7,
                cwd: '/monorepo',
                projectRoot: '/monorepo',
                testFilePatterns: ['**/test_*.py'],
                debugConfig: { type: 'python', name: 'Test', request: 'launch' },
                reasons: ['Root detector']
            }),
            watchGlobs: () => [],
            quickScore: (path: string) => path.includes('/api/') ? 0.2 : 0.1
        };

        const detector2: ITestEnvironmentDetector<ITestEnvironment> = {
            supportedLanguages: ['python'],
            canHandle: sandbox.stub().resolves(true),
            detect: sandbox.stub().resolves({
                language: 'python',
                framework: 'pytest',
                confidence: 0.8,
                cwd: '/monorepo/packages/api',
                projectRoot: '/monorepo/packages/api',
                testFilePatterns: ['**/test_*.py'],
                debugConfig: { type: 'python', name: 'API Test', request: 'launch' },
                reasons: ['API package detector']
            }),
            watchGlobs: () => [],
            quickScore: (path: string) => path.includes('/packages/api/') ? 0.9 : 0.1
        };

        service.registerDetector(detector1);
        service.registerDetector(detector2);

        const result = await service.detect(mockFolder, fileUri);

        // Should use detector2 due to higher quickScore for the file path
        assert.ok(result);
        assert.strictEqual(result.projectRoot, '/monorepo/packages/api');
        assert.ok(result.reasons.includes('API package detector'));
    });
});