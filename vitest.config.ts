import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude the deprecated tests in old/ directory
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.spec.js',
      '**/test/integration/old/**'
    ],
    // CRITICAL: Integration tests must run sequentially
    // The CLI and MCP runners both need exclusive access to the Extension Host
    // Running them in parallel causes conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    // Mock vscode module for unit tests
    // Integration tests should skip this mock by running in Extension Host
    alias: {
      vscode: '/workspaces/vsc-bridge-devcontainer/packages/extension/test/__mocks__/vscode.ts'
    },
    // Don't fail on unhandled errors from error-handling tests
    // The event-writer tests intentionally create errors to test error handling
    dangerouslyIgnoreUnhandledErrors: true
  }
});