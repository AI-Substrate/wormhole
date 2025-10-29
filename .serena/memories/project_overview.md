# VSC-Bridge Project Overview

## Purpose
VSC-Bridge is a VS Code extension that provides debugging integration through a **filesystem-based bridge** and an **MCP (Model Context Protocol) server** for AI-assisted debugging. It enables LLM coding agents and humans to interact with the VS Code Debug API via CLI commands or MCP tools.

## Architecture
The project consists of two main components:

1. **VS Code Extension** (`packages/extension/`) - Watches filesystem for job submissions, executes debugging operations
2. **CLI + MCP Server** (`packages/cli/`) - Submits jobs via filesystem bridge, provides MCP tools for debugging

**Key Insight**: The CLI and MCP server **share the same `runCommand()` function** (Critical Discovery 02 from Plan 15). Changes to the bridge communication apply to both.

## Bridge Communication Pattern

**Filesystem-Based Job Submission** (not HTTP):
1. CLI writes `command.json` to `.vsc-bridge/execute/<job-id>/`
2. Extension watches for new jobs, creates `claimed.json` when picked up
3. Extension processes job, writes `response.json` or `error.json`
4. Extension writes `done` marker when complete
5. CLI polls for `done`, reads response

**Bridge Directory Structure**:
```
.vsc-bridge/
├── host.json          # Heartbeat file (mtime indicates bridge health)
├── execute/           # Job submissions directory
│   └── <job-id>/      # Per-job directory
│       ├── command.json   # Job request (written by CLI)
│       ├── claimed.json   # Claim marker (written by extension)
│       ├── response.json  # Success response (written by extension)
│       ├── error.json     # Error response (written by extension)
│       └── done           # Completion marker (written by extension)
└── events.ndjson      # Event streaming (optional)
```

## Tech Stack
- **VS Code Extension API** (latest)
- **TypeScript 5.x** with strict mode
- **oclif** - CLI framework for `vscb` commands
- **Vitest** - Test framework (NOT Mocha)
- **Zod** - Parameter validation for scripts and tools
- **Node.js** - Runtime environment
- **ESM modules** - All packages use ES modules

## Key Components

### Extension Side (`packages/extension/`)
- **ScriptRegistry**: Manages dynamic script loading from `src/vsc-scripts/`
- **Filesystem Processor**: Watches `.vsc-bridge/execute/` for new jobs
- **Debug API Integration**: Executes debugging commands via VS Code Debug API

### CLI Side (`packages/cli/`)
- **fs-bridge.ts**: Core bridge client (`runCommand()`, `checkBridgeHealth()`, `cancelCommand()`)
- **MCP Server**: Exposes bridge tools via Model Context Protocol
- **Commands**: `vscb script run`, `vscb exec`, `vscb status`
- **Error Types**: E_BRIDGE_UNAVAILABLE, E_PICKUP_TIMEOUT, E_TIMEOUT, E_NO_RESPONSE

## Current Plan: Fast-Fail Job Submission (Plan 15)

**Goal**: Fail fast when bridge unavailable, distinguish error types clearly

**Key Features**:
1. **Pre-submission health check**: Verify bridge alive before submitting (< 100ms)
2. **Pickup acknowledgment**: Wait for `claimed.json` (max 5s)
3. **Two-phase timeout**: 5s pickup + remaining execution time
4. **Error differentiation**:
   - E_BRIDGE_UNAVAILABLE: Bridge dead/crashed (< 100ms failure)
   - E_PICKUP_TIMEOUT: Bridge didn't claim job in 5s (overloaded/capacity)
   - E_TIMEOUT: Job execution timed out

**Status**: Phases 1-6 complete (2/7 = 29%), Phase 7 (Testing) in progress

## Testing
- **Framework**: Vitest (v1.x or v2.x)
- **Test Files**: `packages/cli/test/lib/fs-bridge.test.ts` (47+ tests)
- **Integration Tests**: `packages/cli/test/integration-mcp/bridge-adapter.test.ts`
- **Coverage Target**: > 80% for modified files
- **Test Pattern**: Isolated temp directories per test, real filesystem operations (minimal mocking)

## Development Commands

**Build**:
```bash
just build  # NOT npm run compile
```

**CLI Testing** (vscb):
```bash
# From project root (development mode)
vscb script run debug.start --param launch="Run Extension"

# From test/ workspace (dogfooding mode)
cd test/
vscb script run tests.debug-single --param path=$(pwd)/python/test_example.py --param line=29
```

**Test Execution**:
```bash
npx vitest run test/lib/fs-bridge.test.ts          # Single file
npx vitest run --coverage                          # All tests with coverage
npx vitest test/lib/fs-bridge.test.ts             # Watch mode
```

## Key Files
- **Bridge Client**: `packages/cli/src/lib/fs-bridge.ts` (runCommand, health check)
- **MCP Adapter**: `packages/cli/src/lib/mcp/bridge-adapter.ts` (MCP tool execution)
- **Extension Processor**: `packages/extension/src/core/fs-bridge/processor.ts` (job claiming)
- **CLI Commands**: `packages/cli/src/commands/{script,exec}.ts`
- **Tests**: `packages/cli/test/lib/fs-bridge.test.ts` (1597 lines, Vitest)
