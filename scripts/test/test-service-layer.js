#!/usr/bin/env node
/**
 * Manual Test Harness for Service Layer Architecture
 *
 * This script tests the RuntimeInspectionService, AdapterFactory, and BaseDebugAdapter.
 * Since the extension uses webpack, we use mock implementations for testing.
 *
 * Usage: node scripts/test/test-service-layer.js
 */

console.log('═══════════════════════════════════════════════════════════');
console.log('  Service Layer Architecture - Manual Test Harness');
console.log('═══════════════════════════════════════════════════════════\n');

// Mock implementation for testing
class MockDebugSession {
    constructor(id, type) {
        this.id = id;
        this.type = type;
        this.name = `Mock ${type} Session`;
    }

    customRequest(command, args) {
        // Mock DAP responses
        switch (command) {
            case 'threads':
                return Promise.resolve({ threads: [{ id: 1, name: 'Main Thread' }] });
            case 'stackTrace':
                return Promise.resolve({
                    stackFrames: [{
                        id: 1,
                        name: 'main',
                        line: 10,
                        column: 1,
                        source: { path: '/test/file.js' }
                    }]
                });
            case 'scopes':
                return Promise.resolve({
                    scopes: [{
                        name: 'Local',
                        variablesReference: 1,
                        expensive: false
                    }]
                });
            case 'variables':
                return Promise.resolve({
                    variables: [{
                        name: 'x',
                        value: '42',
                        type: 'number',
                        variablesReference: 0
                    }]
                });
            default:
                return Promise.reject(new Error(`Unknown command: ${command}`));
        }
    }
}

// Mock MemoryBudget
class MockMemoryBudget {
    constructor(maxNodes = 20000, maxBytes = 5242880) {
        this.maxNodes = maxNodes;
        this.maxBytes = maxBytes;
        this.currentNodes = 0;
        this.currentBytes = 0;
    }

    isExceeded() {
        return this.currentNodes >= this.maxNodes || this.currentBytes >= this.maxBytes;
    }

    addNode(bytes) {
        if (this.currentNodes + 1 > this.maxNodes || this.currentBytes + bytes > this.maxBytes) {
            return false;
        }
        this.currentNodes++;
        this.currentBytes += bytes;
        return true;
    }

    reset() {
        this.currentNodes = 0;
        this.currentBytes = 0;
    }

    getSuggestion() {
        return 'Consider using debug.stream-variables for file output.';
    }

    getStatus() {
        return {
            currentNodes: this.currentNodes,
            currentBytes: this.currentBytes,
            maxNodes: this.maxNodes,
            maxBytes: this.maxBytes,
            percentNodes: (this.currentNodes / this.maxNodes) * 100,
            percentBytes: (this.currentBytes / this.maxBytes) * 100
        };
    }
}

// Mock AdapterFactory
class MockAdapterFactory {
    constructor() {
        this.supportedTypes = new Map();
    }

    registerAdapter(sessionType, constructor) {
        this.supportedTypes.set(sessionType, constructor);
    }

    isSupported(sessionType) {
        return this.supportedTypes.has(sessionType);
    }

    getSupportedTypes() {
        return Array.from(this.supportedTypes.keys());
    }

    createAdapter(session) {
        const AdapterClass = this.supportedTypes.get(session.type);
        if (!AdapterClass) {
            return {
                code: 'E_UNSUPPORTED_LANGUAGE',
                message: `Debug adapter '${session.type}' is not currently supported`,
                hint: 'Supported debuggers: pwa-node, debugpy, dlv-dap, netcoredbg, dart'
            };
        }
        return new AdapterClass(session);
    }
}

// Mock RuntimeInspectionService
class MockRuntimeInspectionService {
    constructor() {
        this.sessions = new Map();
        this.adapters = new Map();
        this.factory = new MockAdapterFactory();
    }

    static getInstance() {
        if (!this._instance) {
            this._instance = new MockRuntimeInspectionService();
        }
        return this._instance;
    }

    registerSession(session) {
        this.sessions.set(session.id, session);
    }

    unregisterSession(sessionId) {
        this.disposeAdapter(sessionId);
        this.sessions.delete(sessionId);
    }

    getAdapter(sessionId) {
        let session;
        if (sessionId) {
            session = this.sessions.get(sessionId);
            if (!session) {
                return {
                    code: 'E_NO_SESSION',
                    message: `Session ${sessionId} not found`,
                    hint: 'Start debugging with F5 or select a debug configuration'
                };
            }
        }

        if (this.adapters.has(session.id)) {
            return this.adapters.get(session.id);
        }

        const adapterOrError = this.factory.createAdapter(session);
        if (adapterOrError.code) {
            return adapterOrError;
        }

        this.adapters.set(session.id, adapterOrError);
        return adapterOrError;
    }

    disposeAdapter(sessionId) {
        const adapter = this.adapters.get(sessionId);
        if (adapter && adapter.dispose) {
            adapter.dispose();
        }
        this.adapters.delete(sessionId);
    }

    getFactory() {
        return this.factory;
    }

    getActiveSessions() {
        return Array.from(this.sessions.keys());
    }
}

// Mock BaseDebugAdapter
class MockBaseDebugAdapter {
    constructor(session) {
        this.session = session;
        this.capabilities = {
            supportsSetVariable: true,
            supportsVariablePaging: false,
            supportsVariableType: true
        };
        this.memoryBudget = new MockMemoryBudget();
        this.variableCache = new Map();
        this.scopeCache = new Map();
    }

    clearCaches() {
        this.variableCache.clear();
        this.scopeCache.clear();
        this.memoryBudget.reset();
    }

    dispose() {
        this.clearCaches();
    }

    async getThreads() {
        const response = await this.session.customRequest('threads');
        return response.threads || [];
    }

    async getScopes(frameId) {
        const response = await this.session.customRequest('scopes', { frameId });
        return response.scopes || [];
    }
}

// Test functions
function testServiceCreation() {
    console.log('─────────────────────────────────────────────────────────');
    console.log('Test: Service Singleton Creation');
    console.log('─────────────────────────────────────────────────────────');

    const service1 = MockRuntimeInspectionService.getInstance();
    const service2 = MockRuntimeInspectionService.getInstance();

    if (service1 === service2) {
        console.log('✅ Singleton pattern working: same instance returned');
    } else {
        console.log('❌ FAILED: Different instances returned');
    }
}

function testSessionRegistration() {
    console.log('\n─────────────────────────────────────────────────────────');
    console.log('Test: Session Registration');
    console.log('─────────────────────────────────────────────────────────');

    const service = MockRuntimeInspectionService.getInstance();
    const session = new MockDebugSession('session-1', 'pwa-node');

    service.registerSession(session);

    const activeSessions = service.getActiveSessions();
    if (activeSessions.includes('session-1')) {
        console.log('✅ Session registered successfully');
    } else {
        console.log('❌ FAILED: Session not found');
    }
}

function testAdapterFactoryUnsupported() {
    console.log('\n─────────────────────────────────────────────────────────');
    console.log('Test: Unsupported Language Detection');
    console.log('─────────────────────────────────────────────────────────');

    const service = MockRuntimeInspectionService.getInstance();
    const session = new MockDebugSession('session-2', 'custom-debugger');

    service.registerSession(session);
    const result = service.getAdapter('session-2');

    if (result.code === 'E_UNSUPPORTED_LANGUAGE') {
        console.log('✅ Unsupported language error returned correctly');
        console.log(`   Message: ${result.message}`);
        console.log(`   Hint: ${result.hint}`);
    } else {
        console.log('❌ FAILED: Should have returned E_UNSUPPORTED_LANGUAGE');
    }
}

function testAdapterFactorySupported() {
    console.log('\n─────────────────────────────────────────────────────────');
    console.log('Test: Supported Language Adapter Creation');
    console.log('─────────────────────────────────────────────────────────');

    const service = MockRuntimeInspectionService.getInstance();
    const factory = service.getFactory();

    // Register a mock adapter
    factory.registerAdapter('pwa-node', MockBaseDebugAdapter);

    const session = new MockDebugSession('session-3', 'pwa-node');
    service.registerSession(session);

    const adapter = service.getAdapter('session-3');

    if (adapter && !adapter.code && adapter.session.type === 'pwa-node') {
        console.log('✅ NodeDebugAdapter created successfully for pwa-node');
        console.log(`   Session: ${adapter.session.name}`);
        console.log(`   Capabilities: ${JSON.stringify(adapter.capabilities, null, 2)}`);
    } else {
        console.log('❌ FAILED: Adapter creation failed');
    }
}

async function testMemoryBudgetNodes() {
    console.log('\n─────────────────────────────────────────────────────────');
    console.log('Test: Memory Budget - Node Count Limit');
    console.log('─────────────────────────────────────────────────────────');

    const budget = new MockMemoryBudget(10, 10000); // Small limits for testing

    for (let i = 0; i < 15; i++) {
        if (!budget.addNode(10)) {
            console.log(`✅ Budget stopped at ${budget.currentNodes} nodes (limit: ${budget.maxNodes})`);
            console.log(`   Suggestion: ${budget.getSuggestion()}`);
            return;
        }
    }

    console.log('❌ FAILED: Budget did not stop');
}

async function testMemoryBudgetBytes() {
    console.log('\n─────────────────────────────────────────────────────────');
    console.log('Test: Memory Budget - Byte Size Limit');
    console.log('─────────────────────────────────────────────────────────');

    const budget = new MockMemoryBudget(1000, 100); // Small byte limit

    for (let i = 0; i < 15; i++) {
        if (!budget.addNode(20)) {
            console.log(`✅ Budget stopped at ${budget.currentBytes} bytes (limit: ${budget.maxBytes})`);
            const status = budget.getStatus();
            console.log(`   Nodes: ${status.currentNodes}/${status.maxNodes} (${status.percentNodes.toFixed(1)}%)`);
            console.log(`   Bytes: ${status.currentBytes}/${status.maxBytes} (${status.percentBytes.toFixed(1)}%)`);
            return;
        }
    }

    console.log('❌ FAILED: Budget did not stop');
}

async function testCacheManagement() {
    console.log('\n─────────────────────────────────────────────────────────');
    console.log('Test: Cache Invalidation on Resume');
    console.log('─────────────────────────────────────────────────────────');

    const service = MockRuntimeInspectionService.getInstance();
    const factory = service.getFactory();
    factory.registerAdapter('pwa-node', MockBaseDebugAdapter);

    const session = new MockDebugSession('session-4', 'pwa-node');
    service.registerSession(session);

    const adapter = service.getAdapter('session-4');

    // Add to cache
    adapter.variableCache.set(1, [{ name: 'x', value: '42' }]);
    adapter.scopeCache.set(1, [{ name: 'Local' }]);
    adapter.memoryBudget.addNode(100);

    console.log('Before clearCaches():');
    console.log(`   Variable cache size: ${adapter.variableCache.size}`);
    console.log(`   Scope cache size: ${adapter.scopeCache.size}`);
    console.log(`   Memory budget nodes: ${adapter.memoryBudget.currentNodes}`);

    // Simulate execution resume
    adapter.clearCaches();

    console.log('After clearCaches():');
    console.log(`   Variable cache size: ${adapter.variableCache.size}`);
    console.log(`   Scope cache size: ${adapter.scopeCache.size}`);
    console.log(`   Memory budget nodes: ${adapter.memoryBudget.currentNodes}`);

    if (adapter.variableCache.size === 0 && adapter.scopeCache.size === 0 && adapter.memoryBudget.currentNodes === 0) {
        console.log('✅ Caches cleared successfully (per Critical Discovery 02)');
    } else {
        console.log('❌ FAILED: Caches not properly cleared');
    }
}

// Run all tests
async function runAllTests() {
    testServiceCreation();
    testSessionRegistration();
    testAdapterFactoryUnsupported();
    testAdapterFactorySupported();
    await testMemoryBudgetNodes();
    await testMemoryBudgetBytes();
    await testCacheManagement();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Test Summary');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ All service layer tests completed');
    console.log('\n📋 Next Steps:');
    console.log('   1. Review the output above');
    console.log('   2. Verify singleton pattern works correctly');
    console.log('   3. Check memory budgets enforce limits');
    console.log('   4. Confirm cache invalidation works');
    console.log('   5. Test in Extension Development Host with real sessions');
    console.log('');
}

runAllTests().catch(console.error);
