/**
 * Central Script Import File
 *
 * This file statically imports all baked-in scripts for the ScriptRegistry.
 *
 * Purpose:
 * - Enable debugging: Static imports allow VS Code to resolve breakpoints
 * - Type safety: TypeScript can validate all script classes exist
 * - Build validation: Missing imports cause compilation errors
 *
 * Maintenance:
 * - Manual: Add new scripts here when created
 * - Validated: Build fails if imports don't match manifest.json
 * - Organized: Grouped by category for clarity
 *
 * Note: @dynamic scripts are NOT imported here - they use loadModuleFromDisk()
 *       for runtime loading (see ScriptRegistry dual loading strategy)
 */

// Breakpoint Scripts (5)
export { ClearFileBreakpointsScript } from './breakpoint/clear-file';
export { ClearProjectBreakpointsScript } from './breakpoint/clear-project';
export { ListBreakpointsScript } from './breakpoint/list';
export { RemoveBreakpointScript } from './breakpoint/remove';
export { SetBreakpointScript } from './breakpoint/set';

// Code Scripts (1)
export { ReplaceMethodScript } from './code/replace-method';

// DAP Scripts (8)
export { DapCompareScript } from './dap/compare';
export { DapExceptionsScript } from './dap/exceptions';
export { DapFilterScript } from './dap/filter';
export { DapLogsScript } from './dap/logs';
export { DapSearchScript } from './dap/search';
export { DapStatsScript } from './dap/stats';
export { DapSummaryScript } from './dap/summary';
export { DapTimelineScript } from './dap/timeline';

// Debug Scripts (17)
export { ContinueDebugScript } from './debug/continue';
export { EvaluateScript } from './debug/evaluate';
export { GetVariableScript } from './debug/get-variable';
export { ListVariablesScript } from './debug/list-variables';
export { RestartDebugScript } from './debug/restart';
export { SaveVariableScript } from './debug/save-variable';
export { ScopesScript } from './debug/scopes';
export { SetVariableScript } from './debug/set-variable';
export { StackDebugScript } from './debug/stack';
export { StartDebugScript } from './debug/start';
export { DebugStatusScript } from './debug/status';
export { StepIntoDebugScript } from './debug/step-into';
export { StepOutDebugScript } from './debug/step-out';
export { StepOverDebugScript } from './debug/step-over';
export { StopDebugScript } from './debug/stop';
export { ThreadsDebugScript } from './debug/threads';
export { DebugTrackerScript } from './debug/tracker';
export { WaitForHitScript } from './debug/wait-for-hit';

// Diagnostic Scripts (1)
export { CollectDiagnosticsScript } from './diag/collect';

// Editor Scripts (3)
export { GetContextScript } from './editor/get-context';
export { GotoLineScript } from './editor/goto-line';
export { ShowTestingUIScript } from './editor/show-testing-ui';

// Search Scripts (1)
export { SymbolSearchScript } from './search/symbol-search';

// Symbol Scripts (2)
export { NavigateScript } from './symbol/navigate';
export { RenameScript } from './symbol/rename';

// Test Scripts (1)
export { DebugSingleTestScript } from './tests/debug-single';

// Utility Scripts (1)
export { RestartVSCodeScript } from './utils/restart-vscode';
