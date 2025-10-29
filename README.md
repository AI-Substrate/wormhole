# VSC-Bridge

**The missing bridge between AI coding agents and VS Code's professional debugger.** VSC-Bridge transforms debugging from a manual, UI-driven activity into a programmable workflow accessible to LLM agents, CLI tools, and automation scripts. Through purpose-built commands spanning breakpoint management, code stepping, variable inspection, and test debugging, your AI pair programmer can now debug like a senior engineer—setting conditional breakpoints, stepping through execution, inspecting nested object properties, and even modifying variables on the fly. Whether it's your coding agent setting a breakpoint at line 42 and evaluating `user.is_authenticated` to find your auth bug, or your CI pipeline capturing pytest output through the Debug Adapter Protocol without fragile log parsing, VSC-Bridge gives you programmatic control over everything you can do in VS Code's debugger UI, and more.

**True pair programming through the VS Code interface.** Imagine asking your coding agent to "debug this failing test" and watching it autonomously set breakpoints, launch your test suite, pause when `user_count > 100`, inspect all local variables, step through your authentication logic line-by-line, discover that `session.expired == True`, and report back: "The bug is on line 47—sessions aren't being refreshed." This is the experience VSC-Bridge enables across Python, JavaScript, C#, and Java with unified workflows for popular testing frameworks. Available through the `vscb` CLI, a security-scoped HTTP API (localhost:3001), and native Model Context Protocol integration for Claude Desktop, Cline, Cursor, and GitHub Copilot, VSC-Bridge makes debugging scriptable, automatable, and AI-native—while you collaborate seamlessly through the familiar VS Code interface you already know.

---

## 🚀 Getting Started

### Installation

#### **Recommended: Quick Install with get-vsix**

The fastest way to get started - downloads and installs the latest extension from GitHub releases:

```bash
# Download and install (recommended)
npx github:AI-Substrate/wormhole get-vsix --install

# Or just download without installing
npx github:AI-Substrate/wormhole get-vsix
```

**What this does:**
- ✅ Downloads the latest `.vsix` from GitHub releases
- ✅ Installs the extension in VS Code automatically (with `--install`)
- ✅ No manual download or VS Code UI navigation needed
- ✅ Perfect for quick setup and automation

**After installation**: Reload VS Code with `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) → "Developer: Reload Window"

Then verify the installation:
```bash
npx github:AI-Substrate/wormhole status
```

---

#### **Alternative: Use npx for CLI (Auto-Updates)**

Run commands directly without installing - always uses the latest version:

```bash
# Run any vscb command via npx
npx github:AI-Substrate/wormhole --help
npx github:AI-Substrate/wormhole script list
npx github:AI-Substrate/wormhole status
```

**Benefits:**
- ✅ Always uses the latest version (auto-updates)
- ✅ No manual installation or updates needed
- ✅ Perfect for development workflows
- ✅ Great for CI/CD pipelines

**Optional: Pin to a specific version/branch:**
```bash
# Use a specific branch
npx github:AI-Substrate/wormhole#develop --help

# Use a specific tag
npx github:AI-Substrate/wormhole#v2.0.0 --help
```

> **Note**: When using npx for CLI only, you'll need the VS Code extension installed separately (use `get-vsix` above or see [For Contributors](#-for-contributors) section).

---

#### **Alternative: Global Installation**

For persistent installation without needing `npx` each time:

```bash
# Install globally from GitHub
npm install -g github:AI-Substrate/wormhole

# Verify installation
vscb --version
vscb --help
```

Once installed, use `vscb` from any directory:

```bash
vscb script list
vscb script run bp.set --param path=/path/to/file.py --param line=10
vscb status
```

---

### **Configure MCP Server**

The MCP server enables AI assistants to use VSC-Bridge's 35+ debugging tools (breakpoints, stepping, variables, etc.). Choose your AI tool below.

---

##### **For Claude Desktop App**

Claude Desktop is the standalone desktop application.

**1. Locate your Claude Desktop configuration file**:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**2. Edit the configuration file** and add the vsc-bridge server:

```json
{
  "mcpServers": {
    "vsc-bridge": {
      "command": "npx",
      "args": ["github:AI-Substrate/wormhole", "mcp", "--workspace", "."]
    }
  }
}
```

**Important**: Using `"."` for workspace makes it work dynamically with any project. Claude Desktop will use whatever directory you're working in.

**Why npx?** Auto-updates to latest version automatically - no manual updates needed!

**4. Restart Claude Desktop** to load the new configuration.

**5. Verify installation**:
- Open a conversation in Claude Desktop
- Navigate to a project directory with VS Code running
- Ask: "List available MCP tools"
- You should see 35+ vsc-bridge tools available

**Troubleshooting**:
- If tools don't appear, check that:
  - `vscb` is in your PATH: `which vscb` (Unix) or `where vscb` (Windows)
  - VS Code extension is running in your project
  - `.vsc-bridge/` directory exists: `ls -la .vsc-bridge/`

---

##### **For Claude Code (CLI)**

Claude Code is the terminal-based Claude CLI tool.

**1. Install Claude CLI** (if not already installed):
```bash
npm install -g @anthropic-ai/claude-code
```

**2. Register VSC-Bridge MCP server**:
```bash
# Register using npx (auto-updates to latest version)
claude mcp add --scope user --transport stdio vsc-bridge -- \
  npx github:AI-Substrate/wormhole mcp --workspace .
```

**3. Verify registration**:
```bash
claude mcp list  # Should show: vsc-bridge
```

**4. Update Claude Code permissions** (optional - auto-allow VSC-Bridge tools):
```bash
# Only needed if you're a contributor with the repo cloned
python3 scripts/update-claude-mcp-permissions.py
```

This adds all 35 VSC-Bridge MCP tools to the auto-allowed list in `.claude/settings.local.json`.

---
##### **For GitHub Copilot**

You can use the command palette -> MCP: Add Server... and enter: 

`npx github:AI-Substrate/wormhole mcp --workspace .`


**Recommended configuration** (for VS Code settings):

```json
{
  "servers": {
    "vsc-bridge": {
      "command": "npx",
      "args": ["github:AI-Substrate/wormhole", "mcp", "--workspace", "${workspaceFolder}"],
      "transport": "stdio"
    }
  }
}
```
----

##### **For Cline / Other AI Tools**

**Recommended configuration**:

```json
{
  "mcpServers": {
    "vsc-bridge": {
      "command": "npx",
      "args": ["github:AI-Substrate/wormhole", "mcp", "--workspace", "${workspaceFolder}"],
      "transport": "stdio"
    }
  }
}
```

**Why `${workspaceFolder}`?**
- ✅ VS Code variable that works in `.vscode/settings.json`
- ✅ Works in user settings when a workspace is open
- ✅ Automatically points to the current project directory

**Why npx?** Auto-updates to latest version automatically!

**Where to add this configuration:**

1. **Workspace-level** (`.vscode/settings.json` in your project):
   - Best for project-specific setup
   - Committed to git, shared with team

2. **User-level** (VS Code User Settings):
   - Open Command Palette: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type: "Preferences: Open User Settings (JSON)"
   - Add the configuration above
   - Works globally across all projects

**Supported AI Tools**:
- ✅ Cline (CLI coding agent) - Uses current directory automatically
- ✅ Continue.dev (via MCP configuration)
- ✅ Cursor IDE
- ✅ GitHub Copilot Chat - *Pending MCP support*
- ✅ Any tool supporting Model Context Protocol

---

##### **Understanding the MCP Server**

**What is it?**
The MCP (Model Context Protocol) server provides 35 debugging tools to AI assistants:
- `breakpoint_set` - Add breakpoints
- `debug_start` - Start debugging sessions
- `debug_list_variables` - Inspect variables
- `debug_step_over` - Step through code
- And 31 more...

**Prerequisites**:
1. VS Code must be running with VSC-Bridge extension active
2. Project workspace must be open (creates `.vsc-bridge/` directory)
3. `vscb` CLI must be globally installed and in PATH

**How it works**:
```
AI Agent (e.g., Claude Desktop)
  → Spawns: vscb mcp --workspace /project
    → Communicates via: .vsc-bridge/ directory
      → Controls: VS Code debugger
```

**Workspace directory** (`.vsc-bridge/`):
- Created automatically when VS Code extension activates
- Contains IPC files for CLI ↔ extension communication
- Must exist for MCP server to function
- Each project has its own `.vsc-bridge/` directory

**Common issues**:
- **"Bridge root not found"**: VS Code extension not running or workspace not open
- **"vscb: command not found"**: CLI not in PATH (run `bash scripts/install-vscb.sh`)
- **"Version mismatch"**: CLI and extension versions don't match (rebuild both)

#### **Step 4: Verify Installation**

```bash
# Verify CLI installation
bash scripts/verify-vscb.sh  # Linux/Mac/WSL

# Or manually:
vscb --version
vscb --help

# Test connection (requires VS Code running with extension)
vscb status

# List available debugging scripts
vscb script list
```

---

## 📦 Offline Installation

For environments with limited internet access or registry restrictions, you can create and distribute an offline installation bundle.

### Creating the Bundle

Run the following command to create an offline bundle:

```bash
just package-offline-bundle
```

The bundle will be created at `artifacts/vsc-bridge-offline-<version>.zip` (approximately 750 KB).

### Installing from Bundle

Once you have the offline bundle, extract and run the appropriate installation script:

**macOS / Linux:**

```bash
# Extract the bundle
unzip vsc-bridge-offline-<version>.zip
cd vsc-bridge-offline-<version>/

# Run the installation script
bash install-vscb-offline.sh
```

**Windows:**

```powershell
# Extract the bundle
Expand-Archive vsc-bridge-offline-<version>.zip -DestinationPath .
cd vsc-bridge-offline-<version>\

# Run the installation script (with execution policy bypass)
powershell -ExecutionPolicy Bypass -File install-vscb-offline.ps1
```

### Bundle Contents

The offline bundle contains:

- **vsc-bridge-*.vsix** - VS Code extension (installs completely offline)
- **vsc-bridge-*.tgz** - CLI npm package (requires internet for npm dependencies)
- **install-vscb-offline.sh** - Installation script for macOS/Linux
- **install-vscb-offline.ps1** - Installation script for Windows
- **README.txt** - Detailed installation instructions and troubleshooting

### Troubleshooting

Common issues and quick solutions:

- **vscb: command not found** - npm bin directory not in PATH. See bundle README.txt for configuration steps.
- **code: command not found** - VS Code CLI not installed. Run `Shell Command: Install 'code' command in PATH` from VS Code Command Palette.
- **PowerShell script blocked** - Use `-ExecutionPolicy Bypass` flag as shown in the installation command above.

For detailed instructions and complete troubleshooting guide, see **README.txt** in the extracted bundle.

---

## 📚 Quick Example

Once installed, try debugging with the CLI:

```bash
# Set a breakpoint
vscb script run bp.set \
  --param path=/path/to/file.py \
  --param line=10

# Start debugging
vscb script run debug.start \
  --param launch="Python: Current File"

# Inspect variables when breakpoint hits
vscb script run debug.list-variables

# Continue execution
vscb script run debug.continue
```

Or use the HTTP API directly (see [API Endpoints](#api-endpoints) below).

---

## Why this exists

VSC-Bridge lets **LLM coding agents** and humans **work closely with the VS Code SDK & Debug API**—set/clear breakpoints, drive the debugger, inspect variables/stack, and manipulate the editor—through a **local, security-scoped HTTP bridge**. It has two modes:

• **Normal mode** (default): run curated, typed **scripts** that are discoverable from a manifest.
• **Danger mode** (opt-in for development): run **arbitrary JS** in the extension host for rapid iteration while authoring new scripts. Prefer graduating code into scripts so Danger mode can remain off.

## Telemetry

VSC-Bridge collects anonymous usage metrics to improve reliability and performance. **No personally identifiable information (PII) is collected.**

**What's collected:**
- Session IDs (random UUIDs for correlating events)
- Script execution metrics (script names, success/failure, execution duration)
- Error codes and sanitized error messages (PII stripped)
- VS Code version, platform, remote environment type

**What's NOT collected:**
- Source code, file contents, or variable values
- Raw file paths (all paths sanitized to workspace-relative format like `<ws:0>/file.ts`)
- Usernames, email addresses, or credentials
- Any personally identifiable information

**How PII is protected:**
- All file paths transformed to workspace-relative or hashed format
- Error messages scrubbed for emails, tokens, credentials via regex patterns
- Remote hostnames hashed (SSH/WSL/Codespaces)
- File basenames hashed with extension preserved

**How to disable telemetry:**

1. Open VS Code Settings (`Cmd+,` / `Ctrl+,`)
2. Search for "telemetry"
3. Uncheck **"Vsc Bridge: Telemetry Enabled"**

Changes take effect immediately (no restart required). Telemetry respects VS Code's global telemetry setting and enterprise policies.

**Learn more:** See [docs/telemetry.md](docs/telemetry.md) for complete event catalog, privacy policy, and KQL query examples.

## Supported Languages

VSC-Bridge supports debugging for multiple languages through language-specific adapters:

- **JavaScript/Node.js** - Full variable inspection, modification, and debugging via pwa-node adapter
- **C# (.NET)** - Complete debugging support via CoreCLR adapter
- **Python** - Full debugging support via debugpy adapter with Python-specific safety features:
  - @property detection to prevent side effects
  - GIL-aware thread handling
  - Special handling for generators, coroutines, and None values
- **Java** - Debugging support via VS Code Java extension with variable inspection and debugging capabilities
  - Programmatic expansion limited to arrays and collections (ArrayList, HashMap, etc.)
  - VS Code UI supports all object types
  - Full breakpoint and step control support

## Modes

- **Normal mode (default, safe)** — Only run **pre-baked, validated scripts** that ship with the extension. No arbitrary eval.
  Use **`POST /api/v2/script`** with a script alias + typed params.

- **Danger mode (opt-in, dev-only)** — Rapid iteration while authoring new scripts via **arbitrary JS** execution inside the extension host.
  Use **`POST /api/v2/execute`** (or the legacy `/command`) **only** when `vscBridge.dangerMode` is enabled in settings.

> Security defaults: server binds to `127.0.0.1`, strict Host/Origin allowlist, and a per-session auth token is required for all routes (except `/healthz`). Keep danger mode **off** unless you're actively developing.
> Port: **3001**.

## Quick Start

1. Launch the extension (press **F5** in VS Code).
2. Grab the auth token hint from the **"VSC-Bridge" Output** channel.
3. Call the API:

### Run a safe script (Normal mode)
```http
POST http://127.0.0.1:3001/api/v2/script
Content-Type: application/json
X-VSC-Bridge-Token: <token>

{
  "scriptName": "bp.set",
  "params": { "path": "/path/to/file.py", "line": 12 }
}
```

### Run arbitrary JS (Danger mode only)
```http
POST http://127.0.0.1:3001/api/v2/execute
Content-Type: application/json
X-VSC-Bridge-Token: <token>

{ "script": "2 + 2" }
```

## Quick Start with CLI

### Setting up the Extension and Test Workspace

1. **Open the VSC-Bridge project** in VS Code:
   ```bash
   cd /Users/jordanknight/github/vsc-bridge
   code .
   ```

2. **Launch the Extension Host** (press **F5** in VS Code):
   - This opens a new VS Code window titled "[Extension Development Host]"
   - The VSC-Bridge extension will be running on port 3001
   - You'll see "VSC-Bridge server listening on http://127.0.0.1:3001" in the Debug Console

3. **In the Extension Development Host window**, open the test workspace:
   ```
   File → Open Folder → Select: /Users/jordanknight/github/vsc-bridge/test
   ```
   This workspace contains sample Python and C# projects with debug configurations.

4. **Find your auth token** in the Extension Development Host:
   - View → Output
   - Select "VSC-Bridge" from the dropdown
   - **In Debug Mode**: Token is fixed as `debug-token-12345`
   - **In Production**: Look for "Auth token generated for this session:" followed by a UUID
   - Copy the token

### Using the CLI

5. **In a terminal**, configure and use the CLI:
   ```bash
   # Navigate to the CLI directory
   cd /Users/jordanknight/github/vsc-bridge/packages/cli

   # Set your auth token
   node dist/index.js config set authToken YOUR_TOKEN_HERE

   # Verify the extension is reachable
   node dist/index.js script list
   ```

6. **Set breakpoints** in the test Python file:
   ```bash
   # Set a breakpoint at line 7 in the sample Python file
   node dist/index.js script run bp.set \
     --param path=/Users/jordanknight/github/vsc-bridge/test/python/sample.py \
     --param line=7

   # Set a conditional breakpoint at line 18
   node dist/index.js script run bp.set \
     --param path=/Users/jordanknight/github/vsc-bridge/test/python/sample.py \
     --param line=18 \
     --param condition="'Bob' in dummy"
   ```

7. **Start debugging** the Python sample:
   ```bash
   # Start the Python debugger
   node dist/index.js script run debug.start \
     --param launch="Python: Debug Tests"

   # The debugger will stop at your breakpoints
   # You can see this in the Extension Development Host window
   ```

8. **Control the debugger** from CLI:
   ```bash
   # Continue execution
   node dist/index.js script run debug.continue

   # Step over
   node dist/index.js script run debug.step-over

   # Inspect variables
   node dist/index.js script run dbg.vars

   # Stop debugging
   node dist/index.js script run dbg.stop
   ```

## Running Integration Tests

VSC-Bridge includes automated cross-language integration tests that validate debugging functionality across all 4 supported languages (Python, JavaScript, C#, Java). These tests ensure the debug adapters and bridge infrastructure work correctly.

### Prerequisites

**Language Dependencies:**
```bash
# Python
pip install pytest

# JavaScript
cd test/javascript && npm install

# C#
cd test/csharp && dotnet restore

# Java
cd test/java && mvn clean compile test-compile
```

**VS Code Extensions** (must be installed in Extension Development Host):
- `ms-python.python` - Python
- `ms-dotnettools.csdevkit` - C# Dev Kit
- `redhat.java` - Java Language Support
- `vscjava.vscode-java-debug` - Java Debugger
- `vscjava.vscode-java-test` - Java Test Runner
- `Orta.vscode-jest` - Jest

### Running the Tests

1. **Build the project**:
   ```bash
   just build
   ```

2. **Run the integration tests**:
   ```bash
   just test-integration
   ```

   This command:
   - Builds the extension and CLI
   - Launches the Extension Host programmatically
   - Runs the cross-language debug test suite
   - Tests all 4 languages sequentially

### Expected Output

```
✓ test/integration/cross-language-debug.test.ts (5 tests) ~50s
  ✓ Cross-Language Debug Integration > should verify bridge status
  ✓ Python (pytest) > should complete full Python debug workflow (~3.5s)
  ✓ JavaScript (Jest) > should complete full JavaScript debug workflow (~5s)
  ✓ C# (xUnit) > should complete C# debug workflow (~20s)
  ✓ Java (JUnit 5) > should complete full Java debug workflow (~3s)

Test Files  1 passed (1)
     Tests  5 passed (5)
  Duration  ~50s
```

**Performance:**
- Python: ~3.5 seconds
- JavaScript: ~5 seconds
- C#: ~20 seconds (includes discovery + JIT compilation)
- Java: ~3 seconds
- **Total:** Under 1 minute typically

### What the Tests Validate

Each language test executes a full debug workflow:

1. **Session Start**: Launch debugger and pause at test breakpoint
2. **Variable Inspection**: List and verify local variables
3. **Object Expansion**: Test variable reference expansion (JavaScript, C#, Java)
4. **Session Cleanup**: Stop debugger and clean up resources

**Language-Specific Validations:**

- **Python**: Tests `debugpy` adapter with local scope variables
- **JavaScript**: Tests `pwa-node` adapter with object expansion
- **C#**: Tests `coreclr` adapter, handles [External Code] pause behavior
- **Java**: Tests nested variable structure (scope with children array)

### Troubleshooting

**"Network error" or CLI timeout:**
- Ensure Extension Development Host is running before test starts
- Test launches Extension Host automatically - if this fails, check VS Code installation

**"No debug session" errors:**
- Extension Host must open the test workspace (`/test`)
- Test handles this automatically - if failing, check workspace configuration

**C# test reports [External Code]:**
- This is expected behavior
- C# may pause in framework code instead of test line
- Test validates this gracefully and continues

**Java object expansion errors:**
- Expected: Java can only expand arrays/collections programmatically
- VS Code UI supports all object types
- Test validates this limitation exists

**Integration tests not running:**
- Verify `just test` passes first (unit tests must pass)
- Check that `npm run test:integration` script exists in package.json

### CI/CD Considerations

**Limitation**: Extension Host requires GUI environment - tests may not run in headless CI.

**Options for CI:**
1. **Skip integration tests** in headless environments
2. **Use Xvfb** (Linux) for virtual display
3. **Run on CI agents** with GUI support

The test suite is designed for local development validation. Consider it a pre-commit check rather than a CI gate.

## JavaScript Test Debugging (Optional)

VSC-Bridge supports JavaScript test debugging through integration with the vscode-jest extension. This feature is optional - the extension works perfectly for Python debugging without it.

### Prerequisites for JavaScript Testing

To debug JavaScript tests (e.g., Jest tests), you'll need:
- **vscode-jest extension** (ID: `Orta.vscode-jest`)
- Node.js installed
- Jest configured in your project

### Installing vscode-jest

If you try to debug a JavaScript test file without the vscode-jest extension, you'll see a helpful error message with installation instructions. To install manually:

1. Open VS Code Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
2. Search for "Jest" by Orta
3. Install the extension
4. Reload VS Code if prompted

### JavaScript Test Example

```bash
# Debug a Jest test file
node dist/index.js script run test.debug-wait \
  --param path=/path/to/example.test.js \
  --param line=10
```

The extension will automatically detect Jest and configure the appropriate Node.js debug settings.

### Troubleshooting

- **"Network error"**: Make sure the Extension Development Host is running (F5 from main VS Code window)
- **"401 Unauthorized"**: Get a fresh token from the Output panel in Extension Development Host
- **Breakpoints not appearing**: Make sure the test workspace is open in the Extension Development Host
- **Debug won't start for Python**: Ensure Python extension is installed in the Extension Development Host
- **JavaScript test debugging error**: Install the vscode-jest extension as prompted

## API Endpoints

### Script Discovery

```http
GET http://127.0.0.1:3001/api/v2/scripts
X-VSC-Bridge-Token: <token>
```

Returns a list of all available scripts with metadata:
```json
{
  "ok": true,
  "type": "success",
  "data": {
    "total": 18,
    "scripts": [
      {
        "alias": "bp.set",
        "metadata": {
          "name": "Set Breakpoint",
          "category": "breakpoint",
          "description": "Add a breakpoint to a file",
          "dangerOnly": false,
          "params": { ... }
        }
      }
    ],
    "byCategory": { ... }
  },
  "meta": { ... }
}
```

### Script Execution

* **`POST /api/v2/script`** - Execute pre-baked scripts (Normal mode)
* **`POST /api/v2/execute`** - Execute arbitrary JS (Danger mode only)
* All responses use a **unified JSON envelope** with `ok|error`, a `type`, and `meta` timing info
* Scripts are discovered from the **manifest** and executed through the **Script Registry**

## Threat Model & Security

### Normal Mode (Default - Safe)
* **What**: Only pre-baked, validated scripts can be executed
* **Attack Surface**: Limited to script parameters which are Zod-validated
* **Threats Mitigated**: Remote code execution, arbitrary file access, command injection
* **Use Case**: Production use by LLM agents and automated tools

### Danger Mode (Opt-in - Development Only)
* **What**: Arbitrary JavaScript execution in the VS Code extension host
* **Attack Surface**: Full VS Code API access including file system, terminal, debug adapter
* **Threats**: Remote code execution if token is compromised
* **Mitigations**:
  - Per-session auth token required
  - Rate limiting on execution endpoints (30 req/min per token)
  - Localhost-only binding
  - Visual indicator in status bar when active
* **Use Case**: Script development and debugging only

### Security Controls
* **Network**: Binds to `127.0.0.1` only - no remote access
* **Authentication**: Per-session UUID token via `X-VSC-Bridge-Token` header
* **Host/Origin Validation**: Strict allowlist (localhost/127.0.0.1)
* **Content-Type**: JSON required for all mutating requests
* **Rate Limiting**: Per-token limits on dangerous endpoints
* **Mode Toggle**: Explicit opt-in via settings for danger mode

### How to Verify Security
1. Check mode: `GET /healthz` shows current mode
2. Find token: Check VS Code Output panel "VSC-Bridge" channel
3. Test auth: Request without token returns 401 envelope
4. Test rate limit: Exceed 30 requests/min returns 429 envelope


## Debug Events (SSE)

Subscribe to real-time debug events:

```bash
# -N prevents curl from buffering the stream
curl -N \
  -H "X-VSC-Bridge-Token: $TOKEN" \
  http://127.0.0.1:3001/debugger/events
```

Every event is a Server-Sent Event with:
* `id:` monotonic counter for the event
* `event:` one of `session-started|stopped|continued|output|breakpoint|session-ended|progress`
* `data:` a JSON response envelope (`ok|status|type|meta`) with a typed `data` payload
* Heartbeats are sent as `:keepalive` comments every 15s

Use `POST /api/v2/script` for actions (e.g., `bp.set`, `dbg.start`, `dbg.continue`), and use the SSE stream to react to hits, output, and completion.

## Debug Script Catalog

All scripts are invoked via `POST /api/v2/script` with `scriptName` and `params`.

### Breakpoint Scripts (5)

| Script | Description | Parameters | Example |
|--------|-------------|------------|---------|
| `bp.set` | Set a breakpoint with conditions | `path`, `line`, `condition?`, `hitCondition?`, `logMessage?` | `{"path": "/file.py", "line": 10, "condition": "x>5"}` |
| `bp.remove` | Remove specific breakpoint | `path`, `line` | `{"path": "/file.py", "line": 10}` |
| `bp.clear.file` | Clear file breakpoints | `path` | `{"path": "/file.py"}` |
| `bp.clear.project` | Clear all breakpoints | - | `{}` |
| `bp.list` | List all breakpoints | `path?` | `{}` |

### Debug Control Scripts (8)

| Script | Description | Parameters | Example |
|--------|-------------|------------|---------|
| `debug.start` | Start debug session | `launch`, `folder?`, `timeoutMs?` | `{"launch": "Python: Debug"}` |
| `dbg.stop` | Stop debug session | `sessionId?` | `{}` |
| `dbg.restart` | Restart debug session | `sessionId?` | `{}` |
| `debug.continue` | Continue execution | `sessionId?`, `timeoutMs?` | `{"timeoutMs": 30000}` |
| `debug.step-over` | Step over current line | `sessionId?`, `timeoutMs?` | `{}` |
| `debug.step-into` | Step into function | `sessionId?`, `timeoutMs?` | `{}` |
| `debug.step-out` | Step out of function | `sessionId?`, `timeoutMs?` | `{}` |
| `dbg.waitForHit` | Wait for breakpoint hit | `timeoutMs?` | `{"timeoutMs": 30000}` |

### Debug Inspection Scripts (5)

| Script | Description | Parameters | Example |
|--------|-------------|------------|---------|
| `dbg.vars` | List variables | `frameId?`, `scope?`, `filter?` | `{"scope": "locals"}` |
| `debug.stack` | Get call stack | `threadId?`, `sessionId?` | `{}` |
| `debug.threads` | Get thread info | `sessionId?` | `{}` |
| `dbg.scopes` | List scopes for frame | `frameId`, `sessionId?` | `{"frameId": 0}` |
| `dbg.evaluate` | Evaluate expression | `expression`, `frameId?`, `context?` | `{"expression": "x * 2"}` |

### Diagnostics Script (1)

| Script | Description | Parameters | Example |
|--------|-------------|------------|---------|
| `diag.collect` | Collect diagnostics | `path?` | `{}` for workspace-wide |

Full examples are available in `test.http`.

### How to Add a New Script

1. Create `<name>.js` and `<name>.meta.yaml` under `extension/src/vsc-scripts/<category>/`
2. Extend the appropriate base class (`ActionScript`, `WaitableScript`, `QueryScript`)
3. Define Zod schema for parameter validation
4. Run `node scripts/build-manifest.js` to rebuild the manifest
5. Add tests and examples to `test.http`

## Graduating from Danger → Normal

* Prototype logic via `/api/v2/execute` (Danger)
* Extract it into a typed script class under `vsc-scripts/*`, describe shape in manifest, and expose via `/api/v2/script`
* Remove the need for Danger mode for that workflow

## Legacy Endpoints

* `/breakpoint`, `/debugger` (SSE), `/command` will remain during migration but are planned for deprecation in a later release. Prefer **`/api/v2/*`**.

## Legacy Eval Command Endpoint

The `/command` endpoint allows direct evaluation of JavaScript code within VS Code's extension context, providing full access to the VS Code API (DANGER MODE REQUIRED).

### Usage

```http
POST http://localhost:3001/command
Content-Type: application/json

{
    "command": "your JavaScript code here",
    "mode": "unsafe",
    "timeout": 5000
}
```

### Modes

- **`safe`**: Restricted mode with limited capabilities
- **`unsafe`**: Full access to VS Code APIs and Node.js runtime
- **`test`**: Runs the built-in test suite

### Examples

#### Set a Breakpoint
```javascript
(async () => { 
    const vscode = require('vscode'); 
    const uri = vscode.Uri.file('/path/to/file.py'); 
    const position = new vscode.Position(6, 0); // Line 7 (0-indexed)
    const breakpoint = new vscode.SourceBreakpoint(new vscode.Location(uri, position)); 
    vscode.debug.addBreakpoints([breakpoint]); 
    return 'Breakpoint set';
})()
```

#### Start Debugging
```javascript
(async () => {
    const vscode = require('vscode');
    const folder = vscode.workspace.workspaceFolders[0];
    await vscode.debug.startDebugging(folder, 'Python: Current File');
    return 'Debugging started';
})()
```

#### Execute Commands
```javascript
vscode.commands.executeCommand('workbench.action.files.save')
```

#### Access Active Editor
```javascript
vscode.window.activeTextEditor?.document.fileName
```

#### Manipulate Text
```javascript
(async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 0), '// Hello World\n');
        });
        return 'Text inserted';
    }
    return 'No active editor';
})()
```

### Quick Start

1. Launch the extension (F5 in VS Code)
2. Use the REST client of your choice (or the included `test.http` file)
3. Send eval commands to `http://localhost:3001/command`

### Safety Note

The `unsafe` mode provides complete access to VS Code's internals. Use with caution in production environments.

---

## 👨‍💻 For Contributors

### Dev Container Setup (Recommended)

The easiest way to start developing VSC-Bridge:

1. **Open in VS Code** and reopen in dev container when prompted
2. **Wait for automatic setup** — The dev container post-install script will:
   - ✅ Install all dependencies
   - ✅ Build extension, CLI, and MCP server
   - ✅ Install `vscb` CLI globally
   - ✅ Package and install the VS Code extension
   - ✅ Configure Claude Code MCP server
   - ✅ Update Claude Code permissions
3. **Start coding!** Everything is ready to use

**To reload the extension after making changes:**
```bash
just build           # Build all components
# Press F5 in VS Code to launch Extension Development Host
```

### Local Development (Without Dev Container)

**Prerequisites:**
- Node.js >= 18
- npm >= 8
- `just` command runner (optional but recommended)

**Build everything:**
```bash
# Install dependencies
npm install

# Build all components
just build            # Builds extension, CLI, and MCP server
just package-extension  # Creates the .vsix file

# Or without just:
npm run build
cd packages/extension && npx @vscode/vsce package
```

**Install for local development:**
```bash
bash scripts/install-vscb.sh  # Linux/Mac/WSL
# or
.\scripts\install-vscb.ps1    # Windows PowerShell
```

**Development workflow:**
```bash
# Make changes to code
just build                    # Rebuild
# Press F5 in VS Code to launch Extension Development Host
# Test your changes
```
