================================================================================
VSC-BRIDGE OFFLINE INSTALLATION BUNDLE v{{VERSION}}
================================================================================

Thank you for downloading vsc-bridge! This bundle contains everything you need
to install vsc-bridge on systems with limited internet access.

Table of Contents:
  1. Prerequisites
  2. Installation
  3. Verification
  4. First Time Usage
  5. Troubleshooting
  6. What's Inside
  7. Links to Documentation

================================================================================
## Prerequisites
================================================================================

Before installing vsc-bridge, ensure you have the following:

1. Node.js >= 18.0.0
   Download from: https://nodejs.org/

2. npm (comes with Node.js)
   Verify with: npm --version

3. Visual Studio Code
   Download from: https://code.visualstudio.com/

4. Internet connection for npm dependencies
   IMPORTANT: While the VS Code extension installs completely offline, the CLI
   installation requires internet access to download npm dependencies. If you
   are in a completely air-gapped environment, the extension will still work
   but the CLI will not be available.

================================================================================
## Installation
================================================================================

### macOS / Linux

1. Extract the bundle:
   unzip vsc-bridge-offline-{{VERSION}}.zip
   cd vsc-bridge-offline-{{VERSION}}/

2. Run the installation script:
   bash install-vscb-offline.sh

The script will:
  - Check prerequisites (Node.js, npm, VS Code)
  - Detect and remove conflicting installations
  - Install the VS Code extension (offline)
  - Install the CLI globally via npm (requires internet)
  - Verify installation and display results

### Windows

1. Extract the bundle:
   Right-click the .zip file → Extract All...
   Or use PowerShell:
   Expand-Archive vsc-bridge-offline-{{VERSION}}.zip -DestinationPath .
   cd vsc-bridge-offline-{{VERSION}}\

2. Run the installation script:
   powershell -ExecutionPolicy Bypass -File install-vscb-offline.ps1

IMPORTANT: Use the -ExecutionPolicy Bypass flag shown above. Windows blocks
PowerShell scripts by default for security. The Bypass flag allows the
installation script to run without changing your system's execution policy.

The script will:
  - Check prerequisites (Node.js, npm, VS Code)
  - Detect and remove conflicting installations
  - Install the VS Code extension (offline)
  - Install the CLI globally via npm (requires internet)
  - Verify installation and display results

================================================================================
## Verification
================================================================================

After installation, verify everything is working:

1. Check CLI version:
   vscb --version

   Expected output: {{VERSION}}

2. Check extension is installed:
   code --list-extensions | grep vsc-bridge

   Expected output: AI-Substrate.vsc-bridge

3. List available CLI scripts:
   vscb script list

   Expected output: Table of available debugging scripts

4. Verify CLI is in PATH:

   macOS/Linux:
   which vscb

   Windows:
   Get-Command vscb

   Expected output: Path to vscb executable

5. Verify npm global installation:
   npm list -g vsc-bridge

   Expected output: vsc-bridge@{{VERSION}}

If any verification step fails, see the Troubleshooting section below.

================================================================================
## First Time Usage
================================================================================

### Testing the Installation

After installation completes successfully, follow these steps to verify
vsc-bridge is working correctly:

1. Open Visual Studio Code

2. Open any folder or workspace (File → Open Folder...)
   IMPORTANT: vsc-bridge requires a workspace to be open. The extension will
   not activate until you open a folder.

3. Wait 5 seconds for the extension to activate
   You should see "vsc-bridge" appear in the Extensions panel (Ctrl+Shift+X).

4. Run the status check command:
   vscb status

   Expected output:
   ✓ Connected to Extension Host

   If you see this message, vsc-bridge is working correctly! You can now use
   all CLI commands and debugging features.

   If you see "Extension Host not responding", see the Troubleshooting section.

### MCP Server Setup - GitHub Copilot Chat

To use vsc-bridge with GitHub Copilot Chat:

1. Open the Command Palette (Cmd+Shift+P on macOS, Ctrl+Shift+P on Windows/Linux)

2. Type "Add MCP Server" and select the command

3. Select "vsc-bridge" from the list of available MCP servers

4. Confirm setup is complete

You can now use vsc-bridge debugging tools through GitHub Copilot Chat!

### MCP Server Setup - Claude Code

To use vsc-bridge with Claude Code CLI:

1. Add the MCP server using the Claude Code CLI tool:
   claude-code mcp add vsc-bridge

   (The exact command may vary depending on your Claude Code CLI version.
   Consult Claude Code documentation if needed.)

2. Verify the connection is established:
   The MCP server should appear in your Claude Code configuration.

You can now use vsc-bridge debugging tools through Claude Code!

================================================================================
## Troubleshooting
================================================================================

### "vscb: command not found"

The npm global bin directory is not in your PATH.

Solution:

1. Find npm bin directory:
   npm bin -g

2. Add to PATH (choose based on your shell):

   Bash (~/.bashrc):
   export PATH="$(npm bin -g):$PATH"

   Zsh (~/.zshrc):
   export PATH="$(npm bin -g):$PATH"

   Fish (~/.config/fish/config.fish):
   set -gx PATH (npm bin -g) $PATH

   Windows PowerShell ($PROFILE):
   $env:PATH = "$(npm bin -g);$env:PATH"

3. Reload your shell or open a new terminal window

4. Verify:
   vscb --version

### "code: command not found"

The VS Code CLI is not in your PATH.

Solution (macOS):

1. Open Visual Studio Code

2. Press Cmd+Shift+P to open Command Palette

3. Type: Shell Command: Install 'code' command in PATH

4. Press Enter

5. Restart your terminal

6. Verify:
   code --version

Solution (Windows/Linux):

The `code` command should be in PATH automatically after installation. If not:

Windows:
- Reinstall VS Code and check "Add to PATH" during installation

Linux:
- The code command is typically available after installation via package manager
- If installed via .deb/.rpm, it should be in /usr/bin/code

### "Permission denied" when running scripts

Solution (macOS/Linux):

1. Make the script executable:
   chmod +x install-vscb-offline.sh

2. Run again:
   bash install-vscb-offline.sh

If you see permission errors during npm install:

1. Try without sudo first (recommended)
2. If that fails, check npm permissions:
   https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally

3. Last resort: Use sudo (not recommended):
   sudo bash install-vscb-offline.sh

### "PowerShell script execution is disabled"

Windows blocks PowerShell scripts by default for security.

Solution:

Use the -ExecutionPolicy Bypass flag:

powershell -ExecutionPolicy Bypass -File install-vscb-offline.ps1

This allows the script to run once without changing your system's execution
policy permanently.

Alternative (if Bypass doesn't work):

1. Run PowerShell as Administrator

2. Set execution policy temporarily:
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

3. Run the installation script:
   .\install-vscb-offline.ps1

4. The execution policy will revert when you close PowerShell

### "Extension Host not responding"

vsc-bridge CLI requires the VS Code Extension Host to be running.

Solution:

1. Open Visual Studio Code

2. Open a folder or workspace (File → Open Folder...)
   IMPORTANT: The extension will not activate without an open workspace

3. Wait 5 seconds for the extension to activate
   You should see "vsc-bridge" in the Extensions panel (Ctrl+Shift+X)

4. Retry your vscb command:
   vscb status

   Expected output:
   ✓ Connected to Extension Host

If you still see the error:

- Check that the extension is enabled in VS Code (Extensions panel)
- Try reloading VS Code (Cmd/Ctrl+Shift+P → "Reload Window")
- Check VS Code's Output panel (View → Output → select "vsc-bridge")

================================================================================
## What's Inside
================================================================================

This bundle contains 5 files:

1. vsc-bridge-*.vsix
   VS Code extension (installs completely offline)

2. vsc-bridge-*.tgz
   CLI npm package (requires internet for dependencies during install)

3. install-vscb-offline.sh
   Installation script for macOS and Linux (Bash)

4. install-vscb-offline.ps1
   Installation script for Windows (PowerShell)

5. README.txt
   This file - installation instructions and troubleshooting

Note: The * in filenames is a version placeholder. Your bundle will have
specific version numbers in the actual filenames.

================================================================================
## Links to Documentation
================================================================================

Full Documentation:
https://github.com/AI-Substrate/wormhole

Issue Tracker:
https://github.com/AI-Substrate/wormhole/issues

MCP Integration:
https://github.com/AI-Substrate/wormhole#mcp-server

Getting Started Guide:
https://github.com/AI-Substrate/wormhole#getting-started

API Documentation:
https://github.com/AI-Substrate/wormhole#api-reference

================================================================================

Need help? Open an issue at:
https://github.com/AI-Substrate/wormhole/issues

Thank you for using vsc-bridge!

================================================================================
