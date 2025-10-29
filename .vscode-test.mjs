import { defineConfig } from '@vscode/test-cli';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.join(__dirname, 'packages', 'extension');

export default defineConfig({
  // Make the extension-under-test the subfolder, not the repo root:
  extensionDevelopmentPath: extRoot,
  
  // Optional: open the extension folder as the workspace during tests
  workspaceFolder: extRoot,
  
  // Only load compiled JS tests from *that* package:
  files: 'packages/extension/out/test/**/*.test.js',
  
  // Set test environment
  env: {
    NODE_ENV: 'test'
  },
  
  // Ensure the bootstrap runs for every test execution mode
  mocha: {
    require: [path.join(extRoot, 'out', 'test', 'bootstrap.js')],
    timeout: 30000
  }
});