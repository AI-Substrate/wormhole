import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@script-base': path.resolve(__dirname, './src/core/scripts/base.ts'),
      '@core/debug/debug-and-wait': path.resolve(__dirname, './src/core/debug/debug-and-wait.ts'),
      '@core/debug/event-hub': path.resolve(__dirname, './src/core/debug/event-hub.ts'),
      '@core/debug/debug-polling-helpers': path.resolve(__dirname, './src/core/debug/debug-polling-helpers.js'),
      '@core/debug/debug-session-capture': path.resolve(__dirname, './src/core/debug/debug-session-capture.ts'),
      '@core/debug/session-helpers': path.resolve(__dirname, './src/core/debug/session-helpers.js'),
      '@core/debug/step-operations': path.resolve(__dirname, './src/core/debug/step-operations.js'),
      '@core/debug/step-strategies': path.resolve(__dirname, './src/core/debug/step-strategies.js'),
      '@core/testing/test-executor': path.resolve(__dirname, './src/core/testing/test-executor.ts'),
      '@core/testing/availability': path.resolve(__dirname, './src/core/testing/availability.ts'),
      '@core/errors/debug-errors': path.resolve(__dirname, './src/core/errors/debug-errors.ts'),
      '@core/response/errorTaxonomy': path.resolve(__dirname, './src/core/response/errorTaxonomy.ts'),
      '@core/scripts/ScriptResult': path.resolve(__dirname, './src/core/scripts/ScriptResult.ts'),
      '@core/runtime-inspection/RuntimeInspectionService': path.resolve(__dirname, './src/core/runtime-inspection/RuntimeInspectionService.ts'),
      '@core/test-environments/detectors/JavaScriptTestDetector': path.resolve(__dirname, './src/core/test-environments/detectors/JavaScriptTestDetector.ts'),
      '@core/util/symbol-resolver': path.resolve(__dirname, './src/core/util/symbol-resolver.ts'),
      '@core/': path.resolve(__dirname, './src/core/'),
    },
  },
});
