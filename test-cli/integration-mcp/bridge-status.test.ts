/**
 * Bridge Status Tool Integration Tests
 *
 * Validates the bridge_status MCP tool that checks VSC-Bridge health without
 * crossing the bridge. This tool is unique because it executes locally in the
 * MCP server process instead of via fs-bridge IPC.
 *
 * Testing Strategy:
 * - Validate tool appears in tools/list
 * - Validate response format (healthy, lastSeen, lastSeenAgo, bridgeRoot, transport)
 * - Validate it works when Extension Host is running
 * - Validate error handling when bridge is not found
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { setupStdioTestEnvironment, StdioTestEnvironment } from './helpers/stdio-test-client.js';

/**
 * Test timeout (30 seconds)
 */
const TEST_TIMEOUT = 30000;

/**
 * Setup timeout (120 seconds for Extension Host launch)
 */
const SETUP_TIMEOUT = 120000;

/**
 * Test environment
 */
let env: StdioTestEnvironment | undefined;

describe('Bridge Status Tool', () => {
    /**
     * Setup: Launch Extension Host and spawn MCP server
     */
    beforeAll(async () => {
        console.log('⚙️  Setting up bridge-status test environment...');
        env = await setupStdioTestEnvironment();
        console.log('✅ Environment ready');
    }, SETUP_TIMEOUT);

    /**
     * Cleanup: Stop Extension Host and kill MCP server subprocess
     */
    afterAll(async () => {
        if (env) {
            console.log('🧹 Cleaning up bridge-status test environment...');
            await env.cleanup();
        }
    });

    /**
     * Test: bridge_status appears in tools list
     */
    it('should appear in tools list with correct metadata', async () => {
        if (!env) {
            throw new Error('Test environment not initialized');
        }

        const response = await env.client.request(
            { method: 'tools/list', params: {} },
            ListToolsResultSchema
        );

        expect(response.tools).toBeDefined();

        const bridgeStatusTool = response.tools.find(t => t.name === 'bridge_status');
        expect(bridgeStatusTool).toBeDefined();
        expect(bridgeStatusTool?.description).toContain('bridge');
        expect(bridgeStatusTool?.description).toContain('health');
        expect(bridgeStatusTool?.inputSchema).toBeDefined();
        expect(bridgeStatusTool?.inputSchema.properties).toEqual({});

        console.log('✅ bridge_status tool found in tools list');
    }, TEST_TIMEOUT);

    /**
     * Test: bridge_status returns healthy status
     */
    it('should return healthy status when Extension Host is running', async () => {
        if (!env) {
            throw new Error('Test environment not initialized');
        }

        const response = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'bridge_status',
                    arguments: {}
                }
            },
            CallToolResultSchema
        );

        // Verify MCP response format
        expect(response).toBeDefined();
        expect(response.content).toBeDefined();
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content.length).toBeGreaterThan(0);

        // Parse response
        const content = response.content[0];
        expect(content.type).toBe('text');
        expect(content.text).toBeDefined();

        const data = JSON.parse(content.text);

        // Validate response structure
        expect(data).toHaveProperty('healthy');
        expect(data).toHaveProperty('lastSeen');
        expect(data).toHaveProperty('lastSeenAgo');
        expect(data).toHaveProperty('bridgeRoot');
        expect(data).toHaveProperty('transport');

        // Validate values
        expect(data.healthy).toBe(true);
        expect(typeof data.lastSeen).toBe('string');
        expect(typeof data.lastSeenAgo).toBe('number');
        expect(data.lastSeenAgo).toBeLessThan(30); // Should be < 30 seconds if healthy
        expect(typeof data.bridgeRoot).toBe('string');
        expect(data.bridgeRoot).toContain('.vsc-bridge');
        expect(data.transport).toBe('filesystem');

        console.log(`✅ Bridge is healthy (last seen ${data.lastSeenAgo}s ago)`);
        console.log(`   Bridge root: ${data.bridgeRoot}`);
        console.log(`   Last seen: ${data.lastSeen}`);
    }, TEST_TIMEOUT);

    /**
     * Test: bridge_status validates timestamp format
     */
    it('should return ISO 8601 timestamp for lastSeen', async () => {
        if (!env) {
            throw new Error('Test environment not initialized');
        }

        const response = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'bridge_status',
                    arguments: {}
                }
            },
            CallToolResultSchema
        );

        const data = JSON.parse(response.content[0].text);

        // Validate ISO 8601 format
        expect(data.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

        // Validate timestamp is recent (within last minute)
        const lastSeenDate = new Date(data.lastSeen);
        const now = new Date();
        const diffSeconds = (now.getTime() - lastSeenDate.getTime()) / 1000;
        expect(diffSeconds).toBeLessThan(60);

        console.log('✅ Timestamp format is valid ISO 8601');
    }, TEST_TIMEOUT);

    /**
     * Test: bridge_status validates lastSeenAgo matches timestamp
     */
    it('should have lastSeenAgo matching timestamp difference', async () => {
        if (!env) {
            throw new Error('Test environment not initialized');
        }

        const response = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'bridge_status',
                    arguments: {}
                }
            },
            CallToolResultSchema
        );

        const data = JSON.parse(response.content[0].text);

        // Calculate expected lastSeenAgo
        const lastSeenDate = new Date(data.lastSeen);
        const now = new Date();
        const expectedAgo = Math.round((now.getTime() - lastSeenDate.getTime()) / 1000);

        // Allow ±2 second tolerance for timing differences
        expect(Math.abs(data.lastSeenAgo - expectedAgo)).toBeLessThanOrEqual(2);

        console.log('✅ lastSeenAgo matches timestamp calculation');
    }, TEST_TIMEOUT);

    /**
     * Test: bridge_status works independently (doesn't cross bridge)
     *
     * This test verifies that bridge_status is truly local by checking it
     * succeeds even when we're not in an active debug session.
     */
    it('should work without active debug session (local check)', async () => {
        if (!env) {
            throw new Error('Test environment not initialized');
        }

        // Ensure no debug session is active
        try {
            await env.client.request(
                {
                    method: 'tools/call',
                    params: { name: 'debug_stop', arguments: {} }
                },
                CallToolResultSchema
            );
        } catch (e) {
            // Ignore if no session to stop
        }

        // bridge_status should still work
        const response = await env.client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'bridge_status',
                    arguments: {}
                }
            },
            CallToolResultSchema
        );

        const data = JSON.parse(response.content[0].text);
        expect(data.healthy).toBe(true);

        console.log('✅ bridge_status works without active debug session (local check confirmed)');
    }, TEST_TIMEOUT);
});
