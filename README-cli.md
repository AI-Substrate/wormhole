# VSC-Bridge CLI

Command-line interface for VSC-Bridge debugging integration.

## Installation

### Quick Install (Recommended)

Install vscb globally from the monorepo root:

**Linux / macOS / WSL:**
```bash
bash scripts/install-vscb.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\install-vscb.ps1
```

The script will:
- ✅ Check prerequisites (Node.js >=18.0.0, npm)
- ✅ Build the CLI and dependencies
- ✅ Install `vscb` command globally
- ✅ Verify installation
- ✅ Configure PATH if needed

### Manual Installation

```bash
# From the monorepo root
npm install
just build-cli  # or: cd packages/cli && npm run build

# Install globally
cd packages/cli
npm link

# Verify
vscb --version
```

### Verification

After installation, verify everything works:

```bash
# Check installation
which vscb        # Unix/Mac
where vscb        # Windows

# Test version
vscb --version

# Run verification script (optional)
bash scripts/verify-vscb.sh  # Unix/Mac

# Test connection (requires Extension Host running)
vscb status
```

### Uninstalling

```bash
# From packages/cli directory
npm unlink

# Or from anywhere
npm unlink -g @vsc-bridge/cli
```

## Setup

1. Launch the VS Code extension (F5 in VS Code)
2. Get the auth token from VS Code Output panel "VSC-Bridge" channel
3. Configure the CLI:

```bash
# Set the auth token
vscb config set authToken <token-from-vscode>

# Verify configuration
vscb config
```

## Usage

### List Available Scripts

```bash
# List all available scripts
vscb script list

# JSON output for scripting
vscb script list --json
```

### Run Scripts (Normal Mode)

```bash
# Set a breakpoint (relative path)
vscb script run bp.set --param path=test.py --param line=10

# Set breakpoint with condition (nested path)
vscb script run bp.set \
  --param path=src/main.py \
  --param line=7 \
  --param condition="x > 5"

# Start debugging
vscb script run debug.start --param launch="Python: Current File"

# List breakpoints
vscb script run bp.list
```

### Execute Arbitrary Code (Danger Mode)

⚠️ **WARNING**: Danger mode executes arbitrary code in your VS Code environment.

First, enable danger mode in VS Code:
1. Open VS Code settings (Cmd+, or Ctrl+,)
2. Search for "vscBridge.dangerMode"
3. Check the box to enable danger mode

Then run arbitrary JavaScript:

```bash
# Simple expression
vscb exec "vscode.window.showInformationMessage('Hello from CLI')"

# Set a breakpoint with custom logic (relative path)
vscb exec "
  const vscode = require('vscode');
  const uri = vscode.Uri.file('./test.py');
  const bp = new vscode.SourceBreakpoint(
    new vscode.Location(uri, new vscode.Position(6, 0)),
    true,
    'x > 5'  // with condition
  );
  vscode.debug.addBreakpoints([bp]);
  return 'Breakpoint set with condition';
" --yes

# Execute from file
vscb exec --file ./my-script.js --yes
```

### Download VSIX Extension

Download vsc-bridge VSIX files from GitHub Releases:

```bash
# Download latest stable release
vscb get-vsix

# Download latest (including pre-releases)
vscb get-vsix --include-prerelease

# Download specific version
vscb get-vsix --version v1.0.0
vscb get-vsix -v 1.2.3  # 'v' prefix optional

# Download to specific directory
vscb get-vsix --output ~/Downloads

# Download and install automatically
vscb get-vsix --install

# Download pre-release and install
vscb get-vsix --include-prerelease --install

# JSON output for scripting
vscb get-vsix --json
```

**Installation Options** (if not using `--install` flag):

**Command Line:**
```bash
code --install-extension /path/to/vsc-bridge-*.vsix
```

**From VS Code Editor:**
1. Open Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Click `⋮` menu → "Install from VSIX..."
3. Select downloaded `.vsix` file
4. Reload VS Code when prompted

### Configuration Management

```bash
# Show all configuration
vscb config

# Get specific value
vscb config get authToken

# Set values
vscb config set authToken abc123
vscb config set serverUrl http://localhost:3001
vscb config set outputFormat json  # json, pretty, or auto

# Reset to defaults
vscb config reset
```

## Output Formats

The CLI supports two output formats:

- **Pretty** (default for terminals): Human-readable colored output to stderr
- **JSON** (default for pipes/CI): Machine-readable JSON to stdout

```bash
# Force JSON output
vscb script list --json

# Force pretty output (even when piped)
vscb script list --output=pretty

# Auto-detect (default)
vscb script list  # Pretty in terminal, JSON when piped
```

## Examples

### Setting Breakpoints

```bash
# Simple breakpoint
vscb script run bp.set \
  --param path=/Users/me/project/app.py \
  --param line=42

# Conditional breakpoint
vscb script run bp.set \
  --param path=/Users/me/project/app.py \
  --param line=42 \
  --param condition="user_id == 123"

# Hit count breakpoint
vscb script run bp.set \
  --param path=/Users/me/project/app.py \
  --param line=42 \
  --param hitCondition=">10"

# Log message breakpoint
vscb script run bp.set \
  --param path=/Users/me/project/app.py \
  --param line=42 \
  --param logMessage="User ID: {user_id}"
```

### Debugging Workflow

```bash
# 1. Clear existing breakpoints
vscb script run bp.clear.project

# 2. Set new breakpoints
vscb script run bp.set --param path=/path/to/app.py --param line=10
vscb script run bp.set --param path=/path/to/app.py --param line=20

# 3. Start debugging
vscb script run debug.start --param launch="Python: Current File"

# 4. Control execution
vscb script run debug.continue
vscb script run debug.step-over
vscb script run debug.step-into

# 5. Inspect state
vscb script run dbg.vars
vscb script run debug.stack
```

## Security

- The CLI only connects to localhost (127.0.0.1) by default
- Auth tokens are required for all operations
- Danger mode requires explicit acknowledgment
- Config files are stored in `~/.vscbridge/config.json`

## Troubleshooting

### "Error: Danger mode is not enabled in VS Code"

Enable danger mode in VS Code settings:
1. Open settings (Cmd+, or Ctrl+,)
2. Search for "vscBridge.dangerMode"
3. Check the box

### "Network error"

1. Ensure the VS Code extension is running (F5 in VS Code)
2. Check the server URL: `vscb config get serverUrl`
3. Default should be: `http://127.0.0.1:3001`

### "401 Unauthorized"

1. Get a fresh token from VS Code Output panel
2. Set it: `vscb config set authToken <new-token>`

## Environment Variables

- `DEBUG=1` - Enable debug output
- `NO_COLOR=1` - Disable colored output