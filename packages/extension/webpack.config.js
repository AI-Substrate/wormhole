const path = require('path');
const glob = require('glob');
const CopyPlugin = require('copy-webpack-plugin');

// Utility: map script files to webpack entries
function scriptEntries() {
  const files = glob.sync('src/vsc-scripts/**/*.{js,ts}', {
    cwd: __dirname,
    ignore: ['**/*.d.ts']  // Exclude TypeScript declaration files
  });
  const entries = {};
  for (const file of files) {
    // keep relative path under vsc-scripts/ for output
    const rel = path.relative('src', file).replace(/\.(js|ts)$/, '');
    entries[rel] = path.resolve(__dirname, file);
  }
  return entries;
}

const commonNode = {
  target: 'node',
  mode: 'none', // will be overridden by --mode production in package script
  devtool: 'source-map',
  resolve: { extensions: ['.ts', '.js'] },
  externals: { vscode: 'commonjs vscode' }, // always externalize VS Code API
  infrastructureLogging: { level: 'log' }
};

// 1) Main extension bundle
/**@type {import('webpack').Configuration}*/
const extensionConfig = {
  ...commonNode,
  name: 'extension',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  module: {
    rules: [
      { test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  }
  // Note: we no longer externalize zod here - scripts will bundle it
};

// 2) Built-in scripts: multiple entries + a shared vendor chunk
/**@type {import('webpack').Configuration}*/
const scriptsConfig = {
  ...commonNode,
  name: 'vsc-scripts',
  entry: scriptEntries(),
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: '[name].js', // e.g. out/vsc-scripts/debug/status.js
    chunkFilename: '_[name].js', // shared chunks at out/_shared.js (relative to scripts)
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@script-base': path.resolve(__dirname, 'src/core/scripts/base.ts'),
      '@core/debug/debug-and-wait': path.resolve(__dirname, 'src/core/debug/debug-and-wait.ts'),
      '@core/debug/event-hub': path.resolve(__dirname, 'src/core/debug/event-hub.ts'),
      '@core/debug/debug-polling-helpers': path.resolve(__dirname, 'src/core/debug/debug-polling-helpers.js'),
      '@core/debug/debug-session-capture': path.resolve(__dirname, 'src/core/debug/debug-session-capture.ts'),
      '@core/debug/session-helpers': path.resolve(__dirname, 'src/core/debug/session-helpers.js'),
      '@core/debug/step-operations': path.resolve(__dirname, 'src/core/debug/step-operations.js'),
      '@core/debug/step-strategies': path.resolve(__dirname, 'src/core/debug/step-strategies.js'),
      '@core/testing/test-executor': path.resolve(__dirname, 'src/core/testing/test-executor.ts'),
      '@core/testing/availability': path.resolve(__dirname, 'src/core/testing/availability.ts'),
      '@core/errors/debug-errors': path.resolve(__dirname, 'src/core/errors/debug-errors.ts'),
      '@core/response/errorTaxonomy': path.resolve(__dirname, 'src/core/response/errorTaxonomy.ts'),
      '@core/scripts/ScriptResult': path.resolve(__dirname, 'src/core/scripts/ScriptResult.ts'),
      '@core/runtime-inspection/RuntimeInspectionService': path.resolve(__dirname, 'src/core/runtime-inspection/RuntimeInspectionService.ts'),
      '@core/test-environments/detectors/JavaScriptTestDetector': path.resolve(__dirname, 'src/core/test-environments/detectors/JavaScriptTestDetector.ts'),
      '@core/util/symbol-resolver': path.resolve(__dirname, 'src/core/util/symbol-resolver.ts')
    }
  },
  module: {
    rules: [
      { test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }
    ]
  },
  optimization: {
    // Disable code splitting to allow dynamic loading from disk
    // (scripts with dependencies on @core/util/symbol-resolver were failing
    // because webpack chunk 43 wasn't loading in the CommonJS require context)
    splitChunks: false,
    runtimeChunk: false
  },
  plugins: [
    // Copy non-code assets (manifest and YAML metadata files)
    new CopyPlugin({
      patterns: [
        {
          from: 'src/vsc-scripts',
          to: 'vsc-scripts',
          globOptions: {
            ignore: ['**/*.js', '**/*.ts'] // only copy non-code files
          }
        }
      ]
    })
  ]
};

module.exports = [extensionConfig, scriptsConfig];
