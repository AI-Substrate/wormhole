# VSIX Installation Scripts

Convenience scripts for downloading and installing the latest vsc-bridge VSIX from GitHub Releases.

## Prerequisites

Both scripts require:
- **VS Code** with `code` command in PATH
- **GitHub CLI** (`gh`) installed and authenticated

## Usage

### Linux / macOS

```bash
# Install latest release
./scripts/install-vsix.sh

# Install specific version
./scripts/install-vsix.sh v1.0.0
./scripts/install-vsix.sh v1.0.0-test.1
./scripts/install-vsix.sh 1.0.0  # 'v' prefix is optional
```

### Windows (PowerShell)

```powershell
# Install latest release
./scripts/install-vsix.ps1

# Install specific version
./scripts/install-vsix.ps1 -Version v1.0.0
./scripts/install-vsix.ps1 -Version v1.0.0-test.1
./scripts/install-vsix.ps1 -Version 1.0.0  # 'v' prefix is optional
```

## What the Scripts Do

1. **Check prerequisites**: Verify `code` and `gh` are available
2. **Determine version**: Use latest release or specified version
3. **Download VSIX**: Fetch from GitHub Releases to temp directory
4. **Check existing**: Show currently installed version (if any)
5. **Install**: Run `code --install-extension <vsix>`
6. **Verify**: List installed extension details
7. **Cleanup**: Remove temporary files

## Example Output

```
🔍 vsc-bridge VSIX Installer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Fetching latest release...
✓ Latest release: v1.0.0-test.1

⬇️  Downloading VSIX from GitHub Release...
✓ Downloaded: vsc-bridge-1.0.0-test.1.vsix (528K)

ℹ️  Currently installed: ai-substrate.vsc-bridge@1.0.0
   Will be replaced with version: 1.0.0-test.1

📥 Installing extension in VS Code...

✅ Installation complete!

Extension: vsc-bridge
Version: 1.0.0-test.1
ID: ai-substrate.vsc-bridge

🔄 Reload VS Code windows for changes to take effect
```

## Troubleshooting

### "code command not found"

**macOS**: Open VS Code → `Cmd+Shift+P` → "Shell Command: Install 'code' command in PATH"

**Linux**: Usually installed with VS Code package. If not:
```bash
sudo ln -s /usr/share/code/bin/code /usr/local/bin/code
```

**Windows**: Add VS Code bin directory to PATH:
```
C:\Program Files\Microsoft VS Code\bin
```

### "gh command not found"

**macOS**:
```bash
brew install gh
```

**Linux**:
See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

**Windows**:
```powershell
winget install GitHub.cli
# or
scoop install gh
```

### Installation fails

1. **Close all VS Code windows** before installing
2. **Check permissions** to VS Code extensions directory:
   - macOS/Linux: `~/.vscode/extensions/`
   - Windows: `%USERPROFILE%\.vscode\extensions\`
3. **Try manual install**:
   ```bash
   code --install-extension /path/to/vsc-bridge-*.vsix
   ```

## Manual Alternative

If scripts don't work, you can install manually:

1. Download VSIX from [GitHub Releases](https://github.com/AI-Substrate/vsc-bridge/releases)
2. Open VS Code
3. Extensions sidebar → `...` menu → "Install from VSIX..."
4. Select downloaded `.vsix` file

## Uninstalling

```bash
code --uninstall-extension ai-substrate.vsc-bridge
```
