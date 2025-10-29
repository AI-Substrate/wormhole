# JavaScript Test Debugging Guide

This guide covers how to set up and debug JavaScript tests using VSC-Bridge with the vscode-jest extension.

## Prerequisites

1. **vscode-jest extension** (ID: `Orta.vscode-jest`)
2. **Node.js** installed on your system
3. **Jest** configured in your project

## Installation

### Installing vscode-jest

The vscode-jest extension is required for JavaScript test debugging. When you first attempt to debug a JavaScript test file, VSC-Bridge will check for this extension and provide installation guidance if it's missing.

To install manually:
```bash
code --install-extension Orta.vscode-jest
```

Or through VS Code:
1. Open Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
2. Search for "Jest" by Orta
3. Install the extension
4. Reload VS Code if prompted

## Jest Configuration Examples

### Basic Jest Setup

**package.json:**
```json
{
  "name": "my-project",
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

### Jest Configuration File

**jest.config.js:**
```javascript
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/*.test.js',
    '**/*.spec.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js'
  ]
};
```

### TypeScript Configuration

**jest.config.ts:**
```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  }
};

export default config;
```

**package.json for TypeScript:**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "devDependencies": {
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.0.0"
  }
}
```

## VS Code Settings

### Workspace Settings

**.vscode/settings.json:**
```json
{
  "jest.jestCommandLine": "npm test --",
  "jest.rootPath": "${workspaceFolder}",
  "jest.runMode": "on-demand",
  "jest.outputConfig": {
    "revealWithFocus": "terminal"
  }
}
```

### Debug Configuration

**.vscode/launch.json:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "name": "vscode-jest-tests.v2",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": [
        "--runInBand",
        "--watchAll=false",
        "--testNamePattern", "${jest.testNamePattern}",
        "--runTestsByPath", "${jest.testFile}"
      ],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "disableOptimisticBPs": true,
      "windows": {
        "program": "${workspaceFolder}/node_modules/jest/bin/jest"
      }
    }
  ]
}
```

## Common Configurations

### Monorepo Setup

For monorepos with multiple packages:

**Root jest.config.js:**
```javascript
module.exports = {
  projects: [
    '<rootDir>/packages/*/jest.config.js'
  ],
  collectCoverageFrom: [
    'packages/*/src/**/*.{js,ts}',
    '!**/node_modules/**',
    '!**/dist/**'
  ]
};
```

**Package-specific jest.config.js:**
```javascript
module.exports = {
  displayName: 'package-name',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest']
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
```

### React Application

**jest.config.js for React:**
```javascript
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/__mocks__/fileMock.js'
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-react'
      ]
    }]
  }
};
```

### Node.js API

**jest.config.js for Node API:**
```javascript
module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/', '/test/'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/index.js'
  ],
  testTimeout: 10000,
  setupFiles: ['<rootDir>/test/setup.js'],
  globalSetup: '<rootDir>/test/globalSetup.js',
  globalTeardown: '<rootDir>/test/globalTeardown.js'
};
```

## Debugging JavaScript Tests

### Using VSC-Bridge CLI

```bash
# Debug a specific test file
vscb script run tests.debug-single \
  --param path=/path/to/example.test.js \
  --param line=15

# Debug with a specific test name pattern
vscb script run tests.debug-single \
  --param path=/path/to/example.test.js \
  --param line=15 \
  --param launch='{"args": ["--testNamePattern", "should calculate total"]}'
```

### Automatic Detection

VSC-Bridge automatically detects:
- Jest configuration in package.json
- jest.config.js/ts files
- Test file patterns (*.test.js, *.spec.js, etc.)
- Node.js path
- Package manager (npm, yarn, pnpm)

### Error Messages

If vscode-jest is not installed, you'll see:
```
The vscode-jest extension is required for JavaScript test debugging.

Please install it from the VS Code marketplace:
1. Open Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
2. Search for "Jest" by Orta
3. Install the extension (ID: Orta.vscode-jest)
4. Reload VS Code and try again
```

## Troubleshooting

### Common Issues

1. **Tests not appearing in Testing sidebar**
   - Ensure vscode-jest is installed and active
   - Check that Jest is properly configured
   - Try running "Jest: Start All Runners" command

2. **Breakpoints not working**
   - Add `"disableOptimisticBPs": true` to debug config
   - Ensure source maps are generated
   - Use `--runInBand` flag for Jest

3. **Extension not activating**
   - Check VS Code Output panel for Jest errors
   - Verify jest.jestCommandLine in settings
   - Ensure node_modules is installed

4. **Monorepo issues**
   - Set correct jest.rootPath in settings
   - Use project-specific jest.config.js files
   - Configure VS Code multi-root workspace

### Getting Help

- Check the VS Code Output panel (select "Jest" from dropdown)
- Review vscode-jest documentation: https://github.com/jest-community/vscode-jest
- File issues: https://github.com/your-org/vsc-bridge/issues

## Advanced Configuration

### Custom Test Environment

```javascript
// jest.config.js
module.exports = {
  testEnvironment: './test/custom-environment.js',
  testEnvironmentOptions: {
    customProperty: 'value'
  }
};
```

### Transform Options

```javascript
// jest.config.js
module.exports = {
  transform: {
    '\\.[jt]sx?$': ['babel-jest', {
      configFile: './babel.config.js'
    }],
    '\\.vue$': '@vue/vue3-jest'
  }
};
```

### Coverage Thresholds

```javascript
// jest.config.js
module.exports = {
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```