# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.




## Project Overview

VSC-Bridge is a VS Code extension that provides debugging integration through a local HTTP server (port 3001) and an MCP (Model Context Protocol) server for AI-assisted debugging. The project consists of three main components:

1. **VS Code Extension** (`packages/extension/`) - Exposes debugging capabilities via HTTP API
2. **CLI Tool** (root `/`) - Command-line interface at `/workspaces/vsc-bridge-devcontainer/` for debugging automation (installed via npx or globally)
3. **MCP Server** (`mcp-server/`) - Provides MCP tools for breakpoint management and debugging


# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- 
Customize this template for your project:
1. Replace placeholder documentation paths with your actual docs
2. Update build tool commands with your project's tools
3. Add project-specific conventions and requirements
4. Include relevant architectural patterns for your codebase
-->




## Mermaid Diagram Guidelines

When creating Mermaid diagrams in documentation:
- Be careful of parentheses `()` in diagram syntax - they can break rendering
- Use clear, descriptive node labels
- Keep diagrams simple and focused

## Required Reading

**CRITICAL**: Always read these files before working on the codebase:

<!-- Example documentation structure - replace with your actual docs -->
- `README.md` - Project overview and setup instructions
- `docs/architecture.md` - System architecture and design patterns (if exists)
- `docs/contributing.md` - Contribution guidelines and code standards (if exists)
- `docs/api.md` - API documentation and usage examples (if exists)

<!-- Add your project-specific required reading here -->


## Project Rules and Workflow

### Core Principles
- **Expert autonomous software engineer** - Implement planned tasks accurately and efficiently

- **Build tools**: Use the project's established build system (check package.json, Makefile, build.gradle, etc.)
- **Scratch directory**: All temporary/experimental work goes in `scratch/` (not tracked by git)
- **File editing preference**: Use partial edits (Edit/MultiEdit) over complete rewrites
- **Architecture compliance**: Follow the project's documented architectural patterns and conventions


### Task Planning Protocol
1. **Plan Structure**: Organize into numbered Phases, break into numeric tasks
2. **Documentation**: Create clear documentation of planned changes before implementation
3. **Task tables** with Status, Task, Success Criteria, Notes columns
4. **Success criteria** must be explicit and testable
5. **No assumptions** - plans must be explicit about all requirements
6. **Test-first approach** - write tests, implement code, verify tests pass

### File Modification Logging When Following Plans
When implementing a plan and modifying files, use footnotes to track changes:

1. **In the task row**: Add a brief note about what was modified
2. **In the Notes column**: Write a one-line summary followed by a footnote tag (e.g., `[^1]`)
3. **At the bottom of the plan**: Add the detailed footnote with substrate node IDs
4. **Always mark steps complete as you do them**: But only once the tests pass!

#### Code Reference Format in Footnotes
Include specific references for code you modify, making them clickable links:

- **Method/Function**: `[method:path/to/file:functionName](path/to/file#L123)`
- **Class**: `[class:path/to/file:ClassName](path/to/file#L123)`
- **File**: `[file:path/to/file](path/to/file)`

Adapt the format to your project's language and conventions.

Note: Use appropriate relative paths based on your documentation structure.

Example footnotes with clickable references:
```markdown
| 2.1 | [x] | Update configuration logic | Config loads correctly | Added validation for settings [^1] |
| 2.2 | [x] | Add error handling | Errors are caught and logged | Updated main function [^2] |

...

[^1]: Modified [`function:src/config.js:validateSettings`](src/config.js#L45) – Added validation to ensure required fields are present before processing.

[^2]: Modified [`function:src/main.js:initialize`](src/main.js#L120) – Added try-catch blocks with appropriate error logging.
```

Keep footnote numbers sequential and unique throughout the plan.

### Updating GitHub Issues When Following Plans
When implementing a plan and updating progress:

1. **DO NOT change the issue title** to include phase numbers or progress indicators
2. **DO add progress comments** using `gh issue comment` to document phase completion
3. **DO update the issue body** to reflect progress and adjustments as needed
4. **DO reference the branch** in your progress comments

Example progress comment:
```bash
gh issue comment 123 --body "## Phase 1 Completed ✅
Successfully implemented [phase description]...
Branch: \`issue-123-phase-1\`"
```

### GitHub Workflow
- **Branch naming**: `issue-<num>-phase-<phase>` off `main`
- **Conventional Commits** (Angular style) with issue references (`Fixes #123`)
- **Command prefix**: Use `PAGER=cat` before raw `git`/`gh` commands
- **PR workflow**: feature → `main`, clear description, squash-and-merge

#### Git Command Policy
**CRITICAL**: Never execute git commands that modify the repository. User must perform all modifications manually.

**❌ NEVER execute these commands:**
- `git add` / `git stage` - Staging changes
- `git commit` - Creating commits
- `git push` - Pushing to remote
- `git pull` - Pulling from remote
- `git merge` - Merging branches
- `git rebase` - Rebasing branches
- `git checkout -b` / `git switch -c` - Creating branches
- `git branch -d` / `git branch -D` - Deleting branches
- `git reset` - Resetting changes
- `git revert` - Reverting commits
- `git cherry-pick` - Cherry-picking commits
- `git stash` - Stashing changes
- `git tag` - Creating tags
- `git remote add` / `git remote remove` - Modifying remotes
- Any other command that modifies repository state

**✅ ALLOWED - Read-only git commands:**
- `git status` - View working directory status
- `git log` - View commit history
- `git diff` - View changes
- `git show` - Show commit details
- `git branch` (list only) - List branches
- `git remote -v` - List remotes
- `git ls-files` - List tracked files
- `git rev-parse` - Parse git revisions
- `git describe` - Describe current commit
- Any other read-only inspection command

**When user needs modifications:**
1. Explain what git commands they should run
2. Provide the exact commands with explanations
3. Wait for user to execute them
4. Continue once user confirms completion

### Testing Requirements
- **Prefer integration tests** over heavy mocking when possible
- **Test edge cases** - avoid only testing the happy path
- **Use test fixtures** appropriate to your project's testing framework
- **Quality assertions** - verify specific expected behavior and data
- **Follow project conventions** - use established test patterns and utilities


## Build and Development Commands

### Build System
- Use `just build` to build the system, not npm run compile
- Most of the time the user wants to do the build themselves as build clogs up context

### Devcontainer Best Practices

**Feature Ordering for Rebuild Performance**:
- **Always add new features LAST** in `.devcontainer/devcontainer.json`'s `features` object
- Docker builds layers sequentially - changes to any feature rebuild that layer + all subsequent layers
- Heavy features (like Dart SDK, language runtimes) should be last to maximize layer caching
- Example:
  ```json
  "features": {
    "ghcr.io/devcontainers/features/node:1": {},      // Lightweight, changes occasionally
    "ghcr.io/devcontainers/features/python:1": {},    // Medium weight
    "ghcr.io/devcontainers-contrib/features/dart-sdk:1": {}  // Heavy, add LAST
  }
  ```
- **Impact**: Correct ordering keeps rebuilds under 3 minutes; incorrect ordering can cause 15+ minute rebuilds

### CLI Commands (vscb)

**CRITICAL - Understanding Two Modes, One Location:**

All `vscb` commands are run from the **project root** (`/Users/jak/github/vsc-bridge`), but they serve two distinct purposes:

#### 🔧 Development Mode vs 🐕 Dogfood Mode

| Mode | Purpose | What You're Doing | File Targets |
|------|---------|-------------------|--------------|
| **Development Mode** | Testing features | Validate extension works with simulated test workspace | Files in `test/` (Python, JS, C#, Java) |
| **Dogfood Mode** | Debugging extension | Debug the extension's own source code | Files in `extension/src/` (TypeScript) |

**The key insight**: The difference is **what you target with your commands**, not where you run them from.

#### Development Mode: Testing Features in `test/` Workspace

When the Extension Host launches with `launch="Run Extension"`, it opens the `test/` workspace. You interact with this workspace to validate extension features work correctly:

```bash
# Always run from vsc-bridge root
cd /Users/jak/github/vsc-bridge

# Launch Extension Host (opens test/ workspace)
vscb script run debug.start --param launch="Run Extension"

# Test breakpoint functionality in test files
vscb script run breakpoint.set \
  --param path="$(pwd)/test/python/test_example.py" \
  --param line=29

# Debug a test file
vscb script run tests.debug-single \
  --param path="$(pwd)/test/python/test_example.py" \
  --param line=29

# Check variables in test execution
vscb script run debug.list-variables --param scope=local
```

**Use this for**: Validating that debugger features work with Python/JS/C#/Java test files.

#### Dogfood Mode: Debugging Extension Source Code

You can also use the extension to debug **itself** by setting breakpoints in the extension's own TypeScript source code:

```bash
# Set breakpoint in extension source code
vscb script run breakpoint.set \
  --param path="$(pwd)/extension/src/core/registry/ScriptRegistry.ts" \
  --param line=259

# Launch Extension Host (with breakpoint already set)
vscb script run debug.start --param launch="Run Extension"

# Any CLI command triggers extension code → hits your breakpoint!
vscb script run breakpoint.list

# Now inspect extension internals
vscb script run debug.stack
vscb script run debug.list-variables --param scope=local
vscb script run debug.evaluate --param expression="scriptName"
```

**Use this for**: Understanding extension flow, finding bugs in extension logic, inspecting internal state.

#### The Complete Development Loop

```bash
# 1. Make change to extension code
# Edit: extension/src/...

# 2. Build
just build

# 3. Launch Extension Host
vscb script run debug.start --param launch="Run Extension"

# 4a. Test feature (Development Mode)
vscb script run breakpoint.set --param path="$(pwd)/test/python/test_example.py" --param line=29

# 4b. OR debug extension internals (Dogfood Mode)
vscb script run breakpoint.set --param path="$(pwd)/extension/src/vsc-scripts/breakpoint/set.js" --param line=35

# 5. Stop when done
vscb script run debug.stop
```

#### Command Working Directory Rules

The working directory matters because the CLI looks for the `.vsc-bridge/` directory to communicate with the extension:

**When to run from project root** (`/Users/jak/github/vsc-bridge`):
- `debug.start` - Launches Extension Host (opens test/ workspace internally)
- Dogfooding scenarios (when Extension Host is opened on project root)

**When to run from test workspace** (`/Users/jak/github/vsc-bridge/test`):
- All test/debug commands: `tests.debug-single`, `breakpoint.set`, `debug.step-over`, etc.
- This matches where Extension Host creates the `.vsc-bridge/` directory

**From the manual test docs** (`docs/manual-test/debug-single.md`):
```bash
cd /Users/jak/github/vsc-bridge/test   # ← Run test commands from here

vscb script run tests.debug-single \
  --param path=$(pwd)/python/test_example.py \
  --param line=29
```

#### Integration Testing Pattern

For automated tests (like Vitest integration tests):
- **Extension Host launch**: Run from project root with `debug.start`
- **All test commands**: Run from test/ workspace (where `.vsc-bridge/` exists)
- **Example**:
  ```typescript
  // Launch (from root)
  await runCLI('script run debug.start --param launch="Run Extension"', fromRoot: true);

  // Test commands (from test/)
  await runCLI('script run tests.debug-single ...', fromRoot: false);
  ```

See `docs/how/dogfood/dogfooding-vsc-bridge.md` for complete workflows and examples.

**CLI Command Format**: `vscb script run <script-name> [--param key=value ...]`

#### Common Script Commands:

**Breakpoints:**
```bash
# Clear all breakpoints in project
vscb script run breakpoint.clear.project

# Set a breakpoint
vscb script run breakpoint.set --param path=/absolute/path/to/file.js --param line=42

# List all breakpoints
vscb script run breakpoint.list
```

**Debug Commands:**
```bash
# Start debug session at test location
vscb script run tests.debug-single --param path=/path/to/test.js --param line=10

# Step commands (require active debug session)
vscb script run debug.step-over
vscb script run debug.step-into
vscb script run debug.step-out
vscb script run debug.continue

# Stop debug session
vscb script run debug.stop
```

**Finding Available Scripts:**
```bash
# List all available scripts with parameters
vscb script list

# Filter for specific category
vscb script list | grep -i <keyword>
```

**Common Mistakes to Avoid:**
- ❌ `vscb breakpoint.clear.project` - Missing `script run`
- ❌ `vscb bp.clear.project` - Wrong script name (use full `breakpoint.` prefix)
- ✅ `vscb script run breakpoint.clear.project` - Correct format

---

## Using VSC-Bridge as an AI Debugging Agent

When you need to **debug code using MCP tools** (not develop the extension):

📘 **See [AGENTS-TEMPLATE.md](AGENTS-TEMPLATE.md) for complete debugging guide**

**Quick reference - MCP tools vs CLI equivalents:**

| MCP Tool | CLI Equivalent | Purpose |
|----------|----------------|---------|
| `bridge_status()` | `vscb status` | Check connection |
| `breakpoint_set()` | `vscb script run breakpoint.set` | Set breakpoint |
| `breakpoint_clear_project()` | `vscb script run breakpoint.clear.project` | Clear all breakpoints |
| `test_debug_single()` | `vscb script run tests.debug-single` | Debug test at location |
| `debug_list_variables()` | `vscb script run debug.list-variables` | Inspect variables |
| `debug_step_over()` | `vscb script run debug.step-over` | Step over line |
| `debug_step_into()` | `vscb script run debug.step-into` | Step into function |
| `debug_continue()` | `vscb script run debug.continue` | Continue execution |
| `debug_evaluate()` | `vscb script run debug.evaluate` | Evaluate expression |
| `dap_summary()` | N/A (MCP only) | Get debug session summary |
| `dap_logs()` | N/A (MCP only) | View DAP event logs |
| `dap_search()` | N/A (MCP only) | Search DAP logs |
| `dap_exceptions()` | N/A (MCP only) | Find exception events |
| `search_symbol_search()` | N/A (MCP only) | Find symbols fast |

**Key differences:**
- **MCP tools**: Async TypeScript functions, used by AI agents (Cline, Claude Desktop)
- **CLI commands**: Shell commands via `vscb`, used by developers/scripts

**When to use which:**
- 🤖 **MCP**: AI agent debugging user's code interactively
- 🔧 **CLI**: Extension development, CI/CD, manual testing

**Critical patterns from AGENTS-TEMPLATE.md:**
1. **Always clear breakpoints first**: `breakpoint_clear_project()` before debugging
2. **Check bridge status**: `bridge_status()` before any operation
3. **Use correct line numbers**: Test start line for `test_debug_single`, not breakpoint line
4. **Language syntax matters**: Python uses `len()`, JS uses `.length`, C# uses `.Count`
5. **pytest/Jest failures in stdout**: Use `dap_search()`, not `dap_exceptions()`
6. **Query DAP immediately**: After test ends, before starting new session