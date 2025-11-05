"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = __importDefault(require("path"));
exports.default = (0, config_1.defineConfig)({
    test: {
        globals: true,
        environment: 'node',
    },
    resolve: {
        alias: {
            '@script-base': path_1.default.resolve(__dirname, './src/core/scripts/base.ts'),
            '@core/debug/debug-and-wait': path_1.default.resolve(__dirname, './src/core/debug/debug-and-wait.ts'),
            '@core/debug/event-hub': path_1.default.resolve(__dirname, './src/core/debug/event-hub.ts'),
            '@core/debug/debug-polling-helpers': path_1.default.resolve(__dirname, './src/core/debug/debug-polling-helpers.js'),
            '@core/debug/debug-session-capture': path_1.default.resolve(__dirname, './src/core/debug/debug-session-capture.ts'),
            '@core/debug/session-helpers': path_1.default.resolve(__dirname, './src/core/debug/session-helpers.js'),
            '@core/debug/step-operations': path_1.default.resolve(__dirname, './src/core/debug/step-operations.js'),
            '@core/debug/step-strategies': path_1.default.resolve(__dirname, './src/core/debug/step-strategies.js'),
            '@core/testing/test-executor': path_1.default.resolve(__dirname, './src/core/testing/test-executor.ts'),
            '@core/testing/availability': path_1.default.resolve(__dirname, './src/core/testing/availability.ts'),
            '@core/errors/debug-errors': path_1.default.resolve(__dirname, './src/core/errors/debug-errors.ts'),
            '@core/response/errorTaxonomy': path_1.default.resolve(__dirname, './src/core/response/errorTaxonomy.ts'),
            '@core/scripts/ScriptResult': path_1.default.resolve(__dirname, './src/core/scripts/ScriptResult.ts'),
            '@core/runtime-inspection/RuntimeInspectionService': path_1.default.resolve(__dirname, './src/core/runtime-inspection/RuntimeInspectionService.ts'),
            '@core/test-environments/detectors/JavaScriptTestDetector': path_1.default.resolve(__dirname, './src/core/test-environments/detectors/JavaScriptTestDetector.ts'),
            '@core/util/symbol-resolver': path_1.default.resolve(__dirname, './src/core/util/symbol-resolver.ts'),
            '@core/': path_1.default.resolve(__dirname, './src/core/'),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map