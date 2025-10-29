# Build and Test Commands

## Core Build Commands
```bash
# Build everything
npm run build  # or npm run package for production

# Build extension only
npm run compile  # Development build with webpack

# Watch mode for development
npm run watch

# Production package (with source maps)
npm run package
```

## Testing Commands
```bash
# Run all tests via VS Code test framework
npm test

# Lint all code
npm run lint

# Compile tests only (separate from main build)
npm run compile-tests

# Watch tests during development  
npm run watch-tests

# Full pre-test sequence
npm run pretest  # Runs compile-tests, compile, and lint
```

## Script Manifest Management
```bash
# Rebuild script manifest after adding/modifying scripts
npm run manifest:build

# Watch for script changes and rebuild manifest
npm run manifest:watch
```

## Package Management
```bash
# Package extension for distribution
npm run vsce:package

# Publish extension
npm run publish

# Clean build artifacts
npm run clean
```

## Environment Variables
- `VSC_BRIDGE_TOKEN`: Auth token for tests (set to 'test-token' in test environment)
- `NODE_ENV`: Set to 'test' during test execution
- `VSC_BRIDGE_PORT`: Server port (default 3001)

## Test Environment
- Tests run in VS Code Extension Development Host
- Bootstrap file ensures extension activation before tests
- Uses @vscode/test-cli with custom configuration in `.vscode-test.mjs`
- Mocha timeout: 30000ms for extension activation